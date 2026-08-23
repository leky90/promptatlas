import rawEvidence from "../data/prompt-atlas.image.v1.json" with { type: "json" };

import type { ProviderScores, StyleRecord } from "./styles";

type ModelVersion = {
  status?: string;
  identifier?: string;
  source?: string;
  reason?: string;
};

type EvidenceSetting = {
  name?: string;
  requestedValue?: string;
  appliedValue?: string;
  supportStatus?: string;
  note?: string;
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
    identityStatus?: string;
    modelFamily?: string;
    modelVersion?: ModelVersion;
  };
  settings?: EvidenceSetting[];
  selectionPolicy?: string;
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

type ComparativeStyle = Pick<StyleRecord, "observation" | "scores"> & Partial<Pick<StyleRecord, "images" | "name">> & {
  slug?: string;
};

export type ComparisonScoreKey = "chatgpt" | "gemini";
export type ComparisonProviderScores = Omit<ProviderScores, "average">;
export type ComparisonScores = Record<ComparisonScoreKey, ComparisonProviderScores>;

export type EvidenceResult = {
  scoreKey: ComparisonScoreKey | null;
  provider: { id: string; label: string };
  model: {
    family: string;
    version: string;
    identityStatus: string;
    versionStatus: string;
    disclosure: string;
  };
  pipeline: { id: string; label: string; interface: string };
  settings: Array<{
    name: string;
    requestedValue: string;
    appliedValue: string;
    supportStatus: string;
    note: string;
  }>;
  selectionPolicy: string;
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

type ScoreMetricKey = keyof Omit<ProviderScores, "average">;

export const scoreAxes: Array<{
  id: "adherence" | "aesthetics" | "artifacts";
  label: string;
  description: string;
  metrics: Array<[ScoreMetricKey, string]>;
}> = [
  {
    id: "adherence",
    label: "Tuân thủ prompt",
    description: "Đọc riêng mức độ output đáp ứng yêu cầu đã ghi trong exact prompt.",
    metrics: [["promptAdherence", "Bám prompt"]],
  },
  {
    id: "aesthetics",
    label: "Chất lượng thẩm mỹ",
    description: "Đọc phong cách, bố cục và độ hoàn thiện; không trộn với tuân thủ prompt.",
    metrics: [
      ["styleFidelity", "Đúng phong cách"],
      ["composition", "Bố cục"],
      ["technicalQuality", "Kỹ thuật"],
    ],
  },
  {
    id: "artifacts",
    label: "Artifact",
    description: "Điểm toàn vẹn chi tiết: 10 nghĩa là ít artifact hơn; đây không phải thang severity gốc.",
    metrics: [["detailIntegrity", "Toàn vẹn chi tiết (10 = ít artifact)"]],
  },
];

const comparisonUncertainty = [
  "Mỗi product route chỉ có một output cho mỗi prompt; chưa có repeat để ước lượng độ ổn định.",
  "Model identity và applied settings của dữ liệu lịch sử không đồng nhất; giá trị thiếu hoặc unknown không so sánh được.",
  "Điểm là annotation khám phá trên output đã chọn, không phải benchmark mù hay bảng xếp hạng model.",
];

export type StyleEvidence = {
  mode: "comparison" | "single-result";
  comparisonEligible: boolean;
  promptIdentity: { id: string; hash: string } | null;
  prompt: { id: string; hash: string; text: string } | null;
  representative: EvidenceResult | null;
  results: EvidenceResult[];
  comparison: {
    classification: "historical-product-route-diagnostic";
    rationale: string;
    scores: ComparisonScores;
    results: Record<ComparisonScoreKey, EvidenceResult>;
    axes: typeof scoreAxes;
    uncertainty: string[];
  } | null;
};

const providerId = (provider: string) => provider
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/(^-|-$)/gu, "");

const scoreKeyForRoute = (route: EvidenceRun["productRoute"], provider: string): ComparisonScoreKey | null => {
  if (provider === "OpenAI" && route?.id === "legacy-chatgpt-ui") return "chatgpt";
  if (provider === "Google" && route?.id === "legacy-gflow-cli") return "gemini";
  return null;
};

const comparisonScores = (scores: StyleRecord["scores"]): ComparisonScores => ({
  chatgpt: {
    promptAdherence: scores.chatgpt.promptAdherence,
    styleFidelity: scores.chatgpt.styleFidelity,
    composition: scores.chatgpt.composition,
    technicalQuality: scores.chatgpt.technicalQuality,
    detailIntegrity: scores.chatgpt.detailIntegrity,
  },
  gemini: {
    promptAdherence: scores.gemini.promptAdherence,
    styleFidelity: scores.gemini.styleFidelity,
    composition: scores.gemini.composition,
    technicalQuality: scores.gemini.technicalQuality,
    detailIntegrity: scores.gemini.detailIntegrity,
  },
});

const modelVersionLabel = (version?: ModelVersion) => {
  if (version?.identifier) return version.identifier;
  if (version?.status === "unavailable") return "Không công khai";
  return version?.status || "Không xác định";
};

const modelDisclosure = (version?: ModelVersion) => (
  version?.reason || version?.source || "Không có ghi chú disclosure."
);

