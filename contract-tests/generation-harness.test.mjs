import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  APPROVED_POLICY,
  assertApprovedConfig,
  assertAttemptSafety,
  assertAttemptSetSafety,
  assertPlanSafety,
  assertRetryAllowed,
  buildGenerationPlan,
  createHarnessValidator,
  sha256Text,
} from "../scripts/generation-harness/core.mjs";
import {
  createCodexRequestEnvelope,
  recordCodexCell,
} from "../scripts/generation-harness/codex-adapter.mjs";
import {
  executeGflowCell,
  inspectGflowEnvironment,
} from "../scripts/generation-harness/gflow-adapter.mjs";

const readJson = async (filePath) => JSON.parse(await readFile(new URL(filePath, import.meta.url), "utf8"));
const [schema, config] = await Promise.all([
  readJson("../schemas/image-generation-harness.v1.schema.json"),
  readJson("../schemas/examples/image-generation-harness.v1.config.json"),
]);
const validate = createHarnessValidator(schema);
const plan = buildGenerationPlan(config);
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const expectedInspection = {
  environment: {
    gflowCliVersion: config.environment.gflowCliVersion,
    gflowCatalogName: config.environment.gflowCatalogName,
    gflowAlias: config.environment.gflowAlias,
  },
  supportedAspects: ["9:16", "16:9", "1:1", "4:3", "3:4"],
};

