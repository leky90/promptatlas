import rawStyleAssets from "../data/style-library-v2-assets.json";
import rawStyleV2 from "../data/style-library.v2.json";
import rawStyles from "../data/styles.json";

export type ProviderScores = {
  promptAdherence: number;
  styleFidelity: number;
  composition: number;
  technicalQuality: number;
  detailIntegrity: number;
  average: number;
};

export type StyleImage = {
  full: string;
  thumb: string;
  width: number;
  height: number;
  alt?: string;
};

export type StyleFacet =
  | "movement-tradition"
  | "medium-material"
  | "technique-process"
  | "illustration-visual-language"
  | "photography-cinematic"
  | "digital-rendering"
  | "aesthetic-subculture";

export type StyleRecord = {
  id: number;
  slug: string;
  name: string;
  title: string;
  subtitle: string;
  family: "Hội họa" | "Minh họa" | "Thủ công" | "Kỹ thuật số" | "Nhiếp ảnh" | "Lai phong cách";
  summary: string;
  cues: string[];
  sourcePrompt: string;
  promptReadyFragment: string;
  generationPrompt: string;
  images: { chatgpt: StyleImage; gemini: StyleImage };
  scores: { chatgpt: ProviderScores; gemini: ProviderScores };
  winner: "ChatGPT" | "Gemini" | "Hòa";
  observation: string;
  related: string[];
  recordKind: "canonical-concept" | "hybrid-recipe";
  canonicalId: string;
  primaryFacet: StyleFacet;
  secondaryFacets: StyleFacet[];
  aliases: string[];
  legacySlugs: string[];
  distinction?: string;
};

type LegacyStyle = Omit<StyleRecord, "promptReadyFragment" | "recordKind" | "canonicalId" | "primaryFacet" | "secondaryFacets" | "aliases" | "legacySlugs" | "distinction">;
type Bilingual = { vi: string; en: string };
type Concept = {
  conceptId: string;
  canonicalSlug: string;
  name: Bilingual;
  aliases: string[];
  definition: string;
  intendedUse: string;
  primaryFacet: StyleFacet;
  secondaryFacets: StyleFacet[];
  visualCues: string[];
  promptReadyFragment: string;
  distinction: string;
  relations: { relatedConceptIds: string[] };
  legacyMappings: Array<{ legacyId: number; legacySlug: string }>;
  referenceAssetId?: string;
};
type HybridRecipe = {
  recipeId: string;
  canonicalSlug: string;
  name: Bilingual;
  componentConceptIds: string[];
  interactionDescription: string;
  generationPrompt: string;
  exactSourcePrompt: string;
};
type Migration = { legacyId: number; targetId: string; classification: "canonical-concept" | "hybrid-recipe" | "alias" };
type StyleAsset = {
  assetId: string;
  relativePath: string;
  width: number;
  height: number;
  generation: { exactPrompt: string };
  accessibility: { altVi: string };
  fidelityReview: { knownLimitations: string[] };
};

const sourceStyles = rawStyles as LegacyStyle[];
const styleV2 = rawStyleV2 as unknown as {
  registry: { canonicalConcepts: Concept[]; hybridRecipes: HybridRecipe[] };
  migrationManifest: Migration[];
};
const styleAssets = rawStyleAssets as unknown as { referenceAssets: StyleAsset[] };
const conceptsById = new Map(styleV2.registry.canonicalConcepts.map((item) => [item.conceptId, item]));
const recipesById = new Map(styleV2.registry.hybridRecipes.map((item) => [item.recipeId, item]));
const assetsById = new Map(styleAssets.referenceAssets.map((item) => [item.assetId, item]));

const facetFamily: Record<StyleFacet, StyleRecord["family"]> = {
  "movement-tradition": "Hội họa",
  "medium-material": "Thủ công",
  "technique-process": "Thủ công",
  "illustration-visual-language": "Minh họa",
  "photography-cinematic": "Nhiếp ảnh",
  "digital-rendering": "Kỹ thuật số",
  "aesthetic-subculture": "Kỹ thuật số",
};

export const styleFacets: Array<{ id: StyleFacet; label: string }> = [
  { id: "movement-tradition", label: "Trào lưu & truyền thống" },
  { id: "medium-material", label: "Chất liệu" },
  { id: "technique-process", label: "Kỹ thuật" },
  { id: "illustration-visual-language", label: "Ngôn ngữ minh họa" },
  { id: "photography-cinematic", label: "Nhiếp ảnh & điện ảnh" },
  { id: "digital-rendering", label: "Kết xuất số" },
  { id: "aesthetic-subculture", label: "Thẩm mỹ & tiểu văn hóa" },
];

export const styleFacetLabel = (facet: StyleFacet) =>
  styleFacets.find((item) => item.id === facet)?.label ?? facet;

const zeroScores: ProviderScores = {
  promptAdherence: 0,
  styleFidelity: 0,
  composition: 0,
  technicalQuality: 0,
  detailIntegrity: 0,
  average: 0,
};

