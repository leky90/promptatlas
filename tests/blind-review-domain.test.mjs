import assert from "node:assert/strict";
import test from "node:test";

import {
  adjudicateDisagreement,
  appendReviewRecord,
  createBlindSession,
  findDisagreements,
} from "../src/lib/blind-review.ts";

const outputs = [
  {
    outputId: "case.watercolor:candidate-1",
    reviewCopy: { id: "review-copy-01", path: "data:image/webp;base64,bmV1dHJhbC0x", width: 1200, height: 800 },
  },
  {
    outputId: "case.watercolor:candidate-2",
    reviewCopy: { id: "review-copy-02", path: "data:image/webp;base64,bmV1dHJhbC0y", width: 1200, height: 800 },
  },
  {
    outputId: "case.watercolor:candidate-3",
    reviewCopy: { id: "review-copy-03", path: "data:image/webp;base64,bmV1dHJhbC0z", width: 1200, height: 800 },
  },
];

const rating = (dimensionId, score, confidence = "high") => ({
  dimensionId,
  score,
  confidence,
  rationale: "The subject and camera angle are directly observable.",
  evidence: [{ kind: "region", x: 0.2, y: 0.25, width: 0.3, height: 0.2 }],
});

const record = ({ id, reviewerId, ratings }) => ({
  id,
  caseId: "case.watercolor",
  outputId: "asset.openai",
  reviewerId,
  protocolVersion: "0.2",
  calibrationVersion: "image-8-v1",
  submittedAt: "2026-08-24T00:00:00.000Z",
  ratings,
});

test("blind sessions randomize neutral A/B/N outputs without leaking provider identity", () => {
  const first = createBlindSession({ caseId: "case.watercolor", reviewerId: "reviewer-a", seed: "a", outputs });
  const repeated = createBlindSession({ caseId: "case.watercolor", reviewerId: "reviewer-a", seed: "a", outputs });
  const secondReviewer = createBlindSession({ caseId: "case.watercolor", reviewerId: "reviewer-b", seed: "b", outputs });

  assert.deepEqual(first.outputs, repeated.outputs);
  assert.deepEqual(first.outputs.map((output) => output.blindId), ["A", "B", "N"]);
  assert.deepEqual(first.outputs.map((output) => output.reviewCopyId), ["review-copy-02", "review-copy-03", "review-copy-01"]);
  assert.deepEqual(secondReviewer.outputs.map((output) => output.reviewCopyId), ["review-copy-03", "review-copy-01", "review-copy-02"]);
  assert.doesNotMatch(JSON.stringify(first), /OpenAI|Google|provider|route|disclosure/iu);
  assert.deepEqual(first.outputs.map((item) => item.outputId), [
    "case.watercolor:candidate-2",
    "case.watercolor:candidate-3",
    "case.watercolor:candidate-1",
  ]);

  const pairA = createBlindSession({ caseId: "case.watercolor", reviewerId: "reviewer-a", seed: "a", outputs: outputs.slice(0, 2) });
  const pairB = createBlindSession({ caseId: "case.watercolor", reviewerId: "reviewer-b", seed: "b", outputs: outputs.slice(0, 2) });
  assert.deepEqual(pairA.outputs.map((output) => output.reviewCopyId), ["review-copy-02", "review-copy-01"]);
  assert.deepEqual(pairB.outputs.map((output) => output.reviewCopyId), ["review-copy-01", "review-copy-02"]);
});

test("review history is append-only and rejects a replacement for an immutable review id", () => {
  const original = record({ id: "review-1", reviewerId: "reviewer-a", ratings: [rating("attribute", 4)] });
  const history = appendReviewRecord([], original);

  assert.equal(Object.isFrozen(history), true);
  assert.equal(Object.isFrozen(history[0]), true);
  assert.deepEqual(history[0].ratings[0].evidence[0], {
    kind: "region",
    x: 0.2,
    y: 0.25,
    width: 0.3,
    height: 0.2,
  });
  assert.throws(
    () => appendReviewRecord(history, { ...original, ratings: [rating("attribute", 1)] }),
    /already exists|immutable/iu,
  );
  assert.equal(history[0].ratings[0].score, 4);
});

test("disagreement detection retains both original ratings and low-confidence triggers adjudication", () => {
  const first = record({
    id: "review-1",
    reviewerId: "reviewer-a",
    ratings: [rating("attribute", 4), rating("spatial", 3, "low")],
  });
  const second = record({
    id: "review-2",
    reviewerId: "reviewer-b",
    ratings: [rating("attribute", 2), rating("spatial", 3, "high")],
  });

  const disagreements = findDisagreements([first, second]);

  assert.deepEqual(disagreements.map((item) => item.dimensionId), ["attribute", "spatial"]);
  assert.deepEqual(disagreements[0].originalRatings.map((item) => ({ reviewId: item.reviewId, score: item.score })), [
    { reviewId: "review-1", score: 4 },
    { reviewId: "review-2", score: 2 },
  ]);
  assert.equal(disagreements[0].reason, "score-gap");
  assert.equal(disagreements[1].reason, "low-confidence");
  assert.equal(disagreements.every((item) => item.status === "pending-adjudication"), true);
});

test("adjudication appends a resolution while preserving immutable independent ratings", () => {
  const first = record({ id: "review-1", reviewerId: "reviewer-a", ratings: [rating("attribute", 4)] });
  const second = record({ id: "review-2", reviewerId: "reviewer-b", ratings: [rating("attribute", 2)] });
  const disagreement = findDisagreements([first, second])[0];

  const adjudicated = adjudicateDisagreement(disagreement, {
    adjudicationId: "adjudication-1",
    adjudicatorId: "adjudicator-a",
    resolvedScore: 3,
    confidence: "high",
    rationale: "The decisive region shows partial attribute execution.",
    evidence: [{ kind: "region", x: 0.3, y: 0.2, width: 0.25, height: 0.25 }],
    submittedAt: "2026-08-24T00:10:00.000Z",
  });

  assert.equal(adjudicated.status, "resolved");
  assert.equal(adjudicated.resolvedScore, 3);
  assert.deepEqual(adjudicated.originalRatings.map((item) => item.score), [4, 2]);
  assert.deepEqual(adjudicated.originalReviewIds, ["review-1", "review-2"]);
  assert.equal(first.ratings[0].score, 4);
  assert.equal(second.ratings[0].score, 2);
  assert.equal(Object.isFrozen(adjudicated), true);
});
