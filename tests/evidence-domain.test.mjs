import assert from "node:assert/strict";
import test from "node:test";

import { deriveStyleEvidence } from "../src/lib/evidence.ts";

const style = {
  slug: "glitch-art",
  name: "Glitch Art",
  winner: "ChatGPT",
  observation: "OpenAI giữ chủ thể rõ hơn.",
  images: {
    chatgpt: {
      full: "/media/styles/glitch-fallback.webp",
      thumb: "/media/thumbs/glitch-fallback.webp",
      width: 1200,
      height: 800,
    },
  },
  scores: {
    chatgpt: {
      promptAdherence: 9.2,
      styleFidelity: 8.8,
      composition: 8.7,
      technicalQuality: 8.9,
      detailIntegrity: 8.4,
      average: 8.8,
    },
    gemini: {
      promptAdherence: 8.4,
      styleFidelity: 8.3,
      composition: 8.1,
      technicalQuality: 8.2,
      detailIntegrity: 8.0,
      average: 8.2,
    },
  },
};

const asset = (id, route, path) => ({
  id,
  productRouteId: route,
  kind: "image",
  path,
  width: 1200,
  height: 800,
  thumbnail: { path: path.replace("/styles/", "/thumbs/"), width: 560, height: 373 },
  alt: { vi: `Ảnh ${id}` },
});

const run = ({
  id,
  provider,
  route,
  recipeId = "recipe.style.glitch-art",
  promptHash = "a".repeat(64),
  assetId,
}) => ({
  id,
  recipeId,
  outcome: "success",
  exactPrompt: { sha256: promptHash, text: "Generate a glitch-art portrait." },
  productRoute: {
    id: route,
    displayName: `${provider} product route`,
    provider,
    interface: `${provider.toLowerCase()}-ui`,
    identityStatus: "legacy-label",
    modelFamily: `${provider} image model`,
    modelVersion: {
      status: "provider-alias",
      identifier: `${provider}/latest`,
      source: "legacy-generation-summary",
    },
  },
  settings: [{
    name: "aspect-ratio",
    requestedValue: "3:2",
    supportStatus: "unknown",
    note: "The legacy run did not expose a trustworthy applied-settings snapshot.",
  }],
  selectionPolicy: "legacy-selected-output",
  outputAssetIds: [assetId],
});

const openAiRun = run({
  id: "run.openai",
  provider: "OpenAI",
  route: "legacy-chatgpt-ui",
  assetId: "asset.openai",
});

const googleRun = run({
  id: "run.google",
  provider: "Google",
  route: "legacy-gflow-cli",
  assetId: "asset.google",
});

const assets = [
  asset("asset.openai", "legacy-chatgpt-ui", "/media/styles/glitch-openai.webp"),
  asset("asset.google", "legacy-gflow-cli", "/media/styles/glitch-google.webp"),
];

test("two providers sharing one immutable prompt identity produce eligible evidence taxonomy", () => {
  const evidence = deriveStyleEvidence({ style, runs: [openAiRun, googleRun], assets });

  assert.equal(evidence.mode, "comparison");
  assert.equal(evidence.comparisonEligible, true);
  assert.deepEqual(evidence.promptIdentity, {
    id: "recipe.style.glitch-art",
    hash: "a".repeat(64),
  });
  assert.equal(evidence.results.length, 2);
  assert.deepEqual(evidence.results[0], {
    scoreKey: "chatgpt",
    provider: { id: "openai", label: "OpenAI" },
    model: {
      family: "OpenAI image model",
      version: "OpenAI/latest",
      identityStatus: "legacy-label",
      versionStatus: "provider-alias",
      disclosure: "legacy-generation-summary",
    },
    pipeline: {
      id: "legacy-chatgpt-ui",
      label: "OpenAI product route",
      interface: "openai-ui",
    },
    settings: [{
      name: "aspect-ratio",
      requestedValue: "3:2",
      appliedValue: "Không có snapshot đáng tin cậy",
      supportStatus: "unknown",
      note: "The legacy run did not expose a trustworthy applied-settings snapshot.",
    }],
    selectionPolicy: "legacy-selected-output",
    result: {
      id: "asset.openai",
      runId: "run.openai",
      path: "/media/styles/glitch-openai.webp",
      thumbnailPath: "/media/thumbs/glitch-openai.webp",
      width: 1200,
      height: 800,
      alt: "Ảnh asset.openai",
    },
  });
  assert.equal(evidence.prompt?.text, "Generate a glitch-art portrait.");
  assert.equal(evidence.comparison.classification, "historical-product-route-diagnostic");
  assert.equal(evidence.comparison.rationale, "OpenAI giữ chủ thể rõ hơn.");
  assert.deepEqual(evidence.comparison.axes.map((axis) => axis.id), ["adherence", "aesthetics", "artifacts"]);
  assert.deepEqual(evidence.comparison.axes.map((axis) => axis.metrics.map(([key]) => key)), [
    ["promptAdherence"],
    ["styleFidelity", "composition", "technicalQuality"],
    ["detailIntegrity"],
  ]);
  assert.equal(evidence.comparison.axes.flatMap((axis) => axis.metrics).some(([key]) => key === "average"), false);
  assert.equal("winner" in evidence.comparison, false);
  assert.equal("average" in evidence.comparison.scores.chatgpt, false);
  assert.equal("average" in evidence.comparison.scores.gemini, false);
  assert.equal(evidence.comparison.results.chatgpt.provider.id, "openai");
  assert.equal(evidence.comparison.results.gemini.provider.id, "google");
  assert.match(evidence.comparison.uncertainty.join(" "), /một output/i);
  assert.match(evidence.comparison.uncertainty.join(" "), /không so sánh được/i);
});

