import { env } from "cloudflare:workers";
import { ensureDatabase, getD1 } from "../../db";
import {
  AUCTION_MARKET_CACHE_PREFIX,
  buildAuctionCacheResponse,
  normalizeAuctionMarketPages,
  type AuctionCacheItem,
  type AuctionMarketItem,
  type AuctionMarketResponse,
} from "./auctionMarket";
import { loadAuctionMarketPages } from "./auctionMarketLoader";
import { MarketDataError } from "./lostArkMarketStore";
import { consumeGlobalRequestQuota } from "./lostArkRosterStore";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";

type AuctionMarketCacheRow = {
  item_id: number;
  name: string;
  icon: string;
  bundle_count: number;
  current_min_price: number;
  updated_at: number;
};

let refreshPromise: Promise<AuctionMarketResponse> | null = null;

export function getAuctionMarketData() {
  if (!refreshPromise) {
    refreshPromise = loadAuctionMarketData().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function loadAuctionMarketData(): Promise<AuctionMarketResponse> {
  await ensureDatabase();
  const now = Date.now();
  const cached = buildAuctionCacheResponse(await readCacheRows(), now);
  if (cached && !cached.stale) return cached;

  try {
    const apiKey = env.LOSTARK_API_JWT?.trim();
    if (!apiKey) {
      throw new MarketDataError("서버에 Lost Ark API 키가 설정되지 않았습니다.");
    }

    const authorization = apiKey.toLowerCase().startsWith("bearer ")
      ? apiKey
      : `bearer ${apiKey}`;
    const pages = await loadAuctionMarketPages({
      reserveRequests: reserveGlobalRequests,
      fetchPage: (pageNo) => fetchAuctionMarketPage(pageNo, authorization),
    });
    const items = normalizeAuctionMarketPages(pages);
    if (items.length === 0) {
      throw new MarketDataError("거래 가능한 유물 각인서 시세가 없습니다.");
    }

    await replaceCacheSnapshot(items, now);
    return buildFreshResponse(items, now);
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    if (error instanceof MarketDataError) throw error;
    throw new MarketDataError(
      error instanceof Error
        ? error.message
        : "유물 각인서 시세를 불러오지 못했습니다.",
    );
  }
}

async function reserveGlobalRequests(cost: number) {
  const quota = await consumeGlobalRequestQuota(cost);
  if (!quota.allowed) {
    throw new MarketDataError(
      "Lost Ark API 요청 한도에 도달했습니다.",
      429,
      quota.retryAfterSeconds,
    );
  }
}

async function fetchAuctionMarketPage(pageNo: number, authorization: string) {
  const response = await fetch(`${LOSTARK_API_BASE}/markets/items`, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      CategoryCode: 40000,
      ItemGrade: "유물",
      PageNo: pageNo,
      Sort: "CURRENT_MIN_PRICE",
      SortCondition: "DESC",
    }),
  });

  if (!response.ok) {
    const retryAfterSeconds = getRetryAfter(response);
    throw new MarketDataError(
      response.status === 429
        ? "Lost Ark API 요청 한도에 도달했습니다."
        : `유물 각인서 거래소 조회에 실패했습니다. (${response.status})`,
      response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status,
      retryAfterSeconds,
    );
  }

  return response.json() as Promise<unknown>;
}

async function readCacheRows(): Promise<AuctionCacheItem[]> {
  const result = await getD1()
    .prepare(
      `SELECT item_id, name, icon, bundle_count, current_min_price, updated_at
       FROM lostark_market_cache
       WHERE item_key LIKE ?1`,
    )
    .bind(`${AUCTION_MARKET_CACHE_PREFIX}%`)
    .all<AuctionMarketCacheRow>();

  return (result.results ?? []).map((row) => ({
    id: row.item_id,
    name: row.name,
    icon: row.icon,
    bundleCount: row.bundle_count,
    currentMinPrice: row.current_min_price,
    updatedAt: row.updated_at,
  }));
}

async function replaceCacheSnapshot(
  items: readonly AuctionMarketItem[],
  updatedAt: number,
) {
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare("DELETE FROM lostark_market_cache WHERE item_key LIKE ?1")
      .bind(`${AUCTION_MARKET_CACHE_PREFIX}%`),
    ...items.map((item) =>
      d1
        .prepare(
          `INSERT INTO lostark_market_cache
             (item_key, item_id, name, icon, bundle_count, current_min_price, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(
          `${AUCTION_MARKET_CACHE_PREFIX}${item.id}`,
          item.id,
          item.name,
          item.icon,
          item.bundleCount,
          item.currentMinPrice,
          updatedAt,
        ),
    ),
  ]);
}

function buildFreshResponse(
  items: readonly AuctionMarketItem[],
  updatedAt: number,
): AuctionMarketResponse {
  return {
    updatedAt: new Date(updatedAt).toISOString(),
    stale: false,
    items: [...items],
  };
}

function getRetryAfter(response: Response) {
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  const reset = Number(response.headers.get("X-RateLimit-Reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(1, Math.ceil(reset - Date.now() / 1_000));
  }
  return undefined;
}
