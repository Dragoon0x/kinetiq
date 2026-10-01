"use client";

import * as React from "react";

import { playTone, semitones } from "@/registry/lib/tactile-sound";

import { LOGO_HEIGHT, LOGO_PIECES, LOGO_VIEWBOX, LOGO_WIDTH } from "@/lib/logo";

import { useCatalog } from "../core/catalog";
import { PARKED } from "../core/input";
import { f, type Cue, type SceneProps, type Shot } from "../core/shot";
import {
  arrivalTime,
  ease,
  mix,
  r2,
  span,
  spring,
  SPRING,
} from "../core/spring";
import { Camera, Layer } from "../core/stage";
import { Display, Label, MaskLine } from "../core/type";
import { SPRING_NOTE } from "./springs";

/**
 * 0:25.6–0:30.0 — THE PAYOFF and THE CLOSE.
 *
 * Impact on the downbeat: the camera is on one specimen card — KQ-1097, the
 * switch the film opened on — and pulls back on drift until that card is
 * one point of light among every instrument in the catalog, each tile its
 * own calibration light. The count is the catalog's own. Then the wall
 * goes out, one light is left, and the Kinetiq mark assembles around it —
 * its three pieces arriving on three of the springs.
 */
export const FINALE = {
  in: f(768),
  count: f(780),
  close: f(832),
  dot: f(838),
  mark: f(846),
  word: f(850),
  line: f(858),
  cta: f(866),
  end: f(900),
} as const;

const COLS = 37;

/** The closing lockup: the mark, 112 px tall, left of the name. */
const MARK = {
  x: 642,
  y: 414,
  w: Math.round((112 * LOGO_WIDTH) / LOGO_HEIGHT),
  h: 112,
};
/** Where each piece of the mark flies in from, and on which spring. */
const PIECE_MOTION = [
  { spring: "snap", delay: 0, dx: 0, dy: 56 },
  { spring: "glide", delay: 0.07, dx: 58, dy: -58 },
  { spring: "recoil", delay: 0.14, dx: 40, dy: 48 },
] as const;
const TILE = { w: 150, h: 96, gap: 10 };
const PITCH = { x: TILE.w + TILE.gap, y: TILE.h + TILE.gap };

const Tile = React.memo(function Tile({
  serial,
  title,
  hero,
}: {
  serial: string;
  title: string;
  hero: boolean;
}) {
  return (
    <div className="relative" style={{ width: TILE.w, height: TILE.h }}>
      {/* The card itself recedes with distance; its light does not. */}
      <div
        className="absolute inset-0 rounded-2 border bg-surface-1"
        style={{
          opacity: "var(--detail)",
          borderColor: hero ? "var(--hairline-strong)" : "var(--hairline)",
        }}
      />
      <span
        className="absolute top-2.5 left-3 font-mono text-[8px] tracking-[0.08em] text-ink-3"
        style={{ opacity: "var(--detail)" }}
      >
        {serial}
      </span>
      <span
        className="absolute top-1.5 right-2 size-[16px] rounded-full"
        style={{ background: "var(--accent-bright)", opacity: hero ? 1 : 0.9 }}
      />
      <span className="absolute right-3 bottom-3 left-3 truncate text-[13px] font-medium tracking-tight text-ink">
        {title}
      </span>
    </div>
  );
});

