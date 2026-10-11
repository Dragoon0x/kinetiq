"use client";

import * as React from "react";

import { X } from "lucide-react";
import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EnvelopeModalPaper = "ivory" | "kraft" | "linen" | "blush";

export type EnvelopeModalSeal = "wax" | "foil" | "string" | "none";

export type EnvelopeModalItem = {
  id: string;
  /** The letter's title: printed on the envelope and heading the letter. */
  title: string;
  /** Who it is from: on the envelope's label and signed at the foot. */
  from?: string;
  /** A date line over the title, as written. */
  date?: string;
  /** The story. A string splits into paragraphs on blank lines. */
  body: React.ReactNode;
  /** The seal's letter. @default the first letter of `from`, else of the title */
  monogram?: string;
};

export type EnvelopeModalProps = {
  /** The letters on the desk. */
  items?: readonly EnvelopeModalItem[];
  /** Controlled: the id of the open letter, or null. */
  value?: string | null;
  /** Initial open letter when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that opens or closes a letter, with its id or null. */
  onValueChange?: (id: string | null) => void;
  /** The paper: envelope, liner and letter, fixed pigments that look the same in both themes. @default "ivory" */
  paperTone?: EnvelopeModalPaper;
  /** How many panels the letter is folded into, 2 to 5. @default 3 */
  foldCount?: number;
  /** What holds the flap shut. @default "wax" */
  seal?: EnvelopeModalSeal;
  /** The seal's colour, any CSS colour. @default per seal: wax red, foil gold, string brown */
  sealColor?: string;
  /** How far the envelopes lie askew on the desk, degrees either way. @default 2.5 */
  tilt?: number;
  /** How far the desk dims behind an open letter, 0 to 1. @default 0.55 */
  scrim?: number;
  /** The open letter's margin inside the box, px. @default 12 */
  inset?: number;
  /** A fixed number of columns. @default 2 under 480 px, 3 above */
  columns?: number;
  /** The letter title's heading level. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** Names the desk for assistive technology. @default "Letters" */
  label?: string;
  /** The close button's name. @default "Close letter" */
  closeLabel?: string;
  /** Seeds the desk's scatter. @default 3 */
  seed?: number;
  /** Play the paper: the flap, the slide, every crease. Off unless asked for. @default false */
  sound?: boolean;
  /** Show the desk but open nothing. @default false */
  disabled?: boolean;
  /** Sizes the box; the desk and the open letter fill it. @default "h-full w-full" */
  className?: string;
};

type Paper = {
  envelope: string;
  shade: string;
  inside: string;
  liner: string;
  letter: string;
  ink: string;
};

const PAPERS: Record<EnvelopeModalPaper, Paper> = {
  ivory: {
    envelope: "oklch(0.945 0.024 86)",
    shade: "oklch(0.86 0.03 80)",
    inside: "oklch(0.8 0.032 78)",
    liner: "oklch(0.6 0.09 252)",
    letter: "oklch(0.985 0.01 90)",
    ink: "oklch(0.27 0.02 60)",
  },
  kraft: {
    envelope: "oklch(0.74 0.072 68)",
    shade: "oklch(0.66 0.072 62)",
    inside: "oklch(0.58 0.066 58)",
    liner: "oklch(0.42 0.06 40)",
    letter: "oklch(0.965 0.02 84)",
    ink: "oklch(0.27 0.025 55)",
  },
  linen: {
    envelope: "oklch(0.9 0.012 240)",
    shade: "oklch(0.82 0.016 240)",
    inside: "oklch(0.74 0.02 240)",
    liner: "oklch(0.55 0.11 24)",
    letter: "oklch(0.978 0.006 240)",
    ink: "oklch(0.26 0.02 250)",
  },
  blush: {
    envelope: "oklch(0.9 0.038 22)",
    shade: "oklch(0.82 0.048 20)",
    inside: "oklch(0.74 0.05 18)",
    liner: "oklch(0.5 0.07 152)",
    letter: "oklch(0.982 0.012 30)",
    ink: "oklch(0.28 0.02 20)",
  },
};

const SEAL_COLOURS: Record<EnvelopeModalSeal, string> = {
  wax: "oklch(0.47 0.15 25)",
  foil: "oklch(0.8 0.11 85)",
  string: "oklch(0.44 0.07 40)",
  none: "transparent",
};

const MAX_FOLDS = 5;
/** The envelope's drawing space: 3:2. */
const VW = 300;
const VH = 200;
/** Where the side flaps meet, and the bottom flap's point, down the envelope. */
const SIDE_V = 110;
const BOTTOM_V = 94;
/** Where the flap's point reaches down the envelope. */
const FLAP = 118;
/** The folded letter in the pocket: its width as a share of the envelope's, and its rest below the top edge. */
const LETTER_W = 0.84;
const LETTER_TOP = 0.12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A wax disc's edge: a circle pushed in and out where the wax ran, as a closed path. */
function waxPath(cx: number, cy: number, r: number, seed: number): string {
  const n = 14;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const wobble = 1 + (((seed >>> (i % 24)) & 7) / 7 - 0.5) * 0.18;
    pts.push([cx + Math.cos(a) * r * wobble, cy + Math.sin(a) * r * wobble]);
  }
  const mid = (p: [number, number], q: [number, number]) =>
    `${r2((p[0] + q[0]) / 2)} ${r2((p[1] + q[1]) / 2)}`;
  const last = pts[n - 1] as [number, number];
  const first = pts[0] as [number, number];
  let d = `M ${mid(last, first)}`;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i] as [number, number];
    const q = pts[(i + 1) % n] as [number, number];
    d += ` Q ${r2(p[0])} ${r2(p[1])} ${mid(p, q)}`;
  }
  return `${d} Z`;
}

