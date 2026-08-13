import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteDirectory = path.resolve(scriptDirectory, "..");
const projectDirectory = path.resolve(siteDirectory, "..");
const promptManifestPath = path.join(projectDirectory, "output/ldk-329/prompts.json");
const recordManifestPath = path.join(projectDirectory, "output/ldk-329/generation-records.json");
const reviewJsonPath = path.join(projectDirectory, "output/ldk-329/review-results.json");
const reviewMarkdownPath = path.join(projectDirectory, "output/ldk-329/review-report.md");

const findings = [
  {
    id: "LDK-329-R1",
    severity: "P1",
    category: "prompt-conflict",
    indices: [59, 64, 69, 70, 87],
    title: "Primary request and target primitive contradict each other",
    observation: "The exact prompt asks for mutually incompatible visual attributes: 30×20×10 cm versus twice-as-wide, 20° clockwise versus 30° left, mirror-polished versus non-reflective, rough ceramic versus very-low roughness, and vertical stripes versus dots.",
    requiredChange: "Normalize each source entry so example, prompt fragment, target primitive, and exact prompt describe one value; regenerate the affected image and derivative/checksum records.",
  },
  {
    id: "LDK-329-R2",
    severity: "P1",
    category: "image-prompt-mismatch",
    indices: [63],
    title: "Object viewpoint image uses the wrong requested object",
    observation: "The primary request asks for a camera showing its front and right side, but the generated image is an armchair. It demonstrates a three-quarter view while failing the named object request.",
    requiredChange: "Regenerate index 63 with an unbranded camera in an unmistakable three-quarter view showing the front and right side.",
  },
  {
    id: "LDK-329-R3",
    severity: "P1",
    category: "missing-required-elements",
    indices: [126],
    title: "Visual hierarchy image omits the secondary and tertiary subjects",
    observation: "The exact prompt requires face first, hands second, tools third. The image contains a standing portrait with no visible tools and no deliberate three-level hierarchy.",
    requiredChange: "Regenerate index 126 with the face, hands, and tools all visible and ordered by clear primary, secondary, and tertiary emphasis.",
  },
  {
    id: "LDK-329-R4",
    severity: "P2",
    category: "semantic-ambiguity",
    indices: [45],
    title: "Lip-makeup primitive is illustrated as a product instead of applied makeup",
    observation: "The entry belongs to subject makeup, but the image shows an isolated lipstick tube. It does not demonstrate how matte red lipstick appears on lips.",
    requiredChange: "Clarify whether the primitive means the cosmetic product or applied lip makeup; for the current subject taxonomy, regenerate as a close portrait with matte red lipstick applied and lips clearly visible.",
  },
  {
    id: "LDK-329-R5",
    severity: "P2",
    category: "temporal-evidence-limit",
    indices: [145, 146, 147, 148, 149, 150, 151],
    title: "Temporal camera behavior is not directly verifiable from one still image",
    observation: "Static camera, lateral movement, slow drift, tripod stabilization, locked focus, parallel tracking, and settled movement require time-based evidence. The current stills show equipment, a walking subject, portraits, or stable rooms but cannot prove the described camera behavior.",
    requiredChange: "Mark these entries as conceptual still illustrations with a not-directly-observable limitation, or provide a multi-frame/video reference in the later video scope. Do not present the current still as direct evidence of motion or focus-transition behavior.",
  },
  {
    id: "LDK-329-R6",
    severity: "P2",
    category: "non-isolated-example",
    indices: [162],
    title: "The 2:1 lighting-ratio image is a split comparison rather than one coherent example",
    observation: "The output places two portraits side by side with visible fixtures. It violates the single-coherent-frame constraint and does not make a 2:1 key-to-fill ratio auditable.",
    requiredChange: "Replace it with one portrait showing gentle dimensional contrast and readable shadows; disclose that an exact numeric ratio requires setup metadata rather than visual inspection alone.",
  },
  {
    id: "LDK-329-R7",
    severity: "P2",
    category: "insufficient-source-separation",
    indices: [170],
    title: "Three-point lighting sources are not all visually distinct",
    observation: "The portrait shows two visible fixtures and a plausible rim effect, but key, fill, and rim are not unambiguously separable as the exact prompt requires.",
    requiredChange: "Regenerate or annotate a setup where key, fill, and rim contributions are each distinguishable without relying on an inferred hidden source.",
  },
];

const prompts = JSON.parse(await fs.readFile(promptManifestPath, "utf8"));
const generation = JSON.parse(await fs.readFile(recordManifestPath, "utf8"));

if (prompts.entries.length !== 187 || generation.records.length !== 187) {
  throw new Error("Review requires the complete 187-entry LDK-329 artifact set");
}

const findingsByIndex = new Map();
for (const finding of findings) {
  for (const index of finding.indices) {
    const list = findingsByIndex.get(index) ?? [];
    list.push(finding.id);
    findingsByIndex.set(index, list);
  }
}

const entries = prompts.entries.map((entry) => ({
  index: entry.index,
  id: entry.id,
  group: entry.group,
  labelVi: entry.labelVi,
  status: findingsByIndex.has(entry.index) ? "changes-requested" : "accepted",
  findingIds: findingsByIndex.get(entry.index) ?? [],
}));

const accepted = entries.filter((entry) => entry.status === "accepted").length;
const changesRequested = entries.length - accepted;
const review = {
  schemaVersion: 1,
  issueId: "LDK-329",
  reviewerRole: "content-director",
  reviewedAt: new Date().toISOString(),
  decision: "changes-requested",
  scope: {
    totalEntries: entries.length,
    manuallyReviewedEntries: entries.length,
    reviewSheets: 18,
    machineIntegrityValidation: "passed",
  },
  summary: {
    accepted,
    changesRequested,
    p1Findings: findings.filter((finding) => finding.severity === "P1").length,
    p2Findings: findings.filter((finding) => finding.severity === "P2").length,
  },
  findings,
  entries,
};

const findingRows = findings.map((finding) =>
  `| ${finding.id} | ${finding.severity} | ${finding.indices.join(", ")} | ${finding.title} | ${finding.requiredChange} |`,
).join("\n");

const markdown = `# LDK-329 content review\n\n## Decision\n\n**Changes requested.** ${accepted}/${entries.length} entries are accepted; ${changesRequested} entries require correction or an explicit evidence limitation before LDK-329 can be accepted.\n\nThe review covered all 187 prompt-image mappings across 18 labeled review sheets. Machine validation of files, SHA-256 checksums, dimensions, prompt ordering, alt text, and derivative limits passed.\n\n## Findings\n\n| ID | Severity | Indices | Finding | Required change |\n|---|---|---|---|---|\n${findingRows}\n\n## Passed checks\n\n- 187 original PNG files, 187 WebP derivatives, and 187 thumbnails are present and checksum-valid.\n- Every record retains the exact prompt, route/provenance fields, bilingual alt text, and synthetic-asset rights notes.\n- Aspect-ratio references are dimensionally correct: 120 is 3:2, 129 is 4:5, and 130 is 1:1.\n- The remaining 170 mappings are visually consistent enough with their prompt target for this archive phase.\n\n## Acceptance gate\n\nResolve all P1 findings, regenerate derivatives and checksums for changed images, and add explicit per-entry evidence notes for temporal/quantitative primitives. Then rerun the 187-entry validator and request re-review.\n`;

await fs.writeFile(reviewJsonPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
await fs.writeFile(reviewMarkdownPath, markdown, "utf8");

console.log(JSON.stringify(review.summary, null, 2));
