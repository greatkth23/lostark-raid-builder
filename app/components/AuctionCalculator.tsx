"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import lostarkGoldIcon from "../../lostark_gold.png";
import { calculateAuctionBid } from "../lib/auctionCalculator";
import {
  selectAuctionEngravingsAtOrAbove,
  type AuctionMarketItem,
  type AuctionMarketResponse,
} from "../lib/auctionMarket";
import {
  formatAuctionEngravingName,
  getAuctionHorizontalWheelDelta,
} from "../lib/auctionSearch";

const MARKET_CACHE_KEY = "loiar-auction-market-v1";
const MARKET_AUTO_REFRESH_INTERVAL_MS = 60_000;
const QUICK_ENGRAVING_MIN_PRICE = 10_000;
const PARTY_PRESETS = [4, 8, 16] as const;
const GOLD_ICON_URL =
  typeof lostarkGoldIcon === "string" ? lostarkGoldIcon : lostarkGoldIcon.src;

type MarketError = { message?: string; retryAfterSeconds?: number };
type PartyMode = "preset" | "manual";

export default function AuctionCalculator() {
  const [market, setMarket] = useState<AuctionMarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partyMode, setPartyMode] = useState<PartyMode>("preset");
  const [presetParticipants, setPresetParticipants] = useState(8);
  const [manualParticipants, setManualParticipants] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const quickItemsRef = useRef<HTMLDivElement>(null);

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/lostark/market/auction", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as AuctionMarketResponse & MarketError;
      if (!response.ok) {
        throw new Error(
          payload.retryAfterSeconds
            ? `${payload.message ?? "유물 각인서 시세를 불러오지 못했습니다."} ${payload.retryAfterSeconds}초 후 다시 시도해 주세요.`
            : payload.message ?? "유물 각인서 시세를 불러오지 못했습니다.",
        );
      }
      if (!isAuctionMarketResponse(payload)) {
        throw new Error("유물 각인서 시세 응답 형식이 올바르지 않습니다.");
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
          : "유물 각인서 시세를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let hasFreshCache = false;
      try {
        const cached = window.localStorage.getItem(MARKET_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            fetchedAt?: number;
            market?: AuctionMarketResponse;
          };
          if (isAuctionMarketResponse(parsed.market)) {
            setMarket(parsed.market);
            const age = Date.now() - (parsed.fetchedAt ?? 0);
            if (age >= 0 && age < MARKET_AUTO_REFRESH_INTERVAL_MS) {
              setLoading(false);
              hasFreshCache = true;
            }
          }
        }
      } catch {
        window.localStorage.removeItem(MARKET_CACHE_KEY);
      }

      if (!hasFreshCache) void loadMarket();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMarket]);

  useEffect(() => {
    const list = quickItemsRef.current;
    if (!list) return;

    const handleWheel = (event: WheelEvent) => {
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? list.clientWidth
          : 1;
      const delta = getAuctionHorizontalWheelDelta(
        event.deltaX * unit,
        event.deltaY * unit,
        event.ctrlKey,
      );
      if (delta === 0 || list.scrollWidth <= list.clientWidth) return;

      const previous = list.scrollLeft;
      const maximum = list.scrollWidth - list.clientWidth;
      list.scrollLeft = Math.min(maximum, Math.max(0, previous + delta));
      if (list.scrollLeft !== previous) event.preventDefault();
    };

    list.addEventListener("wheel", handleWheel, { passive: false });
    return () => list.removeEventListener("wheel", handleWheel);
  }, []);

  const selectedItem = useMemo(
    () => market?.items.find((item) => item.id === selectedItemId) ?? null,
    [market, selectedItemId],
  );
  const quickItems = useMemo(
    () => selectAuctionEngravingsAtOrAbove(market?.items ?? [], QUICK_ENGRAVING_MIN_PRICE),
    [market],
  );
  const participants =
    partyMode === "preset"
      ? presetParticipants
      : parsePositiveInteger(manualParticipants, 2);
  const effectivePrice = selectedItem?.currentMinPrice ?? parsePositiveInteger(manualPrice, 1);
  const calculation =
    participants && effectivePrice
      ? calculateAuctionBid(effectivePrice, participants)
      : null;

  const selectEngraving = (item: AuctionMarketItem) => {
    setSelectedItemId(item.id);
    setManualPrice("");
    setCopyStatus("");
  };

  const copyBid = async (value: number, label: string) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopyStatus(`${label} ${formatGold(value)}를 복사했습니다.`);
    } catch {
      setCopyStatus("입찰가를 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    }
  };

  return (
    <main className="auction-page">
      <div className="auction-shell">
        <header className="auction-page-heading">
          <h1>경매 입찰 계산기</h1>
          <button
            className="auction-refresh-button"
            type="button"
            onClick={() => void loadMarket()}
            disabled={loading}
          >
            <span className={loading ? "auction-reload spinning" : "auction-reload"} />
            시세 갱신
          </button>
        </header>

        {market ? (
          <div className="auction-market-status">
            <span className="auction-status-dot" />
            거래소 최저가 반영 ·{" "}
            {formatUpdatedAt(market.updatedAt)} 갱신
          </div>
        ) : null}

        {error ? (
          <div className="auction-error" role="alert">
            <div>
              <strong>시세 정보를 준비하지 못했습니다.</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => void loadMarket()}>
              다시 시도
            </button>
          </div>
        ) : null}

        <div className="auction-workspace">
          <section className="auction-input-panel" aria-labelledby="auction-input-title">
            <div className="auction-panel-heading">
              <span>01</span>
              <div>
                <h2 id="auction-input-title">경매 조건</h2>
                <p>레이드 인원과 아이템 가격을 입력하세요.</p>
              </div>
            </div>

            <fieldset className="auction-fieldset auction-party-fieldset">
              <legend>레이드 인원수</legend>
              <div className="auction-party-presets">
                {PARTY_PRESETS.map((size) => {
                  const active = partyMode === "preset" && presetParticipants === size;
                  return (
                    <button
                      type="button"
                      className={active ? "active" : ""}
                      key={size}
                      aria-pressed={active}
                      onClick={() => {
                        setPartyMode("preset");
                        setPresetParticipants(size);
                        setCopyStatus("");
                      }}
                    >
                      {size}인
                    </button>
                  );
                })}
              </div>
              <label className="auction-number-field">
                <span>인원수 직접 입력</span>
                <div className={partyMode === "manual" ? "active" : ""}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    step={1}
                    value={manualParticipants}
                    placeholder="2명 이상"
                    onFocus={() => setPartyMode("manual")}
                    onChange={(event) => {
                      setPartyMode("manual");
                      setManualParticipants(event.target.value);
                      setCopyStatus("");
                    }}
                  />
                  <span>명</span>
                </div>
              </label>
            </fieldset>

            <fieldset className="auction-fieldset auction-price-fieldset">
              <legend>가격 직접 입력</legend>
              <label className="auction-number-field auction-direct-price-field">
                <div className={!selectedItem && manualPrice ? "active" : ""}>
                  <input
                    aria-label="가격 직접 입력"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={manualPrice}
                    placeholder="가격 입력"
                    onChange={(event) => {
                      setManualPrice(event.target.value);
                      if (event.target.value) {
                        setSelectedItemId(null);
                      }
                      setCopyStatus("");
                    }}
                  />
                  <span>G</span>
                </div>
              </label>
            </fieldset>

            <fieldset className="auction-fieldset auction-engraving-fieldset">
              <legend>유물 각인서</legend>

              {selectedItem ? (
                <div className="auction-selected-item">
                  <div>
                    {selectedItem.icon ? (
                      // Official API image URL; ordinary img avoids hostname coupling.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedItem.icon} alt="" />
                    ) : null}
                    <span>
                      <small>선택된 각인서</small>
                      <strong>{formatAuctionEngravingName(selectedItem.name)}</strong>
                    </span>
                  </div>
                  <span>
                    <small>현재 최저가</small>
                    <strong>{formatGold(selectedItem.currentMinPrice)}</strong>
                  </span>
                </div>
              ) : null}

              <div
                className="auction-quick-items"
                aria-label="최저가 10,000G 이상 유물 각인서"
                ref={quickItemsRef}
              >
                {loading && !market
                  ? Array.from({ length: 5 }, (_, index) => (
                      <span className="auction-top-skeleton" key={index} />
                    ))
                  : quickItems.map((item) => {
                      const active = selectedItem?.id === item.id;
                      return (
                        <button
                          type="button"
                          className={active ? "active" : ""}
                          key={item.id}
                          aria-pressed={active}
                          onClick={() => selectEngraving(item)}
                        >
                          <span>{formatAuctionEngravingName(item.name)}</span>
                          <strong>{formatGold(item.currentMinPrice)}</strong>
                        </button>
                      );
                    })}
              </div>

            </fieldset>
          </section>

          <section className="auction-results-panel" aria-labelledby="auction-results-title">
            <div className="auction-panel-heading">
              <span>02</span>
              <div>
                <h2 id="auction-results-title">계산 결과</h2>
                <p>입찰가를 누르면 숫자가 복사됩니다.</p>
              </div>
            </div>

            {calculation && effectivePrice && participants ? (
              <div className="auction-result-content">
                <article className="auction-result-card sell">
                  <div className="auction-result-card-heading">
                    <span>판매 목적</span>
                  </div>
                  <button
                    type="button"
                    className="auction-bid-button"
                    onClick={() => void copyBid(calculation.sellBid, "판매 목적 입찰가")}
                  >
                    <small>적정 입찰가</small>
                    <strong>{formatGold(calculation.sellBid)}</strong>
                    <span>클릭하여 복사</span>
                  </button>
                  <dl className="auction-result-ledger">
                    <div>
                      <dt>내가 가져가는 금액</dt>
                      <dd>{formatGold(calculation.sellTakeHome)}</dd>
                    </div>
                    <div>
                      <dt>1인당 분배금</dt>
                      <dd>{formatGold(calculation.sellDistribution)}</dd>
                    </div>
                  </dl>
                </article>

                <article className="auction-result-card use">
                  <div className="auction-result-card-heading">
                    <span>직접 사용</span>
                  </div>
                  <button
                    type="button"
                    className="auction-bid-button"
                    onClick={() => void copyBid(calculation.useBid, "직접 사용 입찰가")}
                  >
                    <small>적정 입찰가</small>
                    <strong>{formatGold(calculation.useBid)}</strong>
                    <span>클릭하여 복사</span>
                  </button>
                  <dl className="auction-result-ledger single">
                    <div>
                      <dt>1인당 분배금</dt>
                      <dd>{formatGold(calculation.useDistribution)}</dd>
                    </div>
                  </dl>
                </article>

                <div className="auction-result-note">
                  <span
                    className="auction-gold-icon"
                    style={{ backgroundImage: `url(${GOLD_ICON_URL})` }}
                    aria-hidden="true"
                  />
                  판매 목적 입찰가는 거래소 수수료와 10% 판매 여유를 반영합니다.
                </div>
              </div>
            ) : (
              <div className="auction-empty-result">
                <span className="auction-empty-chart" aria-hidden="true" />
                <h3>가격을 입력하거나 각인서를 선택해 주세요.</h3>
                <p>
                  {partyMode === "manual" && !participants
                    ? "2명 이상의 올바른 인원수를 입력하면 계산 결과가 표시됩니다."
                    : "기본 8인 기준으로 판매와 직접 사용 입찰가를 바로 비교할 수 있습니다."}
                </p>
              </div>
            )}
            <p className="auction-copy-status" role="status" aria-live="polite">
              {copyStatus}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function parsePositiveInteger(value: string, minimum: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(value);

const formatGold = (value: number) => `${formatNumber(value)}G`;

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function isAuctionMarketResponse(
  value: AuctionMarketResponse | undefined,
): value is AuctionMarketResponse {
  return Boolean(
    value &&
      typeof value.updatedAt === "string" &&
      typeof value.stale === "boolean" &&
      Array.isArray(value.items) &&
      value.items.every(
        (item) =>
          item &&
          Number.isSafeInteger(item.id) &&
          typeof item.name === "string" &&
          typeof item.icon === "string" &&
          Number.isFinite(item.bundleCount) &&
          Number.isSafeInteger(item.currentMinPrice),
      ),
  );
}
