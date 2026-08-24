import {
  adjudicateDisagreement,
  appendReviewRecord,
  createBlindSession,
  findDisagreements,
  type BlindReviewRecord,
  type Confidence,
  type EvidenceRegion,
  type ReviewOutput,
} from "../lib/blind-review";

type ReviewDimension = { id: string; label: string; help: string };
type ReviewPageData = {
  caseId: string;
  prompt: string;
  protocolVersion: string;
  calibrationVersion: string;
  outputs: ReviewOutput[];
  dimensions: ReviewDimension[];
};

const STORAGE_KEY = "pa:blind-review:v1";
const ADJUDICATION_KEY = "pa:blind-adjudications:v1";
const REVIEWER_KEY = "pa:blind-review:active-reviewer";
const dataNode = document.querySelector<HTMLScriptElement>("#blind-review-data");
const data = JSON.parse(dataNode?.textContent ?? "null") as ReviewPageData | null;

if (data) {
  const reviewData = data;
  const status = document.querySelector<HTMLElement>("[data-review-status]");
  const reviewerNode = document.querySelector<HTMLElement>("[data-reviewer-id]");
  const orderNode = document.querySelector<HTMLElement>("[data-review-order]");
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-output-tab]")];
  const activeOutputNode = document.querySelector<HTMLElement>("[data-active-output]");
  const canvas = document.querySelector<HTMLButtonElement>("[data-evidence-canvas]");
  const image = document.querySelector<HTMLImageElement>("[data-review-image]");
  const regionNode = document.querySelector<HTMLElement>("[data-evidence-region]");
  const coordinates = document.querySelector<HTMLElement>("[data-evidence-coordinates]");
  const form = document.querySelector<HTMLFormElement>("[data-review-form]");
  const message = document.querySelector<HTMLElement>("[data-form-message]");
  const disclosure = document.querySelector<HTMLElement>("[data-review-disclosure]");
  const disclosureList = document.querySelector<HTMLElement>("[data-disclosure-list]");
  const disagreementList = document.querySelector<HTMLElement>("[data-disagreement-list]");
  const newReview = document.querySelector<HTMLButtonElement>("[data-new-independent-review]");
  const rows = [...document.querySelectorAll<HTMLElement>("[data-review-dimension]")];

  let history = readJson<BlindReviewRecord[]>(STORAGE_KEY, []);
  let reviewerId = sessionStorage.getItem(REVIEWER_KEY) || newReviewerId();
  let session = createBlindSession({ caseId: reviewData.caseId, reviewerId, seed: reviewerId, outputs: reviewData.outputs });
  let activeIndex = 0;
  let region: EvidenceRegion | null = null;

  function readJson<T>(key: string, fallback: T): T {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function newReviewerId() {
    const id = `reviewer-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem(REVIEWER_KEY, id);
    return id;
  }

  function completedForReviewer() {
    return history.filter((record) => record.caseId === reviewData.caseId && record.reviewerId === reviewerId);
  }

  function originalOutputId(index = activeIndex) {
    return session.outputs[index]?.outputId;
  }

  function setStatus(completed: boolean) {
    if (!status) return;
    const completeCount = completedForReviewer().length;
    const strong = status.querySelector("strong");
    const small = status.querySelector("small");
    if (strong) strong.textContent = completed ? "Đã hoàn tất" : "Đang mù";
    if (small) small.textContent = `${completeCount} / ${session.outputs.length} output đã khóa`;
  }

  function resetForm() {
    form?.reset();
    if (message) message.textContent = "";
    region = null;
    if (regionNode) regionNode.hidden = true;
    if (coordinates) coordinates.textContent = "Chưa đặt vùng evidence.";
    for (const row of rows) {
      delete row.dataset.evidence;
      const attach = row.querySelector<HTMLButtonElement>("[data-attach-evidence]");
      const attached = row.querySelector<HTMLElement>("[data-attached-evidence]");
      if (attach) attach.disabled = true;
      if (attached) attached.textContent = "Chưa có evidence.";
    }
  }

  function renderOutput(index: number) {
    activeIndex = index;
    const output = session.outputs[index];
    if (!output) return;
    tabs.forEach((tab, tabIndex) => {
      const item = session.outputs[tabIndex];
      tab.textContent = `Output ${item.blindId}`;
      tab.setAttribute("aria-selected", String(tabIndex === index));
      tab.dataset.complete = String(completedForReviewer().some((record) => record.outputId === originalOutputId(tabIndex)));
    });
    if (activeOutputNode) activeOutputNode.textContent = `Output ${output.blindId}`;
    if (canvas) canvas.setAttribute("aria-label", `Đặt vùng evidence trên Output ${output.blindId}`);
    if (image) {
      image.src = output.image.path;
      image.width = output.image.width;
      image.height = output.image.height;
      image.alt = output.image.alt;
    }
    resetForm();
  }

  function clamp(value: number) {
    return Math.min(.9, Math.max(.1, value));
  }

  function paintedImageBounds() {
    if (!image) return null;
    const box = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!box.width || !box.height || !naturalWidth || !naturalHeight) return null;
    const scale = Math.min(box.width / naturalWidth, box.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    return {
      left: box.left + (box.width - width) / 2,
      top: box.top + (box.height - height) / 2,
      width,
      height,
    };
  }

  function renderRegion() {
    const imageBounds = paintedImageBounds();
    if (!region || !regionNode || !canvas || !imageBounds) return;
    const canvasBounds = canvas.getBoundingClientRect();
    regionNode.hidden = false;
    regionNode.style.left = `${imageBounds.left - canvasBounds.left - canvas.clientLeft + region.x * imageBounds.width}px`;
    regionNode.style.top = `${imageBounds.top - canvasBounds.top - canvas.clientTop + region.y * imageBounds.height}px`;
    regionNode.style.width = `${region.width * imageBounds.width}px`;
    regionNode.style.height = `${region.height * imageBounds.height}px`;
    regionNode.dataset.regionX = region.x.toFixed(2);
    if (coordinates) coordinates.textContent = `Region x ${region.x.toFixed(2)} · y ${region.y.toFixed(2)} · w ${region.width.toFixed(2)} · h ${region.height.toFixed(2)}`;
    rows.forEach((row) => {
      const attach = row.querySelector<HTMLButtonElement>("[data-attach-evidence]");
      if (attach) attach.disabled = false;
    });
  }

  function placeRegion(x: number, y: number) {
    region = { kind: "region", x: clamp(x), y: clamp(y), width: .2, height: .2 };
    renderRegion();
  }

  canvas?.addEventListener("click", (event) => {
    const bounds = paintedImageBounds();
    if (!bounds || event.clientX < bounds.left || event.clientX > bounds.left + bounds.width || event.clientY < bounds.top || event.clientY > bounds.top + bounds.height) return;
    placeRegion((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  });

  canvas?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      placeRegion(region?.x ?? .5, region?.y ?? .5);
      return;
    }
    const movement: Record<string, [number, number]> = {
      ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02],
    };
    const delta = movement[event.key];
    if (!delta || !region) return;
    event.preventDefault();
    placeRegion(region.x + delta[0], region.y + delta[1]);
  });
  image?.addEventListener("load", renderRegion);
  window.addEventListener("resize", renderRegion);

  rows.forEach((row) => {
    row.querySelector<HTMLButtonElement>("[data-attach-evidence]")?.addEventListener("click", () => {
      if (!region) return;
      row.dataset.evidence = JSON.stringify(region);
      const attached = row.querySelector<HTMLElement>("[data-attached-evidence]");
      if (attached) attached.textContent = `Đã gắn region x ${region.x.toFixed(2)} / y ${region.y.toFixed(2)}.`;
    });
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => renderOutput(index));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = (index + direction + tabs.length) % tabs.length;
      tabs[next].focus();
      renderOutput(next);
    });
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const outputId = originalOutputId();
    if (!outputId) return;
    const ratings = [];
    for (const row of rows) {
      const score = row.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      const confidence = row.querySelector<HTMLSelectElement>("[data-confidence]");
      const rationale = row.querySelector<HTMLTextAreaElement>("[data-dimension-rationale]");
      if (!score || !confidence?.value || !rationale?.value.trim() || !row.dataset.evidence) {
        if (message) message.textContent = "Hoàn tất score, confidence, rationale và evidence cho mọi dimension.";
        return;
      }
      ratings.push({
        dimensionId: row.dataset.dimensionId || "unknown",
        score: score.value === "na" ? null : Number(score.value),
        confidence: confidence.value as Confidence,
        rationale: rationale.value.trim(),
        evidence: [JSON.parse(row.dataset.evidence) as EvidenceRegion],
      });
    }
    const nextRecord: BlindReviewRecord = {
      id: `${reviewerId}:${reviewData.caseId}:${outputId}`,
      caseId: reviewData.caseId,
      outputId,
      reviewerId,
      protocolVersion: reviewData.protocolVersion,
      calibrationVersion: reviewData.calibrationVersion,
      submittedAt: new Date().toISOString(),
      ratings,
    };
    try {
      history = [...appendReviewRecord(history, nextRecord)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      if (message) message.textContent = error instanceof Error ? error.message : "Không thể khóa review.";
      return;
    }
    const nextIndex = session.outputs.findIndex((_, index) => !completedForReviewer().some((record) => record.outputId === originalOutputId(index)));
    if (nextIndex >= 0) {
      setStatus(false);
      renderOutput(nextIndex);
    } else {
      completeSession();
    }
  });

  function renderDisagreements(showDetails: boolean) {
    if (!disagreementList) return;
    const disagreements = findDisagreements(history);
    const adjudications = readJson<Array<{ id: string; status: "resolved" }>>(ADJUDICATION_KEY, []);
    disagreementList.replaceChildren();
    if (!disagreements.length) {
      const empty = document.createElement("p");
      empty.textContent = "Chưa có disagreement giữa hai reviewer độc lập.";
      disagreementList.append(empty);
      return;
    }
    if (!showDetails) {
      const withheld = document.createElement("p");
      withheld.textContent = `${disagreements.length} disagreement được giữ kín tới khi session hiện tại hoàn tất.`;
      disagreementList.append(withheld);
      return;
    }
    for (const disagreement of disagreements) {
      const item = document.createElement("article");
      item.className = "disagreement-item";
      const title = document.createElement("strong");
      title.textContent = `${disagreement.dimensionId} · ${disagreement.reason}`;
      const list = document.createElement("ul");
      disagreement.originalRatings.forEach((original) => {
        const entry = document.createElement("li");
        entry.textContent = `${original.reviewerId}: ${original.score ?? "N/A"} · ${original.confidence}`;
        list.append(entry);
      });
      item.append(title, list);
      const existingResolution = adjudications.find((candidate) => candidate.id === disagreement.id && candidate.status === "resolved");
      if (existingResolution) {
        item.dataset.status = "resolved";
        title.textContent = `${disagreement.dimensionId} · resolved · originals preserved`;
        disagreementList.append(item);
        continue;
      }
      disagreement.originalRatings.forEach((original) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Giữ score ${original.score ?? "N/A"}`;
        button.addEventListener("click", () => {
          const currentAdjudications = readJson<Array<{ id: string }>>(ADJUDICATION_KEY, []);
          if (currentAdjudications.some((candidate) => candidate.id === disagreement.id)) {
            renderDisagreements(true);
            return;
          }
          const resolved = adjudicateDisagreement(disagreement, {
            adjudicationId: `adjudication-${crypto.randomUUID()}`,
            adjudicatorId: `adjudicator-${reviewerId}`,
            resolvedScore: original.score,
            confidence: original.confidence,
            rationale: `Decisive evidence retained from ${original.reviewId}.`,
            evidence: original.evidence,
            submittedAt: new Date().toISOString(),
          });
          localStorage.setItem(ADJUDICATION_KEY, JSON.stringify([...currentAdjudications, resolved]));
          item.dataset.status = "resolved";
          title.textContent = `${disagreement.dimensionId} · resolved · originals preserved`;
          item.querySelectorAll("button").forEach((candidate) => { candidate.disabled = true; });
        });
        item.append(button);
      });
      disagreementList.append(item);
    }
  }

  function completeSession() {
    setStatus(true);
    if (form) form.hidden = true;
    if (disclosure && disclosureList) {
      disclosure.hidden = false;
      const line = document.createElement("p");
      line.className = "disclosure-item";
      line.textContent = "Session complete. Provider-route mapping is sealed outside this browser review copy.";
      disclosureList.replaceChildren(line);
    }
    renderDisagreements(true);
  }

  function startIndependentReview() {
    reviewerId = newReviewerId();
    session = createBlindSession({ caseId: reviewData.caseId, reviewerId, seed: reviewerId, outputs: reviewData.outputs });
    if (reviewerNode) reviewerNode.textContent = reviewerId;
    if (orderNode) orderNode.textContent = session.outputs.map((output) => output.blindId).join(" / ");
    if (disclosure) disclosure.hidden = true;
    if (form) form.hidden = false;
    setStatus(false);
    renderDisagreements(false);
    renderOutput(0);
  }

  newReview?.addEventListener("click", startIndependentReview);
  if (reviewerNode) reviewerNode.textContent = reviewerId;
  if (orderNode) orderNode.textContent = session.outputs.map((output) => output.blindId).join(" / ");
  renderDisagreements(false);
  if (completedForReviewer().length >= session.outputs.length) completeSession();
  else {
    const firstPending = session.outputs.findIndex((_, index) => !completedForReviewer().some((record) => record.outputId === originalOutputId(index)));
    setStatus(false);
    renderOutput(Math.max(0, firstPending));
  }
}
