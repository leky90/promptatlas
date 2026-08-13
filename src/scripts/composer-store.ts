import {
  COMPOSER_DATASET_VERSION,
  COMPOSER_SCHEMA_VERSION,
  SHARE_URL_LIMIT,
  addPrimitive,
  createDraft,
  normalizeComposerPrimitive,
  primitiveDimensionId,
  type ComposerDraft,
  type ComposerPrimitive,
} from "../lib/composer.ts";

export const DRAFT_KEY_PREFIX = "pa:drafts:v1:";
export const DRAFT_INDEX_KEY = "pa:drafts:index:v1";
export const ACTIVE_DRAFT_KEY = "pa:drafts:active:v1";
export const MAX_COMPOSER_ITEMS = 90;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PrimitiveIdentity = Pick<ComposerPrimitive, "slug" | "dimensionId">;
export type PrimitiveIdentityRegistry = ReadonlyMap<string, PrimitiveIdentity>;

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
  return value?.format === "prompt-atlas-draft" && Array.isArray(value.items)
    ? { ...value, items: value.items.map(normalizeComposerPrimitive) }
    : undefined;
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

export function removeActiveDraft(storage: StorageLike) {
  const draftId = storage.getItem(ACTIVE_DRAFT_KEY);
  if (!draftId) return;
  const index = readIndex(storage).filter((item) => item.draftId !== draftId);
  storage.removeItem(`${DRAFT_KEY_PREFIX}${draftId}`);
  storage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
  if (index[0]) storage.setItem(ACTIVE_DRAFT_KEY, index[0].draftId);
  else storage.removeItem(ACTIVE_DRAFT_KEY);
}

export function addPrimitiveToActiveDraft(
  storage: StorageLike,
  primitive: ComposerPrimitive,
  options: { uuid?: () => string; now?: () => string } = {},
) {
  const now = options.now ?? defaultNow;
  const current = readActiveDraft(storage) ?? createDraft((options.uuid ?? defaultUuid)(), now());
  const result = addPrimitive(current, primitive, now());
  if (result.added && current.items.length >= MAX_COMPOSER_ITEMS) {
    return { draft: current, added: false, existingIndex: -1, reason: "limit" as const };
  }
  if (result.added) persistDraft(storage, result.draft);
  return result;
}

const snapshotBody = (snapshot: Omit<ShareSnapshot, "sha256">) => JSON.stringify(snapshot);

const PRIMITIVE_STRING_LIMITS: Record<Exclude<keyof ComposerPrimitive, "dimensionId">, number> = {
  primitiveId: 160,
  slug: 120,
  label: 160,
  fragment: 4000,
  sourcePrompt: 8000,
};

const isNonEmptyBoundedString = (value: unknown, limit: number) => (
  typeof value === "string" && value.trim().length > 0 && value.length <= limit
);

const validatePrimitive = (
  value: unknown,
  index: number,
): value is ComposerPrimitive => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Snapshot không hợp lệ: thành phần ${index + 1} phải là một object.`);
  }
  const primitive = value as Record<string, unknown>;
  for (const [field, limit] of Object.entries(PRIMITIVE_STRING_LIMITS)) {
    const candidate = primitive[field];
    if (!isNonEmptyBoundedString(candidate, limit)) {
      throw new Error(`Snapshot không hợp lệ: ${field} của thành phần ${index + 1} phải là chuỗi từ 1 đến ${limit} ký tự.`);
    }
  }
  const legacyStyle = primitive.dimensionId == null
    && typeof primitive.primitiveId === "string"
    && primitive.primitiveId.startsWith("primitive.style.");
  if (!legacyStyle && !isNonEmptyBoundedString(primitive.dimensionId, 160)) {
    throw new Error(`Snapshot không hợp lệ: dimensionId của thành phần ${index + 1} phải là chuỗi từ 1 đến 160 ký tự.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(primitive.primitiveId as string)) {
    throw new Error(`Snapshot không hợp lệ: primitiveId của thành phần ${index + 1} sai định dạng.`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/iu.test(primitive.slug as string)) {
    throw new Error(`Snapshot không hợp lệ: slug của thành phần ${index + 1} sai định dạng.`);
  }
  return true;
};

