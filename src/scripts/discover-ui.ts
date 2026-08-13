const workspace = document.querySelector<HTMLElement>("[data-discover-workspace]");

if (workspace) {
  const BATCH_SIZE = 24;
  const cards = [...workspace.querySelectorAll<HTMLElement>("[data-primitive-card]")];
  const searchForm = workspace.querySelector<HTMLFormElement>("[data-discover-search-form]")!;
  const search = workspace.querySelector<HTMLInputElement>("[data-discover-search]")!;
  const grid = workspace.querySelector<HTMLElement>("[data-primitive-grid]")!;
  const groupButtons = [...workspace.querySelectorAll<HTMLButtonElement>("[data-group-filter]")];
  const dimensionButtons = [...workspace.querySelectorAll<HTMLButtonElement>("[data-dimension-filter]")];
  const viewButtons = [...workspace.querySelectorAll<HTMLButtonElement>("button[data-view]")];
  const resultCount = workspace.querySelector<HTMLElement>("[data-result-count]")!;
  const visibleCount = workspace.querySelector<HTMLElement>("[data-visible-count]")!;
  const filterSummary = workspace.querySelector<HTMLElement>("[data-filter-summary]")!;
  const empty = workspace.querySelector<HTMLElement>("[data-discover-empty]")!;
  const reset = workspace.querySelector<HTMLButtonElement>("[data-discover-reset]")!;
  const loadWrap = workspace.querySelector<HTMLElement>("[data-load-wrap]")!;
  const loadMore = workspace.querySelector<HTMLButtonElement>("[data-load-more]")!;
  const loadVisible = workspace.querySelector<HTMLElement>("[data-load-visible]")!;
  const loadTotal = workspace.querySelector<HTMLElement>("[data-load-total]")!;
  const panel = workspace.querySelector<HTMLElement>("[data-facet-panel]")!;
  const panelToggle = workspace.querySelector<HTMLButtonElement>("[data-facet-toggle]")!;
  const panelClose = workspace.querySelector<HTMLButtonElement>("[data-facet-close]")!;
  const scrim = workspace.querySelector<HTMLElement>("[data-facet-scrim]")!;
  const activeFilterCount = workspace.querySelector<HTMLElement>("[data-active-filter-count]")!;
  const mobileFacets = window.matchMedia("(max-width: 959px)");

  const normalize = (value: string) => value.toLocaleLowerCase("vi").normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
  const readPositiveInt = (value: string | null) => Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
  const validGroups = new Set(cards.map((card) => card.dataset.group ?? ""));
  const validDimensions = new Set(cards.map((card) => card.dataset.dimension ?? ""));
  let query = "";
  let group = "all";
  let dimension = "";
  let view: "grid" | "list" = "grid";
  let batch = 1;
  let searchTimer = 0;

  const closePanel = ({ restoreFocus = false } = {}) => {
    const wasOpen = panel.dataset.open === "true";
    panel.dataset.open = "false";
    panelToggle.setAttribute("aria-expanded", "false");
    scrim.hidden = true;
    document.body.classList.remove("facet-panel-open");
    if (mobileFacets.matches) {
      panel.inert = true;
      panel.setAttribute("aria-hidden", "true");
      panel.hidden = true;
      if (restoreFocus && wasOpen) panelToggle.focus();
    }
  };

  const openPanel = () => {
    panel.hidden = false;
    panel.inert = false;
    panel.removeAttribute("aria-hidden");
    panel.dataset.open = "true";
    panelToggle.setAttribute("aria-expanded", "true");
    scrim.hidden = false;
    document.body.classList.add("facet-panel-open");
    panelClose.focus();
  };

  const syncPanelMode = () => {
    if (mobileFacets.matches) {
      if (panel.dataset.open === "true") {
        panel.hidden = false;
        panel.inert = false;
        panel.removeAttribute("aria-hidden");
      } else {
        panel.inert = true;
        panel.setAttribute("aria-hidden", "true");
        panel.hidden = true;
      }
      return;
    }
    panel.dataset.open = "false";
    panel.hidden = false;
    panel.inert = false;
    panel.removeAttribute("aria-hidden");
    panelToggle.setAttribute("aria-expanded", "false");
    scrim.hidden = true;
    document.body.classList.remove("facet-panel-open");
  };

  const syncControls = () => {
    groupButtons.forEach((button) => {
      const active = button.dataset.groupFilter === group && !dimension;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
    dimensionButtons.forEach((button) => {
      const active = button.dataset.dimensionFilter === dimension;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
      if (active) button.closest("details")?.setAttribute("open", "");
    });
    viewButtons.forEach((button) => {
      const active = button.dataset.view === view;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
    search.value = query;
    grid.dataset.view = view;
    activeFilterCount.textContent = String((group !== "all" || dimension ? 1 : 0) + (query ? 1 : 0));
  };

  const syncUrl = () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (group !== "all") params.set("group", group);
    if (dimension) params.set("dimension", dimension);
    if (view !== "grid") params.set("view", view);
    if (batch > 1) params.set("batch", String(batch));
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  };

  const render = ({ updateUrl = true } = {}) => {
    const normalizedQuery = normalize(query);
    const matches = cards.filter((card) => {
      const matchesGroup = group === "all" || card.dataset.group === group;
      const matchesDimension = !dimension || card.dataset.dimension === dimension;
      const matchesQuery = !normalizedQuery || normalize(card.dataset.search ?? "").includes(normalizedQuery);
      return matchesGroup && matchesDimension && matchesQuery;
    });
    const limit = batch * BATCH_SIZE;
    const visible = Math.min(matches.length, limit);
    const matchSet = new Set(matches.slice(0, limit));
    cards.forEach((card) => { card.hidden = !matchSet.has(card); });

    resultCount.textContent = String(matches.length);
    visibleCount.textContent = String(visible);
    loadVisible.textContent = String(visible);
    loadTotal.textContent = String(matches.length);
    empty.hidden = matches.length !== 0;
    grid.hidden = matches.length === 0;
    loadWrap.hidden = matches.length === 0 || visible >= matches.length;
    const activeDimension = dimensionButtons.find((button) => button.dataset.dimensionFilter === dimension)?.textContent?.trim();
    const activeGroup = groupButtons.find((button) => button.dataset.groupFilter === group && button.closest(".taxonomy-quick"))?.textContent?.replace(/\d+/gu, "").trim();
    filterSummary.textContent = activeDimension || activeGroup || "Tất cả taxonomy";
    syncControls();
    if (updateUrl) syncUrl();
  };

  const readUrl = () => {
    const params = new URLSearchParams(location.search);
    query = params.get("q")?.trim() ?? "";
    const requestedGroup = params.get("group") ?? "all";
    group = requestedGroup === "all" || validGroups.has(requestedGroup) ? requestedGroup : "all";
    const requestedDimension = params.get("dimension") ?? "";
    dimension = validDimensions.has(requestedDimension) ? requestedDimension : "";
    if (dimension) group = cards.find((card) => card.dataset.dimension === dimension)?.dataset.group ?? group;
    view = params.get("view") === "list" ? "list" : "grid";
    batch = readPositiveInt(params.get("batch"));
  };

  groupButtons.forEach((button) => button.addEventListener("click", () => {
    group = button.dataset.groupFilter ?? "all";
    dimension = "";
    batch = 1;
    render();
    if (mobileFacets.matches) closePanel({ restoreFocus: true });
  }));

  dimensionButtons.forEach((button) => button.addEventListener("click", () => {
    dimension = button.dataset.dimensionFilter ?? "";
    group = button.dataset.dimensionGroup ?? "all";
    batch = 1;
    render();
    if (mobileFacets.matches) closePanel({ restoreFocus: true });
  }));

  viewButtons.forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.view === "list" ? "list" : "grid";
    render();
  }));

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    query = search.value.trim();
    batch = 1;
    render();
  });

  search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = search.value.trim();
      batch = 1;
      render();
    }, 250);
  });

  loadMore.addEventListener("click", () => {
    batch += 1;
    render();
  });

  reset.addEventListener("click", () => {
    query = "";
    group = "all";
    dimension = "";
    batch = 1;
    render();
    search.focus();
  });

  panelToggle.addEventListener("click", () => panel.dataset.open === "true" ? closePanel({ restoreFocus: true }) : openPanel());
  panelClose.addEventListener("click", () => closePanel({ restoreFocus: true }));
  scrim.addEventListener("click", () => closePanel({ restoreFocus: true }));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.dataset.open === "true") closePanel({ restoreFocus: true });
  });
  window.addEventListener("popstate", () => { readUrl(); render({ updateUrl: false }); });
  mobileFacets.addEventListener("change", syncPanelMode);

  readUrl();
  syncPanelMode();
  render({ updateUrl: false });
}

export {};
