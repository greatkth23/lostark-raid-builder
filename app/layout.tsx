import type { Metadata } from "next";
import "./globals.css";

const AERO_ICON_URL = "/lostark_class_aero.png";

export const metadata: Metadata = {
  title: "롸이어 - 로스트아크 공격대 자동구성",
  description:
    "멤버, 레이드 진행 현황, 골드 획득을 함께 관리하는 로스트아크 공격대 자동구성 도구",
  icons: {
    icon: AERO_ICON_URL,
    shortcut: AERO_ICON_URL,
    apple: AERO_ICON_URL,
  },
  openGraph: {
    title: "롸이어 - 로스트아크 공격대 자동구성",
    description:
      "멤버, 레이드 진행 현황, 골드 획득을 함께 관리하는 로스트아크 공격대 자동구성 도구",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "롸이어 - 로스트아크 공격대 자동구성",
    description:
      "멤버, 레이드 진행 현황, 골드 획득을 함께 관리하는 로스트아크 공격대 자동구성 도구",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
