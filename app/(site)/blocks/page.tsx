import Link from "next/link";

import { isSection, sectionsByFamily } from "@/content/block-categories";
import { catalogBlocks } from "@/content/manifest";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blocks",
  description:
    "Composed instruments and full landing sections — complete surfaces built from the Kinetiq catalog.",
};

function BlockCard({
  block,
}: {
  block: (typeof catalogBlocks)[number];
}) {
  return (
    <li>
      <Link
        href={`/blocks/${block.name}`}
        className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
      >
        <p className="text-label text-ink-3">{block.meta?.serial}</p>
        <h3 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
          {block.title}
        </h3>
        <p className="text-ink-2 mt-1.5 text-sm">{block.tagline}</p>
      </Link>
    </li>
  );
}

export default function BlocksIndexPage() {
  const cardBlocks = catalogBlocks.filter((block) => !isSection(block));
  const sectionGroups = sectionsByFamily(catalogBlocks);
  const sectionCount = catalogBlocks.length - cardBlocks.length;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-label text-ink-3">
        INDEX · {String(catalogBlocks.length).padStart(2, "0")} ASSEMBLIES
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Blocks</h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        Larger assemblies — complete, product-ready widgets and full landing
        sections composed from the component catalog and the same five springs.
      </p>

      {sectionGroups.length > 0 && (
        <>
          <div className="mt-10 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">Sections</h2>
            <p className="text-label text-ink-3">
              {String(sectionCount).padStart(2, "0")} FULL-WIDTH
            </p>
          </div>

          {/* Family rail — jump links, in landing-page order. */}
          <nav aria-label="Section families" className="mt-4">
            <ul className="flex flex-wrap gap-2">
              {sectionGroups.map(({ family, items }) => (
                <li key={family.slug}>
                  <a
                    href={`#family-${family.slug}`}
                    className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
                  >
                    {family.label}
                    <span className="text-ink-3">{items.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {sectionGroups.map(({ family, items }) => (
            <section
              key={family.slug}
              id={`family-${family.slug}`}
              className="mt-10 scroll-mt-24"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-semibold">{family.label}</h3>
                <p className="text-ink-3 text-sm">{family.blurb}</p>
              </div>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((block) => (
                  <BlockCard key={block.name} block={block} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <div className="mt-12 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Instruments</h2>
        <p className="text-label text-ink-3">
          {String(cardBlocks.length).padStart(2, "0")} WIDGETS
        </p>
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cardBlocks.map((block) => (
          <BlockCard key={block.name} block={block} />
        ))}
      </ul>
    </main>
  );
}
