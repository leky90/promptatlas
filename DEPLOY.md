# Deploy Prompt Atlas

**Production:** `https://prompt-atlas.ldktech.com`

**Hosting:** Cloudflare Pages, static Astro output

**Repository:** `leky90/promptatlas`

## Deployment model

Cloudflare Pages is connected directly to GitHub. A push to `main` starts one production build with this configuration:

| Setting | Value |
|---|---|
| Pages project | `prompt-atlas` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run verify:pages` |
| Build output | `dist` |
| Node version | `.node-version` (`24`) |
| Runtime/functions | None; static assets only |

`npm run verify:pages` runs the unit and contract tests, validates the image data and generation contracts, runs `astro check`, builds the static site, then verifies every referenced `/_astro/` asset exists in `dist`.

GitHub Actions does not publish production. `.github/workflows/verify.yml` is a manual clean-run safety net only. The production gate is the Cloudflare Pages build command, so a failed gate cannot create a new deployment.

## Local workflow

```bash
npm ci
npm run verify:pages
git config core.hooksPath .githooks
```

The pre-push hook runs the same Pages gate only when pushing `main`. It is a local guard; the non-bypassable production guard remains the Cloudflare build.

## Post-deploy verification

```bash
npm run smoke:production-domain
```

The smoke test checks:

- six core HTML routes and every sitemap route;
- canonical metadata and the retired hostname boundary;
- representative media;
- every emitted stylesheet and JavaScript module referenced by core routes;
- referenced Astro font assets and their response content types.

Do not accept a deployment based only on route `200` responses. CSS, JavaScript and font assets must also return `2xx` with the expected content type.

## Domain and canonical-host policy

- `prompt-atlas.ldktech.com` is the only canonical production hostname.
- The custom domain is attached to the `prompt-atlas` Pages project.
- The zone record points to `prompt-atlas-6p0.pages.dev` and is proxied by Cloudflare.
- The bare `prompt-atlas-6p0.pages.dev` hostname redirects to the canonical domain while hash/branch preview hostnames remain available for QA.
- `image-styles.ldktech.com` remains retired with no DNS record.

## Rollback

Cloudflare Pages keeps successful production deployments as immutable rollback targets. Use **Workers & Pages → prompt-atlas → Deployments → Rollback to this deployment**, then rerun the production smoke test. A rollback does not require a rebuild or DNS change.

During the one-time cutover only, the previous GitHub Pages origin is the emergency fallback: restore the DNS CNAME target to `leky90.github.io` and re-enable the known-good Pages deployment. After Cloudflare production is verified and GitHub Pages is disabled, normal rollback is entirely within Cloudflare Pages.
