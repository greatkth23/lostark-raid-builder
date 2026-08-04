import type { Metadata } from "next";
import CraftCalculator from "../components/CraftCalculator";

export const metadata: Metadata = {
  title: "영지 제작 계산기 | 로이어",
  description:
    "생활 재료 시세와 교환 경로를 비교해 아비도스 융화 재료의 기대 수익을 계산합니다.",
};

export default function CraftPage() {
  return <CraftCalculator />;
}
