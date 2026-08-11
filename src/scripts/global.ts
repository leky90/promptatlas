const storageKey = "prompt-atlas:favorites:v1";

function readFavorites(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(favorites: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(favorites));
    return true;
  } catch {
    showToast("Trình duyệt đang chặn lưu cục bộ.", "error");
    return false;
  }
}

function updateFavoriteButtons() {
  const favorites = new Set(readFavorites());
  document.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((button) => {
    const slug = button.dataset.favorite ?? "";
    const active = favorites.has(slug);
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("is-active", active);
    const text = button.querySelector<HTMLElement>("[data-favorite-label]");
    if (text) text.textContent = active ? "Đã lưu" : "Lưu";
    button.setAttribute("aria-label", `${active ? "Bỏ lưu" : "Lưu"} phong cách ${button.dataset.styleName ?? slug}`);
  });
}

function showToast(message: string, tone: "default" | "error" = "default") {
  const toast = document.querySelector<HTMLElement>("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  window.clearTimeout(Number(toast.dataset.timer));
  const timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
  toast.dataset.timer = String(timer);
}

function initializeFavorites() {
  updateFavoriteButtons();
  document.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.dataset.favorite;
      if (!slug) return;
      const favorites = new Set(readFavorites());
      favorites.has(slug) ? favorites.delete(slug) : favorites.add(slug);
      if (writeFavorites([...favorites])) {
        updateFavoriteButtons();
        window.dispatchEvent(new CustomEvent("prompt-atlas:favorites-change", { detail: [...favorites] }));
        showToast(favorites.has(slug) ? "Đã lưu vào bộ sưu tập." : "Đã bỏ khỏi bộ sưu tập.");
      }
    });
  });
}

function initializeCopy() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.querySelector<HTMLElement>(button.dataset.copyTarget ?? "");
      if (!target) return;
      const value = target.innerText.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const label = button.querySelector<HTMLElement>("[data-copy-label]");
        const previous = label?.textContent;
        if (label) label.textContent = "Đã sao chép";
        showToast("Prompt đã nằm trong clipboard.");
        window.setTimeout(() => {
          if (label) label.textContent = previous ?? "Sao chép prompt";
        }, 1800);
      } catch {
        target.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
        showToast("Không thể truy cập clipboard. Prompt đã được chọn để bạn sao chép.", "error");
      }
    });
  });
}

function initializeNavigation() {
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  const nav = document.querySelector<HTMLElement>("[data-site-nav]");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    nav.dataset.open = String(!expanded);
  });
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    toggle.setAttribute("aria-expanded", "false");
    nav.dataset.open = "false";
  }));
}

initializeNavigation();
initializeFavorites();
initializeCopy();

declare global {
  interface Window {
    promptAtlas?: { readFavorites: () => string[]; showToast: typeof showToast };
  }
}

window.promptAtlas = { readFavorites, showToast };

export {};
