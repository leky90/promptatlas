# LDK-334 — Prompt Composer and discovery integration

**Status:** Implemented; awaiting QA re-review
**Owner:** software engineer
**Reviewer:** QA
**Depends on:** LDK-333, LDK-335, LDK-346 (accepted/done)

## Problem

Prompt Atlas currently lets people search 90 image styles and copy one complete prompt, but it does not let them assemble an ordered recipe, understand conflicts, preserve work locally, or share an immutable composition. LDK-334 turns the existing static image-first catalog into a no-account composition workflow while retaining the accepted editorial research-instrument direction.

## Scope

### In

- Add a static `/composer/` route with an empty guided state, an ordered recipe, compatibility/conflict guidance, deterministic text preview, copy, share, import/export and reset actions.
- Let people add the 90 production style primitives from existing catalog cards and style detail pages; duplicate adds focus the existing item instead of duplicating it.
- Persist UUID-keyed working drafts using `pa:drafts:v1:{draftId}`, `pa:drafts:index:v1` and `pa:drafts:active:v1` without accounts or server state.
- Preserve explicit item order and provide visible, keyboard-operable move-up, move-down and remove controls.
- Treat two or more style/medium selections as an explicit blend warning. Keep every selection, name the conflicting pair(s), and require a user action—accept the blend or remove a style—rather than silently resolving it.
- Create versioned, immutable share snapshots at `/composer/#r=<payload>`. Opening a snapshot performs zero local-storage writes; **Tiếp tục chỉnh sửa** forks a new UUID and records `sourceSnapshotHash`.
- Cap the complete share URL at 6,000 characters. Oversized recipes retain full prompt copy and lossless `.promptatlas.json` export/import.
- Expose a visible Composer count in primary navigation and a compact mobile tray after the first item is added.
- Use the accepted semantic colors, labeled icons, 44 px targets, live-region feedback and `prefers-reduced-motion` behavior.

### Out (deferred)

- New taxonomy content beyond the 90 production style primitives; the expanded primitive library is a separate content/pipeline scope.
- The `/discover` taxonomy shell, hierarchical facets and 90/90 legacy redirect manifest owned by LDK-344.
- Accounts, cloud sync, server persistence, AI generation, benchmark execution, analytics activation, domain migration or deployment.
- Active video controls or empty video routes. Video remains deferred pending a separate provider/model decision.
- Drag-only reordering. Pointer drag may be added later; the accessible button/keyboard path is normative for this issue.

## Acceptance criteria

1. From a catalog card or style detail, **Thêm vào prompt** creates/updates a local UUID draft, preserves discovery context and exposes the exact item in `/composer/` after navigation or refresh.
2. Adding the same primitive twice does not duplicate it; the existing recipe item is identified and focused/announced.
3. Composer ordering remains stable across reload, move-up/down operations and prompt generation; removing/resetting items never affects a different draft.
4. Two or more style primitives produce a named blend warning with explicit **Dùng như pha trộn** and remove choices. Selections are never silently deleted, and accepted blend intent persists.
5. The rendered prompt is deterministic and human-readable for the same ordered recipe, retains complete fragments, and can be copied with polite success/error feedback without moving focus.
6. A share snapshot at or below the 6,000-character absolute-URL ceiling can be copied and reopened as immutable read-only state with the same ordered recipe and prompt.
7. Opening a share snapshot does not mutate draft keys or the active-draft pointer. **Tiếp tục chỉnh sửa** creates a different UUID, preserves the previous draft and records the snapshot hash.
8. When local storage is unavailable/full during a fork, the snapshot remains readable and copyable while editing is disabled with an actionable error; no unsaved state is presented as saved.
9. Above the share ceiling, URL copy is disabled with the measured length shown; full prompt copy and a lossless UTF-8 `application/json` export named `prompt-atlas-recipe-{recipeId}.promptatlas.json` remain available.
10. Import validates the versioned envelope and SHA-256 before opening it read-only. Every primitive field must be a non-empty bounded string; schema/dataset versions must be supported; every `primitiveId`/`slug` pair must match one canonical record in the 90-style production set; item IDs and blend keys must be unique and known. Malformed, unsupported-version, unknown-primitive or checksum-mismatched files show a readable recovery error and do not render stale snapshot data or alter drafts.
11. At ≥960 px Composer is a persistent structured workspace; below 960 px the catalog exposes a compact tray and Composer controls remain usable without obscuring focus. Core controls—including the visible **Nhập recipe** action—are keyboard-operable, expose visible focus and are at least 44×44 px.
12. No active/empty video mode appears. All behavior works on the static build without account, server, generation call or added API spend.

## Test plan

