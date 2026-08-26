import type { Metadata } from "next";
import AuctionCalculator from "../components/AuctionCalculator";

export const metadata: Metadata = {
  title: "경매 입찰 계산기 | 로이어",
  description:
    "레이드 인원과 거래소 시세를 기준으로 판매 및 직접 사용 목적의 적정 경매 입찰가를 계산합니다.",
};

export default function AuctionPage() {
  return <AuctionCalculator />;
}
