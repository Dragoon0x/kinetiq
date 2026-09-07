import Link from "next/link";

import { isSection, sectionsByFamily } from "@/content/block-categories";
import { catalogBlocks } from "@/content/manifest";

import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, collectionLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "Blocks",
  description:
    "Composed instruments and full landing sections — complete surfaces built from the Kinetiq catalog.",
  path: "/blocks",
  keywords: [
    "React sections",
    "landing page blocks",
    "animated sections",
    "Tailwind",
  ],
});

function BlockCard({ block }: { block: (typeof catalogBlocks)[number] }) {
  return (
    <li>
      <Link
        href={`/blocks/${block.name}`}
        className="group block h-full rounded-3 border border-hairline bg-surface-1 p-5 transition-colors hover:border-hairline-strong"
      >
        <p className="text-label text-ink-3">{block.meta?.serial}</p>
        <h3 className="mt-3 font-semibold transition-colors group-hover:text-cobalt-bright">
          {block.title}
        </h3>
        <p className="mt-1.5 text-sm text-ink-2">{block.tagline}</p>
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
      <JsonLd
        data={[
          collectionLd({
            name: "Blocks",
            description:
              "Composed instruments and full landing sections \u2014 complete surfaces built from the Kinetiq catalog.",
            path: "/blocks",
            items: catalogBlocks.map((b) => ({
              name: b.title,
              path: `/blocks/${b.name}`,
            })),
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Blocks", path: "/blocks" },
          ]),
        ]}
      />
      <p className="text-label text-ink-3">
        INDEX · {String(catalogBlocks.length).padStart(2, "0")} ASSEMBLIES
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Blocks</h1>
      <p className="mt-3 max-w-xl text-ink-2">
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
                    className="inline-flex items-center gap-1.5 rounded-2 border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase transition-colors hover:bg-surface-2 hover:text-ink"
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
                <p className="text-sm text-ink-3">{family.blurb}</p>
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
