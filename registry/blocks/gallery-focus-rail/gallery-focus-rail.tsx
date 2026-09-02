"use client";

import * as React from "react";

import { FocusRail, type FocusRailItem } from "@/registry/ui/focus-rail";
import { cn } from "@/registry/lib/utils";

export type FocusPlate = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  figure: string;
};

export type GalleryFocusRailProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  plates?: FocusPlate[];
  className?: string;
};

const DEFAULT_PLATES: FocusPlate[] = [
  {
    id: "berth",
    kicker: "WAYLIGHT · BERTH LOG",
    title: "The gate opens at first light",
    body: "Line handlers walk the ropes before the horn sounds — the manifest is right or the gate stays shut.",
    figure: "berth 4 · 06:10",
  },
  {
    id: "mast",
    kicker: "FIELD STATION",
    title: "One mast holds the frequency",
    body: "Wind and swell reach every skiff off a single relay on the point before the fleet leaves the slip.",
    figure: "mast 2 · 05:52",
  },
  {
    id: "chart",
    kicker: "CHART ROOM",
    title: "The tide table earns its keep",
    body: "Pencilled corrections outlive the printed page — the room trusts the hand that has been wrong before.",
    figure: "table VII · rev. 4",
  },
  {
    id: "hold",
    kicker: "COLD STORE",
    title: "The catch keeps its own clock",
    body: "Ice goes down before the boats come in; nobody has caught up starting after the horn sounds.",
    figure: "hold 3 · 34°f",
  },
  {
    id: "watch",
    kicker: "NIGHT WATCH",
    title: "The lamp answers before the radio",
    body: "Two keepers share one lamp, and the rule has not changed since the light itself was first lit.",
    figure: "watch 2 · 22:00",
  },
];

const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getWideSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches;
}

/** A prerender has no viewport to test, so it reports wide — matching the
 * horizontal markup hydration must not contradict; the true width lands
 * once the client store subscribes. */
function getWideServerSnapshot(): boolean {
  return true;
}

/** True from `sm` (640px) up. Drives the rail's orientation switch without ever reading `window` during render. */
function useIsWide(): boolean {
  return React.useSyncExternalStore(
    subscribeWide,
    getWideSnapshot,
    getWideServerSnapshot,
  );
}

/**
 * A deterministic wash per plate position, so five plates read as a graded
 * set instead of five identical cards. The active plate leans a little
 * further into the primary tint; the shift always resolves through the
 * panel's own CSS transition, never a spring.
 */
function plateWash(index: number, active: boolean): string {
  const primaryPct = (active ? 11 : 5) + (index % 5) * 3;
  const inkPct = 8 + ((index + 2) % 5) * 3;
  return `color-mix(in oklab, var(--primary) ${primaryPct}%, color-mix(in oklab, var(--ink-2) ${inkPct}%, var(--color-surface-1)))`;
}

/**
 * A gallery riding the rail focus-rail already drives — flex-grow, the
 * glide spring, hover preview versus committed press all come from
 * FocusRail; this block only draws the five plates on top of it. Each
 * plate stays typographic on purpose: a kicker and a title hold their
 * place at rest, and once a plate wins the pointer or the focus ring, a
 * two-line story and a mono berth figure fill in beneath them. A subtle
 * color-mix wash, graded by position off var(--primary) and var(--ink-2),
 * ties the row together without a single photograph, and that wash only
 * ever moves through a plain CSS transition. Below `sm` the rail turns
 * vertical and stacks, decided by a matchMedia store rather than a window
 * read during render.
 *
 * Reduced motion: the resize and the label-to-story swap are FocusRail's
 * own instant path; this section adds nothing that moves beyond the
 * wash's CSS color transition.
 */
export function GalleryFocusRail({
  eyebrow = "Waylight · harbour field notes",
  headline = "Five berths on one rail, and the one worth stopping on tonight.",
  deck = "Hold the rail and one plate takes the room while the rest wait their turn at the edge.",
  plates = DEFAULT_PLATES,
  className,
}: GalleryFocusRailProps) {
  const headingId = React.useId();
  const isWide = useIsWide();

  const items: FocusRailItem[] = plates.map((plate) => ({
    id: plate.id,
    label: plate.title,
  }));
  const plateEntries = plates.map((plate, index) => ({ ...plate, index }));

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <p className="text-label text-ink-3">{eyebrow}</p>
        <h2
          id={headingId}
          className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>
        <p className="mt-4 max-w-xl leading-relaxed text-ink-2">{deck}</p>

        <div className={cn("mt-10", isWide ? "h-[22rem]" : "h-[34rem]")}>
          <FocusRail
            items={items}
            label="Gallery"
            expandOn="hover"
            grow={2.8}
            orientation={isWide ? "horizontal" : "vertical"}
            className={isWide ? "h-full" : undefined}
            renderPanel={(item, { active }) => {
              const entry = plateEntries.find(
                (candidate) => candidate.id === item.id,
              );
              if (!entry) return null;
              return (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 transition-colors duration-300"
                    style={{ backgroundColor: plateWash(entry.index, active) }}
                  />
                  <div className="relative flex h-full min-w-0 flex-col justify-between">
                    <div>
                      <span className="block text-label text-ink-3">
                        {entry.kicker}
                      </span>
                      <span className="mt-2 block text-xl leading-tight font-semibold tracking-tight text-ink sm:text-2xl">
                        {entry.title}
                      </span>
                    </div>
                    {active ? (
                      <div className="mt-4">
                        <span className="line-clamp-2 block text-sm leading-relaxed text-ink-2">
                          {entry.body}
                        </span>
                        <span className="mt-4 block border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
                          {entry.figure}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </>
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}
