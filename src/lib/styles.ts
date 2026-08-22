import rawStyles from "../data/styles.json";

export type ProviderScores = {
  promptAdherence: number;
  styleFidelity: number;
  composition: number;
  technicalQuality: number;
  detailIntegrity: number;
  average: number;
};

export type StyleImage = {
  full: string;
  thumb: string;
  width: number;
  height: number;
};

export type StyleRecord = {
  id: number;
  slug: string;
  name: string;
  title: string;
  subtitle: string;
  family: "Hội họa" | "Minh họa" | "Thủ công" | "Kỹ thuật số" | "Nhiếp ảnh" | "Lai phong cách";
  summary: string;
  cues: string[];
  sourcePrompt: string;
  generationPrompt: string;
  images: { chatgpt: StyleImage; gemini: StyleImage };
  scores: { chatgpt: ProviderScores; gemini: ProviderScores };
  winner: "ChatGPT" | "Gemini" | "Hòa";
  observation: string;
  related: string[];
};

export const styles = rawStyles as StyleRecord[];

export const families: StyleRecord["family"][] = [
  "Hội họa",
  "Minh họa",
  "Thủ công",
  "Kỹ thuật số",
  "Nhiếp ảnh",
  "Lai phong cách",
];

export function styleBySlug(slug: string) {
  return styles.find((style) => style.slug === slug);
}

export function paddedId(id: number) {
  return String(id).padStart(3, "0");
}

