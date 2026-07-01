# Typography & UI Style Guide

## 1. Font

### Primary Font

```css
font-family: Inter, "Inter Fallback";
```

* 기본 영문 폰트는 `Inter`입니다.
* `Inter Fallback`은 Arial 기반 fallback입니다.
* 한글 UI에서는 별도 한글 폰트를 함께 지정하는 것을 권장합니다.

### Recommended Korean Font Stack

```css
font-family: Inter, Pretendard, "Noto Sans KR", system-ui, sans-serif;
```

---

## 2. Text Scale

| Token         | Size | Line Height | Usage             |
| ------------- | ---: | ----------: | ----------------- |
| `text-[9px]`  |  9px |           - | 초소형 상태 표시         |
| `text-[10px]` | 10px |           - | 작은 배지, 태그         |
| `text-[11px]` | 11px |           - | 보조 배지, 난이도 표시     |
| `text-xs`     | 12px |        16px | 보조 정보, 메타 텍스트     |
| `text-[13px]` | 13px |           - | 중간 보조 텍스트         |
| `text-sm`     | 14px |        20px | 기본 UI 텍스트, 버튼, 목록 |
| `text-base`   | 16px |        24px | 카드 제목, 주요 본문      |
| `text-lg`     | 18px |        28px | 섹션 제목             |
| `text-xl`     | 20px |        28px | 주요 그룹 제목          |
| `text-2xl`    | 24px |        32px | 페이지 제목            |
| `text-3xl`    | 30px |        36px | 큰 헤더              |
| `text-4xl`    | 36px |        40px | 랜딩/강조 헤더          |

### Recommended Usage

* 기본 텍스트: `14px / 20px`
* 보조 정보: `12px / 16px`
* 카드 제목: `16px / 24px`
* 섹션 제목: `18px / 28px`
* 페이지 제목: `24px / 32px`

---

## 3. Font Weight

| Token           | Weight | Usage           |
| --------------- | -----: | --------------- |
| `font-normal`   |    400 | 일반 본문           |
| `font-medium`   |    500 | 버튼, 이름, 중요 수치   |
| `font-semibold` |    600 | 카드 제목, 활성 탭, 배지 |
| `font-bold`     |    700 | 페이지 제목, 주요 헤더   |

### Recommended Usage

* 일반 텍스트: `400`
* 버튼/이름/수치: `500`
* 카드 제목/태그: `600`
* 페이지 타이틀: `700`

---

## 4. Line Height & Letter Spacing

| Token             |    Value | Usage            |
| ----------------- | -------: | ---------------- |
| `leading-none`    |        1 | 배지, 아이콘 옆 짧은 텍스트 |
| `leading-tight`   |     1.25 | 제목, 압축형 UI       |
| 기본 line-height    |      1.5 | 일반 본문            |
| `leading-relaxed` |    1.625 | 긴 설명문            |
| `tracking-tight`  | -0.025em | 큰 제목             |
| `tracking-wide`   |  0.025em | 라벨, 배지, 보조 텍스트   |

---

## 5. Color Tokens

### Light Mode

| Token                | Value     | Usage        |
| -------------------- | --------- | ------------ |
| `background`         | `#FFFFFF` | 전체 배경        |
| `foreground`         | `#020817` | 기본 텍스트       |
| `card`               | `#FFFFFF` | 카드 배경        |
| `primary`            | `#0F172A` | 주요 버튼, 강조 요소 |
| `primary-foreground` | `#F8FAFC` | 주요 버튼 텍스트    |
| `secondary`          | `#F1F5F9` | 보조 버튼 배경     |
| `muted`              | `#F1F5F9` | 비활성/보조 배경    |
| `muted-foreground`   | `#64748B` | 보조 텍스트       |
| `accent`             | `#F1F5F9` | hover, 선택 배경 |
| `border`             | `#E2E8F0` | 기본 테두리       |
| `destructive`        | `#EF4444` | 삭제, 위험 액션    |

### Dark Mode

| Token                | Value     | Usage        |
| -------------------- | --------- | ------------ |
| `background`         | `#020817` | 전체 배경        |
| `foreground`         | `#F8FAFC` | 기본 텍스트       |
| `card`               | `#020817` | 카드 배경        |
| `primary`            | `#F8FAFC` | 주요 버튼        |
| `primary-foreground` | `#0F172A` | 주요 버튼 텍스트    |
| `secondary`          | `#1E293B` | 보조 버튼 배경     |
| `muted`              | `#1E293B` | 비활성/보조 배경    |
| `muted-foreground`   | `#94A3B8` | 보조 텍스트       |
| `accent`             | `#1E293B` | hover, 선택 배경 |
| `border`             | `#1E293B` | 기본 테두리       |
| `destructive`        | `#7F1D1D` | 삭제, 위험 액션    |

