# 모바일 플레이어 하단 액션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버 목록 플레이어 하단 액션을 640px 이하에서는 텍스트가 있는 두 줄 그리드로, 641px~720px에서는 줄바꿈 없는 한 줄로 표시한다.

**Architecture:** DOM과 이벤트 핸들러는 그대로 두고 `app/globals.css`의 가장 마지막 모바일 보정 규칙만 교체한다. 정적 CSS 계약 테스트로 두 breakpoint의 배치·텍스트 노출 규칙을 고정해 이후 회귀를 막는다.

**Tech Stack:** React, TypeScript, CSS media queries, Vitest (Node 환경), Vinext, Cloudflare Workers

## Global Constraints

- 640px 초과 데스크톱 UI와 버튼 동작, `aria-label`, `title`, 13px 글꼴을 변경하지 않는다.
- 640px 이하는 자동 등록·원정대 추가를 첫 줄 동일 너비로, 플레이어 삭제를 둘째 줄 전체 너비로 표시한다.
- 641px~720px은 세 버튼과 텍스트를 한 줄로 유지하며 가로 스크롤과 텍스트 줄바꿈을 만들지 않는다.
- 기존 연한 빨간 삭제 버튼 outline을 유지한다.

---

### Task 1: 하단 액션 반응형 CSS 계약 테스트

**Files:**
- Create: `app/lib/memberFooterLayout.test.ts`
- Modify: `app/globals.css:4820-4874`
- Test: `app/lib/memberFooterLayout.test.ts`

**Interfaces:**
- Consumes: `app/globals.css`의 `.member-player-panel > .player-footer-actions` 선택자
- Produces: 640px 이하 2행 그리드와 641px~720px 한 줄 배치를 검증하는 Vitest 테스트

- [x] **Step 1: Write the failing test**

```ts
it("uses a two-row grid with visible labels at 640px and below", () => {
  expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  expect(css).toMatch(/player-delete-button[\s\S]*grid-column: 1 \/ -1/);
  expect(css).not.toMatch(/member-player-panel \.player-footer-label\s*\{\s*display: none/);
});

it("keeps all footer actions on one line from 641px through 720px", () => {
  expect(css).toMatch(/@media \(min-width: 641px\) and \(max-width: 720px\)[\s\S]*flex-wrap: nowrap/);
  expect(css).toMatch(/@media \(min-width: 641px\) and \(max-width: 720px\)[\s\S]*white-space: nowrap/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.CMD run app/lib/memberFooterLayout.test.ts --config vitest.config.ts`

Expected: FAIL because the current mobile rule hides labels and constrains each action to a 31px icon button.

- [x] **Step 3: Write minimal implementation**

```css
@media (max-width: 640px) {
  .member-player-panel > .player-footer-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .member-player-panel > .player-footer-actions > .player-delete-button {
    grid-row: 2;
    grid-column: 1 / -1;
  }
}

@media (min-width: 641px) and (max-width: 720px) {
  .member-player-panel > .player-footer-actions { flex-direction: row; flex-wrap: nowrap; }
  .member-player-panel > .player-footer-actions button { white-space: nowrap; }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.CMD run app/lib/memberFooterLayout.test.ts --config vitest.config.ts`

Expected: PASS with both responsive CSS contracts satisfied.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/lib/memberFooterLayout.test.ts
git commit -m "모바일 플레이어 하단 액션 배치 개선"
```

### Task 2: 전체 검증과 배포

**Files:**
- Modify: `dist/server/wrangler.json` (Vinext 빌드 산출물만 갱신될 수 있음)
- Test: `app/lib/memberFooterLayout.test.ts`, 기존 `app/**/*.test.ts`

**Interfaces:**
- Consumes: Task 1에서 고정한 CSS 계약
- Produces: 테스트 통과, 프로덕션 빌드, Cloudflare Workers 배포 및 `main` 원격 반영

- [x] **Step 1: Run the complete test suite**

Run: `node_modules/.bin/vitest.CMD run --config vitest.config.ts`

Expected: PASS for all existing domain and responsive-CSS tests.

- [x] **Step 2: Build the production artifact**

Run: `node_modules/.bin/vinext.CMD build`

Expected: exit code 0 and `dist/server/wrangler.json` generated.

- [x] **Step 3: Check upstream before publishing**

Run: `git fetch origin main && git diff --name-status HEAD..origin/main`

Expected: no unexpected upstream changes requiring integration.

- [ ] **Step 4: Push the verified commit**

Run: `git push origin HEAD:main`

Expected: the responsive layout commit is available on GitHub `main`.

- [ ] **Step 5: Deploy and verify**

Run: `node_modules/.bin/wrangler.CMD deploy --config dist/server/wrangler.json`

Expected: deployment succeeds and the Worker responds at `https://loiar.rmarkfcl.workers.dev`.
