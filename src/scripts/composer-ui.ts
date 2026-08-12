import {
  acceptBlend,
  deriveBlendConflicts,
  movePrimitive,
  removePrimitive,
  renderPrompt,
  type ComposerDraft,
} from "../lib/composer.ts";
import {
  buildShareUrl,
  createExportFile,
  createSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  forkSnapshot,
  parseExportFile,
  persistDraft,
  readActiveDraft,
  removeActiveDraft,
  type ShareSnapshot,
} from "./composer-store.ts";

const workspace = document.querySelector<HTMLElement>("[data-composer-workspace]");

if (workspace) {
  const list = workspace.querySelector<HTMLOListElement>("[data-recipe-list]")!;
  const empty = workspace.querySelector<HTMLElement>("[data-composer-empty]")!;
  const count = workspace.querySelector<HTMLElement>("[data-composer-item-count]")!;
  const preview = workspace.querySelector<HTMLElement>("[data-composer-preview]")!;
  const conflictSection = workspace.querySelector<HTMLElement>("[data-conflict-section]")!;
  const conflictList = workspace.querySelector<HTMLUListElement>("[data-conflict-list]")!;
  const copyButton = workspace.querySelector<HTMLButtonElement>("[data-copy-composer]")!;
  const shareButton = workspace.querySelector<HTMLButtonElement>("[data-share-composer]")!;
  const resetButton = workspace.querySelector<HTMLButtonElement>("[data-reset-composer]")!;
  const importInput = workspace.querySelector<HTMLInputElement>("[data-import-composer]")!;
  const live = workspace.querySelector<HTMLElement>("[data-composer-live]")!;
  const error = workspace.querySelector<HTMLElement>("[data-composer-error]")!;
  const snapshotBanner = workspace.querySelector<HTMLElement>("[data-snapshot-banner]")!;
  const continueButton = workspace.querySelector<HTMLButtonElement>("[data-continue-editing]")!;
  const dialog = workspace.querySelector<HTMLDialogElement>("[data-share-dialog]")!;
  const shareUrl = workspace.querySelector<HTMLTextAreaElement>("[data-share-url]")!;
  const shareMeasure = workspace.querySelector<HTMLElement>("[data-share-measure]")!;
  const shareSummary = workspace.querySelector<HTMLElement>("[data-share-summary]")!;
  const shareLimitation = workspace.querySelector<HTMLElement>("[data-share-limitation]")!;
  const copyShareButton = workspace.querySelector<HTMLButtonElement>("[data-copy-share]")!;
  const exportButton = workspace.querySelector<HTMLButtonElement>("[data-export-composer]")!;

  let draft: ComposerDraft | undefined;
  let openedSnapshot: ShareSnapshot | undefined;
  let pendingSnapshot: ShareSnapshot | undefined;
  let readOnly = false;

  const announce = (message: string) => {
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 0);
  };

  const showError = (message: string) => {
    error.textContent = message;
    error.hidden = false;
    announce(message);
  };

  const clearError = () => {
    error.hidden = true;
    error.textContent = "";
  };

  const snapshotAsDraft = (snapshot: ShareSnapshot): ComposerDraft => ({
    format: "prompt-atlas-draft",
    formatVersion: 1,
    schemaVersion: snapshot.schemaVersion,
    datasetVersion: snapshot.datasetVersion,
    draftId: snapshot.snapshotId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    items: structuredClone(snapshot.recipe.items),
    acceptedBlendKeys: [...snapshot.recipe.acceptedBlendKeys],
  });

  const button = (label: string, action: () => void, disabled = false) => {
    const control = document.createElement("button");
    control.type = "button";
    control.className = "recipe-control";
    control.textContent = label;
    control.disabled = disabled || readOnly;
    control.addEventListener("click", action);
    return control;
  };

  const commit = (next: ComposerDraft, message?: string) => {
    try {
      draft = persistDraft(localStorage, next);
      clearError();
      render();
      window.dispatchEvent(new CustomEvent("prompt-atlas:composer-change", { detail: draft }));
      if (message) announce(message);
    } catch {
      showError("Không thể lưu thay đổi. Hãy kiểm tra quyền lưu cục bộ hoặc dung lượng trình duyệt.");
    }
  };

  const renderItems = () => {
    list.replaceChildren();
    draft?.items.forEach((item, index) => {
      const row = document.createElement("li");
      row.className = "recipe-item";
      row.dataset.recipeItem = "";
      row.dataset.primitiveId = item.primitiveId;

      const order = document.createElement("span");
      order.className = "recipe-item__order";
      order.textContent = String(index + 1).padStart(2, "0");

      const body = document.createElement("div");
      const label = document.createElement("strong");
      label.dataset.recipeLabel = "";
      label.textContent = item.label;
      const fragment = document.createElement("p");
      fragment.textContent = item.fragment;
      body.append(label, fragment);

      const controls = document.createElement("div");
      controls.className = "recipe-item__controls";
      controls.append(
        button("Đưa lên", () => commit(movePrimitive(draft!, item.primitiveId, -1), `Đã đưa ${item.label} lên.`), index === 0),
        button("Đưa xuống", () => commit(movePrimitive(draft!, item.primitiveId, 1), `Đã đưa ${item.label} xuống.`), index === (draft?.items.length ?? 0) - 1),
        button("Xóa", () => commit(removePrimitive(draft!, item.primitiveId), `Đã xóa ${item.label}.`)),
      );
      row.append(order, body, controls);
      list.append(row);
    });
  };

  const renderConflicts = () => {
    const conflicts = draft ? deriveBlendConflicts(draft) : [];
    conflictList.replaceChildren();
    for (const conflict of conflicts) {
      const row = document.createElement("li");
      row.dataset.conflictItem = "";
      const copy = document.createElement("p");
      copy.innerHTML = "";
      const strong = document.createElement("strong");
      strong.textContent = `${conflict.labels[0]} + ${conflict.labels[1]}`;
      const explanation = document.createElement("span");
      explanation.textContent = "Xác nhận pha trộn hoặc xóa một phong cách khỏi recipe.";
      copy.append(strong, explanation);
      row.append(copy, button("Dùng như pha trộn", () => commit(acceptBlend(draft!, conflict.key), "Đã xác nhận hướng pha trộn.")));
      conflictList.append(row);
    }
    conflictSection.hidden = conflicts.length === 0;
  };

  function render() {
    const itemCount = draft?.items.length ?? 0;
    count.textContent = `${itemCount} thành phần`;
    empty.hidden = itemCount > 0;
    list.hidden = itemCount === 0;
    snapshotBanner.hidden = !readOnly;
    continueButton.hidden = !readOnly;
    renderItems();
    renderConflicts();
    preview.textContent = itemCount ? renderPrompt(draft!) : "Thêm thành phần để tạo prompt.";
    copyButton.disabled = itemCount === 0;
    shareButton.disabled = itemCount === 0;
    resetButton.disabled = itemCount === 0 || readOnly;
  }

  copyButton.addEventListener("click", async () => {
    if (!draft?.items.length) return;
    try {
      await navigator.clipboard.writeText(renderPrompt(draft));
      announce("Đã sao chép prompt.");
    } catch {
      preview.focus();
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(preview);
      selection?.removeAllRanges();
      selection?.addRange(range);
      showError("Không thể truy cập clipboard. Prompt đã được chọn để bạn sao chép thủ công.");
    }
  });

  shareButton.addEventListener("click", async () => {
    if (!draft?.items.length) return;
    pendingSnapshot = await createSnapshot(draft);
    const payload = encodeSnapshot(pendingSnapshot);
    const result = buildShareUrl(new URL("/composer/", location.origin).toString(), payload);
    shareUrl.value = result.url;
    shareSummary.textContent = `${draft.items.length} thành phần · image · schema ${draft.schemaVersion}`;
    shareMeasure.textContent = `${result.length.toLocaleString("vi-VN")} / 6.000 ký tự`;
    shareLimitation.hidden = result.shareable;
    copyShareButton.disabled = !result.shareable;
    dialog.showModal();
  });

  copyShareButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      announce("Đã sao chép liên kết snapshot.");
    } catch {
      shareUrl.focus();
      shareUrl.select();
      showError("Không thể truy cập clipboard. Liên kết đã được chọn để sao chép thủ công.");
    }
  });

  exportButton.addEventListener("click", async () => {
    if (!pendingSnapshot && draft) pendingSnapshot = await createSnapshot(draft);
    if (!pendingSnapshot) return;
    const file = createExportFile(pendingSnapshot);
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    announce("Đã tạo tệp recipe đầy đủ.");
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      openedSnapshot = await parseExportFile(await file.text());
      draft = snapshotAsDraft(openedSnapshot);
      readOnly = true;
      clearError();
      render();
      announce("Đã mở recipe ở chế độ chỉ đọc.");
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "Không thể đọc tệp recipe.");
    } finally {
      importInput.value = "";
    }
  });

  continueButton.addEventListener("click", () => {
    if (!openedSnapshot) return;
    try {
      draft = forkSnapshot(localStorage, openedSnapshot);
      readOnly = false;
      openedSnapshot = undefined;
      history.replaceState(null, "", location.pathname);
      clearError();
      render();
      window.dispatchEvent(new CustomEvent("prompt-atlas:composer-change", { detail: draft }));
      announce("Đã tạo draft mới; draft trước vẫn được giữ nguyên.");
    } catch {
      showError("Không thể tạo draft mới. Snapshot vẫn có thể đọc và sao chép; chỉnh sửa đang bị khóa.");
    }
  });

  resetButton.addEventListener("click", () => {
    if (!draft || readOnly || !confirm("Xóa draft hiện tại? Các draft khác không bị ảnh hưởng.")) return;
    try {
      removeActiveDraft(localStorage);
      draft = readActiveDraft(localStorage);
      clearError();
      render();
      window.dispatchEvent(new CustomEvent("prompt-atlas:composer-change", { detail: draft }));
      announce("Đã xóa draft hiện tại.");
    } catch {
      showError("Không thể xóa draft hiện tại khỏi trình duyệt.");
    }
  });

  const load = async () => {
    if (dialog.open) dialog.close();
    clearError();
    openedSnapshot = undefined;
    readOnly = false;
    const payload = new URLSearchParams(location.hash.slice(1)).get("r");
    if (payload) {
      draft = undefined;
      try {
        openedSnapshot = await decodeSnapshot(payload);
        draft = snapshotAsDraft(openedSnapshot);
        readOnly = true;
      } catch (reason) {
        showError(reason instanceof Error ? reason.message : "Không thể mở snapshot.");
      }
    } else {
      try {
        draft = readActiveDraft(localStorage);
      } catch {
        showError("Không thể đọc draft cục bộ. Bạn vẫn có thể nhập một recipe chỉ đọc.");
      }
    }
    render();
  };

  window.addEventListener("hashchange", () => { void load(); });
  void load();
}

export {};
