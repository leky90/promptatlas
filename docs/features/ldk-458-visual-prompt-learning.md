# LDK-458 — Visual prompt learning journey and comparison guard

**Status:** In progress
**Owner:** software engineer
**Reviewer:** QA
**Depends on:** LDK-457 (approved/done), LDK-321, LDK-344, LDK-334

## Problem

Prompt Atlas currently presents paired provider outputs, scores and copy/Composer controls before it teaches the user how the prompt produced the image. This contradicts the approved product job for Vietnamese users: see an output, understand its prompt anatomy and usage, then reuse it. Provider comparison is valid only when the data proves that at least two providers executed the same immutable prompt.

## Scope

### In

- Reframe the home/archive as an output-led reference library. Each style card shows one representative output, a short prompt cue and an explicit **Xem prompt** disclosure before copy or Composer actions become available.
- Reorder every style detail into **Output → Prompt anatomy → Cách dùng → Compose → Evidence** and keep the prompt adjacent to the primary image evidence.
- Replace primary navigation labels with the four approved Vietnamese tasks: **Xem kết quả / Học primitives / Soạn prompt / Kiểm chứng provider**.
- Add one pure shared evidence view-model that maps the canonical `provider → model → pipeline → result` hierarchy and derives comparison eligibility from two distinct providers plus one non-empty immutable recipe/prompt ID and SHA-256 prompt hash.
- Use that shared predicate on style detail and `/compare/`. An ineligible record renders one neutral **Ảnh tham chiếu** without provider color, winner, split score or comparison CTA.
- Keep provider colors inside eligible comparison containers only.
- Make the mobile Composer tray collapsible and part of normal document flow so it cannot cover learning content or controls.
- Preserve favorites, keyboard semantics, live status, local-first Composer persistence, conflict explanations and static generation.

### Out (deferred)

- Production deployment, domain mutation or release verification.
- New benchmark runs, statistical claims, repeat generation or reopening LDK-338.
- Rewriting all 187 primitive descriptions or changing the Composer editing model.
- Provider-neutral logo productionization, owned by LDK-459.
- External trademark review.

## Acceptance criteria

1. Home/archive cards expose one output, specimen number, style name, prompt cue and **Xem prompt**; copy and Composer controls are not visible before the disclosure is open.
2. Style detail presents output first, a visible full prompt beside or immediately after it, prompt anatomy, concrete keep/replace guidance, Compose actions, then the evidence disclosure.
3. Every copy action is preceded by a visible prompt or explicit prompt preview, with polite live-region success/error feedback unchanged.
4. `comparisonEligible` is derived once from at least two distinct providers whose successful results share the same non-empty immutable recipe/prompt ID and prompt SHA-256.
5. Eligible evidence exposes provider/model/pipeline/result metadata and may render provider colors, paired outputs, scores and verdicts only inside the evidence container.
6. Ineligible evidence exposes one neutral reference result and no provider color, winner, split score or comparison CTA.
7. Primary navigation uses the four approved Vietnamese task labels consistently on desktop and mobile.
8. Below 960 px, the Composer tray is collapsible, uses normal document flow and never overlaps the viewport's learning content or controls.
9. Functional text remains at least 11 px (target 12 px), primary controls remain at least 44×44 px, focus is visible and reduced-motion preferences remove non-essential transitions.
10. Existing Composer persistence, conflict handling, favorites, content contracts, static routes and asset integrity remain green.

## Test plan

| Layer | Coverage |
| --- | --- |
| Unit (`node:test`) | Eligible/ineligible evidence derivation, immutable prompt identity/hash rules, provider/model/pipeline/result mapping and neutral fallback. |
| Integration/E2E (Playwright) | Preview-first archive actions, detail reading order, eligible evidence disclosure, Vietnamese navigation and mobile in-flow Composer tray. |
| Accessibility | Axe serious/critical checks, visible focus, live status, semantic disclosure and 44 px controls. |
| BDD | No Gherkin runner is configured; observable criteria are covered by named unit and Playwright scenarios. |
| Regression | `npm run verify:pages` and `npm run test:e2e`. |

## Affected modules

- `src/lib/evidence.ts` — canonical evidence taxonomy and the single comparison eligibility predicate.
- `src/lib/styles.ts` — style learning helpers and typed integration with evidence data.
- `src/components/PairCard.astro` — one-output archive card and prompt-first disclosure.
- `src/components/PromptAnatomy.astro` — learning anatomy and keep/replace guidance.
- `src/components/EvidencePanel.astro` — eligible comparison and neutral fallback from one view-model.
- `src/pages/index.astro` — learning-first hero, archive and secondary evidence entry.
- `src/pages/styles/[slug].astro` — canonical learning sequence.
- `src/pages/compare.astro` — only eligible comparison records and shared metadata.
- `src/components/SiteHeader.astro`, `src/components/ComposerTray.astro`, `src/layouts/BaseLayout.astro` — task navigation, in-flow tray and learning-first metadata.
- `src/scripts/global.ts` — prompt-preview guard without changing local-first state behavior.
- `src/styles/global.css` — approved editorial layout, evidence color scoping and responsive tray.
- `tests/evidence-domain.test.mjs`, `tests/site.spec.ts`, `tests/responsive.spec.ts` — unit, browser, responsive and accessibility evidence.

## Design implementation direction

- **Palette:** paper `#f1eee6`, elevated paper `#fffefa`, ink `#121311`, quiet ink `#5b5c56`, acid action `#d8ff45`; provider red/blue are legal only within `[data-comparison-eligible="true"]`.
- **Type:** Instrument Sans for Vietnamese instruction and actions; IBM Plex Mono for specimen IDs and technical metadata.
- **Layout:** archive cards are output plates followed by a prompt drawer; detail is a vertical learning sequence with a two-column output/prompt anchor on wide screens and one column on mobile.
- **Signature:** the output/prompt plate is the structural motif—the media plate sits directly over its prompt cue and disclosure, so the visual cause/effect relationship is unmistakable.
- **Motion:** 140–220 ms functional feedback only; reduced motion removes non-essential transitions.
- **Restraint check:** no glass, gradients, decorative glow, rounded SaaS cards, narrative animation or provider color outside eligible evidence.

## Decisions

- The canonical `recipeId` is the immutable prompt ID because each generation run references that versioned recipe; `exactPrompt.sha256` is the immutable prompt hash.
- Existing `generationRuns`, `assets` and `productRoute` data already supply provider/model/pipeline/result identity, so no fabricated migration is required for the current 90 styles.
- Archive and detail choose one deterministic representative result for learning surfaces even when comparison is eligible. Provider identity stays secondary until evidence disclosure.
- The existing visual system is retained; the meaningful aesthetic risk is removing the familiar paired-provider motif from the front door and concentrating it inside an evidence dossier.

## Approval gate

The user approved the complete design contract in LDK-457 and explicitly authorized sequential implementation on 2026-08-14. Requirement changes update this spec and its tests before production code.
