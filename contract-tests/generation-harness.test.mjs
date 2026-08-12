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
      assertRetryAllowed({
        attempt: 2,
        previousAttempt: failed,
        retryClass: "provider-transient",
        planId: plan.planId,
        cellId: gflowCell.id,
      }),
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
    const anotherCell = plan.cells.find(
      (cell) => cell.route.interface === "gflow-cli" && cell.id !== gflowCell.id,
    );
    assert.throws(
      () => assertRetryAllowed({
        attempt: 2,
        previousAttempt: failed,
        retryClass: "provider-transient",
        planId: plan.planId,
        cellId: anotherCell.id,
      }),
      /same plan and cell/,
    );
    assert.throws(
      () => assertRetryAllowed({
        attempt: 2,
        previousAttempt: failed,
        retryClass: "transport",
        planId: plan.planId,
        cellId: gflowCell.id,
      }),
      /recorded failure classification/,
    );
  });
});

test("gflow moderation and unknown non-transport failures are retained without retry permission", async () => {
  const gflowCells = plan.cells.filter((cell) => cell.route.interface === "gflow-cli");
  await withTemporaryRepository(async (repositoryRoot) => {
    const moderation = await executeGflowCell({
      plan,
      cellId: gflowCells[0].id,
      repositoryRoot,
      authorization: { productQuota: true, apiSpendUsd: 0 },
      runner: async () => {
        const error = new Error("request blocked by safety moderation");
        error.code = 1;
        error.stderr = "content policy violation";
        throw error;
      },
      inspector: async () => expectedInspection,
      clock: () => new Date("2026-08-12T02:10:00Z"),
    });
    assert.equal(moderation.outcome, "moderated");
    assert.equal(moderation.moderation.status, "blocked");
    assert.equal(moderation.failure.classification, "moderation");
    assert.equal(moderation.failure.retryable, false);
  });

  await withTemporaryRepository(async (repositoryRoot) => {
    const unknown = await executeGflowCell({
      plan,
      cellId: gflowCells[1].id,
      repositoryRoot,
      authorization: { productQuota: true, apiSpendUsd: 0 },
      runner: async () => {
        const error = new Error("authentication expired");
        error.code = 2;
        error.stderr = "login required";
        throw error;
      },
      inspector: async () => expectedInspection,
      clock: () => new Date("2026-08-12T02:20:00Z"),
    });
    assert.equal(unknown.outcome, "failure");
    assert.equal(unknown.failure.classification, "unknown");
    assert.equal(unknown.failure.retryable, false);
  });

  await withTemporaryRepository(async (repositoryRoot) => {
    const exitZeroAuthFailure = await executeGflowCell({
      plan,
      cellId: gflowCells[2].id,
      repositoryRoot,
      authorization: { productQuota: true, apiSpendUsd: 0 },
      runner: async () => ({ stdout: "login required", stderr: "authentication expired" }),
      inspector: async () => expectedInspection,
      clock: () => new Date("2026-08-12T02:30:00Z"),
    });
    assert.equal(exitZeroAuthFailure.outcome, "failure");
    assert.equal(exitZeroAuthFailure.failure.classification, "unknown");
    assert.equal(exitZeroAuthFailure.failure.retryable, false);
  });
});

test("gflow rejects live aspect capability drift before invoking generation", async () => {
  const gflowCell = plan.cells.find((cell) => cell.route.interface === "gflow-cli");
  await withTemporaryRepository(async (repositoryRoot) => {
    let invoked = false;
    await assert.rejects(
      () => executeGflowCell({
        plan,
        cellId: gflowCell.id,
        repositoryRoot,
        authorization: { productQuota: true, apiSpendUsd: 0 },
        runner: async () => {
          invoked = true;
          throw new Error("generation must not run after capability drift");
        },
        inspector: async () => ({
          ...expectedInspection,
          supportedAspects: ["16:9"],
        }),
      }),
      /aspect-ratio capability drift/,
    );
    assert.equal(invoked, false);
  });
});

