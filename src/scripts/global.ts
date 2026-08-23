import { addPrimitiveToActiveDraft, readActiveDraft } from "./composer-store.ts";

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

function favoriteKeys(button: HTMLButtonElement) {
  return [button.dataset.favorite ?? "", ...(button.dataset.favoriteAliases ?? "").split(/\s+/u)].filter(Boolean);
}

function updateFavoriteButtons() {
  const favorites = new Set(readFavorites());
  document.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((button) => {
    const slug = button.dataset.favorite ?? "";
    const active = favoriteKeys(button).some((key) => favorites.has(key));
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
  window.dispatchEvent(new CustomEvent("prompt-atlas:favorites-change", { detail: readFavorites() }));
  document.querySelectorAll<HTMLButtonElement>("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.dataset.favorite;
      if (!slug) return;
      const favorites = new Set(readFavorites());
      const keys = favoriteKeys(button);
      const active = keys.some((key) => favorites.has(key));
      if (active) keys.forEach((key) => favorites.delete(key));
      else favorites.add(slug);
      if (writeFavorites([...favorites])) {
        updateFavoriteButtons();
        window.dispatchEvent(new CustomEvent("prompt-atlas:favorites-change", { detail: [...favorites] }));
        showToast(active ? "Đã bỏ khỏi bộ sưu tập." : "Đã lưu vào bộ sưu tập.");
      }
    });
  });
}

function initializeCopy() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy-target], [data-copy-value]").forEach((button) => {
    button.addEventListener("click", async () => {
      const disclosure = button.closest<HTMLDetailsElement>("details[data-prompt-disclosure]");
      if (button.hasAttribute("data-copy-requires-preview") && disclosure && !disclosure.open) {
        showToast("Hãy xem prompt trước khi sao chép.", "error");
        disclosure.open = true;
        disclosure.querySelector<HTMLElement>("[data-prompt-preview]")?.focus();
        return;
      }
      const selector = button.dataset.copyTarget;
      const target = selector ? document.querySelector<HTMLElement>(selector) : null;
      const value = (button.dataset.copyValue ?? target?.innerText ?? "").trim();
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
        if (target) {
          target.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(target);
          selection?.removeAllRanges();
          selection?.addRange(range);
          showToast("Không thể truy cập clipboard. Prompt đã được chọn để bạn sao chép.", "error");
        } else {
          showToast("Không thể truy cập clipboard trong trình duyệt này.", "error");
        }
      }
    });
  });
}

function initializeImageStates() {
  document.querySelectorAll<HTMLElement>("[data-image-frame]").forEach((frame) => {
    const image = frame.querySelector<HTMLImageElement>("img");
    const label = frame.querySelector<HTMLElement>("[data-image-load-state]");
    if (!image) return;

    frame.dataset.imageState = "loading";
    frame.setAttribute("aria-busy", "true");

    const setState = (state: "loaded" | "error") => {
      frame.dataset.imageState = state;
      frame.setAttribute("aria-busy", "false");
      if (label) label.textContent = state === "loaded" ? "" : "Không tải được ảnh";
    };

    if (image.complete) setState(image.naturalWidth > 0 ? "loaded" : "error");
    else {
      image.addEventListener("load", () => setState("loaded"), { once: true });
      image.addEventListener("error", () => setState("error"), { once: true });
    }
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

function initializeComposerEntries() {
  const update = () => {
    let selected = new Set<string>();
    try {
      selected = new Set((readActiveDraft(localStorage)?.items ?? []).map((item) => item.primitiveId));
    } catch {
      selected = new Set();
    }
    document.querySelectorAll<HTMLElement>("[data-composer-count]").forEach((element) => {
      element.textContent = String(selected.size);
    });
    const tray = document.querySelector<HTMLElement>("[data-composer-tray]");
    if (tray) tray.hidden = selected.size === 0 || document.body.classList.contains("composer-page");
    document.querySelectorAll<HTMLButtonElement>("[data-composer-add]").forEach((button) => {
      const active = selected.has(button.dataset.primitiveId ?? "");
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      const label = button.querySelector<HTMLElement>("[data-composer-add-label]");
      if (label) label.textContent = active ? "Đã thêm" : "Thêm vào prompt";
    });
  };

  document.querySelectorAll<HTMLButtonElement>("[data-composer-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const primitiveId = button.dataset.primitiveId;
      if (!primitiveId) return;
      try {
        const result = addPrimitiveToActiveDraft(localStorage, {
          primitiveId,
          dimensionId: button.dataset.primitiveDimension ?? (primitiveId.startsWith("primitive.style.") ? "style.medium" : ""),
          slug: button.dataset.primitiveSlug ?? "",
          label: button.dataset.primitiveLabel ?? primitiveId,
          fragment: button.dataset.primitiveFragment ?? "",
          sourcePrompt: button.dataset.sourcePrompt ?? "",
        });
        update();
        window.dispatchEvent(new CustomEvent("prompt-atlas:composer-change", { detail: result.draft }));
        const message = result.added
          ? "Đã thêm vào Composer."
          : result.reason === "dimension-conflict"
            ? "Dimension này đã có một giá trị trong Composer."
            : result.reason === "limit"
              ? "Composer đã đạt giới hạn 90 thành phần."
              : "Thành phần này đã có trong recipe.";
        showToast(message, result.reason === "dimension-conflict" || result.reason === "limit" ? "error" : "default");
      } catch {
        showToast("Không thể lưu recipe trong trình duyệt này.", "error");
      }
    });
  });
  window.addEventListener("prompt-atlas:composer-change", update);
  window.addEventListener("storage", update);
  update();
}

window.promptAtlas = { readFavorites, showToast, readActiveComposerDraft: () => readActiveDraft(localStorage) };

initializeNavigation();
initializeFavorites();
initializeCopy();
initializeImageStates();
initializeComposerEntries();

export {};
