import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

describe("플레이어 하단 액션 반응형 배치", () => {
  it("640px 이하에서 자동 등록·원정대 추가는 동일한 첫 줄, 플레이어 삭제는 전체 너비의 둘째 줄을 사용한다", () => {
    const mobileRule = stylesheet.slice(
      stylesheet.search(
        /@media \(max-width: 640px\) \{\r?\n  \.member-player-tabs/,
      ),
    );

    expect(mobileRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(mobileRule).toMatch(/player-delete-button[\s\S]*grid-row: 2/);
    expect(mobileRule).toMatch(/player-delete-button[\s\S]*grid-column: 1 \/ -1/);
    expect(mobileRule).toMatch(/player-footer-label\s*\{\s*display: inline/);
  });

  it("641px부터 720px까지 세 하단 액션을 한 줄에 유지한다", () => {
    const tabletRule = stylesheet.slice(
      stylesheet.indexOf("@media (min-width: 641px) and (max-width: 720px)"),
    );

    expect(tabletRule).toContain("flex-wrap: nowrap");
    expect(tabletRule).toContain("white-space: nowrap");
  });
});
