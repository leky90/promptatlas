import { randomUUID } from "node:crypto";
import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const toPosix = (value) => value.split(path.sep).join("/");

export function resolveArtifactPath(repositoryRoot, filePath, label = "artifact") {
  const root = path.resolve(repositoryRoot);
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  const relativePath = toPosix(path.relative(root, absolutePath));
  if (relativePath === ".." || relativePath.startsWith("../") || !relativePath.startsWith(".artifacts/")) {
    throw new Error(`${label} must be staged below .artifacts in the repository worktree`);
  }
  return { absolutePath, relativePath };
}

export async function writeJsonAtomic(filePath, document) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await link(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

export function requireRouteCell(plan, cellId, interfaceName) {
  const cell = plan.cells.find((item) => item.id === cellId);
  if (!cell) throw new Error(`unknown plan cell ${cellId}`);
  if (cell.route.interface !== interfaceName) {
    throw new Error(`cell ${cellId} uses ${cell.route.interface}, not ${interfaceName}`);
  }
  return cell;
}