const promptField = (prompt: string, field: string) =>
  prompt.split("\n").find((line) => line.startsWith(`${field}: `))?.slice(field.length + 2).trim() ?? "";

const styleFragmentFromPrompt = (prompt: string) => promptField(prompt, "Style/medium");

const thumbnailPathFor = (relativePath: string) =>
  `/media/style-v2/thumbs/${relativePath.replace(/^assets\//u, "").replace(/\.[^.]+$/u, ".webp")}`;

const withStyleFragment = (prompt: string, fragment: string) => {
  const normalized = fragment.trim().replace(/\.+$/u, "");
  return prompt.replace(/^Style\/medium:.*$/mu, `Style/medium: ${normalized}.`);
};

const enrichLegacy = (style: LegacyStyle, migration: Migration): StyleRecord => {
  const concept = conceptsById.get(migration.targetId);
  const recipe = recipesById.get(migration.targetId);
  const enriched: StyleRecord = {
    ...style,
    recordKind: concept ? "canonical-concept" : "hybrid-recipe",
    canonicalId: migration.targetId,
    primaryFacet: concept?.primaryFacet ?? "aesthetic-subculture",
    secondaryFacets: concept?.secondaryFacets ?? [],
    aliases: concept?.aliases ?? [],
    legacySlugs: concept && concept.canonicalSlug !== style.slug ? [style.slug] : [],
    promptReadyFragment: concept?.promptReadyFragment ?? styleFragmentFromPrompt(recipe?.generationPrompt ?? style.generationPrompt),
    distinction: concept?.distinction ?? recipe?.interactionDescription,
  };
  if (concept) {
    enriched.slug = concept.canonicalSlug;
    enriched.name = concept.name.vi;
    enriched.title = concept.name.en;
    enriched.subtitle = concept.intendedUse;
    enriched.summary = concept.definition;
    enriched.cues = concept.visualCues;
    enriched.family = facetFamily[concept.primaryFacet];
    enriched.generationPrompt = withStyleFragment(style.generationPrompt, concept.promptReadyFragment);
  }
  return enriched;
};

const legacyStyles = styleV2.migrationManifest.map((migration) => {
  const style = sourceStyles.find((candidate) => candidate.id === migration.legacyId);
  if (!style) throw new Error(`Missing V1 style ${migration.legacyId}`);
  return enrichLegacy(style, migration);
});

const newConcepts = styleV2.registry.canonicalConcepts
  .filter((concept) => concept.legacyMappings.length === 0)
  .map((concept, index): StyleRecord => {
    const asset = concept.referenceAssetId ? assetsById.get(concept.referenceAssetId) : undefined;
    if (!asset) throw new Error(`Missing accepted V2 reference asset for ${concept.conceptId}`);
    const image = {
      full: `/media/style-v2/${asset.relativePath}`,
      thumb: thumbnailPathFor(asset.relativePath),
      width: asset.width,
      height: asset.height,
      alt: asset.accessibility.altVi,
    };
    return {
      id: 91 + index,
      slug: concept.canonicalSlug,
      name: concept.name.vi,
      title: concept.name.en,
      subtitle: concept.intendedUse,
      family: facetFamily[concept.primaryFacet],
      summary: concept.definition,
      cues: concept.visualCues,
      sourcePrompt: promptField(asset.generation.exactPrompt, "Primary request"),
      promptReadyFragment: concept.promptReadyFragment,
      generationPrompt: asset.generation.exactPrompt,
      images: { chatgpt: image, gemini: image },
      scores: { chatgpt: { ...zeroScores }, gemini: { ...zeroScores } },
      winner: "Hòa",
      observation: asset.fidelityReview.knownLimitations.join(" ") || "Ảnh tham chiếu V2 đã qua content review; chưa phải benchmark provider.",
      related: concept.relations.relatedConceptIds.map((id) => id.replace(/^style\./, "")),
      recordKind: "canonical-concept",
      canonicalId: concept.conceptId,
      primaryFacet: concept.primaryFacet,
      secondaryFacets: concept.secondaryFacets,
      aliases: concept.aliases,
      legacySlugs: [],
      distinction: concept.distinction,
    };
  });

export const styles: StyleRecord[] = [...legacyStyles, ...newConcepts];

export const styleRoutes = styles.flatMap((style) => [
  { routeSlug: style.slug, style },
  ...style.legacySlugs.map((routeSlug) => ({ routeSlug, style })),
]);

export const families: StyleRecord["family"][] = [
  "Hội họa",
  "Minh họa",
  "Thủ công",
  "Kỹ thuật số",
  "Nhiếp ảnh",
  "Lai phong cách",
];

export function styleBySlug(slug: string) {
  return styles.find((style) => style.slug === slug || style.legacySlugs.includes(slug));
}

export function paddedId(id: number) {
  return String(id).padStart(3, "0");
}
