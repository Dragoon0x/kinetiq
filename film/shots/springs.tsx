"use client";

import * as React from "react";

import { semitones, playTone } from "@/registry/lib/tactile-sound";
import { BreakerSwitch } from "@/registry/ui/breaker-switch";
import { CheckboxGroup } from "@/registry/ui/checkbox";
import {
  GantryTabs,
  GantryTabsList,
  GantryTabsTrigger,
} from "@/registry/ui/gantry-tabs";
import { LavaDrift } from "@/registry/ui/lava-drift";
import { ToastProvider, useToast } from "@/registry/ui/telemetry-toast";
import type { SpringName } from "@/registry/lib/motion";

import { specimen, useEntry } from "../core/catalog";
import { PARKED } from "../core/input";
import { f, type Cue, type SceneProps, type Shot } from "../core/shot";
import {
  arrivalTime,
  ease,
  mix,
  r2,
  settleTime,
  span,
  spring,
  SPRING,
} from "../core/spring";
import { Layer } from "../core/stage";
import { Display, Label, MaskLine } from "../core/type";

/**
 * 0:04.3–0:09.6 — THE IDEA.
 *
 * The switch's knob is kept as the frame clears: it slides out a hairline
 * track, four more unfold from it, and the calibration set is on the bench —
 * flick, snap, glide, drift, recoil. Released together, each dot runs its
 * own spring (the library's exact constants) and lands on its own note:
 * the five arrivals are the film's sound signature. Then each track folds
 * into a specimen card and the dot becomes the card's status light, beside
 * a live component that moves on that spring.
 */
export const SPRINGS = {
  start: f(128),
  dock: f(146),
  unfold: f(144),
  release: f(160),
  morph: f(192),
  unison: f(272),
  end: f(288),
} as const;

const ORDER: SpringName[] = ["flick", "snap", "glide", "drift", "recoil"];
const ROLE: Record<SpringName, string> = {
  flick: "confirms",
  snap: "switches",
  glide: "moves",
  drift: "breathes",
  recoil: "celebrates",
};
/** Settle times as registry/lib/motion.ts documents them. */
const SETTLES: Record<SpringName, number> = {
  flick: 120,
  snap: 300,
  glide: 450,
  drift: 800,
  recoil: 700,
};
const ZETA = (name: SpringName) => {
  const s = SPRING[name];
  return (s.damping / (2 * Math.sqrt(s.stiffness * s.mass))).toFixed(2);
};

const TRACK_X0 = 540;
const TRACK_X1 = 1560;
const ROW_Y = [440, 538, 636, 734, 832];
const MIDDLE = 2;

const CARD = { top: 330, width: 306, height: 540, gap: 25, left: 150 };
const cardX = (i: number) => CARD.left + i * (CARD.width + CARD.gap);

/** Each spring's measured arrival and settle, and the note it lands on. */
const MEASURED = ORDER.map((name) => ({
  name,
  arrive: arrivalTime(SPRING[name]),
  settle: settleTime(SPRING[name], 0.002),
}));
const BY_ARRIVAL = [...MEASURED].sort((a, b) => a.arrive - b.arrive);
/** D major add 9, rising in the order the dots land. */
const NOTES = [2, 6, 9, 13, 16];
export const SPRING_NOTE: Record<SpringName, number> = Object.fromEntries(
  BY_ARRIVAL.map((m, i) => [m.name, NOTES[i] ?? 0]),
) as Record<SpringName, number>;

/** When each of the five components is set going. */
const TRIGGER: Record<SpringName, number[]> = {
  flick: [f(222), f(229)],
  snap: [f(233)],
  glide: [f(241), f(258)],
  drift: [],
  recoil: [f(248)],
};

function Dot({
  x,
  y,
  r,
  scale = 1,
  shine = 1,
}: {
  x: number;
  y: number;
  r: number;
  scale?: number;
  shine?: number;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: r2(x - r),
        top: r2(y - r),
        width: r2(r * 2),
        height: r2(r * 2),
        background: "var(--accent-bright)",
        transform: scale === 1 ? undefined : `scale(${r2(scale)})`,
      }}
    >
      {shine > 0 ? (
        <div
          className="absolute rounded-full bg-white"
          style={{
            left: "18%",
            top: "16%",
            width: "34%",
            height: "20%",
            opacity: r2(0.5 * shine),
          }}
        />
      ) : null}
    </div>
  );
}

