import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import sharp from "sharp";

import {
  ROUTE_IDS,
  assertInvocationSafety,
  buildRouteInvocation,
  createProductRouteSnapshot,
  executionEligibility,
  resolveRouteSettings,
} from "./product-routes.mjs";

export const HARNESS_SCHEMA_URL = "https://promptatlas.ldktech.com/schemas/image-generation-harness.v1.schema.json";
export const APPROVED_POLICY = Object.freeze({
  mediaType: "image",
  apiSpendUsdLimit: 0,
  plannedOutputsPerRoute: 72,
  technicalRetryLimitTotal: 14,
  technicalRetryLimitPerCell: 1,
  retryableFailureClasses: ["transport", "corrupt-output", "provider-transient"],
  selectionPolicy: "all-attempts",
});

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const sha256Text = (value) => sha256(Buffer.from(value, "utf8"));

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const canonicalConfig = (config) => {
  const { $schema: _ignored, ...payload } = config;
  return payload;
};

export function createHarnessValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return (document) => {
    const valid = validate(document);
    return {
      valid,
      errors: (validate.errors ?? []).map((error) => ({
        path: error.instancePath || "/",
        message: error.message ?? "schema validation failed",
      })),
    };
  };
}

export function assertApprovedConfig(config) {
  const expectedRoutes = [ROUTE_IDS.codex, ROUTE_IDS.gflow].sort();
  const actualRoutes = [...config.routeIds].sort();
  if (JSON.stringify(actualRoutes) !== JSON.stringify(expectedRoutes)) {
    throw new Error("the image pilot requires exactly Codex Image Generation and gflow nano-pro routes");
  }
  if (config.repeats !== 3) throw new Error("the approved comparison requires exactly three repeats per route");
  if (config.settings.mediaType !== "image") throw new Error("video generation is outside the approved scope");
  if (config.settings.count !== 1) throw new Error("each attempt must capture exactly one output; repeats are separate cells");
  const duplicateControls = config.settings.controls
    .map((item) => item.name)
    .filter((name, index, values) => values.indexOf(name) !== index);
  if (duplicateControls.length) throw new Error(`duplicate requested control ${duplicateControls[0]}`);
  if (config.environment.gflowCatalogName !== "GEM_PIX_2" || config.environment.gflowAlias !== "nano-pro") {
    throw new Error("gflow route identity must remain GEM_PIX_2/nano-pro");
  }
  if (config.environment.codexTool !== "image_gen.imagegen") {
    throw new Error("Codex route must remain image_gen.imagegen");
  }
}

export function buildGenerationPlan(config) {
  assertApprovedConfig(config);
  const prompt = {
    language: "en",
    text: config.testCase.exactPrompt.text,
    sha256: sha256Text(config.testCase.exactPrompt.text),
  };
  const digest = sha256(Buffer.from(stableJson(canonicalConfig(config)), "utf8")).slice(0, 24);
  const planId = `plan.${digest}`;
  const routeOrder = [ROUTE_IDS.codex, ROUTE_IDS.gflow];
  const cells = [];

  for (const routeId of routeOrder) {
    const route = createProductRouteSnapshot(routeId, config.environment);
    const settings = resolveRouteSettings(routeId, config.settings);
    for (let repeat = 1; repeat <= config.repeats; repeat += 1) {
      const cellId = `cell.${config.testCase.id}.${routeId}.r${repeat}`;
      const outputPath = `.artifacts/generation-runs/${planId}/${cellId}/attempt-1.png`;
      const cell = {
        id: cellId,
        route,
        repeat,
        settings,
        executionEligibility: executionEligibility(routeId, settings),
        invocation: buildRouteInvocation({ routeId, exactPrompt: prompt, settings, outputPath }),
        outputPath,
      };
      assertInvocationSafety(cell);
      cells.push(cell);
    }
  }

  return {
    $schema: HARNESS_SCHEMA_URL,
    kind: "image-generation-plan",
    schemaVersion: "1.0.0",
    planId,
    createdAt: config.frozenAt,
    testCase: structuredClone(config.testCase),
    exactPrompt: prompt,
    policy: structuredClone(APPROVED_POLICY),
    environment: structuredClone(config.environment),
    cells,
  };
}

