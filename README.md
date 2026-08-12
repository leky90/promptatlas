# Prompt Atlas by LDKTech

A Vietnamese-first visual reference for 90 image-generation styles. Every style pairs the same structured prompt across ChatGPT and Gemini, publishes both real outputs, and scores them on five consistent criteria.

Live site: [image-styles.ldktech.com](https://image-styles.ldktech.com)

## What is included

- 90 searchable and filterable style entries with one-click prompt copying on every card.
- 180 full comparison images and 180 optimized thumbnails.
- A client-side ChatGPT/Gemini comparison workbench.
- 90 static, indexable detail pages with copyable prompts.
- Per-style scores for prompt adherence, style fidelity, composition, technical quality, and detail integrity.
- Browser-local favorites, responsive layouts, metadata, sitemap, and structured data.
- A versioned Prompt Atlas taxonomy and JSON data contract for expanding the library from image styles into composable image/video prompt primitives.

## Local development

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run check
npm run build
npm run check:image-data
npm run validate:image-data
npm run validate:contract
npm run test:contract
npm run test:e2e
```

## Content and media

The normalized catalog lives in `src/data/styles.json`. Optimized WebP assets and their public manifest live in `public/media/`.

The long-term ontology contract lives in `src/data/taxonomy.v1.json` and `schemas/prompt-atlas.v1.schema.json`. A conforming fixture is in `schemas/examples/`; `scripts/validate-prompt-atlas-data.mjs` enforces its schema and cross-record invariants.

The image-first production projection is `src/data/prompt-atlas.image.v1.json`, governed by `schemas/prompt-atlas.image.v1.schema.json`. It is generated deterministically from the 90-style catalog plus the immutable source-asset inventory in `src/data/legacy-source-assets.v1.json`. Every production build checks that this projection is current, validates all references and rights fields, and verifies the SHA-256 checksum of every published full image and thumbnail.

`scripts/prepare-site-data.mjs` is the local ingest pipeline used to transform the original generation manifests and comparison evaluation from the parent workspace. Those large source outputs are intentionally not duplicated in this deploy repository.

For a controlled re-import of the legacy originals, run `npm run import:legacy-assets -- --source-root /absolute/path/to/output`, review the resulting source manifest, then run `npm run build:image-data`. This imports metadata and checksums only; it never invokes an image API or generation provider.

Current legacy runs are labelled as historical product routes instead of being relabelled as the approved Codex and Nano Banana Pro routes. The next generation harness can add those new route snapshots without corrupting the provenance of the existing 180 outputs. All run records explicitly keep `apiCostUsd: 0`.

## Deployment

The site is a static Astro build deployed to GitHub Pages through `.github/workflows/deploy.yml`. The custom domain is declared in `public/CNAME`.

## Interpretation note

This is a comparison of one output per provider for this specific 90-prompt dataset, not a universal model benchmark. The project is independent and is not affiliated with or endorsed by OpenAI or Google.
