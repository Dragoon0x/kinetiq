import type { Metadata } from "next";
import Link from "next/link";

import { guides } from "@/content/guides";

export const metadata: Metadata = {
  title: "Guides",
  description: "The Kinetiq field manual — how the motion language works.",
};

export default function GuidesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="text-label text-ink-3">
        FIELD MANUAL · {String(guides.length).padStart(2, "0")} CHAPTERS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Guides</h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        The reasoning behind the calibrations — read these and the whole
        library stops being arbitrary.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/guides/${guide.slug}`}
              className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
            >
              <p className="text-label text-ink-3">{guide.serial}</p>
              <h2 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
                {guide.title}
              </h2>
              <p className="text-ink-2 mt-1.5 text-sm">{guide.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