/** The recoil card's toast: raised on cue, landing on the recoil spring. */
function ToastOnCue({ t }: { t: number }) {
  const { toast } = useToast();
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (sent.current || t < (TRIGGER.recoil[0] ?? Infinity)) return;
    sent.current = true;
    toast({
      title: "Calibration saved",
      description: "Bay A · within 0.2%",
      variant: "success",
      duration: 0,
    });
  }, [t, toast]);
  return null;
}

function Specimen({
  name,
  t,
  slug,
}: {
  name: SpringName;
  t: number;
  slug: string;
}) {
  const count = (TRIGGER[name] ?? []).filter((at) => t >= at).length;
  if (name === "flick") {
    const ids = ["degauss", "zero"].slice(0, count);
    return (
      <div className="w-56">
        <CheckboxGroup
          legend="Bench prep"
          items={[
            { id: "degauss", label: "Degauss chamber" },
            { id: "zero", label: "Zero the scale" },
          ]}
          value={ids}
          onValueChange={() => {}}
        />
      </div>
    );
  }
  if (name === "snap") {
    return (
      <BreakerSwitch
        label="Main power"
        checked={count > 0}
        onCheckedChange={() => {}}
        size="lg"
      />
    );
  }
  if (name === "glide") {
    const value =
      count === 0 ? "overview" : count === 1 ? "calibration" : "logs";
    return (
      <GantryTabs value={value} onValueChange={() => {}} variant="segmented">
        <GantryTabsList>
          <GantryTabsTrigger value="overview">Overview</GantryTabsTrigger>
          <GantryTabsTrigger value="calibration">Calibration</GantryTabsTrigger>
          <GantryTabsTrigger value="logs">Logs</GantryTabsTrigger>
        </GantryTabsList>
      </GantryTabs>
    );
  }
  if (name === "drift") {
    return <LavaDrift label="Warming the bench" size={56} />;
  }
  void slug;
  return (
    <div
      className="relative h-44 w-[340px]"
      // A containing block, so the toast's fixed stack lands in the card.
      style={{ transform: "scale(0.62)" }}
    >
      <ToastProvider position="bottom-right" portal={false} max={1}>
        <ToastOnCue t={t} />
      </ToastProvider>
    </div>
  );
}

const SLUG: Record<SpringName, string> = {
  flick: "checkbox",
  snap: "breaker-switch",
  glide: "gantry-tabs",
  drift: "lava-drift",
  recoil: "telemetry-toast",
};

function CardFace({
  name,
  t,
  reveal,
}: {
  name: SpringName;
  t: number;
  reveal: number;
}) {
  const entry = useEntry(SLUG[name]);
  return (
    <div
      className="absolute top-0 left-0 flex flex-col"
      style={{
        width: CARD.width,
        height: CARD.height,
        opacity: r2(reveal),
        transform: `translateY(${r2((1 - reveal) * 10)}px)`,
      }}
    >
      <div className="flex h-14 items-center justify-between px-5">
        <Label size={11}>{specimen(entry)}</Label>
        <Label size={11} className="pr-5 text-ink-2">
          {name}
        </Label>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div style={{ transform: "scale(1.28)" }}>
          <Specimen name={name} t={t} slug={entry.name} />
        </div>
      </div>
      <div className="flex h-20 flex-col justify-center gap-1 border-t border-hairline px-5">
        <p className="text-[15px] leading-snug text-ink-2">{entry.tagline}</p>
        <Label size={10}>
          <span className="normal-case">ζ</span> {ZETA(name)} · {ROLE[name]}
        </Label>
      </div>
    </div>
  );
}

