"use client";

import * as React from "react";

import { ChevronDown, ShoppingBag, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ReviewPhoto = {
  id: string;
  /** What the photo shows; its button's name. */
  alt: string;
  /** Seeds the procedural scene drawn when there is no `image`. */
  seed?: number;
  /** A real picture instead: an `<img>` or any node, filling the thumbnail. */
  image?: React.ReactNode;
};

export type ReviewVote = "up" | "down" | null;
export type ReviewUnroll = "snap" | "glide" | "drift";

export type ReviewCardProps = {
  /** The reviewer's rating, 0 to 5; a fraction fills part of a star. @default 4 */
  rating?: number;
  /** The review's title: the card's heading. */
  title?: string;
  /** The review; a blank line starts a new paragraph. */
  body?: string;
  /** Who wrote it. @default "Odile M." */
  author?: string;
  /** After the author. @default "Verified buyer" */
  authorDetail?: string;
  /** When it was written. @default 12 Sep 2026 */
  date?: Date | number;
  /** The zone dates print in, so server and client print the same day. @default "UTC" */
  timeZone?: string;
  /** How the date is printed. @default "12 Sep 2026" */
  formatDate?: (date: Date, timeZone: string) => string;
  /** What was bought, above the vote. @default "Harbour tote · Moss · Daily" */
  product?: string;
  /** The reviewer's photos. @default defaultReviewPhotos */
  photos?: ReviewPhoto[];
  /** A thumbnail was pressed. */
  onPhotoOpen?: (id: string) => void;
  /** People who found it helpful, not counting this visitor. @default 24 */
  helpful?: number;
  /** People who did not, not counting this visitor. @default 2 */
  unhelpful?: number;
  /** Controlled vote of this visitor. */
  vote?: ReviewVote;
  /** Initial vote when uncontrolled. @default null */
  defaultVote?: ReviewVote;
  /** Fires from the vote press, with the new vote or null for undone. */
  onVoteChange?: (vote: ReviewVote) => void;
  /** Controlled: the long review is unrolled. */
  expanded?: boolean;
  /** Initially unrolled when uncontrolled. @default false */
  defaultExpanded?: boolean;
  /** Fires from Read more, Show less or Escape. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Lines shown while the review is folded. @default 4 */
  lines?: number;
  /** How long each line takes to ink in on view, in ms. @default 200 */
  pace?: number;
  /** How liquid the stars' fill is, 0 to 1: a straight sweep, or a front that ripples and sloshes. @default 0.5 */
  fill?: number;
  /** The spring that unrolls and rolls up the fold. @default "glide" */
  unroll?: ReviewUnroll;
  /** How far the photos fan out on hover, 0 to 1. @default 0.5 */
  fan?: number;
  /** The stars' liquid. Any CSS colour; the outline is mixed from it. @default a gold pigment from --warn at a fixed lightness */
  starColor?: string;
  /** Ink the review in when it first comes into view. Off: it starts shown. @default true */
  revealOnView?: boolean;
  /** The heading's level. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** A tick per line as it unrolls, a pop for a vote. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultReviewPhotos: ReviewPhoto[] = [
  { id: "ferry", alt: "The tote on a ferry bench", seed: 7 },
  { id: "packed", alt: "Packed for a weekend away", seed: 31 },
  { id: "rain", alt: "Rain beading on the canvas", seed: 58 },
];

const DEFAULT_BODY = `I bought the Daily in Moss for the commute and it has carried a laptop, a lunch tin and a wet umbrella every day since without losing its shape. The waxed canvas shrugs off rain and the straps sit flat on a coat.

Two small gripes: the inside pocket is too shallow for a phone, and the leather patch scuffed in the first week. Neither would stop me buying the Weekender next.`;

const DEFAULT_DATE = Date.UTC(2026, 8, 12, 9, 30);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "12 Sep 2026". Only the numbers come from Intl, in the given zone; the
 * month's name is ours, since runtimes disagree on short month names and
 * the server and the browser must print the same day.
 */
const defaultFormatDate = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone,
  }).formatToParts(date);
  const part = (type: string) =>
    Number(parts.find((x) => x.type === type)?.value ?? 0);
  return `${part("day")} ${MONTHS[part("month") - 1] ?? ""} ${part("year")}`;
};

