export const ADAPTER_VERSION = "1.0.0";

export const ROUTE_IDS = Object.freeze({
  codex: "codex-image-generation",
  gflow: "gflow-nano-pro",
});

const GFLOW_ASPECTS = new Set(["9:16", "16:9", "1:1", "4:3", "3:4"]);

export function createProductRouteSnapshot(routeId, environment) {
  if (routeId === ROUTE_IDS.codex) {
    return {
      id: ROUTE_IDS.codex,
      displayName: "Codex Image Generation",
      provider: "OpenAI",
      interface: "codex",
      identityStatus: "unavailable",
      modelFamily: "Codex Image Generation",
      modelVersion: {
        status: "unavailable",
        source: "not-exposed-by-codex-imagegen-tool",
        reason: "The Codex image generation capability did not expose an immutable model identifier in the request contract.",
      },
      adapterVersion: ADAPTER_VERSION,
    };
  }

  if (routeId === ROUTE_IDS.gflow) {
    return {
      id: ROUTE_IDS.gflow,
      displayName: "Nano Banana Pro via Google Flow / gflow-cli",
      provider: "Google",
      interface: "gflow-cli",
      identityStatus: "provider-alias",
      modelFamily: "Nano Banana Pro",
      modelVersion: {
        status: "provider-alias",
        identifier: `${environment.gflowCatalogName}/${environment.gflowAlias}`,
        source: `gflow ${environment.gflowCliVersion} models --json`,
      },
      adapterVersion: ADAPTER_VERSION,
    };
  }

  throw new Error(`unsupported product route ${routeId}`);
}

const setting = (name, requestedValue, supportStatus, appliedValue, note) => ({
  name,
  requestedValue,
  ...(appliedValue === undefined ? {} : { appliedValue }),
  supportStatus,
  ...(note ? { note } : {}),
});

export function resolveRouteSettings(routeId, requested) {
  const settings = [
    setting("media-type", requested.mediaType, "supported", "image"),
  ];

  if (routeId === ROUTE_IDS.gflow && GFLOW_ASPECTS.has(requested.aspectRatio)) {
    settings.push(setting("aspect-ratio", requested.aspectRatio, "supported", requested.aspectRatio));
  } else if (routeId === ROUTE_IDS.gflow) {
    settings.push(setting(
      "aspect-ratio",
      requested.aspectRatio,
      "unsupported",
      undefined,
      "gflow-cli exposes only 9:16, 16:9, 1:1, 4:3 and 3:4; the harness does not approximate another ratio.",
    ));
  } else {
    settings.push(setting(
      "aspect-ratio",
      requested.aspectRatio,
      "unsupported",
      undefined,
      "The Codex image generation tool contract exposes no native aspect-ratio control; the requested ratio remains in the exact prompt.",
    ));
  }

  settings.push(setting("count", requested.count, "supported", 1));
  for (const control of requested.controls) {
    settings.push(setting(
      control.name,
      control.value,
      "unsupported",
      undefined,
      `The ${routeId} adapter does not expose ${control.name}; it is recorded and omitted instead of normalized.`,
    ));
  }
  return settings;
}

export function buildRouteInvocation({ routeId, exactPrompt, settings, outputPath }) {
  if (routeId === ROUTE_IDS.codex) {
    return {
      kind: "codex-tool-request",
      tool: "image_gen.imagegen",
      arguments: { prompt: exactPrompt.text },
    };
  }

  if (routeId === ROUTE_IDS.gflow) {
    const argumentsList = [
      "image",
      "t2i",
      exactPrompt.text,
      "--model",
      "nano-pro",
      "--count",
      "1",
      "--output",
      outputPath,
      "--json",
      "--jitter",
      "0",
    ];
    const aspect = settings.find((item) => item.name === "aspect-ratio");
    if (aspect?.supportStatus === "supported") {
      argumentsList.push("--aspect", String(aspect.appliedValue));
    }
    return { kind: "cli", executable: "gflow", arguments: argumentsList };
  }

  throw new Error(`unsupported product route ${routeId}`);
}

export function executionEligibility(routeId, settings) {
  const reasons = [];
  if (routeId === ROUTE_IDS.gflow) {
    for (const item of settings) {
      if (item.name === "aspect-ratio" && item.supportStatus === "unsupported") {
        reasons.push(`Required setting ${item.name}=${item.requestedValue} is unsupported by gflow-cli.`);
      }
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

export function assertInvocationSafety(cell) {
  if (cell.route.interface === "gflow-cli") {
    const args = cell.invocation.arguments;
    if (cell.invocation.executable !== "gflow") throw new Error("gflow adapter must invoke only the gflow executable");
    if (args[0] !== "image" || args[1] !== "t2i") throw new Error("gflow adapter is restricted to image t2i");
    if (args.includes("--tool")) throw new Error("gflow prompt tools are forbidden because they may call an API endpoint");
    if (!args.includes("nano-pro")) throw new Error("gflow adapter must pin the nano-pro provider alias");
    if (args.includes("video")) throw new Error("video generation is outside the approved scope");
  }
  if (cell.route.interface === "codex" && cell.invocation.tool !== "image_gen.imagegen") {
    throw new Error("Codex adapter must use the image generation capability");
  }
}
