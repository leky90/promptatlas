import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  captureOutputAsset,
  captureRawResponse,
  createAttemptRecord,
  assertPlanSafety,
  assertRetryAllowed,
  expectedAttemptPaths,
} from "./core.mjs";
import {
  requireRouteCell,
  resolveArtifactPath,
  writeJsonAtomic,
} from "./runtime.mjs";

const execFile = promisify(execFileCallback);

const commandOptions = (cwd) => ({
  cwd,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
  timeout: 10 * 60 * 1000,
});

const parseGflowVersion = (stdout) => {
  const match = String(stdout).match(/\bversion\s+([^\s]+)/i);
  if (!match) throw new Error(`could not parse gflow version from: ${String(stdout).trim()}`);
  return match[1];
};

export async function inspectGflowEnvironment({
  repositoryRoot = process.cwd(),
  executable = "gflow",
  runner = execFile,
} = {}) {
  const [versionResult, catalogResult] = await Promise.all([
    runner(executable, ["--version"], commandOptions(repositoryRoot)),
    runner(executable, ["models", "--json"], commandOptions(repositoryRoot)),
  ]);
  const catalog = JSON.parse(catalogResult.stdout);
  const model = catalog.image?.models?.find((item) => item.name === "GEM_PIX_2");
  if (!model || !model.aliases?.includes("nano-pro")) {
    throw new Error("gflow catalog does not expose GEM_PIX_2 with the nano-pro alias");
  }
  return {
    environment: {
      gflowCliVersion: parseGflowVersion(versionResult.stdout),
      gflowCatalogName: model.name,
      gflowAlias: "nano-pro",
    },
    supportedAspects: (catalog.image?.aspects ?? []).map((item) => item.ratio),
  };
}

export function verifyGflowEnvironment(expected, inspected, { requiredAspects = [] } = {}) {
  const actual = inspected.environment;
  for (const field of ["gflowCliVersion", "gflowCatalogName", "gflowAlias"]) {
    if (actual[field] !== expected[field]) {
      throw new Error(`gflow environment drift: expected ${field}=${expected[field]}, received ${actual[field]}`);
    }
  }
  for (const ratio of requiredAspects) {
    if (!inspected.supportedAspects.includes(ratio)) {
      throw new Error(`gflow aspect-ratio capability drift: ${ratio} is not exposed by the inspected catalog`);
    }
  }
}

const invocationForAttempt = (cell, outputPath) => {
  const args = [...cell.invocation.arguments];
  const outputIndex = args.indexOf("--output");
  if (outputIndex < 0 || !args[outputIndex + 1]) throw new Error("gflow invocation is missing --output");
  args[outputIndex + 1] = outputPath;
  return { executable: cell.invocation.executable, arguments: args };
};

const errorEvidence = (error) => ({
  name: error?.name ?? "Error",
  message: error?.message ?? String(error),
  code: error?.code === undefined ? null : String(error.code),
  signal: error?.signal ?? null,
  stdout: error?.stdout ?? "",
  stderr: error?.stderr ?? "",
});

const moderationNotReported = (note) => ({ status: "not-reported", categories: [], note });

export const classifyGflowFailure = (evidence) => {
  const text = [
    evidence?.code,
    evidence?.signal,
    evidence?.message,
    evidence?.stdout,
    evidence?.stderr,
  ].filter(Boolean).join(" ");
  if (/content[ -]?policy|safety (?:policy|filter)|blocked by safety|moderation|policy violation/i.test(text)) {
    return {
      recognized: true,
      outcome: "moderated",
      moderation: {
        status: "blocked",
        categories: ["provider-safety"],
        note: "gflow returned text evidence that the provider safety policy blocked the request.",
      },
      failure: { classification: "moderation", retryable: false },
    };
  }
  if (/\brefus(?:al|ed|es|ing)\b|cannot (?:create|generate)|unable to (?:create|generate) this/i.test(text)) {
    return {
      recognized: true,
      outcome: "refusal",
      moderation: moderationNotReported("gflow returned refusal evidence without machine-readable moderation categories."),
      failure: { classification: "refusal", retryable: false },
    };
  }
  if (/auth(?:entication|orization)?|login|required subscription|quota|billing|permission|forbidden|invalid (?:argument|request)|usage error|ENOENT/i.test(text)) {
    return {
      recognized: true,
      outcome: "failure",
      moderation: moderationNotReported("gflow failed for a non-transient reason before moderation evidence was available."),
      failure: { classification: "unknown", retryable: false },
    };
  }
  if (/ETIMEDOUT|ECONN(?:RESET|REFUSED|ABORTED)|ENETUNREACH|EAI_AGAIN|network|socket|timed out/i.test(text)) {
    return {
      recognized: true,
      outcome: "failure",
      moderation: moderationNotReported("gflow failed at the transport boundary before moderation evidence was available."),
      failure: { classification: "transport", retryable: true },
    };
  }
  if (/temporar(?:y|ily)|service unavailable|backend unavailable|try again|rate limit/i.test(text)) {
    return {
      recognized: true,
      outcome: "failure",
      moderation: moderationNotReported("gflow returned explicit transient-provider failure evidence."),
      failure: { classification: "provider-transient", retryable: true },
    };
  }
  return {
    recognized: false,
    outcome: "failure",
    moderation: moderationNotReported("gflow failure evidence did not match an approved technical retry class."),
    failure: { classification: "unknown", retryable: false },
  };
};

