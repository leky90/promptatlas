#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_POLICY,
  assertApprovedConfig,
  assertAttemptSafety,
  assertPlanSafety,
  buildGenerationPlan,
  createHarnessValidator,
  readJson,
} from "./core.mjs";
import { createCodexRequestEnvelope, recordCodexCell } from "./codex-adapter.mjs";
import { executeGflowCell, inspectGflowEnvironment } from "./gflow-adapter.mjs";
import { resolveArtifactPath, writeJsonAtomic } from "./runtime.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultConfigPath = path.join(repositoryRoot, "schemas/examples/image-generation-harness.v1.config.json");
const schemaPath = path.join(repositoryRoot, "schemas/image-generation-harness.v1.schema.json");

const parseArgs = (tokens) => {
  const flags = {};
  const positionals = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = tokens[index + 1];
    if (next && !next.startsWith("--")) {
      flags[name] = next;
      index += 1;
    } else {
      flags[name] = true;
    }
  }
  return { flags, positionals };
};

const requireFlag = (flags, name) => {
  const value = flags[name];
  if (!value || value === true) throw new Error(`--${name} is required`);
  return value;
};

const absoluteInput = (filePath) => path.resolve(process.cwd(), filePath);

const validationError = (result) => result.errors.map((error) => `${error.path}: ${error.message}`).join("\n");

const loadValidated = async (filePath, validate, expectedKind) => {
  const document = await readJson(absoluteInput(filePath));
  const result = validate(document);
  if (!result.valid) throw new Error(`invalid ${expectedKind}:\n${validationError(result)}`);
  if (document.kind !== expectedKind) throw new Error(`expected ${expectedKind}, received ${document.kind}`);
  if (document.kind === "image-generation-config") assertApprovedConfig(document);
  if (document.kind === "image-generation-plan") assertPlanSafety(document);
  if (document.kind === "image-generation-attempt") assertAttemptSafety(document);
  return document;
};

const writeArtifactDocument = async (requestedPath, document, label) => {
  const target = resolveArtifactPath(repositoryRoot, absoluteInput(requestedPath), label);
  await writeJsonAtomic(target.absolutePath, document);
  return target.relativePath;
};

const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function planCommand(flags, validate) {
  const configPath = flags.config === true ? defaultConfigPath : absoluteInput(flags.config ?? defaultConfigPath);
  const config = await readJson(configPath);
  const configResult = validate(config);
  if (!configResult.valid || config.kind !== "image-generation-config") {
    throw new Error(`invalid image-generation-config:\n${validationError(configResult)}`);
  }
  const plan = buildGenerationPlan(config);
  const result = validate(plan);
  if (!result.valid) throw new Error(`generated plan failed schema validation:\n${validationError(result)}`);
  assertPlanSafety(plan);
  if (flags["check-deterministic"]) {
    const replay = buildGenerationPlan(config);
    if (JSON.stringify(plan) !== JSON.stringify(replay)) throw new Error("plan construction is not deterministic");
  }
  const output = flags.output
    ? await writeArtifactDocument(requireFlag(flags, "output"), plan, "plan manifest")
    : undefined;
  print({
    valid: true,
    deterministic: Boolean(flags["check-deterministic"]),
    planId: plan.planId,
    cells: plan.cells.length,
    eligibleCells: plan.cells.filter((cell) => cell.executionEligibility.eligible).length,
    ineligibleCells: plan.cells.filter((cell) => !cell.executionEligibility.eligible).length,
    ...(output ? { output } : {}),
  });
}

async function validateCommand(flags, validate) {
  const filePath = requireFlag(flags, "file");
  const document = await readJson(absoluteInput(filePath));
  const result = validate(document);
  if (!result.valid) throw new Error(validationError(result));
  if (document.kind === "image-generation-config") assertApprovedConfig(document);
  if (document.kind === "image-generation-plan") assertPlanSafety(document);
  if (document.kind === "image-generation-attempt") assertAttemptSafety(document);
  print({ valid: true, kind: document.kind, file: filePath });
}

async function inspectGflowCommand() {
  const inspection = await inspectGflowEnvironment({ repositoryRoot });
  print({ valid: true, ...inspection });
}

