# LDK-345 — Production domain migration

> Hosting amendment — 2026-08-14: the hostname remains unchanged, but its origin moves from GitHub Pages to the prompt-atlas Cloudflare Pages project. See cloudflare-pages-migration.md. The sequence below is retained as the historical domain-cutover record.

## Effective decision

`https://prompt-atlas.ldktech.com` is the sole production hostname for Prompt Atlas. The former `image-styles.ldktech.com` hostname is retired without a redirect; its Cloudflare DNS record must be deleted only after the new hostname, certificate and release smoke checks pass.

## Deployment sequence

1. Build and test the exact `main` revision.
2. Create the proxied Cloudflare CNAME `prompt-atlas.ldktech.com` → `leky90.github.io`.
3. Set the GitHub Pages custom domain to `prompt-atlas.ldktech.com` and require HTTPS.
4. Deploy the same revision through the GitHub Pages workflow.
5. Verify the homepage, discovery, Composer, methodology, sitemap, robots, representative legacy styles, media and canonical/JSON-LD/Open Graph metadata over HTTPS.
6. Delete the `image-styles.ldktech.com` DNS record and verify it no longer resolves through Cloudflare.

## Rollback

Before deleting the old DNS record, rollback is a GitHub Pages deployment rollback plus restoring the previous Pages custom-domain value. After deletion, recovery additionally requires recreating the exact prior proxied CNAME to `leky90.github.io`; no application data migration is involved because the site is static.

## Release evidence

Record the merged commit, GitHub Actions run, Pages custom-domain/certificate state, Cloudflare DNS record IDs and production smoke results in the LDK-345 Linear resource. Do not record credentials or local coordination data.
