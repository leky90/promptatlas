# Catalog toolbar layout contract

Home (`/`) and Image Anatomy (`/anatomy/`) use the `standard` catalog-toolbar
variant. It keeps the section label, search field, filters, and result count in
the same grid, with one shared set of control-height, gap, padding, sticky-offset,
and responsive-breakpoint tokens from `src/styles/global.css`.

- Controls are 48 CSS px tall.
- The toolbar is sticky below the application header on wide screens.
- The grid becomes one column at 820 CSS px.
- Sticky positioning is disabled at 620 CSS px and below so the toolbar cannot
  overlap results or floating controls.

Discover (`/discover/`) intentionally uses the `dense` variant: its dark,
high-density workspace, taxonomy shortcuts, and workspace actions remain
distinct. The dense variant still follows the application shell gutter, the
same 48 CSS px control height, the same sticky offset, and the same 620 CSS px
sticky breakpoint.

These variants are presentation contracts only. They must not change route
identity, search/filter URL state, saved-only behavior, grid/list state,
skip-to-results behavior, Favorites or Composer persistence, canonical metadata,
or accepted data contracts.
