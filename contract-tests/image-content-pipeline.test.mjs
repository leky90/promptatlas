import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildImageContentDataset } from "../scripts/build-image-content.mjs";
import {
  createImageContentValidator,
  validateImageAssetIntegrity,
} from "../scripts/validate-image-content.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [schema, dataset, styles] = await Promise.all([
  readJson("../schemas/prompt-atlas.image.v1.schema.json"),
  readJson("../src/data/prompt-atlas.image.v1.json"),
  readJson("../src/data/styles.json"),
]);
const validate = createImageContentValidator(schema);
const mutate = (callback) => {
  const copy = structuredClone(dataset);
  callback(copy);
  return validate(copy);
};

test("canonical image dataset conforms to schema and cross-record invariants", () => {
  const result = validate(dataset);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(dataset.apiAdaptersEnabled, false);
  assert.equal(dataset.sourceDataset.recordCount, 90);
  assert.equal(dataset.stylePrimitives.length, 90);
  assert.equal(dataset.recipes.length, 90);
  assert.equal(dataset.sourceAssets.length, 180);
  assert.equal(dataset.assets.length, 180);
  assert.equal(dataset.generationRuns.length, 180);
  assert.equal(dataset.legacyRoutes.length, 90);
});

test("generated dataset is deterministic and current", async () => {
  assert.deepEqual(await buildImageContentDataset(), dataset);
});

test("all 90 published style URLs are preserved exactly", () => {
  const expectedRoutes = styles.map((style) => `/styles/${style.slug}/`).sort();
  const actualRoutes = dataset.legacyRoutes.map((item) => item.route).sort();
  assert.deepEqual(actualRoutes, expectedRoutes);
  assert.deepEqual(
    dataset.legacyRoutes.map((item) => item.legacyId).sort((a, b) => a - b),
    Array.from({ length: 90 }, (_, index) => index + 1),
  );
});

test("runs snapshot route identity, prompts, settings, attempts, assets and zero API spend", () => {
  for (const run of dataset.generationRuns) {
    assert.ok(run.productRoute.id);
    assert.ok(run.productRoute.identityStatus);
    assert.notEqual(run.productRoute.interface, "api");
    assert.ok(run.exactPrompt.text);
    assert.match(run.exactPrompt.sha256, /^[a-f0-9]{64}$/);
    assert.ok(run.settings.length > 0);
    assert.equal(run.attempt, 1);
    assert.ok(run.originalAssetIds.length > 0);
    assert.ok(run.outputAssetIds.length > 0);
    assert.ok(run.moderation.status);
    assert.equal(run.outcome, "success");
    assert.equal(run.quotaUsage.apiCostUsd, 0);
  }
});

test("asset records retain checksums, license proof, consent, restrictions, retention and takedown state", () => {
  for (const asset of dataset.assets) {
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.match(asset.thumbnail.sha256, /^[a-f0-9]{64}$/);
    assert.ok(asset.rights.license.version);
    assert.ok(asset.rights.license.proof.reference);
    assert.ok(asset.rights.consent.status);
    assert.ok(asset.rights.restrictions.length > 0);
    assert.ok(asset.rights.retention.reviewAt);
    assert.equal(asset.rights.takedown.status, "active");
  }
});

test("published asset checksum verification passes against repository files", async () => {
  const result = await validateImageAssetIntegrity(dataset);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("negative: incomplete rights evidence is rejected", () => {
  const result = mutate((copy) => delete copy.assets[0].rights.license.proof);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("proof") || error.message.includes("proof")));
});

test("negative: broken source and output references are rejected", () => {
  const result = mutate((copy) => {
    copy.assets[0].sourceAssetId = "source.missing.chatgpt";
    copy.generationRuns[0].outputAssetIds = ["asset.missing.chatgpt"];
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("unknown source asset")));
  assert.ok(result.errors.some((error) => error.message.includes("unknown output asset")));
});

test("negative: runs cannot reference same-route assets from another recipe", () => {
  const result = mutate((copy) => {
    const run = copy.generationRuns[0];
    const sourceAsset = copy.sourceAssets.find(
      (item) => item.productRouteId === run.productRoute.id && item.recipeId !== run.recipeId,
    );
    const outputAsset = copy.assets.find(
      (item) => item.productRouteId === run.productRoute.id && item.recipeId !== run.recipeId,
    );
    assert.ok(sourceAsset);
    assert.ok(outputAsset);
    run.originalAssetIds = [sourceAsset.id];
    run.outputAssetIds = [outputAsset.id];
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("source asset recipe does not match run recipe")));
  assert.ok(result.errors.some((error) => error.message.includes("output asset recipe does not match run recipe")));
});

test("negative: exact model versions require an identifier", () => {
  const result = mutate((copy) => {
    copy.generationRuns[0].productRoute.modelVersion.status = "exact";
    delete copy.generationRuns[0].productRoute.modelVersion.identifier;
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("modelVersion") && error.message.includes("identifier")));
});

test("negative: provider-alias model versions require an identifier", () => {
  const result = mutate((copy) => {
    copy.generationRuns[0].productRoute.modelVersion.status = "provider-alias";
    delete copy.generationRuns[0].productRoute.modelVersion.identifier;
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("modelVersion") && error.message.includes("identifier")));
});

test("negative: unavailable model versions require a reason", () => {
  const result = mutate((copy) => {
    copy.generationRuns[0].productRoute.modelVersion.status = "unavailable";
    delete copy.generationRuns[0].productRoute.modelVersion.reason;
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("modelVersion") && error.message.includes("reason")));
});

test("negative: prompt drift is rejected", () => {
  const result = mutate((copy) => {
    copy.generationRuns[0].exactPrompt.text = "drifted prompt";
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("exact recipe generation prompt")));
});

test("negative: non-zero API cost is rejected", () => {
  const result = mutate((copy) => {
    copy.generationRuns[0].quotaUsage.apiCostUsd = 1;
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("apiCostUsd") || error.message.includes("constant")));
});

test("negative: a missing legacy route or non-contiguous ID is rejected", () => {
  const result = mutate((copy) => {
    copy.legacyRoutes.shift();
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path.includes("legacyRoutes")));
});
