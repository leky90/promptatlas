# 09 · Taxonomy & data contract v1

## Decision summary

Prompt Atlas v1 uses a versioned dataset snapshot with four core records:

1. **Primitive** — one searchable, controllable prompt concept within one taxonomy dimension.
2. **Recipe** — an ordered composition of primitive values plus a provider-neutral rendered prompt.
3. **Example asset** — visual or audiovisual evidence that identifies the dimensions being demonstrated and any confounders.
4. **Generation run** — an immutable execution record containing provider, model, route, prompt, settings, outputs and review references.

The corrected pre-release contract is identified as `schemaVersion: 1.0.0-draft.2`, `taxonomyVersion: 1.0.0-draft.2` and fixture `datasetVersion: 0.2.0`. These identifiers prevent the earlier reviewed draft shape from being mistaken for the corrected contract.

The normative artifacts are:

- `src/data/taxonomy.v1.json` — category and dimension registry.
- `schemas/prompt-atlas.v1.schema.json` — JSON Schema Draft 2020-12 contract.
- `schemas/examples/prompt-atlas.v1.example.json` — valid image/video reference fixture.
- `scripts/validate-prompt-atlas-data.mjs` — reusable JSON Schema and cross-record validator.
- `contract-tests/data-contract.test.mjs` — schema and cross-reference invariants.

This issue defines the contract. It does not migrate the current 90-style catalog or add the composer UI; those belong to the content-pipeline and product implementation issues that consume this contract.

## Vocabulary and identity

| Term | Meaning | Example |
|---|---|---|
| Category | Stable top-level navigation and ownership boundary | `camera` |
| Dimension | One observable axis within a category | `camera.depth-of-field` |
| Primitive | Searchable concept, prompt fragment and allowed values for one dimension | `primitive.camera.depth-of-field` |
| Value | A local option within a primitive | `shallow` |
| Recipe | Ordered, versioned selection of primitive values | `recipe.image.editorial-portrait` |
| Example asset | Evidence with isolated dimensions, confounders and expected claims | `example.image.editorial-portrait` |
| Generation run | Immutable record of an actual provider execution | `run.image.chatgpt.editorial-portrait` |

IDs are lowercase ASCII and never translated. A dimension ID is globally unique and starts with its category ID. A value ID is unique within its primitive. Labels, definitions and aliases are display/search content and may change without changing identity.

## Taxonomy map

The registry contains 152 dimensions across 11 ordered categories. `prdCoverage` maps every dimension back to one of 20 explicit PRD requirement groups; an unmapped or unknown dimension fails contract validation.

| Category | Modality | Dimensions | Coverage examples |
|---|---|---:|---|
| `subject` | image, video | 39 | face emphasis, skin sheen/freckles/pores/age detail/makeup, eye size/spacing/eyelid, hair density/color, silhouette, line of action, footwear |
| `object` | image, video | 19 | identity, geometry, scale, repetition, viewpoint, material, roughness, finish, wear, state, spatial relation |
| `scene` | image, video | 8 | environment, location, time of day, weather, atmosphere, narrative context, depth layers |
| `composition` | image, video | 10 | placement, balance, symmetry, thirds, leading lines, negative space, hierarchy, overlap, aspect ratio |
| `camera` | image, video | 21 | shot size, angle, perspective, lens distortion/compression, focus, framing, movement, subject relation and movement phases |
| `lighting` | image, video | 13 | source, direction, motivation, hardness, falloff, contrast, exposure, shadows, specular, volumetric light |
| `color` | image, video | 6 | palette, harmony, temperature, saturation, contrast, grade |
| `style` | image, video | 8 | medium, technique, movement, production design, texture, mark-making, rendering, finish |
| `motion` | video | 11 | subject/object/environment action, trajectory, direction, speed, acceleration, rhythm, physics, weight |
| `temporal` | video | 12 | start/action/end, duration, frame rate, shutter impression, speed treatment, continuity, causality, transition, loop |
| `audio` | video | 5 | ambience, dialogue intent, sound event, music mood, timing |

`shared` is a primitive modality meaning the same concept may be used in both image and video recipes. `motion`, `temporal` and `audio` remain video-only categories. Audio primitives describe intent; support is recorded per generation route and model rather than assumed.

## Primitive contract

A primitive contains:

- stable `id`, semantic `version`, lifecycle `status`, `modality`, `category` and `dimensionId`;
- bilingual `label`, `definition`, `searchAliases` and optional ambiguity guidance;
- one ordered prompt fragment with an explicit language, semantic role and variables;
- local values with localized labels, provider-neutral fragments and optional intensity;
- explicit single/multiple selection cardinality with minimum and maximum selections;
- primitive-wide prerequisites, compatible concepts and conflicts;
- positive example and counterexample references;
- time-scoped model notes backed by generation-run IDs;
- sensitivity guidance and provenance.

Compatibility has exact snapshot semantics:

- `requires` means a referenced primitive must be enabled in the same recipe.
- `compatibleWith` is an editorial recommendation, not an automatic insertion.
- `conflictsWith` is a hard concept-level conflict. The composer must surface it and must not silently rewrite user intent.
- `rules` expresses primitive-wide or value/intensity-dependent requirements, compatibility or conflicts. Each rule has a stable ID, optional source selector, target selector, severity, bilingual reason and resolution mode.
- Resolution is limited to informing, suggesting a change or blocking approval. No rule may silently remove or rewrite a user's selection.
- `unresolvedConflictIds` on a recipe references rule IDs and is the explicit escape hatch for drafts. An approved recipe must have an empty list.

## Recipe contract

A recipe is a reproducible composition, not merely a prompt string. It records:

