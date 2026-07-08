import type { Metadata } from "next";
import Link from "next/link";

import { catalogBlocks } from "@/content/manifest";

export const metadata: Metadata = {
  title: "Blocks",
  description:
    "Composed instruments — complete widgets built from the Kinetiq catalog.",
};

export default function BlocksIndexPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-label text-ink-3">
        INDEX · {String(catalogBlocks.length).padStart(2, "0")} ASSEMBLIES
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Blocks</h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        Larger assemblies — complete, product-ready widgets composed from the
        component catalog and the same five springs.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalogBlocks.map((block) => (
          <li key={block.name}>
            <Link
              href={`/blocks/${block.name}`}
              className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
            >
              <p className="text-label text-ink-3">{block.meta?.serial}</p>
              <h2 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
                {block.title}
              </h2>
              <p className="text-ink-2 mt-1.5 text-sm">{block.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
