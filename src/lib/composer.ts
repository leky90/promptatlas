export const COMPOSER_SCHEMA_VERSION = "1.0.0";
export const COMPOSER_DATASET_VERSION = "1.0.0";
export const SHARE_FORMAT_VERSION = 1;
export const SHARE_URL_LIMIT = 6000;

export type ComposerPrimitive = {
  primitiveId: string;
  dimensionId: string;
  slug: string;
  label: string;
  fragment: string;
  sourcePrompt: string;
};

export type ComposerDraft = {
  format: "prompt-atlas-draft";
  formatVersion: 1;
  schemaVersion: string;
  datasetVersion: string;
  draftId: string;
  createdAt: string;
  updatedAt: string;
  sourceSnapshotHash?: string;
  items: ComposerPrimitive[];
  acceptedBlendKeys: string[];
};

export type BlendConflict = {
  key: string;
  primitiveIds: [string, string];
  labels: [string, string];
};

const blendKey = (firstId: string, secondId: string) => [firstId, secondId].sort().join("::");
const BLENDABLE_DIMENSION_IDS = new Set(["style.medium"]);

export const primitiveDimensionId = (primitive: Pick<ComposerPrimitive, "primitiveId"> & Partial<Pick<ComposerPrimitive, "dimensionId">>) => (
  primitive.dimensionId || (primitive.primitiveId.startsWith("primitive.style.") ? "style.medium" : "")
);

export function createDraft(draftId: string, now = new Date().toISOString()): ComposerDraft {
  return {
    format: "prompt-atlas-draft",
    formatVersion: 1,
    schemaVersion: COMPOSER_SCHEMA_VERSION,
    datasetVersion: COMPOSER_DATASET_VERSION,
    draftId,
    createdAt: now,
    updatedAt: now,
    items: [],
    acceptedBlendKeys: [],
  };
}

export function addPrimitive(draft: ComposerDraft, primitive: ComposerPrimitive, now = new Date().toISOString()) {
  const existingIndex = draft.items.findIndex((item) => item.primitiveId === primitive.primitiveId);
  if (existingIndex >= 0) return { draft, added: false, existingIndex, reason: "duplicate" as const };
  const dimensionId = primitiveDimensionId(primitive);
  const dimensionConflictIndex = dimensionId && !BLENDABLE_DIMENSION_IDS.has(dimensionId)
    ? draft.items.findIndex((item) => primitiveDimensionId(item) === dimensionId)
    : -1;
  if (dimensionConflictIndex >= 0) {
    return { draft, added: false, existingIndex: dimensionConflictIndex, reason: "dimension-conflict" as const };
  }
  return {
    added: true,
    existingIndex: -1,
    reason: "added" as const,
    draft: { ...draft, updatedAt: now, items: [...draft.items, structuredClone(primitive)] },
  };
}

export function movePrimitive(
  draft: ComposerDraft,
  primitiveId: string,
  delta: -1 | 1,
  now = new Date().toISOString(),
): ComposerDraft {
  const from = draft.items.findIndex((item) => item.primitiveId === primitiveId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.items.length) return draft;
  const items = [...draft.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return { ...draft, items, updatedAt: now };
}

export function removePrimitive(
  draft: ComposerDraft,
  primitiveId: string,
  now = new Date().toISOString(),
): ComposerDraft {
  if (!draft.items.some((item) => item.primitiveId === primitiveId)) return draft;
  const items = draft.items.filter((item) => item.primitiveId !== primitiveId);
  const activeKeys = new Set<string>();
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      activeKeys.add(blendKey(items[first].primitiveId, items[second].primitiveId));
    }
  }
  return {
    ...draft,
    items,
    acceptedBlendKeys: draft.acceptedBlendKeys.filter((key) => activeKeys.has(key)),
    updatedAt: now,
  };
}

export function deriveBlendConflicts(draft: ComposerDraft): BlendConflict[] {
  const accepted = new Set(draft.acceptedBlendKeys);
  const conflicts: BlendConflict[] = [];
  for (let first = 0; first < draft.items.length; first += 1) {
    for (let second = first + 1; second < draft.items.length; second += 1) {
      const firstItem = draft.items[first];
      const secondItem = draft.items[second];
      if (!firstItem.primitiveId.startsWith("primitive.style.") || !secondItem.primitiveId.startsWith("primitive.style.")) continue;
      const key = blendKey(firstItem.primitiveId, secondItem.primitiveId);
      if (!accepted.has(key)) {
        conflicts.push({
          key,
          primitiveIds: [firstItem.primitiveId, secondItem.primitiveId],
          labels: [firstItem.label, secondItem.label],
        });
      }
    }
  }
  return conflicts;
}

export function acceptBlend(
  draft: ComposerDraft,
  key: string,
  now = new Date().toISOString(),
): ComposerDraft {
  if (draft.acceptedBlendKeys.includes(key)) return draft;
  return { ...draft, acceptedBlendKeys: [...draft.acceptedBlendKeys, key], updatedAt: now };
}

export function renderPrompt(draft: ComposerDraft): string {
  if (draft.items.length === 0) return "";
  const sourcePrompt = draft.items[0].sourcePrompt.trim();
  const fragments = draft.items.map((item, index) => `${index + 1}. ${item.fragment.trim()}`).join("\n");
  const aspectRatio = draft.items.find((item) => primitiveDimensionId(item) === "composition.aspect-ratio")
    ?.fragment.trim().replace(/\.+$/u, "");
  const framing = aspectRatio
    ? `${aspectRatio}, clear focal subject, controlled hierarchy.`
    : "clear focal subject, controlled hierarchy.";
  return [
    "Use case: composed image direction",
    `Primary request: ${sourcePrompt}`,
    "Prompt recipe (apply in this order):",
    fragments,
    `Composition/framing: ${framing}`,
    "Lighting/mood: coherent with the ordered recipe and primary request.",
    "Constraints: no text; no unrelated objects; no visible brand names; no logos; no watermark.",
  ].join("\n");
}
