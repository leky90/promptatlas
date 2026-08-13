# Prompt Atlas by LDKTech

A Vietnamese-first visual reference for 90 image-generation styles. Every style pairs the same structured prompt across ChatGPT and Gemini, publishes both real outputs, and scores them on five consistent criteria.

Live site: [prompt-atlas.ldktech.com](https://prompt-atlas.ldktech.com)

## What is included

- 90 searchable and filterable style entries with one-click prompt copying on every card.
- 180 full comparison images and 180 optimized thumbnails.
- A client-side ChatGPT/Gemini comparison workbench.
- 90 static, indexable detail pages with copyable prompts.
- Per-style scores for prompt adherence, style fidelity, composition, technical quality, and detail integrity.
- Browser-local favorites, responsive layouts, metadata, sitemap, and structured data.
- A browser-local Prompt Composer with ordered recipes, explicit blend warnings, immutable share snapshots, and checksummed JSON import/export.
- A versioned Prompt Atlas taxonomy and JSON data contract for expanding the library from image styles into composable image/video prompt primitives.

## Local development

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run verify:pages
npm run test:e2e
npm run smoke:production-domain
```

## Content and media

The normalized catalog lives in `src/data/styles.json`. Optimized WebP assets and their public manifest live in `public/media/`.

The long-term ontology contract lives in `src/data/taxonomy.v1.json` and `schemas/prompt-atlas.v1.schema.json`. A conforming fixture is in `schemas/examples/`; `scripts/validate-prompt-atlas-data.mjs` enforces its schema and cross-record invariants.

The image-first production projection is `src/data/prompt-atlas.image.v1.json`, governed by `schemas/prompt-atlas.image.v1.schema.json`. It is generated deterministically from the 90-style catalog plus the immutable source-asset inventory in `src/data/legacy-source-assets.v1.json`. Every production build checks that this projection is current, validates all references and rights fields, and verifies the SHA-256 checksum of every published full image and thumbnail.

`scripts/prepare-site-data.mjs` is the local ingest pipeline used to transform the original generation manifests and comparison evaluation from the parent workspace. Those large source outputs are intentionally not duplicated in this deploy repository.

For a controlled re-import of the legacy originals, run `npm run import:legacy-assets -- --source-root /absolute/path/to/output`, review the resulting source manifest, then run `npm run build:image-data`. This imports metadata and checksums only; it never invokes an image API or generation provider.

Current legacy runs are labelled as historical product routes instead of being relabelled as the approved Codex and Nano Banana Pro routes. The next generation harness can add those new route snapshots without corrupting the provenance of the existing 180 outputs. All run records explicitly keep `apiCostUsd: 0`.

Composer drafts use versioned UUID records in `localStorage`; shared recipes use an immutable URL hash and never write to draft storage until the user explicitly forks them. Recipes whose absolute share URL exceeds 6,000 characters remain copyable and exportable as lossless `.promptatlas.json` files.

## Deployment

The site is a static Astro build deployed through the Cloudflare Pages Git integration. Pushes to `main` run `npm run verify:pages`; only a successful build can become production. `prompt-atlas.ldktech.com` is the sole canonical hostname. See [`DEPLOY.md`](DEPLOY.md) for build settings, smoke checks and rollback.

## Interpretation note

This is a comparison of one output per provider for this specific 90-prompt dataset, not a universal model benchmark. The project is independent and is not affiliated with or endorsed by OpenAI or Google.
