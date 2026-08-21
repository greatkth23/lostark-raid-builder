import type { FusionKind, LifeKey, MarketItemKey } from "./craftTypes";

export const MARKET_ITEM_CATALOG: ReadonlyArray<{
  key: MarketItemKey;
  name: string;
  categoryCode: number;
}> = [
  { key: "archaeologyRare", name: "아비도스 유물", categoryCode: 90700 },
  { key: "archaeologyAdvanced", name: "희귀한 유물", categoryCode: 90700 },
  { key: "archaeologyCommon", name: "고대 유물", categoryCode: 90700 },
  { key: "loggingRare", name: "아비도스 목재", categoryCode: 90300 },
  { key: "loggingAdvanced", name: "부드러운 목재", categoryCode: 90300 },
  { key: "loggingCommon", name: "목재", categoryCode: 90300 },
  { key: "loggingSpecial", name: "튼튼한 목재", categoryCode: 90300 },
  { key: "miningRare", name: "아비도스 철광석", categoryCode: 90400 },
  { key: "miningAdvanced", name: "묵직한 철광석", categoryCode: 90400 },
  { key: "miningCommon", name: "철광석", categoryCode: 90400 },
  { key: "miningSpecial", name: "단단한 철광석", categoryCode: 90400 },
  { key: "foragingRare", name: "아비도스 들꽃", categoryCode: 90200 },
  { key: "foragingAdvanced", name: "수줍은 들꽃", categoryCode: 90200 },
  { key: "foragingCommon", name: "들꽃", categoryCode: 90200 },
  { key: "huntingRare", name: "아비도스 두툼한 생고기", categoryCode: 90500 },
  { key: "huntingAdvanced", name: "다듬은 생고기", categoryCode: 90500 },
  { key: "huntingCommon", name: "두툼한 생고기", categoryCode: 90500 },
  { key: "fishingRare", name: "아비도스 태양 잉어", categoryCode: 90600 },
  { key: "fishingAdvanced", name: "붉은 살 생선", categoryCode: 90600 },
  { key: "fishingCommon", name: "생선", categoryCode: 90600 },
  { key: "abidosFusion", name: "아비도스 융화 재료", categoryCode: 50010 },
  { key: "advancedAbidosFusion", name: "상급 아비도스 융화 재료", categoryCode: 50010 },
];

export type LifeDefinition = {
  key: LifeKey;
  name: string;
  powderName: string;
  rare: MarketItemKey;
  advanced: MarketItemKey;
  common: MarketItemKey;
  canExchangeAdvancedForCommon?: boolean;
  special?: MarketItemKey;
};

export const LIFE_DEFINITIONS: readonly LifeDefinition[] = [
  {
    key: "archaeology",
    name: "고고학",
    powderName: "고고학의 가루",
    rare: "archaeologyRare",
    advanced: "archaeologyAdvanced",
    common: "archaeologyCommon",
  },
  {
    key: "logging",
    name: "벌목",
    powderName: "벌목의 가루",
    rare: "loggingRare",
    advanced: "loggingAdvanced",
    common: "loggingCommon",
    canExchangeAdvancedForCommon: true,
    special: "loggingSpecial",
  },
  {
    key: "mining",
    name: "채광",
    powderName: "채광의 가루",
    rare: "miningRare",
    advanced: "miningAdvanced",
    common: "miningCommon",
    canExchangeAdvancedForCommon: true,
    special: "miningSpecial",
  },
  {
    key: "foraging",
    name: "채집",
    powderName: "채집의 가루",
    rare: "foragingRare",
    advanced: "foragingAdvanced",
    common: "foragingCommon",
  },
  {
    key: "hunting",
    name: "수렵",
    powderName: "수렵의 가루",
    rare: "huntingRare",
    advanced: "huntingAdvanced",
    common: "huntingCommon",
  },
  {
    key: "fishing",
    name: "낚시",
    powderName: "낚시의 가루",
    rare: "fishingRare",
    advanced: "fishingAdvanced",
    common: "fishingCommon",
  },
];

export const FUSION_RECIPES: Record<
  FusionKind,
  {
    name: string;
    product: MarketItemKey;
    rare: number;
    advanced: number;
    common: number;
    fee: number;
    output: number;
  }
> = {
  abidos: {
    name: "아비도스",
    product: "abidosFusion",
    rare: 33,
    advanced: 45,
    common: 86,
    fee: 400,
    output: 10,
  },
  advancedAbidos: {
    name: "상급 아비도스",
    product: "advancedAbidosFusion",
    rare: 43,
    advanced: 59,
    common: 112,
    fee: 520,
    output: 10,
  },
};
