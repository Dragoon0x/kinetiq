import Link from "next/link";

import { InstallCommand } from "@/components/docs/install-command";
import { CalibrationStrip } from "@/components/home/calibration-strip";
import { DemoWall } from "@/components/home/demo-wall";
import { itemsByCategory } from "@/content/categories";
import { catalogBlocks, catalogComponents } from "@/content/manifest";
import { Wavefield } from "@/registry/ui/wavefield";

const STATS = (categories: number) => [
  { value: catalogComponents.length, unit: "", label: "Instruments" },
  { value: catalogBlocks.length, unit: "", label: "Assemblies" },
  { value: categories, unit: "", label: "Categories" },
  { value: 5, unit: "", label: "Springs" },
];

export default function HomePage() {
  const categoryCount = itemsByCategory(catalogComponents).length;

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

      {/* the numbers */}
      <section className="border-hairline border-t">
        <div className="mx-auto w-full max-w-7xl px-6 py-20">
          <p className="text-label text-ink-3">THE INVENTORY</p>
          <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight">
            One system, machined from one piece.
          </h2>
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {STATS(categoryCount).map((stat) => (
              <div key={stat.label}>
                <dd className="text-ink text-5xl font-semibold tracking-tight tabular-nums">
                  {stat.value}
                </dd>
                <dt className="text-label text-ink-3 mt-2">{stat.label}</dt>
              </div>
            ))}
          </dl>
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
