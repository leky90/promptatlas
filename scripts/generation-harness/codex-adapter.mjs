import {
  captureOutputAsset,
  captureRawResponse,
  createAttemptRecord,
  assertPlanSafety,
  assertRetryAllowed,
  expectedAttemptPaths,
} from "./core.mjs";
import { requireRouteCell, resolveArtifactPath } from "./runtime.mjs";

const defaultModeration = () => ({
  status: "not-reported",
  categories: [],
  note: "The Codex image generation tool contract did not return machine-readable moderation categories to this adapter.",
});

export function createCodexRequestEnvelope(plan, cellId, {
  attempt = 1,
  previousAttempt,
  retryClass,
} = {}) {
  assertPlanSafety(plan);
  const cell = requireRouteCell(plan, cellId, "codex");
  const retry = assertRetryAllowed({
    attempt,
    previousAttempt,
    retryClass,
    planId: plan.planId,
    cellId: cell.id,
  });
  const expectedPaths = expectedAttemptPaths(plan, cell.id, attempt);
  return {
    cellId: cell.id,
    attempt,
    productRoute: structuredClone(cell.route),
    exactPrompt: structuredClone(plan.exactPrompt),
    request: structuredClone(cell.invocation),
    stageOutputAs: expectedPaths.image,
    stageResponseAs: expectedPaths.response,
    retry,
    executionBoundary: "Run request.tool in Codex, then stage the raw response and any returned original image at the declared .artifacts paths before recording the attempt.",
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
  outcome = "success",
  moderation = defaultModeration(),
  failure,
  previousAttempt,
  retryClass,
}) {
  assertPlanSafety(plan);
  const cell = requireRouteCell(plan, cellId, "codex");
  assertRetryAllowed({
    attempt,
    previousAttempt,
    retryClass,
    planId: plan.planId,
    cellId: cell.id,
  });
  const expectedPaths = expectedAttemptPaths(plan, cell.id, attempt);
  let image;
  if (imagePath) {
    image = resolveArtifactPath(repositoryRoot, imagePath, "Codex image output");
    if (image.relativePath !== expectedPaths.image) {
      throw new Error(`Codex image must use deterministic Codex image path ${expectedPaths.image}`);
    }
  }
  const response = resolveArtifactPath(repositoryRoot, responsePath, "Codex raw response");
  if (response.relativePath !== expectedPaths.response) {
    throw new Error(`Codex raw response must use deterministic path ${expectedPaths.response}`);
  }
  let outputAsset;
  if (image) {
    outputAsset = await captureOutputAsset(image.absolutePath, repositoryRoot);
  }
  if (outcome === "success" && !outputAsset) throw new Error("successful Codex attempts require the deterministic image output");
  if (outcome !== "success" && !failure) throw new Error("non-success Codex attempts require failure evidence");
  const rawResponse = await captureRawResponse(response.absolutePath, repositoryRoot, "codex-tool");
  return createAttemptRecord({
    plan,
    cellId,
    startedAt,
    completedAt,
    attempt,
    originalOutputs: outputAsset ? [outputAsset] : [],
    moderation,
    outcome,
    quotaUsage: {
      mode: "subscription-included",
      units: 1,
      unitName: "tool-attempt",
      apiCostUsd: 0,
      note: "The attempt used the Codex product capability; no OpenAI API call or API billing path was used.",
    },
    rawResponse,
    failure,
    previousAttempt,
    retryClass,
  });
}
