"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/raid", label: "공격대", icon: "/icons/users.svg", kind: "raid" },
  { href: "/craft", label: "제작", icon: "/icons/puzzle.svg", kind: "craft" },
] as const;

export default function GlobalHeader() {
  const pathname = usePathname();

  return (
    <header className="brand-header">
      <div className="brand-header-inner">
        <Link className="brand-link" href="/" aria-label="LOIAR 공격대 홈">
          <Image
            src="/loiar-logotype.svg"
            alt="LOIAR"
            width={290}
            height={105}
            priority
          />
        </Link>
        <nav className="service-navigation" aria-label="서비스 메뉴">
          {NAV_ITEMS.map((item) => {
            const active =
              item.kind === "raid"
                ? pathname === "/" || pathname.startsWith("/raid")
                : pathname.startsWith("/craft");

            return (
              <Link
                className={active ? "active" : ""}
                href={item.href}
                key={item.kind}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className="service-nav-icon"
                  style={{ "--service-icon": `url(${item.icon})` } as React.CSSProperties}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
