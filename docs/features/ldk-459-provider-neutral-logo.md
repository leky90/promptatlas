# LDK-459 — Provider-neutral Output/Prompt Plate

## Product outcome

Prompt Atlas uses one provider-neutral brand mark that encodes the learning journey: output first, prompt cue second, then action. The mark keeps the accepted editorial neo-brutalist paper/ink/acid system and never uses provider identity as core branding.

## Approved construction

- Master grid: 64 × 64, integer-aligned flat vector shapes.
- Paper plate: hard square with an ink rule.
- Output window: the dominant ink field.
- Prompt cue: the smaller acid rule below the output.
- Composer terminal: a small ink square after the prompt cue.
- No radius, gradient, transparency, shadow, decorative effect, font dependency, ChatGPT red or Gemini blue.

## Required assets

- Primary mark for paper contexts.
- Reverse mark for ink contexts.
- One-colour ink mark.
- Optically checked favicon variants for 16, 32 and 64px, with `/favicon.svg` retained as the stable public entry point.
- HTML header lockup using the reverse symbol plus accessible `PROMPT ATLAS / BY LDKTECH` text.
- Web app manifest, Open Graph plate and structured website metadata referencing the approved provider-neutral system.
- The former provider-split favicon retained under an explicit legacy path until rollout acceptance.

## Behaviour scenarios

### Header on desktop and mobile

Given any page, when the global header renders, then the home link keeps the accessible name `Prompt Atlas — trang chủ`, the symbol is decorative inside that named link, the wordmark remains live HTML text, and the mark remains legible without horizontal overflow.

### Brand asset independence

Given any production SVG variant, when it is inspected outside the website, then it contains only flat vector geometry, has no live text or font dependency, and contains no provider colour.

### Browser and shared-link identity

Given a browser tab, install surface, social share or structured-data consumer, when it requests Prompt Atlas identity, then favicon, manifest, OG cover and JSON-LD all resolve to the Output/Prompt Plate system and describe the learning-first product rather than a provider contest.

### Historical recovery

Given rollout review, when the prior identity needs inspection, then its original provider-split favicon remains available at the documented legacy asset path but is not referenced by an active brand surface.

## Acceptance criteria

- Mark remains readable at rendered sizes 16, 24, 32 and 64px on paper and ink.
- Primary, reverse, monochrome, 16px, 32px and 64px SVGs use a 64-unit integer grid and no `<text>`, font, gradient, filter, mask, opacity or provider colours.
- Core mark palette is limited to paper `#F1EEE6`, ink `#121311` and acid `#D8FF45`; monochrome uses ink only.
- Header retains visible HTML wordmark and the accessible home-link name.
- `/favicon.svg`, `/site.webmanifest`, OG generation and JSON-LD reference the approved identity.
- OG copy explains `Output → Prompt → Compose` in Vietnamese and does not frame the product as `ChatGPT × Gemini`.
- Automated contract tests cover asset hygiene and integration; Playwright covers desktop/mobile header layout and accessibility.
- `npm run verify:pages` and relevant E2E tests pass before merge.

## Scope boundary

Software merge only. No production deployment and no external trademark acceptance are part of LDK-459.
