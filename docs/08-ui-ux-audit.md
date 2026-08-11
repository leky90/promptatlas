# 08 — UI/UX visual audit and remediation

Date: 2026-08-11  
Review method: manual visual inspection using the `ui-design-review` framework plus browser interaction tests.

## Audit coverage

I reviewed 39 viewport screenshots across four representative routes:

- Home atlas.
- Model comparison workbench.
- Sumi-e detail page.
- Methodology page.

Viewports:

- Desktop: 1440×1000.
- Tablet: 820×1180.
- Mobile: 390×844.

The review covered visual hierarchy, typography, color, spacing, consistency, imagery, layout, component quality, brand expression, and current interface conventions.

## Executive assessment

The editorial light-table direction is distinctive and appropriate for a visual prompt reference. The strongest elements are the paired-image seam, restrained paper/ink palette, and consistent ChatGPT/Gemini color coding.

The primary visual debt was concentrated in interaction details: undersized glyph-based icons, a favorite action floating awkwardly over card content, no prompt action at catalog level, an empty black lazy-load state that resembled broken media, and an inconsistent methodology flow at smaller breakpoints.

## Findings and fixes

### High priority

1. **No copy action on catalog cards**
   - Before: users had to open a detail page before copying a prompt.
   - Fix: every one of the 90 cards now has a persistent acid-lime “Sao chép prompt” action with clipboard feedback and fallback handling.

2. **Card action hierarchy was unclear**
   - Before: the bookmark button was a small absolute-positioned control competing with the title and metadata.
   - Fix: card actions now use a dedicated two-button footer. Copy is primary; save is secondary. Both meet a minimum 46–50 px target height.

3. **Methodology flow broke into an orphaned layout on tablet**
   - Before: four stages were forced through a three-column grid, leaving the final stage visually detached.
   - Fix: desktop retains the horizontal process; tablet uses a balanced 2×2 grid; mobile uses one column with clear vertical arrows.

### Medium priority

4. **Iconography was undersized and inconsistent**
   - Before: search, navigation, bookmark, copy, and directional cues mixed text glyphs such as `↗`, `→`, `⌕`, and tiny inline SVGs.
   - Fix: a shared `Icon.astro` system now supplies cohesive 18–20 px stroke icons for search, bookmark, copy, menu, external links, paging, swap, and process connectors.

5. **Lazy-loaded images looked broken while pending**
   - Before: unloaded catalog media displayed as a black panel with a bright seam, visually similar to a failed image.
   - Fix: image cells use a light neutral material placeholder with a subtle diagonal texture until the image paints.

6. **Long card titles looked compressed**
   - Before: negative tracking plus reserved space for the floating bookmark made multi-word names read as joined words.
   - Fix: the reserved right margin was removed, tracking was relaxed, and deliberate word spacing was introduced.

7. **Mobile methodology headline dominated too aggressively**
   - Before: the outline line wrapped into four to five dense lines at 390 px.
   - Fix: the method-specific mobile scale and tracking were reduced without losing the editorial contrast.

### Low priority / resilience

8. **Sticky-header clipping appeared in some tablet scroll captures**
   - Document-level overflow could not be reproduced (`scrollWidth` matched the viewport), suggesting a sticky/compositing edge case rather than a persistent layout overflow.
   - Mitigation: body horizontal clipping, explicit flex shrink behavior, non-shrinking icon/menu controls, and scroll margins for anchored sections.

9. **Prompt copy control lacked a clear icon**
   - Fix: detail prompt blocks now pair the copy icon, text label, and keyboard hint; the visual state changes to “Đã sao chép”.

## Visual quality by dimension

| Dimension | Before | After | Notes |
| --- | ---: | ---: | --- |
| Visual hierarchy | 8.0 | 8.8 | Primary/secondary card actions are now explicit. |
| Typography | 7.4 | 8.4 | Better word separation and mobile headline restraint. |
| Color system | 8.8 | 8.9 | Strong provider colors retained; loading state improved. |
| Spacing | 7.6 | 8.5 | Action controls no longer collide with card content. |
| Consistency | 6.7 | 8.8 | One icon system replaces mixed glyphs. |
| Imagery | 8.5 | 8.9 | Pending media no longer resembles broken output. |
| Layout/grid | 7.1 | 8.5 | Method flow and card footer breakpoints repaired. |
| Components | 6.8 | 8.8 | Copy/save affordances and interaction feedback improved. |
| Brand/personality | 8.9 | 9.0 | Editorial light-table identity remains intact. |
| Modern standards | 7.8 | 8.8 | SVG icon system, target sizes, and feedback states added. |

Scores are directional visual judgments, not automated metrics.

## Verification

- `npm run check`: 0 errors, 0 warnings, 0 hints.
- `npm run build`: 94 static pages built successfully.
- `npm run test:e2e`: 10/10 tests passed.
- Home test now verifies prompt copying directly from a catalog card.
- Axe found no serious or critical accessibility violations on the four representative routes.
- Mobile navigation, search, compare state, favorites, detail copying, all 90 routes, and all published media remain functional.

## Remaining intentional tradeoffs

- The home atlas is long because all 90 items are statically indexable; thumbnails and native lazy loading limit network cost.
- Mobile cards prioritize images and direct actions over dense score detail; full evaluation remains on detail/compare pages.
- Favorites remain browser-local rather than account-synced.
