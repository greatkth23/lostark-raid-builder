import {
  getCraftMarketData,
  MarketDataError,
} from "../../../../lib/lostArkMarketStore";

export async function GET() {
  try {
    const data = await getCraftMarketData();
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=240",
      },
    });
  } catch (error) {
    if (error instanceof MarketDataError) {
      return Response.json(
        {
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: error.status,
          headers: error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    return Response.json(
      { message: "거래소 가격을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