test("route evidence binds to stable score identities regardless of run order", () => {
  const evidence = deriveStyleEvidence({ style, runs: [googleRun, openAiRun], assets });

  assert.equal(evidence.comparisonEligible, true);
  assert.deepEqual(evidence.results.map((result) => result.scoreKey), ["chatgpt", "gemini"]);
  assert.equal(evidence.comparison.results.chatgpt.result.id, "asset.openai");
  assert.equal(evidence.comparison.results.gemini.result.id, "asset.google");
});

test("duplicate or unexpected route evidence fails closed", () => {
  const duplicateOpenAi = { ...openAiRun, id: "run.openai.duplicate" };
  const unexpectedRun = run({
    id: "run.unexpected",
    provider: "Unexpected Provider",
    route: "unexpected-route",
    assetId: "asset.unexpected",
  });
  const assetsWithUnexpected = [
    ...assets,
    asset("asset.unexpected", "unexpected-route", "/media/styles/glitch-unexpected.webp"),
  ];

  for (const candidateRuns of [[openAiRun, duplicateOpenAi, googleRun], [openAiRun, googleRun, unexpectedRun]]) {
    const evidence = deriveStyleEvidence({ style, runs: candidateRuns, assets: assetsWithUnexpected });
    assert.equal(evidence.comparisonEligible, false);
    assert.equal(evidence.mode, "single-result");
    assert.equal(evidence.comparison, null);
  }
});

test("one provider produces a single neutral reference without comparative claims", () => {
  const evidence = deriveStyleEvidence({ style, runs: [openAiRun], assets });

  assert.equal(evidence.mode, "single-result");
  assert.equal(evidence.comparisonEligible, false);
  assert.equal(evidence.results.length, 1);
  assert.equal(evidence.representative.result.id, "asset.openai");
  assert.equal(evidence.comparison, null);
});

test("different prompt hashes fail closed even when two providers exist", () => {
  const mismatchedGoogle = run({
    id: "run.google-mismatch",
    provider: "Google",
    route: "legacy-gflow-cli",
    promptHash: "b".repeat(64),
    assetId: "asset.google",
  });
  const evidence = deriveStyleEvidence({ style, runs: [openAiRun, mismatchedGoogle], assets });

  assert.equal(evidence.comparisonEligible, false);
  assert.equal(evidence.mode, "single-result");
  assert.equal(evidence.results.length, 1);
  assert.equal(evidence.comparison, null);
});

test("missing or different immutable prompt IDs fail closed", () => {
  const missingId = run({
    id: "run.google-no-id",
    provider: "Google",
    route: "legacy-gflow-cli",
    recipeId: "",
    assetId: "asset.google",
  });
  const differentId = run({
    id: "run.google-other-id",
    provider: "Google",
    route: "legacy-gflow-cli",
    recipeId: "recipe.style.other",
    assetId: "asset.google",
  });

  for (const secondRun of [missingId, differentId]) {
    const evidence = deriveStyleEvidence({ style, runs: [openAiRun, secondRun], assets });
    assert.equal(evidence.comparisonEligible, false);
    assert.equal(evidence.results.length, 1);
    assert.equal(evidence.comparison, null);
  }
});

test("an uninspectable exact prompt fails closed", () => {
  const missingPromptText = { ...googleRun, exactPrompt: { ...googleRun.exactPrompt, text: "" } };
  const evidence = deriveStyleEvidence({ style, runs: [openAiRun, missingPromptText], assets });

  assert.equal(evidence.comparisonEligible, false);
  assert.equal(evidence.mode, "single-result");
  assert.equal(evidence.comparison, null);
});

test("failed runs and outputs without a resolvable image asset cannot establish eligibility", () => {
  const failedGoogle = { ...googleRun, outcome: "failed" };
  const missingAssetGoogle = { ...googleRun, outputAssetIds: ["asset.missing"] };

  for (const secondRun of [failedGoogle, missingAssetGoogle]) {
    const evidence = deriveStyleEvidence({ style, runs: [openAiRun, secondRun], assets });
    assert.equal(evidence.comparisonEligible, false);
    assert.equal(evidence.mode, "single-result");
    assert.equal(evidence.comparison, null);
  }
});

test("no successful resolvable run still returns one provider-neutral style reference", () => {
  const evidence = deriveStyleEvidence({
    style,
    runs: [{ ...openAiRun, outcome: "failed" }],
    assets,
  });

  assert.equal(evidence.comparisonEligible, false);
  assert.equal(evidence.mode, "single-result");
  assert.equal(evidence.results.length, 1);
  assert.equal(evidence.results[0].provider.id, "neutral");
  assert.equal(evidence.results[0].provider.label, "Chưa xác minh");
  assert.equal(evidence.results[0].result.path, style.images.chatgpt.full);
  assert.equal(evidence.comparison, null);
});
