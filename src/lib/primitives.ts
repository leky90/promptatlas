import manifest from "../data/primitive-reference-images.v1.json";

export type PrimitiveEntry = {
  index: number;
  id: string;
  dimensionId: string;
  group: PrimitiveGroupId;
  labelVi: string;
  definitionVi: string;
  promptFragment: string;
  example: string;
  exactPrompt: string;
  exactPromptSha256: string;
  alt: { vi: string; en: string };
  image: string;
  thumbnail: string;
  width: number;
  height: number;
};

export type PrimitiveGroupId = "subject" | "object" | "scene" | "composition" | "camera" | "lighting" | "color";

export const primitiveGroupMeta: ReadonlyArray<{ id: PrimitiveGroupId; label: string; order: string }> = [
  { id: "subject", label: "Chủ thể", order: "01" },
  { id: "object", label: "Vật thể", order: "02" },
  { id: "scene", label: "Bối cảnh", order: "03" },
  { id: "composition", label: "Bố cục", order: "04" },
  { id: "camera", label: "Máy ảnh", order: "05" },
  { id: "lighting", label: "Ánh sáng", order: "06" },
  { id: "color", label: "Màu sắc", order: "07" },
] as const;

export const primitiveEntries = manifest.entries as PrimitiveEntry[];

export const primitiveSlug = (primitive: Pick<PrimitiveEntry, "id">) => primitive.id.replaceAll(".", "-");

export const primitiveGroups = primitiveGroupMeta.map((group) => {
  const entries = primitiveEntries.filter((entry) => entry.group === group.id);
  return {
    ...group,
    count: entries.length,
    dimensions: [...new Set(entries.map((entry) => entry.dimensionId))].map((id) => ({
      id,
      label: id.split(".").at(-1)?.replaceAll("-", " ") ?? id,
      count: entries.filter((entry) => entry.dimensionId === id).length,
    })),
  };
});

export const primitiveManifestVersion = manifest.schemaVersion;