/** A foil sticker's scalloped edge. */
function scallopPath(cx: number, cy: number, r: number): string {
  const n = 18;
  let d = "";
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const x = r2(cx + Math.cos(a) * r);
    const y = r2(cy + Math.sin(a) * r);
    if (i === 0) d = `M ${x} ${y}`;
    else {
      const m = a - Math.PI / n;
      d += ` Q ${r2(cx + Math.cos(m) * r * 1.13)} ${r2(cy + Math.sin(m) * r * 1.13)} ${x} ${y}`;
    }
  }
  return `${d} Z`;
}

export const defaultEnvelopeModalItems: readonly EnvelopeModalItem[] = [
  {
    id: "marsh",
    title: "Notes from the salt marsh",
    from: "Ines Varga",
    date: "3 October",
    body: "We walked out at low tide, when the creeks drain and the mud shines like a road. The samphire has turned red at the tips and the geese were already in, a few hundred of them grazing the far bank.\n\nBring boots that you do not love. The last stretch to the sea wall is softer than it looks, and the tide comes back faster than anyone believes.",
  },
  {
    id: "orchard",
    title: "The orchard in October",
    from: "Tomas Reyne",
    date: "11 October",
    body: "The last of the pears came down this week. We pick them hard and let them ripen in the barn, in crates lined with newspaper, turning them every other day.\n\nIf you visit, come in the morning. The light runs along the rows then, and the wasps are still too cold to care about you.",
  },
  {
    id: "map",
    title: "A map for the long walk",
    from: "Fieldline maps",
    date: "14 October",
    body: "Enclosed: the long walk, eleven miles from the station to the lighthouse, drawn by hand and corrected twice by people who got lost.\n\nThe stiles after the second farm are new. The café at the halfway point closes at three, which is earlier than the sign says.",
  },
  {
    id: "nets",
    title: "On mending nets",
    from: "Ada Kerrow",
    date: "19 October",
    body: "Every net in the harbour has been mended more times than it has been used. My grandfather could do a square in the time it took to light his pipe.\n\nI still can't. But the knot is the same one, and it holds.",
  },
  {
    id: "tide",
    title: "What the tide left",
    from: "Coldbrook beach watch",
    date: "24 October",
    body: "After the storm: two crates of oranges, a ship's fender, a child's boot, a great deal of rope and one very surprised seal, who has since gone home.\n\nThe oranges were fine. We made marmalade.",
  },
  {
    id: "reading",
    title: "Winter reading list",
    from: "The Fieldline desk",
    date: "30 October",
    body: "Six books for the short days: two about weather, one about walls, one about a river, one about a man who counted birds for forty years, and one we will not tell you about.\n\nAll six are on the shelf by the door. Take one, leave one.",
  },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Body({ body }: { body: React.ReactNode }) {
  if (typeof body !== "string") return <>{body}</>;
  return (
    <>
      {body
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className={i > 0 ? "mt-3" : undefined}>
            {p.trim()}
          </p>
        ))}
    </>
  );
}

type LetterProps = {
  item: EnvelopeModalItem;
  paper: Paper;
  folds: number;
  headingLevel: 2 | 3 | 4;
  titleId?: string;
  closeLabel: string;
  /** The real letter: a live close button and a scrolling body. A copy is drawn only. */
  live: boolean;
  bindClose?: (node: HTMLButtonElement | null) => void;
  onClose?: () => void;
};

