export type FusionKind = "abidos" | "advancedAbidos";
export type SourceMode = "market" | "self";
export type Disposition = "sell" | "use";

export type CraftSettings = {
  feeReductionPct: number;
  extraGreatSuccessPct: number;
  setCount: number;
  sourceMode: SourceMode;
  disposition: Disposition;
};

export type MarketItemKey =
  | "archaeologyRare"
  | "archaeologyAdvanced"
  | "archaeologyCommon"
  | "loggingRare"
  | "loggingAdvanced"
  | "loggingCommon"
  | "loggingSpecial"
  | "miningRare"
  | "miningAdvanced"
  | "miningCommon"
  | "miningSpecial"
  | "foragingRare"
  | "foragingAdvanced"
  | "foragingCommon"
  | "huntingRare"
  | "huntingAdvanced"
  | "huntingCommon"
  | "fishingRare"
  | "fishingAdvanced"
  | "fishingCommon"
  | "abidosFusion"
  | "advancedAbidosFusion";

export type MarketQuote = {
  key: MarketItemKey;
  id: number;
  name: string;
  icon: string;
  bundleCount: number;
  currentMinPrice: number;
};

export type CraftMarketResponse = {
  updatedAt: string;
  stale: boolean;
  items: Partial<Record<MarketItemKey, MarketQuote>>;
};

export type AcquisitionLine = {
  key: MarketItemKey;
  name: string;
  requiredQuantity: number;
  preparedQuantity: number;
  remainderQuantity: number;
  cost: number;
  icon: string;
};

export type AcquisitionStep = {
  label: string;
  sets: number;
  detail: string;
};

export type LifeProfitResult = {
  lifeKey: LifeKey;
  lifeName: string;
  productName: string;
  productIcon: string;
  materialCost: number;
  craftFee: number;
  totalCost: number;
  expectedOutput: number;
  revenue: number;
  netProfit: number;
  acquisitionLines: AcquisitionLine[];
  exchangeSteps: AcquisitionStep[];
};

export type LifeKey =
  | "archaeology"
  | "logging"
  | "mining"
  | "foraging"
  | "hunting"
  | "fishing";
