# LDK-716 fresh production readiness observation

- Run: `2026-09-05T08-22-08Z-a3a1356`
- Observed: `2026-09-05T08:35:51Z`
- Environment: production
- Target revision: `git:a3a135660c72778b00a588f6deb4e42a7a1f468f`
- Immutable deployment: `https://763aab42.prompt-atlas-6p0.pages.dev`
- Production: `https://prompt-atlas.ldktech.com`

The run revalidated the complete 53-checkpoint pre-launch scope against the same exact candidate as the preceding run. Still-fresh evidence for 50 unchanged checkpoints remains effective in the append-only ledger; this run adds fresh source, build, browser, live-serving and prerequisite evidence and supersedes the three previously unresolved operational controls.

## Fresh technical checks

- `npm ci`: passed.
- `npm run verify:pages`: passed. The run completed 32 unit tests, 68 contract tests, all data checks, Astro check with zero errors/warnings/hints, a 234-page build, and validation of 234 HTML documents plus referenced assets.
- `npm audit --omit=dev --json`: zero production vulnerabilities.
- `gitleaks 8.30.1`: five commits and about 14.6 KB scanned for the exact candidate slice; no leaks found.
- `npx playwright test --workers=1`: 112/112 passed in 2.8 minutes.
- Fresh cross-browser Spotlight journey: Firefox and WebKit both passed using one worker.
- `PRODUCTION_BASE_URL=https://prompt-atlas.ldktech.com npm run smoke:production-domain`: valid; 6 core routes, 231 sitemap routes, 3 media assets, 1 stylesheet, 3 scripts and 8 fonts passed.

The default six-worker E2E command first timed out one accessibility-heavy test, then a repeat timed out two different accessibility-heavy tests. Each timed-out test passed when isolated (8.2 seconds for the first; 6.7 and 9.2 seconds for the other two), and the complete one-worker run passed. This is recorded as a resource-contention/test-harness note, not a reproduced product defect; no source or timeout was changed.

## Live serving identity

Production and immutable deployment returned HTTP 200 and identical SHA-256 response bodies:

| Route | SHA-256 |
| --- | --- |
| `/` | `c8ab88e1fa19324836056f70268a128ee92ae53c4da6f2ee868b9bfcf19d89fd` |
| `/review/` | `712cfb0aaf10851a23d3d5e87522defdb3de4e111380364677b16d2b7fbd4e89` |
| `/health.json` | `6489d6d7a33c5d40e18fc61eeb6c34c341279ee61816394dde5189aa4ad8fae5` |

Production omitted `X-Robots-Tag`; the immutable deployment returned `X-Robots-Tag: noindex`. This establishes the current body equivalence without inferring deployment identity from repository state alone.

## Resolved operational controls

### Rollback drill

LDK-788 records an actual production rollback to the approved target and restore to deployment `763aab42` for candidate `a3a1356`, followed by two successful checks 33 seconds apart. Independent Delivery Verification passed 7/7. This supplies the approval-bound rollback evidence for the current production scope.

Evidence: https://linear.app/ldktech/document/ldk-788-production-rollback-refinement-and-maintenance-decision-b5c38aada43e

### Uptime monitor

LDK-789 records UptimeRobot monitor `803909485` on production using HEAD every five minutes, a 30-second timeout, redirect following and 2xx/3xx success. The approved mailbox received both TEST DOWN and TEST UP receipts, and independent verification passed.

Evidence: https://linear.app/ldktech/document/ldk-789-prompt-atlas-uptime-monitor-configuration-and-evidence-12e5629a3a56

## Remaining failed control

### Domain and DNS renewal

LDK-790 proves a registrar expiry date of 2026-11-18, auto-renew enabled, and a redacted responsible contact. On 2026-09-05 the expiry is 74 days away, so the parent readiness checkpoint's `expiry-more-than-90-days-out` acceptance criterion is false. The redacted evidence also does not explicitly establish that the recovery email is correct.

LDK-790 is correctly Done against its narrower issue contract; that does not override the stricter LDK-716 checkpoint contract.

Evidence: https://linear.app/ldktech/document/ldk-790-registrar-renewal-evidence-dated-redacted-record-d533d1b71f1d

## Gate conclusion

The fresh readiness verdict is `go-with-risks`, not the `go` required by LDK-716's Definition of Done. This Tech Lead phase has no authority to renew the domain, spend money, mutate registrar/DNS settings, waive the control, or amend the approved contract. LDK-716 therefore returns to Refinement for an Owner/CPO decision.
