# UX Audit: Prompt Atlas primary learning journey

VERDICT: Pass for the three production primary routes; this is not a whole-site or WCAG-conformance claim.

Persona Lock: first-time Vietnamese visual creator, moderate technical comfort, slightly distracted, wants to reuse one prompt element quickly. Locked at 2026-08-30 04:50 UTC.

Surfaces audited: 3/3 configured primary routes. Interaction manifest: complete, 27 entries; minimum 18. Walkthrough span: 7.79 minutes. Screenshots: 9. Console reads: 4. Network probes: 4.

Hard gates: origin console errors 0; origin console warnings 0; network 5xx 0; layout collapse 0; axe critical 0; axe serious 0. Extension-origin warnings were environmental and excluded. Local Lighthouse LCP was 1.62–2.00 s and CLS was 0–0.0009 on the three routes.

Top 5, ranked by impact × ease:

1. No retained finding warrants placement.
2. No further finding warrants placement.
3. No further finding warrants placement.
4. No further finding warrants placement.
5. No further finding warrants placement.

Self-critique pass: drafted 2; kept 0; generic dropped 1; duplicate/false-positive merged or dropped 1. The raw DOM touch-target counter included offscreen/hidden duplicate controls and was rejected because the exact candidate's visible-control/zoom regression suite passed. Mixed Vietnamese/English product terms were not promoted without evidence that the locked persona misunderstood them.

## Threads

1. Find a visual style: Home → Spotlight → type `góc máy` → keyboard-select a result → land on the filtered Discover view. Completable in four interactions with visible result count and a bookmarkable URL.
2. Reuse one prompt primitive: Discover → search/filter → copy fragment → add to Composer. Completable with clipboard feedback and an immediate Composer count update.
3. Learn and refine a primitive: Discover → `Góc máy` Anatomy → core values → Composer → browser back. Completable; URL/filter/local Composer context survived the round-trip.

## Scenario battery

- First contact: the hero states the output-first mental model and exposes two explicit starting paths. Time to first value was one click.
- Interrupted/wrong-turn recovery: URL-backed filters and browser back restored the primary contexts; the local Composer count persisted.
- Returning user: global Spotlight, `/`, and `?` keyboard shortcuts reduce the second journey.
- Keyboard only: Spotlight accepted Meta+K, arrow selection, Enter, Tab, and Escape; Playwright focus-traversal tests passed.
- Heavy data: the real production corpus contained 105 styles, 187 primitives, 116 dimensions, and 234 pages; filter/search journeys remained responsive. No synthetic 1000+ corpus was created.
- Destructive confidence, second-user roles, and lifecycle positions: not applicable to this public, accountless, local-first static reference. No destructive action was attempted.
- Data seasoning: not applicable; there is no shared server-side history. Local Composer persistence was exercised instead.

## Stress coverage

Run: responsive widths, rapid route/filter transitions, keyboard-only Spotlight, reduced-motion emulation, URL/back restoration, localStorage-backed Composer restoration, automated zoom/focus/a11y suites, production Lighthouse. Not run: offline, print, forced-colors, VoiceOver, Firefox/WebKit, destructive, multi-user, or server rejection; those limits do not contradict the primary-route pass.

## Proof-required controls

- Search dialog focus and keyboard behavior passed with `#spotlight-search`, the active descendant `spotlight-row-primitive-camera-angle-low`, and screenshots `home-desktop-before.png` / `home-desktop-after-search.png`.
- Discover feedback passed with the live clipboard status and Composer nav count 1; proof is `discover-desktop-after-filter.png` and the interaction manifest.
- Responsive layout passed with zero document overflow at 375, 768, and 1280 across all three routes; proof is the three `*-mobile-375.png` screenshots plus 104/104 Playwright tests.
- Accessibility automation passed with axe-core 4.13.0 returning zero violations on the three routes; 2–3 incomplete/manual checks per route remain a stated limitation.
- Performance feedback passed with local Lighthouse JSON/HTML artifacts under `../performance/`.

## What works well

The output-first hero gives a clear first move, Spotlight works across every primary surface, copy/add feedback is explicit, URL-backed filters make views shareable, and Composer state survives the learning loop. Mobile layouts preserve hierarchy without horizontal overflow.

## Hold this in your hands

Prompt Atlas feels like a well-indexed field notebook rather than a gallery that asks the visitor to admire and leave. The satisfying part is the continuity: a visual cue becomes a searchable primitive, then an Anatomy concept, then a reusable Composer ingredient without losing the thread. The interface is dense because the subject is dense, but its editorial typography, numbered plates, keyboard-first search, and URL-backed state make that density feel intentional. I would keep it close while writing prompts. The remaining release blockers found by the broader readiness run are operational and search-contract issues, not a failure of this core learning journey.
