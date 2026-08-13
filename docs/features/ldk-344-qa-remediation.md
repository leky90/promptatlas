# LDK-344 — QA remediation for discovery and Composer integration

**Status:** Implemented; awaiting second QA re-review

**Owner:** software engineer

**Reviewer:** QA

**Source verdict:** PR #6 reviews at `5484c536b9c613be58633a950af87c50f07a41b0` and `d913c4fa622116259bfc78cbb864849b9e98aeff`

## Problem

The image-first discovery workspace exposes 187 taxonomy primitives. The first remediation fixed four contradictory or inaccessible UI/add-path behaviors, but QA found that correctly checksummed imported or hash-shared snapshots can still contain multiple canonical values from one non-blendable dimension. That supported entry point can therefore reintroduce the same contradictory Composer state that the add path now rejects.

## Scope

### In

- Preserve each taxonomy primitive's `dimensionId` through cards, local drafts and validated snapshots.
- Reject a second value from the same single-select dimension while preserving the existing selection and explaining the result to the user.
- Keep the already-approved `style.medium` blend workflow as the explicit exception: multiple style entries remain allowed and continue to require blend acceptance.
- Derive Composer framing from an explicit `composition.aspect-ratio` item; use neutral framing when none is selected.
- Enforce `MAX_COMPOSER_ITEMS` before persisting an addition and expose a specific limit message.
- Make the closed mobile taxonomy drawer inert and hidden from assistive technology, and restore focus to the Taxonomy toggle when it closes.
- Preserve compatibility with pre-existing style-only local drafts and shared snapshots that predate `dimensionId`.
- Enforce the same non-blendable dimension uniqueness rule when validating imported files and hash-shared snapshots, while preserving the `style.medium` exception.

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
8. A correctly checksummed import or hash-share containing two canonical values from the same non-blendable dimension is rejected before rendering or forking.
9. A correctly checksummed import or hash-share containing multiple canonical `style.medium` values remains valid and retains the explicit blend workflow.

## Test plan

| Layer | Coverage |
| --- | --- |
| Unit (`node:test`) | Same-dimension rejection across add, import and hash-share paths; style blend exception; selected/neutral aspect-ratio rendering; 90-item add limit; canonical dimension validation and legacy style compatibility. |
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

All five P1/P2 review threads, including the import/share validation finding, must have regression evidence at a new immutable PR head before LDK-344 returns to `In Review / role:qa`. This phase does not merge the PR.

## Implementation evidence

- Composer items now retain canonical `dimensionId`; all non-style dimensions are single-select, while `style.medium` preserves the approved explicit blend workflow.
- Prompt framing derives from an explicit aspect-ratio primitive and otherwise remains ratio-neutral.
- The add path rejects the 91st item before persistence and reports the 90-item limit.
- Snapshot validation checks ID, slug and dimension together; legacy style-only drafts/snapshots are normalized to `style.medium`.
- Imported files and hash-shared snapshots now reject repeated canonical non-blendable dimensions before rendering or forking.
- The `style.medium` exception remains valid across import and hash-share paths and still surfaces the explicit blend workflow.
- Mobile facets use `hidden`, `inert` and `aria-hidden` while closed and restore focus to the Taxonomy toggle; desktop facets remain available.
- Verification at the final local head: 14 unit + 47 contract tests passed; 23/23 Playwright desktop/mobile tests passed; 187/187 primitive assets validated; Astro reported 0 errors/warnings/hints; 96 static pages built; `git diff --check` passed.
- Live browser verification at 1440×1000 and 390×844 reproduced dimension feedback, portrait 4:5 framing, closed/open/closed drawer isolation, focus restoration and zero console errors.
- Live hash-share verification rejected a correctly checksummed shallow/deep depth-of-field conflict with zero rendered items, while a fresh two-style snapshot rendered both styles, kept the blend warning and produced zero console errors.