/** A mask that shows nothing: the text before it is first in view. */
const HIDDEN = "linear-gradient(transparent, transparent)";
/** One line of the review text, in px: `text-sm leading-5`. */
const LH = 20;
/** The soft edge of the sweep, in px either side of the ink front. */
const SOFT = 18;

/** Filled stars are pigment: the warn hue at a fixed lightness, the same in both themes. */
const STAR_PIGMENT = "oklch(from var(--warn) 0.8 0.15 h)";
const STAR = 16;
const PITCH = 20;
const STARS_W = PITCH * 4 + STAR;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;
const r2 = (v: number) => Math.round(v * 100) / 100;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const UNROLL: Record<ReviewUnroll, (typeof springs)[keyof typeof springs]> = {
  snap: springs.snap,
  glide: springs.glide,
  drift: springs.drift,
};

/** Five stars as one path, rounded so Node and the browser print the same. */
const STARS_PATH = (() => {
  const one = (ox: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 7.8 : 3.4;
      pts.push(
        `${Number((ox + 8 + r * Math.cos(a)).toFixed(2))} ${Number((8.4 + r * Math.sin(a)).toFixed(2))}`,
      );
    }
    return `M ${pts.join(" L ")} Z`;
  };
  return [0, 1, 2, 3, 4].map((i) => one(i * PITCH)).join(" ");
})();

