import { addPrimitiveToActiveDraft, readActiveDraft } from "./composer-store.ts";

const storageKey = "prompt-atlas:favorites:v1";

type DiscoveryIndexItem = {
  id: string;
  type: "style" | "primitive" | "anatomy";
  typeLabel: string;
  label: string;
  detail: string;
  keywords: string;
  href: string;
  openLabel: string;
  composer?: {
    primitiveId: string;
    primitiveAliases: string;
    dimensionId: string;
    slug: string;
    label: string;
    fragment: string;
    sourcePrompt: string;
  };
};

const normalizeSearch = (value: string) => value
  .toLocaleLowerCase("vi")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/gu, "");

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
  const primitiveKeys = (button: HTMLButtonElement) => [
    button.dataset.primitiveId ?? "",
    ...(button.dataset.primitiveAliases ?? "").split(/\s+/u),
  ].filter(Boolean);

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
      const active = primitiveKeys(button).some((id) => selected.has(id));
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      const label = button.querySelector<HTMLElement>("[data-composer-add-label]");
      if (label) label.textContent = active ? "Đã thêm" : "Thêm vào prompt";
    });
  };

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button[data-composer-add]")
      : null;
    if (!button) return;
    const primitiveId = button.dataset.primitiveId;
    if (!primitiveId) return;
    try {
      const selected = new Set((readActiveDraft(localStorage)?.items ?? []).map((item) => item.primitiveId));
      if (primitiveKeys(button).some((id) => selected.has(id))) {
        update();
        showToast("Thành phần này đã có trong recipe.");
        return;
      }
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
  window.addEventListener("prompt-atlas:composer-change", update);
  window.addEventListener("storage", update);
  update();
}