export function assertPlanSafety(plan) {
  if (stableJson(plan.policy) !== stableJson(APPROVED_POLICY)) {
    throw new Error("generation plan policy differs from the approved image benchmark policy");
  }
  if (plan.cells.length !== 6) throw new Error("one test case must produce two routes × three repeat cells");
  if (plan.exactPrompt.text !== plan.testCase.exactPrompt.text) throw new Error("plan exact prompt differs from its frozen test case");
  if (plan.exactPrompt.sha256 !== sha256Text(plan.exactPrompt.text)) throw new Error("plan exact prompt checksum is invalid");

  for (const routeId of [ROUTE_IDS.codex, ROUTE_IDS.gflow]) {
    const routeCells = plan.cells.filter((cell) => cell.route.id === routeId);
    if (routeCells.length !== 3) throw new Error(`route ${routeId} must have exactly three independent cells`);
    if (stableJson(routeCells.map((cell) => cell.repeat).sort()) !== stableJson([1, 2, 3])) {
      throw new Error(`route ${routeId} must contain repeats 1, 2 and 3 exactly once`);
    }
    const expectedRoute = createProductRouteSnapshot(routeId, plan.environment);
    const frozenSettings = stableJson(routeCells[0].settings);
    for (const cell of routeCells) {
      if (stableJson(cell.route) !== stableJson(expectedRoute)) throw new Error(`route identity drift in ${cell.id}`);
      if (stableJson(cell.settings) !== frozenSettings) throw new Error(`settings drift between repeats in ${cell.id}`);
      const names = cell.settings.map((item) => item.name);
      if (new Set(names).size !== names.length) throw new Error(`duplicate setting in ${cell.id}`);
      const mediaType = cell.settings.find((item) => item.name === "media-type");
      const count = cell.settings.find((item) => item.name === "count");
      const aspect = cell.settings.find((item) => item.name === "aspect-ratio");
      if (mediaType?.requestedValue !== "image" || mediaType.appliedValue !== "image" || mediaType.supportStatus !== "supported") {
        throw new Error(`invalid image-only media setting in ${cell.id}`);
      }
      if (count?.requestedValue !== 1 || count.appliedValue !== 1 || count.supportStatus !== "supported") {
        throw new Error(`invalid single-output setting in ${cell.id}`);
      }
      if (!aspect) throw new Error(`missing aspect-ratio evidence in ${cell.id}`);
      if (routeId === ROUTE_IDS.codex && (aspect.supportStatus !== "unsupported" || "appliedValue" in aspect)) {
        throw new Error(`Codex aspect ratio must be recorded as unsupported in ${cell.id}`);
      }
      for (const item of cell.settings.filter((setting) => !["media-type", "aspect-ratio", "count"].includes(setting.name))) {
        if (item.supportStatus !== "unsupported" || "appliedValue" in item) {
          throw new Error(`unsupported control ${item.name} was silently normalized in ${cell.id}`);
        }
      }
      if (cell.id !== `cell.${plan.testCase.id}.${routeId}.r${cell.repeat}`) throw new Error(`non-deterministic cell id ${cell.id}`);
      const expectedOutput = `.artifacts/generation-runs/${plan.planId}/${cell.id}/attempt-1.png`;
      if (cell.outputPath !== expectedOutput) throw new Error(`non-deterministic output path in ${cell.id}`);
      if (stableJson(cell.executionEligibility) !== stableJson(executionEligibility(routeId, cell.settings))) {
        throw new Error(`execution eligibility drift in ${cell.id}`);
      }
      if (cell.invocation.kind === "codex-tool-request" && cell.invocation.arguments.prompt !== plan.exactPrompt.text) {
        throw new Error(`Codex prompt drift in ${cell.id}`);
      }
      if (cell.invocation.kind === "cli") {
        if (cell.invocation.arguments[2] !== plan.exactPrompt.text) throw new Error(`gflow prompt drift in ${cell.id}`);
        const outputIndex = cell.invocation.arguments.indexOf("--output");
        if (cell.invocation.arguments[outputIndex + 1] !== cell.outputPath) throw new Error(`gflow output path drift in ${cell.id}`);
      }
      assertInvocationSafety(cell);
    }
  }
}

