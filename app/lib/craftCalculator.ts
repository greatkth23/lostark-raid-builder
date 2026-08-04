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
    extraGreatSuccessPct: clampNumber(value.extraGreatSuccessPct, 0, 95, 7),
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
    0.05 + settings.extraGreatSuccessPct / 100,
  );
  const expectedOutput =
    settings.setCount * recipe.output * (1 + totalGreatSuccess);
  const productUnitPrice = product.currentMinPrice / product.bundleCount;
  const revenue =
    expectedOutput *
    productUnitPrice *
    (settings.disposition === "sell" ? 0.95 : 1);
  const discountedFeePerSet = Math.floor(
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
  const maxRareExchangeSets = Math.ceil(required.rare / 10);
  const rareCandidates = candidateRange(maxRareExchangeSets, 640, 80);
  let best: CandidatePlan | null = null;

  for (const rareExchangeSets of rareCandidates) {
    const directRare = Math.max(0, required.rare - rareExchangeSets * 10);
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
    const commonPlan = optimizeCommonSources(
      life,
      required.advanced,
      commonNeeded,
      quotes,
      sourceMode,
    );
    const cost = rareSource.cost + commonPlan.cost;

    if (!best || cost < best.cost) {
      best = {
        cost,
        rareExchangeSets,
        commonToPowderSets,
        powderRemainder,
        commonPlan,
        sources: mergeSources([rareSource, ...commonPlan.sources]),
      };
    }
  }

  if (!best) throw new Error(`${life.name} 제작 경로를 계산하지 못했습니다.`);
  return best;
}

function optimizeCommonSources(
  life: LifeDefinition,
  baseAdvanced: number,
  commonNeeded: number,
  quotes: QuoteMap,
  sourceMode: SourceMode,
): CommonPlan {
  const maxConversionSets = Math.ceil(commonNeeded / 50);
  const conversionCandidates = candidateRange(maxConversionSets, 160, 32);
  let best: CommonPlan | null = null;

  for (const totalConversionSets of conversionCandidates) {
    const allocationCandidates = life.special
      ? candidateRange(totalConversionSets, 64, 14)
      : [totalConversionSets];

    for (const advancedConversionSets of allocationCandidates) {
      const specialConversionSets = life.special
        ? totalConversionSets - advancedConversionSets
        : 0;
      const directCommon = Math.max(
        0,
        commonNeeded - totalConversionSets * 50,
      );
      const advancedQuantity =
        baseAdvanced + advancedConversionSets * 25;
      const sources = [
        prepareSource(
          life.advanced,
          advancedQuantity,
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
      const cost = sources.reduce((sum, source) => sum + source.cost, 0);

      if (!best || cost < best.cost) {
        best = {
          cost,
          directCommon,
          advancedConversionSets,
          specialConversionSets,
          sources,
        };
      }
    }
  }

  if (!best) throw new Error(`${life.name} 일반 재료 경로를 계산하지 못했습니다.`);
  return best;
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

  const sellableBundles = Math.floor(quantity / quote.bundleCount);
  return {
    key,
    required: quantity,
    prepared: quantity,
    remainder: quantity - sellableBundles * quote.bundleCount,
    cost: sellableBundles * quote.currentMinPrice * 0.95,
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
      detail: `${advanced} ${sets * 25}개를 ${common} ${sets * 50}개로 교환`,
    });
  }
  if (candidate.commonPlan.specialConversionSets > 0 && life.special) {
    const sets = candidate.commonPlan.specialConversionSets;
    const special = requireQuote(quotes, life.special).name;
    steps.push({
      label: `${special} → ${common}`,
      sets,
      detail: `${special} ${sets * 5}개를 ${common} ${sets * 50}개로 교환`,
    });
  }
  if (candidate.commonToPowderSets > 0) {
    steps.push({
      label: `${common} → ${life.powderName}`,
      sets: candidate.commonToPowderSets,
      detail: `${common} ${candidate.commonToPowderSets * 100}개를 ${life.powderName} ${candidate.commonToPowderSets * 80}개로 교환`,
    });
  }
  if (candidate.rareExchangeSets > 0) {
    steps.push({
      label: `${life.powderName} → ${rare}`,
      sets: candidate.rareExchangeSets,
      detail: `${life.powderName} ${candidate.rareExchangeSets * 100}개를 ${rare} ${candidate.rareExchangeSets * 10}개로 교환${candidate.powderRemainder > 0 ? ` · 가루 ${candidate.powderRemainder}개 잔여` : ""}`,
    });
  }
  return steps;
}

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

function candidateRange(max: number, exhaustiveLimit: number, edgeSize: number) {
  if (max <= exhaustiveLimit) {
    return Array.from({ length: max + 1 }, (_, index) => index);
  }

  const values = new Set<number>();
  for (let index = 0; index <= edgeSize; index += 1) {
    values.add(index);
    values.add(Math.max(0, max - index));
  }
  for (let residue = 0; residue < 20; residue += 1) {
    values.add(Math.min(max, residue));
    values.add(Math.max(0, max - residue));
  }
  return [...values].sort((a, b) => a - b);
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
