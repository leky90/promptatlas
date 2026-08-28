import { anatomyCategoryById, anatomyDimensionSlug, anatomyDimensions, anatomyValuesForDimension } from "./anatomy";
import { primitiveEntries, primitiveGroupMeta, primitiveSlug } from "./primitives";
import { styles } from "./styles";

export const discoveryIndex = [
  ...styles.map((style) => ({
    id: `style-${style.slug}`,
    type: "style",
    typeLabel: "Phong cách",
    label: style.name,
    detail: style.title,
    keywords: [style.name, style.title, style.subtitle, style.summary, ...style.aliases, ...style.legacySlugs, ...style.cues].join(" "),
    href: `/styles/${style.slug}/`,
    openLabel: `Mở phong cách ${style.name}`,
    composer: {
      primitiveId: `primitive.style.${style.slug}`,
      primitiveAliases: style.legacySlugs.map((slug) => `primitive.style.${slug}`).join(" "),
      dimensionId: "style.medium",
      slug: style.slug,
      label: style.name,
      fragment: `Style/medium: ${style.promptReadyFragment.replace(/\.+$/u, "")}.`,
      sourcePrompt: style.sourcePrompt,
    },
  })),
  ...primitiveEntries.map((primitive) => ({
    id: `primitive-${primitive.id}`,
    type: "primitive",
    typeLabel: "Prompt primitives",
    label: primitive.labelVi,
    detail: primitiveGroupMeta.find((group) => group.id === primitive.group)?.label ?? primitive.group,
    keywords: [primitive.labelVi, primitive.definitionVi, primitive.promptFragment, primitive.example, primitive.dimensionId, primitive.group].join(" "),
    href: `/discover/?q=${encodeURIComponent(primitive.labelVi)}#discover-results`,
    openLabel: `Mở trong Học prompt: ${primitive.labelVi}`,
    composer: {
      primitiveId: primitive.id,
      primitiveAliases: "",
      dimensionId: primitive.dimensionId,
      slug: primitiveSlug(primitive),
      label: primitive.labelVi,
      fragment: primitive.promptFragment,
      sourcePrompt: primitive.example,
    },
  })),
  ...anatomyDimensions.map((dimension) => {
    const category = anatomyCategoryById(dimension.categoryId);
    const values = anatomyValuesForDimension(dimension.dimensionId);
    return {
      id: `anatomy-${dimension.dimensionId}`,
      type: "anatomy",
      typeLabel: "Image Anatomy",
      label: dimension.label.vi,
      detail: category?.label.vi ?? dimension.label.en,
      keywords: [
        dimension.label.vi,
        dimension.label.en,
        dimension.dimensionId,
        category?.label.vi ?? "",
        ...values.flatMap((value) => [value.label.vi, value.label.en, value.definition.vi, value.promptFragment, ...value.aliases]),
      ].join(" "),
      href: `/anatomy/${anatomyDimensionSlug(dimension.dimensionId)}/`,
      openLabel: `Mở Image Anatomy: ${dimension.label.vi}`,
    };
  }),
];