function initializeSharedDiscovery() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-spotlight-dialog]");
  const shortcutDialog = document.querySelector<HTMLDialogElement>("[data-shortcut-dialog]");
  const input = dialog?.querySelector<HTMLInputElement>("[data-spotlight-search]");
  const resultList = dialog?.querySelector<HTMLElement>("[data-spotlight-results]");
  const count = dialog?.querySelector<HTMLElement>("[data-spotlight-count]");
  const indexSource = document.querySelector<HTMLScriptElement>("#spotlight-index");
  if (!dialog || !shortcutDialog || !input || !resultList || !count || !indexSource) return;

  let index: DiscoveryIndexItem[] = [];
  try {
    const parsed = JSON.parse(indexSource.textContent ?? "[]");
    if (Array.isArray(parsed)) index = parsed;
  } catch {
    index = [];
  }

  let activeIndex = -1;
  let previousFocus: HTMLElement | null = null;
  let shortcutPreviousFocus: HTMLElement | null = null;
  let resultRows: HTMLElement[] = [];
  const typeOrder: DiscoveryIndexItem["type"][] = ["style", "primitive", "anatomy"];

  const setActive = (next: number) => {
    if (resultRows.length === 0) {
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    activeIndex = (next + resultRows.length) % resultRows.length;
    resultRows.forEach((row, rowIndex) => row.setAttribute("aria-selected", String(rowIndex === activeIndex)));
    const active = resultRows[activeIndex];
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  };

  const createComposerButton = (item: DiscoveryIndexItem) => {
    if (!item.composer) return null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "spotlight-add";
    button.dataset.composerAdd = "";
    button.dataset.primitiveId = item.composer.primitiveId;
    button.dataset.primitiveAliases = item.composer.primitiveAliases;
    button.dataset.primitiveDimension = item.composer.dimensionId;
    button.dataset.primitiveSlug = item.composer.slug;
    button.dataset.primitiveLabel = item.composer.label;
    button.dataset.primitiveFragment = item.composer.fragment;
    button.dataset.sourcePrompt = item.composer.sourcePrompt;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `Thêm ${item.label} vào prompt`);
    const label = document.createElement("span");
    label.dataset.composerAddLabel = "";
    label.textContent = "Thêm";
    button.append(label);
    return button;
  };

  const render = () => {
    const query = normalizeSearch(input.value.trim());
    const tokens = query.split(/\s+/u).filter(Boolean);
    const matches = index.filter((item) => {
      const haystack = normalizeSearch(`${item.label} ${item.detail} ${item.keywords}`);
      return tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    });
    const limited = tokens.length === 0
      ? typeOrder.flatMap((type) => matches.filter((item) => item.type === type).slice(0, 3))
      : typeOrder.flatMap((type) => matches.filter((item) => item.type === type).slice(0, 8));

    resultList.replaceChildren();
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    for (const type of typeOrder) {
      const groupItems = limited.filter((item) => item.type === type);
      if (groupItems.length === 0) continue;
      const section = document.createElement("div");
      const typeLabel = groupItems[0].typeLabel;
      section.className = "spotlight-group";
      section.setAttribute("role", "rowgroup");
      section.setAttribute("aria-label", typeLabel);
      const headingRow = document.createElement("div");
      headingRow.setAttribute("role", "row");
      const heading = document.createElement("div");
      heading.setAttribute("role", "columnheader");
      heading.setAttribute("aria-colspan", "2");
      heading.textContent = typeLabel;
      headingRow.append(heading);
      section.append(headingRow);

      for (const item of groupItems) {
        const row = document.createElement("div");
        row.className = "spotlight-result";
        row.dataset.spotlightType = item.type;
        row.dataset.spotlightResultRow = "";
        row.id = `spotlight-row-${item.id.replace(/[^a-z0-9-]/giu, "-")}`;
        row.setAttribute("role", "row");
        row.setAttribute("aria-selected", "false");
        const openCell = document.createElement("div");
        openCell.setAttribute("role", "gridcell");
        const option = document.createElement("a");
        option.href = item.href;
        option.className = "spotlight-option";
        option.setAttribute("aria-label", item.openLabel);
        option.tabIndex = -1;
        const copy = document.createElement("span");
        const label = document.createElement("strong");
        label.textContent = item.label;
        const detail = document.createElement("small");
        detail.textContent = item.detail;
        copy.append(label, detail);
        const action = document.createElement("span");
        action.textContent = "Mở";
        option.append(copy, action);
        openCell.append(option);
        const actionCell = document.createElement("div");
        actionCell.setAttribute("role", "gridcell");
        const composer = createComposerButton(item);
        if (composer) actionCell.append(composer);
        row.append(openCell, actionCell);
        section.append(row);
      }
      resultList.append(section);
    }

    resultRows = [...resultList.querySelectorAll<HTMLElement>("[data-spotlight-result-row]")];
    count.textContent = tokens.length === 0
      ? "Gợi ý từ ba thư viện."
      : `${matches.length} kết quả trong ${new Set(matches.map((item) => item.type)).size} nhóm`;
    if (matches.length === 0) {
      const emptyRow = document.createElement("div");
      emptyRow.setAttribute("role", "row");
      const empty = document.createElement("div");
      empty.setAttribute("role", "gridcell");
      empty.setAttribute("aria-colspan", "2");
      empty.className = "spotlight-empty";
      empty.textContent = "Không có kết quả. Thử một từ khóa hoặc tên gọi khác.";
      emptyRow.append(empty);
      resultList.append(emptyRow);
    }
  };

  const openSpotlight = (initialQuery = "") => {
    if (!dialog.open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    input.value = initialQuery;
    input.setAttribute("aria-expanded", "true");
    render();
    window.requestAnimationFrame(() => input.focus());
  };

  document.querySelectorAll<HTMLButtonElement>("[data-spotlight-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => openSpotlight());
  });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex <= 0 ? resultRows.length - 1 : activeIndex - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      resultRows[activeIndex]?.querySelector<HTMLAnchorElement>("a")?.click();
    }
  });
  resultList.addEventListener("pointermove", (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-spotlight-result-row]") : null;
    if (!row) return;
    const rowIndex = resultRows.indexOf(row);
    if (rowIndex >= 0 && rowIndex !== activeIndex) setActive(rowIndex);
  });

  dialog.addEventListener("close", () => {
    const focusTarget = previousFocus;
    previousFocus = null;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    window.setTimeout(() => focusTarget?.focus(), 0);
  });
  shortcutDialog.addEventListener("close", () => {
    const focusTarget = shortcutPreviousFocus;
    shortcutPreviousFocus = null;
    window.setTimeout(() => focusTarget?.focus(), 0);
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLElement && target.isContentEditable);
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      openSpotlight(input.value);
      return;
    }
    if (editing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      event.preventDefault();
      shortcutPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      shortcutDialog.showModal();
      window.requestAnimationFrame(() => shortcutDialog.querySelector<HTMLButtonElement>("button")?.focus());
    } else if (event.key === "/") {
      event.preventDefault();
      openSpotlight();
    }
  });
}

window.promptAtlas = { readFavorites, showToast, readActiveComposerDraft: () => readActiveDraft(localStorage) };

initializeNavigation();
initializeFavorites();
initializeCopy();
initializeImageStates();
initializeComposerEntries();
initializeSharedDiscovery();

export {};
