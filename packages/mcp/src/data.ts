import { readFile } from "node:fs/promises";

import { FETCH_TIMEOUT_MS, REGISTRY_URL, snapshotPath } from "./config.js";
import { machineMetaSchema, type MachineMeta } from "./schema.js";

/** All logging goes to stderr — stdout is the JSON-RPC transport. */
function note(message: string) {
  process.stderr.write(`[kinetiq-mcp] ${message}\n`);
}

let metaCache: MachineMeta | null = null;
let conventionsCache: string | null = null;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the machine catalog: live registry first, bundled snapshot on any
 * failure, cached for the process. Always validated through the schema.
 */
export async function loadMeta(): Promise<MachineMeta> {
  if (metaCache) return metaCache;

  const liveUrl = `${REGISTRY_URL}/registry-meta.json`;
  try {
    const res = await fetchWithTimeout(liveUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    metaCache = machineMetaSchema.parse(await res.json());
    return metaCache;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    note(`live registry unavailable (${reason}); using bundled snapshot`);
  }

  const raw = await readFile(snapshotPath("registry-meta.json"), "utf8");
  metaCache = machineMetaSchema.parse(JSON.parse(raw));
  return metaCache;
}

/** The AGENTS.md conventions text (bundled snapshot). */
export async function loadConventions(): Promise<string> {
  if (conventionsCache) return conventionsCache;
  conventionsCache = await readFile(snapshotPath("agents-rules.md"), "utf8");
  return conventionsCache;
}

/** The full-ingest text (bundled snapshot). */
export async function loadLlmsFull(): Promise<string> {
  return readFile(snapshotPath("llms-full.txt"), "utf8");
}

/** Component source, concatenated from the registry item's inlined files. */
export async function fetchSource(slug: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${REGISTRY_URL}/r/${slug}.json`);
    if (!res.ok) return null;
    const item = (await res.json()) as {
      files?: { path: string; content: string }[];
    };
    if (!item.files?.length) return null;
    return item.files
      .map((f) => `// ${f.path}\n${f.content}`)
      .join("\n\n");
  } catch {
    return null;
  }
}

/** Levenshtein-ish "did you mean" for unknown slugs. */
export function didYouMean(slug: string, all: string[]): string[] {
  const q = slug.toLowerCase();
  return all
    .map((candidate) => {
      const c = candidate.toLowerCase();
      let score = 0;
      if (c.includes(q) || q.includes(c)) score += 5;
      const shared = new Set([...q].filter((ch) => c.includes(ch))).size;
      score += shared / Math.max(c.length, q.length);
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .filter((x) => x.score > 0.3)
    .map((x) => x.candidate);
}

/** Reset caches (tests). */
export function _resetCaches() {
  metaCache = null;
  conventionsCache = null;
}
