import { env } from "cloudflare:workers";
import { ensureDatabase, getD1 } from "../../db";
import { MARKET_ITEM_CATALOG } from "./craftCatalog";
import type {
  CraftMarketResponse,
  MarketItemKey,
  MarketQuote,
} from "./craftTypes";
import { consumeGlobalRequestQuota } from "./lostArkRosterStore";

const LOSTARK_API_BASE = "https://developer-lostark.game.onstove.com";
const FRESH_TTL_MS = 5 * 60_000;
const STALE_TTL_MS = 24 * 60 * 60_000;

type MarketCacheRow = {
  item_key: MarketItemKey;
  item_id: number;
  name: string;
  icon: string;
  bundle_count: number;
  current_min_price: number;
  updated_at: number;
};

type LostArkMarketItem = {
  Id?: number;
  Name?: string;
  Icon?: string;
  BundleCount?: number;
  CurrentMinPrice?: number | null;
};

export class MarketDataError extends Error {
  constructor(
    message: string,
    public status = 503,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

let refreshPromise: Promise<CraftMarketResponse> | null = null;

export async function getCraftMarketData() {
  if (!refreshPromise) {
    refreshPromise = loadCraftMarketData().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function loadCraftMarketData(): Promise<CraftMarketResponse> {
  await ensureDatabase();
  const now = Date.now();
  const cachedRows = await readCacheRows();
  const cachedByKey = new Map(cachedRows.map((row) => [row.item_key, row]));
  const staleItems = MARKET_ITEM_CATALOG.filter((item) => {
    const cached = cachedByKey.get(item.key);
    return !cached || now - cached.updated_at >= FRESH_TTL_MS;
  });

  if (staleItems.length === 0) {
    return toResponse(cachedRows, false);
  }

  const apiKey = env.LOSTARK_API_JWT?.trim();
  if (!apiKey) {
    return fallbackOrThrow(cachedRows, now, "서버에 Lost Ark API 키가 설정되지 않았습니다.");
  }

  const quota = await consumeGlobalRequestQuota(staleItems.length);
  if (!quota.allowed) {
    return fallbackOrThrow(
      cachedRows,
      now,
      "Lost Ark API 요청 한도에 도달했습니다.",
      quota.retryAfterSeconds,
    );
  }

  const authorization = apiKey.toLowerCase().startsWith("bearer ")
    ? apiKey
    : `bearer ${apiKey}`;
  const refreshed = await settleWithConcurrency(
    staleItems,
    4,
    async (item) => {
      const quote = await fetchOfficialQuote(
        item.key,
        item.name,
        item.categoryCode,
        authorization,
      );
      await writeCacheRow(quote, now);
      return quote;
    },
  );

  const merged = new Map<MarketItemKey, MarketCacheRow>(cachedByKey);
  refreshed.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const quote = result.value;
    merged.set(quote.key, {
      item_key: quote.key,
      item_id: quote.id,
      name: quote.name,
      icon: quote.icon,
      bundle_count: quote.bundleCount,
      current_min_price: quote.currentMinPrice,
      updated_at: now,
    });
  });

  const completeRows = MARKET_ITEM_CATALOG.map((item) => merged.get(item.key)).filter(
    (row): row is MarketCacheRow => Boolean(row),
  );
  const missing = MARKET_ITEM_CATALOG.filter((item) => !merged.has(item.key));
  if (missing.length > 0) {
    const firstFailure = refreshed.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const reason = firstFailure?.reason;
    throw reason instanceof MarketDataError
      ? reason
      : new MarketDataError(
          `${missing.map((item) => item.name).join(", ")} 가격을 불러오지 못했습니다.`,
        );
  }

  const stale = completeRows.some((row) => now - row.updated_at >= FRESH_TTL_MS);
  return toResponse(completeRows, stale);
}

async function readCacheRows() {
  const result = await getD1()
    .prepare(
      `SELECT item_key, item_id, name, icon, bundle_count,
              current_min_price, updated_at
       FROM lostark_market_cache`,
    )
    .all<MarketCacheRow>();
  return result.results ?? [];
}

async function writeCacheRow(quote: MarketQuote, updatedAt: number) {
  await getD1()
    .prepare(
      `INSERT INTO lostark_market_cache
         (item_key, item_id, name, icon, bundle_count, current_min_price, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(item_key) DO UPDATE SET
         item_id = excluded.item_id,
         name = excluded.name,
         icon = excluded.icon,
         bundle_count = excluded.bundle_count,
         current_min_price = excluded.current_min_price,
         updated_at = excluded.updated_at`,
    )
    .bind(
      quote.key,
      quote.id,
      quote.name,
      quote.icon,
      quote.bundleCount,
      quote.currentMinPrice,
      updatedAt,
    )
    .run();
}

async function fetchOfficialQuote(
  key: MarketItemKey,
  expectedName: string,
  categoryCode: number,
  authorization: string,
): Promise<MarketQuote> {
  const headers = {
    accept: "application/json",
    authorization,
    "content-type": "application/json",
  };
  const response = await fetch(`${LOSTARK_API_BASE}/markets/items`, {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      ItemName: expectedName,
      CategoryCode: categoryCode,
      PageNo: 0,
      Sort: "CURRENT_MIN_PRICE",
      SortCondition: "ASC",
    }),
  });