const validateRecipeRelationships = (
  snapshot: ShareSnapshot,
  primitiveIdentities: PrimitiveIdentityRegistry,
) => {
  if (snapshot.recipe.items.length > MAX_COMPOSER_ITEMS) {
    throw new Error(`Snapshot không hợp lệ: recipe có tối đa ${MAX_COMPOSER_ITEMS} thành phần.`);
  }
  snapshot.recipe.items.forEach(validatePrimitive);

  const primitiveIds = snapshot.recipe.items.map((item) => item.primitiveId);
  const slugs = snapshot.recipe.items.map((item) => item.slug);
  if (new Set(primitiveIds).size !== primitiveIds.length) {
    throw new Error("Snapshot không hợp lệ: primitiveId phải duy nhất trong recipe.");
  }
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("Snapshot không hợp lệ: slug phải duy nhất trong recipe.");
  }
  snapshot.recipe.items.forEach((item, index) => {
    const canonical = primitiveIdentities.get(item.primitiveId);
    if (
      !canonical
      || canonical.slug !== item.slug
      || canonical.dimensionId !== primitiveDimensionId(item)
    ) {
      throw new Error(`Snapshot không hợp lệ: thành phần ${index + 1} không thuộc bộ dữ liệu Prompt Atlas production.`);
    }
  });

  const validBlendKeys = new Set<string>();
  for (let first = 0; first < primitiveIds.length; first += 1) {
    for (let second = first + 1; second < primitiveIds.length; second += 1) {
      validBlendKeys.add([primitiveIds[first], primitiveIds[second]].sort().join("::"));
    }
  }
  const acceptedBlendKeys = snapshot.recipe.acceptedBlendKeys;
  if (
    acceptedBlendKeys.some((key) => typeof key !== "string" || !validBlendKeys.has(key))
    || new Set(acceptedBlendKeys).size !== acceptedBlendKeys.length
  ) {
    throw new Error("Snapshot không hợp lệ: mỗi blend key phải duy nhất và tham chiếu đúng hai thành phần trong recipe.");
  }
};

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

async function validateSnapshot(
  value: unknown,
  primitiveIdentities: PrimitiveIdentityRegistry,
): Promise<ShareSnapshot> {
  if (!value || typeof value !== "object") throw new Error("Snapshot không hợp lệ.");
  const snapshot = value as ShareSnapshot;
  if (
    snapshot.format !== "prompt-atlas-recipe"
    || snapshot.formatVersion !== 1
    || snapshot.schemaVersion !== COMPOSER_SCHEMA_VERSION
    || snapshot.datasetVersion !== COMPOSER_DATASET_VERSION
    || !snapshot.recipe
    || typeof snapshot.recipe !== "object"
    || Array.isArray(snapshot.recipe)
    || !Array.isArray(snapshot.recipe.items)
    || !Array.isArray(snapshot.recipe.acceptedBlendKeys)
    || !isNonEmptyBoundedString(snapshot.snapshotId, 160)
    || typeof snapshot.createdAt !== "string"
    || Number.isNaN(Date.parse(snapshot.createdAt))
    || typeof snapshot.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(snapshot.sha256)
  ) {
    throw new Error("Phiên bản snapshot không được hỗ trợ.");
  }
  const { sha256, ...body } = snapshot;
  if (await sha256Text(snapshotBody(body)) !== sha256) throw new Error("Checksum snapshot không khớp.");
  validateRecipeRelationships(snapshot, primitiveIdentities);
  return snapshot;
}

export async function decodeSnapshot(
  payload: string,
  primitiveIdentities: PrimitiveIdentityRegistry,
): Promise<ShareSnapshot> {
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return await validateSnapshot(
      JSON.parse(new TextDecoder().decode(base64ToBytes(padded))),
      primitiveIdentities,
    );
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
    items: snapshot.recipe.items.map(normalizeComposerPrimitive),
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

export async function parseExportFile(
  content: string,
  primitiveIdentities: PrimitiveIdentityRegistry,
) {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("Tệp Prompt Atlas không phải JSON hợp lệ.");
  }
  return validateSnapshot(value, primitiveIdentities);
}
