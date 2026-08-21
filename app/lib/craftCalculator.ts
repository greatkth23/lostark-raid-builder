import {
  FUSION_RECIPES,
  LIFE_DEFINITIONS,
  type LifeDefinition,
} from "./craftCatalog";
import type {
  AcquisitionLine,
  AcquisitionStep,
  CraftSettings,
  FusionKind,
  LifeProfitResult,
  MarketItemKey,
  MarketQuote,
  SourceMode,
} from "./craftTypes";

type QuoteMap = Partial<Record<MarketItemKey, MarketQuote>>;

type PreparedSource = {
  key: MarketItemKey;
  required: number;
  prepared: number;
  remainder: number;
  cost: number;
};

type CommonPlan = {
  cost: number;
  directCommon: number;
  advancedConversionSets: number;
  specialConversionSets: number;
  sources: PreparedSource[];
};

type CandidatePlan = {
  cost: number;
  rareExchangeSets: number;
  commonToPowderSets: number;
  powderRemainder: number;
  commonPlan: CommonPlan;
  sources: PreparedSource[];
};

export const DEFAULT_CRAFT_SETTINGS: CraftSettings = {
  feeReductionPct: 14,
  extraGreatSuccessPct: 7,
  setCount: 30,
  sourceMode: "market",
  disposition: "sell",
};

export function normalizeCraftSettings(value: Partial<CraftSettings>): CraftSettings {
  return {
    feeReductionPct: clampNumber(value.feeReductionPct, 0, 100, 14),
    extraGreatSuccessPct: clampNumber(value.extraGreatSuccessPct, 0, 1_900, 7),
    setCount: Math.round(clampNumber(value.setCount, 1, 1_000, 30)),
    sourceMode: value.sourceMode === "self" ? "self" : "market",
    disposition: value.disposition === "use" ? "use" : "sell",
  };
}

export function calculateCraftResults(
  kind: FusionKind,
  settingsInput: CraftSettings,
  quotes: QuoteMap,
): LifeProfitResult[] {
  const settings = normalizeCraftSettings(settingsInput);
  const recipe = FUSION_RECIPES[kind];
  const product = requireQuote(quotes, recipe.product);
  const totalGreatSuccess = Math.min(
    1,
    0.05 * (1 + settings.extraGreatSuccessPct / 100),
  );
  const expectedOutput =
    settings.setCount * recipe.output * (1 + totalGreatSuccess);
  const productUnitPrice = product.currentMinPrice / product.bundleCount;
  const revenue =
    expectedOutput *
    productUnitPrice *
    (settings.disposition === "sell" ? 0.95 : 1);
  const discountedFeePerSet = Math.round(
    recipe.fee * (1 - settings.feeReductionPct / 100),
  );
  const craftFee = discountedFeePerSet * settings.setCount;

  return LIFE_DEFINITIONS.map((life) => {
    const candidate = findBestPlan(
      life,
      {
        rare: recipe.rare * settings.setCount,
        advanced: recipe.advanced * settings.setCount,
        common: recipe.common * settings.setCount,
      },
      quotes,
      settings.sourceMode,
    );
    const acquisitionLines = candidate.sources
      .filter((source) => source.required > 0)
      .map((source) => toAcquisitionLine(source, quotes));
    const exchangeSteps = toExchangeSteps(candidate, life, quotes);
    const materialCost = candidate.cost;
    const totalCost = materialCost + craftFee;

    return {
      lifeKey: life.key,
      lifeName: life.name,
      productName: product.name,
      productIcon: product.icon,
      materialCost,
      craftFee,
      totalCost,
      expectedOutput,
      revenue,
      netProfit: revenue - totalCost,
      acquisitionLines,
      exchangeSteps,
    };
  }).sort((a, b) => b.netProfit - a.netProfit);
}