---

## 6. Accent Colors

| Purpose | Color                 | Usage               |
| ------- | --------------------- | ------------------- |
| Amber   | `#D97706` / `#FBBF24` | 골드, 중요 수치, 경고성 강조   |
| Orange  | `#EA580C`             | 딜러, 공격 역할, 주황 계열 태그 |
| Green   | `#16A34A`             | 서포트, 성공, 완료 상태      |
| Blue    | `#2563EB`             | 링크, 정보성 강조          |
| Indigo  | `#4F46E5`             | 주요 포인트, 선택 상태       |
| Purple  | `#9333EA`             | 특수 상태, 보조 강조        |
| Red     | `#DC2626`             | 오류, 삭제, 위험          |
| Discord | `#5865F2`             | Discord 연동/브랜드 요소   |

---

## 7. Radius

| Token          |  Value | Usage          |
| -------------- | -----: | -------------- |
| `rounded-sm`   |    4px | 작은 배지          |
| `rounded`      |    4px | 기본 소형 요소       |
| `rounded-md`   |    6px | 버튼, 입력창        |
| `rounded-lg`   |    8px | 카드, 팝오버        |
| `rounded-xl`   |   12px | 큰 카드           |
| `rounded-full` | 9999px | pill 배지, 원형 버튼 |

### Base Radius

```css
--radius: 0.5rem; /* 8px */
```

---

## 8. Spacing Scale

| Token | Value |
| ----- | ----: |
| `0.5` |   2px |
| `1`   |   4px |
| `1.5` |   6px |
| `2`   |   8px |
| `2.5` |  10px |
| `3`   |  12px |
| `4`   |  16px |
| `5`   |  20px |
| `6`   |  24px |
| `8`   |  32px |
| `10`  |  40px |
| `12`  |  48px |
| `16`  |  64px |
| `20`  |  80px |

### Recommended Usage

* 아이콘과 텍스트 간격: `4px ~ 6px`
* 버튼 내부 padding: `8px ~ 12px`
* 카드 내부 padding: `16px ~ 24px`
* 섹션 간격: `24px ~ 40px`

---

## 9. Component Typography

| Component       |   Font Size |    Weight | Color                             |
| --------------- | ----------: | --------: | --------------------------------- |
| Page Title      |        24px |       700 | `foreground`                      |
| Section Title   |        18px |       600 | `foreground`                      |
| Card Title      |        16px |       600 | `foreground`                      |
| Body Text       |        14px |       400 | `foreground`                      |
| Button Text     |        14px |       500 | context-based                     |
| Meta Text       |        12px |       400 | `muted-foreground`                |
| Badge Text      | 10px ~ 12px |       600 | role/status color                 |
| Navigation Text |        14px | 400 / 600 | `muted-foreground` / `foreground` |

---

## 10. Interaction

### Hover

* 기본 hover 배경: `accent`
* 주요 버튼 hover: `primary / 90%`
* 위험 버튼 hover: `destructive / 90%`
* 텍스트 링크 hover: underline 또는 primary color

### Focus

```css
focus-visible:ring-2;
focus-visible:ring-ring;
focus-visible:ring-offset-2;
```

* 키보드 접근성을 위해 focus ring을 유지합니다.
* 입력창, 버튼, 선택 컴포넌트에 동일하게 적용합니다.

### Disabled

```css
disabled:opacity-50;
disabled:pointer-events-none;
disabled:cursor-not-allowed;
```

* 비활성 상태는 투명도와 커서 상태로 표현합니다.

---

## 11. Visual Style Summary

이 UI는 Tailwind CSS와 shadcn/ui 계열 토큰을 기반으로 한 관리형 대시보드 스타일입니다.

### Key Characteristics

* 작은 글자 크기 중심의 고밀도 정보 UI
* `14px` 기본 텍스트와 `12px` 보조 텍스트 중심
* `500~600` weight를 활용한 명확한 계층 구조
* 카드, 배지, 버튼 중심의 컴포넌트 구성
* Light/Dark mode를 모두 고려한 토큰 기반 색상 체계
* muted 색상을 활용한 절제된 보조 정보 표현
* amber, orange, green 계열로 역할과 상태를 구분

---

## 12. Recommended Design Tokens

```css
:root {
  --font-body: Inter, Pretendard, "Noto Sans KR", system-ui, sans-serif;

  --text-caption: 12px;
  --text-body: 14px;
  --text-card-title: 16px;
  --text-section-title: 18px;
  --text-page-title: 24px;

  --line-caption: 16px;
  --line-body: 20px;
  --line-card-title: 24px;
  --line-section-title: 28px;
  --line-page-title: 32px;

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
}
```