/** The letter's page, laid out the same whether it is the real one or a folded copy. */
function LetterPage({
  item,
  paper,
  folds,
  headingLevel,
  titleId,
  closeLabel,
  live,
  bindClose,
  onClose,
}: LetterProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div
      className="@container relative h-full w-full"
      style={{ background: paper.letter, color: paper.ink }}
    >
      {/* The creases stay in the paper after it is unfolded. */}
      {Array.from({ length: folds - 1 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{
            top: `${r2(((i + 1) / folds) * 100)}%`,
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklab, black 9%, transparent) 12%, color-mix(in oklab, black 9%, transparent) 88%, transparent)",
          }}
        />
      ))}
      <div
        className={cn(
          "absolute inset-0 flex flex-col gap-4 p-6 @[480px]:p-10",
          live
            ? "[scrollbar-width:thin] overflow-y-auto overscroll-contain"
            : "overflow-hidden",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase opacity-60">
              {[item.date, item.from].filter(Boolean).join(" · ")}
            </p>
            <Heading
              id={titleId}
              className="mt-1.5 text-xl leading-tight font-medium tracking-tight text-balance @[480px]:text-2xl"
            >
              {item.title}
            </Heading>
          </div>
          {live ? (
            <button
              ref={bindClose}
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none hover:bg-[color-mix(in_oklab,currentColor_8%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : (
            <span className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center">
              <X aria-hidden className="size-4" />
            </span>
          )}
        </div>
        <div className="max-w-prose text-sm leading-relaxed @[480px]:text-[15px]">
          <Body body={item.body} />
        </div>
        {item.from ? (
          <p className="text-sm italic opacity-75">— {item.from}</p>
        ) : null}
      </div>
    </div>
  );
}

/** One panel of the folded sheet and, nested in it, every panel below it. */
function Panel({
  k,
  count,
  height,
  folds,
  paper,
  children,
}: {
  k: number;
  count: number;
  height: number;
  folds: MotionValue<number>[];
  paper: Paper;
  children: React.ReactNode;
}) {
  const u = folds[k] as MotionValue<number>;
  // A zigzag: each panel folds the other way from the one above it.
  const sign = k % 2 === 1 ? -1 : 1;
  const rotateX = useTransform(u, (v) =>
    k === 0 ? 0 : r2(sign * (1 - clamp(v, 0, 1.2)) * 178),
  );
  // A panel darkens as it turns edge-on to the light.
  const shade = useTransform(u, (v) =>
    k === 0 ? 0 : r2(Math.abs(Math.sin((1 - clamp(v, 0, 1)) * Math.PI)) * 0.32),
  );
  return (
    <motion.div
      className="absolute inset-x-0"
      style={{
        top: k === 0 ? 0 : height,
        height,
        rotateX,
        originY: 0,
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
        style={{ background: paper.letter }}
      >
        <div
          className="absolute inset-x-0"
          style={{ top: -k * height, height: height * count }}
        >
          {children}
        </div>
        <motion.span
          aria-hidden
          className="absolute inset-0 bg-black"
          style={{ opacity: shade }}
        />
      </div>
      <motion.div
        className="absolute inset-0 [backface-visibility:hidden]"
        style={{
          rotateX: 180,
          background: `color-mix(in oklab, ${paper.letter} 90%, black)`,
        }}
      />
      {k + 1 < count ? (
        <Panel
          k={k + 1}
          count={count}
          height={height}
          folds={folds}
          paper={paper}
        >
          {children}
        </Panel>
      ) : null}
    </motion.div>
  );
}

type Motion = {
  flap: MotionValue<number>;
  slide: MotionValue<number>;
  press: MotionValue<number>;
  thread: MotionValue<number>;
};

type EnvelopeProps = {
  item: EnvelopeModalItem;
  paper: Paper;
  seal: EnvelopeModalSeal;
  sealColor: string;
  angle: number;
  folds: number;
  ratio: number;
  active: boolean;
  shown: boolean;
  motionSafe: boolean;
  disabled: boolean;
  values: Motion | null;
  bind: (node: HTMLButtonElement | null) => void;
  bindLetter: (node: HTMLDivElement | null) => void;
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

/** An envelope seen from the back: pocket, flap, seal, and the folded letter inside. */
function Envelope({
  item,
  paper,
  seal,
  sealColor,
  angle,
  folds,
  ratio,
  active,
  shown,
  motionSafe,
  disabled,
  values,
  bind,
  bindLetter,
  onOpen,
}: EnvelopeProps) {
  const uid = React.useId();
  const [near, setNear] = React.useState(false);
  const idle = useMotionValue(0);
  const flap = values?.flap ?? idle;
  const slide = values?.slide ?? idle;
  const press = values?.press ?? idle;
  const thread = values?.thread ?? idle;
  const lifted = near || active;

  const lift = useMotionValue(0);
  const turn = useMotionValue(angle);
  React.useEffect(() => {
    const run = [
      animate(
        lift,
        lifted ? -4 : 0,
        motionSafe ? springs.snap : { duration: 0 },
      ),
      animate(
        turn,
        lifted ? 0 : angle,
        motionSafe ? springs.snap : { duration: 0 },
      ),
    ];
    return () => {
      for (const c of run) c.stop();
    };
  }, [lifted, angle, motionSafe, lift, turn]);

  const flapRotate = useTransform(flap, (a) => r2(-a));
  // Past edge-on the flap drops behind the letter.
  const flapZ = useTransform(flap, (a) => (a > 90 ? 0 : 3));
  const outerOpacity = useTransform(flap, (a) => (a > 90 ? 0 : 1));
  const linerOpacity = useTransform(flap, (a) => (a > 90 ? 1 : 0));
  const sealScale = useTransform(press, (p) => r2(1 + p));
  const threadOpacity = useTransform(thread, (t) => r2(1 - clamp(t, 0, 1)));
  const letterY = useTransform(slide, (s) => `${r2(s)}px`);
  const shadow = useTransform(
    lift,
    (l) =>
      `0 ${r2(4 - l * 1.5)}px ${r2(10 - l * 2.5)}px color-mix(in oklab, black ${Math.round(18 - l)}%, transparent)`,
  );

  const monogram = (item.monogram ?? item.from ?? item.title)
    .charAt(0)
    .toUpperCase();
  const seedOf = hash(item.id);
  const tipY = FLAP - 10;
  const flapPoints = `0,0 ${VW},0 ${VW / 2},${FLAP}`;

  return (
    <motion.li
      className="relative list-none"
      style={{ y: lift, rotate: turn, zIndex: active ? 5 : near ? 2 : 1 }}
    >
      <button
        ref={bind}
        type="button"
        aria-haspopup="dialog"
        aria-label={`Open letter: ${item.title}${item.from ? `, from ${item.from}` : ""}`}
        disabled={disabled}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setNear(true);
        }}
        onPointerLeave={() => setNear(false)}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setNear(true);
        }}
        onBlur={() => setNear(false)}
        onClick={onOpen}
        className={cn(
          "relative block aspect-[3/2] w-full rounded-2 text-left outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
          "active:scale-[0.985] disabled:cursor-not-allowed",
          disabled ? "" : "cursor-pointer",
        )}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2"
          style={{ boxShadow: shadow }}
        />
        {/* The inside of the envelope, seen through its mouth. */}
        <span
          aria-hidden
          className="absolute inset-0 overflow-hidden rounded-2"
          style={{ background: paper.inside }}
        />
        {/* The folded letter in the pocket. */}
        <motion.div
          ref={bindLetter}
          aria-hidden
          className="absolute left-1/2 overflow-hidden rounded-[1px] shadow-[0_1px_2px_color-mix(in_oklab,black_18%,transparent)]"
          style={{
            top: `${LETTER_TOP * 100}%`,
            width: `${LETTER_W * 100}%`,
            x: "-50%",
            y: letterY,
            aspectRatio: `${r2(ratio * folds)} / 1`,
            background: paper.letter,
            visibility: shown ? "visible" : "hidden",
            zIndex: 1,
          }}
        >
          <span
            className="absolute inset-x-[8%] top-[22%] h-[9%] rounded-full opacity-30"
            style={{ background: paper.ink }}
          />
          <span
            className="absolute inset-x-[8%] top-[44%] right-[30%] h-[6%] rounded-full opacity-15"
            style={{ background: paper.ink }}
          />
          <span
            className="absolute inset-x-[8%] top-[60%] right-[18%] h-[6%] rounded-full opacity-15"
            style={{ background: paper.ink }}
          />
        </motion.div>
        {/* The pocket: side and bottom flaps over the letter. */}
        <svg
          aria-hidden
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          style={{ zIndex: 2 }}
        >
          <defs>
            <linearGradient id={`${uid}-bottom`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: paper.envelope }} />
              <stop
                offset="1"
                style={{
                  stopColor: `color-mix(in oklab, ${paper.envelope} 92%, black)`,
                }}
              />
            </linearGradient>
          </defs>
          <path
            d={`M0 0 L${VW / 2} ${SIDE_V} L0 ${VH} Z`}
            style={{
              fill: `color-mix(in oklab, ${paper.envelope} 96%, black)`,
            }}
          />
          <path
            d={`M${VW} 0 L${VW / 2} ${SIDE_V} L${VW} ${VH} Z`}
            style={{
              fill: `color-mix(in oklab, ${paper.envelope} 96%, black)`,
            }}
          />
          <path
            d={`M0 ${VH} L${VW / 2} ${BOTTOM_V} L${VW} ${VH} Z`}
            fill={`url(#${uid}-bottom)`}
          />
          <path
            d={`M0 ${VH} L${VW / 2} ${BOTTOM_V} L${VW} ${VH} M0 0 L${VW / 2} ${SIDE_V} L${VW} 0`}
            fill="none"
            style={{ stroke: paper.shade }}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          {seal === "string" ? (
            <>
              <circle
                cx={VW / 2}
                cy={tipY + 34}
                r={9}
                style={{
                  fill: paper.shade,
                  stroke: `color-mix(in oklab, ${paper.shade} 80%, black)`,
                }}
                strokeWidth={1}
              />
              <motion.path
                d={`M${VW / 2} ${tipY} C ${VW / 2 + 22} ${tipY + 8}, ${VW / 2 - 22} ${tipY + 26}, ${VW / 2} ${tipY + 34} C ${VW / 2 + 20} ${tipY + 40}, ${VW / 2 - 24} ${tipY + 18}, ${VW / 2} ${tipY}`}
                fill="none"
                style={{ stroke: sealColor, opacity: threadOpacity }}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </>
          ) : null}
        </svg>
        {/* The label printed on the pocket. */}
        <span
          aria-hidden
          className="absolute right-[8%] bottom-[9%] left-[8%] flex flex-col gap-0.5"
          style={{ color: paper.ink, zIndex: 2 }}
        >
          <span className="hidden truncate font-mono text-[9px] tracking-[0.12em] uppercase opacity-60 @[480px]:block">
            {item.from ?? " "}
          </span>
          <span className="truncate text-[12px] leading-tight font-medium @[480px]:text-[13px]">
            {item.title}
          </span>
        </span>
        {/* The flap, hinged at the top edge. */}
        <motion.span
          aria-hidden
          className="absolute inset-x-0 top-0 block"
          style={{
            height: `${(FLAP / VH) * 100}%`,
            rotateX: flapRotate,
            transformPerspective: 700,
            originY: 0,
            zIndex: flapZ,
          }}
        >
          <motion.svg
            viewBox={`0 0 ${VW} ${FLAP}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            style={{ opacity: outerOpacity }}
          >
            <defs>
              <linearGradient id={`${uid}-flap`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: paper.envelope }} />
                <stop
                  offset="1"
                  style={{
                    stopColor: `color-mix(in oklab, ${paper.envelope} 94%, black)`,
                  }}
                />
              </linearGradient>
            </defs>
            <polygon points={flapPoints} fill={`url(#${uid}-flap)`} />
            <polyline
              points={`0,0 ${VW / 2},${FLAP} ${VW},0`}
              fill="none"
              style={{ stroke: paper.shade }}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
          </motion.svg>
          <motion.svg
            viewBox={`0 0 ${VW} ${FLAP}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            style={{ opacity: linerOpacity }}
          >
            <defs>
              <pattern
                id={`${uid}-liner`}
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(35)"
              >
                <rect width="10" height="10" style={{ fill: paper.inside }} />
                <rect
                  width="4"
                  height="10"
                  style={{ fill: paper.liner }}
                  opacity={0.55}
                />
              </pattern>
            </defs>
            <polygon points={flapPoints} fill={`url(#${uid}-liner)`} />
          </motion.svg>
          {seal !== "none" ? (
            <motion.svg
              viewBox={`0 0 ${VW} ${FLAP}`}
              preserveAspectRatio="xMidYMax meet"
              className="absolute inset-0 size-full overflow-visible"
              style={{ opacity: outerOpacity }}
            >
              <motion.g
                style={{ scale: sealScale, originX: 0.5, originY: 0.5 }}
              >
                {seal === "wax" ? (
                  <>
                    <path
                      d={waxPath(VW / 2, tipY, 20, seedOf)}
                      style={{ fill: sealColor }}
                    />
                    <circle
                      cx={VW / 2}
                      cy={tipY}
                      r={13}
                      fill="none"
                      style={{
                        stroke: `color-mix(in oklab, ${sealColor} 70%, black)`,
                      }}
                      strokeWidth={1.4}
                    />
                    <text
                      x={VW / 2 + 0.8}
                      y={tipY + 6.3}
                      textAnchor="middle"
                      fontSize={17}
                      fontWeight={600}
                      style={{
                        fill: `color-mix(in oklab, ${sealColor} 80%, white)`,
                      }}
                      opacity={0.35}
                    >
                      {monogram}
                    </text>
                    <text
                      x={VW / 2}
                      y={tipY + 5.5}
                      textAnchor="middle"
                      fontSize={17}
                      fontWeight={600}
                      style={{
                        fill: `color-mix(in oklab, ${sealColor} 62%, black)`,
                      }}
                    >
                      {monogram}
                    </text>
                  </>
                ) : seal === "foil" ? (
                  <>
                    <defs>
                      <linearGradient
                        id={`${uid}-foil`}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                      >
                        <stop
                          offset="0"
                          style={{
                            stopColor: `color-mix(in oklab, ${sealColor} 70%, white)`,
                          }}
                        />
                        <stop offset="0.5" style={{ stopColor: sealColor }} />
                        <stop
                          offset="1"
                          style={{
                            stopColor: `color-mix(in oklab, ${sealColor} 75%, black)`,
                          }}
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d={scallopPath(VW / 2, tipY, 18)}
                      fill={`url(#${uid}-foil)`}
                    />
                    <circle
                      cx={VW / 2}
                      cy={tipY}
                      r={12.5}
                      fill="none"
                      style={{
                        stroke: `color-mix(in oklab, ${sealColor} 70%, black)`,
                      }}
                      strokeWidth={0.8}
                      strokeDasharray="1.5 2"
                    />
                    <text
                      x={VW / 2}
                      y={tipY + 5}
                      textAnchor="middle"
                      fontSize={14}
                      fontWeight={600}
                      style={{
                        fill: `color-mix(in oklab, ${sealColor} 50%, black)`,
                      }}
                    >
                      {monogram}
                    </text>
                  </>
                ) : (
                  <circle
                    cx={VW / 2}
                    cy={tipY}
                    r={9}
                    style={{
                      fill: paper.shade,
                      stroke: `color-mix(in oklab, ${paper.shade} 80%, black)`,
                    }}
                    strokeWidth={1}
                  />
                )}
              </motion.g>
            </motion.svg>
          ) : null}
        </motion.span>
      </button>
    </motion.li>
  );
}

type Phase = "idle" | "opening" | "open" | "closing";

/**
 * A desk of envelopes, each closed with a seal, that open like letters into
 * the full story. Opening one is three beats: the seal gives and the flap
 * swings up about its hinge in perspective on the snap spring, its patterned
 * liner showing as it turns; the folded letter slides up out of the pocket on
 * glide; then it flies to the middle and grows to fill the component's box as
 * the modal, its panels unfolding one after another on glide in a cascade,
 * each darkening as it turns edge-on. On the last crease the folded copy
 * gives way to the real letter, which scrolls, and focus moves into it.
 * Closing refolds it, carries it back over its envelope, slides it into the
 * pocket, and the flap closes on snap with the seal pressed back down.
 *
 * The desk is a list of envelope buttons; the open letter is a modal dialog
 * labelled by its title, with focus kept inside it and Escape to close, after
 * which focus returns to its envelope. Under reduced motion the letter fades
 * in whole over the dimmed desk and fades out again.
 */
export function EnvelopeModal({
  items = defaultEnvelopeModalItems,
  value,
  defaultValue = null,
  onValueChange,
  paperTone = "ivory",
  foldCount = 3,
  seal = "wax",
  sealColor,
  tilt = 2.5,
  scrim = 0.55,
  inset = 12,
  columns,
  headingLevel = 3,
  label = "Letters",
  closeLabel = "Close letter",
  seed = 3,
  sound = false,
  disabled = false,
  className,
}: EnvelopeModalProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const paper = PAPERS[paperTone] ?? PAPERS.ivory;
  const folds = clamp(Math.round(foldCount), 2, MAX_FOLDS);
  const sealTint = sealColor ?? SEAL_COLOURS[seal] ?? SEAL_COLOURS.wax;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const open = value !== undefined ? value : own;
  const openItem =
    open === null ? undefined : items.find((it) => it.id === open);

  // The letter on show, and where its story is: it stays while it closes.
  const [active, setActive] = React.useState<string | null>(
    openItem ? open : null,
  );
  const [phase, setPhase] = React.useState<Phase>(openItem ? "open" : "idle");
  const [seen, setSeen] = React.useState<string | null>(openItem ? open : null);
  const [handed, setHanded] = React.useState(Boolean(openItem));
  if (seen !== (openItem ? open : null)) {
    const next = openItem ? open : null;
    setSeen(next);
    if (next !== null) {
      setActive(next);
      setPhase(motionSafe ? "opening" : "open");
      setHanded(!motionSafe);
    } else if (active !== null) {
      setPhase("closing");
    }
  }

  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const envNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const letterNodes = React.useRef(new Map<string, HTMLDivElement>());
  const visitor = React.useRef(false);
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );

  const flap = useMotionValue(openItem ? 180 : 0);
  const slide = useMotionValue(0);
  const press = useMotionValue(0);
  const thread = useMotionValue(openItem ? 1 : 0);
  const sheetX = useMotionValue(inset);
  const sheetY = useMotionValue(inset);
  const sheetScale = useMotionValue(1);
  const sheetOpacity = useMotionValue(openItem ? 1 : 0);
  const dim = useMotionValue(openItem ? 1 : 0);
  const [unfold] = React.useState(() =>
    Array.from({ length: MAX_FOLDS }, () => motionValue(openItem ? 1 : 0)),
  );
  const envValues = React.useMemo<Motion>(
    () => ({ flap, slide, press, thread }),
    [flap, slide, press, thread],
  );

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setBox({
        w: Math.round(node.clientWidth),
        h: Math.round(node.clientHeight),
      });
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const mw = Math.max(1, box.w - 2 * inset);
  const mh = Math.max(1, box.h - 2 * inset);
  const ph = mh / folds;
  const ratio = mw / Math.max(1, mh);

  const request = (next: string | null) => {
    if (disabled || next === open) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  // The sequences. Every timer and spring is stopped by the cleanup; a re-run
  // carries on from wherever the values are.
  const latest = React.useRef({ audio, ph, mw, mh, inset, folds, scrim });
  React.useEffect(() => {
    latest.current = { audio, ph, mw, mh, inset, folds, scrim };
  });

  React.useEffect(() => {
    if (!active) return;
    const running: AnimationPlaybackControls[] = [];
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const L = latest.current;
    const hear = visitor.current;
    const play = (tone: "paper" | "swish", pitch: number, gain: number) => {
      if (hear) L.audio.play(tone, { pitch, gain });
    };
    const unsubscribe: (() => void)[] = [];
    const stop = () => {
      for (const c of running) c.stop();
      for (const t of timers) window.clearTimeout(t);
      for (const off of unsubscribe) off();
    };
    const n = L.folds;
    const step = cascade(n);
    const root = rootRef.current;
    const letter = letterNodes.current.get(active);
    const env = envNodes.current.get(active);
    const foldedY = L.inset + (L.mh - L.ph) / 2;

    if (!motionSafe) {
      if (phase === "open") {
        flap.jump(180);
        for (const u of unfold) u.jump(1);
        sheetX.jump(L.inset);
        sheetY.jump(L.inset);
        sheetScale.jump(1);
        running.push(
          animate(sheetOpacity, 1, {
            duration: durations.base,
            ease: easings.enter,
          }),
          animate(dim, 1, { duration: durations.base, ease: easings.enter }),
        );
      } else if (phase === "closing") {
        if (env?.isConnected) env.focus({ preventScroll: true });
        running.push(
          animate(dim, 0, { duration: durations.fast, ease: easings.exit }),
          animate(sheetOpacity, 0, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: () => {
              flap.jump(0);
              visitor.current = false;
              setPhase("idle");
              setActive(null);
              setHanded(false);
            },
          }),
        );
      }
      return stop;
    }

    if (phase === "opening" && root && letter && env) {
      if (!handed) {
        // Beat one: the seal gives, the flap swings up.
        play("paper", 1.1, 0.5);
        running.push(
          animate(thread, 1, { duration: durations.fast, ease: easings.exit }),
          animate(press, 0.08, springs.flick),
          animate(flap, 180, { ...springs.snap, delay: 0.06 }),
        );
        // Beat two: the letter slides out of the pocket.
        // A fresh opening starts from a closed envelope.
        if (flap.get() > 90) {
          flap.jump(0);
          slide.jump(0);
        }
        const out = -(LETTER_TOP * env.offsetHeight + letter.offsetHeight + 6);
        // Beat three: once the letter is nine-tenths out, the sheet takes its
        // place exactly — the glide's long tail is not worth waiting for —
        // then flies and grows.
        let passed = false;
        const handoff = () => {
          if (passed) return;
          passed = true;
          const lb = letter.getBoundingClientRect();
          const rb = root.getBoundingClientRect();
          sheetX.jump(r2(lb.left - rb.left - root.clientLeft));
          sheetY.jump(r2(lb.top - rb.top - root.clientTop));
          sheetScale.jump(r2(lb.width / L.mw));
          sheetOpacity.jump(1);
          for (const u of unfold) u.jump(0);
          setHanded(true);
        };
        unsubscribe.push(
          slide.on("change", (v) => {
            if (v <= out * 0.9) handoff();
          }),
        );
        later(170, () => {
          play("swish", 1.2, 0.35);
          running.push(
            animate(slide, out, {
              ...springs.glide,
              onComplete: handoff,
            }),
          );
        });
        return stop;
      }
      running.push(
        animate(dim, 1, { duration: durations.slow, ease: easings.enter }),
        animate(sheetX, L.inset, springs.glide),
        animate(sheetY, foldedY, springs.glide),
        animate(sheetScale, 1, springs.glide),
        animate(press, 0, springs.flick),
      );
      const start = 0.16;
      let done = 0;
      for (let k = 1; k < n; k += 1) {
        const delay = start + (k - 1) * Math.max(step, 0.09);
        later(Math.round(delay * 1000), () =>
          play("paper", 0.9 + k * 0.1, 0.4),
        );
        running.push(
          animate(unfold[k] as MotionValue<number>, 1, {
            ...springs.glide,
            delay,
            onComplete: () => {
              done += 1;
              if (done >= n - 1) setPhase("open");
            },
          }),
        );
      }
      running.push(
        animate(sheetY, L.inset, {
          ...springs.glide,
          delay: start + (n - 2) * Math.max(step, 0.09) * 0.5,
        }),
      );
      return stop;
    }

    if (phase === "open") {
      // The visitor's opening has been heard; a later change from the host
      // stays silent unless the visitor asks again.
      visitor.current = false;
      // Settled; nothing runs. A remount lands everything where it belongs.
      sheetX.jump(L.inset);
      sheetY.jump(L.inset);
      sheetScale.jump(1);
      sheetOpacity.jump(1);
      dim.jump(1);
      flap.jump(180);
      for (const u of unfold) u.jump(1);
      return stop;
    }

    if (phase === "closing" && root && letter && env) {
      if (env.isConnected && !env.contains(document.activeElement)) {
        env.focus({ preventScroll: true });
      }
      if (handed) {
        // Fold the panels back up, last first.
        let left = n - 1;
        for (let k = n - 1; k >= 1; k -= 1) {
          const delay = (n - 1 - k) * Math.max(step, 0.08);
          later(Math.round(delay * 1000), () =>
            play("paper", 0.8 + k * 0.08, 0.35),
          );
          running.push(
            animate(unfold[k] as MotionValue<number>, 0, {
              ...springs.glide,
              delay,
              onComplete: () => {
                left -= 1;
                if (left > 0) return;
                // Back over the envelope, to where the letter left it.
                const lb = letter.getBoundingClientRect();
                const rb = root.getBoundingClientRect();
                running.push(
                  animate(dim, 0, {
                    duration: durations.slow,
                    ease: easings.exit,
                  }),
                  animate(
                    sheetX,
                    r2(lb.left - rb.left - root.clientLeft),
                    springs.glide,
                  ),
                  animate(sheetScale, r2(lb.width / L.mw), springs.glide),
                  animate(sheetY, r2(lb.top - rb.top - root.clientTop), {
                    ...springs.glide,
                    onComplete: () => setHanded(false),
                  }),
                );
              },
            }),
          );
        }
        running.push(animate(sheetY, foldedY, springs.glide));
        return stop;
      }
      // In the pocket again: the letter slides down, the flap closes, the seal is pressed.
      sheetOpacity.jump(0);
      play("swish", 0.85, 0.3);
      running.push(animate(slide, 0, springs.glide));
      later(220, () => {
        play("paper", 0.8, 0.45);
        running.push(
          animate(flap, 0, {
            ...springs.snap,
            onComplete: () => {
              running.push(
                animate(thread, 0, {
                  duration: durations.base,
                  ease: easings.enter,
                }),
              );
              // The seal's press lands, then the envelope goes back to the desk.
              later(380, () => {
                visitor.current = false;
                setPhase("idle");
                setActive(null);
              });
            },
          }),
        );
        running.push(
          animate(press, [0.12, 0], { ...springs.recoil, delay: 0.24 }),
        );
      });
      return stop;
    }

    return stop;
  }, [
    phase,
    active,
    handed,
    motionSafe,
    flap,
    slide,
    press,
    thread,
    sheetX,
    sheetY,
    sheetScale,
    sheetOpacity,
    dim,
    unfold,
  ]);

  // Focus goes into the letter when the real one arrives.
  React.useEffect(() => {
    if (phase === "open" && closeNode) closeNode.focus({ preventScroll: true });
  }, [phase, closeNode]);

  const activeItem =
    active === null ? undefined : items.find((it) => it.id === active);
  const titleId = `${uid}-title`;
  const scrimOpacity = useTransform(dim, (d) =>
    r2(clamp(d, 0, 1) * clamp(scrim, 0, 1)),
  );
  const flat = phase === "open" && handed;
  const sheetVisible = Boolean(activeItem) && handed && box.w > 0;

  const close = () => {
    visitor.current = true;
    request(null);
  };

  const onDialogKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const cols = columns ? clamp(Math.round(columns), 1, 6) : undefined;

  return (
    <div
      ref={bindRoot}
      onKeyDown={(event) => {
        // An opening letter can be sent back before it arrives.
        if (event.key === "Escape" && phase === "opening") {
          event.preventDefault();
          close();
        }
      }}
      className={cn(
        "@container relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div
        inert={phase === "open"}
        className="absolute inset-0 overflow-y-auto overscroll-contain"
      >
        <div className="flex [min-height:100%] items-center-safe justify-center-safe px-5 py-8">
          <ul
            aria-label={label}
            className={cn(
              "grid w-full max-w-3xl gap-x-4 gap-y-6",
              !cols &&
                "grid-cols-2 @[480px]:grid-cols-3 @[480px]:gap-x-6 @[480px]:gap-y-8",
            )}
            style={
              cols
                ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {items.map((item) => {
              const isActive = item.id === active;
              const rand = hash(`${item.id}:${seed}`);
              const angle = r2(
                (((rand % 1000) / 1000) * 2 - 1) * clamp(tilt, 0, 12),
              );
              return (
                <Envelope
                  key={item.id}
                  item={item}
                  paper={paper}
                  seal={seal}
                  sealColor={sealTint}
                  angle={angle}
                  folds={folds}
                  ratio={ratio}
                  active={isActive}
                  shown={!(isActive && handed)}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  values={isActive ? envValues : null}
                  bind={(node) => {
                    if (node) envNodes.current.set(item.id, node);
                    else envNodes.current.delete(item.id);
                  }}
                  bindLetter={(node) => {
                    if (node) letterNodes.current.set(item.id, node);
                    else letterNodes.current.delete(item.id);
                  }}
                  onOpen={() => {
                    if (phase !== "idle" || disabled) return;
                    visitor.current = true;
                    request(item.id);
                  }}
                />
              );
            })}
          </ul>
        </div>
      </div>

      {activeItem ? (
        <motion.div
          aria-hidden
          onClick={phase === "open" ? close : undefined}
          className="absolute inset-0 z-20 backdrop-blur-[2px]"
          style={{
            opacity: scrimOpacity,
            background: "color-mix(in oklab, var(--background) 70%, black)",
          }}
        />
      ) : null}

      {sheetVisible && activeItem ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={onDialogKey}
          className="absolute top-0 left-0 z-30"
          style={{
            width: mw,
            height: mh,
            x: sheetX,
            y: sheetY,
            scale: sheetScale,
            opacity: sheetOpacity,
            originX: 0,
            originY: 0,
          }}
        >
          {flat || !motionSafe ? (
            <div className="h-full w-full overflow-hidden rounded-[2px] shadow-[0_24px_60px_-20px_color-mix(in_oklab,black_55%,transparent)]">
              <LetterPage
                item={activeItem}
                paper={paper}
                folds={folds}
                headingLevel={headingLevel}
                titleId={titleId}
                closeLabel={closeLabel}
                live
                bindClose={setCloseNode}
                onClose={close}
              />
            </div>
          ) : (
            <div
              aria-hidden
              className="relative h-full w-full"
              style={{ perspective: 1800 }}
            >
              <span id={titleId} className="sr-only">
                {activeItem.title}
              </span>
              <div
                className="relative w-full shadow-[0_18px_40px_-18px_color-mix(in_oklab,black_50%,transparent)]"
                style={{ height: ph, transformStyle: "preserve-3d" }}
              >
                <Panel
                  k={0}
                  count={folds}
                  height={ph}
                  folds={unfold}
                  paper={paper}
                >
                  <div style={{ width: mw, height: mh }}>
                    <LetterPage
                      item={activeItem}
                      paper={paper}
                      folds={folds}
                      headingLevel={headingLevel}
                      closeLabel={closeLabel}
                      live={false}
                    />
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}
