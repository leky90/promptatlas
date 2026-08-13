# LDK-344 — QA remediation for discovery and Composer integration

**Status:** Approved for implementation by the user's request to continue on 2026-08-13

**Owner:** software engineer

**Reviewer:** QA

**Source verdict:** PR #6 review at `5484c536b9c613be58633a950af87c50f07a41b0`

## Problem

The image-first discovery workspace exposes 187 taxonomy primitives, but four defects make the resulting Composer state contradictory or inaccessible: values from a single-select dimension can coexist, an explicit aspect ratio is overridden by fixed framing text, creation can exceed the snapshot limit, and the closed mobile taxonomy drawer remains keyboard-accessible.

## Scope

### In

- Preserve each taxonomy primitive's `dimensionId` through cards, local drafts and validated snapshots.
- Reject a second value from the same single-select dimension while preserving the existing selection and explaining the result to the user.
- Keep the already-approved `style.medium` blend workflow as the explicit exception: multiple style entries remain allowed and continue to require blend acceptance.
- Derive Composer framing from an explicit `composition.aspect-ratio` item; use neutral framing when none is selected.
- Enforce `MAX_COMPOSER_ITEMS` before persisting an addition and expose a specific limit message.
- Make the closed mobile taxonomy drawer inert and hidden from assistive technology, and restore focus to the Taxonomy toggle when it closes.
- Preserve compatibility with pre-existing style-only local drafts and shared snapshots that predate `dimensionId`.

### Out

- Changes to taxonomy source content, primitive generation, image assets or their QA verdicts.
- Redesigning Composer conflict policy beyond the approved `style.medium` blend exception.
- Merge, deployment, analytics, provider generation or video scope.

## Acceptance criteria

1. Adding two different primitives whose canonical `dimensionId` is the same rejects the second item; the first remains in the draft and the user receives dimension-specific feedback.
2. Adding multiple `style.medium` entries remains allowed and produces the existing explicit blend warning.
3. A portrait 4:5 or square 1:1 primitive produces framing that contains that selected ratio and never adds `landscape 3:2`; without an aspect-ratio item, framing remains ratio-neutral.
4. The 91st unique addition is not persisted when the maximum is 90, and the UI reports the limit instead of reporting success.
5. Snapshot validation verifies canonical primitive ID, slug and dimension relationships. Legacy style-only recipes without `dimensionId` remain readable as `style.medium`; new taxonomy items require their canonical dimension.
6. At widths below 960 px, a closed taxonomy drawer is inert and `aria-hidden`; opening removes both states. Closing by button, scrim, Escape or a selected facet restores focus to the Taxonomy toggle.
7. Desktop taxonomy remains available without `inert` or `aria-hidden`.

## Test plan

| Layer | Coverage |
| --- | --- |
| Unit (`node:test`) | Same-dimension rejection, style blend exception, selected/neutral aspect-ratio rendering, 90-item add limit, canonical dimension validation and legacy style compatibility. |
| E2E (`@playwright/test`) | Primitive selection feedback, aspect-ratio output, mobile drawer inert/ARIA/focus lifecycle and desktop availability. |
| BDD | No Gherkin runner is configured; observable acceptance criteria are covered by named unit and Playwright scenarios. |
| Regression | `npm test`, `npm run check`, `npm run build`, `npm run test:e2e` and `git diff --check`. |

## Affected modules

- `src/lib/composer.ts`
- `src/scripts/composer-store.ts`
- `src/scripts/global.ts`
- `src/scripts/discover-ui.ts`
- `src/components/ComposerEntry.astro`
- `src/components/PrimitiveCard.astro`
- `src/components/ComposerWorkspace.astro`
- `tests/composer-domain.test.mjs`
- `tests/discover.spec.ts`
- `tests/responsive.spec.ts`

## Delivery gate

All four open P1/P2 threads must have regression evidence at a new immutable PR head before LDK-344 returns to `In Review / role:qa`. This phase does not merge the PR.
