import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  captureOutputAsset,
  captureRawResponse,
  createAttemptRecord,
  assertRetryAllowed,
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

export function verifyGflowEnvironment(expected, inspected) {
  const actual = inspected.environment;
  for (const field of ["gflowCliVersion", "gflowCatalogName", "gflowAlias"]) {
    if (actual[field] !== expected[field]) {
      throw new Error(`gflow environment drift: expected ${field}=${expected[field]}, received ${actual[field]}`);
    }
  }
}

const attemptOutputPath = (cell, attempt) => cell.outputPath.replace(/attempt-1(?=\.[^.]+$)/, `attempt-${attempt}`);
const responsePathFor = (outputPath, attempt) => outputPath.replace(/attempt-[0-9]+\.[^.]+$/, `attempt-${attempt}.gflow-response.json`);

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

const classifyExecutionFailure = (error) => {
  const evidence = `${error?.code ?? ""} ${error?.signal ?? ""} ${error?.message ?? ""}`;
  if (/ENOENT|ETIMEDOUT|ECONN|network|socket|signal|timed out/i.test(evidence)) return "transport";
  return "provider-transient";
};

const moderationNotReported = (note) => ({ status: "not-reported", categories: [], note });

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
  const cell = requireRouteCell(plan, cellId, "gflow-cli");
  if (!cell.executionEligibility.eligible) {
    throw new Error(`cell ${cellId} is ineligible: ${cell.executionEligibility.reasons.join(" ")}`);
  }
  assertRetryAllowed({ attempt, previousAttempt, retryClass });

  const inspection = await inspector({ repositoryRoot, executable, runner });
  verifyGflowEnvironment(plan.environment, inspection);

  const outputPath = attemptOutputPath(cell, attempt);
  const output = resolveArtifactPath(repositoryRoot, outputPath, "gflow image output");
  const response = resolveArtifactPath(repositoryRoot, responsePathFor(outputPath, attempt), "gflow raw response");
  const invocation = invocationForAttempt(cell, output.relativePath);
  await mkdir(path.dirname(output.absolutePath), { recursive: true });
  await Promise.all([
    assertArtifactDoesNotExist(output.absolutePath),
    assertArtifactDoesNotExist(response.absolutePath),
  ]);
  const startedAt = clock().toISOString();
  let rawRecord;

  try {
    const result = await runner(
      executable,
      invocation.arguments,
      commandOptions(repositoryRoot),
    );
    rawRecord = {
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
      const completedAt = clock().toISOString();
      return createAttemptRecord({
        plan,
        cellId,
        startedAt,
        completedAt,
        attempt,
        moderation: moderationNotReported("gflow-cli returned without a machine-readable moderation result."),
        outcome: "failure",
        quotaUsage: {
          mode: "not-recorded",
          apiCostUsd: 0,
          note: "The command returned but no valid staged output could be captured; provider quota usage is unknown.",
        },
        rawResponse: await captureRawResponse(response.absolutePath, repositoryRoot, "gflow-cli"),
        failure: { classification: "corrupt-output", retryable: true, message: error.message },
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
  } catch (error) {
    rawRecord = {
      adapter: "gflow-cli",
      executable,
      arguments: invocation.arguments,
      exitCode: error?.code ?? null,
      error: errorEvidence(error),
    };
    await writeJsonAtomic(response.absolutePath, rawRecord);
    const classification = classifyExecutionFailure(error);
    const completedAt = clock().toISOString();
    return createAttemptRecord({
      plan,
      cellId,
      startedAt,
      completedAt,
      attempt,
      moderation: moderationNotReported("The command failed before a moderation result was available."),
      outcome: "failure",
      quotaUsage: {
        mode: "not-recorded",
        apiCostUsd: 0,
        note: "The failed command did not expose reliable provider quota consumption; API cost remained USD 0.",
      },
      rawResponse: await captureRawResponse(response.absolutePath, repositoryRoot, "gflow-cli"),
      failure: { classification, retryable: true, message: error?.message ?? String(error) },
      previousAttempt,
      retryClass,
    });
  }
}