export function expectedAttemptPaths(plan, cellId, attempt = 1) {
  if (attempt !== 1 && attempt !== 2) throw new Error("attempt paths support only attempts 1 and 2");
  const cell = plan.cells.find((item) => item.id === cellId);
  if (!cell) throw new Error(`unknown plan cell ${cellId}`);
  const directory = `.artifacts/generation-runs/${plan.planId}/${cell.id}`;
  const responseKind = cell.route.interface === "codex" ? "codex" : "gflow";
  return {
    image: `${directory}/attempt-${attempt}.png`,
    response: `${directory}/attempt-${attempt}.${responseKind}-response.json`,
  };
}

const expectedAttemptPathsFromRecord = (attempt) => {
  const directory = `.artifacts/generation-runs/${attempt.planId}/${attempt.cellId}`;
  const responseKind = attempt.productRoute.id === ROUTE_IDS.codex ? "codex" : "gflow";
  return {
    image: `${directory}/attempt-${attempt.attempt}.png`,
    response: `${directory}/attempt-${attempt.attempt}.${responseKind}-response.json`,
    responseSource: attempt.productRoute.id === ROUTE_IDS.codex ? "codex-tool" : "gflow-cli",
  };
};

export function assertAttemptSafety(attempt) {
  if (attempt.exactPrompt.text !== attempt.testCase.exactPrompt.text) throw new Error("attempt prompt differs from its frozen test case");
  if (attempt.exactPrompt.sha256 !== sha256Text(attempt.exactPrompt.text)) throw new Error("attempt prompt checksum is invalid");
  if (attempt.attemptId !== `${attempt.cellId}.a${attempt.attempt}`) throw new Error("attempt id is not derived from its cell and attempt number");
  if (attempt.quotaUsage.apiCostUsd !== 0) throw new Error("API spend must remain USD 0");
  if (attempt.selectionPolicy !== "all-attempts") throw new Error("best-of selection is forbidden");
  if (attempt.productRoute.id === ROUTE_IDS.codex) {
    if (attempt.productRoute.modelVersion.status !== "unavailable") throw new Error("Codex model identity must remain unavailable without stronger evidence");
  } else if (attempt.productRoute.id === ROUTE_IDS.gflow) {
    if (
      attempt.productRoute.modelVersion.status !== "provider-alias"
      || attempt.productRoute.modelVersion.identifier !== "GEM_PIX_2/nano-pro"
    ) {
      throw new Error("gflow route identity must remain the GEM_PIX_2/nano-pro provider alias");
    }
  } else {
    throw new Error(`unsupported attempt route ${attempt.productRoute.id}`);
  }
  const expectedCellFragment = `.${attempt.productRoute.id}.`;
  if (!attempt.cellId.includes(expectedCellFragment)) throw new Error("attempt cell does not match its product route");
  const expectedPaths = expectedAttemptPathsFromRecord(attempt);
  if (attempt.originalOutputs.length > 1) throw new Error("an attempt can retain at most one original output");
  for (const output of attempt.originalOutputs) {
    if (output.path !== expectedPaths.image) throw new Error("attempt output does not match its deterministic cell path");
  }
  if (attempt.rawResponse.path !== expectedPaths.response) throw new Error("raw response does not match its deterministic cell path");
  if (attempt.rawResponse.source !== expectedPaths.responseSource) throw new Error("raw response source does not match its product route");
  if (attempt.attempt === 1 && attempt.retry.isRetry) throw new Error("first attempt cannot be marked as a retry");
  if (attempt.attempt === 2 && (!attempt.retry.isRetry || !attempt.retry.previousAttemptId)) {
    throw new Error("second attempt must retain first-attempt retry evidence");
  }
  if (attempt.outcome === "success" && attempt.failure) throw new Error("successful attempts cannot carry failure evidence");
  if (attempt.outcome !== "success" && !attempt.failure) throw new Error("non-success attempts require failure evidence");
  if (attempt.outcome === "refusal" && attempt.failure?.classification !== "refusal") {
    throw new Error("refusal outcomes require refusal failure evidence");
  }
  if (attempt.failure?.classification === "refusal" && attempt.outcome !== "refusal") {
    throw new Error("refusal classification requires a refusal outcome");
  }
  if (
    attempt.outcome === "moderated"
    && (
      attempt.failure?.classification !== "moderation"
      || !["flagged", "blocked"].includes(attempt.moderation.status)
    )
  ) {
    throw new Error("moderated outcomes require blocked or flagged moderation evidence");
  }
  if (attempt.failure?.retryable && !APPROVED_POLICY.retryableFailureClasses.includes(attempt.failure.classification)) {
    throw new Error(`failure class ${attempt.failure.classification} cannot be retried`);
  }
}