| Layer | Coverage |
| --- | --- |
| Unit (`node:test`) | Recipe ordering, duplicate prevention, deterministic rendering, conflict derivation/resolution, snapshot codec, 6,000-character decision, deep envelope/primitive/version/blend/bounds validation, canonical primitive identity membership and draft-store invariants with a fake storage adapter. |
| Integration/E2E (Playwright) | Add from catalog/detail, reload persistence, ordering/removal, copy, share/read-only/fork, storage failure, malformed and unknown-primitive checksummed snapshot recovery, import/export error path, visible import focus, mobile tray and deferred-video absence. |
| Accessibility (axe + assertions) | Serious/critical violations, live regions, accessible names, focus return/order and target-size contract on `/composer/` and the mobile catalog integration. |
| BDD | No Gherkin runner is configured. The observable acceptance contract is covered by named Playwright scenarios and unit tests instead. |
| Regression | Existing search/filter/favorite/copy/compare/detail/media tests plus `npm run check`, `npm run build`, `npm run test:contract` and `npm run test:e2e`. |

## Affected modules

- `src/lib/composer.ts` — pure recipe, conflict, serialization and prompt-rendering rules.
- `src/scripts/composer-store.ts` — browser storage adapter and immutable snapshot/fork orchestration.
- `src/components/ComposerEntry.astro` — visible add/count/tray integration shared by catalog and detail surfaces.
- `src/components/ComposerWorkspace.astro` — accessible recipe editor, conflict state and export/share controls.
- `src/pages/composer.astro` — static Composer route and read-only snapshot entry.
- `src/components/PairCard.astro`, `src/pages/styles/[slug].astro` — add-to-prompt entry points.
- `src/components/SiteHeader.astro`, `src/layouts/BaseLayout.astro`, `src/scripts/global.ts` — Composer destination, count synchronization and shared feedback.
- `src/components/Icon.astro`, `src/styles/global.css` — accepted icon/state/responsive design-system vocabulary.
- `tests/composer-domain.test.mjs`, `tests/composer.spec.ts`, `tests/responsive.spec.ts`, `tests/site.spec.ts` — unit, interaction, responsive, accessibility and regression coverage.

## Decisions

- The 90 records in `src/data/prompt-atlas.image.v1.json#stylePrimitives` are the only production primitives available in this issue; no placeholder taxonomy values are presented as usable content.
- Multiple style/medium primitives are preserved as an intentional hybrid only after explicit acknowledgement. This meets conflict transparency without inventing unsupported compatibility metadata.
- Hash-fragment snapshots keep shared recipe data out of server requests and work on the static host. Their payload and export envelope are versioned independently from browser draft storage.
- The current domain/build remains unchanged. Canonical-domain migration is not implied by this implementation.

## Design implementation direction

- **Palette:** retain ink `#121311`, paper `#f1eee6`, elevated paper `#fffefa`, subtle paper `#e5e0d5`, and acid action `#d8ff45`; warning/error/success use the accepted semantic colors rather than provider identity colors.
- **Type:** Instrument Sans carries plain-language controls and guidance; IBM Plex Mono carries IDs, ordering, versions and generated prompt output.
- **Layout:** a compact specimen ledger—ordered recipe on the left, deterministic output and export evidence on the right; mobile collapses this into one deliberate reading order and exposes the 64 px tray on discovery surfaces.
- **Signature:** a visible recipe spine joins numbered selections to the output state. It communicates order and causality, so it is structural rather than decorative.
- **Restraint check:** no new gradient, floating card treatment, generic metric hero or novelty animation is introduced. Borders, alignment, exact state labels and one acid primary action carry the tool identity.

## Approval gate

Approved by the user on 2026-08-12. Requirement changes after approval update this document and its tests before production code.

## Implementation evidence

- Static route: `/composer/`; integration entry points: all 90 catalog cards and every `/styles/[slug]/` detail route.
- Unit: 7/7 Composer domain, storage, snapshot and import/export tests passed, including checksummed malformed primitives, strict version/item/identity/blend bounds and canonical production membership.
- Contract: 47/47 schema, content-pipeline and generation-harness tests passed.
- Browser: 17/17 Playwright desktop/mobile scenarios passed, including populated Composer axe analysis, snapshot collision safety, malformed/unknown-primitive snapshot recovery without stale output or draft mutation, storage failure, visible import focus, keyboard ordering and 44 px control coverage.
- Build gates: `npm run check` completed with 0 errors/warnings/hints; `npm run build` generated 95 static pages.
- Visual review: populated Composer and catalog integration inspected at 1440×1000 and 390×844; the recipe spine, conflict hierarchy and primary Add/secondary Copy action order remained intact.
- QA corrections: import exposes a real keyboard focus target with a 2 px visible outline; snapshot decoding rejects malformed primitive fields, unsupported versions, oversized recipes, duplicate identities, invalid blend references and any `primitiveId`/`slug` pair outside the canonical 90-style registry before rendering or forking.
- API generation/spend remained outside runtime and unchanged at USD 0.
