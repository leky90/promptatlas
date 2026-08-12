import {
  captureOutputAsset,
  captureRawResponse,
  createAttemptRecord,
} from "./core.mjs";
import { requireRouteCell, resolveArtifactPath } from "./runtime.mjs";

export function createCodexRequestEnvelope(plan, cellId) {
  const cell = requireRouteCell(plan, cellId, "codex");
  return {
    cellId: cell.id,
    productRoute: structuredClone(cell.route),
    exactPrompt: structuredClone(plan.exactPrompt),
    request: structuredClone(cell.invocation),
    stageOutputAs: cell.outputPath,
    executionBoundary: "Run request.tool in Codex, then stage the returned original image and raw response below .artifacts before recording the attempt.",
  };
}

export async function recordCodexCell({
  plan,
  cellId,
  repositoryRoot,
  imagePath,
  responsePath,
  startedAt,
  completedAt,
  attempt = 1,
  previousAttempt,
  retryClass,
}) {
  requireRouteCell(plan, cellId, "codex");
  const image = resolveArtifactPath(repositoryRoot, imagePath, "Codex image output");
  const response = resolveArtifactPath(repositoryRoot, responsePath, "Codex raw response");
  const outputAsset = await captureOutputAsset(image.absolutePath, repositoryRoot);
  const rawResponse = await captureRawResponse(response.absolutePath, repositoryRoot, "codex-tool");
  return createAttemptRecord({
    plan,
    cellId,
    startedAt,
    completedAt,
    attempt,
    originalOutputs: [outputAsset],
    moderation: {
      status: "not-reported",
      categories: [],
      note: "The Codex image generation tool contract did not return machine-readable moderation categories to this adapter.",
    },
    outcome: "success",
    quotaUsage: {
      mode: "subscription-included",
      units: 1,
      unitName: "image-result",
      apiCostUsd: 0,
      note: "The image was generated through the Codex product capability; no OpenAI API call or API billing path was used.",
    },
    rawResponse,
    previousAttempt,
    retryClass,
  });
}
