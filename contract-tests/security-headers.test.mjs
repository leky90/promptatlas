import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
};

function parseGlobalHeaders(source) {
  const lines = source.split(/\r?\n/u);
  const wildcardIndex = lines.findIndex((line) => line.trim() === "/*");
  assert.notEqual(wildcardIndex, -1, "Cloudflare Pages must define a global /* header rule");

  const headers = new Map();
  for (const line of lines.slice(wildcardIndex + 1)) {
    if (!/^\s+/u.test(line)) break;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    headers.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  return headers;
}

test("Cloudflare Pages applies the required baseline headers to every route", async () => {
  const source = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const actual = parseGlobalHeaders(source);

  for (const [name, value] of Object.entries(requiredHeaders)) {
    assert.equal(actual.get(name), value, `${name} must match the approved baseline`);
  }

  assert.equal(actual.has("content-security-policy"), false, "CSP rollout is outside LDK-718");
  assert.equal(actual.has("strict-transport-security"), false, "HSTS rollout is outside LDK-718");
});
