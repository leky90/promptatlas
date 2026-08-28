import { discoveryIndex } from "../lib/discovery-index";

export const prerender = true;

export function GET() {
  return new Response(JSON.stringify(discoveryIndex), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