function SpringsScene({ t }: SceneProps) {
  // Where the hook left the knob: read once from its still frame.
  const [knob, setKnob] = React.useState({ x: 1738, y: 552, r: 35 });
  React.useLayoutEffect(() => {
    const el = document.querySelector('[data-film="gel"] svg');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The knob's on-centre is 52 of the switch's 72 units in, at mid-height.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKnob({
      x: rect.left + (rect.width * 52) / 72,
      y: rect.top + rect.height / 2,
      r: (rect.height * 14) / 40,
    });
  }, []);

  const dock = spring("glide", t, SPRINGS.start + f(2));
  const headline = spring("snap", t, SPRINGS.start + f(6));
  const headlineOut = ease.exit(span(t, SPRINGS.morph, SPRINGS.morph + f(8)));
  const language = spring("snap", t, SPRINGS.morph + f(6));
  const morphing = t >= SPRINGS.morph;

  return (
    <Layer>
      {/* Behind the hand-off the hook's frame fades, the knob alone kept. */}
      <div
        className="absolute inset-0 bg-background"
        style={{ opacity: r2(span(t, SPRINGS.start, SPRINGS.start + f(8))) }}
      />

      <div className="absolute" style={{ left: 150, top: 132 }}>
        <Display size={150}>
          <MaskLine p={headline} out={headlineOut}>
            Five springs.
          </MaskLine>
        </Display>
      </div>
      <div className="absolute" style={{ left: 150, top: 132 }}>
        <Display size={150}>
          <MaskLine p={language}>One language.</MaskLine>
        </Display>
      </div>

      {ORDER.map((name, i) => {
        const fromMiddle = Math.abs(i - MIDDLE);
        const unfold =
          i === MIDDLE
            ? 1
            : spring(
                "snap",
                t,
                SPRINGS.unfold + fromMiddle * 0.05 + (i < MIDDLE ? 0 : 0.025),
              );
        const rowY = mix(ROW_Y[MIDDLE] ?? 654, ROW_Y[i] ?? 654, unfold);
        const seen = i === MIDDLE ? 1 : Math.min(1, unfold * 4);
        const measured = MEASURED[i];
        const run = spring(name, t, SPRINGS.release);

        // The dot: from the hook's knob onto the middle track, then the race.
        let x = TRACK_X0 + (TRACK_X1 - TRACK_X0) * run;
        let y = rowY;
        let r = 16;
        let shine = 1;
        if (i === MIDDLE && t < SPRINGS.release) {
          x = mix(knob.x, TRACK_X0, dock);
          y = mix(knob.y, rowY, dock);
          r = mix(knob.r, 16, dock);
        }

        // The fold into a card.
        const fold = morphing
          ? spring("glide", t, SPRINGS.morph + i * 0.045)
          : 0;
        const box = {
          left: mix(TRACK_X0, cardX(i), fold),
          top: mix(rowY, CARD.top, fold),
          width: mix(TRACK_X1 - TRACK_X0, CARD.width, fold),
          height: mix(1, CARD.height, fold),
        };
        if (morphing) {
          x = mix(TRACK_X1, cardX(i) + CARD.width - 22, fold);
          y = mix(rowY, CARD.top + 28, fold);
          r = mix(16, 4.5, fold);
          shine = 1 - fold;
        }
        // On the last bar, the five lights blink together: one language.
        const unison =
          1 +
          0.7 *
            Math.sin(Math.PI * span(t, SPRINGS.unison, SPRINGS.unison + 0.2));
        const labelIn = spring("glide", t, SPRINGS.unfold + f(4) + i * 0.04);
        const labelOut = ease.exit(
          span(t, SPRINGS.morph, SPRINGS.morph + f(7)),
        );
        const face = ease.enter(
          span(
            t,
            SPRINGS.morph + f(10) + i * 0.045,
            SPRINGS.morph + f(22) + i * 0.045,
          ),
        );

        // The middle track draws out behind the docking knob.
        const lineLeft =
          i === MIDDLE && t < SPRINGS.release
            ? Math.max(TRACK_X0, x)
            : box.left;
        const lineVisible =
          i === MIDDLE ? x < TRACK_X1 || t >= SPRINGS.release : true;

        return (
          <React.Fragment key={name}>
            {/* Track, then card: one box that folds from a hairline. */}
            {lineVisible && seen > 0 ? (
              <div
                className="absolute"
                style={{
                  left: r2(lineLeft),
                  top: r2(box.top - (fold > 0.02 ? 0 : 1)),
                  width: r2(box.left + box.width - lineLeft),
                  height: r2(Math.max(2, box.height)),
                  border:
                    fold > 0.02
                      ? "1px solid var(--hairline-strong)"
                      : undefined,
                  borderTop:
                    fold > 0.02
                      ? undefined
                      : "2px solid color-mix(in oklab, var(--ink-3) 55%, transparent)",
                  borderRadius: r2(16 * fold),
                  background:
                    fold > 0
                      ? `color-mix(in oklab, var(--bg-1) ${Math.round(fold * 100)}%, transparent)`
                      : undefined,
                  opacity: r2(seen),
                  overflow: "clip",
                }}
              >
                {fold > 0.3 ? (
                  <CardFace name={name} t={t} reveal={face} />
                ) : null}
              </div>
            ) : null}

            {/* Ticks along the track, and the target mark at its end. */}
            {!morphing && seen > 0 ? (
              <div
                className="absolute"
                style={{
                  left: TRACK_X0,
                  top: r2(rowY - 5),
                  width: TRACK_X1 - TRACK_X0,
                  height: 10,
                  opacity: r2(
                    seen * span(t, SPRINGS.unfold, SPRINGS.unfold + f(10)),
                  ),
                }}
              >
                {Array.from({ length: 21 }, (_, k) => (
                  <span
                    key={k}
                    className="absolute top-[1px] h-[8px] w-px"
                    style={{
                      left: (k * (TRACK_X1 - TRACK_X0)) / 20,
                      background:
                        "color-mix(in oklab, var(--ink-3) 40%, transparent)",
                    }}
                  />
                ))}
                <span className="absolute -top-3 right-0 h-[34px] w-[2px] bg-ink-2" />
              </div>
            ) : null}

            {/* Name, damping and role on the left; the measured settle on the right. */}
            {seen > 0 ? (
              <>
                <div
                  className="absolute"
                  style={{ left: 150, top: r2(rowY - 26) }}
                >
                  <MaskLine p={labelIn} out={labelOut}>
                    <span
                      className="block font-mono font-semibold text-ink"
                      style={{ fontSize: 30, lineHeight: 1 }}
                    >
                      {name}
                    </span>
                  </MaskLine>
                  <MaskLine p={labelIn} out={labelOut} className="mt-2">
                    <Label size={13}>
                      <span className="normal-case">ζ</span> {ZETA(name)} ·{" "}
                      {ROLE[name]}
                    </Label>
                  </MaskLine>
                </div>
                <div
                  className="absolute text-right"
                  style={{
                    left: TRACK_X1 + 30,
                    top: r2(rowY - 10),
                    width: 140,
                  }}
                >
                  <MaskLine p={labelIn} out={labelOut}>
                    <Label
                      size={17}
                      className={
                        measured && t >= SPRINGS.release + measured.settle
                          ? "text-signal"
                          : "text-ink-3"
                      }
                    >
                      {SETTLES[name]} ms
                    </Label>
                  </MaskLine>
                </div>
              </>
            ) : null}

            {seen > 0 && (i === MIDDLE || t >= SPRINGS.unfold) ? (
              <Dot x={x} y={y} r={r} shine={shine} scale={unison} />
            ) : null}
          </React.Fragment>
        );
      })}
    </Layer>
  );
}

