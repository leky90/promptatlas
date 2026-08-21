import rawEvidence from "../data/prompt-atlas.image.v1.json" with { type: "json" };

import type { StyleRecord } from "./styles";

type ModelVersion = {
  status?: string;
  identifier?: string;
};

type EvidenceRun = {
  id: string;
  recipeId?: string;
  outcome?: string;
  exactPrompt?: { sha256?: string; text?: string };
  productRoute?: {
    id?: string;
    displayName?: string;
    provider?: string;
    interface?: string;
    modelFamily?: string;
    modelVersion?: ModelVersion;
  };
  outputAssetIds?: string[];
};

type EvidenceAsset = {
  id: string;
  kind?: string;
  path?: string;
  width?: number;
  height?: number;
  thumbnail?: { path?: string; width?: number; height?: number };
  alt?: { vi?: string; en?: string };
};

type ComparativeStyle = Pick<StyleRecord, "winner" | "observation" | "scores"> & Partial<Pick<StyleRecord, "images" | "name">> & {
  slug?: string;
};

export type EvidenceResult = {
  provider: { id: string; label: string };
  model: { family: string; version: string };
  pipeline: { id: string; label: string; interface: string };
  result: {
    id: string;
    runId: string;
    path: string;
    thumbnailPath: string;
    width: number;
    height: number;
    alt: string;
  };
};

export type StyleEvidence = {
  mode: "comparison" | "single-result";
  comparisonEligible: boolean;
  promptIdentity: { id: string; hash: string } | null;
  representative: EvidenceResult | null;
  results: EvidenceResult[];
  comparison: {
    winner: StyleRecord["winner"];
    observation: string;
    scores: StyleRecord["scores"];
  } | null;
};

const providerId = (provider: string) => provider
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/(^-|-$)/gu, "");

const modelVersionLabel = (version?: ModelVersion) => {
  if (version?.identifier) return version.identifier;
  if (version?.status === "unavailable") return "Không công khai";
  return version?.status || "Không xác định";
};

const toResult = (run: EvidenceRun, assetsById: Map<string, EvidenceAsset>): EvidenceResult | null => {
  if (run.outcome !== "success") return null;

  const asset = (run.outputAssetIds ?? [])
    .map((assetId) => assetsById.get(assetId))
    .find((candidate) => candidate?.kind === "image" && candidate.path);
  const route = run.productRoute;
  const provider = route?.provider?.trim();
  if (!asset || !provider) return null;

  return {
    provider: { id: providerId(provider), label: provider },
    model: {
      family: route?.modelFamily || "Không xác định",
      version: modelVersionLabel(route?.modelVersion),
    },
    pipeline: {
      id: route?.id || "unknown-pipeline",
      label: route?.displayName || route?.id || "Pipeline không xác định",
      interface: route?.interface || "unknown",
    },
    result: {
      id: asset.id,
      runId: run.id,
      path: asset.path || "",
      thumbnailPath: asset.thumbnail?.path || asset.path || "",
      width: asset.width || 0,
      height: asset.height || 0,
      alt: asset.alt?.vi || asset.alt?.en || "Ảnh kết quả tạo sinh",
    },
  };
};

const neutralStyleReference = (style: ComparativeStyle): EvidenceResult | null => {
  const image = style.images?.chatgpt;
  if (!image) return null;
  const referenceId = `reference.${style.slug || "style"}`;
  return {
    provider: { id: "neutral", label: "Chưa xác minh" },
    model: { family: "Chưa xác minh", version: "Không áp dụng" },
    pipeline: { id: "unverified-reference", label: "Ảnh tham chiếu", interface: "not-verified" },
    result: {
      id: referenceId,
      runId: "not-available",
      path: image.full,
      thumbnailPath: image.thumb,
      width: image.width,
      height: image.height,
      alt: `${style.name || "Phong cách"} — ảnh tham chiếu trung tính.`,
    },
  };
};

export function deriveStyleEvidence({
  style,
  runs,
  assets,
}: {
  style: ComparativeStyle;
  runs: EvidenceRun[];
  assets: EvidenceAsset[];
}): StyleEvidence {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const candidates = runs
    .map((run) => ({ run, result: toResult(run, assetsById) }))
    .filter((candidate): candidate is { run: EvidenceRun; result: EvidenceResult } => Boolean(candidate.result));

  const promptIds = new Set(candidates.map(({ run }) => run.recipeId?.trim()).filter(Boolean));
  const promptHashes = new Set(candidates.map(({ run }) => run.exactPrompt?.sha256?.trim()).filter(Boolean));
  const allHavePromptIdentity = candidates.length > 0 && candidates.every(({ run }) => (
    Boolean(run.recipeId?.trim()) && Boolean(run.exactPrompt?.sha256?.trim())
  ));
  const distinctProviders = new Set(candidates.map(({ result }) => result.provider.id));
  const comparisonEligible = (
    candidates.length >= 2
    && distinctProviders.size >= 2
    && allHavePromptIdentity
    && promptIds.size === 1
    && promptHashes.size === 1
  );

  const promptIdentity = promptIds.size === 1 && promptHashes.size === 1 && allHavePromptIdentity
    ? { id: [...promptIds][0] as string, hash: [...promptHashes][0] as string }
    : null;
  const representative = candidates[0]?.result ?? neutralStyleReference(style);
  const eligibleResults = comparisonEligible
    ? [...new Map(candidates.map(({ result }) => [result.provider.id, result])).values()]
    : representative ? [representative] : [];

  return {
    mode: comparisonEligible ? "comparison" : "single-result",
    comparisonEligible,
    promptIdentity,
    representative,
    results: eligibleResults,
    comparison: comparisonEligible ? {
      winner: style.winner,
      observation: style.observation,
      scores: style.scores,
    } : null,
  };
}

type CanonicalEvidenceData = {
  recipes: Array<{
    id: string;
    slug: string;
    provenance?: {
      author?: string;
      sourceReference?: string;
    };
  }>;
  generationRuns: EvidenceRun[];
  assets: EvidenceAsset[];
};

const canonicalEvidence = rawEvidence as CanonicalEvidenceData;

export function evidenceForStyle(style: StyleRecord): StyleEvidence {
  const recipe = canonicalEvidence.recipes.find((candidate) => candidate.slug === style.slug);
  const runs = recipe
    ? canonicalEvidence.generationRuns.filter((run) => run.recipeId === recipe.id)
    : [];
  return deriveStyleEvidence({ style, runs, assets: canonicalEvidence.assets });
}

export function promptSourceForStyle(style: StyleRecord) {
  const provenance = canonicalEvidence.recipes.find((candidate) => candidate.slug === style.slug)?.provenance;
  const reference = provenance?.sourceReference?.trim();
  if (!reference) return null;

  return {
    author: provenance?.author || "Không xác định",
    reference,
    url: `https://github.com/leky90/promptatlas/blob/main/${reference}`,
  };
}
