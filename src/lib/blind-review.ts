export type Confidence = "low" | "medium" | "high";

export type EvidenceRegion = {
  kind: "region";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BlindReviewRating = {
  dimensionId: string;
  score: number | null;
  confidence: Confidence;
  rationale: string;
  evidence: EvidenceRegion[];
};

export type BlindReviewRecord = {
  id: string;
  caseId: string;
  outputId: string;
  reviewerId: string;
  protocolVersion: string;
  calibrationVersion: string;
  submittedAt: string;
  ratings: BlindReviewRating[];
};

export type ReviewOutput = {
  outputId: string;
  reviewCopy: { id: string; path: string; width: number; height: number };
};

export type BlindOutput = {
  blindId: string;
  outputId: string;
  reviewCopyId: string;
  image: { path: string; width: number; height: number; alt: string };
};

export type ReviewDisagreement = {
  id: string;
  caseId: string;
  outputId: string;
  dimensionId: string;
  reason: "score-gap" | "n-a-mismatch" | "low-confidence";
  status: "pending-adjudication";
  originalRatings: Array<{
    reviewId: string;
    reviewerId: string;
    score: number | null;
    confidence: Confidence;
    rationale: string;
    evidence: EvidenceRegion[];
  }>;
};

const blindIds = ["A", "B", "N"];

function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function seedValue(seed: string) {
  return [...seed].reduce((total, character) => total + character.codePointAt(0)!, 0);
}

function reviewerOrder<T>(items: T[], seed: string) {
  if (items.length < 2) return [...items];
  const value = seedValue(seed);
  const offset = value % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function createBlindSession({
  caseId,
  reviewerId,
  seed,
  outputs,
}: {
  caseId: string;
  reviewerId: string;
  seed: string;
  outputs: ReviewOutput[];
}) {
  if (!caseId.trim() || !reviewerId.trim() || outputs.length < 2 || outputs.length > 3) {
    throw new Error("A blind session requires a case, reviewer and two or three outputs.");
  }
  const ordered = reviewerOrder(outputs, seed);
  const neutralOutputs: BlindOutput[] = ordered.map((output, index) => ({
    blindId: blindIds[index],
    outputId: output.outputId,
    reviewCopyId: output.reviewCopy.id,
    image: {
      path: output.reviewCopy.path,
      width: output.reviewCopy.width,
      height: output.reviewCopy.height,
      alt: `Output ${blindIds[index]} — ảnh review mù`,
    },
  }));
  return deepFreeze({
    caseId,
    reviewerId,
    status: "in-progress" as const,
    outputs: neutralOutputs,
  });
}

export function appendReviewRecord(history: BlindReviewRecord[], record: BlindReviewRecord) {
  if (!record.id.trim() || history.some((candidate) => candidate.id === record.id)) {
    throw new Error(`Review ${record.id || "(missing)"} already exists; immutable review history cannot be replaced.`);
  }
  const immutableRecord = deepFreeze(structuredClone(record)) as BlindReviewRecord;
  return deepFreeze([...history, immutableRecord]) as readonly BlindReviewRecord[];
}

export function findDisagreements(records: BlindReviewRecord[]) {
  const ratingsByKey = new Map<string, ReviewDisagreement["originalRatings"]>();
  const order: string[] = [];
  for (const record of records) {
    for (const rating of record.ratings) {
      const key = `${record.caseId}\u0000${record.outputId}\u0000${rating.dimensionId}`;
      if (!ratingsByKey.has(key)) {
        ratingsByKey.set(key, []);
        order.push(key);
      }
      ratingsByKey.get(key)!.push({
        reviewId: record.id,
        reviewerId: record.reviewerId,
        score: rating.score,
        confidence: rating.confidence,
        rationale: rating.rationale,
        evidence: structuredClone(rating.evidence),
      });
    }
  }

  const disagreements: ReviewDisagreement[] = [];
  for (const key of order) {
    const originalRatings = ratingsByKey.get(key)!;
    if (new Set(originalRatings.map((item) => item.reviewerId)).size < 2) continue;
    const numericScores = originalRatings.map((item) => item.score).filter((score): score is number => typeof score === "number");
    const nAMismatch = numericScores.length > 0 && numericScores.length !== originalRatings.length;
    const scoreGap = numericScores.length > 1 && Math.max(...numericScores) - Math.min(...numericScores) >= 2;
    const lowConfidence = originalRatings.some((item) => item.confidence === "low");
    const reason = nAMismatch ? "n-a-mismatch" : scoreGap ? "score-gap" : lowConfidence ? "low-confidence" : null;
    if (!reason) continue;
    const [caseId, outputId, dimensionId] = key.split("\u0000");
    disagreements.push({
      id: `${caseId}:${outputId}:${dimensionId}`,
      caseId,
      outputId,
      dimensionId,
      reason,
      status: "pending-adjudication",
      originalRatings,
    });
  }
  return deepFreeze(disagreements) as readonly ReviewDisagreement[];
}

export function adjudicateDisagreement(
  disagreement: ReviewDisagreement,
  resolution: {
    adjudicationId: string;
    adjudicatorId: string;
    resolvedScore: number | null;
    confidence: Confidence;
    rationale: string;
    evidence: EvidenceRegion[];
    submittedAt: string;
  },
) {
  if (!resolution.adjudicationId.trim() || !resolution.adjudicatorId.trim() || !resolution.rationale.trim()) {
    throw new Error("Adjudication identity and rationale are required.");
  }
  return deepFreeze({
    ...structuredClone(disagreement),
    status: "resolved" as const,
    originalReviewIds: disagreement.originalRatings.map((item) => item.reviewId),
    resolvedScore: resolution.resolvedScore,
    adjudication: structuredClone(resolution),
  });
}
