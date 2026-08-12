# Image generation harness

LDK-337 introduces a reproducible, image-only harness for the two approved product routes:

- `codex-image-generation`: Codex `image_gen.imagegen`. The tool does not expose an immutable model version, so every manifest records model identity as `unavailable` with the evidence source and reason.
- `gflow-nano-pro`: `gflow image t2i` pinned to the provider alias `GEM_PIX_2/nano-pro` and the configured gflow CLI version.

The harness does not use OpenAI or Google APIs, does not enable video generation, and enforces an API cost of USD 0. gflow execution consumes the signed-in product's generation quota only after an explicit acknowledgement.

## Reproducibility contract

The JSON Schema at `schemas/image-generation-harness.v1.schema.json` validates three immutable document types: preregistered config, deterministic plan, and per-attempt evidence. A plan preserves:

- the test-case, recipe and dataset versions;
- exact English prompt text and SHA-256 digest;
- route/model identity evidence and adapter version;
- requested, applied and unsupported settings without silent normalization;
- three independent repeat cells per route;
- original output path, raw provider response and hashes;
- moderation state, outcome, quota mode and zero API cost;
- all attempts, with no best-of selection.

The approved benchmark-wide policy targets 72 planned outputs per route and allows at most 14 technical retries overall. Each individual cell has at most one retry, and only `transport`, `corrupt-output`, or `provider-transient` failures qualify. Refusal, moderation, valid low-adherence output, or aesthetic preference never qualifies for regeneration. Batch orchestration must enforce the 14-retry aggregate cap; the adapter enforces the one-retry cell cap.

## Safe dry run

The checked-in smoke config exercises planning only and never creates an image:

```sh
npm run generation:plan -- --config schemas/examples/image-generation-harness.v1.config.json --check-deterministic
```

To persist a preregistered plan, keep it in the ignored artifact staging area:

```sh
npm run generation:plan -- \
  --config schemas/examples/image-generation-harness.v1.config.json \
  --check-deterministic \
  --output .artifacts/generation-runs/smoke/plan.json
```

Validate any config, plan, or attempt manifest with:

```sh
npm run generation:validate -- --file .artifacts/generation-runs/smoke/plan.json
```

## gflow adapter

Inspecting the installed CLI is read-only and checks version, catalog model, alias and supported aspect ratios:

```sh
npm run generation:inspect-gflow
```

Real generation is intentionally gated. The command below is the only execution path and requires a deliberate product-quota acknowledgement. It rejects environment drift, API tools, video commands, unsupported required settings and output paths outside `.artifacts`.

```sh
npm run generation:execute-gflow -- \
  --plan .artifacts/generation-runs/smoke/plan.json \
  --cell cell.test.image.harness-smoke.v1.gflow-nano-pro.r1 \
  --output .artifacts/generation-runs/smoke/gflow-r1-attempt-1.json \
  --acknowledge-product-quota
```

The adapter never retries automatically. For a second attempt, provide the immutable failed manifest and its qualifying class:

```sh
npm run generation:execute-gflow -- \
  --plan .artifacts/generation-runs/smoke/plan.json \
  --cell cell.test.image.harness-smoke.v1.gflow-nano-pro.r1 \
  --attempt 2 \
  --previous .artifacts/generation-runs/smoke/gflow-r1-attempt-1.json \
  --retry-class provider-transient \
  --output .artifacts/generation-runs/smoke/gflow-r1-attempt-2.json \
  --acknowledge-product-quota
```

## Codex adapter

Codex tool calls cannot be initiated by a repository Node process. The adapter therefore exposes a deliberate request/record boundary. First print the exact tool request:

```sh
npm run generation:record-codex -- \
  --plan .artifacts/generation-runs/smoke/plan.json \
  --cell cell.test.image.harness-smoke.v1.codex-image-generation.r1 \
  --request
```

Run that request through Codex, stage the untouched image and raw response under the cell's `.artifacts` directory, then record them:

```sh
npm run generation:record-codex -- \
  --plan .artifacts/generation-runs/smoke/plan.json \
  --cell cell.test.image.harness-smoke.v1.codex-image-generation.r1 \
  --image .artifacts/generation-runs/PLAN_ID/CELL_ID/attempt-1.png \
  --response .artifacts/generation-runs/PLAN_ID/CELL_ID/attempt-1.codex-response.json \
  --started-at 2026-08-12T03:00:00Z \
  --completed-at 2026-08-12T03:00:30Z \
  --output .artifacts/generation-runs/PLAN_ID/CELL_ID/attempt-1.json
```

The recorder verifies the image is readable, records dimensions and hashes the original bytes plus response evidence. It does not infer an unexposed Codex model identifier.

Attempt paths are immutable: adapters fail when an output or raw-response record already exists. Re-running a cell therefore requires an explicitly authorized second-attempt path and qualifying first-attempt evidence, never an overwrite.

## Scope boundary

This change supplies adapters, contracts and a reproducible smoke plan. It does not execute the approved benchmark. The frozen 24-case benchmark matrix and batch manifests are delivered separately, after which 24 cases × 3 repeats produce the policy's 72 planned outputs per route.
