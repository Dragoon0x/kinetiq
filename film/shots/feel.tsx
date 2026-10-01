"use client";

import * as React from "react";

import { RotaryDial } from "@/registry/ui/rotary-dial";
import { VinylScrub } from "@/registry/ui/vinyl-scrub";

import { specimen, useEntry } from "../core/catalog";
import { held, on, travel, type Point, type PointerState } from "../core/input";
import { useWorldBoxes } from "../core/measure";
import { f, type SceneProps, type Shot } from "../core/shot";
import { ease, mix, r2, span, spring } from "../core/spring";
import { Camera, Layer } from "../core/stage";
import { Display, Label, MaskLine } from "../core/type";

/**
 * 0:16.5–0:19.7 — FEEL.
 *
 * Two Tactile instruments, operated for real and heard for real: a rotary
 * dial wound to the stop and let go — it winds back tooth by tooth, each
 * tooth its own synthesized tick — then a record scratched under the hand,
 * the scratch pitched by the hand's speed. The line holds across the cut.
 */
export const FEEL = {
  in: f(496),
  toHole: f(500),
  grab: f(512),
  windFrom: f(514),
  windTo: f(532),
  release: f(534),
  cut: f(544),
  scratch: f(553),
  out: f(584),
  end: f(592),
} as const;

const DIAL = '[data-film="dial"] svg[viewBox="0 0 172 172"]';
const VINYL = '[data-film="vinyl"] svg[viewBox="0 0 300 208"]';

/** A point on the dial's finger ring, `deg` clockwise from twelve. */
const ring = (deg: number): Point => {
  const a = (deg * Math.PI) / 180;
  return on(DIAL, (86 + 58 * Math.sin(a)) / 172, (86 - 58 * Math.cos(a)) / 172);
};
/** A point on the record, `deg` clockwise from twelve, `r` from the spindle. */
const groove = (deg: number, r = 62): Point => {
  const a = (deg * Math.PI) / 180;
  return on(
    VINYL,
    (104 + r * Math.sin(a)) / 300,
    (104 - r * Math.cos(a)) / 208,
  );
};

/** Hole 7 sits 8 pulses short of the stop: it starts at -120° and winds 240°. */
const windAngle = (t: number) =>
  -120 + 240 * ease.move(span(t, FEEL.windFrom, FEEL.windTo));

/** The scratch: back, forward, back — the hand's angle on the record. */
const SCRATCH: [number, number][] = [
  [FEEL.scratch, 70],
  [FEEL.scratch + f(6), 10],
  [FEEL.scratch + f(11), 62],
  [FEEL.scratch + f(15), 18],
  [FEEL.scratch + f(19), 48],
];
const scratchAngle = (t: number) => {
  for (let i = SCRATCH.length - 1; i > 0; i--) {
    const [at, deg] = SCRATCH[i] ?? [0, 0];
    const [was, from] = SCRATCH[i - 1] ?? [0, 0];
    if (t >= was) return mix(from, deg, ease.move(span(t, was, at)));
  }
  return SCRATCH[0]?.[1] ?? 0;
};

