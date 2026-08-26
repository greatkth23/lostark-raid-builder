import { describe, expect, it } from "vitest";
import { calculateAuctionBid } from "./auctionCalculator";

describe("calculateAuctionBid", () => {
  it("matches the verified 115,999G eight-person reference result", () => {
    expect(calculateAuctionBid(115_999, 8)).toEqual({
      feeAdjustedPrice: 110_199,
      sellBid: 87_658,
      sellTakeHome: 22_541,
      sellDistribution: 12_523,
      useBid: 96_424,
      useDistribution: 13_775,
    });
  });

  it.each([
    [4, 64_773, 30_227, 21_591, 71_250, 23_750],
    [8, 75_568, 19_432, 10_795, 83_125, 11_875],
    [16, 80_966, 14_034, 5_398, 89_063, 5_938],
  ])(
    "calculates the 100,000G result for %i participants",
    (participants, sellBid, sellTakeHome, sellDistribution, useBid, useDistribution) => {
      expect(calculateAuctionBid(100_000, participants)).toEqual({
        feeAdjustedPrice: 95_000,
        sellBid,
        sellTakeHome,
        sellDistribution,
        useBid,
        useDistribution,
      });
    },
  );

  it("rounds only the final value of each formula", () => {
    expect(calculateAuctionBid(3, 8)).toEqual({
      feeAdjustedPrice: 3,
      sellBid: 2,
      sellTakeHome: 1,
      sellDistribution: 0,
      useBid: 2,
      useDistribution: 0,
    });
  });

  it.each([
    [0, 8],
    [-1, 8],
    [100, 1],
    [100, 1.5],
    [100.5, 8],
    [Number.NaN, 8],
  ])("rejects invalid price %s and participant count %s", (price, participants) => {
    expect(calculateAuctionBid(price, participants)).toBeNull();
  });
});
