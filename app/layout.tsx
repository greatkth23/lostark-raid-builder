import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "로이어 : 로스트아크 공격대 자동구성",
  description: "멤버와 레이드 진행 현황을 함께 관리하는 로스트아크 공격대 자동구성 도구",
  icons: {
    icon: "/lostark_class_aero_favicon.png",
    shortcut: "/lostark_class_aero_favicon.png",
    apple: "/lostark_class_aero_favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <header className="brand-header">
          <div className="brand-header-inner">
            <Image
              src="/loiar-logotype.svg"
              alt="LOIAR"
              width={290}
              height={105}
              priority
            />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
