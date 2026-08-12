/// <reference types="astro/client" />

import type { ComposerDraft } from "./lib/composer";

declare global {
  interface Window {
    promptAtlas?: {
      readFavorites: () => string[];
      showToast: (message: string, tone?: "default" | "error") => void;
      readActiveComposerDraft: () => ComposerDraft | undefined;
    };
  }
}

export {};
