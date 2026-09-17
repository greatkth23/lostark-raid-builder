"use client";

import { getLopecCharacterUrl } from "../lib/lopec";

type LopecCharacterLinkProps = {
  name: string;
  fallback?: string;
  className?: string;
};

export default function LopecCharacterLink({
  name,
  fallback = "캐릭터명",
  className,
}: LopecCharacterLinkProps) {
  const trimmedName = name.trim();
  const label = trimmedName || fallback;
  const resolvedClassName = ["character-name-link", className]
    .filter(Boolean)
    .join(" ");

  if (!trimmedName) {
    return <span className={resolvedClassName}>{label}</span>;
  }

  return (
    <a
      className={resolvedClassName}
      href={getLopecCharacterUrl(trimmedName)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {label}
    </a>
  );
}
