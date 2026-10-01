"use client";

import * as React from "react";

import { Check, Copy } from "lucide-react";

import { TweakPanel, type TweakState } from "@/components/tactile/tweak-panel";
import { tweaks as gelTweaks } from "@/registry/demos/gel-switch.demo";
import { playTone } from "@/registry/lib/tactile-sound";
import { defaultsOf, toJsx } from "@/registry/lib/tweaks";
import { GelSwitch } from "@/registry/ui/gel-switch";

import { specimen, useEntry } from "../core/catalog";
import { held, on, travel, type Point, type PointerState } from "../core/input";
import { useWorldBoxes, type Box } from "../core/measure";
import { f, type Cue, type SceneProps, type Shot } from "../core/shot";
import { ease, mix, r2, span, spring } from "../core/spring";
import { Camera, Layer } from "../core/stage";
import { Display, Label, MaskLine, typed } from "../core/type";

/**
 * 0:09.6–0:16.5 — TUNE, then OWN.
 *
 * The specimen on its stage, as the site shows it: the live switch beside
 * its tweak panel. A hand takes the Wobble bar from 0.50 to 1.00 — the real
 * scrub bar, dragged by a real pointer — and the code under it rewrites
 * itself, because the panel's keys are the component's props. Pressed, the
 * switch lands with all of that wobble. Then the code is copied, the code
 * block opens into the whole frame as a terminal, and one command puts the
 * source in the visitor's repo.
 */
export const TUNE = {
  in: f(288),
  grab: f(290),
  dragFrom: f(293),
  dragTo: f(321),
  release: f(323),
  toSwitch: f(326),
  press: f(347),
  own: f(400),
  toCopy: f(402),
  copy: f(419),
  open: f(428),
  typeFrom: f(441),
  typeTo: f(458),
  enter: f(461),
  end: f(496),
} as const;

const REST = { zoom: 1.36, x: 500, y: 150 };
const COMMAND = "pnpm dlx shadcn@latest add @kinetiq/gel-switch";
/** What the shadcn CLI prints for this item: its file and its five libs. */
const OUTPUT: { text: string; at: number; tone?: "ok" | "file" | "key" }[] = [
  { text: "✔ Checking registry.", at: f(465), tone: "ok" },
  { text: "✔ Installing dependencies.", at: f(469), tone: "ok" },
  { text: "✔ Created 6 files:", at: f(474), tone: "ok" },
  { text: "  - components/ui/gel-switch.tsx", at: f(477), tone: "key" },
  { text: "  - lib/utils.ts", at: f(479), tone: "file" },
  { text: "  - lib/motion.ts", at: f(481), tone: "file" },
  { text: "  - hooks/use-motion-safe.ts", at: f(483), tone: "file" },
  { text: "  - lib/tactile-gesture.ts", at: f(485), tone: "file" },
  { text: "  - lib/tactile-sound.ts", at: f(487), tone: "file" },
];

/** The drag along the Wobble bar, as a share of the bar's width. */
const dragShare = (t: number) =>
  t < TUNE.dragFrom
    ? 0.5
    : mix(0.5, 1.03, ease.move(span(t, TUNE.dragFrom, TUNE.dragTo)));

const WOBBLE = '[data-film="tweaks"] [role="slider"][aria-label="Wobble"]';

