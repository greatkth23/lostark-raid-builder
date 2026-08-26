import { describe, expect, it } from "vitest";
import {
  buildAuctionCacheResponse,
  normalizeAuctionMarketPages,
  selectAuctionEngravingsAtOrAbove,
} from "./auctionMarket";

const page = (...Items: Array<Record<string, unknown>>) => ({
  PageNo: 1,
  PageSize: 10,
  TotalCount: Items.length,
  Items,
});

const item = (
  Id: number,
  Name: string,
  CurrentMinPrice: number | null,
  overrides: Record<string, unknown> = {},
) => ({
  Id,
  Name,
  Icon: `https://example.com/${Id}.png`,
  Grade: "유물",
  BundleCount: 1,
  CurrentMinPrice,
  RecentPrice: CurrentMinPrice,
  YDayAvgPrice: CurrentMinPrice,
  ...overrides,
});

describe("normalizeAuctionMarketPages", () => {
  it("merges pages, removes duplicates, and sorts by price then Korean name", () => {
    const result = normalizeAuctionMarketPages([
      page(
        item(1, "유물 원한 각인서", 100_000),
        item(2, "유물 각성 각인서", 100_000),
      ),
      page(
        item(3, "유물 예리한 둔기 각인서", 120_000),
        item(1, "유물 원한 각인서", 100_000),
      ),
    ]);

    expect(result.map(({ id, name, currentMinPrice }) => ({ id, name, currentMinPrice }))).toEqual([
      { id: 3, name: "유물 예리한 둔기 각인서", currentMinPrice: 120_000 },
      { id: 2, name: "유물 각성 각인서", currentMinPrice: 100_000 },
      { id: 1, name: "유물 원한 각인서", currentMinPrice: 100_000 },
    ]);
  });

  it("drops malformed, non-relic, unrelated, and non-tradable entries", () => {
    const result = normalizeAuctionMarketPages([
      page(
        item(1, "유물 원한 각인서", 100_000),
        item(2, "전설 원한 각인서", 10_000, { Grade: "전설" }),
        item(3, "유물 원한 보상 상자", 9_000),
        item(4, "유물 각성 각인서", 0),
        item(5, "유물 아드레날린 각인서", null),
        item(-1, "유물 돌격대장 각인서", 80_000),
      ),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("유물 원한 각인서");
  });
});

describe("selectAuctionEngravingsAtOrAbove", () => {
  it("keeps every item at the price boundary or above without changing market order", () => {
    const source = normalizeAuctionMarketPages([
      page(
        item(1, "유물 고가 각인서", 70_000),
        item(2, "유물 경계 각인서", 10_000),
        item(3, "유물 저가 각인서", 9_999),
      ),
    ]);

    expect(selectAuctionEngravingsAtOrAbove(source, 10_000).map((entry) => entry.id)).toEqual([1, 2]);
    expect(source).toHaveLength(3);
  });
});

describe("buildAuctionCacheResponse", () => {
  const cached = [
    {
      id: 1,
      name: "유물 원한 각인서",
      icon: "https://example.com/1.png",
      bundleCount: 1,
      currentMinPrice: 100_000,
      updatedAt: 1_000_000,
    },
  ];

  it("marks a snapshot younger than five minutes as fresh", () => {
    expect(buildAuctionCacheResponse(cached, 1_000_000 + 299_999)).toMatchObject({ stale: false });
  });

  it("returns a stale fallback for a snapshot younger than 24 hours", () => {
    expect(buildAuctionCacheResponse(cached, 1_000_000 + 23 * 60 * 60_000)).toMatchObject({
      stale: true,
      items: [{ id: 1, name: "유물 원한 각인서" }],
    });
  });

  it("rejects an empty or expired cache snapshot", () => {
    expect(buildAuctionCacheResponse([], 1_000_000)).toBeNull();
    expect(buildAuctionCacheResponse(cached, 1_000_000 + 24 * 60 * 60_000)).toBeNull();
  });
});
