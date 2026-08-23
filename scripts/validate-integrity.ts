/**
 * Catalog integrity checks that exist because each one caught a real defect
 * that the test suite could not.
 *
 *   1. OG templates must keep their own rendered text ASCII. A literal ●
 *      typed into the card rendered as a tofu box on every share image the
 *      site produced, because the fetched MartianMono subset has no U+25CF.
 *      Decorative marks are drawn, not typed. Data flowing through (titles,
 *      taglines) is exempt — that text is set in a full-coverage face and is
 *      reviewed as prose.
 *
 *   2. Every routed catalog item needs a demo, or its docs page renders
 *      "PREVIEW PENDING" to visitors.
 *
 *   3. Every registry:page and registry:file needs a target, or the CLI has
 *      nowhere to write it. The schema enforces this too; asserting it here
 *      means a schema regression cannot pass silently.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { demos } from "../components/docs/demos";
import {
  allItems,
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
} from "../content/manifest";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Files whose literals are painted into an image by satori. */
const OG_SOURCES = ["lib/og-template.tsx"];

/** Strip comments so an explanatory note about a glyph is not mistaken for one. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function main() {
  const problems: string[] = [];

  // 1. OG template glyph safety.
  for (const rel of OG_SOURCES) {
    const source = stripComments(await readFile(path.join(ROOT, rel), "utf8"));
    const seen = new Map<string, number>();
    for (const [index, ch] of [...source].entries()) {
      const code = ch.codePointAt(0) ?? 0;
      if (code > 0x7e && !seen.has(ch)) seen.set(ch, index);
    }
    for (const [ch, index] of seen) {
      const line = source.slice(0, index).split("\n").length;
      problems.push(
        `${rel}:${line} contains U+${(ch.codePointAt(0) ?? 0)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")} '${ch}'. OG text is painted in a subset font — ` +
          `draw decorative marks as elements instead of typing the glyph.`,
      );
    }
  }

  // 2. Demo coverage for everything with a docs route.
  const routed = [
    ...catalogComponents,
    ...catalogBlocks,
    ...catalogPages,
    ...catalogTemplates,
  ];
  for (const item of routed) {
    if (!demos[item.name]) {
      problems.push(
        `${item.name} has no demo — its docs page would render "PREVIEW PENDING".`,
      );
    }
  }

  // 3. Targets on everything that has no default destination.
  for (const item of allItems) {
    for (const file of item.files) {
      const needsTarget =
        file.type === "registry:page" || file.type === "registry:file";
      if (needsTarget && !file.target) {
        problems.push(
          `${item.name}: ${file.path} is ${file.type} with no target — the CLI has nowhere to write it.`,
        );
      }
    }
  }

  if (problems.length) {
    console.error(`integrity: ${problems.length} problem(s)`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }

  console.log(
    `integrity: OK — ${OG_SOURCES.length} OG source(s) ASCII-safe, ` +
      `${routed.length} routed item(s) have demos, ` +
      `${allItems.length} item(s) have valid targets`,
  );
}

main();