function FeelScene({ t }: SceneProps) {
  const dial = useEntry("rotary-dial");
  const vinyl = useEntry("vinyl-scrub");
  const [digits, setDigits] = React.useState("555");
  const whip = spring("snap", t, FEEL.in);
  const line = spring("snap", t, FEEL.in + f(5));
  const lineOut = ease.exit(span(t, FEEL.out, FEEL.out + f(8)));
  const second = t >= FEEL.cut;

  // Dial: a slow push in while it winds; record: a slow drift across.
  const dialZoom = mix(2.7, 2.95, span(t, FEEL.in, FEEL.cut));
  const vinylZoom = mix(3.15, 3.35, span(t, FEEL.cut, FEEL.end));
  const dialWorld = React.useRef<HTMLDivElement>(null);
  const vinylWorld = React.useRef<HTMLDivElement>(null);
  const dialBox = useWorldBoxes(dialWorld, {
    svg: 'svg[viewBox="0 0 172 172"]',
  }).svg ?? {
    x: 0,
    y: 60,
    w: 172,
    h: 172,
  };
  const vinylBox = useWorldBoxes(vinylWorld, {
    svg: 'svg[viewBox="0 0 300 208"]',
  }).svg ?? {
    x: 0,
    y: 0,
    w: 300,
    h: 208,
  };
  // The instrument sits right of centre, the line holds the left.
  const dialAt = { x: dialBox.x + dialBox.w / 2, y: dialBox.y + dialBox.h / 2 };
  const recordAt = {
    x: vinylBox.x + (vinylBox.w * 152) / 300,
    y: vinylBox.y + vinylBox.h / 2,
  };

  return (
    <Layer
      className="bg-background"
      style={{ transform: `translateX(${r2((1 - whip) * 1920)}px)` }}
    >
      <div style={{ visibility: second ? "hidden" : undefined }}>
        <Camera
          x={dialAt.x - 330 / dialZoom}
          y={dialAt.y + 10 / dialZoom}
          zoom={dialZoom}
        >
          <div
            ref={dialWorld}
            data-film="dial"
            className="relative"
            style={{ width: 360 }}
          >
            <RotaryDial
              label="Phone number"
              value={digits}
              onValueChange={setDigits}
              digits={7}
              sound={!second}
            />
          </div>
        </Camera>
      </div>
      <div style={{ visibility: second ? undefined : "hidden" }}>
        <Camera
          x={recordAt.x - 300 / vinylZoom}
          y={recordAt.y}
          zoom={vinylZoom}
        >
          <div
            ref={vinylWorld}
            data-film="vinyl"
            className="relative"
            style={{ width: 300 }}
          >
            <VinylScrub
              label="Night shift, side A"
              duration={164}
              defaultValue={44}
              defaultPlaying
              tonearm
              sound={second}
            />
          </div>
        </Camera>
      </div>

      {/* A soft edge so the line reads over the instrument. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[58%]"
        style={{
          background:
            "linear-gradient(90deg, var(--bg-0) 0%, var(--bg-0) 62%, transparent 100%)",
        }}
      />

      <div className="absolute" style={{ left: 150, top: 360 }}>
        <MaskLine p={line} out={lineOut} className="mb-8">
          <Label size={16}>{specimen(second ? vinyl : dial)}</Label>
        </MaskLine>
        <Display size={120}>
          <MaskLine p={line} out={lineOut}>
            Components
          </MaskLine>
          <MaskLine p={spring("snap", t, FEEL.in + f(8))} out={lineOut}>
            you can feel.
          </MaskLine>
        </Display>
      </div>
    </Layer>
  );
}

function input(t: number): PointerState {
  let point: Point;
  let down = false;
  if (t < FEEL.cut) {
    if (t < FEEL.windFrom) {
      point = travel(t, [
        { at: FEEL.in, to: () => ({ x: 1180, y: 900 }) },
        { at: FEEL.toHole, to: () => ring(-120), by: "glide" },
      ]);
    } else if (t < FEEL.release) {
      point = ring(windAngle(t));
    } else {
      point = travel(t, [
        { at: FEEL.release, to: () => ring(120) },
        {
          at: FEEL.release + f(2),
          to: () => ({ x: 1700, y: 880 }),
          by: "drift",
        },
      ]);
    }
    down = held(t, [FEEL.grab, FEEL.release]);
  } else {
    if (t < FEEL.scratch) {
      point = travel(t, [
        { at: FEEL.cut, to: () => ({ x: 1760, y: 960 }) },
        { at: FEEL.cut + f(1), to: () => groove(70), by: "glide" },
      ]);
    } else {
      point = groove(scratchAngle(t));
    }
    down = held(t, [FEEL.scratch, FEEL.scratch + f(21)]);
  }
  return { ...point, down, visible: t < FEEL.out };
}

export const feelShot: Shot = {
  id: "feel",
  from: 496,
  to: 594,
  preroll: 6,
  Scene: FeelScene,
  input,
};
