"use client";

import * as React from "react";

import { GelSwitch } from "@/registry/ui/gel-switch";

import { held, on, type PointerState } from "../core/input";
import { useWorldBox } from "../core/measure";
import { f, type SceneProps, type Shot } from "../core/shot";
import { ease, mix, span, spring } from "../core/spring";
import { Camera, Layer } from "../core/stage";
import { Display, Label, MaskLine } from "../core/type";

/**
 * 0:00–0:04.3 — THE HOOK.
 *
 * A liquid form fills the frame, reaches, pinches, lands and jiggles — then
 * the camera pulls out and it is a settings switch. Everything is one live
 * GelSwitch pressed once, filmed three ways: a tracking macro on the
 * stretch, a hard cut to a locked-off macro on the landing, and a pull-back
 * on the drift spring to the card it lives in.
 */
export const HOOK = {
  /** The press that sets the droplet off. */
  press: f(21),
  /** Hard cut from the stretch to the landing. */
  cut: f(33),
  /** The pull-back starts. */
  pull: f(62),
  end: f(128),
  /** Camera zoom on the card once pulled back. */
  restZoom: 2.5,
  /** Where the card's centre sits on the stage once pulled back. */
  restAt: { x: 1380, y: 560 },
} as const;

/** The droplet as tuned for film: thick, far-reaching, with a heavy landing. */
export const HOOK_GEL = {
  viscosity: 0.8,
  stretch: 0.95,
  wobble: 0.9,
  size: "lg",
} as const;

function HookScene({ t }: SceneProps) {
  const world = React.useRef<HTMLDivElement>(null);
  const card = React.useRef<HTMLDivElement>(null);
  const knob = React.useRef<HTMLSpanElement>(null);
  const cardBox = useWorldBox(world, card);
  const gelBox = useWorldBox(world, knob);
  const [checked, setChecked] = React.useState(false);

  // The switch's own geometry at size lg: knob centres 20 and 52 px in.
  const gx = gelBox?.x ?? 0;
  const gy = (gelBox?.y ?? 0) + (gelBox?.h ?? 40) / 2;
  const cardCx = (cardBox?.x ?? 0) + (cardBox?.w ?? 360) / 2;
  const cardCy = (cardBox?.y ?? 0) + (cardBox?.h ?? 72) / 2;

  let x: number;
  let y: number;
  let zoom: number;
  if (t < HOOK.cut) {
    // Tracking macro: pans with the reach, on drift — never locked to it.
    const p = spring("drift", t, HOOK.press);
    // Before the press: almost still — a slow push on a resting drop.
    x = gx + mix(25, 41, p);
    y = gy + 1.5;
    zoom = mix(27, 31, ease.move(span(t, 0, HOOK.cut)));
  } else if (t < HOOK.pull) {
    // Locked off on the landing, breathing in a hair.
    x = gx + 50;
    y = gy - 0.5;
    zoom = mix(44, 47, span(t, HOOK.cut, HOOK.pull));
  } else {
    // The pull-back, on drift, in log space so the speed reads evenly at
    // every scale. The knob is tracked across the frame — from the centre to
    // its resting place — so the camera never sweeps over anything else.
    const p = spring("drift", t, HOOK.pull);
    const fromZ = 47;
    const toZ = HOOK.restZoom;
    zoom = Math.exp(mix(Math.log(fromZ), Math.log(toZ), p));
    const knobX = gx + 50;
    const knobY = gy - 0.5;
    const restKnobX = HOOK.restAt.x + (knobX - cardCx) * toZ;
    const restKnobY = HOOK.restAt.y + (knobY - cardCy) * toZ;
    const sx = mix(960, restKnobX, p);
    const sy = mix(540, restKnobY, p);
    x = knobX - (sx - 960) / zoom;
    y = knobY - (sy - 540) / zoom;
  }

  const headline = spring("snap", t, f(76));
  const serial = spring("glide", t, f(72));
  // Handing over to the springs: the line leaves through its own mask.
  const out = ease.exit(span(t, f(126), f(134)));

  return (
    <Layer className="bg-surface-0">
      <Camera x={x} y={y} zoom={zoom}>
        <div
          ref={world}
          className="relative"
          style={{ width: 600, height: 300 }}
        >
          <div
            ref={card}
            data-film="card"
            className="absolute flex items-center justify-between gap-4 rounded-3 border border-hairline bg-card px-4 py-3"
            style={{ left: 120, top: 100, width: 360 }}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Round-ups</p>
              <p className="text-xs text-ink-3">
                Spare change from card payments goes to Savings.
              </p>
            </div>
            <span ref={knob} data-film="gel" className="block shrink-0">
              <GelSwitch
                label="Round-ups"
                hideLabel
                checked={checked}
                onCheckedChange={setChecked}
                sound
                {...HOOK_GEL}
              />
            </span>
          </div>
          <p
            className="absolute font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            style={{ left: 120, top: 100 + (cardBox?.h ?? 72) + 14 }}
          >
            <span className="text-signal">
              {checked ? "round-ups on" : "round-ups off"}
            </span>
            {checked ? " · every card payment" : " · payments untouched"}
          </p>
        </div>
      </Camera>

      {/* The line: the switch named, flatly, as the camera finds it. */}
      <div className="absolute" style={{ left: 150, top: 452 }}>
        <MaskLine p={serial} out={out} className="mb-7">
          <Label size={16}>KQ-1097 · Gel/Switch</Label>
        </MaskLine>
        <Display size={148}>
          <MaskLine p={headline} out={out}>
            It&apos;s a switch.
          </MaskLine>
        </Display>
      </div>
    </Layer>
  );
}

export const hookShot: Shot = {
  id: "hook",
  from: 0,
  to: 140,
  Scene: HookScene,
  input: (t): PointerState => {
    // The switch fills the macro frame: press anywhere on it, and keep the
    // hand still while the camera moves, or the press reads as a drag.
    const point = t < HOOK.cut ? { x: 1180, y: 560 } : on("gel", 0.5, 0.5);
    return {
      ...point,
      down: held(t, [HOOK.press, HOOK.press + f(3)]),
      visible: false,
    };
  },
};