- modality, locale, status and semantic version;
- ordered primitive selections, selected values, intensity, variables and explicit user overrides;
- cardinality semantics: single-select primitives may appear once; multi-select primitives are bounded by their declared maximum;
- output requirements such as aspect ratio, dimensions, duration, frame rate and audio intent;
- renderer version and one or more rendered prompts with provider/model targets;
- unresolved conflicts and provenance.

The dataset is a snapshot: every recipe resolves primitive IDs and values against the primitive versions in the same `datasetVersion`. The cross-record validator rejects duplicate single-select primitives, modality leakage, invalid values, unknown rules and broken references. A changed primitive or rendering rule creates a new dataset snapshot and, when output can change, a new recipe or renderer version.

## Example asset contract

Examples are evidence, not decoration. Each record states:

- whether it is positive, a counterexample, a composition or a benchmark reference;
- the primitives, recipe and generation run that produced or explain it;
- media metadata and bilingual alternative text/caption for image/video, plus video temporal description;
- dimensions intentionally isolated, known confounders and machine-readable expected claims;
- review status, license and provenance.

An expected claim identifies one dimension, a localized observable assertion, evaluation type and optional weight. This separates “what should be visible” from the later reviewer score.

## Generation run contract

A generation run is immutable after ingestion. Corrections create a new run or dataset version. It captures:

- recipe/test-case identity, pinned `recipeVersion`/`datasetVersion` and attempt number;
- provider, model family, mandatory model-version disclosure, route and execution time;
- the exact rendered prompt sent to that provider;
- every requested setting, applied value and support status;
- seed availability, selection policy and all output asset IDs;
- outcome, moderation, error and optional usage/cost fields;
- expected claims, review IDs and provenance.

`all-attempts` is the default benchmark selection policy. If a product later allows `best-of-declared`, the selection count and rule must be declared outside the run and applied equally across compared providers.

`modelVersion` is a structured disclosure rather than a nullable string:

- `exact` requires the exact identifier and its evidence source;
- `provider-alias` records the identifier exposed in the request/UI without pretending it is an immutable backend version;
- `unavailable` requires a bilingual reason and `not-exposed` source. Placeholders such as “record later” are invalid.

## Versioning policy

| Field | Changes when | Compatibility rule |
|---|---|---|
| `schemaVersion` | fields, types or requiredness change | major for breaking; minor for additive; patch for clarification |
| `taxonomyVersion` | categories/dimensions or their semantics change | same semantic-version policy; removal requires deprecation first |
| `datasetVersion` | any released record or reference changes | immutable release snapshot |
| primitive/recipe `version` | that record's meaning, options or rendered output can change | old released versions remain recoverable from prior dataset snapshots |
| `rendererVersion` | ordering, escaping or provider adaptation changes | bump whenever identical recipe data may render differently |

Never recycle an ID for a different meaning. Deprecate a record, document the replacement in release notes, and remove it only in a new major schema/taxonomy release. Generation-run IDs are immutable event IDs and are never reused.

## Localization policy

- `vi` is the default locale and `vi` + `en` are required for public labels, definitions, guidance and accessibility text in v1.
- IDs, provider names, model versions, units and checksums are never localized.
- Search aliases are locale-specific and are not accepted as references.
- Prompt text carries an explicit `language`: `vi`, `en` or `model-native`.
- A translation changes content, not identity. If translation changes executable meaning, increment the record and dataset versions.
- Missing future locales fall back to `defaultLocale`; missing required `vi`/`en` fails validation.

## Provenance and model-note evidence

Every durable record declares source type, author, license and timestamps. External or licensed work also includes source URLs. Generated media carries provenance both on the example record and the nested media asset. Checksums are optional during authoring and required by the future ingest pipeline for production assets.

A model note is scoped to provider, model family, mandatory version disclosure and observation time. It must use cautious language, include a confidence level and reference at least one existing generation run. Unverified provider folklore is not valid model guidance.

## Migration from the current 90-style catalog

| Current `StyleRecord` field | Target record |
|---|---|
| `id`, `slug`, `name`, `family`, `summary`, `cues` | `style` primitive/value metadata and localized search aliases |
| `sourcePrompt`, `generationPrompt` | recipe `freeTextBridge`, `items` and `renderedPrompts` |
| `images.chatgpt`, `images.gemini` | two example assets and their media records |
| provider identity implicit in image key | explicit generation-run `provider`, `modelFamily`, `modelVersion`, `route` |
| scores | future review records referenced by `generationRun.reviewIds` |
| `winner`, `observation` | derived comparison presentation; never canonical generation data |
| `related` | search/recommendation index derived from dimensions and compatibility |

Migration must preserve the existing normalized catalog until the new pipeline has parity. `StyleRecord` is therefore not replaced by this issue.

## Validation and acceptance

`npm run validate:contract` validates any supplied dataset with the reusable validator. `npm run test:contract` verifies both happy paths and negative mutations:

- the 11 categories are present once, ordered and bilingual;
- 152 dimension IDs are globally unique, category-prefixed and exhaustively mapped to the PRD;
- all four entity definitions exist;
- every fixture reference resolves across primitives, recipes, examples, media and runs;
- recipe modality, value selections and cardinality are valid;
- compatibility rules resolve source/target primitive values;
- runs pin recipe/dataset versions and carry explicit model-version disclosure;
- model notes cannot omit evidence, and image/video media cannot omit bilingual accessibility metadata;
- versions, localization and provenance are present.

Production ingestion should run the same checks before publishing and additionally verify asset existence/checksums, license policy, deprecation migrations and reviewer approval.

## Deliberate non-goals for v1

- provider-specific prompt rewrites beyond recording rendered output;
- automated inference of sensitive human attributes;
- ranking one model universally from a single output;
- authoring UI, database tables or search indexing implementation;
- audio-generation guarantees independent of the model/route capability matrix.
