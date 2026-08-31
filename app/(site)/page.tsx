import Link from "next/link";

import { InstallCommand } from "@/components/docs/install-command";
import { CalibrationStrip } from "@/components/home/calibration-strip";
import { DemoWall } from "@/components/home/demo-wall";
import { InventoryCounters } from "@/components/home/inventory-counters";
import { SelfDemoStrip } from "@/components/home/self-demo-strip";
import { itemsByCategory } from "@/content/categories";
import {
  catalogBlocks,
  catalogComponents,
  catalogPages,
  catalogTemplates,
} from "@/content/manifest";
import { Wavefield } from "@/registry/ui/wavefield";

const AGENT_CHANNELS = [
  {
    title: "The registry",
    copy: "Every item is a public shadcn-compatible artifact. One command and the source lands in your repo, dependencies resolved.",
    href: "/components",
    linkLabel: "Browse the catalog",
  },
  {
    title: "The MCP server",
    copy: "Your coding agent can search the catalog, read props and usage notes, and pick by serial — live from the registry or offline from the snapshot.",
    href: "/mcp",
    linkLabel: "Connect an agent",
  },
  {
    title: "The skill",
    copy: "A packaged skill that teaches your agent the whole system — discovery, picking by verb, and the five-spring doctrine — in one install.",
    href: "/agents",
    linkLabel: "Read the agent rules",
  },
];

export default function HomePage() {
  const categoryCount = itemsByCategory(catalogComponents).length;
  const stats = [
    { value: catalogComponents.length, label: "Instruments" },
    { value: catalogBlocks.length, label: "Assemblies" },
    { value: catalogPages.length + catalogTemplates.length, label: "Pages & templates" },
    { value: categoryCount, label: "Categories" },
  ];

  return (
    <main>
      {/* hero — a self-pausing Wavefield behind a grid+fade layer; both are
          aria-hidden backgrounds so the mask never touches the content. */}
      <section className="relative overflow-hidden">
        <Wavefield
          variant="interference"
          density={0.42}
          speed={0.4}
          opacity={0.4}
          className="pointer-events-none absolute inset-0"
        />
        <div
          aria-hidden
          className="bg-grid bg-grid-fade pointer-events-none absolute inset-0"
        />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-24 pb-20 text-center">
          <p className="text-label text-ink-3">
            KINETIQ · {String(catalogComponents.length).padStart(2, "0")}{" "}
            INSTRUMENTS · {String(catalogBlocks.length).padStart(2, "0")}{" "}
            ASSEMBLIES
          </p>
          <h1 className="text-ink mt-6 max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            Motion, calibrated.
          </h1>
          <p className="text-ink-2 mt-6 max-w-xl text-lg text-balance">
            A React component library where every animation — springs, physics,
            canvas fields, 3D — shares five calibrated springs. Copy the source.
            Own the code. Ship interfaces that feel machined.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/explore"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2 px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Open the explorer
            </Link>
            <Link
              href="/components"
              className="border-input text-ink hover:bg-accent rounded-2 border px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Browse components
            </Link>
          </div>

          <div className="mt-14 w-full max-w-xl text-left">
            <InstallCommand slug="pressure-button" />
            <p className="text-ink-3 mt-3 text-center text-xs">
              One command. The code lands in your repo, not ours.
            </p>
          </div>
        </div>
      </section>

      {/* calibration set */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-7xl px-6 py-20">
          <p className="text-label text-ink-3">THE CALIBRATION SET</p>
          <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight">
            Five springs. One language.
          </h2>
          <p className="text-ink-2 mt-3 max-w-xl">
            flick confirms, snap switches, glide moves, drift breathes, recoil
            celebrates. Hover a calibration to feel its personality.
          </p>
          <div className="mt-10">
            <CalibrationStrip />
          </div>
        </div>
      </section>

      {/* the numbers — real counts, rolled by the same instrument they count */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-7xl px-6 py-20">
          <p className="text-label text-ink-3">THE INVENTORY</p>
          <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight">
            One system, machined from one piece.
          </h2>
          <p className="text-ink-2 mt-3 max-w-xl">
            Counted from the catalog at build time and rolled by the readout —
            the same instrument you can install.
          </p>
          <div className="mt-12">
            <InventoryCounters stats={stats} />
          </div>
        </div>
      </section>

      {/* the library demonstrates itself */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-7xl px-6 py-20">
          <p className="text-label text-ink-3">SELF-DEMONSTRATION</p>
          <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight">
            Nothing here is a screenshot.
          </h2>
          <p className="text-ink-2 mt-3 max-w-xl">
            Two vignettes and the agent desk, running live with their default
            props. Hover the scenes; type in the desk. If the home page needed
            special versions, the components would be the problem.
          </p>
          <div className="mt-10">
            <SelfDemoStrip />
          </div>
        </div>
      </section>

      {/* agent-native distribution */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-7xl px-6 py-20">
          <p className="text-label text-ink-3">AGENT-NATIVE</p>
          <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight">
            Your agent already knows this library.
          </h2>
          <p className="text-ink-2 mt-3 max-w-xl">
            Three channels, all free: the registry your tools install from, an
            MCP server your agent searches, and a packaged skill that teaches
            it the doctrine.
          </p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {AGENT_CHANNELS.map((channel) => (
              <div
                key={channel.title}
                className="border-hairline rounded-4 bg-surface-1 flex flex-col border p-6"
              >
                <h3 className="text-ink font-semibold tracking-tight">
                  {channel.title}
                </h3>
                <p className="text-ink-2 mt-2 flex-1 text-sm leading-relaxed">
                  {channel.copy}
                </p>
                <Link
                  href={channel.href}
                  className="text-ink-2 hover:text-ink mt-4 text-sm font-medium transition-colors"
                >
                  {channel.linkLabel} →
                </Link>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-8 w-full max-w-xl">
            <InstallCommand slug="agent-skill" />
            <p className="text-ink-3 mt-3 text-center text-xs">
              Installs to .claude/skills/kinetiq — your agent takes it from
              there.
            </p>
          </div>
        </div>
      </section>

      {/* exhibit floor */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-7xl px-6 py-20">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-label text-ink-3">EXHIBIT FLOOR</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Live specimens.
              </h2>
              <p className="text-ink-2 mt-3 max-w-xl">
                Every instrument is interactive — press, hold, and drag them
                right here. The whole catalog runs live in the explorer.
              </p>
            </div>
            <Link
              href="/explore"
              className="text-ink-2 hover:text-ink hidden shrink-0 text-sm font-medium transition-colors sm:block"
            >
              Open the explorer →
            </Link>
          </div>
          <div className="mt-10">
            <DemoWall />
          </div>
          <div className="mt-12 flex justify-center">
            <Link
              href="/explore"
              className="border-input text-ink hover:bg-accent rounded-2 border px-5 py-2.5 text-sm font-medium transition-colors"
            >
              See all {catalogComponents.length} instruments live
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
