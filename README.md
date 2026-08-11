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
npm run test:contract
npm run test:e2e
```

## Content and media

The normalized catalog lives in `src/data/styles.json`. Optimized WebP assets and their public manifest live in `public/media/`.

The multimodal expansion contract lives in `src/data/taxonomy.v1.json` and `schemas/prompt-atlas.v1.schema.json`. A conforming image/video fixture is in `schemas/examples/`; the design and migration decisions are documented in `docs/09-taxonomy-and-data-contract.md`. These artifacts are additive and do not yet replace the production `StyleRecord` catalog.

`scripts/prepare-site-data.mjs` is the local ingest pipeline used to transform the original generation manifests and comparison evaluation from the parent workspace. Those large source outputs are intentionally not duplicated in this deploy repository.

## Deployment

The site is a static Astro build deployed to GitHub Pages through `.github/workflows/deploy.yml`. The custom domain is declared in `public/CNAME`.

## Interpretation note

This is a comparison of one output per provider for this specific 90-prompt dataset, not a universal model benchmark. The project is independent and is not affiliated with or endorsed by OpenAI or Google.
