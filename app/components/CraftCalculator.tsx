"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import lostarkGoldIcon from "../../lostark_gold.png";
import { FUSION_RECIPES } from "../lib/craftCatalog";
import {
  calculateCraftResults,
  DEFAULT_CRAFT_SETTINGS,
  normalizeCraftSettings,
} from "../lib/craftCalculator";
import type {
  CraftMarketResponse,
  CraftSettings,
  Disposition,
  FusionKind,
  LifeKey,
  LifeProfitResult,
  SourceMode,
} from "../lib/craftTypes";

const SETTINGS_KEY = "loiar-craft-settings-v1";
const MARKET_CACHE_KEY = "loiar-craft-market-v1";
const MARKET_AUTO_REFRESH_INTERVAL_MS = 60_000;
const FUSION_KINDS: FusionKind[] = ["abidos", "advancedAbidos"];
const GOLD_ICON_URL =
  typeof lostarkGoldIcon === "string" ? lostarkGoldIcon : lostarkGoldIcon.src;

type MarketError = { message?: string; retryAfterSeconds?: number };

export default function CraftCalculator() {
  const [settings, setSettings] = useState<CraftSettings>(DEFAULT_CRAFT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [market, setMarket] = useState<CraftMarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKind, setSelectedKind] = useState<FusionKind>("abidos");
  const [openLife, setOpenLife] = useState<LifeKey | "none" | null>(null);
  const manualProductSelection = useRef(false);

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/lostark/market/craft", {
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as CraftMarketResponse & MarketError;
      if (!response.ok) {
        throw new Error(
          payload.retryAfterSeconds
            ? `${payload.message ?? "거래소 가격을 불러오지 못했습니다."} ${payload.retryAfterSeconds}초 후 다시 시도해 주세요.`
            : payload.message ?? "거래소 가격을 불러오지 못했습니다.",
        );
      }
      setMarket(payload);
      try {
        window.localStorage.setItem(
          MARKET_CACHE_KEY,
          JSON.stringify({ fetchedAt: Date.now(), market: payload }),
        );
      } catch {
        // Storage availability must not turn a successful market response into an error.
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "거래소 가격을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let hasFreshMarketCache = false;
      try {
        const saved = window.localStorage.getItem(SETTINGS_KEY);
        if (saved) {
          setSettings(normalizeCraftSettings(JSON.parse(saved) as CraftSettings));
        }
      } catch {
        window.localStorage.removeItem(SETTINGS_KEY);
      } finally {
        setSettingsReady(true);
      }

      try {
        const cached = window.localStorage.getItem(MARKET_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            fetchedAt?: number;
            market?: CraftMarketResponse;
          };
          const cacheAge = Date.now() - (parsed.fetchedAt ?? 0);
          if (isCraftMarketResponse(parsed.market)) {
            setMarket(parsed.market);
            if (
              cacheAge >= 0 &&
              cacheAge < MARKET_AUTO_REFRESH_INTERVAL_MS
            ) {
              setLoading(false);
              hasFreshMarketCache = true;
            }
          }
        }
      } catch {
        window.localStorage.removeItem(MARKET_CACHE_KEY);
      }

      if (!hasFreshMarketCache) void loadMarket();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMarket]);

  useEffect(() => {
    if (!settingsReady) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, settingsReady]);

  const calculations = useMemo(() => {
    if (!market) return { results: null, error: "" } as const;
    try {
      return {
        results: {
          abidos: calculateCraftResults("abidos", settings, market.items),
          advancedAbidos: calculateCraftResults(
            "advancedAbidos",
            settings,
            market.items,
          ),
        },
        error: "",
      } as const;
    } catch (caught) {
      return {
        results: null,
        error:
          caught instanceof Error
            ? caught.message
            : "제작 수익을 계산하지 못했습니다.",
      } as const;
    }
  }, [market, settings]);

  useEffect(() => {
    if (!calculations.results || manualProductSelection.current) return;
    const normalMax = calculations.results.abidos[0]?.netProfit ?? -Infinity;
    const advancedMax =
      calculations.results.advancedAbidos[0]?.netProfit ?? -Infinity;
    setSelectedKind(advancedMax > normalMax ? "advancedAbidos" : "abidos");
  }, [calculations.results]);

  const selectedResults = useMemo(
    () => calculations.results?.[selectedKind] ?? [],
    [calculations.results, selectedKind],
  );
  const effectiveOpenLife =
    openLife === "none"
      ? null
      : openLife && selectedResults.some((result) => result.lifeKey === openLife)
        ? openLife
        : selectedResults[0]?.lifeKey ?? null;

  const updateSettings = <K extends keyof CraftSettings>(
    key: K,
    value: CraftSettings[K],
  ) => {
    setSettings((current) => normalizeCraftSettings({ ...current, [key]: value }));
  };

  return (
    <main className="craft-page">
      <div className="craft-shell">
        <header className="craft-page-heading">
          <h1>영지 제작 계산기</h1>
          <button
            className="craft-refresh-button"
            type="button"
            onClick={() => void loadMarket()}
            disabled={loading}
          >
            <span className={loading ? "craft-reload spinning" : "craft-reload"} />
            시세 갱신
          </button>
        </header>

        {market ? (
          <div className={market.stale ? "craft-market-status stale" : "craft-market-status"}>
            <span className="craft-status-dot" />
            {market.stale ? "최근 캐시 시세 사용 중" : "거래소 최저가 반영"} ·{" "}
            {formatUpdatedAt(market.updatedAt)} 갱신
          </div>
        ) : null}

        {loading && !market ? <CraftSkeleton /> : null}
        {error || calculations.error ? (
          <div className="craft-error" role="alert">
            <div>
              <strong>가격 정보를 준비하지 못했습니다.</strong>
              <p>{error || calculations.error}</p>
            </div>
            <button type="button" onClick={() => void loadMarket()}>
              다시 시도
            </button>
          </div>
        ) : null}

        {calculations.results ? (
          <>
            <section className="craft-product-selector" aria-label="제작할 융화 재료">
              {FUSION_KINDS.map((kind) => {
                const recipe = FUSION_RECIPES[kind];
                const topResult = calculations.results[kind][0];
                const productQuote = market?.items[recipe.product];
                const active = selectedKind === kind;
                return (
                  <button
                    type="button"
                    className={active ? "active" : ""}
                    key={kind}
                    onClick={() => {
                      manualProductSelection.current = true;
                      setSelectedKind(kind);
                    }}
                    aria-pressed={active}
                  >
                    <span className="craft-product-art">
                      {productQuote?.icon ? (
                        // Official API image URL; ordinary img avoids hostname coupling.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={productQuote.icon} alt="" />
                      ) : null}
                    </span>
                    <span className="craft-product-copy">
                      <span>{recipe.name}</span>
                      <small>최대 예상 수익</small>
                    </span>
                    <ProfitText value={topResult?.netProfit ?? 0} />
                  </button>
                );
              })}
            </section>

            <div className="craft-workspace">
              <aside className="craft-settings-panel">
                <div className="craft-settings-title">
                  <span className="craft-sliders-icon" />
                  <div>
                    <h2>제작 설정</h2>
                    <p>내 영지 효과와 제작 방식을 입력하세요.</p>
                  </div>
                </div>

                <DirectNumberField
                  label="수수료 감소"
                  value={settings.feeReductionPct}
                  suffix="%"
                  min={0}
                  max={100}
                  step={1}
                  onChange={(value) => updateSettings("feeReductionPct", value)}
                />
                <DirectNumberField
                  label="대성공 확률 증가"
                  description={`기본 5% · 적용 ${formatPercentage(Math.min(100, 5 * (1 + settings.extraGreatSuccessPct / 100)))}%`}
                  value={settings.extraGreatSuccessPct}
                  suffix="%"
                  min={0}
                  max={1_900}
                  step={1}
                  onChange={(value) =>
                    updateSettings("extraGreatSuccessPct", value)
                  }
                />
                <SetCountField
                  label="제작 세트"
                  description={`기본 생산 ${formatNumber(settings.setCount * 10)}개`}
                  value={settings.setCount}
                  onChange={(value) => updateSettings("setCount", value)}
                />

                <SegmentedField<SourceMode>
                  label="재료 준비"
                  value={settings.sourceMode}
                  options={[
                    { value: "market", label: "거래소 구매" },
                    { value: "self", label: "직접 생활" },
                  ]}
                  onChange={(value) => updateSettings("sourceMode", value)}
                />
                <SegmentedField<Disposition>
                  label="직접 사용 여부"
                  value={settings.disposition}
                  options={[
                    { value: "sell", label: "거래소 판매" },
                    { value: "use", label: "직접 사용" },
                  ]}
                  onChange={(value) => updateSettings("disposition", value)}
                />

                <div className="craft-settings-note">
                  <span>계산 기준</span>
                  {settings.sourceMode === "market"
                    ? "구매 묶음은 필요한 수량 이상으로 올림합니다."
                    : "판매 가능한 완전한 묶음만 기회비용에 반영합니다."}
                </div>
              </aside>

              <section className="craft-results" aria-label="생활별 기대 수익">
                <div className="craft-results-heading">
                  <div>
                    <h2>생활별 제작 수익</h2>
                    <p>순수익이 높은 생활부터 정렬했습니다.</p>
                  </div>
                  <span>{selectedResults.length}개 생활 비교</span>
                </div>
                <div className="craft-accordion-list">
                  {selectedResults.map((result, index) => (
                    <CraftResultAccordion
                      key={result.lifeKey}
                      result={result}
                      rank={index + 1}
                      settings={settings}
                      open={effectiveOpenLife === result.lifeKey}
                      onToggle={() =>
                        setOpenLife((current) =>
                          (current === null ? effectiveOpenLife : current) === result.lifeKey
                            ? "none"
                            : result.lifeKey,
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function CraftResultAccordion({
  result,
  rank,
  settings,
  open,
  onToggle,
}: {
  result: LifeProfitResult;
  rank: number;
  settings: CraftSettings;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article className={open ? "craft-result-card open" : "craft-result-card"}>
      <button
        className="craft-result-summary"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="craft-rank">{String(rank).padStart(2, "0")}</span>
        <span className="craft-life-title">
          <span>{formatLifeMethod(result.lifeName)}</span>
          <small>
            재료·제작비 {formatGold(result.totalCost)} · 기대 생산{" "}
            {formatQuantity(result.expectedOutput)}개
          </small>
        </span>
        <span className="craft-summary-profit">
          <small>기대 순수익</small>
          <ProfitText value={result.netProfit} />
        </span>
        <span className="craft-accordion-chevron" />
      </button>

      {open ? (
        <div className="craft-result-details">
          <div className="craft-ledger">
            <div className="craft-ledger-group">
              <div className="craft-ledger-label">
                {settings.sourceMode === "market" ? "준비 재료" : "필요 재료"}
              </div>
              <div className="craft-ledger-lines">
                {result.acquisitionLines.map((line) => (
                  <div className="craft-ledger-row" key={line.key}>
                    <span className="craft-material-name">
                      {line.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={line.icon} alt="" />
                      ) : null}
                      <span>
                        {line.name} <b>×{formatNumber(line.preparedQuantity)}</b>
                        {line.remainderQuantity > 0 ? (
                          <small>
                            필요 {formatNumber(line.requiredQuantity)} · 잔여{" "}
                            {formatNumber(line.remainderQuantity)}
                          </small>
                        ) : null}
                      </span>
                    </span>
                    <CostText value={line.cost} />
                  </div>
                ))}
                <div className="craft-ledger-row">
                  <span className="craft-material-name fee">
                    <span className="craft-gold-icon" style={{ backgroundImage: `url(${GOLD_ICON_URL})` }} />
                    <span>
                      제작 골드
                      <small>{settings.feeReductionPct}% 감소 적용</small>
                    </span>
                  </span>
                  <CostText value={result.craftFee} />
                </div>
              </div>
            </div>

            <div className="craft-ledger-group revenue">
              <div className="craft-ledger-label">
                {settings.disposition === "sell" ? "판매 수익" : "기대 수익"}
              </div>
              <div className="craft-ledger-lines">
                <div className="craft-ledger-row">
                  <span className="craft-material-name">
                    {result.productIcon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.productIcon} alt="" />
                    ) : (
                      <span className="craft-product-token" />
                    )}
                    <span>
                      {result.productName} ×{formatQuantity(result.expectedOutput)}
                      <small>
                        대성공 기댓값 포함
                        {settings.disposition === "sell" ? " · 판매 수수료 5% 차감" : ""}
                      </small>
                    </span>
                  </span>
                  <span className="craft-positive">+{formatGold(result.revenue)}</span>
                </div>
              </div>
            </div>

            <div className="craft-net-row">
              <span>순수익</span>
              <ProfitText value={result.netProfit} />
            </div>
          </div>

          <div className="craft-method-panel">
            <div className="craft-method-heading">
              <span className="craft-route-icon" />
              <div>
                <h3>최적 제작 방법</h3>
                <p>현재 시세에서 비용이 가장 낮은 준비 순서입니다.</p>
              </div>
            </div>
            {result.exchangeSteps.length > 0 ? (
              <ol>
                {result.exchangeSteps.map((step) => (
                  <li key={`${step.label}-${step.sets}`}>
                    <span>{step.label}</span>
                    <b>{step.sets}세트</b>
                    <small>{step.detail}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="craft-no-exchange">
                재료를 교환하지 않고 바로 준비하는 것이 가장 저렴합니다.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DirectNumberField({
  label,
  description,
  value,
  suffix,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = (next: number) =>
    onChange(Math.min(max, Math.max(min, Number.isFinite(next) ? next : value)));

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      commit(value + (event.deltaY < 0 ? step : -step));
    };
    input.addEventListener("wheel", handleWheel, { passive: false });
    return () => input.removeEventListener("wheel", handleWheel);
  });

  return (
    <label className="craft-setting-field">
      <span className="craft-setting-label">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <div className="craft-number-control">
        <input
          ref={inputRef}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

function SetCountField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const presets = [10, 20, 30, 40];
  const options = presets.includes(value)
    ? presets
    : [...presets, value].sort((a, b) => a - b);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = options.indexOf(value);
      const nextIndex = Math.min(
        options.length - 1,
        Math.max(0, currentIndex + (event.deltaY > 0 ? 1 : -1)),
      );
      onChange(options[nextIndex]);
    };
    select.addEventListener("wheel", handleWheel, { passive: false });
    return () => select.removeEventListener("wheel", handleWheel);
  });

  return (
    <label className="craft-setting-field">
      <span className="craft-setting-label">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <select
        ref={selectRef}
        className="craft-set-select"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {options.map((option) => (
          <option value={option} key={option}>
            {option}세트
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="craft-setting-field craft-choice-field">
      <legend>{label}</legend>
      <div className="craft-choice-grid">
        {options.map((option) => (
          <button
            type="button"
            className={value === option.value ? "active" : ""}
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ProfitText({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={positive ? "craft-profit positive" : "craft-profit negative"}>
      {positive ? "+" : "−"}
      {formatGold(Math.abs(value))}
    </span>
  );
}

function CostText({ value }: { value: number }) {
  return <span className="craft-cost">−{formatGold(value)}</span>;
}

function CraftSkeleton() {
  return (
    <div className="craft-skeleton" aria-label="거래소 가격을 불러오는 중">
      <div />
      <div className="craft-skeleton-grid">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);

const formatPercentage = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);

const formatGold = (value: number) => `${formatNumber(Math.round(value))}G`;

const formatLifeMethod = (lifeName: string) =>
  lifeName === "낚시" ? "낚시로 제작" : `${lifeName}으로 제작`;

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const isCraftMarketResponse = (
  value: CraftMarketResponse | undefined,
): value is CraftMarketResponse =>
  Boolean(
    value &&
      typeof value.updatedAt === "string" &&
      typeof value.stale === "boolean" &&
      value.items &&
      typeof value.items === "object",
  );
