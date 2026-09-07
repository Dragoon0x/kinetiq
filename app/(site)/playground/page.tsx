import type { Metadata } from "next";
import Link from "next/link";

import { labs } from "@/content/labs";
import { JsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo";
import { breadcrumbLd, collectionLd } from "@/lib/structured-data";

export const metadata: Metadata = pageMeta({
  title: "Playground",
  description:
    "Learn motion by operating it — seven benches with live parameters, traces, and code that mirrors the stage.",
  path: "/playground",
  keywords: [
    "animation playground",
    "spring bench",
    "easing",
    "FLIP",
    "scroll animation",
  ],
});

export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <JsonLd
        data={[
          collectionLd({
            name: "Playground",
            description:
              "Learn motion by operating it \u2014 seven benches with live parameters, traces, and code that mirrors the stage.",
            path: "/playground",
            items: labs.map((l) => ({
              name: l.title,
              path: `/playground/${l.slug}`,
            })),
          }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Playground", path: "/playground" },
          ]),
        ]}
      />
      <p className="text-label text-ink-3">
        THE BENCHES · {String(labs.length).padStart(2, "0")} STATIONS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Playground</h1>
      <p className="mt-3 max-w-xl text-ink-2">
        Learn motion by operating it. Turn a dial, watch the trace, read the
        code the stage is actually running — then copy it out.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {labs.map((lab) => (
          <li key={lab.slug}>
            <Link
              href={`/playground/${lab.slug}`}
              className="group block h-full rounded-3 border border-hairline bg-surface-1 p-5 transition-colors hover:border-hairline-strong"
            >
              <p className="text-label text-ink-3">{lab.serial}</p>
              <h2 className="mt-3 font-semibold transition-colors group-hover:text-cobalt-bright">
                {lab.title}
              </h2>
              <p className="mt-1.5 text-sm text-ink-2">{lab.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
