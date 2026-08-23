import rawAssetManifest from "../data/image-anatomy-v2-assets.json";
import rawAnatomy from "../data/image-anatomy.v2.json";

export type BilingualText = { vi: string; en: string };
export type AnatomyCategory = {
  categoryId: string;
  label: BilingualText;
  dimensionIds: string[];
};
export type AnatomySubdimension = {
  subdimensionId: string;
  axis: string;
  definition: BilingualText;
  valueIds: string[];
};
export type AnatomyDimension = {
  dimensionId: string;
  categoryId: string;
  label: BilingualText;
  promptRole: string;
  valueSetType: string;
  subdimensions: AnatomySubdimension[];
  valueIds: string[];
  openEndedRationale?: BilingualText & { domainConstraints?: string[] };
  splitJustification?: string;
  tierRationale?: BilingualText;
};
export type AnatomyValue = {
  valueId: string;
  dimensionId: string;
  label: BilingualText;
  definition: BilingualText;
  promptFragment: string;
  observableCues: string[];
  tier: "core" | "advanced";
  aliases: string[];
  boundaryNote: BilingualText;
};
export type AnatomyExample = {
  exampleId: string;
  role: "controlled-comparison" | "application" | "canonical-reference";
  targetValueId: string;
  comparisonSetId?: string;
  exactPrompt: string;
  assetId: string;
  alt: BilingualText;
  knownLimitations: string[];
};
export type AnatomyAsset = {
  assetId: string;
  path: string;
  width: number;
  height: number;
};
export type AnatomyComparison = {
  comparisonSetId: string;
  dimensionId: string;
  coreValueIds: string[];
  participantValueIds?: string[];
  fixedVariables: string[];
  necessaryAdaptation: string;
};
export type AnatomyExampleView = AnatomyExample & { asset: AnatomyAsset; publicPath: string };

const anatomy = rawAnatomy as unknown as {
  hierarchy: string;
  categories: AnatomyCategory[];
  dimensions: AnatomyDimension[];
  values: AnatomyValue[];
  examples: AnatomyExample[];
  comparisonSets: AnatomyComparison[];
};
const manifest = rawAssetManifest as unknown as { assets: AnatomyAsset[] };
const assetsById = new Map(manifest.assets.map((asset) => [asset.assetId, asset]));

export const anatomyHierarchy = anatomy.hierarchy;
export const anatomyCategories = anatomy.categories;
export const anatomyDimensions = anatomy.dimensions;
export const anatomyValues = anatomy.values;
export const anatomyComparisons = anatomy.comparisonSets;

export const anatomyDimensionSlug = (dimensionId: string) => dimensionId.replaceAll(".", "-");

export const anatomyDimensionById = (dimensionId: string) =>
  anatomyDimensions.find((dimension) => dimension.dimensionId === dimensionId);

export const anatomyCategoryById = (categoryId: string) =>
  anatomyCategories.find((category) => category.categoryId === categoryId);

export const anatomyValuesForDimension = (dimensionId: string) =>
  anatomyValues.filter((value) => value.dimensionId === dimensionId);

export const anatomyExamplesForValue = (valueId: string): AnatomyExampleView[] =>
  anatomy.examples
    .filter((example) => example.targetValueId === valueId)
    .map((example) => {
      const asset = assetsById.get(example.assetId);
      if (!asset) throw new Error(`Missing accepted asset ${example.assetId}`);
      return { ...example, asset, publicPath: `/media/anatomy-v2/${asset.path}` };
    });

export const anatomyComparisonsForDimension = (dimensionId: string) =>
  anatomyComparisons.filter((comparison) => comparison.dimensionId === dimensionId);
