import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "content-security-policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; manifest-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
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

test("Cloudflare Pages source declares the approved global header baseline", async () => {
  const source = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const actual = parseGlobalHeaders(source);

  for (const [name, value] of Object.entries(requiredHeaders)) {
    assert.equal(actual.get(name), value, `${name} must match the approved baseline`);
  }
});