const withTemporaryRepository = async (callback) => {
  const root = await mkdtemp(path.join(tmpdir(), "prompt-atlas-generation-harness-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("approved config and deterministic six-cell plan conform to the harness schema", () => {
  assert.equal(validate(config).valid, true, JSON.stringify(validate(config).errors, null, 2));
  const replay = buildGenerationPlan(config);
  assert.deepEqual(replay, plan);
  assert.equal(validate(plan).valid, true, JSON.stringify(validate(plan).errors, null, 2));
  assert.equal(plan.cells.length, 6);
  assert.deepEqual(plan.policy, APPROVED_POLICY);
  assert.equal(plan.exactPrompt.text, config.testCase.exactPrompt.text);
  assert.equal(plan.exactPrompt.sha256, sha256Text(config.testCase.exactPrompt.text));
  assert.deepEqual(
    [...new Set(plan.cells.map((cell) => cell.route.id))],
    ["codex-image-generation", "gflow-nano-pro"],
  );
});

test("route adapters preserve exact prompt, immutable identity evidence and unsupported controls", () => {
  const codex = plan.cells.find((cell) => cell.route.interface === "codex");
  const gflow = plan.cells.find((cell) => cell.route.interface === "gflow-cli");
  assert.equal(codex.invocation.arguments.prompt, config.testCase.exactPrompt.text);
  assert.equal(codex.route.modelVersion.status, "unavailable");
  assert.equal(gflow.route.modelVersion.identifier, "GEM_PIX_2/nano-pro");
  assert.equal(gflow.invocation.arguments[2], config.testCase.exactPrompt.text);
  assert.equal(gflow.invocation.arguments.includes("--tool"), false);
  assert.equal(gflow.invocation.arguments.includes("video"), false);
  assert.equal(gflow.invocation.arguments.includes("nano-pro"), true);
  assert.equal(
    gflow.settings.find((item) => item.name === "seed").supportStatus,
    "unsupported",
  );
});

test("invalid routes, repeat counts and video scope are rejected", () => {
  const wrongRoute = structuredClone(config);
  wrongRoute.routeIds = ["codex-image-generation"];
  assert.throws(() => assertApprovedConfig(wrongRoute), /exactly Codex Image Generation/);

  const wrongRepeats = structuredClone(config);
  wrongRepeats.repeats = 2;
  assert.throws(() => assertApprovedConfig(wrongRepeats), /exactly three repeats/);

  const video = structuredClone(config);
  video.settings.mediaType = "video";
  assert.throws(() => assertApprovedConfig(video), /video generation is outside/);
});

test("gflow environment inspection pins CLI version, catalog model and alias", async () => {
  const catalog = {
    image: {
      models: [{ name: "GEM_PIX_2", aliases: ["nano-pro"] }],
      aspects: expectedInspection.supportedAspects.map((ratio) => ({ ratio })),
    },
  };
  const runner = async (_executable, args) => {
    if (args[0] === "--version") return { stdout: "gflow, version 0.53.1\n", stderr: "" };
    return { stdout: JSON.stringify(catalog), stderr: "" };
  };
  assert.deepEqual(await inspectGflowEnvironment({ runner }), expectedInspection);
});

test("gflow execution is gated and a mocked success captures original bytes, response and zero API cost", async () => {
  const gflowCell = plan.cells.find((cell) => cell.route.interface === "gflow-cli");
  await assert.rejects(
    () => executeGflowCell({
      plan,
      cellId: gflowCell.id,
      repositoryRoot: process.cwd(),
      authorization: { productQuota: false, apiSpendUsd: 0 },
    }),
    /explicit product-quota acknowledgement/,
  );

  await withTemporaryRepository(async (repositoryRoot) => {
    const runner = async (_executable, args, options) => {
      const outputPath = args[args.indexOf("--output") + 1];
      const absoluteOutput = path.resolve(options.cwd, outputPath);
      await mkdir(path.dirname(absoluteOutput), { recursive: true });
      await writeFile(absoluteOutput, onePixelPng);
      return { stdout: JSON.stringify({ ok: true, output: outputPath }), stderr: "" };
    };
    const attempt = await executeGflowCell({
      plan,
      cellId: gflowCell.id,
      repositoryRoot,
      authorization: { productQuota: true, apiSpendUsd: 0 },
      runner,
      inspector: async () => expectedInspection,
      clock: () => new Date("2026-08-12T01:00:00Z"),
    });
    assert.equal(validate(attempt).valid, true, JSON.stringify(validate(attempt).errors, null, 2));
    assert.equal(attempt.outcome, "success");
    assert.equal(attempt.originalOutputs[0].width, 1);
    assert.equal(attempt.originalOutputs[0].height, 1);
    assert.equal(attempt.quotaUsage.apiCostUsd, 0);
    assert.equal(attempt.rawResponse.source, "gflow-cli");
    await assert.rejects(
      () => executeGflowCell({
        plan,
        cellId: gflowCell.id,
        repositoryRoot,
        authorization: { productQuota: true, apiSpendUsd: 0 },
        runner,
        inspector: async () => expectedInspection,
      }),
      /attempt artifact already exists/,
    );
  });
});

test("gflow failures are retained and only one technical retry is allowed", async () => {
  const gflowCell = plan.cells.find((cell) => cell.route.interface === "gflow-cli");
  await withTemporaryRepository(async (repositoryRoot) => {
    const runner = async () => {
      const error = new Error("provider temporarily unavailable");
      error.code = 1;
      error.stderr = "temporary backend failure";
      throw error;
    };
    const failed = await executeGflowCell({
      plan,
      cellId: gflowCell.id,
      repositoryRoot,
      authorization: { productQuota: true, apiSpendUsd: 0 },
      runner,
      inspector: async () => expectedInspection,
      clock: () => new Date("2026-08-12T02:00:00Z"),
    });
    assert.equal(validate(failed).valid, true, JSON.stringify(validate(failed).errors, null, 2));
    assert.equal(failed.outcome, "failure");
    assert.equal(failed.failure.classification, "provider-transient");
    assert.equal(failed.failure.retryable, true);
    assert.deepEqual(
      assertRetryAllowed({ attempt: 2, previousAttempt: failed, retryClass: "provider-transient" }),
      { isRetry: true, reason: "provider-transient", previousAttemptId: failed.attemptId },
    );
    assert.throws(
      () => assertRetryAllowed({ attempt: 3, previousAttempt: failed, retryClass: "provider-transient" }),
      /at most one technical retry/,
    );
    assert.throws(
      () => assertRetryAllowed({ attempt: 2, previousAttempt: { ...failed, outcome: "success" }, retryClass: "provider-transient" }),
      /cannot be retried/,
    );
  });
});

test("Codex request/record boundary preserves prompt, original image, raw response and unavailable model identity", async () => {
  const codexCell = plan.cells.find((cell) => cell.route.interface === "codex");
  const request = createCodexRequestEnvelope(plan, codexCell.id);
  assert.equal(request.request.tool, "image_gen.imagegen");
  assert.equal(request.request.arguments.prompt, config.testCase.exactPrompt.text);

  await withTemporaryRepository(async (repositoryRoot) => {
    const imagePath = path.join(repositoryRoot, codexCell.outputPath);
    const responsePath = path.join(path.dirname(imagePath), "attempt-1.codex-response.json");
    await mkdir(path.dirname(imagePath), { recursive: true });
    await Promise.all([
      writeFile(imagePath, onePixelPng),
      writeFile(responsePath, JSON.stringify({ tool: "image_gen.imagegen", result: "staged" })),
    ]);
    const attempt = await recordCodexCell({
      plan,
      cellId: codexCell.id,
      repositoryRoot,
      imagePath,
      responsePath,
      startedAt: "2026-08-12T03:00:00Z",
      completedAt: "2026-08-12T03:00:01Z",
    });
    assert.equal(validate(attempt).valid, true, JSON.stringify(validate(attempt).errors, null, 2));
    assert.equal(attempt.productRoute.modelVersion.status, "unavailable");
    assert.equal(attempt.exactPrompt.text, config.testCase.exactPrompt.text);
    assert.equal(attempt.quotaUsage.apiCostUsd, 0);
    assert.equal(attempt.rawResponse.source, "codex-tool");
  });
});

test("schema rejects non-zero API spend in an attempt manifest", async () => {
  const codexCell = plan.cells.find((cell) => cell.route.interface === "codex");
  await withTemporaryRepository(async (repositoryRoot) => {
    const imagePath = path.join(repositoryRoot, codexCell.outputPath);
    const responsePath = path.join(path.dirname(imagePath), "attempt-1.codex-response.json");
    await mkdir(path.dirname(imagePath), { recursive: true });
    await Promise.all([writeFile(imagePath, onePixelPng), writeFile(responsePath, "{}")]);
    const attempt = await recordCodexCell({
      plan,
      cellId: codexCell.id,
      repositoryRoot,
      imagePath,
      responsePath,
      startedAt: "2026-08-12T03:00:00Z",
      completedAt: "2026-08-12T03:00:01Z",
    });
    attempt.quotaUsage.apiCostUsd = 0.01;
    const result = validate(attempt);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.path.includes("apiCostUsd")));
  });
});

