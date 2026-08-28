import {
  anatomyCategoryById,
  anatomyDimensionById,
  anatomyDimensionSlug,
} from "./anatomy";
import {
  primitiveGroupMeta,
  type PrimitiveEntry,
  type PrimitiveGroupId,
} from "./primitives";

const anatomyCategoryByPrimitiveGroup: Record<PrimitiveGroupId, string> = {
  subject: "subject",
  object: "object",
  scene: "scene",
  composition: "composition",
  camera: "camera",
  lighting: "lighting",
  color: "color",
};

export const primitiveAnatomyGroupMappings = primitiveGroupMeta.map((group) => {
  const categoryId = anatomyCategoryByPrimitiveGroup[group.id];
  const category = anatomyCategoryById(categoryId);
  if (!category) throw new Error(`Missing Image Anatomy category for Prompt primitive group ${group.id}`);
  return {
    primitiveGroupId: group.id,
    primitiveGroupLabel: group.label,
    anatomyCategoryId: category.categoryId,
    anatomyCategoryLabel: category.label.vi,
    href: `/anatomy/?category=${encodeURIComponent(category.categoryId)}`,
  };
});

export function anatomyTargetForPrimitive(primitive: Pick<PrimitiveEntry, "dimensionId" | "group">) {
  const expectedCategoryId = anatomyCategoryByPrimitiveGroup[primitive.group];
  const dimension = anatomyDimensionById(primitive.dimensionId);
  if (!dimension || dimension.categoryId !== expectedCategoryId) return undefined;
  const category = anatomyCategoryById(dimension.categoryId);
  if (!category) return undefined;
  return {
    categoryId: category.categoryId,
    categoryLabel: category.label.vi,
    dimensionId: dimension.dimensionId,
    dimensionLabel: dimension.label.vi,
    href: `/anatomy/${anatomyDimensionSlug(dimension.dimensionId)}/`,
  };
}
