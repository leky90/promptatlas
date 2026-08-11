# 07 — QA report

Date: 2026-08-11  
Target: `https://image-styles.ldktech.com`

## Build integrity

- `npm run check`: 0 errors, 0 warnings, 0 hints.
- `npm run build`: successful static build with 94 HTML pages.
- Output includes: home, compare workbench, methodology, 90 style detail pages, and 404.
- Media: 180 full WebP images, 180 WebP thumbnails, one 1200×630 social cover, and a public manifest.
- Total optimized public media: approximately 33 MB (source assets remain outside the deploy project).

## Automated browser QA

Command: `npm run test:e2e`

Result after the UI/UX remediation pass: 10/10 Playwright tests passed.

Covered behaviors:

- 90 cards render in the atlas.
- Diacritic-tolerant search, family filters, empty-state recovery, and URL state.
- Favorites persist in local storage and work with the saved-only filter.
- Compare workbench loads a style from the query string and moves to adjacent records.
- Detail pages expose both full outputs and copy the structured prompt.
- Every catalog card can copy its prompt directly.
- All 90 detail routes respond successfully.
- All 360 published full/thumbnail media URLs respond successfully.
- Mobile navigation and primary search/compare flows work at 390×844.
- Methodology anchor links clear the sticky mobile header.
- Axe found no serious or critical accessibility violations on home, compare, detail, or methodology pages, including color contrast.

## Visual QA

Inspected representative screens at:

- Desktop: 1440×1000.
- Tablet breakpoint behavior: 820 px rules and two-column catalog layout.
- Mobile: 390×844.

Visual fingerprint confirmed:

- Warm paper canvas, black editorial surfaces, acid-lime inspection marks.
- ChatGPT is consistently coded in vermilion; Gemini in cobalt blue.
- Paired specimen seam is the primary signature element.
- Instrument Sans provides expressive editorial headlines; IBM Plex Mono handles measurements, filters, and scores.
- Layout remains legible without hover and all interactive targets have visible keyboard focus.

## Performance and media

- Catalog cards use lightweight thumbnails with native lazy loading.
- Hero and active comparison/detail images use eager/high-priority loading only where useful.
- Full images are requested on detail and compare routes rather than loading all 180 full outputs on the atlas.
- Width and height are present to reduce layout shift.
- Site has no backend, authentication, database, or runtime API dependency.

## Known limits

- Each style compares one output per provider; generation variance is not measured.
- Scores apply to this specific 90-prompt dataset and should not be treated as a universal model benchmark.
- Favorites are browser-local and do not sync between devices.
- The source generations use different native aspect ratios; detail and compare views therefore use `object-fit: contain` to preserve the complete frames.

## Deployment verification

- Public repository: `https://github.com/leky90/promptatlas`.
- GitHub Pages workflow run `31491054525`: completed successfully.
- Custom domain CNAME: `image-styles.ldktech.com` → `leky90.github.io` (Cloudflare DNS-only).
- GitHub Pages certificate: approved for `image-styles.ldktech.com`; HTTPS enforcement enabled.
- Live HTTPS checks returned 200 for home, compare, methodology, a representative detail page, sitemap, robots, and media manifest.
- A live-domain Chromium screenshot confirmed that the deployed comparison workbench matches the QA build.

## Skill and helper routing

- Build workflow followed the `build-static-demo` artifact contract: brief → research → concept → sitemap → content → media plan → implementation → QA.
- No backend or database helper was needed; the content model is a generated static JSON collection.
- Existing project images were used as core media; no decorative image generation was necessary.
- Deployment uses the official Astro GitHub Pages action and a DNS-only Cloudflare CNAME.
