import type { Metadata } from "next";
import Link from "next/link";

import { guides } from "@/content/guides";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, collectionLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "Guides",
  description: "The Kinetiq field manual — how the motion language works.",
  path: "/guides",
  keywords: [
    "motion design guide",
    "animation guide",
    "spring physics",
    "reduced motion",
  ],
});

export default function GuidesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <JsonLd
        data={[
          collectionLd({
            name: "Guides",
            description:
              "The Kinetiq field manual \u2014 how the motion language works.",
            path: "/guides",
            items: guides.map((g) => ({
              name: g.title,
              path: `/guides/${g.slug}`,
            })),
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
          ]),
        ]}
      />
      <p className="text-label text-ink-3">
        FIELD MANUAL · {String(guides.length).padStart(2, "0")} CHAPTERS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Guides</h1>
      <p className="mt-3 max-w-xl text-ink-2">
        The reasoning behind the calibrations — read these and the whole library
        stops being arbitrary.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/guides/${guide.slug}`}
              className="group block h-full rounded-3 border border-hairline bg-surface-1 p-5 transition-colors hover:border-hairline-strong"
            >
              <p className="text-label text-ink-3">{guide.serial}</p>
              <h2 className="mt-3 font-semibold transition-colors group-hover:text-cobalt-bright">
                {guide.title}
              </h2>
              <p className="mt-1.5 text-sm text-ink-2">{guide.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
