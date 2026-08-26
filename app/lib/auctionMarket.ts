export const AUCTION_MARKET_CACHE_PREFIX = "auction:engraving:";
export const AUCTION_MARKET_FRESH_TTL_MS = 5 * 60_000;
export const AUCTION_MARKET_STALE_TTL_MS = 24 * 60 * 60_000;

export type AuctionMarketItem = {
  id: number;
  name: string;
  icon: string;
  bundleCount: number;
  currentMinPrice: number;
};

export type AuctionMarketResponse = {
  updatedAt: string;
  stale: boolean;
  items: AuctionMarketItem[];
};

export type AuctionCacheItem = AuctionMarketItem & {
  updatedAt: number;
};

type ApiMarketItem = {
  Id?: unknown;
  Name?: unknown;
  Icon?: unknown;
  Grade?: unknown;
  BundleCount?: unknown;
  CurrentMinPrice?: unknown;
};

export function normalizeAuctionMarketPages(
  pages: readonly unknown[],
): AuctionMarketItem[] {
  const byId = new Map<number, AuctionMarketItem>();

  for (const payload of pages) {
    for (const candidate of extractPageItems(payload)) {
      const item = normalizeMarketItem(candidate);
      if (!item) continue;
      const current = byId.get(item.id);
      if (!current || item.currentMinPrice < current.currentMinPrice) {
        byId.set(item.id, item);
      }
    }
  }

  return sortAuctionMarketItems(Array.from(byId.values()));
}

export function selectAuctionEngravingsAtOrAbove(
  items: readonly AuctionMarketItem[],
  minimumPrice: number,
) {
  return items.filter((item) => item.currentMinPrice >= minimumPrice);
}

export function buildAuctionCacheResponse(
  rows: readonly AuctionCacheItem[],
  now = Date.now(),
): AuctionMarketResponse | null {
  const validRows = rows.filter(isValidCacheItem);
  if (validRows.length === 0) return null;

  const snapshotAt = Math.min(...validRows.map((row) => row.updatedAt));
  const age = Math.max(0, now - snapshotAt);
  if (age >= AUCTION_MARKET_STALE_TTL_MS) return null;

  return {
    updatedAt: new Date(snapshotAt).toISOString(),
    stale: age >= AUCTION_MARKET_FRESH_TTL_MS,
    items: sortAuctionMarketItems(
      validRows.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        bundleCount: row.bundleCount,
        currentMinPrice: row.currentMinPrice,
      })),
    ),
  };
}

export function sortAuctionMarketItems(items: readonly AuctionMarketItem[]) {
  return [...items].sort(
    (a, b) =>
      b.currentMinPrice - a.currentMinPrice ||
      a.name.localeCompare(b.name, "ko-KR"),
  );
}

function extractPageItems(payload: unknown): ApiMarketItem[] {
  if (Array.isArray(payload)) return payload as ApiMarketItem[];
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as Record<string, unknown>).Items;
  return Array.isArray(items) ? (items as ApiMarketItem[]) : [];
}

function normalizeMarketItem(candidate: ApiMarketItem): AuctionMarketItem | null {
  const id = Number(candidate.Id);
  const name =
    typeof candidate.Name === "string" ? candidate.Name.trim().normalize("NFC") : "";
  const grade = typeof candidate.Grade === "string" ? candidate.Grade.trim() : "";
  const icon = typeof candidate.Icon === "string" ? candidate.Icon.trim() : "";
  const bundleCount = Number(candidate.BundleCount);
  const currentMinPrice = Number(candidate.CurrentMinPrice);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !/^유물 .+ 각인서$/u.test(name) ||
    (grade && grade !== "유물") ||
    !Number.isFinite(bundleCount) ||
    bundleCount <= 0 ||
    !Number.isSafeInteger(currentMinPrice) ||
    currentMinPrice <= 0
  ) {
    return null;
  }

  return { id, name, icon, bundleCount, currentMinPrice };
}

function isValidCacheItem(row: AuctionCacheItem) {
  return (
    Number.isSafeInteger(row.id) &&
    row.id > 0 &&
    /^유물 .+ 각인서$/u.test(row.name) &&
    Number.isFinite(row.bundleCount) &&
    row.bundleCount > 0 &&
    Number.isSafeInteger(row.currentMinPrice) &&
    row.currentMinPrice > 0 &&
    Number.isFinite(row.updatedAt) &&
    row.updatedAt > 0
  );
}
