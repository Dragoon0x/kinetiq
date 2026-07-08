import { agentsRules } from "@/.generated/agents-rules";
import { buildLlmsFull } from "@/content/machine-meta";

export const dynamic = "force-static";

/** Full-ingest reference: conventions + motion system + every item's docs. */
export function GET() {
  return new Response(buildLlmsFull(agentsRules), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
