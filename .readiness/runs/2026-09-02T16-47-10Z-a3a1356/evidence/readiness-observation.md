# LDK-716 exact-candidate production readiness observation

- Run: `2026-09-02T16-47-10Z-a3a1356`
- Target revision: `git:a3a135660c72778b00a588f6deb4e42a7a1f468f`
- Production deployment: `763aab42.prompt-atlas-6p0.pages.dev`
- Canonical environment: `https://prompt-atlas.ldktech.com`
- Observed: 2026-09-02 16:38–16:48 UTC
- Authority: source verification and read-only production/provider evidence only. No provider, DNS, credential, spend, monitoring, error-tracking, mailbox, deployment, or production mutation was performed.

## Candidate identity

- `origin/main` resolved to `a3a135660c72778b00a588f6deb4e42a7a1f468f`.
- The immutable Cloudflare Pages deployment and canonical production root returned byte-identical HTML: SHA-256 `c8ab88e1fa19324836056f70268a128ee92ae53c4da6f2ee868b9bfcf19d89fd`.
- The accepted exact-candidate assurance package is [LDK-739](https://linear.app/ldktech/document/ldk-739-prompt-atlas-exact-candidate-production-assurance-package-8d7d167eca2d).
- The accepted exact-candidate approval register is [LDK-740](https://linear.app/ldktech/document/prompt-atlas-exact-candidate-readiness-approval-register-ldk-740-13cdd98f3d13).
- The verified production contact round trip is [LDK-741](https://linear.app/ldktech/document/ldk-741-prompt-atlas-public-contact-mailbox-round-trip-record-49b72072f4b4).

## Fresh source gates

- `npm ci` completed.
- `npm run verify:pages` passed: 32 unit tests, 68 contract tests, Astro check over 92 files with 0 errors/warnings/hints, 234 pages built, 231 sitemap routes validated, and distribution assets validated.
- `npm run test:e2e` passed 112/112 Playwright tests in 57.3 seconds.
- `PRODUCTION_BASE_URL=https://prompt-atlas.ldktech.com node scripts/smoke-production-domain.mjs` passed: 6 core routes, 231 sitemap routes, 3 media checks, 1 stylesheet check, 3 script checks, and 8 font checks.
- `npm audit --omit=dev --json` reported 0 vulnerabilities across 196 production dependencies.
- Gitleaks scanned the exact candidate history slice with redaction enabled and found no leaks.

## Fresh production read-back

- The canonical root returned HTTP 200 and the immutable deployment returned the same body.
- HTTP redirected to HTTPS with 301.
- A nonexistent path returned HTTP 404 with the dedicated Prompt Atlas error page.
- `/health.json` returned HTTP 200 with `Cache-Control: no-store` and SHA-256 `6489d6d7a33c5d40e18fc61eeb6c34c341279ee61816394dde5189aa4ad8fae5`.
- Production returned CSP, HSTS (`max-age=31536000; includeSubDomains`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy, and a restrictive permissions policy.
- The canonical/sitemap normalization, metadata defaults, legacy-route handling, asset caching, and health endpoint fixes accepted in LDK-739 remain present in the exact deployed candidate.

## Accepted exact-candidate evidence

- LDK-739 records passing exact-candidate repository, production, responsive, accessibility, SEO, metadata, health, cache, and security checks.
- LDK-739 records focused Firefox and WebKit coverage plus a real Safari 26.6.2 route and keyboard walkthrough. The headless WebKit Spotlight path timed out and remains an explicitly disclosed medium residual risk; it did not reproduce in real Safari.
- LDK-737 accepted the static-host treatment for the custom 500 checkpoint: the dedicated 404 is verified, while there is no bounded application 500 surface to trigger safely.
- LDK-740 records CPO acceptance for ownership/contact routing, final content, and third-party rights on this exact SHA and deployment.
- LDK-741 records the exact one-message public contact mailbox round trip and delivery-verification pass.
- Existing GSC evidence proves the exact production property is verified and the canonical sitemap was submitted successfully: [verified-property receipt](https://uploads.linear.app/8f8045fd-dbac-4ace-aefa-859b6f0e3367/b9465b42-d846-4507-a5e6-baf399b49639/c85f6771-9ec0-48aa-95c4-27695a3e570f) and [processed-sitemap receipt](https://uploads.linear.app/8f8045fd-dbac-4ace-aefa-859b6f0e3367/03a48b43-55cb-42c3-af19-21b7c1720f84/adff94e4-a8cb-40d3-8596-a31577929189).
- Analytics is intentionally disabled, no outbound web form exists, and Prompt Atlas is an accountless local-first static product; GA4, Looker, email-auth, backup/restore, and form-submission checkpoints are therefore not applicable.

## Unresolved production controls

The assessment cannot honestly produce `gate=go` under the current LDK-716 contract:

1. `rollback-drill` — recommended approval is still pending. Read-only rollback-path evidence exists, but no live rollback drill was authorized or performed.
2. `uptime-monitor` — recommended task is blocked. No monitor/alert receipt was available, and creating one would be an external provider mutation.
3. `domain-dns-renewal` — recommended check remains unknown. Registrar expiry, auto-renew, and recovery-contact evidence was unavailable without credentialed provider access.

Error tracking remains absent, but the canonical checkpoint is not applicable because the recorded product facts declare no production server logic. Bing Webmaster remains an advisory-only unmeasured item. Neither affects the gate.

## Disposition

All required checkpoints are passed, accepted, or not applicable on the exact candidate. The three unresolved recommended controls make the canonical verdict `go-with-risks`, not `go`. LDK-716 therefore cannot be submitted for CPO terminal acceptance or moved to Done without an Owner/CPO decision that either authorizes separate production-control work or amends the contract with explicit scope-bound waivers.
