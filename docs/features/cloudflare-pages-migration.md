# Cloudflare Pages hosting migration

## Decision

Prompt Atlas is a fully static Astro site. Production hosting moves from GitHub Pages behind Cloudflare proxying to a Cloudflare Pages project connected directly to leky90/promptatlas.

The reference operating model is the local-favorites-by-tui project:

- Cloudflare Pages Git integration owns production deployment;
- the production build command contains the complete quality gate;
- GitHub Actions is retained only as a manual clean-run verifier;
- successful Pages deployments are immutable rollback targets;
- the pages.dev production hostname redirects to the canonical custom domain without catching hash/branch previews.

## Configuration

| Setting | Value |
|---|---|
| Project | prompt-atlas |
| Repository | leky90/promptatlas |
| Production branch | main |
| Root directory | / |
| Build command | npm run verify:pages |
| Output directory | dist |
| Custom domain | prompt-atlas.ldktech.com |

## Cutover sequence

1. Merge the repository configuration and verify npm run verify:pages locally.
2. Create the Git-connected Pages project and require the same build command.
3. Verify a Pages deployment directly, including HTML, CSS, JavaScript, fonts, sitemap and media.
4. Attach prompt-atlas.ldktech.com to the Pages project. Cloudflare replaces the existing CNAME target with prompt-atlas.pages.dev.
5. Purge stale cache and run the full production smoke test.
6. Redirect the bare prompt-atlas.pages.dev hostname to the custom domain while leaving deployment-preview subdomains reachable.
7. Disable GitHub Pages and remove the obsolete deployment branch only after the Cloudflare deployment and rollback target are verified.

## Rollback

Before step 7, DNS can be restored to leky90.github.io. After step 7, rollback is performed inside Cloudflare Pages by selecting any previously successful production deployment, followed by the same production smoke test.

## Acceptance evidence

- exact Git commit and Cloudflare deployment ID;
- Pages project/build configuration and custom-domain state;
- DNS target after cutover;
- production smoke counts for routes, media, stylesheets, scripts and fonts;
- confirmation that the retired hostname remains absent;
- confirmation that GitHub Pages no longer publishes production.