  if (!response.ok) {
    const retryAfter = getRetryAfter(response);
    throw new MarketDataError(
      response.status === 429
        ? "Lost Ark API 요청 한도에 도달했습니다."
        : `${expectedName} 거래소 조회에 실패했습니다. (${response.status})`,
      response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status,
      retryAfter,
    );
  }

  const payload = (await response.json()) as unknown;
  const candidates = extractMarketItems(payload);
  const item = candidates.find(
    (candidate) => candidate.Name?.trim() === expectedName,
  );
  const id = Number(item?.Id);
  const bundleCount = Number(item?.BundleCount);
  const currentMinPrice = Number(item?.CurrentMinPrice);

  if (
    !item ||
    !Number.isInteger(id) ||
    id <= 0 ||
    !Number.isFinite(bundleCount) ||
    bundleCount <= 0 ||
    !Number.isFinite(currentMinPrice) ||
    currentMinPrice <= 0
  ) {
    throw new MarketDataError(`${expectedName}의 유효한 최저가가 없습니다.`);
  }

  return {
    key,
    id,
    name: item.Name?.trim() || expectedName,
    icon: item.Icon?.trim() || "",
    bundleCount,
    currentMinPrice,
  };
}

async function settleWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

function extractMarketItems(payload: unknown): LostArkMarketItem[] {
  if (Array.isArray(payload)) return payload as LostArkMarketItem[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.Items)) return record.Items as LostArkMarketItem[];
  if ("Id" in record) return [record as LostArkMarketItem];
  return [];
}

function fallbackOrThrow(
  rows: MarketCacheRow[],
  now: number,
  message: string,
  retryAfterSeconds?: number,
) {
  const complete = MARKET_ITEM_CATALOG.every((item) =>
    rows.some(
      (row) => row.item_key === item.key && now - row.updated_at < STALE_TTL_MS,
    ),
  );
  if (complete) return toResponse(rows, true);
  throw new MarketDataError(message, retryAfterSeconds ? 429 : 503, retryAfterSeconds);
}

function toResponse(rows: MarketCacheRow[], stale: boolean): CraftMarketResponse {
  const items: CraftMarketResponse["items"] = {};
  for (const row of rows) {
    items[row.item_key] = {
      key: row.item_key,
      id: row.item_id,
      name: row.name,
      icon: row.icon,
      bundleCount: row.bundle_count,
      currentMinPrice: row.current_min_price,
    };
  }
  const updatedAt = rows.length
    ? new Date(Math.min(...rows.map((row) => row.updated_at))).toISOString()
    : new Date(0).toISOString();
  return { updatedAt, stale, items };
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