export function assertAttemptSetSafety(attempts) {
  const attemptsById = new Map();
  let retryCount = 0;
  const retriesByCell = new Map();
  for (const attempt of attempts) {
    assertAttemptSafety(attempt);
    if (attemptsById.has(attempt.attemptId)) throw new Error(`duplicate attempt ${attempt.attemptId}`);
    attemptsById.set(attempt.attemptId, attempt);
    if (attempt.retry.isRetry) {
      retryCount += 1;
      retriesByCell.set(attempt.cellId, (retriesByCell.get(attempt.cellId) ?? 0) + 1);
    }
  }
  if (retryCount > APPROVED_POLICY.technicalRetryLimitTotal) {
    throw new Error(`technical retry budget exceeded: ${retryCount}/${APPROVED_POLICY.technicalRetryLimitTotal}`);
  }
  for (const [cellId, count] of retriesByCell) {
    if (count > APPROVED_POLICY.technicalRetryLimitPerCell) throw new Error(`cell ${cellId} exceeds its retry budget`);
  }
  for (const attempt of attempts.filter((item) => item.retry.isRetry)) {
    const previousAttempt = attemptsById.get(attempt.retry.previousAttemptId);
    if (!previousAttempt) throw new Error(`retry ${attempt.attemptId} references a missing first attempt`);
    assertRetryAllowed({
      attempt: attempt.attempt,
      previousAttempt,
      retryClass: attempt.retry.reason,
      planId: attempt.planId,
      cellId: attempt.cellId,
    });
  }
}

const mimeTypeFor = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`unsupported image extension ${extension || "(none)"}`);
};