const normalizeSettings = (settings?: EvidenceSetting[]): EvidenceResult["settings"] => (settings ?? []).map((setting) => ({
  name: setting.name || "setting-không-xác-định",
  requestedValue: setting.requestedValue || "Không ghi nhận",
  appliedValue: setting.appliedValue || "Không có snapshot đáng tin cậy",
  supportStatus: setting.supportStatus || "unknown",
  note: setting.note || "Không có ghi chú.",
}));

const toResult = (run: EvidenceRun, assetsById: Map<string, EvidenceAsset>): EvidenceResult | null => {
  if (run.outcome !== "success") return null;

  const asset = (run.outputAssetIds ?? [])
    .map((assetId) => assetsById.get(assetId))
    .find((candidate) => candidate?.kind === "image" && candidate.path);
  const route = run.productRoute;
  const provider = route?.provider?.trim();
  if (!asset || !provider) return null;

  return {
    scoreKey: scoreKeyForRoute(route, provider),
    provider: { id: providerId(provider), label: provider },
    model: {
      family: route?.modelFamily || "Không xác định",
      version: modelVersionLabel(route?.modelVersion),
      identityStatus: route?.identityStatus || "unknown",
      versionStatus: route?.modelVersion?.status || "unknown",
      disclosure: modelDisclosure(route?.modelVersion),
    },
    pipeline: {
      id: route?.id || "unknown-pipeline",
      label: route?.displayName || route?.id || "Pipeline không xác định",
      interface: route?.interface || "unknown",
    },
    settings: normalizeSettings(run.settings),
    selectionPolicy: run.selectionPolicy || "Không ghi nhận",
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
    scoreKey: null,
    provider: { id: "neutral", label: "Chưa xác minh" },
    model: {
      family: "Chưa xác minh",
      version: "Không áp dụng",
      identityStatus: "unverified-reference",
      versionStatus: "unavailable",
      disclosure: "Ảnh tham chiếu không có generation run đã xác minh.",
    },
    pipeline: { id: "unverified-reference", label: "Ảnh tham chiếu", interface: "not-verified" },
    settings: [],
    selectionPolicy: "Không áp dụng",
    result: {
      id: referenceId,
      runId: "not-available",
      path: image.full,
      thumbnailPath: image.thumb,
      width: image.width,
      height: image.height,
      alt: image.alt || `${style.name || "Phong cách"} — ảnh tham chiếu trung tính.`,
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
    Boolean(run.recipeId?.trim())
    && Boolean(run.exactPrompt?.sha256?.trim())
    && Boolean(run.exactPrompt?.text?.trim())
  ));
  const distinctProviders = new Set(candidates.map(({ result }) => result.provider.id));
  const chatgptCandidates = candidates.filter(({ result }) => result.scoreKey === "chatgpt");
  const geminiCandidates = candidates.filter(({ result }) => result.scoreKey === "gemini");
  const hasUnambiguousRoutePair = (
    candidates.length === 2
    && chatgptCandidates.length === 1
    && geminiCandidates.length === 1
  );
  const comparisonEligible = (
    hasUnambiguousRoutePair
    && distinctProviders.size >= 2
    && allHavePromptIdentity
    && promptIds.size === 1
    && promptHashes.size === 1
  );

  const promptIdentity = promptIds.size === 1 && promptHashes.size === 1 && allHavePromptIdentity
    ? { id: [...promptIds][0] as string, hash: [...promptHashes][0] as string }
    : null;
  const promptText = candidates[0]?.run.exactPrompt?.text?.trim();
  const prompt = promptIdentity && promptText
    ? { ...promptIdentity, text: promptText }
    : null;
  const representative = candidates[0]?.result ?? neutralStyleReference(style);
  const chatgptResult = chatgptCandidates[0]?.result;
  const geminiResult = geminiCandidates[0]?.result;
  const comparisonResults: Record<ComparisonScoreKey, EvidenceResult> | null = comparisonEligible && chatgptResult && geminiResult
    ? { chatgpt: chatgptResult, gemini: geminiResult }
    : null;
  const eligibleResults = comparisonResults
    ? [comparisonResults.chatgpt, comparisonResults.gemini]
    : representative ? [representative] : [];

  return {
    mode: comparisonEligible ? "comparison" : "single-result",
    comparisonEligible,
    promptIdentity,
    prompt,
    representative,
    results: eligibleResults,
    comparison: comparisonResults ? {
      classification: "historical-product-route-diagnostic",
      rationale: style.observation,
      scores: comparisonScores(style.scores),
      results: comparisonResults,
      axes: scoreAxes,
      uncertainty: comparisonUncertainty,
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
  const evidenceSlug = [style.slug, ...style.legacySlugs].find((slug) => canonicalEvidence.recipes.some((candidate) => candidate.slug === slug));
  const recipe = canonicalEvidence.recipes.find((candidate) => candidate.slug === evidenceSlug);
  const runs = recipe
    ? canonicalEvidence.generationRuns.filter((run) => run.recipeId === recipe.id)
    : [];
  return deriveStyleEvidence({ style, runs, assets: canonicalEvidence.assets });
}

export function promptSourceForStyle(style: StyleRecord) {
  const provenance = canonicalEvidence.recipes.find((candidate) => candidate.slug === style.slug || style.legacySlugs.includes(candidate.slug))?.provenance;
  const reference = provenance?.sourceReference?.trim();
  if (!reference) return null;

  return {
    author: provenance?.author || "Không xác định",
    reference,
    url: `https://github.com/leky90/promptatlas/blob/main/${reference}`,
  };
}