function FinaleScene({ t }: SceneProps) {
  const { components, counts } = useCatalog();
  const rows = Math.ceil(components.length / COLS);
  const wall = { w: COLS * PITCH.x - TILE.gap, h: rows * PITCH.y - TILE.gap };
  const heroIndex = Math.max(
    0,
    components.findIndex((c) => c.name === "gel-switch"),
  );
  const hero = {
    x: (heroIndex % COLS) * PITCH.x + TILE.w / 2,
    y: Math.floor(heroIndex / COLS) * PITCH.y + TILE.h / 2,
  };

  // The pull-back: the hero card is tracked from the frame's centre to its
  // place in the wall, so the camera never sweeps — it only widens.
  const fromZoom = 10.5;
  // Close enough that the wall fills the frame edge to edge.
  const toZoom = 1990 / wall.w;
  const p = spring("drift", t, FINALE.in + f(3));
  const drift = span(t, FINALE.in + f(30), FINALE.end);
  const zoom =
    Math.exp(mix(Math.log(fromZoom), Math.log(toZoom), p)) *
    mix(1, 0.94, drift);
  const restHero = {
    x: 960 + (hero.x - wall.w / 2) * toZoom,
    y: 540 + (hero.y - wall.h / 2) * toZoom,
  };
  const sx = mix(960, restHero.x, p);
  const sy = mix(540, restHero.y, p);
  const camX = hero.x - (sx - 960) / zoom;
  const camY = hero.y - (sy - 540) / zoom;

  const close = ease.exit(span(t, FINALE.close, FINALE.close + f(14)));
  const number = spring("snap", t, FINALE.count);
  const numberOut = ease.exit(
    span(t, FINALE.close - f(4), FINALE.close + f(4)),
  );

  // The last light, and the mark it becomes.
  const dot = spring("flick", t, FINALE.dot);
  const travel = spring("glide", t, FINALE.dot + f(2));
  const absorbed = span(t, FINALE.mark + f(2), FINALE.mark + f(8));
  const word = spring("snap", t, FINALE.word);
  const line = spring("glide", t, FINALE.line);
  const cta = spring("glide", t, FINALE.cta);

  return (
    <Layer className="bg-background">
      <div style={{ opacity: r2(1 - close) }}>
        <Camera x={camX} y={camY} zoom={zoom}>
          <div
            className="relative grid"
            style={{
              // Far away, a card is only its light.
              ["--detail" as string]: r2(
                Math.min(1, Math.max(0.1, (zoom - 0.5) / 1.6)),
              ),
              width: wall.w,
              gridTemplateColumns: `repeat(${COLS}, ${TILE.w}px)`,
              gap: TILE.gap,
            }}
          >
            {components.map((entry, i) => (
              <Tile
                key={entry.name}
                serial={entry.serial}
                title={entry.title}
                hero={i === heroIndex}
              />
            ))}
          </div>
        </Camera>
        {/* A band of night behind the count, so it reads over the wall. */}
        <div
          className="absolute inset-x-0"
          style={{
            top: 330,
            height: 420,
            background:
              "linear-gradient(transparent, color-mix(in oklab, var(--bg-0) 82%, transparent) 30%, color-mix(in oklab, var(--bg-0) 82%, transparent) 70%, transparent)",
            opacity: r2(span(t, FINALE.count - f(6), FINALE.count + f(4))),
          }}
        />
        <div className="absolute" style={{ left: 150, top: 438 }}>
          <Display size={176}>
            <MaskLine p={number} out={numberOut}>
              {counts.instruments.toLocaleString("en-US")} instruments.
            </MaskLine>
          </Display>
        </div>
      </div>

      {t >= FINALE.dot ? (
        <>
          {/* The last light travels to where the mark will stand… */}
          <div
            className="absolute rounded-full"
            style={{
              left: r2(mix(960, MARK.x + MARK.w / 2, travel) - 9),
              top: 470 - 9,
              width: 18,
              height: 18,
              background: "var(--accent-bright)",
              transform: `scale(${r2(dot * (1 - absorbed))})`,
            }}
          />
          {/* …and the mark assembles around it, one piece per spring:
              the stem on snap, the arm on glide, the leg on recoil. */}
          {LOGO_PIECES.map((piece, i) => {
            const motion = PIECE_MOTION[i] ?? PIECE_MOTION[0];
            const p = spring(motion.spring, t, FINALE.mark + motion.delay);
            return (
              <svg
                key={piece}
                aria-hidden
                viewBox={LOGO_VIEWBOX}
                className="absolute text-ink"
                fill="currentColor"
                style={{
                  left: MARK.x,
                  top: MARK.y,
                  width: MARK.w,
                  height: MARK.h,
                  opacity: r2(Math.min(1, p * 2.4)),
                  transform: `translate(${r2((1 - p) * motion.dx)}px, ${r2((1 - p) * motion.dy)}px)`,
                }}
              >
                <path d={piece} />
              </svg>
            );
          })}
          <div
            className="absolute"
            style={{ left: MARK.x + MARK.w + 34, top: 404 }}
          >
            <MaskLine p={word}>
              <span
                className="block font-sans font-semibold text-ink"
                style={{
                  fontSize: 132,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                Kinetiq
              </span>
            </MaskLine>
          </div>
          <div className="absolute inset-x-0 text-center" style={{ top: 612 }}>
            <MaskLine p={line}>
              <span
                className="block font-sans font-medium text-ink-2"
                style={{ fontSize: 46, letterSpacing: "-0.02em" }}
              >
                Motion, calibrated.
              </span>
            </MaskLine>
          </div>
          <div className="absolute inset-x-0 text-center" style={{ top: 760 }}>
            <MaskLine p={cta}>
              <Label
                size={26}
                className="text-ink normal-case"
                style={{ letterSpacing: "0.06em" }}
              >
                kinetiqui.com
              </Label>
            </MaskLine>
          </div>
        </>
      ) : null}
    </Layer>
  );
}

const ORDER = ["flick", "snap", "glide", "drift", "recoil"] as const;

const cues: Cue[] = [
  { at: FINALE.dot, play: () => playTone("tick", { pitch: 1.2, gain: 0.5 }) },
  // The signature again, softer, as the mark arrives.
  ...ORDER.map((name) => ({
    at: FINALE.mark + arrivalTime(SPRING[name]),
    play: () =>
      playTone("note", { pitch: semitones(SPRING_NOTE[name]), gain: 0.42 }),
  })),
  { at: FINALE.cta, play: () => playTone("flare", { gain: 0.18, pitch: 0.9 }) },
];

export const finaleShot: Shot = {
  id: "finale",
  from: 768,
  to: 900,
  preroll: 10,
  Scene: FinaleScene,
  input: () => PARKED,
  cues,
};
