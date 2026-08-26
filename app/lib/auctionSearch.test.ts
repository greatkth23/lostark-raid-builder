import { describe, expect, it } from "vitest";
import {
  formatAuctionEngravingName,
  getAuctionHorizontalWheelDelta,
} from "./auctionSearch";

describe("formatAuctionEngravingName", () => {
  it("removes only the relic grade prefix and engraving-book suffix", () => {
    expect(formatAuctionEngravingName("유물 예리한 둔기 각인서")).toBe("예리한 둔기");
    expect(formatAuctionEngravingName("유물 원한 보상 상자")).toBe("유물 원한 보상 상자");
  });
});

describe("getAuctionHorizontalWheelDelta", () => {
  it("translates a vertical mouse wheel gesture into horizontal movement", () => {
    expect(getAuctionHorizontalWheelDelta(0, 120)).toBe(120);
    expect(getAuctionHorizontalWheelDelta(0, -80)).toBe(-80);
  });

  it("leaves horizontal trackpad gestures and browser zoom gestures untouched", () => {
    expect(getAuctionHorizontalWheelDelta(90, 20)).toBe(0);
    expect(getAuctionHorizontalWheelDelta(0, 100, true)).toBe(0);
  });
});
