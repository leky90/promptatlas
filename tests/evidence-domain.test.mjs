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
    chatgpt: { average: 8.8 },
    gemini: { average: 8.2 },
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
    modelFamily: `${provider} image model`,
    modelVersion: { status: "provider-alias", identifier: `${provider}/latest` },
  },
  outputAssetIds: [assetId],
});

const openAiRun = run({
  id: "run.openai",
  provider: "OpenAI",
  route: "openai-route",
  assetId: "asset.openai",
});

const googleRun = run({
  id: "run.google",
  provider: "Google",
  route: "google-route",
  assetId: "asset.google",
});

const assets = [
  asset("asset.openai", "openai-route", "/media/styles/glitch-openai.webp"),
  asset("asset.google", "google-route", "/media/styles/glitch-google.webp"),
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
    provider: { id: "openai", label: "OpenAI" },
    model: { family: "OpenAI image model", version: "OpenAI/latest" },
    pipeline: {
      id: "openai-route",
      label: "OpenAI product route",
      interface: "openai-ui",
    },
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
  assert.deepEqual(evidence.comparison, {
    winner: "ChatGPT",
    observation: "OpenAI giữ chủ thể rõ hơn.",
    scores: style.scores,
  });
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
    route: "google-route",
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
    route: "google-route",
    recipeId: "",
    assetId: "asset.google",
  });
  const differentId = run({
    id: "run.google-other-id",
    provider: "Google",
    route: "google-route",
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