/** Where a rating of `r` stars reaches, in px across the row. */
const frontOf = (r: number) => {
  const c = Math.min(5, Math.max(0, r));
  const whole = Math.floor(c);
  if (whole >= 5) return STARS_W;
  return whole * PITCH + (c - whole) * STAR;
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small procedural photo: sky, a horizon, a light, and the bag. */
function Scene({ seed }: { seed: number }) {
  const rand = seeded(seed);
  const turn = Math.round(rand() * 300);
  const sky = `oklch(from var(--accent) 0.8 0.06 calc(h + ${turn}))`;
  const ground = `oklch(from var(--accent) 0.5 0.06 calc(h + ${turn + 120}))`;
  const sun = `oklch(from var(--warn) 0.9 0.1 h)`;
  const bag = "oklch(from var(--success) 0.52 0.07 h)";
  const hill: string[] = [];
  for (let i = 0; i <= 6; i += 1) {
    hill.push(`${i * 9} ${r2(30 + rand() * 9)}`);
  }
  const sx = r2(10 + rand() * 32);
  const bx = r2(12 + rand() * 20);
  return (
    <svg aria-hidden viewBox="0 0 52 52" className="block size-full">
      <rect width={52} height={52} style={{ fill: sky }} />
      <circle cx={sx} cy={14} r={5} style={{ fill: sun }} />
      <path
        d={`M 0 52 L ${hill.join(" L ")} L 54 52 Z`}
        style={{ fill: ground }}
      />
      <path
        d={`M ${r2(bx + 3)} 34 L ${r2(bx + 19)} 34 L ${r2(bx + 21)} 47 L ${r2(bx + 1)} 47 Z`}
        style={{ fill: bag }}
      />
      <path
        d={`M ${r2(bx + 7)} 34 C ${r2(bx + 7)} 26 ${r2(bx + 15)} 26 ${r2(bx + 15)} 34`}
        fill="none"
        strokeWidth={1.6}
        style={{ stroke: bag }}
      />
    </svg>
  );
}

/**
 * Digit columns that roll to each new digit. Each column keeps an invisible
 * copy of its digit in flow: its width, and a baseline, so it sits on the
 * line with the text around it.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {chars.map((ch, i) => {
        const key = chars.length - i;
        if (!/\d/.test(ch)) return <span key={`c${key}`}>{ch}</span>;
        return (
          <span
            key={`d${key}`}
            className="relative inline-block overflow-clip leading-[1.25em]"
          >
            <span className="invisible">{ch}</span>
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${-Number(ch) * 1.25}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} className="block h-[1.25em] leading-[1.25em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The rating as a liquid clipped by five star shapes. Its front is a wave
 * whose height is `amp`; the caller drives where it has reached and how
 * hard it ripples.
 */
function LiquidStars({
  rating,
  reach,
  amp,
  phase,
  clipId,
  color,
}: {
  rating: number;
  reach: MotionValue<number>;
  amp: MotionValue<number>;
  phase: MotionValue<number>;
  clipId: string;
  color: string;
}) {
  const body = useTransform(
    [reach, amp, phase] as MotionValue<number>[],
    ([x = 0, a = 0, ph = 0]: number[]) => {
      if (x <= 0.2) return "M 0 0 Z";
      const pts: string[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const y = -1 + (i * 18) / 8;
        pts.push(`${r2(x + a * Math.sin(y * 0.55 + ph))} ${r2(y)}`);
      }
      return `M -1 -1 L ${pts.join(" L ")} L -1 17 Z`;
    },
  );
  return (
    <svg
      role="img"
      aria-label={`Rated ${Number(rating.toFixed(1))} out of 5`}
      width={STARS_W}
      height={17}
      viewBox={`0 0 ${STARS_W} 17`}
      className="block shrink-0 overflow-visible"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={STARS_PATH} />
        </clipPath>
      </defs>
      <path d={STARS_PATH} className="fill-ink-3/15" />
      <g clipPath={`url(#${clipId})`}>
        <motion.path d={body} style={{ fill: color }} />
      </g>
      <path
        d={STARS_PATH}
        fill="none"
        strokeWidth={0.8}
        strokeLinejoin="round"
        style={{ stroke: `color-mix(in oklab, ${color} 72%, black)` }}
      />
    </svg>
  );
}

type Line = { top: number; right: number };

/**
 * A product review that arrives as you read it. The first time the card
 * comes into view, the visible lines ink in one at a time, each swept left to
 * right under a soft edge, and the stars fill on the same clock — one linear
 * progress drives both, so the rating lands with the last visible line. The
 * stars' fill is a liquid whose front ripples by `fill` while it travels and
 * sloshes back on recoil when it stops; a pointer over the stars stirs it.
 *
 * A review longer than `lines` folds under a fade of the card's own colour;
 * Read more unrolls it — the measured height joined on the `unroll` spring,
 * a tick per line as it passes — and is a real disclosure: focus moves into
 * the text, Escape rolls it back up and returns focus. Helpful and Not
 * helpful are toggle buttons whose tallies roll on snap, Helpful bumping on
 * recoil. The photos sit as a seeded deck and fan out on hover or keyboard
 * focus. Under reduced motion the text and stars fade in together, the fold
 * opens at once, and nothing travels.
 */
export function ReviewCard({
  rating = 4,
  title = "Carries a whole day, rain and all",
  body = DEFAULT_BODY,
  author = "Odile M.",
  authorDetail = "Verified buyer",
  date = DEFAULT_DATE,
  timeZone = "UTC",
  formatDate = defaultFormatDate,
  product = "Harbour tote · Moss · Daily",
  photos = defaultReviewPhotos,
  onPhotoOpen,
  helpful = 24,
  unhelpful = 2,
  vote,
  defaultVote = null,
  onVoteChange,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  lines = 4,
  pace = 200,
  fill = 0.5,
  unroll = "glide",
  fan = 0.5,
  starColor = STAR_PIGMENT,
  revealOnView = true,
  headingLevel = 3,
  sound = false,
  disabled = false,
  className,
}: ReviewCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const textId = `${uid}-text`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const stars = Math.min(5, Math.max(0, rating));
  const liquid = clamp01(fill);
  const fanK = clamp01(fan);
  const foldLines = Math.max(1, Math.round(lines));
  const foldH = foldLines * LH;
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const when = formatDate(
    typeof date === "number" ? new Date(date) : date,
    timeZone,
  );

  const [ownVote, setOwnVote] = React.useState<ReviewVote>(defaultVote);
  const myVote = vote !== undefined ? vote : ownVote;
  const ups = Math.max(0, Math.round(helpful)) + (myVote === "up" ? 1 : 0);
  const downs =
    Math.max(0, Math.round(unhelpful)) + (myVote === "down" ? 1 : 0);

  const [ownOpen, setOwnOpen] = React.useState(defaultExpanded);
  const open = expanded ?? ownOpen;

  // The text's own measurements: its full height and where each line sits.
  // Until they arrive, a long review is assumed to fold, as it will.
  const [fullH, setFullH] = React.useState(0);
  const [measuredLines, setLineBoxes] = React.useState<Line[] | null>(null);
  const lineBoxes = React.useMemo(() => measuredLines ?? [], [measuredLines]);
  const foldable = fullH > 0 ? fullH > foldH + 2 : body.length > foldLines * 44;

  // The spoken sentence for a vote, frozen where it lands.
  const [asked, setAsked] = React.useState(false);
  const [said, setSaid] = React.useState({ vote: myVote, words: "" });
  if (said.vote !== myVote) {
    const words = asked
      ? myVote === "up"
        ? `Marked helpful, ${ups} people`
        : myVote === "down"
          ? "Marked not helpful"
          : "Vote removed"
      : said.words;
    setSaid({ vote: myVote, words });
    if (asked) setAsked(false);
  }

  const progress = useMotionValue(revealOnView ? 0 : 1);
  const amp = useMotionValue(0);
  const phase = useMotionValue(0);
  const height = useMotionValue(open ? 0 : foldH);
  const [revealed, setRevealed] = React.useState(!revealOnView);
  const [started, setStarted] = React.useState(!revealOnView);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };
  React.useEffect(() => {
    const all = runs.current;
    return () => {
      for (const c of all.values()) c.stop();
      all.clear();
    };
  }, []);

  // Bound when the text arrives: its height, and its line boxes from the
  // text itself, so paragraph gaps never put the sweep between lines.
  const [textNode, setTextNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!textNode) return;
    const measure = () => {
      setFullH(Math.round(textNode.offsetHeight));
      const base = textNode.getBoundingClientRect();
      const found: Line[] = [];
      const walker = document.createTreeWalker(textNode, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        range.selectNodeContents(n);
        for (const rect of range.getClientRects()) {
          if (rect.width < 1) continue;
          const top = Math.round(rect.top - base.top);
          const right = Math.round(rect.right - base.left);
          const same = found.find((l) => Math.abs(l.top - top) < LH / 2);
          if (same) same.right = Math.max(same.right, right);
          else found.push({ top, right });
        }
      }
      found.sort((a, b) => a.top - b.top);
      setLineBoxes(found);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(textNode);
    return () => ro.disconnect();
  }, [textNode]);

  // First time in view, the reveal starts; once.
  React.useEffect(() => {
    if (started) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      const later = window.setTimeout(() => setStarted(true), 0);
      return () => window.clearTimeout(later);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setStarted(true);
      },
      { threshold: 0.35 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [started]);

  const reach = useTransform(progress, (p) => r2(frontOf(stars * p)));

  // The visible lines, the ones the sweep inks in.
  const shownLines = (open ? lineBoxes : lineBoxes.filter((l) => l.top < foldH))
    .length;
  const measured = measuredLines !== null;

  // The reveal: one linear clock for the ink and the stars.
  React.useEffect(() => {
    if (!started || revealed || !measured) return;
    const count = Math.max(1, shownLines);
    if (!motionSafe) {
      run(
        "reveal",
        animate(progress, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: () => setRevealed(true),
        }),
      );
      return;
    }
    let done = false;
    amp.jump(r2(liquid * 2.2));
    run(
      "phase",
      animate(phase, phase.get() + count * 3, {
        duration: (count * pace) / 1000,
        ease: "linear",
      }),
    );
    run(
      "reveal",
      animate(progress, 1, {
        duration: (count * Math.max(60, pace)) / 1000,
        ease: "linear",
        onComplete: () => {
          done = true;
          // The front stops; the liquid behind it sloshes back and settles.
          run(
            "amp",
            animate(amp, 0, { ...springs.recoil, velocity: -liquid * 26 }),
          );
          setRevealed(true);
        },
      }),
    );
    const all = runs.current;
    return () => {
      if (done) return;
      // A re-run finishes the reveal rather than leaving it half-inked.
      all.get("reveal")?.stop();
      all.get("phase")?.stop();
      progress.jump(1);
      amp.jump(0);
      setRevealed(true);
    };
    // Starts once per reveal; the line count is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, revealed, measured, motionSafe]);

  const sweep = useTransform(progress, (p) => {
    if (p >= 1 || lineBoxes.length === 0) return "none";
    const visible = open ? lineBoxes : lineBoxes.filter((l) => l.top < foldH);
    const count = Math.max(1, visible.length);
    if (!motionSafe) return "none";
    const at = Math.min(count - 1, Math.floor(p * count));
    const line = visible[at];
    if (!line) return "none";
    const x = r2((p * count - at) * (line.right + SOFT * 2) - SOFT);
    return `linear-gradient(black, black) 0 0 / 100% ${line.top}px no-repeat, linear-gradient(to right, black ${r2(x - SOFT)}px, transparent ${r2(x + SOFT)}px) 0 ${line.top}px / 100% ${LH}px no-repeat`;
  });
  const textOpacity = useTransform(progress, (p) =>
    motionSafe ? 1 : r2(clamp01(p)),
  );

  // The fold. Bound to the measured height; the spring is `unroll`.
  const ticking = React.useRef(false);
  const shownH = React.useRef(-1);
  // Laid out before paint, so a short review never shows a frame at the
  // fold's height on its way to its own.
  useIsoLayoutEffect(() => {
    if (fullH === 0) return;
    const to = open ? fullH : Math.min(fullH, foldH);
    if (shownH.current === to) return;
    const first = shownH.current === -1;
    shownH.current = to;
    if (first || !motionSafe) {
      height.jump(to);
      return;
    }
    run(
      "height",
      animate(height, to, {
        ...UNROLL[unroll],
        onComplete: () => {
          ticking.current = false;
        },
      }),
    );
  }, [open, fullH, foldH, unroll, motionSafe, height]);

  // A tick for each line that passes the fold edge while the visitor unrolls.
  React.useEffect(() => {
    let passed = 0;
    return height.on("change", (h) => {
      if (!ticking.current) {
        passed = lineBoxes.filter((l) => l.top + LH <= h + 1).length;
        return;
      }
      const now = lineBoxes.filter((l) => l.top + LH <= h + 1).length;
      if (now > passed) {
        audio.play("tick", {
          pitch: r2(0.9 + now * 0.05),
          gain: 0.3,
        });
      }
      passed = now;
    });
  }, [height, lineBoxes, audio]);

  const fadeOpacity = useTransform(height, (h) => {
    if (!foldable) return 0;
    const span = Math.max(1, fullH - foldH);
    return r2(Math.max(0, 1 - clamp01((h - foldH) / span) * 1.6));
  });

  const [region, setRegion] = React.useState<HTMLDivElement | null>(null);
  const wantRegion = React.useRef(false);
  const toggleRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (!open || !region || !wantRegion.current) return;
    wantRegion.current = false;
    region.focus({ preventScroll: true });
  }, [open, region]);

  const setOpen = (next: boolean, focusBack = false) => {
    if (disabled || next === open) return;
    if (next) {
      // Anything still inking finishes at once: the visitor wants to read.
      if (!revealed) {
        runs.current.get("reveal")?.stop();
        runs.current.get("phase")?.stop();
        progress.jump(1);
        setRevealed(true);
        setStarted(true);
      }
      wantRegion.current = true;
      ticking.current = true;
    }
    if (expanded === undefined) setOwnOpen(next);
    onExpandedChange?.(next);
    if (!next && focusBack) toggleRef.current?.focus({ preventScroll: true });
  };

  const stir = () => {
    if (!motionSafe || liquid === 0 || !revealed) return;
    if (Math.abs(amp.get()) > liquid * 0.6) return;
    run("amp", animate(amp, 0, { ...springs.recoil, velocity: liquid * 22 }));
    run(
      "phase",
      animate(phase, phase.get() + 2.4, { duration: 0.6, ease: easings.enter }),
    );
  };

  // The photo deck fans on hover or keyboard focus; a tap pins it.
  const [fanHover, setFanHover] = React.useState(false);
  const [fanFocus, setFanFocus] = React.useState(false);
  const [fanPinned, setFanPinned] = React.useState(false);
  const fanned = !disabled && (fanHover || fanFocus || fanPinned);
  const fannedRef = React.useRef(fanned);
  React.useEffect(() => {
    fannedRef.current = fanned;
  });
  const photoTouch = React.useRef(false);
  const deckRef = React.useRef<HTMLUListElement | null>(null);
  React.useEffect(() => {
    if (!fanPinned) return;
    const onDown = (event: PointerEvent) => {
      const deck = deckRef.current;
      if (deck && event.target instanceof Node && deck.contains(event.target))
        return;
      setFanPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [fanPinned]);

  const chipUp = React.useRef<HTMLSpanElement | null>(null);
  const castVote = (next: ReviewVote) => {
    if (disabled) return;
    const to = next === myVote ? null : next;
    audio.play("pop", {
      pitch: to === "up" ? 1.15 : to === "down" ? 0.85 : 0.7,
      gain: to ? 0.5 : 0.3,
    });
    if (to === "up" && motionSafe && chipUp.current) {
      animate(chipUp.current, { scale: [1.22, 1] }, springs.recoil);
    }
    setAsked(true);
    if (vote === undefined) setOwnVote(to);
    onVoteChange?.(to);
  };

  const n = photos.length;
  const slot = 52 + 6 + 18 * fanK;
  const spreadAngle = 3 + 9 * fanK;
  const tilt = (i: number) => {
    const rand = seeded((photos[i]?.seed ?? i) * 977 + 13);
    return r2(-5 + rand() * 10);
  };

  const pill = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    "enabled:cursor-pointer disabled:cursor-not-allowed",
  );

  return (
    <article
      ref={rootRef}
      aria-labelledby={titleId}
      className={cn(
        "flex w-full max-w-[22rem] flex-col gap-3 rounded-4 border border-hairline bg-card p-4 text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-2"
          onPointerEnter={stir}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse") stir();
          }}
        >
          <LiquidStars
            rating={stars}
            reach={reach}
            amp={amp}
            phase={phase}
            clipId={`review-${safeId}-stars`}
            color={starColor}
          />
          <span
            aria-hidden
            className="font-mono text-xs text-ink-2 tabular-nums"
          >
            {Number(stars.toFixed(1))}
          </span>
        </div>
        <p className="shrink-0 text-xs text-ink-3">{when}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Heading
          id={titleId}
          className="text-base leading-6 font-medium text-foreground"
        >
          {title}
        </Heading>
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-3">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-medium"
            style={{
              backgroundColor:
                "oklch(from var(--accent) 0.84 0.07 calc(h + 96))",
              color: "oklch(from var(--accent) 0.32 0.07 calc(h + 96))",
            }}
          >
            {author
              .split(/\s+/)
              .map((w) => w.charAt(0))
              .join("")
              .replace(/[^A-Za-z]/g, "")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <span className="truncate">
            <span className="text-foreground">{author}</span>
            {authorDetail ? ` · ${authorDetail}` : ""}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <motion.div
          className="relative -mx-1.5 overflow-clip [contain:paint]"
          style={{
            height: fullH > 0 ? height : undefined,
            maxHeight: fullH > 0 || open ? undefined : foldH,
          }}
        >
          <div
            ref={setRegion}
            id={textId}
            role="region"
            aria-label={`Review by ${author}`}
            tabIndex={open ? -1 : undefined}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                setOpen(false, true);
              }
            }}
            className={cn(
              "rounded-2 px-1.5 outline-none",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <motion.div
              ref={setTextNode}
              className="flex flex-col gap-2 text-sm leading-5 text-ink-2"
              style={{
                // The shorthand, since each layer carries its own size and
                // place: completed lines above, the line being inked below.
                mask: revealed ? "none" : started ? sweep : HIDDEN,
                WebkitMask: revealed ? "none" : started ? sweep : HIDDEN,
                opacity: textOpacity,
              }}
            >
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </motion.div>
          </div>
          {foldable ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-card to-transparent"
              style={{ opacity: fadeOpacity }}
            />
          ) : null}
        </motion.div>
        {foldable ? (
          <button
            ref={toggleRef}
            type="button"
            disabled={disabled}
            aria-expanded={open}
            aria-controls={textId}
            onClick={() => setOpen(!open)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                setOpen(false, true);
              }
            }}
            className={cn(
              "inline-flex h-6 items-center gap-1 self-start rounded-1 text-xs font-medium text-cobalt-bright outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "enabled:cursor-pointer enabled:hover:underline disabled:cursor-not-allowed",
            )}
          >
            <span className="grid">
              <span
                aria-hidden={open || undefined}
                className={cn("col-start-1 row-start-1", open && "invisible")}
              >
                Read more
              </span>
              <span
                aria-hidden={!open || undefined}
                className={cn("col-start-1 row-start-1", !open && "invisible")}
              >
                Show less
              </span>
            </span>
            <motion.span
              aria-hidden
              className="grid size-4 place-items-center"
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          </button>
        ) : null}
      </div>

      {n > 0 ? (
        <ul
          ref={deckRef}
          role="list"
          aria-label={`${n} ${n === 1 ? "photo" : "photos"} from ${author}`}
          className="relative h-16 w-full touch-pan-y"
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch" && !disabled) setFanHover(true);
          }}
          onPointerLeave={() => setFanHover(false)}
          onPointerDown={(event) => {
            if (event.pointerType === "touch")
              photoTouch.current = !fannedRef.current;
          }}
          onFocus={(event) => {
            if (event.target.matches(":focus-visible")) setFanFocus(true);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next))
              return;
            setFanFocus(false);
          }}
        >
          {photos.map((ph, i) => {
            const mid = (n - 1) / 2;
            const x = fanned ? r2(i * slot) : r2(i * 7);
            const rotate = fanned ? r2((i - mid) * spreadAngle) : tilt(i);
            const y = fanned ? r2(Math.abs(i - mid) * 3 * fanK) : 0;
            return (
              <motion.li
                key={ph.id}
                className="absolute top-1 left-1 size-[52px]"
                style={{ zIndex: n - i, originX: 0.5, originY: 1 }}
                initial={false}
                animate={
                  motionSafe
                    ? { x, y, rotate }
                    : { x, y: 0, rotate: fanned ? 0 : tilt(i) }
                }
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        delay: fanned ? i * 0.04 : (n - 1 - i) * 0.025,
                      }
                    : { duration: 0 }
                }
              >
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Photo ${i + 1} of ${n}: ${ph.alt}`}
                  onClick={() => {
                    if (photoTouch.current) {
                      photoTouch.current = false;
                      setFanPinned(true);
                      return;
                    }
                    onPhotoOpen?.(ph.id);
                  }}
                  className={cn(
                    "block size-full overflow-clip rounded-2 shadow-[0_0_0_2px_var(--card)] outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "enabled:cursor-pointer disabled:cursor-not-allowed",
                  )}
                >
                  {ph.image ?? <Scene seed={ph.seed ?? i + 1} />}
                </button>
              </motion.li>
            );
          })}
        </ul>
      ) : null}

      <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
        <ShoppingBag aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{product}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <span className="mr-auto text-xs text-ink-3">Helpful?</span>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={myVote === "up"}
          aria-label={`Helpful, ${ups} ${ups === 1 ? "person" : "people"}`}
          onClick={() => castVote("up")}
          className={cn(
            pill,
            myVote === "up"
              ? "border-transparent bg-cobalt-wash text-cobalt-bright"
              : "border-hairline-strong text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
          )}
        >
          <ThumbsUp aria-hidden className="size-3.5 shrink-0" />
          Yes
          <span ref={chipUp} className="inline-flex font-mono">
            <Rolling text={String(ups)} motionSafe={motionSafe} />
          </span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={myVote === "down"}
          aria-label={`Not helpful, ${downs} ${downs === 1 ? "person" : "people"}`}
          onClick={() => castVote("down")}
          className={cn(
            pill,
            myVote === "down"
              ? "border-transparent bg-surface-2 text-foreground"
              : "border-hairline-strong text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
          )}
        >
          <ThumbsDown aria-hidden className="size-3.5 shrink-0" />
          No
          <span className="inline-flex font-mono">
            <Rolling text={String(downs)} motionSafe={motionSafe} />
          </span>
        </button>
      </div>

      <span aria-live="polite" aria-atomic className="sr-only">
        {said.words}
      </span>
    </article>
  );
}