function findBestPlan(
  life: LifeDefinition,
  required: { rare: number; advanced: number; common: number },
  quotes: QuoteMap,
  sourceMode: SourceMode,
) {
  const commonSource = findCheapestCommonSource(life, quotes, sourceMode);
  const directRareUnitCost = getSourceUnitCost(life.rare, quotes, sourceMode);
  const exchangedRareUnitCost = commonSource.unitCost * 12.5;
  const rareExchangeSets =
    exchangedRareUnitCost < directRareUnitCost
      ? Math.ceil(required.rare / 10)
      : 0;
  const directRare = rareExchangeSets > 0 ? 0 : required.rare;
  const powderNeeded = rareExchangeSets * 100;
  const commonToPowderSets = Math.ceil(powderNeeded / 80);
  const powderRemainder = commonToPowderSets * 80 - powderNeeded;
  const commonNeeded = required.common + commonToPowderSets * 100;
  const rareSource = prepareSource(
    life.rare,
    directRare,
    quotes,
    sourceMode,
  );
  const commonPlan = prepareCommonSources(
    life,
    required.advanced,
    commonNeeded,
    commonSource.kind,
    quotes,
    sourceMode,
  );

  return {
    cost: rareSource.cost + commonPlan.cost,
    rareExchangeSets,
    commonToPowderSets,
    powderRemainder,
    commonPlan,
    sources: mergeSources([rareSource, ...commonPlan.sources]),
  } satisfies CandidatePlan;
}

function findCheapestCommonSource(
  life: LifeDefinition,
  quotes: QuoteMap,
  sourceMode: SourceMode,
) {
  const candidates: Array<{
    kind: "direct" | "advanced" | "special";
    unitCost: number;
  }> = [
    {
      kind: "direct",
      unitCost: getSourceUnitCost(life.common, quotes, sourceMode),
    },
  ];
  if (life.canExchangeAdvancedForCommon) {
    candidates.push({
      kind: "advanced",
      unitCost: getSourceUnitCost(life.advanced, quotes, sourceMode) / 2,
    });
  }
  if (life.special) {
    candidates.push({
      kind: "special",
      unitCost: getSourceUnitCost(life.special, quotes, sourceMode) / 10,
    });
  }
  return candidates.reduce((best, candidate) =>
    candidate.unitCost < best.unitCost ? candidate : best,
  );
}

function prepareCommonSources(
  life: LifeDefinition,
  baseAdvanced: number,
  commonNeeded: number,
  sourceKind: "direct" | "advanced" | "special",
  quotes: QuoteMap,
  sourceMode: SourceMode,
): CommonPlan {
  const conversionSets =
    sourceKind === "direct" ? 0 : Math.ceil(commonNeeded / 50);
  const advancedConversionSets =
    sourceKind === "advanced" ? conversionSets : 0;
  const specialConversionSets = sourceKind === "special" ? conversionSets : 0;
  const directCommon = sourceKind === "direct" ? commonNeeded : 0;
  const sources = [
    prepareSource(
      life.advanced,
      baseAdvanced + advancedConversionSets * 25,
      quotes,
      sourceMode,
    ),
    prepareSource(life.common, directCommon, quotes, sourceMode),
  ];
  if (life.special) {
    sources.push(
      prepareSource(
        life.special,
        specialConversionSets * 5,
        quotes,
        sourceMode,
      ),
    );
  }
  return {
    cost: sources.reduce((sum, source) => sum + source.cost, 0),
    directCommon,
    advancedConversionSets,
    specialConversionSets,
    sources,
  };
}

function getSourceUnitCost(
  key: MarketItemKey,
  quotes: QuoteMap,
  sourceMode: SourceMode,
) {
  const quote = requireQuote(quotes, key);
  const marketUnitCost = quote.currentMinPrice / quote.bundleCount;
  return sourceMode === "self" ? marketUnitCost * 0.95 : marketUnitCost;
}

