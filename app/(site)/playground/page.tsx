import type { Metadata } from "next";
import Link from "next/link";

import { labs } from "@/content/labs";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Learn motion by operating it — seven benches with live parameters, traces, and code that mirrors the stage.",
};

export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <p className="text-label text-ink-3">
        THE BENCHES · {String(labs.length).padStart(2, "0")} STATIONS
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Playground</h1>
      <p className="text-ink-2 mt-3 max-w-xl">
        Learn motion by operating it. Turn a dial, watch the trace, read the
        code the stage is actually running — then copy it out.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {labs.map((lab) => (
          <li key={lab.slug}>
            <Link
              href={`/playground/${lab.slug}`}
              className="group border-hairline bg-surface-1 hover:border-hairline-strong block h-full rounded-3 border p-5 transition-colors"
            >
              <p className="text-label text-ink-3">{lab.serial}</p>
              <h2 className="group-hover:text-cobalt-bright mt-3 font-semibold transition-colors">
                {lab.title}
              </h2>
              <p className="text-ink-2 mt-1.5 text-sm">{lab.tagline}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
