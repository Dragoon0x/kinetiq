import Link from "next/link";

import { InstallCommand } from "@/components/docs/install-command";
import { CalibrationStrip } from "@/components/home/calibration-strip";
import { DemoWall } from "@/components/home/demo-wall";
import { catalogBlocks, catalogComponents } from "@/content/manifest";

export default function HomePage() {
  return (
    <main>
      {/* hero — the grid + fade live on their own layer so the mask never
          touches the content (a mask-image on an element fades its subtree). */}
      <section className="relative overflow-hidden">
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
            A React component library where every animation shares five
            calibrated springs. Copy the source. Own the code. Ship interfaces
            that feel machined.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/components"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2 px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Browse components
            </Link>
            <Link
              href="/blocks"
              className="border-input text-ink hover:bg-accent rounded-2 border px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Explore blocks
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
                right here.
              </p>
            </div>
            <Link
              href="/components"
              className="text-ink-2 hover:text-ink hidden shrink-0 text-sm font-medium transition-colors sm:block"
            >
              Full index →
            </Link>
          </div>
          <div className="mt-10">
            <DemoWall />
          </div>
        </div>
      </section>
    </main>
  );
}