test("Codex request/record boundary preserves prompt, original image, raw response and unavailable model identity", async () => {
  const codexCell = plan.cells.find((cell) => cell.route.interface === "codex");
  const request = createCodexRequestEnvelope(plan, codexCell.id);
  assert.equal(request.request.tool, "image_gen.imagegen");
  assert.equal(request.request.arguments.prompt, config.testCase.exactPrompt.text);
  assert.equal(request.stageOutputAs, codexCell.outputPath);
  assert.equal(
    request.stageResponseAs,
    codexCell.outputPath.replace("attempt-1.png", "attempt-1.codex-response.json"),
  );

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

test("Codex recorder rejects foreign evidence paths and retains non-success attempts without an image", async () => {
  const codexCell = plan.cells.find((cell) => cell.route.interface === "codex");
  await withTemporaryRepository(async (repositoryRoot) => {
    const foreignImage = path.join(repositoryRoot, ".artifacts/foreign/other-cell.png");
    const foreignResponse = path.join(repositoryRoot, ".artifacts/foreign/other-response.json");
    await mkdir(path.dirname(foreignImage), { recursive: true });
    await Promise.all([
      writeFile(foreignImage, onePixelPng),
      writeFile(foreignResponse, "{}"),
    ]);
    await assert.rejects(
      () => recordCodexCell({
        plan,
        cellId: codexCell.id,
        repositoryRoot,
        imagePath: foreignImage,
        responsePath: foreignResponse,
        startedAt: "2026-08-12T03:10:00Z",
        completedAt: "2026-08-12T03:10:01Z",
      }),
      /deterministic Codex image path/,
    );

    const responsePath = path.join(
      repositoryRoot,
      codexCell.outputPath.replace("attempt-1.png", "attempt-1.codex-response.json"),
    );
    await mkdir(path.dirname(responsePath), { recursive: true });
    await writeFile(responsePath, JSON.stringify({ blocked: true, reason: "policy" }));
    const refused = await recordCodexCell({
      plan,
      cellId: codexCell.id,
      repositoryRoot,
      responsePath,
      startedAt: "2026-08-12T03:20:00Z",
      completedAt: "2026-08-12T03:20:01Z",
      outcome: "refusal",
      moderation: {
        status: "not-reported",
        categories: [],
        note: "Codex returned a refusal without moderation categories.",
      },
      failure: {
        classification: "refusal",
        retryable: false,
        message: "Codex refused the request.",
      },
    });
    assert.equal(validate(refused).valid, true, JSON.stringify(validate(refused).errors, null, 2));
    assert.equal(refused.outcome, "refusal");
    assert.deepEqual(refused.originalOutputs, []);
    assert.equal(refused.failure.retryable, false);
  });

  const retryableCell = plan.cells.find(
    (cell) => cell.route.interface === "codex" && cell.id !== codexCell.id,
  );
  await withTemporaryRepository(async (repositoryRoot) => {
    const responsePath = path.join(
      repositoryRoot,
      retryableCell.outputPath.replace("attempt-1.png", "attempt-1.codex-response.json"),
    );
    await mkdir(path.dirname(responsePath), { recursive: true });
    await writeFile(responsePath, JSON.stringify({ error: "connection reset" }));
    const failed = await recordCodexCell({
      plan,
      cellId: retryableCell.id,
      repositoryRoot,
      responsePath,
      startedAt: "2026-08-12T03:30:00Z",
      completedAt: "2026-08-12T03:30:01Z",
      outcome: "failure",
      failure: {
        classification: "transport",
        retryable: true,
        message: "Connection reset before an image was returned.",
      },
    });
    const retryRequest = createCodexRequestEnvelope(plan, retryableCell.id, {
      attempt: 2,
      previousAttempt: failed,
      retryClass: "transport",
    });
    assert.equal(
      retryRequest.stageOutputAs,
      retryableCell.outputPath.replace("attempt-1.png", "attempt-2.png"),
    );
    assert.equal(
      retryRequest.stageResponseAs,
      retryableCell.outputPath.replace("attempt-1.png", "attempt-2.codex-response.json"),
    );
    assert.equal(retryRequest.retry.previousAttemptId, failed.attemptId);
  });
});

test("refusal classification cannot be recorded as a generic failure outcome", async () => {
  const codexCell = plan.cells.find((cell) => cell.route.interface === "codex");
  await withTemporaryRepository(async (repositoryRoot) => {
    const responsePath = path.join(
      repositoryRoot,
      codexCell.outputPath.replace("attempt-1.png", "attempt-1.codex-response.json"),
    );
    await mkdir(path.dirname(responsePath), { recursive: true });
    await writeFile(responsePath, JSON.stringify({ refused: true }));
    const refused = await recordCodexCell({
      plan,
      cellId: codexCell.id,
      repositoryRoot,
      responsePath,
      startedAt: "2026-08-12T03:40:00Z",
      completedAt: "2026-08-12T03:40:01Z",
      outcome: "refusal",
      failure: {
        classification: "refusal",
        retryable: false,
        message: "Codex refused the request.",
      },
    });
    const mislabeled = { ...refused, outcome: "failure" };
    assert.equal(validate(mislabeled).valid, false);
    assert.throws(
      () => assertAttemptSafety(mislabeled),
      /refusal classification requires a refusal outcome/,
    );
  });
});

test("moderation classification cannot be recorded as a generic failure outcome", async () => {
  const codexCell = plan.cells.find((cell) => cell.route.interface === "codex");
  await withTemporaryRepository(async (repositoryRoot) => {
    const responsePath = path.join(
      repositoryRoot,
      codexCell.outputPath.replace("attempt-1.png", "attempt-1.codex-response.json"),
    );
    await mkdir(path.dirname(responsePath), { recursive: true });
    await writeFile(responsePath, JSON.stringify({ blocked: true, category: "safety" }));
    const moderated = await recordCodexCell({
      plan,
      cellId: codexCell.id,
      repositoryRoot,
      responsePath,
      startedAt: "2026-08-12T03:50:00Z",
      completedAt: "2026-08-12T03:50:01Z",
      outcome: "moderated",
      moderation: {
        status: "blocked",
        categories: ["provider-safety"],
        note: "Codex blocked the request.",
      },
      failure: {
        classification: "moderation",
        retryable: false,
        message: "Codex blocked the request.",
      },
    });
    const mislabeled = { ...moderated, outcome: "failure" };
    assert.equal(validate(mislabeled).valid, false);
    assert.throws(
      () => assertAttemptSafety(mislabeled),
      /moderation classification requires a moderated outcome/,
    );
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

  const syntheticAttempt = ({ cellId, attempt = 1, retry = { isRetry: false } }) => ({
    kind: "image-generation-attempt",
    planId: "plan.synthetic",
    attemptId: `${cellId}.a${attempt}`,
    cellId,
    attempt,
    testCase: { exactPrompt: { text: "same prompt" } },
    exactPrompt: { text: "same prompt", sha256: sha256Text("same prompt") },
    selectionPolicy: "all-attempts",
    productRoute: {
      id: "gflow-nano-pro",
      modelVersion: { status: "provider-alias", identifier: "GEM_PIX_2/nano-pro" },
    },
    quotaUsage: { apiCostUsd: 0 },
    originalOutputs: [],
    rawResponse: {
      source: "gflow-cli",
      path: `.artifacts/generation-runs/plan.synthetic/${cellId}/attempt-${attempt}.gflow-response.json`,
    },
    moderation: { status: "not-reported", categories: [] },
    outcome: "failure",
    failure: { classification: "provider-transient", retryable: true },
    retry,
  });
  const unsafeAttempt = {
    ...syntheticAttempt({ cellId: "cell.test.gflow-nano-pro.r1" }),
    failure: { classification: "valid-low-adherence", retryable: true },
  };
  assert.throws(() => assertAttemptSafety(unsafeAttempt), /cannot be retried/);

  const attempts = Array.from({ length: 15 }, (_, index) => {
    const cellId = `cell.test.gflow-nano-pro.r${index + 1}`;
    return [
      syntheticAttempt({ cellId }),
      syntheticAttempt({
        cellId,
        attempt: 2,
        retry: {
          isRetry: true,
          reason: "provider-transient",
          previousAttemptId: `${cellId}.a1`,
        },
      }),
    ];
  }).flat();
  assert.throws(() => assertAttemptSetSafety(attempts), /retry budget exceeded/);
});
