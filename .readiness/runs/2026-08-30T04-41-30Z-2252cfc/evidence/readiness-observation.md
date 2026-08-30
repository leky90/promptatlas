# LDK-716 production readiness observation

- Run: `2026-08-30T04-41-30Z-2252cfc`
- Target revision: `git:2252cfc540cf2ee6b8f0056e0e3479e50ba61259`
- Environment: `https://prompt-atlas.ldktech.com`
- Observed: 2026-08-30 04:41–05:01 UTC
- Authority: read-only production/provider inspection only; no provider, credential, spend, mailbox-send, or production mutation.

## Candidate identity and repository gates

- Local `main` and live `origin/main` both resolved to `2252cfc540cf2ee6b8f0056e0e3479e50ba61259` before the ticket worktree was created.
- `npm ci` completed with zero reported vulnerabilities.
- `npm run verify:pages` passed: 58/58 Node tests, Astro check with 0 errors/warnings/hints, 234 static pages built, and distribution assets validated.
- `npm run test:e2e` passed 104/104 Playwright tests across desktop and mobile Chromium.
- `npm audit --omit=dev --json` reported 0 vulnerabilities across 196 production dependencies and 383 total dependencies.
- Target-tree signature scan found 0 files containing the selected private-key, AWS, GitHub-token, or production-key patterns; 0 tracked `.env` files were present. History/entropy scanning was not performed.

## Live production observations

- `/`, `/discover/`, `/anatomy/`, `/privacy/`, `/terms/`, `/about/`, `/robots.txt`, and `/sitemap-index.xml` returned HTTP 200.
- A nonexistent route returned HTTP 404 with the dedicated Vietnamese Prompt Atlas error page.
- HTTP redirected once to HTTPS with 301.
- Production HTML included `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`.
- No `Content-Security-Policy` or `Strict-Transport-Security` header was observed.
- Hashed CSS returned `Cache-Control: public, max-age=14400, must-revalidate`; HTML returned `public, max-age=0, must-revalidate`.
- `/health` returned HTTP 404. No uptime-monitor receipt, alert read-back, or client error-tracking test-event receipt was available within this run.
- Registrar auto-renew, recovery contact, and expiry evidence were not available.

## Browser, accessibility, and performance

- A live built-in-browser walkthrough covered `/`, `/discover/`, and `/anatomy/` at 1440×900 and responsive widths 1280, 768, and 375.
- Search Spotlight, keyboard selection, help dialog, Discover filtering, list mode, prompt-fragment copy, local Composer add, Anatomy detail navigation, and A→B→A state restoration worked.
- The walkthrough ran for 7.79 minutes, captured at least two screenshots per primary route, and read network and console evidence per route.
- No warning or error emitted by the `prompt-atlas.ldktech.com` origin during the walkthrough. Extension-origin warnings were excluded as environmental noise.
- Responsive checks found no document horizontal overflow at 375, 768, or 1280 on the three primary routes; the repository's mobile/zoom/focus regression matrix also passed.
- Local axe-core 4.13.0 returned zero violations on all three primary routes. Automated results had 2–3 incomplete/manual-review items per route and do not establish full WCAG conformance.
- Local Lighthouse 13.4.1 production results:

| Route | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 98 | 100 | 100 | 100 | 2001 ms | 0 | 73 ms |
| `/discover/` | 100 | 100 | 100 | 100 | 1706 ms | 0.0009 | 0 ms |
| `/anatomy/` | 99 | 100 | 100 | 100 | 1624 ms | 0 | 6 ms |

- Field Core Web Vitals, Firefox, WebKit, and Safari were not measured in this pre-launch run.

## Crawl, metadata, and canonical integrity

- The build contained 234 HTML files and 233 sitemap URLs. A complete local internal-link scan found 0 broken internal paths.
- Every built HTML page had a title, description, and canonical; no `noindex` occurrence was found. All 233 JSON-LD blocks parsed successfully.
- `dist/review/index.html` lacked the default Open Graph title/image pair.
- Three sitemap entries disagreed with their page canonical:
  - `/review/` canonicalized to `/review`, while production redirects `/review` back to `/review/`.
  - `/styles/lego/` canonicalized to `/styles/interlocking-toy-brick-diorama/`.
  - `/styles/studio-ghibli/` canonicalized to `/styles/gentle-hand-painted-fantasy-animation/`.
- The two legacy style aliases were not linked from another built HTML page and remained in the sitemap. Their responses were real content pages, not soft 404s.

## Provider and owner evidence read-back

- Live LDK-722 was `Done` and carried the owner-visible verified-property screenshot for the exact Prompt Atlas production property.
- Live LDK-723 was `Done` and carried both the exact sitemap submission receipt and the processed-success read-back.
- Live LDK-720 recorded a binding CPO artifact-review pass and accepted the bounded content/provenance limitations.
- Live LDK-721 recorded the owner identity, public contact route, internal escalation route, and support SLA.
- Live LDK-724 recorded merged/deployed verification for this exact candidate and the legal/about/contact surfaces. Its evidence explicitly did not send a mailbox message and did not verify mailbox delivery/read-back.
- Therefore `contact-works` remains blocked: a public `mailto:` path and declared SLA do not prove that the contact channel receives within SLA, and this run had no authority to send a real message.
- Bing Webmaster remained unverified/unmeasured. Analytics is disabled for this product, so GA4 and Looker checkpoints remain not applicable.

## Disposition

This is a completed assessment run, not a GO. Required failures or unknowns remain in canonical/sitemap integrity, custom 500 evidence, and end-to-end contact delivery. Recommended gaps remain for CSP/HSTS, health/uptime/error monitoring, browser compatibility, registrar renewal evidence, rollback-drill approval, and hashed-asset cache duration.
