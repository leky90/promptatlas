/// <reference types="astro/client" />

interface Window {
  promptAtlas?: {
    readFavorites: () => string[];
    showToast: (message: string, tone?: "default" | "error") => void;
  };
}
