# Source-only runtime hardening contract

This repository publishes a static health target at `/health.json`. Its complete
response body is `{"status":"ok"}` followed by a newline. It intentionally
contains no deployment identifier, timestamp, environment name, internal
dependency state, credential, or contact detail, and its source header rule uses
`Cache-Control: no-store` so an observer does not accept a stale health body.

The source-controlled Cloudflare Pages `_headers` artifact applies the approved
CSP and HSTS policy globally. Only content-hashed Astro assets under `/_astro/`
receive the one-year immutable cache policy; HTML, public media with stable names,
and the health target do not inherit it.

Prompt Atlas has a static build and no application origin/runtime that can render
a custom 500 response. The source therefore preserves the custom 404 page and does
not add a `500` page or provider error rule. Provider-generated 5xx responses remain
outside this source contract and are not claimed as application-controlled.
