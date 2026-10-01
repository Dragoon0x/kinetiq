"use client";

import * as React from "react";

import { playTone } from "@/registry/lib/tactile-sound";
import { BokehNight } from "@/registry/ui/bokeh-night";
import { CloudChamber } from "@/registry/ui/cloud-chamber";
import { FerroPool } from "@/registry/ui/ferro-pool";
import { InkMarble } from "@/registry/ui/ink-marble";
import { KoiPond } from "@/registry/ui/koi-pond";
import { LavaDrift } from "@/registry/ui/lava-drift";
import { NeonStrike } from "@/registry/ui/neon-strike";
import { NewtonCradle } from "@/registry/ui/newton-cradle";
import { QuiltGrid } from "@/registry/ui/quilt-grid";
import { Readout } from "@/registry/ui/readout";
import { StainedGlass } from "@/registry/ui/stained-glass";
import { TapeReels } from "@/registry/ui/tape-reels";
import { TartanShift } from "@/registry/ui/tartan-shift";

import { specimen, useCatalog, useEntry } from "../core/catalog";
import { type Point, type PointerState } from "../core/input";
import { f, type Cue, type SceneProps, type Shot } from "../core/shot";
import { ease, mix, span } from "../core/spring";
import { Layer } from "../core/stage";
import { Label } from "../core/type";

/**
 * 0:22.4–0:25.6 — ACCELERATION.
 *
 * Eleven live specimens from across the catalog, cut on the eighth notes and
 * getting faster, each one being used as it is seen — koi scattering from
 * the hand, glass lit where it passes, ink combed, a ferrofluid crown rising
 * to it — under one frame that never moves: crop marks, the specimen's
 * serial, and the catalog's own Readout rolling toward its true count.
 */
type Slot = {
  slug: string;
  frames: number;
  /** Full bleed, or a component held large in the middle of the frame. */
  bleed: boolean;
  zoom?: number;
  render: (t: number, at: number) => React.ReactNode;
  /** The hand across this specimen, as a share of the frame over its slot. */
  hand?: (p: number) => Point & { down?: boolean };
};

const sweep =
  (from: Point, to: Point) =>
  (p: number): Point => ({
    x: mix(from.x, to.x, ease.move(p)),
    y: mix(from.y, to.y, ease.move(p)),
  });

const SLOTS: Slot[] = [
  {
    slug: "koi-pond",
    frames: 10,
    bleed: true,
    render: () => <KoiPond className="h-full w-full" fish={14} />,
    hand: sweep({ x: 760, y: 620 }, { x: 1120, y: 470 }),
  },
  {
    slug: "stained-glass",
    frames: 10,
    bleed: true,
    render: () => <StainedGlass className="h-full w-full" />,
    hand: sweep({ x: 1260, y: 330 }, { x: 820, y: 640 }),
  },
  {
    slug: "neon-strike",
    frames: 8,
    bleed: false,
    zoom: 3.1,
    render: () => (
      <NeonStrike
        phrases={["Waking the gauges", "Reading the field"]}
        colour="rose"
      />
    ),
  },
  {
    slug: "newton-cradle",
    frames: 8,
    bleed: false,
    zoom: 2.5,
    render: () => <NewtonCradle count={5} />,
  },
  {
    slug: "ink-marble",
    frames: 8,
    bleed: true,
    render: () => <InkMarble className="h-full w-full" />,
    hand: (p) => ({
      ...sweep({ x: 520, y: 380 }, { x: 1380, y: 700 })(p),
      down: true,
    }),
  },
  {
    slug: "bokeh-night",
    frames: 8,
    bleed: true,
    render: () => <BokehNight className="h-full w-full" defaultValue={0.3} />,
    hand: sweep({ x: 960, y: 820 }, { x: 980, y: 260 }),
  },
  {
    slug: "quilt-grid",
    frames: 6,
    bleed: true,
    render: () => <QuiltGrid className="h-full w-full" />,
    hand: sweep({ x: 700, y: 540 }, { x: 1200, y: 540 }),
  },
  {
    slug: "tartan-shift",
    frames: 6,
    bleed: true,
    render: (t, at) => (
      <TartanShift
        className="h-full w-full"
        palette={t >= at ? "modern" : "highland"}
      />
    ),
  },
  {
    slug: "cloud-chamber",
    frames: 6,
    bleed: true,
    render: () => <CloudChamber className="h-full w-full" rate={0.9} />,
    hand: sweep({ x: 900, y: 400 }, { x: 1100, y: 640 }),
  },
  {
    slug: "lava-drift",
    frames: 6,
    bleed: false,
    zoom: 7,
    render: () => <LavaDrift label="Warming the model" hideLabel size={64} />,
  },
  {
    slug: "tape-reels",
    frames: 4,
    bleed: false,
    zoom: 7,
    render: () => <TapeReels label="Backing up" hideLabel size={64} />,
  },
  {
    slug: "ferro-pool",
    frames: 16,
    bleed: true,
    render: () => <FerroPool className="h-full w-full" strength={0.9} />,
    hand: (p) => ({
      ...sweep({ x: 1060, y: 620 }, { x: 960, y: 520 })(Math.min(1, p * 1.6)),
      down: p > 0.84 && p < 0.97,
    }),
  },
];

