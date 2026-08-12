import {
  SHARE_URL_LIMIT,
  addPrimitive,
  createDraft,
  type ComposerDraft,
  type ComposerPrimitive,
} from "../lib/composer.ts";

export const DRAFT_KEY_PREFIX = "pa:drafts:v1:";
export const DRAFT_INDEX_KEY = "pa:drafts:index:v1";
export const ACTIVE_DRAFT_KEY = "pa:drafts:active:v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type DraftIndexItem = { draftId: string; updatedAt: string; itemCount: number };

export type ShareSnapshot = {
  format: "prompt-atlas-recipe";
  formatVersion: 1;
  schemaVersion: string;
  datasetVersion: string;
  snapshotId: string;
  createdAt: string;
  recipe: Pick<ComposerDraft, "items" | "acceptedBlendKeys">;
  sha256: string;
};

const defaultUuid = () => crypto.randomUUID();
const defaultNow = () => new Date().toISOString();

const readJson = <T>(value: string | null): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const readIndex = (storage: StorageLike) => {
  const value = readJson<DraftIndexItem[]>(storage.getItem(DRAFT_INDEX_KEY));
  return Array.isArray(value) ? value : [];
};

export function readDraft(storage: StorageLike, draftId: string): ComposerDraft | undefined {
  const value = readJson<ComposerDraft>(storage.getItem(`${DRAFT_KEY_PREFIX}${draftId}`));
  return value?.format === "prompt-atlas-draft" && Array.isArray(value.items) ? value : undefined;
}

export function readActiveDraft(storage: StorageLike): ComposerDraft | undefined {
  const draftId = storage.getItem(ACTIVE_DRAFT_KEY);
  return draftId ? readDraft(storage, draftId) : undefined;
}

export function persistDraft(storage: StorageLike, draft: ComposerDraft) {
  const index = readIndex(storage).filter((item) => item.draftId !== draft.draftId);
  index.unshift({ draftId: draft.draftId, updatedAt: draft.updatedAt, itemCount: draft.items.length });
  storage.setItem(`${DRAFT_KEY_PREFIX}${draft.draftId}`, JSON.stringify(draft));
  storage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
  storage.setItem(ACTIVE_DRAFT_KEY, draft.draftId);
  return draft;
}

export function addPrimitiveToActiveDraft(
  storage: StorageLike,
  primitive: ComposerPrimitive,
  options: { uuid?: () => string; now?: () => string } = {},
) {
  const now = options.now ?? defaultNow;
  const current = readActiveDraft(storage) ?? createDraft((options.uuid ?? defaultUuid)(), now());
  const result = addPrimitive(current, primitive, now());
  if (result.added) persistDraft(storage, result.draft);
  return result;
}

const snapshotBody = (snapshot: Omit<ShareSnapshot, "sha256">) => JSON.stringify(snapshot);

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSnapshot(
  draft: ComposerDraft,
  now = defaultNow(),
): Promise<ShareSnapshot> {
  const body: Omit<ShareSnapshot, "sha256"> = {
    format: "prompt-atlas-recipe",
    formatVersion: 1,
    schemaVersion: draft.schemaVersion,
    datasetVersion: draft.datasetVersion,
    snapshotId: draft.draftId,
    createdAt: now,
    recipe: {
      items: structuredClone(draft.items),
      acceptedBlendKeys: [...draft.acceptedBlendKeys],
    },
  };
  return { ...body, sha256: await sha256Text(snapshotBody(body)) };
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export function encodeSnapshot(snapshot: ShareSnapshot) {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(snapshot)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function validateSnapshot(value: unknown): Promise<ShareSnapshot> {
  if (!value || typeof value !== "object") throw new Error("Snapshot không hợp lệ.");
  const snapshot = value as ShareSnapshot;
  if (
    snapshot.format !== "prompt-atlas-recipe"
    || snapshot.formatVersion !== 1
    || !snapshot.recipe
    || !Array.isArray(snapshot.recipe.items)
    || !Array.isArray(snapshot.recipe.acceptedBlendKeys)
    || typeof snapshot.sha256 !== "string"
  ) {
    throw new Error("Phiên bản snapshot không được hỗ trợ.");
  }
  const { sha256, ...body } = snapshot;
  if (await sha256Text(snapshotBody(body)) !== sha256) throw new Error("Checksum snapshot không khớp.");
  return snapshot;
}

export async function decodeSnapshot(payload: string): Promise<ShareSnapshot> {
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return await validateSnapshot(JSON.parse(new TextDecoder().decode(base64ToBytes(padded))));
  } catch (error) {
    if (error instanceof Error && /Snapshot|Checksum|Phiên bản/u.test(error.message)) throw error;
    throw new Error("Snapshot không hợp lệ hoặc đã bị hỏng.");
  }
}

export function buildShareUrl(baseUrl: string, payload: string) {
  const url = `${baseUrl.replace(/#.*$/u, "")}#r=${payload}`;
  return { url, length: url.length, shareable: url.length <= SHARE_URL_LIMIT };
}

export function forkSnapshot(
  storage: StorageLike,
  snapshot: ShareSnapshot,
  options: { uuid?: () => string; now?: () => string } = {},
) {
  const now = options.now ?? defaultNow;
  const draft = createDraft((options.uuid ?? defaultUuid)(), now());
  return persistDraft(storage, {
    ...draft,
    sourceSnapshotHash: snapshot.sha256,
    items: structuredClone(snapshot.recipe.items),
    acceptedBlendKeys: [...snapshot.recipe.acceptedBlendKeys],
  });
}

export function createExportFile(snapshot: ShareSnapshot) {
  const safeId = snapshot.snapshotId.replace(/[^a-z0-9._-]/giu, "-");
  return {
    filename: `prompt-atlas-recipe-${safeId}.promptatlas.json`,
    mimeType: "application/json",
    content: `${JSON.stringify(snapshot, null, 2)}\n`,
  };
}

export async function parseExportFile(content: string) {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("Tệp Prompt Atlas không phải JSON hợp lệ.");
  }
  return validateSnapshot(value);
}