export async function captureOutputAsset(filePath, repositoryRoot) {
  const absolutePath = path.resolve(repositoryRoot, filePath);
  const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
  if (relativePath === ".." || relativePath.startsWith("../")) {
    throw new Error("generated outputs must be staged inside the repository worktree");
  }
  const [buffer, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  if (metadata.size < 1) throw new Error("generated output is empty");
  const imageMetadata = await sharp(buffer).metadata();
  if (!imageMetadata.width || !imageMetadata.height) throw new Error("generated output has no readable dimensions");
  const expectedMimeType = mimeTypeFor(absolutePath);
  const detectedMimeType = imageMetadata.format === "jpeg" ? "image/jpeg" : `image/${imageMetadata.format}`;
  if (detectedMimeType !== expectedMimeType) {
    throw new Error(`generated output extension declares ${expectedMimeType}, but content is ${detectedMimeType}`);
  }
  return {
    path: relativePath,
    mimeType: expectedMimeType,
    bytes: metadata.size,
    width: imageMetadata.width,
    height: imageMetadata.height,
    sha256: sha256(buffer),
  };
}

export async function captureRawResponse(filePath, repositoryRoot, source) {
  const absolutePath = path.resolve(repositoryRoot, filePath);
  const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
  if (relativePath === ".." || relativePath.startsWith("../")) {
    throw new Error("raw response records must be staged inside the repository worktree");
  }
  const buffer = await readFile(absolutePath);
  return { source, path: relativePath, sha256: sha256(buffer) };
}

export function assertRetryAllowed({ attempt, previousAttempt, retryClass, planId, cellId }) {
  if (attempt === 1) {
    if (previousAttempt || retryClass) throw new Error("first attempts cannot declare retry evidence");
    return { isRetry: false };
  }
  if (attempt !== 2) throw new Error("the approved policy permits at most one technical retry per cell");
  if (!previousAttempt || previousAttempt.attempt !== 1) throw new Error("retry attempt requires the immutable first attempt");
  if (previousAttempt.outcome !== "failure" || !previousAttempt.failure?.retryable) {
    throw new Error("valid, refused, moderated or low-adherence outputs cannot be retried");
  }
  assertAttemptSafety(previousAttempt);
  if (
    !planId
    || !cellId
    || previousAttempt.planId !== planId
    || previousAttempt.cellId !== cellId
    || previousAttempt.attemptId !== `${cellId}.a1`
  ) {
    throw new Error("retry evidence must come from attempt 1 of the same plan and cell");
  }
  if (!APPROVED_POLICY.retryableFailureClasses.includes(retryClass)) {
    throw new Error(`failure class ${retryClass} is not retryable`);
  }
  if (previousAttempt.failure.classification !== retryClass) {
    throw new Error("retry class must match the recorded failure classification");
  }
  return {
    isRetry: true,
    reason: retryClass,
    previousAttemptId: previousAttempt.attemptId,
  };
}

export function createAttemptRecord({
  plan,
  cellId,
  startedAt,
  completedAt,
  attempt = 1,
  originalOutputs = [],
  moderation,
  outcome,
  quotaUsage,
  rawResponse,
  failure,
  previousAttempt,
  retryClass,
}) {
  assertPlanSafety(plan);
  const cell = plan.cells.find((item) => item.id === cellId);
  if (!cell) throw new Error(`unknown plan cell ${cellId}`);
  if (new Date(completedAt) < new Date(startedAt)) throw new Error("completedAt cannot precede startedAt");
  if (quotaUsage.apiCostUsd !== 0) throw new Error("API spend must remain USD 0");
  if (outcome === "success" && originalOutputs.length === 0) throw new Error("successful attempts require an original output");
  if (outcome !== "success" && !failure) throw new Error("non-success attempts require failure evidence");
  const retry = assertRetryAllowed({
    attempt,
    previousAttempt,
    retryClass,
    planId: plan.planId,
    cellId: cell.id,
  });
  const record = {
    $schema: HARNESS_SCHEMA_URL,
    kind: "image-generation-attempt",
    schemaVersion: "1.0.0",
    attemptId: `${cell.id}.a${attempt}`,
    planId: plan.planId,
    cellId: cell.id,
    testCase: structuredClone(plan.testCase),
    productRoute: structuredClone(cell.route),
    exactPrompt: structuredClone(plan.exactPrompt),
    settings: structuredClone(cell.settings),
    startedAt,
    completedAt,
    attempt,
    selectionPolicy: "all-attempts",
    originalOutputs,
    moderation,
    outcome,
    quotaUsage,
    rawResponse,
    ...(failure ? { failure } : {}),
    retry,
  };
  assertAttemptSafety(record);
  return record;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
