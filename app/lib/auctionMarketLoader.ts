const MAX_MARKET_PAGES = 20;

type AuctionMarketPageLoaderOptions = {
  reserveRequests: (cost: number) => Promise<void>;
  fetchPage: (pageNo: number) => Promise<unknown>;
};

export async function loadAuctionMarketPages({
  reserveRequests,
  fetchPage,
}: AuctionMarketPageLoaderOptions) {
  await reserveRequests(1);
  const firstPage = await fetchPage(0);
  const pageCount = getPageCount(firstPage);

  if (pageCount > MAX_MARKET_PAGES) {
    throw new Error("유물 각인서 페이지 수가 허용 범위를 초과했습니다.");
  }

  if (pageCount === 1) return [firstPage];

  await reserveRequests(pageCount - 1);
  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => fetchPage(index + 1)),
  );
  return [firstPage, ...remainingPages];
}

function getPageCount(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("유물 각인서 페이지 정보를 확인하지 못했습니다.");
  }

  const record = payload as Record<string, unknown>;
  const pageSize = Number(record.PageSize);
  const totalCount = Number(record.TotalCount);
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0 ||
    !Number.isSafeInteger(totalCount) ||
    totalCount < 0
  ) {
    throw new Error("유물 각인서 페이지 정보를 확인하지 못했습니다.");
  }

  return Math.max(1, Math.ceil(totalCount / pageSize));
}