export const MONTAGE = { in: f(672), end: f(768) };

/** Each slot's first frame. */
const STARTS = SLOTS.reduce<number[]>((list, slot, i) => {
  list.push(i === 0 ? 672 : (list[i - 1] ?? 672) + (SLOTS[i - 1]?.frames ?? 0));
  return list;
}, []);

const slotAt = (t: number): number => {
  for (let i = SLOTS.length - 1; i >= 0; i--) {
    if (t >= f(STARTS[i] ?? 0)) return i;
  }
  return 0;
};

function Corner({
  x,
  y,
  flip,
}: {
  x: "left" | "right";
  y: "top" | "bottom";
  flip: [number, number];
}) {
  return (
    <div
      className="absolute size-7 border-ink/70"
      style={{
        [x]: 56,
        [y]: 56,
        borderTopWidth: flip[1] > 0 ? 2 : 0,
        borderBottomWidth: flip[1] < 0 ? 2 : 0,
        borderLeftWidth: flip[0] > 0 ? 2 : 0,
        borderRightWidth: flip[0] < 0 ? 2 : 0,
      }}
    />
  );
}

function SlotLabel({ slug }: { slug: string }) {
  const entry = useEntry(slug);
  return <>{specimen(entry)}</>;
}

function MontageScene({ t }: SceneProps) {
  const { counts } = useCatalog();
  const current = slotAt(t);
  // The readout rolls toward the true count, faster as the cuts quicken.
  const share = ease.enter(span(t, MONTAGE.in, MONTAGE.end - f(4)));
  const count = Math.round((counts.instruments * Math.pow(share, 1.7)) / 7) * 7;
  const shown =
    t >= MONTAGE.end - f(4)
      ? counts.instruments
      : Math.min(count, counts.instruments);

  return (
    <Layer className="bg-background">
      {SLOTS.map((slot, i) => {
        const at = f(STARTS[i] ?? 0);
        // Mounted a beat and a half early, so each specimen is alive on its cut.
        if (t < at - f(24) || t >= at + f(slot.frames) + f(1)) return null;
        const visible = i === current;
        return (
          <div
            key={slot.slug}
            className="absolute inset-0"
            style={{ visibility: visible ? undefined : "hidden" }}
          >
            {slot.bleed ? (
              <div data-film={`slot-${i}`} className="absolute inset-0">
                {slot.render(t, at)}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  data-film={`slot-${i}`}
                  style={{ transform: `scale(${slot.zoom ?? 2})` }}
                >
                  {slot.render(t, at)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* The frame that holds still while everything under it changes. */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-x-0 top-0 h-40"
          style={{
            background: "linear-gradient(var(--bg-0), transparent)",
            opacity: 0.55,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-48"
          style={{
            background: "linear-gradient(transparent, var(--bg-0))",
            opacity: 0.7,
          }}
        />
        <Corner x="left" y="top" flip={[1, 1]} />
        <Corner x="right" y="top" flip={[-1, 1]} />
        <Corner x="left" y="bottom" flip={[1, -1]} />
        <Corner x="right" y="bottom" flip={[-1, -1]} />
        <div className="absolute" style={{ left: 104, top: 100 }}>
          <Label size={18} className="text-ink">
            <SlotLabel slug={SLOTS[current]?.slug ?? "koi-pond"} />
          </Label>
        </div>
        <div
          className="absolute flex items-center gap-2.5"
          style={{ right: 104, top: 100 }}
        >
          <span className="inline-block size-2 rounded-full bg-signal" />
          <Label size={18} className="text-ink">
            live
          </Label>
        </div>
        <div
          className="absolute flex items-end gap-5"
          style={{ left: 104, bottom: 92 }}
        >
          <div style={{ transform: "scale(1.9)", transformOrigin: "0 100%" }}>
            <Readout
              value={shown}
              size="xl"
              format={(n) => String(n).padStart(4, "0")}
            />
          </div>
          <Label size={18} className="ml-[120px] pb-1 text-ink-2">
            instruments
          </Label>
        </div>
        <div className="absolute" style={{ right: 104, bottom: 100 }}>
          <Label size={18} className="text-ink-2">
            {String(current + 1).padStart(2, "0")} / {SLOTS.length}
          </Label>
        </div>
      </div>
    </Layer>
  );
}

function input(t: number): PointerState {
  const i = slotAt(t);
  const slot = SLOTS[i];
  const at = f(STARTS[i] ?? 0);
  if (!slot?.hand) return { x: 1916, y: 1076, down: false, visible: false };
  // The hand starts a little before the cut, so the effect is already there.
  const p = span(t, at - f(2), at + f(slot.frames));
  const point = slot.hand(p);
  return { x: point.x, y: point.y, down: Boolean(point.down), visible: false };
}

const cues: Cue[] = STARTS.map((start, i) => ({
  at: f(start),
  play: () =>
    playTone("tick", {
      pitch: 1 + i * 0.05,
      gain: 0.32,
      pan: i % 2 === 0 ? -0.25 : 0.25,
    }),
}));

export const montageShot: Shot = {
  id: "montage",
  from: 672,
  to: 768,
  preroll: 24,
  Scene: MontageScene,
  input,
  cues,
};
