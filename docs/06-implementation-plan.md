# 06 · Implementation plan

## Stack

- Astro 7 + TypeScript, output static.
- Vanilla client scripts cho filter/favorite/copy/compare; không cần React runtime.
- CSS variables + component CSS; Fontsource tự host font.
- `sharp` trong script chuẩn bị media; không chạy ở browser.

Lý do: 90 route SEO và nội dung tĩnh là phần lớn; interaction nhỏ, dataset 90 records đủ chạy client-side tức thì.

## Route/component map

```text
src/
├── components/
│   ├── SiteHeader.astro
│   ├── SiteFooter.astro
│   ├── PairCard.astro
│   ├── ScoreRail.astro
│   ├── PromptBlock.astro
│   └── Icon.astro
├── layouts/BaseLayout.astro
├── pages/
│   ├── index.astro
│   ├── compare.astro
│   ├── methodology.astro
│   ├── 404.astro
│   └── styles/[slug].astro
├── data/styles.json
├── lib/styles.ts
└── styles/global.css
```

## Data schema

```ts
type StyleRecord = {
  id: number;
  slug: string;
  name: string;
  title: string;
  family: StyleFamily;
  sourcePrompt: string;
  generationPrompt: string;
  images: {
    chatgpt: { full: string; thumb: string; width: number; height: number };
    gemini: { full: string; thumb: string; width: number; height: number };
  };
  scores: { chatgpt: ProviderScores; gemini: ProviderScores };
  winner: "ChatGPT" | "Gemini" | "Hòa";
  observation: string;
  related: string[];
};
```

`scripts/prepare-site-data.mjs` đọc manifest/evaluation ở workspace, phân family deterministically, tạo related styles theo family/score proximity, chuyển media và tạo manifest.

## State

- Search/filter: URL query (`q`, `family`, `saved`) để refresh/share giữ context.
- Favorites: `localStorage['prompt-atlas:favorites:v1']` array slug.
- Copy toast: client ephemeral, `role=status`.
- Compare selection: query `style`; fallback về `glitch-art`.
- Reset: xóa query filter, không xóa favorites trừ khi user chủ động bỏ từng item.

## Responsive mapping

- ≥1100px: 3-column paired cards, hero 5/7 split, detail 2-column.
- 720–1099px: 2-column gallery, hero/detail stack có paired row.
- <720px: 1-column; nav disclosure; compare images stack; chips horizontal; prompt copy full-width.

Không dùng hover là cơ chế duy nhất. Card text và actions luôn hiện.

## Accessibility

- Landmarks, skip link, một H1/route, heading order.
- Search label visible; filter buttons `aria-pressed`; results live region.
- Focus outline 2px acid + 2px offset trên nền ink/paper.
- Controls chính ≥44px; favorite có accessible name thay đổi.
- Toast `role=status`; reduced motion loại bỏ transitions/reveals.
- Provider/winner luôn có text/icon, không chỉ màu.

## Design tokens → implementation

- Role colors/tokens trong `:root`; dark strip dùng riêng chứ không có dark-mode ngầm.
- Border 1px ink/20%; radius 2–4px.
- `--font-display`, `--font-mono`; tabular numbers cho scores.
- Spacing theo 4/8/12/20/32/48/72.
- Signature seam là pseudo-element/score badge, không có gradient.

## Static/deployment boundary

- Không backend, API, form submit hay AI generation.
- GitHub Actions build từ repo root (`site/` sẽ là repo root khi publish).
- Astro `site: 'https://image-styles.ldktech.com'`, không `base`.
- `public/CNAME` chứa custom domain.
- Cloudflare CNAME DNS-only → `leky90.github.io`.

## QA và acceptance

- `npm run check`, `npm run build` pass.
- Validator của skill pass hoặc findings được giải quyết/ghi chú.
- Browser desktop 1440×1000, tablet 820×1180, mobile 390×844.
- Test search success/empty/reset, family filters, favorites persistence, copy success/error fallback, compare query, all internal links.
- Console errors = 0, broken local media/404 = 0.
- Lighthouse hoặc tương đương: accessibility/performance inspected; không yêu cầu điểm giả định.
- Visual review representative route trước khi propagate, sau đó final review.

