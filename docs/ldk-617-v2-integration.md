# LDK-617 — Style Library and Image Anatomy V2 integration

## Accepted behavior

### Style discovery and legacy compatibility

- Given the accepted LDK-615 package, when a visitor opens the atlas, then all 102 canonical concepts and 3 accepted hybrid recipes are searchable and filterable by the seven V2 facets.
- Given any of the 90 V1 style URLs, when it is requested, then it still resolves and renders the exact V1 source prompt attached to that route.
- Given one of the 15 new canonical concepts, when its card or detail page renders, then it uses the hash-bound accepted reference asset and bilingual accessibility text.

### Image Anatomy learning flow

- Given the accepted LDK-616 package, when a visitor opens `/anatomy/`, then all 7 categories and 116 dimensions are discoverable with Vietnamese search and category filters.
- Given a dimension route, when it opens, then its optional subdimensions, Core and Advanced values, comparisons, application examples, and canonical references are exposed in the accepted hierarchy.
- Given keyboard-only or narrow-screen use, when filters and cards are operated, then focus remains visible, controls have accessible names and content does not require horizontal scrolling.

### Immutable package and delivery gates

- The checked-in datasets and 615 accepted assets must match their LDK-615/616 SHA-256 manifests.
- Schema, relationship, count, migration, prompt-preservation, asset-integrity, build, accessibility and route tests are merge gates.
- Production publication is explicitly excluded; LDK-618 owns release and production smoke checks.

## Implementation decomposition

This issue is delivered as one atomic integration PR because schema, migrations, static routes, cards and validation consume the same immutable IDs. Splitting them would create intermediate builds where accepted routes or references cannot resolve.

1. **Schema and lock:** check in both accepted datasets/manifests, JSON Schemas and source hashes.
2. **Migration adapter:** map the 90 legacy records to canonical V2 concepts/recipes without changing their URLs or exact source prompts.
3. **Style UI:** expose 105 accepted entries and seven V2 facets while retaining favorites, Composer and evidence behavior.
4. **Anatomy UI:** expose category → dimension → optional subdimension → value → example navigation.
5. **Validation and evidence:** validate schemas, cross-record references, counts, prompts and every asset hash; run unit, contract, build and Playwright gates.

