import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로스트아크 공격대 자동구성",
  description: "로스트아크 레이드 공격대 자동구성 로컬 웹앱",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
