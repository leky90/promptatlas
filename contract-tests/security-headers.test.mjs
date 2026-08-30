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

test("Cloudflare Pages applies the required baseline headers to every route", async () => {
  const source = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const actual = parseGlobalHeaders(source);

  for (const [name, value] of Object.entries(requiredHeaders)) {
    assert.equal(actual.get(name), value, `${name} must match the approved baseline`);
  }
});

test("Cloudflare Pages gives immutable caching only to Astro hashed assets", async () => {
  const source = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const lines = source.split(/\r?\n/u);
  const assetIndex = lines.findIndex((line) => line.trim() === "/_astro/*");
  assert.notEqual(assetIndex, -1, "Cloudflare Pages must define a hashed-asset header rule");
  assert.equal(
    lines[assetIndex + 1]?.trim(),
    "Cache-Control: public, max-age=31536000, immutable",
    "content-hashed Astro assets must be long-lived and immutable",
  );

  const healthIndex = lines.findIndex((line) => line.trim() === "/health.json");
  assert.notEqual(healthIndex, -1, "the health contract must have an explicit cache rule");
  assert.equal(lines[healthIndex + 1]?.trim(), "Cache-Control: no-store");
  assert.equal(lines[healthIndex + 2]?.trim(), "Content-Type: application/json; charset=utf-8");
});
