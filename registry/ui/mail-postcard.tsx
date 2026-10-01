"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MailPostcardSide = "front" | "back";
export type MailPostcardStamp = "round" | "wave";
export type MailPostcardPaper = "cream" | "white" | "kraft";

export type MailPostcardAddress = {
  /** The first line of the address. Also names the card. */
  name: string;
  /** The rest of the address, one entry per ruled line (two fit). */
  lines: string[];
};

export type MailPostcardProps = {
  /** What is written on the back. A postcard's worth: about 160 characters. */
  message: string;
  to: MailPostcardAddress;
  /** Signed under the message. */
  from?: string;
  /** The town on the postmark. */
  place: string;
  /** The date on the postmark, e.g. "07 Oct 26". */
  date: string;
  /** The picture side: an image or an illustration that fills it. */
  picture?: React.ReactNode;
  /** Printed on the picture side, e.g. "Greetings from Fernhill". */
  caption?: string;
  /** Controlled: which side faces up. */
  side?: MailPostcardSide;
  /** Initial side when uncontrolled. @default "front" */
  defaultSide?: MailPostcardSide;
  /** Fires from the swipe, tap or button that turned the card. */
  onSideChange?: (side: MailPostcardSide) => void;
  /** Controlled: whether the card has been posted. */
  sent?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultSent?: boolean;
  /** Fires from the Send press, with true. Set false to bring a card back. */
  onSentChange?: (sent: boolean) => void;
  /** The message writes itself in a pen stroke; off, it is printed at once. @default true */
  hand?: boolean;
  /** A circular date stamp with bars, or a machine postmark's waves. @default "round" */
  stamp?: MailPostcardStamp;
  /** The card stock. @default "cream" */
  paper?: MailPostcardPaper;
  /** @default "Send" */
  sendLabel?: string;
  /** Play the turn, the postmark and the posting. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Stock = {
  paper: string;
  hand: string;
  print: string;
  faint: string;
  rule: string;
};

// Card stock is a physical object: fixed pigments, so the card is the same on
// either theme. On a dark page the paper leans toward the page a little
// (oklab keeps its hue) so it does not glare.
const STOCKS: Record<MailPostcardPaper, Stock> = {
  cream: {
    paper: "oklch(0.958 0.024 88)",
    hand: "oklch(0.34 0.1 262)",
    print: "oklch(0.32 0.025 60)",
    faint: "oklch(0.56 0.035 70)",
    rule: "oklch(0.8 0.035 80)",
  },
  white: {
    paper: "oklch(0.985 0.003 95)",
    hand: "oklch(0.33 0.11 262)",
    print: "oklch(0.26 0.02 262)",
    faint: "oklch(0.56 0.015 262)",
    rule: "oklch(0.86 0.01 262)",
  },
  kraft: {
    paper: "oklch(0.76 0.065 70)",
    hand: "oklch(0.25 0.05 40)",
    print: "oklch(0.24 0.035 50)",
    faint: "oklch(0.42 0.05 60)",
    rule: "oklch(0.6 0.06 65)",
  },
};

const PAPER_EDGE =
  "drop-shadow(0 0 0.5px oklch(0.25 0.02 260 / 0.45)) drop-shadow(0 2px 3px oklch(0.2 0.02 260 / 0.16))";
/** The postmark's ink: near-black, a little blue, laid on the paper. */
const MARK_INK = "oklch(0.28 0.035 262 / 0.78)";
/** Seconds per ordinary character of handwriting. */
const PEN = 0.026;
/** Turned this far, a dragged card commits to its back. */
const HALF = 90;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

type Glyph = { x: number; w: number; line: number; c: string };
type Line = { top: number; height: number; base: number };
type Script = {
  key: string;
  glyphs: Glyph[];
  lines: Line[];
  start: number[];
  dur: number[];
  total: number;
};

const EMPTY: Script = {
  key: "",
  glyphs: [],
  lines: [],
  start: [],
  dur: [],
  total: 0,
};

/**
 * Lays the pen's route over measured glyphs: quick inside a word, a lift at
 * a space, a pause at punctuation and a longer one to come back for a new
 * line.
 */
function scriptFor(
  key: string,
  text: string,
  rects: { x: number; y: number; w: number; h: number }[],
): Script {
  const tops: number[] = [];
  const glyphs: Glyph[] = [];
  let line = -1;
  let lastY = Number.NEGATIVE_INFINITY;
  const heights: number[] = [];
  rects.forEach((r, i) => {
    const c = text[i] ?? "";
    if (r.h > 0 && r.y > lastY + r.h * 0.5) {
      line += 1;
      tops.push(r.y);
      heights.push(r.h);
      lastY = r.y;
    }
    glyphs.push({ x: r2(r.x), w: r2(r.w), line: Math.max(0, line), c });
  });
  const lines: Line[] = tops.map((top, k) => {
    const h = heights[k] ?? 0;
    const prevBottom = k > 0 ? (tops[k - 1] ?? 0) + (heights[k - 1] ?? 0) : 0;
    const bandTop = k === 0 ? 0 : (prevBottom + top) / 2;
    const next = tops[k + 1];
    const bandBottom =
      next === undefined ? top + h * 1.6 : (top + h + next) / 2;
    return {
      top: r2(bandTop),
      height: r2(bandBottom - bandTop),
      base: r2(top + h * 0.8),
    };
  });
  const start: number[] = [];
  const dur: number[] = [];
  let t = 0;
  glyphs.forEach((g, i) => {
    let w = 1;
    if (g.c === " ") w = 1.6;
    else if (g.c === "\n") w = 2;
    else if (/[.,!?;:]/.test(g.c)) w = 3.4;
    else if (g.c === "—" || g.c === "-") w = 2.2;
    const prev = glyphs[i - 1];
    if (prev && g.line > prev.line) w += 4;
    start.push(t);
    dur.push(w * PEN);
    t += w * PEN;
  });
  return { key, glyphs, lines, start, dur, total: r3(t) };
}

/** A perforated postage stamp: a lighthouse on its point at dusk. */
function PostageStamp({ id, className }: { id: string; className?: string }) {
  const holes: React.ReactNode[] = [];
  for (let x = 2; x <= 38; x += 4) {
    holes.push(<circle key={`t${x}`} cx={x} cy={0} r={1.4} />);
    holes.push(<circle key={`b${x}`} cx={x} cy={48} r={1.4} />);
  }
  for (let y = 2; y <= 46; y += 4) {
    holes.push(<circle key={`l${y}`} cx={0} cy={y} r={1.4} />);
    holes.push(<circle key={`r${y}`} cx={40} cy={y} r={1.4} />);
  }
  return (
    <svg aria-hidden viewBox="0 0 40 48" className={className}>
      <defs>
        <mask id={id}>
          <rect width="40" height="48" fill="white" />
          <g fill="black">{holes}</g>
        </mask>
      </defs>
      <g mask={`url(#${id})`}>
        <rect width="40" height="48" fill="oklch(0.97 0.012 90)" />
        <rect
          x="3.5"
          y="3.5"
          width="33"
          height="41"
          fill="oklch(0.8 0.07 55)"
        />
        <circle cx="25" cy="19" r="6" fill="oklch(0.9 0.09 85)" />
        <path
          d="M3.5 33 L14 27 L22 31 L36.5 26 V44.5 H3.5 Z"
          fill="oklch(0.5 0.05 265)"
        />
        <path d="M3.5 37 H36.5 V44.5 H3.5 Z" fill="oklch(0.42 0.07 250)" />
        <path d="M12 37 L13.4 20 H16.6 L18 37 Z" fill="oklch(0.97 0.01 90)" />
        <path
          d="M12.8 30 H17.2 L17.5 33 H12.5 Z M13.3 24 H16.7 L16.9 26.5 H13.1 Z"
          fill="oklch(0.55 0.17 28)"
        />
        <path
          d="M13 20 H17 V17.6 L15 16 L13 17.6 Z"
          fill="oklch(0.32 0.03 260)"
        />
        <text
          x="34"
          y="10.5"
          textAnchor="end"
          fontSize="5.5"
          fontWeight="700"
          fill="oklch(0.3 0.03 260)"
          fontFamily="var(--font-mono), monospace"
        >
          2.10
        </text>
      </g>
    </svg>
  );
}

/** The postmark: a dated circle and bars, or a machine's wavy lines. */
function Postmark({
  id,
  kind,
  place,
  date,
}: {
  id: string;
  kind: MailPostcardStamp;
  place: string;
  date: string;
}) {
  const town = place.toUpperCase();
  const day = date.toUpperCase();
  if (kind === "wave") {
    const waves = [9, 15, 21, 27, 33].map((y) => {
      let d = `M28 ${y}`;
      for (let x = 28; x < 92; x += 8) d += ` q2 -2.6 4 0 t4 0`;
      return d;
    });
    return (
      <svg
        aria-hidden
        viewBox="0 0 92 42"
        className="block size-full overflow-visible"
      >
        <g fill="none" stroke={MARK_INK}>
          <circle cx="14" cy="21" r="12.5" strokeWidth="1.2" />
          {waves.map((d) => (
            <path key={d} d={d} strokeWidth="1.2" strokeLinecap="round" />
          ))}
        </g>
        <g
          fill={MARK_INK}
          fontFamily="var(--font-mono), monospace"
          fontWeight="700"
          textAnchor="middle"
        >
          <text x="14" y="18.5" fontSize="4.2">
            {town.slice(0, 9)}
          </text>
          <text x="14" y="25.5" fontSize="4.2">
            {day.slice(0, 9)}
          </text>
        </g>
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 92 42"
      className="block size-full overflow-visible"
    >
      <defs>
        <path id={id} d="M7.4 21 A13.6 13.6 0 0 1 34.6 21" />
      </defs>
      <g fill="none" stroke={MARK_INK}>
        <circle cx="21" cy="21" r="18" strokeWidth="1.5" />
        <circle cx="21" cy="21" r="10.2" strokeWidth="0.8" />
        <path d="M44 12 H92 M44 21 H92 M44 30 H92" strokeWidth="1.5" />
      </g>
      <g
        fill={MARK_INK}
        fontFamily="var(--font-mono), monospace"
        fontWeight="700"
      >
        <text fontSize="4.6" letterSpacing="0.6">
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
            {town.slice(0, 14)}
          </textPath>
        </text>
        <text x="21" y="22.6" fontSize="4.4" textAnchor="middle">
          {day.slice(0, 9)}
        </text>
      </g>
    </svg>
  );
}

/**
 * The message side, used twice: once on the card, and once untransformed
 * and invisible beside it, where the handwriting is measured.
 */
function BackLayout({
  text,
  to,
  stampId,
  messageRef,
  messageStyle,
  hand,
  children,
}: {
  text: string;
  to: MailPostcardAddress;
  stampId: string;
  messageRef?: React.Ref<HTMLParagraphElement>;
  messageStyle?: React.ComponentProps<typeof motion.p>["style"];
  hand: boolean;
  children?: React.ReactNode;
}) {
  const messageClass = cn(
    // A scroll container's flex minimum is zero: a long message is cut at
    // the card's edge instead of pushing past it.
    "mt-[2.2cqw] flex-1 overflow-hidden whitespace-pre-line text-(--pc-hand)",
    hand
      ? "[font-family:cursive] text-[clamp(10px,4.4cqw,14px)] leading-[1.36]"
      : "font-sans text-[clamp(9px,3.7cqw,12px)] leading-[1.45] text-(--pc-print)",
  );
  return (
    <div className="absolute inset-0 flex gap-[3cqw] p-[4.5cqw]">
      <div className="relative flex w-[56%] min-w-0 flex-col">
        <span className="font-mono text-[max(7px,2.5cqw)] leading-none tracking-[0.16em] text-(--pc-faint) uppercase">
          Post card
        </span>
        {messageRef ? (
          // The measured copy is a plain element: its ref is bound once,
          // when it arrives, and its observer is let go when it leaves.
          <p ref={messageRef} className={messageClass}>
            {text}
          </p>
        ) : (
          <motion.p className={messageClass} style={messageStyle}>
            {text}
          </motion.p>
        )}
        {children}
      </div>
      <span className="w-px shrink-0 self-stretch bg-(--pc-rule)" />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex justify-end">
          <PostageStamp id={stampId} className="w-[13.5cqw] shrink-0" />
        </div>
        <div className="mt-auto flex flex-col gap-[1.2cqw] pb-[1cqw]">
          {[to.name, ...to.lines.slice(0, 2)].map((line, i) => (
            <span
              key={i}
              className={cn(
                "truncate border-b border-(--pc-rule) pb-[0.6cqw] leading-tight text-(--pc-hand)",
                hand
                  ? "[font-family:cursive] text-[clamp(9px,3.9cqw,13px)]"
                  : "font-sans text-[clamp(8px,3.4cqw,11px)] text-(--pc-print)",
              )}
              title={line}
            >
              {line}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Nib({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 10 16" className={className}>
      <path
        d="M1 15.2 L3.4 9.6 L6.2 1.2 Q7.6 0.4 8.8 1.4 L8.4 4.6 L4.4 11 Z"
        fill="oklch(0.62 0.012 260)"
      />
      <path d="M1 15.2 L3.6 10.4 L4.4 11 Z" fill="oklch(0.3 0.05 262)" />
      <path
        d="M5.2 5.6 L3.4 9.6"
        stroke="oklch(0.38 0.012 260)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

type Phase = "idle" | "posting" | "gone";

type Api = {
  turnTo: (
    side: MailPostcardSide,
    withSound: boolean,
    velocity?: number,
  ) => void;
  jumpGone: () => void;
  comeBack: () => void;
  onTurn: (deg: number) => void;
  measure: () => void;
  penAt: (t: number) => void;
  startWriting: () => void;
};

/**
 * A postcard that can be turned over, written and posted. Its picture side
 * shows whatever the host passes, with a printed caption; a press, a swipe
 * (the card turns 1:1 with the finger, half its width is a quarter turn, a
 * throw is projected) or the Turn over button turns it on its vertical axis
 * with perspective on the glide spring, easing back a little in the middle
 * of the turn so it never grows past its box, with a sheen crossing the face.
 *
 * The first time the back comes round the message writes itself: the text is
 * measured on an untransformed copy, and a pen runs along it — quick inside a
 * word, lifting at a space, pausing at punctuation and for each new line —
 * revealing ink behind its nib through a two-band mask. Send turns the card
 * if needed, finishes the writing, and lands the postmark on the recoil
 * spring with a thud while the card gives under the blow; then the card
 * slides off into the post on the exit ease and a Posted slip takes its
 * place. Setting `sent` back to false brings a card in on glide.
 *
 * Turn over and Send are real buttons; the card's own press and swipe mirror
 * Turn over. Under reduced motion the sides cross-fade, the message is there
 * whole, the postmark fades in at rest and the card fades out and back.
 */
export function MailPostcard({
  message,
  to,
  from,
  place,
  date,
  picture,
  caption,
  side,
  defaultSide = "front",
  onSideChange,
  sent,
  defaultSent = false,
  onSentChange,
  hand = true,
  stamp = "round",
  paper = "cream",
  sendLabel = "Send",
  sound = false,
  disabled = false,
  className,
}: MailPostcardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const stock = STOCKS[paper] ?? STOCKS.cream;
  const mark: MailPostcardStamp = stamp === "wave" ? "wave" : "round";
  const text = from ? `${message}\n— ${from}` : message;
  const textKey = `${hand ? "h" : "p"}|${text}`;
  const turnIn3d = motionSafe;

  const [ownSide, setOwnSide] = React.useState<MailPostcardSide>(defaultSide);
  const currentSide = side ?? ownSide;
  const [ownSent, setOwnSent] = React.useState(defaultSent);
  const isSent = sent ?? ownSent;
  const [check, setCheck] = React.useState(0);
  const [shownSide, setShownSide] =
    React.useState<MailPostcardSide>(currentSide);
  const [gone, setGone] = React.useState(isSent);
  const [posting, setPosting] = React.useState(false);
  const [writtenKey, setWrittenKey] = React.useState<string | null>(
    currentSide === "back" ? textKey : null,
  );
  const written = !hand || !motionSafe || writtenKey === textKey;

  const [said, setSaid] = React.useState({
    n: 0,
    side: shownSide,
    gone,
    text: "",
  });
  if (said.side !== shownSide || said.gone !== gone) {
    const next =
      said.gone !== gone
        ? gone
          ? `Posted to ${to.name}.`
          : "A card to post."
        : shownSide === "back"
          ? "Message side."
          : "Picture side.";
    setSaid({ n: said.n + 1, side: shownSide, gone, text: next });
  }

  const turn = useMotionValue(currentSide === "back" && turnIn3d ? 180 : 0);
  const fade = useMotionValue(currentSide === "back" && !turnIn3d ? 1 : 0);
  const cardX = useMotionValue(0);
  const cardR = useMotionValue(0);
  const cardS = useMotionValue(1);
  const cardO = useMotionValue(isSent ? 0 : 1);
  const slotO = useMotionValue(0);
  const markS = useMotionValue(1);
  const markR = useMotionValue(-7);
  const markO = useMotionValue(isSent ? 1 : 0);
  const ink = useMotionValue(0);
  const inkX = useMotionValue("0px");
  const inkY = useMotionValue("0px");
  const inkH = useMotionValue("0px");
  const nibX = useMotionValue(0);
  const nibY = useMotionValue(0);
  const nibO = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const laneRef = React.useRef<HTMLDivElement | null>(null);
  const ghostRef = React.useRef<HTMLParagraphElement | null>(null);
  const turnButton = React.useRef<HTMLButtonElement | null>(null);
  const visual = React.useRef<MailPostcardSide>(currentSide);
  const phase = React.useRef<Phase>(isSent ? "gone" : "idle");
  const script = React.useRef<Script>(EMPTY);
  const writing = React.useRef(false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const dragFrom = React.useRef(0);
  const refocus = React.useRef<"slip" | "turn" | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const pan = () => {
    const rect = laneRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const width = () => laneRef.current?.clientWidth ?? 300;

  /** Reads the ghost copy's glyph boxes and lays the pen's route. */
  const measure = () => {
    const el = ghostRef.current;
    const node = el?.firstChild;
    if (!el || !node || node.nodeType !== Node.TEXT_NODE) return;
    const base = el.getBoundingClientRect();
    const content = node.textContent ?? "";
    const range = document.createRange();
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    let last = { x: 0, y: 0, w: 0, h: 0 };
    for (let i = 0; i < content.length; i += 1) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const list = range.getClientRects();
      const r = list[list.length - 1];
      if (!r || (r.width === 0 && r.height === 0)) {
        rects.push({ x: last.x + last.w, y: last.y, w: 0, h: last.h });
        continue;
      }
      last = {
        x: r.left - base.left,
        y: r.top - base.top,
        w: r.width,
        h: r.height,
      };
      rects.push(last);
    }
    range.detach();
    script.current = scriptFor(textKey, content, rects);
    penAt(ink.get());
  };

  /** The pen at `t` seconds into the writing: the mask and the nib follow. */
  const penAt = (t: number) => {
    const s = script.current;
    const n = s.glyphs.length;
    if (n === 0) return;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((s.start[mid] ?? 0) <= t) lo = mid;
      else hi = mid - 1;
    }
    const g = s.glyphs[lo];
    const line = g ? s.lines[g.line] : undefined;
    if (!g || !line) return;
    const u = Math.min(
      1,
      Math.max(0, (t - (s.start[lo] ?? 0)) / (s.dur[lo] || 1)),
    );
    const done = t >= s.total;
    const x = done ? 9999 : g.x + g.w * u;
    inkX.set(`${r2(x)}px`);
    inkY.set(`${r2(line.top)}px`);
    inkH.set(`${r2(line.height)}px`);
    const lifted = g.c === " " || g.c === "\n";
    nibX.set(r2(g.x + g.w * u - 1));
    nibY.set(r2(line.base - 15.2 - (lifted ? 2.5 : 0)));
  };

  const startWriting = () => {
    if (written || writing.current) return;
    if (script.current.key !== textKey || script.current.total === 0) measure();
    const s = script.current;
    if (s.total === 0) {
      setWrittenKey(textKey);
      return;
    }
    writing.current = true;
    run("nib", animate(nibO, 1, { duration: durations.fast }));
    run(
      "ink",
      animate(ink, s.total, {
        duration: Math.max(0.05, s.total - ink.get()),
        ease: "linear",
        onComplete: () => {
          writing.current = false;
          setWrittenKey(textKey);
          run("nib", animate(nibO, 0, { duration: durations.base }));
        },
      }),
    );
  };

  const pauseWriting = () => {
    if (!writing.current) return;
    writing.current = false;
    halt("ink");
    run("nib", animate(nibO, 0, { duration: durations.fast }));
  };

  const finishWriting = () => {
    writing.current = false;
    halt("ink");
    nibO.set(0);
    if (!written) setWrittenKey(textKey);
  };

  const onTurn = (deg: number) => {
    if (visual.current === "back" && deg > 100) startWriting();
    else if (deg < 80) pauseWriting();
  };

  const commitSide = (next: MailPostcardSide) => {
    if (next === currentSide) return;
    if (side === undefined) setOwnSide(next);
    onSideChange?.(next);
    if (side !== undefined) React.startTransition(() => setCheck((c) => c + 1));
  };

  /** Turns the card to a side: a spring with perspective, or a cross-fade. */
  const turnTo = (next: MailPostcardSide, withSound: boolean, velocity = 0) => {
    visual.current = next;
    setShownSide(next);
    if (withSound) {
      audio.play("paper", {
        pitch: next === "back" ? 0.95 : 0.85,
        gain: 0.26,
        pan: pan(),
      });
    }
    if (turnIn3d) {
      fade.set(0);
      run(
        "turn",
        animate(turn, next === "back" ? 180 : 0, {
          ...springs.glide,
          velocity,
        }),
      );
      return;
    }
    turn.set(0);
    run(
      "fade",
      animate(fade, next === "back" ? 1 : 0, {
        duration: durations.base,
        ease: easings.enter,
      }),
    );
  };

  const flipBy = (withSound: boolean) => {
    if (disabled || phase.current !== "idle") return;
    const next = visual.current === "back" ? "front" : "back";
    turnTo(next, withSound);
    commitSide(next);
  };

  /** The posting itself: postmark, a give under the blow, then away. */
  const send = () => {
    if (disabled || phase.current !== "idle") return;
    phase.current = "posting";
    setPosting(true);
    // The buttons stay focusable while it posts, so focus is still here to
    // hand to the Posted slip when the card has gone.
    const hadFocus = Boolean(rootRef.current?.contains(document.activeElement));
    if (sent === undefined) setOwnSent(true);
    onSentChange?.(true);
    const stampDown = () => {
      finishWriting();
      audio.play("thud", { pitch: 1, gain: 0.7, pan: pan() });
      if (!motionSafe) {
        markS.set(1);
        markR.set(-7);
        run("markO", animate(markO, 1, { duration: durations.base }));
        later(700, away);
        return;
      }
      markS.set(1.35);
      markR.set(-16);
      markO.set(0);
      run("markO", animate(markO, 1, { duration: 0.08, ease: easings.enter }));
      run("markS", animate(markS, 1, springs.recoil));
      run("markR", animate(markR, -7, springs.recoil));
      run(
        "cardS",
        animate(cardS, 0.985, {
          ...springs.flick,
          onComplete: () => run("cardS", animate(cardS, 1, springs.recoil)),
        }),
      );
      later(560, away);
    };
    const away = () => {
      audio.play("paper", { pitch: 1.3, gain: 0.3, pan: pan() });
      const done = () => {
        phase.current = "gone";
        if (hadFocus) refocus.current = "slip";
        setGone(true);
        setPosting(false);
        run("slot", animate(slotO, 0, { duration: durations.slow }));
        if (sent !== undefined)
          React.startTransition(() => setCheck((c) => c + 1));
      };
      if (!motionSafe) {
        run(
          "cardO",
          animate(cardO, 0, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: done,
          }),
        );
        return;
      }
      run("slot", animate(slotO, 1, { duration: durations.fast }));
      run("cardR", animate(cardR, 2.5, { duration: 0.42, ease: easings.exit }));
      run(
        "cardX",
        animate(cardX, r2(width() * 1.12), {
          duration: 0.42,
          ease: easings.exit,
          onComplete: () => {
            cardO.set(0);
            done();
          },
        }),
      );
    };
    if (visual.current !== "back") {
      turnTo("back", true);
      commitSide("back");
      later(motionSafe ? 420 : 0, stampDown);
    } else {
      stampDown();
    }
  };

  /** The host posted it without a press: it is simply gone. */
  const jumpGone = () => {
    phase.current = "gone";
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    cardO.set(0);
    markO.set(1);
    setGone(true);
    setPosting(false);
  };

  /** A card to post: it comes in from the left, picture side up. */
  const comeBack = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    phase.current = "idle";
    if (rootRef.current?.contains(document.activeElement)) {
      refocus.current = "turn";
    }
    setGone(false);
    setPosting(false);
    visual.current = "front";
    setShownSide("front");
    commitSide("front");
    turn.set(0);
    fade.set(0);
    markO.set(0);
    markS.set(1);
    markR.set(-7);
    cardR.set(0);
    cardS.set(1);
    slotO.set(0);
    ink.set(0);
    setWrittenKey(null);
    if (!motionSafe) {
      cardX.set(0);
      run(
        "cardO",
        animate(cardO, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    cardX.set(-24);
    cardO.set(0);
    run("cardX", animate(cardX, 0, springs.glide));
    run(
      "cardO",
      animate(cardO, 1, { duration: durations.base, ease: easings.enter }),
    );
  };

  React.useEffect(() => {
    api.current = {
      turnTo,
      jumpGone,
      comeBack,
      onTurn,
      measure,
      penAt,
      startWriting,
    };
  });

  // What the host says about the side and the posting. Echoes of this
  // card's own reports are already on show; anything else is followed.
  React.useEffect(() => {
    const now = api.current;
    if (!now || phase.current !== "idle") return;
    if (visual.current !== currentSide) now.turnTo(currentSide, false);
  }, [currentSide, check]);

  React.useEffect(() => {
    const now = api.current;
    if (!now) return;
    if (isSent && phase.current === "idle") now.jumpGone();
    else if (!isSent && phase.current === "gone") now.comeBack();
  }, [isSent, check]);

  // A new message (or a new hand) is written from the start: now, if the
  // back is already showing, or the next time it comes round.
  React.useEffect(() => {
    writing.current = false;
    anims.current.get("ink")?.stop();
    ink.set(0);
    nibO.set(0);
    api.current?.measure();
    if (visual.current === "back" && phase.current === "idle") {
      api.current?.startWriting();
    }
  }, [textKey, ink, nibO]);

  // Reduced motion switched under the card: the same side stays on show.
  React.useEffect(() => {
    turn.set(visual.current === "back" && turnIn3d ? 180 : 0);
    fade.set(visual.current === "back" && !turnIn3d ? 1 : 0);
  }, [turnIn3d, turn, fade]);

  React.useEffect(() => {
    const offTurn = turn.on("change", (v) => api.current?.onTurn(v));
    const offInk = ink.on("change", (v) => api.current?.penAt(v));
    return () => {
      offTurn();
      offInk();
    };
  }, [turn, ink]);

  // The ghost is measured when it arrives and whenever it reflows.
  const bindGhost = React.useCallback((node: HTMLParagraphElement | null) => {
    ghostRef.current = node;
    if (!node) return;
    const observer = new ResizeObserver(() => api.current?.measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Focus that was on the card's controls follows it: to the slip when it
  // leaves, back to Turn over when a card comes in.
  const bindSlip = React.useCallback((node: HTMLDivElement | null) => {
    if (!node || refocus.current !== "slip") return;
    refocus.current = null;
    node.focus({ preventScroll: true });
  }, []);
  React.useEffect(() => {
    if (gone || refocus.current !== "turn") return;
    refocus.current = null;
    turnButton.current?.focus({ preventScroll: true });
  }, [gone]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const gesture = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || posting || gone,
    onStart: () => {
      halt("turn");
      dragFrom.current = turnIn3d
        ? turn.get()
        : visual.current === "back"
          ? 180
          : 0;
    },
    onMove: ({ offset }) => {
      if (!turnIn3d) return;
      const raw = dragFrom.current + (offset.x / Math.max(1, width() / 2)) * 90;
      turn.set(r2(rubberClamp(raw, 0, 180, 40)));
    },
    onEnd: ({ velocity, offset }) => {
      const degPerSecond = (velocity.x / Math.max(1, width() / 2)) * 90;
      let next: MailPostcardSide = visual.current;
      if (turnIn3d) {
        next =
          project(turn.get(), degPerSecond, 0.99) > HALF ? "back" : "front";
      } else if (Math.abs(offset.x) > 24) {
        // No turn to follow: a clear swipe right shows the back, left the front.
        next = offset.x > 0 ? "back" : "front";
      }
      const changed = next !== visual.current;
      turnTo(next, changed, degPerSecond);
      if (changed) commitSide(next);
    },
    onCancel: () => turnTo(visual.current, false),
    onTap: () => flipBy(true),
  });

  const flipScale = useTransform(turn, (t) =>
    r3(1 - 0.1 * Math.abs(Math.sin((t * Math.PI) / 180))),
  );
  const sheenX = useTransform(turn, (t) => `${r2((t / 180) * 240 - 120)}%`);
  const sheenO = useTransform(turn, (t) =>
    r3(0.55 * Math.abs(Math.sin((t * Math.PI) / 180))),
  );
  const frontO = useTransform(fade, (v) => r3(1 - v));

  const vars = {
    "--pc-paper": `color-mix(in oklab, ${stock.paper} 92%, var(--bg-0))`,
    "--pc-hand": stock.hand,
    "--pc-print": stock.print,
    "--pc-faint": stock.faint,
    "--pc-rule": stock.rule,
  } as React.CSSProperties;

  const messageStyle = written
    ? undefined
    : {
        "--ink-x": inkX,
        "--ink-y": inkY,
        "--ink-h": inkH,
        maskImage:
          "linear-gradient(black, black), linear-gradient(90deg, black calc(var(--ink-x) - 5px), transparent var(--ink-x))",
        maskSize: "100% var(--ink-y), 100% var(--ink-h)",
        maskPosition: "0 0, 0 var(--ink-y)",
        maskRepeat: "no-repeat",
      };

  const sheen =
    "pointer-events-none absolute inset-y-0 w-[60%] bg-linear-to-r from-transparent via-white/70 to-transparent mix-blend-soft-light";
  const control =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

  return (
    <div
      ref={rootRef}
      className={cn("@container w-full", disabled && "opacity-60", className)}
      style={vars}
    >
      <div className="flex flex-col items-center gap-3 pt-1.5 @min-[520px]:flex-row @min-[520px]:justify-center @min-[520px]:gap-6 @min-[520px]:py-2">
        <div
          ref={laneRef}
          role="group"
          aria-label={`Postcard to ${to.name}`}
          className="relative aspect-[3/2] w-[min(100%,268px)] shrink-0 overflow-x-clip @min-[520px]:w-[312px]"
        >
          {gone ? (
            <div
              ref={bindSlip}
              tabIndex={-1}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[6px] border border-dashed border-hairline-strong px-4 text-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="mb-1 size-6 text-ink-3"
              >
                <circle
                  cx="9"
                  cy="12"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M17 8.5h6M17 12h6M17 15.5h6"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
              </svg>
              <p className="text-sm font-medium text-foreground">Posted</p>
              <p className="max-w-full truncate text-xs text-ink-3">
                to {to.name} · {date}
              </p>
            </div>
          ) : null}

          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 right-0 w-1 rounded-full"
            style={{ opacity: slotO, background: "oklch(0.22 0.02 262 / 0.8)" }}
          />

          <motion.div
            aria-hidden={gone || undefined}
            inert={gone || undefined}
            className="absolute inset-0 [perspective:1200px]"
            style={{
              x: cardX,
              rotate: cardR,
              scale: cardS,
              opacity: cardO,
              filter: PAPER_EDGE,
            }}
          >
            <motion.div
              className="relative size-full [transform-style:preserve-3d]"
              style={{ rotateY: turn, scale: flipScale }}
            >
              <motion.div
                aria-hidden={shownSide !== "front" || undefined}
                className="@container absolute inset-0 overflow-clip rounded-[6px] bg-(--pc-paper) p-[5px] [backface-visibility:hidden]"
                style={{ opacity: frontO }}
              >
                <div className="relative size-full overflow-clip rounded-[3px] bg-surface-2">
                  {picture}
                  {caption ? (
                    <span className="absolute bottom-[4cqw] left-[4cqw] max-w-[80%] truncate rounded-[3px] bg-(--pc-paper) px-[2.4cqw] py-[1cqw] text-[clamp(8px,3.2cqw,11px)] font-semibold tracking-[0.04em] text-(--pc-print) uppercase">
                      {caption}
                    </span>
                  ) : null}
                </div>
                <motion.span
                  aria-hidden
                  className={sheen}
                  style={{ left: sheenX, opacity: sheenO }}
                />
              </motion.div>

              <motion.div
                aria-hidden={shownSide !== "back" || undefined}
                className="@container absolute inset-0 overflow-clip rounded-[6px] bg-(--pc-paper) [backface-visibility:hidden]"
                style={{
                  rotateY: turnIn3d ? 180 : 0,
                  opacity: turnIn3d ? 1 : fade,
                }}
              >
                <BackLayout
                  text={text}
                  to={to}
                  stampId={`${uid}-stamp`}
                  hand={hand}
                  messageStyle={messageStyle}
                >
                  {hand && motionSafe ? (
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute top-0 left-0"
                      style={{ x: nibX, y: nibY, opacity: nibO }}
                    >
                      <Nib className="block h-4 w-2.5" />
                    </motion.span>
                  ) : null}
                </BackLayout>
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute top-[5cqw] right-[2cqw] h-[14cqw] w-[31cqw] mix-blend-multiply"
                  style={{
                    scale: markS,
                    rotate: markR,
                    opacity: markO,
                    originX: 0.3,
                    originY: 0.5,
                  }}
                >
                  <Postmark
                    id={`${uid}-ring`}
                    kind={mark}
                    place={place}
                    date={date}
                  />
                </motion.div>
                <motion.span
                  aria-hidden
                  className={sheen}
                  style={{ left: sheenX, opacity: sheenO }}
                />
              </motion.div>
            </motion.div>

            <div
              aria-hidden
              {...gesture}
              className={cn(
                "absolute inset-0 touch-pan-y rounded-[6px] [-webkit-touch-callout:none]",
                disabled || posting
                  ? "cursor-default"
                  : "cursor-grab active:cursor-grabbing",
              )}
            />
          </motion.div>

          <div aria-hidden className="@container invisible absolute inset-0">
            <BackLayout
              text={text}
              to={to}
              stampId={`${uid}-ghost`}
              hand={hand}
              messageRef={bindGhost}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 @min-[520px]:w-40 @min-[520px]:flex-col @min-[520px]:items-stretch">
          <div className="hidden min-w-0 flex-col @min-[520px]:flex @min-[520px]:pb-1">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              To
            </span>
            <span
              className="truncate text-sm font-medium text-foreground"
              title={to.name}
            >
              {to.name}
            </span>
            {to.lines.slice(0, 2).map((line, k) => (
              <span
                key={k}
                className="truncate text-xs text-ink-3"
                title={line}
              >
                {line}
              </span>
            ))}
          </div>
          <button
            ref={turnButton}
            type="button"
            disabled={disabled || gone}
            aria-disabled={posting || undefined}
            onClick={() => flipBy(true)}
            className={cn(
              control,
              "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground disabled:hover:bg-transparent",
            )}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0">
              <path
                d="M2.5 6.2A5.6 5.6 0 0 1 13 4.6M13.5 9.8A5.6 5.6 0 0 1 3 11.4M13.2 1.8v3h-3M2.8 14.2v-3h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Turn over
          </button>
          <button
            type="button"
            disabled={disabled || gone}
            aria-disabled={posting || undefined}
            onClick={send}
            className={cn(
              control,
              "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0">
              <path
                d="M14.2 1.8 1.8 7l5 2.2M14.2 1.8 9 14.2 6.8 9.2M14.2 1.8 6.8 9.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {sendLabel}
          </button>
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
