import { describe, expect, it } from "vitest";
import { MARKET_ITEM_CATALOG } from "./craftCatalog";
import {
  calculateCraftResults,
  DEFAULT_CRAFT_SETTINGS,
  normalizeCraftSettings,
} from "./craftCalculator";
import type { MarketItemKey, MarketQuote } from "./craftTypes";

const makeQuotes = (
  overrides: Partial<
    Record<MarketItemKey, Partial<Pick<MarketQuote, "bundleCount" | "currentMinPrice">>>
  > = {},
) =>
  Object.fromEntries(
    MARKET_ITEM_CATALOG.map((item, index) => [
      item.key,
      {
        key: item.key,
        id: index + 1,
        name: item.name,
        icon: "",
        bundleCount: overrides[item.key]?.bundleCount ?? 1,
        currentMinPrice: overrides[item.key]?.currentMinPrice ?? 1,
      } satisfies MarketQuote,
    ]),
  ) as Record<MarketItemKey, MarketQuote>;

describe("craft calculator", () => {
  it("includes the base 5% great success chance in expected output", () => {
    const quotes = makeQuotes({
      abidosFusion: { currentMinPrice: 100 },
    });
    const results = calculateCraftResults(
      "abidos",
      {
        ...DEFAULT_CRAFT_SETTINGS,
        setCount: 40,
        extraGreatSuccessPct: 0,
      },
      quotes,
    );

    expect(results[0].expectedOutput).toBe(420);
    expect(results[0].revenue).toBe(39_900);
  });

  it("applies the entered great-success increase multiplicatively to the base 5%", () => {
    const results = calculateCraftResults(
      "abidos",
      {
        ...DEFAULT_CRAFT_SETTINGS,
        setCount: 40,
        extraGreatSuccessPct: 10,
      },
      makeQuotes({ abidosFusion: { currentMinPrice: 100 } }),
    );

    expect(results[0].expectedOutput).toBeCloseTo(422);
    expect(results[0].revenue).toBeCloseTo(40_090);
  });

  it("rounds the discounted crafting fee down per set", () => {
    const results = calculateCraftResults(
      "abidos",
      { ...DEFAULT_CRAFT_SETTINGS, setCount: 30, feeReductionPct: 14 },
      makeQuotes(),
    );

    expect(results[0].craftFee).toBe(295 * 30);
  });

  it("uses only fixed 100-to-80 and 100-to-10 powder exchange sets", () => {
    const quotes = makeQuotes({
      archaeologyRare: { currentMinPrice: 1_000 },
      archaeologyAdvanced: { currentMinPrice: 1_000 },
      archaeologyCommon: { currentMinPrice: 1 },
    });
    const result = calculateCraftResults(
      "abidos",
      { ...DEFAULT_CRAFT_SETTINGS, setCount: 1 },
      quotes,
    ).find((item) => item.lifeKey === "archaeology");

    const powderStep = result?.exchangeSteps.find((step) =>
      step.label.includes("고고학의 가루 →"),
    );
    const commonStep = result?.exchangeSteps.find((step) =>
      step.label.includes("→ 고고학의 가루"),
    );
    expect(powderStep?.sets).toBe(4);
    expect(commonStep?.sets).toBe(5);
  });

  it("rounds market purchases up to the item's bundle size", () => {
    const quotes = makeQuotes({
      archaeologyRare: { bundleCount: 100, currentMinPrice: 100 },
      archaeologyAdvanced: { bundleCount: 100, currentMinPrice: 10_000 },
      archaeologyCommon: { bundleCount: 100, currentMinPrice: 100 },
    });
    const result = calculateCraftResults(
      "abidos",
      { ...DEFAULT_CRAFT_SETTINGS, setCount: 1 },
      quotes,
    ).find((item) => item.lifeKey === "archaeology");
    const rare = result?.acquisitionLines.find(
      (line) => line.key === "archaeologyRare",
    );

    expect(rare?.requiredQuantity).toBe(33);
    expect(rare?.preparedQuantity).toBe(100);
    expect(rare?.remainderQuantity).toBe(67);
  });

  it("counts only complete sellable bundles as self-gather opportunity cost", () => {
    const quotes = makeQuotes(
      Object.fromEntries(
        MARKET_ITEM_CATALOG.map((item) => [
          item.key,
          { bundleCount: 100, currentMinPrice: 100 },
        ]),
      ),
    );
    const result = calculateCraftResults(
      "abidos",
      {
        ...DEFAULT_CRAFT_SETTINGS,
        setCount: 1,
        sourceMode: "self",
      },
      quotes,
    ).find((item) => item.lifeKey === "archaeology");

    expect(result?.materialCost).toBe(0);
    expect(result?.acquisitionLines.every((line) => line.cost === 0)).toBe(true);
  });

  it("uses the logging special material when it is the cheapest common source", () => {
    const quotes = makeQuotes({
      loggingRare: { currentMinPrice: 1 },
      loggingAdvanced: { currentMinPrice: 1_000 },
      loggingCommon: { currentMinPrice: 1_000 },
      loggingSpecial: { currentMinPrice: 1 },
    });
    const result = calculateCraftResults(
      "abidos",
      { ...DEFAULT_CRAFT_SETTINGS, setCount: 1 },
      quotes,
    ).find((item) => item.lifeKey === "logging");

    expect(
      result?.exchangeSteps.some((step) => step.label.includes("튼튼한 목재")),
    ).toBe(true);
  });

  it("prefers the cheapest equivalent route even when bundle rounding leaves more material", () => {
    const quotes = makeQuotes({
      loggingRare: { bundleCount: 100, currentMinPrice: 1_695 },
      loggingAdvanced: { bundleCount: 100, currentMinPrice: 267 },
      loggingCommon: { bundleCount: 100, currentMinPrice: 137 },
      loggingSpecial: { bundleCount: 100, currentMinPrice: 100_000 },
    });
    const result = calculateCraftResults(
      "advancedAbidos",
      { ...DEFAULT_CRAFT_SETTINGS, setCount: 30 },
      quotes,
    ).find((item) => item.lifeKey === "logging");

    expect(
      result?.acquisitionLines.some((line) => line.key === "loggingRare"),
    ).toBe(false);
    expect(
      result?.exchangeSteps.some(
        (step) => step.label === "부드러운 목재 → 목재",
      ),
    ).toBe(true);
    expect(result?.exchangeSteps.some((step) => step.label.includes("벌목의 가루"))).toBe(true);
  });

  it("clamps persisted settings to supported ranges", () => {
    expect(
      normalizeCraftSettings({
        feeReductionPct: 120,
        extraGreatSuccessPct: -4,
        setCount: 5_000,
      }),
    ).toMatchObject({
      feeReductionPct: 100,
      extraGreatSuccessPct: 0,
      setCount: 1_000,
    });
  });
});
