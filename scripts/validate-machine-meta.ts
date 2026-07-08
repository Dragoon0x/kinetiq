/**
 * Validates public/registry-meta.json against the schema and cross-checks it
 * against the manifest + emitted registry artifacts. Run after pnpm generate.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { machineMetaSchema } from "../content/machine-meta";
import { catalogBlocks, catalogComponents, shared } from "../content/manifest";

const ROOT = path.resolve(import.meta.dirname, "..");
const META_PATH = path.join(ROOT, "public", "registry-meta.json");
const R_DIR = path.join(ROOT, "public", "r");

async function main() {
  const problems: string[] = [];

  if (!existsSync(META_PATH)) {
    console.error("registry-meta.json missing — run `pnpm generate` first.");
    process.exit(1);
  }

  const parsed = machineMetaSchema.safeParse(
    JSON.parse(await readFile(META_PATH, "utf8")),
  );
  if (!parsed.success) {
    console.error(`registry-meta.json schema invalid:\n${parsed.error.message}`);
    process.exit(1);
  }
  const meta = parsed.data;

  // Counts match the manifest.
  if (meta.registry.counts.components !== catalogComponents.length) {
    problems.push("counts.components does not match the manifest");
  }
  if (meta.registry.counts.blocks !== catalogBlocks.length) {
    problems.push("counts.blocks does not match the manifest");
  }
  if (meta.registry.counts.shared !== shared.length) {
    problems.push("counts.shared does not match the manifest");
  }

  // Every non-draft catalog + shared slug is present.
  const emitted = new Set(meta.items.map((i) => i.slug));
  for (const item of [...catalogComponents, ...catalogBlocks, ...shared]) {
    if (!emitted.has(item.name)) {
      problems.push(`missing item: ${item.name}`);
    }
  }

  // Each item's registry artifact exists and deps are absolute URLs.
  for (const item of meta.items) {
    if (!existsSync(path.join(R_DIR, `${item.slug}.json`))) {
      problems.push(`no registry artifact for ${item.slug} (r/${item.slug}.json)`);
    }
    for (const dep of item.registryDependencies ?? []) {
      if (!dep.startsWith("http")) {
        problems.push(`${item.slug}: non-absolute registryDependency "${dep}"`);
      }
    }
  }

  if (meta.motion.springs.flick?.stiffness !== 1100) {
    problems.push("motion.springs.flick.stiffness drifted from 1100");
  }

  if (problems.length > 0) {
    console.error(`machine-meta validation failed:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }

  console.log(`machine-meta validation: ${meta.items.length} item(s) OK`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