async function executeGflowCommand(flags, validate) {
  if (flags["acknowledge-product-quota"] !== true) {
    throw new Error("--acknowledge-product-quota is required before any real gflow generation");
  }
  const plan = await loadValidated(requireFlag(flags, "plan"), validate, "image-generation-plan");
  assertPlanSafety(plan);
  const attemptNumber = Number(flags.attempt ?? 1);
  const previousAttempt = flags.previous
    ? await loadValidated(requireFlag(flags, "previous"), validate, "image-generation-attempt")
    : undefined;
  const attempt = await executeGflowCell({
    plan,
    cellId: requireFlag(flags, "cell"),
    repositoryRoot,
    authorization: { productQuota: true, apiSpendUsd: 0 },
    attempt: attemptNumber,
    previousAttempt,
    retryClass: flags["retry-class"],
  });
  const result = validate(attempt);
  if (!result.valid) throw new Error(`attempt failed schema validation:\n${validationError(result)}`);
  assertAttemptSafety(attempt);
  const output = await writeArtifactDocument(requireFlag(flags, "output"), attempt, "attempt manifest");
  print({ valid: true, attemptId: attempt.attemptId, outcome: attempt.outcome, output });
}

async function recordCodexCommand(flags, validate) {
  const plan = await loadValidated(requireFlag(flags, "plan"), validate, "image-generation-plan");
  const cellId = requireFlag(flags, "cell");
  const attemptNumber = Number(flags.attempt ?? 1);
  const previousAttempt = flags.previous
    ? await loadValidated(requireFlag(flags, "previous"), validate, "image-generation-attempt")
    : undefined;
  if (flags.request) {
    print(createCodexRequestEnvelope(plan, cellId, {
      attempt: attemptNumber,
      previousAttempt,
      retryClass: flags["retry-class"],
    }));
    return;
  }
  const outcome = flags.outcome ?? "success";
  const allowedOutcomes = new Set(["success", "partial", "failure", "refusal", "moderated"]);
  if (!allowedOutcomes.has(outcome)) throw new Error(`unsupported Codex outcome ${outcome}`);
  const failureClass = flags["failure-class"];
  const failure = outcome === "success"
    ? undefined
    : {
      classification: requireFlag(flags, "failure-class"),
      retryable: APPROVED_POLICY.retryableFailureClasses.includes(failureClass),
      message: requireFlag(flags, "failure-message"),
    };
  const moderationStatus = flags["moderation-status"] ?? (outcome === "moderated" ? "blocked" : "not-reported");
  if (!["not-reported", "passed", "flagged", "blocked"].includes(moderationStatus)) {
    throw new Error(`unsupported moderation status ${moderationStatus}`);
  }
  const moderation = {
    status: moderationStatus,
    categories: typeof flags["moderation-categories"] === "string"
      ? flags["moderation-categories"].split(",").map((item) => item.trim()).filter(Boolean)
      : [],
    note: flags["moderation-note"] ?? "Codex returned no machine-readable moderation categories.",
  };
  const attempt = await recordCodexCell({
    plan,
    cellId,
    repositoryRoot,
    imagePath: typeof flags.image === "string" ? flags.image : undefined,
    responsePath: requireFlag(flags, "response"),
    startedAt: requireFlag(flags, "started-at"),
    completedAt: requireFlag(flags, "completed-at"),
    attempt: attemptNumber,
    outcome,
    moderation,
    failure,
    previousAttempt,
    retryClass: flags["retry-class"],
  });
  const result = validate(attempt);
  if (!result.valid) throw new Error(`attempt failed schema validation:\n${validationError(result)}`);
  assertAttemptSafety(attempt);
  const output = await writeArtifactDocument(requireFlag(flags, "output"), attempt, "attempt manifest");
  print({ valid: true, attemptId: attempt.attemptId, outcome: attempt.outcome, output });
}

async function main() {
  const [command, ...tokens] = process.argv.slice(2);
  const { flags } = parseArgs(tokens);
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const validate = createHarnessValidator(schema);
  if (command === "plan") return planCommand(flags, validate);
  if (command === "validate") return validateCommand(flags, validate);
  if (command === "inspect-gflow") return inspectGflowCommand();
  if (command === "execute-gflow") return executeGflowCommand(flags, validate);
  if (command === "record-codex") return recordCodexCommand(flags, validate);
  throw new Error("usage: cli.mjs <plan|validate|inspect-gflow|execute-gflow|record-codex> [options]");
}

main().catch((error) => {
  process.stderr.write(`generation harness: ${error.message}\n`);
  process.exitCode = 1;
});