test("semantic validation rejects prompt drift and aggregate retry-budget overflow", () => {
  const driftedPlan = structuredClone(plan);
  driftedPlan.exactPrompt.text = "drifted prompt";
  assert.throws(() => assertPlanSafety(driftedPlan), /frozen test case/);

  const unsafeAttempt = {
    kind: "image-generation-attempt",
    attemptId: "cell.test.gflow-nano-pro.r1.a1",
    cellId: "cell.test.gflow-nano-pro.r1",
    attempt: 1,
    testCase: { exactPrompt: { text: "same prompt" } },
    exactPrompt: { text: "same prompt", sha256: sha256Text("same prompt") },
    selectionPolicy: "all-attempts",
    productRoute: {
      id: "gflow-nano-pro",
      modelVersion: { status: "provider-alias", identifier: "GEM_PIX_2/nano-pro" },
    },
    quotaUsage: { apiCostUsd: 0 },
    outcome: "failure",
    failure: { classification: "refusal", retryable: true },
    retry: { isRetry: false },
  };
  assert.throws(() => assertAttemptSafety(unsafeAttempt), /cannot be retried/);

  const retries = Array.from({ length: 15 }, (_, index) => ({
    ...structuredClone(unsafeAttempt),
    cellId: `cell.test.gflow-nano-pro.r${index + 1}`,
    attemptId: `cell.test.gflow-nano-pro.r${index + 1}.a2`,
    attempt: 2,
    failure: { classification: "provider-transient", retryable: true },
    retry: {
      isRetry: true,
      reason: "provider-transient",
      previousAttemptId: `cell.test.gflow-nano-pro.r${index + 1}.a1`,
    },
  }));
  assert.throws(() => assertAttemptSetSafety(retries), /retry budget exceeded/);
});
