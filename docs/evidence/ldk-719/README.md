# LDK-719 mobile performance lab evidence

This evidence set measures the production build from source revision
`9bfcad6e31cd6b49ed69674b7890fc2e5797c071` on a local Astro preview. It does
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
- Chromium selected through `CHROME_PATH`: 144.0.7558.0. The raw Lighthouse
  environment records `HeadlessChrome/144.0.0.0` as the host agent and
  `Chrome/144.0.0.0 Mobile` as the emulated network agent.

All nine measurements passed. The worst observed values were:

| Route | Worst LCP | Worst CLS |
| --- | ---: | ---: |
| Home | 2,339.05 ms | 0 |
| Discover | 2,480.29 ms | 0.000888 |
| Anatomy | 1,877.91 ms | 0.038296 |

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
CHROME_PATH="$(command -v chromium)" lighthouse http://127.0.0.1:4719/ \
  --chrome-flags="--headless=new" \
  --form-factor=mobile \
  --screen-emulation-mobile \
  --screen-emulation-width=412 \
  --screen-emulation-height=823 \
  --screen-emulation-device-scale-factor=1.75 \
  --throttling-method=simulate \
  --throttling-rtt-ms=150 \
  --throttling-throughput-kbps=1638.4 \
  --throttling-cpu-slowdown-multiplier=4 \
  --output=json \
  --output=html \
  --output-path=.linear-ops/ldk-719/canonical/run-1/home/lighthouse \
  --only-categories=performance,accessibility,best-practices,seo \
  --quiet
```

The uncompressed HTML reports were intentionally not committed: the complete
raw JSON is retained for auditability while avoiding duplicate multi-megabyte
artifacts.