function prepareSource(
  key: MarketItemKey,
  quantity: number,
  quotes: QuoteMap,
  sourceMode: SourceMode,
): PreparedSource {
  const quote = requireQuote(quotes, key);
  if (quantity <= 0) {
    return { key, required: 0, prepared: 0, remainder: 0, cost: 0 };
  }

  if (sourceMode === "market") {
    const bundles = Math.ceil(quantity / quote.bundleCount);
    const prepared = bundles * quote.bundleCount;
    return {
      key,
      required: quantity,
      prepared,
      remainder: prepared - quantity,
      cost: bundles * quote.currentMinPrice,
    };
  }

  const unitOpportunityCost = quote.currentMinPrice / quote.bundleCount;
  return {
    key,
    required: quantity,
    prepared: quantity,
    remainder: 0,
    cost: quantity * unitOpportunityCost * 0.95,
  };
}

function toAcquisitionLine(
  source: PreparedSource,
  quotes: QuoteMap,
): AcquisitionLine {
  const quote = requireQuote(quotes, source.key);
  return {
    key: source.key,
    name: quote.name,
    requiredQuantity: source.required,
    preparedQuantity: source.prepared,
    remainderQuantity: source.remainder,
    cost: source.cost,
    icon: quote.icon,
  };
}

function toExchangeSteps(
  candidate: CandidatePlan,
  life: LifeDefinition,
  quotes: QuoteMap,
): AcquisitionStep[] {
  const steps: AcquisitionStep[] = [];
  const advanced = requireQuote(quotes, life.advanced).name;
  const common = requireQuote(quotes, life.common).name;
  const rare = requireQuote(quotes, life.rare).name;

  if (candidate.commonPlan.advancedConversionSets > 0) {
    const sets = candidate.commonPlan.advancedConversionSets;
    steps.push({
      label: `${advanced} → ${common}`,
      sets,
      detail: `${advanced} ${formatExchangeQuantity(sets * 25)}개를 ${common} ${formatExchangeQuantity(sets * 50)}개로 교환`,
    });
  }
  if (candidate.commonPlan.specialConversionSets > 0 && life.special) {
    const sets = candidate.commonPlan.specialConversionSets;
    const special = requireQuote(quotes, life.special).name;
    steps.push({
      label: `${special} → ${common}`,
      sets,
      detail: `${special} ${formatExchangeQuantity(sets * 5)}개를 ${common} ${formatExchangeQuantity(sets * 50)}개로 교환`,
    });
  }
  if (candidate.commonToPowderSets > 0) {
    steps.push({
      label: `${common} → ${life.powderName}`,
      sets: candidate.commonToPowderSets,
      detail: `${common} ${formatExchangeQuantity(candidate.commonToPowderSets * 100)}개를 ${life.powderName} ${formatExchangeQuantity(candidate.commonToPowderSets * 80)}개로 교환`,
    });
  }
  if (candidate.rareExchangeSets > 0) {
    steps.push({
      label: `${life.powderName} → ${rare}`,
      sets: candidate.rareExchangeSets,
      detail: `${life.powderName} ${formatExchangeQuantity(candidate.rareExchangeSets * 100)}개를 ${rare} ${formatExchangeQuantity(candidate.rareExchangeSets * 10)}개로 교환${candidate.powderRemainder > 0 ? ` · 가루 ${formatExchangeQuantity(candidate.powderRemainder)}개 잔여` : ""}`,
    });
  }
  return steps;
}

const formatExchangeQuantity = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);

function mergeSources(sources: PreparedSource[]) {
  const merged = new Map<MarketItemKey, PreparedSource>();
  for (const source of sources) {
    const current = merged.get(source.key);
    if (!current) {
      merged.set(source.key, { ...source });
      continue;
    }
    current.required += source.required;
    current.prepared += source.prepared;
    current.remainder += source.remainder;
    current.cost += source.cost;
  }
  return [...merged.values()];
}

function requireQuote(quotes: QuoteMap, key: MarketItemKey) {
  const quote = quotes[key];
  if (
    !quote ||
    quote.bundleCount <= 0 ||
    !Number.isFinite(quote.currentMinPrice) ||
    quote.currentMinPrice <= 0
  ) {
    throw new Error(`${key}의 거래소 가격이 없습니다.`);
  }
  return quote;
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}
