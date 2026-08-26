import { describe, expect, it } from "vitest";
import { loadAuctionMarketPages } from "./auctionMarketLoader";

describe("loadAuctionMarketPages", () => {
  it("reserves quota and returns every market page in page-number order", async () => {
    const requestedPages: number[] = [];
    const reservedCosts: number[] = [];
    const payloads = new Map<number, unknown>([
      [0, { PageNo: 0, PageSize: 10, TotalCount: 21, Items: [{ Id: 1 }] }],
      [1, { PageNo: 1, PageSize: 10, TotalCount: 21, Items: [{ Id: 2 }] }],
      [2, { PageNo: 2, PageSize: 10, TotalCount: 21, Items: [{ Id: 3 }] }],
    ]);

    const pages = await loadAuctionMarketPages({
      reserveRequests: async (cost) => {
        reservedCosts.push(cost);
      },
      fetchPage: async (pageNo) => {
        requestedPages.push(pageNo);
        return payloads.get(pageNo);
      },
    });

    expect(reservedCosts).toEqual([1, 2]);
    expect(requestedPages).toEqual([0, 1, 2]);
    expect(pages).toEqual([payloads.get(0), payloads.get(1), payloads.get(2)]);
  });

  it("rejects malformed pagination before issuing more requests", async () => {
    const requestedPages: number[] = [];

    await expect(
      loadAuctionMarketPages({
        reserveRequests: async () => undefined,
        fetchPage: async (pageNo) => {
          requestedPages.push(pageNo);
          return { PageSize: 0, TotalCount: 20, Items: [] };
        },
      }),
    ).rejects.toThrow("페이지 정보를 확인하지 못했습니다");

    expect(requestedPages).toEqual([0]);
  });

  it("caps the number of pages to prevent an unbounded external request burst", async () => {
    await expect(
      loadAuctionMarketPages({
        reserveRequests: async () => undefined,
        fetchPage: async () => ({ PageSize: 10, TotalCount: 10_000, Items: [] }),
      }),
    ).rejects.toThrow("페이지 수가 허용 범위를 초과했습니다");
  });
});