function CodeLines({ jsx, size }: { jsx: string; size: number }) {
  // The site's code colours: keywords dim, the component in cobalt, values live.
  const parts = jsx.split(/(\{[^}]*\})/g);
  return (
    <div className="font-mono" style={{ fontSize: size, lineHeight: 1.7 }}>
      <div className="text-ink-3">
        <span className="text-ink-2">import</span> {"{ "}
        <span className="text-ink">GelSwitch</span>
        {" }"} <span className="text-ink-2">from</span>{" "}
        <span className="text-ink-2">
          &quot;@/components/ui/gel-switch&quot;
        </span>
        ;
      </div>
      <div>&nbsp;</div>
      <div className="text-ink">
        {parts.map((part, i) =>
          part.startsWith("{") ? (
            <span key={i} className="text-signal">
              {part}
            </span>
          ) : (
            <span key={i}>
              {part.split(/(GelSwitch)/).map((bit, j) =>
                bit === "GelSwitch" ? (
                  <span key={j} className="text-cobalt-bright">
                    {bit}
                  </span>
                ) : (
                  bit
                ),
              )}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function TuneScene({ t }: SceneProps) {
  const entry = useEntry("gel-switch");
  const world = React.useRef<HTMLDivElement>(null);
  const [values, setValues] = React.useState<TweakState>(() =>
    defaultsOf(gelTweaks),
  );
  const [checked, setChecked] = React.useState(false);
  const boxes = useWorldBoxes(world, {
    wobble: WOBBLE,
    gel: '[data-film="gel-stage"]',
    code: '[data-film="code"]',
  });
  const jsx = toJsx("GelSwitch", gelTweaks, values);
  const copied = t >= TUNE.copy + f(1);

  // ── camera ────────────────────────────────────────────────────────────
  const bar: Box = boxes.wobble ?? { x: 600, y: 120, w: 400, h: 28 };
  const gel: Box = boxes.gel ?? { x: 300, y: 180, w: 72, h: 40 };
  const code: Box = boxes.code ?? { x: 600, y: 300, w: 400, h: 90 };
  let cam = { ...REST };
  if (t < TUNE.release + f(2)) {
    // A macro that rides along the bar with the hand.
    const share = Math.min(1, dragShare(t));
    cam = {
      zoom: mix(3.4, 3.0, span(t, TUNE.dragFrom, TUNE.dragTo)),
      x:
        bar.x +
        bar.w *
          mix(0.42, share * 0.86, ease.move(span(t, TUNE.grab, TUNE.dragTo))),
      y: bar.y + bar.h / 2 + 6,
    };
  } else if (t < TUNE.own) {
    // Pull back to the stage, then lean in on the switch for the landing.
    const back = spring("glide", t, TUNE.release + f(2));
    const lean = spring("drift", t, TUNE.press - f(4));
    const macroX = bar.x + bar.w * 0.86;
    const macroY = bar.y + bar.h / 2 + 6;
    const z = Math.exp(mix(Math.log(3.0), Math.log(REST.zoom), back));
    cam = {
      zoom: z * mix(1, 1.22, lean),
      x: mix(mix(macroX, REST.x, back), gel.x + gel.w / 2, lean * 0.3),
      y: mix(mix(macroY, REST.y, back), gel.y + gel.h / 2, lean * 0.35),
    };
  } else {
    // OWN: the camera finds the code the panel just wrote.
    const lean = spring("drift", TUNE.own, TUNE.press - f(4));
    const fromZ = REST.zoom * mix(1, 1.22, lean);
    const fromX = mix(REST.x, gel.x + gel.w / 2, lean * 0.3);
    const fromY = mix(REST.y, gel.y + gel.h / 2, lean * 0.35);
    const go = spring("glide", t, TUNE.own);
    cam = {
      zoom: Math.exp(mix(Math.log(fromZ), Math.log(2.6), go)),
      x: mix(fromX, code.x + code.w * 0.42, go),
      y: mix(fromY, code.y + code.h / 2, go),
    };
  }

  // ── the terminal the code block opens into ────────────────────────────
  const open = spring("glide", t, TUNE.open);
  const codeScreen = {
    left: 960 + (code.x - cam.x) * cam.zoom,
    top: 540 + (code.y - cam.y) * cam.zoom,
    width: code.w * cam.zoom,
    height: code.h * cam.zoom,
  };
  const term = {
    left: mix(codeScreen.left, 0, open),
    top: mix(codeScreen.top, 0, open),
    width: mix(codeScreen.width, 1920, open),
    height: mix(codeScreen.height, 1080, open),
  };
  const typedShare = span(t, TUNE.typeFrom, TUNE.typeTo);
  const command = typed(COMMAND, typedShare);
  const caretOn =
    Math.floor(t * 2.2) % 2 === 0 || (t > TUNE.typeFrom && t < TUNE.enter);

  const tune = spring("snap", t, TUNE.release + f(3));
  const tuneOut = ease.exit(span(t, TUNE.own, TUNE.own + f(8)));
  const own = spring("snap", t, TUNE.open + f(4));
  // The whip into FEEL pushes this frame out to the left as the next one arrives.
  const pushed = spring("snap", t, TUNE.end);

  return (
    <Layer
      className="bg-background"
      style={{
        transform:
          t > TUNE.end ? `translateX(${r2(-pushed * 420)}px)` : undefined,
      }}
    >
      <Camera x={cam.x} y={cam.y} zoom={cam.zoom}>
        <div
          ref={world}
          className="relative"
          style={{ width: 1000, height: 420 }}
        >
          {/* The specimen stage. */}
          <div
            className="absolute flex flex-col rounded-4 border border-hairline bg-surface-1"
            style={{ left: 0, top: 0, width: 520, height: 420 }}
          >
            <div className="flex h-12 items-center justify-between px-5">
              <Label size={11}>{specimen(entry)}</Label>
              <Label size={11} className="flex items-center gap-1.5">
                <span className="inline-block size-1.5 rounded-full bg-signal" />
                calibrated
              </Label>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <div className="flex w-[360px] items-center justify-between gap-4 rounded-3 border border-hairline bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Round-ups
                  </p>
                  <p className="text-xs text-ink-3">
                    Spare change from card payments goes to Savings.
                  </p>
                </div>
                <span data-film="gel-stage" className="block shrink-0">
                  <GelSwitch
                    label="Round-ups"
                    hideLabel
                    checked={checked}
                    onCheckedChange={setChecked}
                    sound
                    viscosity={Number(values.viscosity)}
                    stretch={Number(values.stretch)}
                    wobble={Number(values.wobble)}
                    fill={Boolean(values.fill)}
                    size="lg"
                  />
                </span>
              </div>
              <p className="w-[360px] font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span className="text-signal">
                  {checked ? "round-ups on" : "round-ups off"}
                </span>
                {checked ? " · every card payment" : " · payments untouched"}
              </p>
            </div>
          </div>

          {/* Its tweaks, and the code they write. */}
          <div
            data-film="tweaks"
            className="absolute flex flex-col gap-4 rounded-4 border border-hairline bg-surface-1 p-5"
            style={{ left: 556, top: 0, width: 444, height: 420 }}
          >
            <TweakPanel
              schema={gelTweaks}
              values={values}
              onChange={(key, value) => {
                setValues((was) => {
                  if (key === "wobble" && value !== was.wobble) {
                    playTone("detent", {
                      pitch: 0.8 + Number(value) * 0.7,
                      gain: 0.45,
                      pan: 0.3,
                    });
                  }
                  return { ...was, [key]: value };
                });
              }}
              onReset={() => setValues(defaultsOf(gelTweaks))}
            />
            <div
              data-film="code"
              className="relative mt-auto rounded-3 border border-hairline bg-background px-4 py-3"
            >
              <CodeLines jsx={jsx} size={11.5} />
              <span
                data-film="copy"
                className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-2 text-ink-3"
              >
                {copied ? (
                  <Check className="size-3.5 text-signal" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </span>
            </div>
          </div>
        </div>
      </Camera>

      {/* TUNE THE FEEL — over the stage, top left. */}
      <div className="absolute" style={{ left: 150, top: 96 }}>
        <Display size={112}>
          <MaskLine p={tune} out={tuneOut}>
            Tune the feel.
          </MaskLine>
        </Display>
      </div>

      {/* OWN THE CODE — the code block opens into the frame. */}
      {t >= TUNE.open ? (
        <div
          className="absolute overflow-clip border border-hairline-strong bg-background"
          style={{
            left: r2(term.left),
            top: r2(term.top),
            width: r2(term.width),
            height: r2(term.height),
            borderRadius: r2(mix(12 * cam.zoom, 0, open)),
          }}
        >
          <div
            className="absolute"
            style={{
              left: 150,
              top: 120,
              opacity: r2(span(t, TUNE.open + f(2), TUNE.open + f(6))),
            }}
          >
            <Display size={112}>
              <MaskLine p={own}>Own the code.</MaskLine>
            </Display>
          </div>
          <div
            className="absolute font-mono"
            style={{
              left: 150,
              top: 400,
              fontSize: 30,
              lineHeight: 1.6,
              opacity: r2(span(t, TUNE.open + f(3), TUNE.open + f(8))),
            }}
          >
            <div className="whitespace-pre">
              <span className="text-ink-3">~/coldbrook $ </span>
              <span className="text-ink">
                {command.split("@kinetiq/gel-switch")[0]}
              </span>
              {command.includes("@kinetiq") ? (
                <span className="text-cobalt-bright">
                  {command.slice(command.indexOf("@kinetiq"))}
                </span>
              ) : null}
              <span
                className="ml-0.5 inline-block w-[0.55em] translate-y-[0.12em] bg-ink"
                style={{
                  height: "1.05em",
                  opacity: t < TUNE.enter && caretOn ? 0.85 : 0,
                }}
              />
            </div>
            {OUTPUT.map((line) =>
              t >= line.at ? (
                <div
                  key={line.text}
                  className={
                    line.tone === "key"
                      ? "whitespace-pre text-signal"
                      : line.tone === "ok"
                        ? "whitespace-pre text-ink"
                        : "whitespace-pre text-ink-3"
                  }
                  style={{ fontSize: line.tone === "ok" ? 30 : 26 }}
                >
                  {line.text}
                </div>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
    </Layer>
  );
}

/** The hand: grab the bar, drag it home, press the switch, then copy. */
function input(t: number): PointerState {
  const barPoint = (share: number): Point => on(WOBBLE, share, 0.5);
  let point: Point;
  if (t < TUNE.release) {
    point = barPoint(dragShare(t));
  } else if (t < TUNE.own) {
    point = travel(t, [
      { at: TUNE.release, to: () => barPoint(1.03) },
      { at: TUNE.toSwitch, to: () => on("gel-stage", 0.38, 0.55), by: "glide" },
    ]);
  } else {
    point = travel(t, [
      { at: TUNE.own, to: () => on("gel-stage", 0.38, 0.55) },
      { at: TUNE.toCopy, to: () => on("copy", 0.5, 0.5), by: "glide" },
    ]);
  }
  return {
    ...point,
    down: held(
      t,
      [TUNE.grab, TUNE.release],
      [TUNE.press, TUNE.press + f(3)],
      [TUNE.copy, TUNE.copy + f(3)],
    ),
    visible: t < TUNE.open + f(2),
  };
}

const cues: Cue[] = [
  { at: TUNE.grab, play: () => playTone("click", { gain: 0.4, pan: 0.3 }) },
  {
    at: TUNE.copy + f(1),
    play: () => playTone("tick", { pitch: 1.3, gain: 0.5, pan: 0.4 }),
  },
  { at: TUNE.open, play: () => playTone("whoosh", { pitch: 0.7, gain: 0.35 }) },
  // Typing: one soft key per character, a little uneven, as hands are.
  ...Array.from({ length: COMMAND.length }, (_, i) => ({
    at: TUNE.typeFrom + ((TUNE.typeTo - TUNE.typeFrom) * i) / COMMAND.length,
    play: () =>
      playTone("tick", {
        pitch: 1.6 + ((i * 37) % 11) / 30,
        gain: 0.14 + ((i * 53) % 7) / 60,
        pan: -0.2 + ((i * 29) % 9) / 22,
      }),
  })),
  { at: TUNE.enter, play: () => playTone("clack", { gain: 0.55 }) },
  ...OUTPUT.filter((line) => line.tone === "ok").map((line) => ({
    at: line.at,
    play: () => playTone("plip", { pitch: 1.4, gain: 0.25 }),
  })),
  {
    at: OUTPUT[3]?.at ?? f(477),
    play: () => playTone("chime", { gain: 0.3, pitch: 1 }),
  },
];

export const tuneShot: Shot = {
  id: "tune",
  from: 288,
  to: 508,
  preroll: 8,
  Scene: TuneScene,
  input,
  cues,
};
