export const COMPOSER_SCHEMA_VERSION = "1.0.0";
export const COMPOSER_DATASET_VERSION = "1.0.0";
export const SHARE_FORMAT_VERSION = 1;
export const SHARE_URL_LIMIT = 6000;

export type ComposerPrimitive = {
  primitiveId: string;
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
  if (existingIndex >= 0) return { draft, added: false, existingIndex };
  return {
    added: true,
    existingIndex: -1,
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
  return [
    "Use case: composed image direction",
    `Primary request: ${sourcePrompt}`,
    "Style/medium recipe (apply in this order):",
    fragments,
    "Composition/framing: landscape 3:2, clear focal subject, controlled hierarchy.",
    "Lighting/mood: coherent with the ordered style recipe and primary request.",
    "Constraints: no text; no unrelated objects; no visible brand names; no logos; no watermark.",
  ].join("\n");
}