const assertArtifactDoesNotExist = async (filePath) => {
  try {
    await access(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`attempt artifact already exists: ${filePath}`);
};

export async function executeGflowCell({
  plan,
  cellId,
  repositoryRoot,
  authorization,
  attempt = 1,
  previousAttempt,
  retryClass,
  executable = "gflow",
  runner = execFile,
  inspector = inspectGflowEnvironment,
  clock = () => new Date(),
}) {
  if (authorization?.productQuota !== true || authorization?.apiSpendUsd !== 0) {
    throw new Error("gflow execution requires explicit product-quota acknowledgement and an API spend limit of USD 0");
  }
  assertPlanSafety(plan);
  const cell = requireRouteCell(plan, cellId, "gflow-cli");
  if (!cell.executionEligibility.eligible) {
    throw new Error(`cell ${cellId} is ineligible: ${cell.executionEligibility.reasons.join(" ")}`);
  }
  assertRetryAllowed({
    attempt,
    previousAttempt,
    retryClass,
    planId: plan.planId,
    cellId: cell.id,
  });

  const inspection = await inspector({ repositoryRoot, executable, runner });
  const appliedAspect = cell.settings.find((item) => item.name === "aspect-ratio" && item.supportStatus === "supported")?.appliedValue;
  verifyGflowEnvironment(plan.environment, inspection, {
    requiredAspects: appliedAspect ? [appliedAspect] : [],
  });

  const expectedPaths = expectedAttemptPaths(plan, cell.id, attempt);
  const output = resolveArtifactPath(repositoryRoot, expectedPaths.image, "gflow image output");
  const response = resolveArtifactPath(repositoryRoot, expectedPaths.response, "gflow raw response");
  const invocation = invocationForAttempt(cell, output.relativePath);
  await mkdir(path.dirname(output.absolutePath), { recursive: true });
  await Promise.all([
    assertArtifactDoesNotExist(output.absolutePath),
    assertArtifactDoesNotExist(response.absolutePath),
  ]);
  const startedAt = clock().toISOString();
  let result;

  try {
    result = await runner(
      executable,
      invocation.arguments,
      commandOptions(repositoryRoot),
    );
  } catch (error) {
    const rawRecord = {
      adapter: "gflow-cli",
      executable,
      arguments: invocation.arguments,
      exitCode: error?.code ?? null,
      error: errorEvidence(error),
    };
    await writeJsonAtomic(response.absolutePath, rawRecord);
    const classification = classifyGflowFailure(rawRecord.error);
    const completedAt = clock().toISOString();
    return createAttemptRecord({
      plan,
      cellId,
      startedAt,
      completedAt,
      attempt,
      moderation: classification.moderation,
      outcome: classification.outcome,
      quotaUsage: {
        mode: "not-recorded",
        apiCostUsd: 0,
        note: "The failed command did not expose reliable provider quota consumption; API cost remained USD 0.",
      },
      rawResponse: await captureRawResponse(response.absolutePath, repositoryRoot, "gflow-cli"),
      failure: { ...classification.failure, message: error?.message ?? String(error) },
      previousAttempt,
      retryClass,
    });
  }

  const rawRecord = {
    adapter: "gflow-cli",
    executable,
    arguments: invocation.arguments,
    exitCode: 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
  await writeJsonAtomic(response.absolutePath, rawRecord);

  let outputAsset;
  try {
    outputAsset = await captureOutputAsset(output.absolutePath, repositoryRoot);
  } catch (error) {
    const classification = classifyGflowFailure(rawRecord);
    const classifiedProviderResult = classification.recognized;
    const completedAt = clock().toISOString();
    return createAttemptRecord({
      plan,
      cellId,
      startedAt,
      completedAt,
      attempt,
      moderation: classifiedProviderResult
        ? classification.moderation
        : moderationNotReported("gflow returned without a valid staged image or machine-readable moderation result."),
      outcome: classifiedProviderResult ? classification.outcome : "failure",
      quotaUsage: {
        mode: "not-recorded",
        apiCostUsd: 0,
        note: "The command returned but no valid staged output could be captured; provider quota usage is unknown.",
      },
      rawResponse: await captureRawResponse(response.absolutePath, repositoryRoot, "gflow-cli"),
      failure: classifiedProviderResult
        ? { ...classification.failure, message: error.message }
        : { classification: "corrupt-output", retryable: true, message: error.message },
      previousAttempt,
      retryClass,
    });
  }

  const completedAt = clock().toISOString();
  return createAttemptRecord({
    plan,
    cellId,
    startedAt,
    completedAt,
    attempt,
    originalOutputs: [outputAsset],
    moderation: moderationNotReported("gflow-cli returned no machine-readable moderation categories."),
    outcome: "success",
    quotaUsage: {
      mode: "provider-quota",
      units: 1,
      unitName: "image-request",
      apiCostUsd: 0,
      note: "One image request was executed through the installed gflow product session; no API endpoint or API billing path was used.",
    },
    rawResponse: await captureRawResponse(response.absolutePath, repositoryRoot, "gflow-cli"),
    previousAttempt,
    retryClass,
  });
}
