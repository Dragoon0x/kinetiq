/**
 * Builds registry.json from the typed manifest, then runs `shadcn build`
 * to emit public/r/<slug>.json with file contents inlined.
 *
 * Run with: pnpm generate (or tsx scripts/build-registry.ts)
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { allItems } from "../content/manifest";
import { REGISTRY_FIELDS, type KinetiqItem } from "../content/manifest/types";
import { REGISTRY_ITEM_URL, siteConfig } from "../lib/site-config";

const ROOT = path.resolve(import.meta.dirname, "..");

const slugs = new Set(allItems.map((item) => item.name));

/** Sibling slugs become absolute URLs so direct-URL installs resolve too. */
function expandRegistryDependencies(deps: string[] | undefined, from: string) {
  if (!deps) return undefined;
  return deps.map((dep) => {
    if (dep.startsWith("http")) return dep;
    if (slugs.has(dep)) return REGISTRY_ITEM_URL(dep);
    throw new Error(
      `"${from}" declares unknown registryDependency "${dep}" — not a manifest slug or URL.`,
    );
  });
}

function toRegistryItem(item: KinetiqItem) {
  const entry: Record<string, unknown> = {};
  for (const field of REGISTRY_FIELDS) {
    const value = item[field];
    if (value !== undefined) entry[field] = value;
  }
  entry.registryDependencies = expandRegistryDependencies(
    item.registryDependencies,
    item.name,
  );
  if (entry.registryDependencies === undefined) {
    delete entry.registryDependencies;
  }
  return entry;
}

async function main() {
  for (const item of allItems) {
    for (const file of item.files) {
      if (!existsSync(path.join(ROOT, file.path))) {
        throw new Error(`"${item.name}" lists missing file: ${file.path}`);
      }
    }
  }

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: siteConfig.registryName,
    homepage: siteConfig.url,
    items: allItems.map(toRegistryItem),
  };

  const registryPath = path.join(ROOT, "registry.json");
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const outDir = path.join(ROOT, "public", "r");
  await mkdir(outDir, { recursive: true });

  if (allItems.length > 0) {
    execSync("pnpm exec shadcn build", { cwd: ROOT, stdio: "inherit" });
  }

  // Serve the index too, for registry-level tooling.
  await copyFile(registryPath, path.join(outDir, "registry.json"));

  console.log(`registry: ${allItems.length} item(s) → public/r/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
