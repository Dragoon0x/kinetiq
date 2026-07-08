import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import { catalogBlocks, catalogComponents } from "@/content/manifest";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "For AI agents",
  description:
    "Programmatic access to the Kinetiq registry: endpoints, item shape, and install flows for coding agents.",
};

const NAMESPACE_SNIPPET = `# One-time namespace configuration
npx shadcn@latest registry add ${siteConfig.registryNamespace}=${siteConfig.url}/r/{name}.json

# Then add anything by name
npx shadcn@latest add ${siteConfig.registryNamespace}/pressure-button`;

const DIRECT_SNIPPET = `# Zero-config: point the CLI at the item URL
npx shadcn@latest add ${siteConfig.url}/r/pressure-button.json`;

const FETCH_SNIPPET = `// 1. Discover what exists
const index = await fetch("${siteConfig.url}/r/registry.json").then((r) => r.json());

// 2. Fetch one item — files ship with content inlined
const item = await fetch("${siteConfig.url}/r/pressure-button.json").then((r) => r.json());

// 3. Write files into the project
for (const file of item.files) {
  await writeFile(resolveTarget(file), file.content);
}

// 4. Install npm dependencies, then resolve item.registryDependencies
//    (absolute URLs — fetch and repeat from step 2)
await run(["pnpm", "add", ...(item.dependencies ?? [])]);`;

const ITEM_SHAPE = `{
  "name": "pressure-button",
  "type": "registry:ui",
  "title": "Pressure Button",
  "description": "A button that pushes back…",
  "dependencies": ["motion"],
  "registryDependencies": [
    "${siteConfig.url}/r/utils.json",
    "${siteConfig.url}/r/motion.json",
    "${siteConfig.url}/r/use-motion-safe.json"
  ],
  "files": [
    {
      "path": "registry/ui/pressure-button.tsx",
      "type": "registry:ui",
      "content": "…full source, aliases use @/registry/* and are rewritten on install…"
    }
  ],
  "meta": { "serial": "KQ-001" }
}`;

export default function AgentsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-label text-ink-3">MACHINE INTERFACE</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        For AI agents
      </h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        Everything on this site is reachable without a browser. The registry is
        static JSON; the catalog is enumerable; the sources ship inline. If you
        are an agent: welcome — this page is for you.
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Install via the shadcn CLI
        </h2>
        <p className="text-ink-2 text-sm">
          Kinetiq is a shadcn-compatible registry. Configure the{" "}
          <code className="font-mono text-[13px]">
            {siteConfig.registryNamespace}
          </code>{" "}
          namespace once, or skip configuration entirely with direct URLs.
        </p>
        <CodeBlock code={NAMESPACE_SNIPPET} lang="bash" filename="namespace" />
        <CodeBlock code={DIRECT_SNIPPET} lang="bash" filename="direct URL" />
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Or fetch the JSON yourself
        </h2>
        <p className="text-ink-2 text-sm">
          {catalogComponents.length} components and {catalogBlocks.length}{" "}
          blocks, each a single JSON document with sources inlined — no build
          step, no auth, no rate ceremony.
        </p>
        <CodeBlock code={FETCH_SNIPPET} lang="ts" filename="agent-flow.ts" />
      </section>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Item shape</h2>
        <p className="text-ink-2 text-sm">
          Items follow the registry-item schema. Shared helpers (the
          calibration set, <code className="font-mono text-[13px]">cn</code>,
          the reduced-motion hook) arrive transitively through{" "}
          <code className="font-mono text-[13px]">registryDependencies</code>.
        </p>
        <CodeBlock code={ITEM_SHAPE} lang="json" filename="r/pressure-button.json" />
      </section>

      <section className="mt-12 space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Endpoints</h2>
        <ul className="space-y-2">
          {[
            ["/r/registry.json", "the full item index"],
            ["/r/<slug>.json", "one item, sources inlined"],
            ["/llms.txt", "this catalog as plain text"],
            ["/sitemap.xml", "every page"],
          ].map(([path, description]) => (
            <li key={path} className="flex gap-3 text-sm">
              <code className="text-cobalt-bright font-mono text-[13px]">
                {path}
              </code>
              <span className="text-ink-2">{description}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