/** Sound: the dock, the unfold, then each spring's own note as it lands. */
const cues: Cue[] = [
  {
    at: SPRINGS.start + f(15),
    play: () => playTone("detent", { pitch: 1.2, gain: 0.5 }),
  },
  ...[0, 1, 3, 4].map((i) => ({
    at:
      SPRINGS.unfold +
      Math.abs(i - MIDDLE) * 0.05 +
      (i < MIDDLE ? 0 : 0.025) +
      0.06,
    play: () =>
      playTone("tick", {
        pitch: 1 + Math.abs(i - MIDDLE) * 0.12,
        gain: 0.35,
        pan: (i - MIDDLE) * 0.15,
      }),
  })),
  ...MEASURED.map((m) => ({
    at: SPRINGS.release + m.arrive,
    play: () =>
      playTone("note", {
        pitch: semitones(SPRING_NOTE[m.name]),
        gain: 0.55,
        pan: 0.45,
      }),
  })),
  // The folds: a soft clack as the cards close, the components' own beats.
  {
    at: SPRINGS.morph + 0.12,
    play: () => playTone("whoosh", { pitch: 0.8, gain: 0.25 }),
  },
  ...(TRIGGER.flick ?? []).map((at) => ({
    at,
    play: () => playTone("tick", { pitch: 1.1, gain: 0.55, pan: -0.5 }),
  })),
  ...(TRIGGER.snap ?? []).map((at) => ({
    at,
    play: () => playTone("clack", { gain: 0.6, pan: -0.25 }),
  })),
  ...(TRIGGER.glide ?? []).map((at) => ({
    at,
    play: () => playTone("swish", { gain: 0.45, pan: 0 }),
  })),
  ...(TRIGGER.recoil ?? []).map((at) => ({
    at: at + 0.05,
    play: () => playTone("pop", { gain: 0.55, pan: 0.5 }),
  })),
  ...ORDER.map((name, i) => ({
    at: SPRINGS.unison + i * 0.012,
    play: () =>
      playTone("note", {
        pitch: semitones(SPRING_NOTE[name] + 12),
        gain: 0.22,
        pan: (i - 2) * 0.2,
      }),
  })),
];

export const springsShot: Shot = {
  id: "springs",
  from: 128,
  to: 290,
  preroll: 6,
  Scene: SpringsScene,
  cues,
  input: () => PARKED,
};
