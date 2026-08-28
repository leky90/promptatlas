# LDK-719 mobile performance lab evidence

This evidence set measures the production build from source revision
`0add1afc984ff2fa1067e19f4978b30be12c1ccb` on a local Astro preview. It does
not represent a production deployment or a Cloudflare measurement.

## Declared lab contract

- Routes: Home `/`, Discover `/discover/`, Anatomy `/anatomy/`.
- Budget: LCP <= 2,500 ms and CLS <= 0.1. LDK-719 requires Home and Discover
  LCP plus Discover and Anatomy CLS; the evidence applies both guards to all
  three routes.
- Repetitions: three sequential cold Lighthouse processes per route. Runs were
  not parallelized, so they did not contend for the same local CPU.
- Auth: none.
- Build/server: `npm run build`, then Astro static preview on
  `http://127.0.0.1:4719`.
- Lighthouse: 13.4.1, mobile form factor, 412 x 823 CSS pixels, DPR 1.75,
  simulated throttling, 150 ms RTT, 1,638.4 Kbps throughput, 4x CPU slowdown.
- Chromium CLI present during the run: 144.0.7558.0. The raw Lighthouse
  environment records its observed host and emulated user agents.

All nine measurements passed. The worst observed values were:

| Route | Worst LCP | Worst CLS |
| --- | ---: | ---: |
| Home | 2,104.41 ms | 0 |
| Discover | 2,254.46 ms | 0.000888 |
| Anatomy | 1,801.14 ms | 0.038296 |

## Raw reports

`raw/run-{1,2,3}/{home,discover,anatomy}.report.json.gz` contains the complete
Lighthouse JSON report for every measurement. Files are gzip-compressed with
timestamp-free headers; `measurements.json` records both the uncompressed raw
SHA-256 and the committed gzip SHA-256.

Inspect a report without changing it:

```sh
gzip -dc docs/evidence/ldk-719/raw/run-1/home.report.json.gz | jq '.audits["largest-contentful-paint"], .audits["cumulative-layout-shift"]'
```

The measurement command was equivalent to:

```sh
lighthouse http://127.0.0.1:4719/ \
  --chrome-path="$(command -v chromium)" \
  --chrome-flags="--headless=new" \
  --output=json \
  --output=html \
  --output-path=.linear-ops/ldk-719/canonical/run-1/home/lighthouse \
  --only-categories=performance,accessibility,best-practices,seo \
  --quiet
```

The uncompressed HTML reports were intentionally not committed: the complete
raw JSON is retained for auditability while avoiding duplicate multi-megabyte
artifacts.
