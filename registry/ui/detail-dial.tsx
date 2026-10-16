"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Check, Copy, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type DetailSentence = {
  /** Stable: the same sentence keeps its id at every depth. */
  id: string;
  /** The shallowest level it appears at, 1 (one line) to 4 (brief). */
  level: number;
  text: string;
};

export type DetailBlock = {
  id: string;
  /** A paragraph, a heading, or one step of a numbered list. */
  kind: "p" | "h" | "li";
  sentences: DetailSentence[];
};

export type DetailDialStatus = "ready" | "loading" | "error";

export type DetailDialProps = {
  /** The question the answer replies to. @default the Gaugeworks warranty question */
  question?: string;
  /** One answer, every level of it: blocks of sentences, each tagged with the level it first appears at. @default defaultDetailAnswer */
  answer?: DetailBlock[];
  /** A name for each answer level, shallowest first. @default ["One line", "Short", "Full", "Brief"] */
  levelNames?: string[];
  /** Controlled depth: a detent from 1 to `levels`. */
  depth?: number;
  /** Initial depth when uncontrolled. @default 2 */
  defaultDepth?: number;
  /** Fires from the drag, key or press that changed the depth. Return a promise and the deeper text waits, shown as being written, until it resolves; a rejection keeps the shallower text. */
  onDepthChange?: (depth: number) => void | Promise<unknown>;
  /** Copy this level was pressed, with the level's plain text. */
  onCopyLevel?: (depth: number, text: string) => void;
  /** How many detents the dial offers, 2 to 4; they spread evenly over the answer's levels. @default 4 */
  levels?: number;
  /** How fast new sentences unfurl and leaving ones fold away: 0.5 is slow, 2 is brisk. @default 1 */
  unfurlSpeed?: number;
  /** The dial's arc and pointer, new words' wash and the segmented pill: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Whether the answer has arrived. @default "ready" */
  status?: DetailDialStatus;
  /** Try again was pressed after the answer failed to load. */
  onReload?: () => void;
  /** The assistant answering, in the header. @default "Gaugeworks Assist" */
  model?: string;
  /** Reading speed for the time estimate. @default 230 */
  wordsPerMinute?: number;
  /** The surface's height in px; the answer scrolls inside. @default 540 */
  height?: number;
  /** The dial cannot be turned. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultDetailLevelNames = ["One line", "Short", "Full", "Brief"];

export const defaultDetailAnswer: DetailBlock[] = [
  {
    id: "b1",
    kind: "p",
    sentences: [
      {
        id: "lead",
        level: 1,
        text: "Water damage usually isn't covered by the G4's warranty, unless the water came from a Gaugeworks part.",
      },
      {
        id: "dates",
        level: 3,
        text: "You bought it on 14 March 2025, so you're inside the two-year warranty until 14 March 2027.",
      },
      {
        id: "covers",
        level: 2,
        text: "The warranty covers faults in how the thermostat was made, like a failed relay or a dead display.",
      },
      {
        id: "excludes",
        level: 3,
        text: "Damage from outside it, such as a leaking pipe or condensation from a badly sealed wall box, is excluded.",
      },
    ],
  },
  {
    id: "b2",
    kind: "p",
    sentences: [
      {
        id: "sensor",
        level: 2,
        text: "If the leak came from the G4's own humidity sensor housing, that counts as a fault and we'll replace the unit.",
      },
      {
        id: "note",
        level: 4,
        text: "A technician's note saying where the water came from makes that call much quicker.",
      },
      {
        id: "insurance",
        level: 3,
        text: "Otherwise your home insurance may cover it, since a leak that damages fixtures usually counts as escape of water.",
      },
    ],
  },
  {
    id: "b3",
    kind: "h",
    sentences: [{ id: "how", level: 4, text: "How to claim" }],
  },
  {
    id: "b4",
    kind: "li",
    sentences: [
      {
        id: "step1",
        level: 4,
        text: "Turn off the heating at the boiler before you take the G4 off the wall.",
      },
    ],
  },
  {
    id: "b5",
    kind: "li",
    sentences: [
      {
        id: "step2",
        level: 4,
        text: "Photograph the back plate and the wall box, including any water marks.",
      },
    ],
  },
  {
    id: "b6",
    kind: "li",
    sentences: [
      {
        id: "step3",
        level: 4,
        text: "Open a claim in the Gaugeworks app under Settings, Device, Warranty, and attach the photos.",
      },
    ],
  },
  {
    id: "b7",
    kind: "li",
    sentences: [
      {
        id: "step4",
        level: 4,
        text: "We reply within two working days, and if it's our fault a replacement ships the same day.",
      },
    ],
  },
];

const DEFAULT_QUESTION =
  "Water got into my Gaugeworks G4 thermostat. Is that covered by the warranty?";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

/** The dial sweeps 240°, from lower left to lower right, through the top. */
const SWEEP = 240;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clampInt = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(v)));

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** Detent k (1-based) of `levels`, spread over answer levels 1..`top`. */
const levelOf = (k: number, levels: number, top: number) =>
  levels <= 1
    ? top
    : k >= levels
      ? top
      : 1 + Math.floor(((k - 1) * (top - 1)) / (levels - 1));

const angleOf = (k: number, levels: number) =>
  levels <= 1 ? 0 : -SWEEP / 2 + ((k - 1) * SWEEP) / (levels - 1);

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))] as const;
};

const arcPath = (
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
) => {
  if (to - from < 0.5) return "";
  const [x0, y0] = polar(cx, cy, r, from);
  const [x1, y1] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
};

type Visible = {
  block: DetailBlock;
  sentences: DetailSentence[];
};

const visibleAt = (answer: DetailBlock[], level: number): Visible[] =>
  answer
    .map((block) => ({
      block,
      sentences: block.sentences.filter((s) => s.level <= level),
    }))
    .filter((v) => v.sentences.length > 0);

const textAt = (answer: DetailBlock[], level: number) => {
  let step = 0;
  return visibleAt(answer, level)
    .map((v) => {
      const line = v.sentences.map((s) => s.text).join(" ");
      if (v.block.kind === "li") {
        step += 1;
        return `${step}. ${line}`;
      }
      step = 0;
      return line;
    })
    .join("\n\n");
};

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * One answer, as short or as long as you want it. The dial beside it does not
 * swap texts: every depth contains the shallower ones word for word, so
 * turning it up lays the new sentences in where they belong while the words
 * you have already read glide apart to make room (each word is a
 * `layout="position"` element on `springs.glide`), then the new words unfurl
 * into the gaps in reading order. Turning it down folds the extra sentences
 * away on the exit ease and closes the gaps on the same glide. The pane keeps
 * your place: the sentence at the top of what you are reading stays where it
 * was while the text grows around it.
 *
 * The dial is a real slider: drag it round (1:1 with the pointer, rubber-banded
 * past the ends, the depth committing as you cross each detent, settling on
 * `springs.snap` with the release velocity), or use the arrow keys, Page Up and
 * Page Down, Home, End and the number keys. If the host returns a promise from
 * `onDepthChange`, the next level is shown being written until it arrives.
 * Under 36rem the dial becomes a segmented control above the answer. Under
 * reduced motion the new text fades in whole and the dial jumps.
 */
export function DetailDial({
  question = DEFAULT_QUESTION,
  answer = defaultDetailAnswer,
  levelNames = defaultDetailLevelNames,
  depth,
  defaultDepth = 2,
  onDepthChange,
  onCopyLevel,
  levels: levelsProp = 4,
  unfurlSpeed = 1,
  accent = "var(--accent-bright)",
  status = "ready",
  onReload,
  model = "Gaugeworks Assist",
  wordsPerMinute = 230,
  height = 540,
  disabled = false,
  className,
}: DetailDialProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const levels = clampInt(levelsProp, 2, 4);
  const top = Math.max(
    1,
    ...answer.flatMap((b) => b.sentences.map((s) => s.level)),
  );
  const speed = Math.min(2, Math.max(0.5, unfurlSpeed));

  const [own, setOwn] = React.useState(() => clampInt(defaultDepth, 1, levels));
  const target = clampInt(depth ?? own, 1, levels);
  const [shown, setShown] = React.useState(target);
  const [leaving, setLeaving] = React.useState<Set<string> | null>(null);
  const [writing, setWriting] = React.useState<number | null>(null);
  const [failedAt, setFailedAt] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const shownSafe = clampInt(shown, 1, levels);

  const shownLevel = levelOf(shownSafe, levels, top);
  const visible = visibleAt(answer, shownLevel);
  const shownWords = visible.reduce(
    (n, v) => n + v.sentences.reduce((m, s) => m + words(s.text).length, 0),
    0,
  );
  const seconds = Math.max(
    5,
    Math.round(((shownWords / Math.max(60, wordsPerMinute)) * 60) / 5) * 5,
  );
  const readTime =
    seconds < 60 ? `${seconds} s read` : `${Math.round(seconds / 60)} min read`;

  /* --------------------------- refs, nodes -------------------------- */

  const paneRef = React.useRef<HTMLDivElement | null>(null);
  const shownRef = React.useRef(shown);
  const pending = React.useRef<{
    depth: number;
    promise: Promise<unknown>;
  } | null>(null);
  const anchor = React.useRef<{ id: string; offset: number } | null>(null);
  const copyTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );
  /** The sentences present before the newest growth: the rest are new. */
  const [known, setKnown] = React.useState<Set<string>>(
    () =>
      new Set(
        visibleAt(answer, levelOf(target, levels, top)).flatMap((v) =>
          v.sentences.map((s) => s.id),
        ),
      ),
  );
  React.useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  /** Where the first sentence you are reading sits, so it can stay there. */
  const recordAnchor = (keep: (id: string) => boolean) => {
    const pane = paneRef.current;
    if (!pane) return;
    const top = pane.scrollTop;
    let best: { id: string; offset: number } | null = null;
    for (const el of pane.querySelectorAll<HTMLElement>("[data-dd-first]")) {
      const sid = el.dataset.ddFirst;
      if (!sid || !keep(sid)) continue;
      const y = el.offsetTop;
      if (y + el.offsetHeight < top + 4) continue;
      if (!best || y - top < best.offset) best = { id: sid, offset: y - top };
    }
    anchor.current = best;
  };

  React.useLayoutEffect(() => {
    const a = anchor.current;
    const pane = paneRef.current;
    anchor.current = null;
    if (!a || !pane) return;
    const el = pane.querySelector<HTMLElement>(
      `[data-dd-first="${CSS.escape(a.id)}"]`,
    );
    if (!el) return;
    const next = el.offsetTop - a.offset;
    if (Math.abs(next - pane.scrollTop) > 1) pane.scrollTop = Math.max(0, next);
  }, [shown]);

  // A new target depth is shown by growing or folding the one text. Growth
  // waits for the host's promise when there is one; folding fades the
  // leaving sentences first and only then closes the gaps.
  const timing = React.useRef({ speed, motionSafe, levels, top, answer });
  React.useEffect(() => {
    timing.current = { speed, motionSafe, levels, top, answer };
  });
  React.useEffect(() => {
    const from = shownRef.current;
    if (target === from) {
      // Turned back before a fold finished: the text never left, so the
      // half-faded sentences come straight back.
      const raf = window.requestAnimationFrame(() => {
        setLeaving(null);
        setWriting(null);
      });
      return () => window.cancelAnimationFrame(raf);
    }
    const {
      speed: k,
      motionSafe: rich,
      levels: n,
      top: t,
      answer: a,
    } = timing.current;
    const before = visibleAt(a, levelOf(from, n, t)).flatMap((v) =>
      v.sentences.map((s) => s.id),
    );
    const after = visibleAt(a, levelOf(target, n, t)).flatMap((v) =>
      v.sentences.map((s) => s.id),
    );
    let alive = true;
    const timers: number[] = [];

    const grow = () => {
      recordAnchor(() => true);
      setLeaving(null);
      setKnown(new Set(before));
      setWriting(null);
      setFailedAt(null);
      setShown(target);
      const added = after.length - before.length;
      setAnnouncement(
        `${added} ${added === 1 ? "sentence" : "sentences"} added.`,
      );
      // Once the new words have unfurled, their wash drains away.
      timers.push(
        window.setTimeout(
          () => {
            if (alive) setKnown(new Set(after));
          },
          rich ? Math.round(1400 / k) : 600,
        ),
      );
    };

    const raf = window.requestAnimationFrame(() => {
      if (!alive) return;
      if (target > from) {
        const host = pending.current;
        if (host && host.depth === target) {
          setWriting(target);
          setAnnouncement(`Writing level ${target}.`);
          host.promise.then(
            () => {
              if (!alive) return;
              pending.current = null;
              grow();
            },
            () => {
              if (!alive) return;
              pending.current = null;
              setWriting(null);
              setFailedAt(target);
              setAnnouncement(`Couldn't write level ${target}.`);
              if (depth === undefined) setOwn(from);
            },
          );
        } else {
          grow();
        }
        return;
      }
      const keep = new Set(after);
      const gone = new Set(before.filter((id) => !keep.has(id)));
      setLeaving(gone);
      setWriting(null);
      timers.push(
        window.setTimeout(
          () => {
            if (!alive) return;
            recordAnchor((id) => keep.has(id));
            setLeaving(null);
            setKnown(new Set(after));
            setShown(target);
            setAnnouncement(
              `${gone.size} ${gone.size === 1 ? "sentence" : "sentences"} hidden.`,
            );
          },
          rich ? Math.round((durations.base * 1000) / k) : 120,
        ),
      );
    });
    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      for (const id of timers) window.clearTimeout(id);
    };
    // The run reads its tuning from `timing`; only a new target starts one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  /* ------------------------------ commit ---------------------------- */

  const change = (next: number) => {
    if (disabled || status !== "ready") return;
    const k = clampInt(next, 1, levels);
    if (k === target) return;
    if (depth === undefined) setOwn(k);
    setFailedAt(null);
    const result = onDepthChange?.(k);
    if (
      result &&
      typeof (result as Promise<unknown>).then === "function" &&
      k > shownRef.current
    ) {
      pending.current = { depth: k, promise: result as Promise<unknown> };
    } else {
      pending.current = null;
    }
  };

  /* ------------------------------- dial ----------------------------- */

  const angle = useMotionValue(angleOf(target, levels));
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  /** The detent angle a release is already springing to, with its velocity. */
  const heading = React.useRef<number | null>(null);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef({ pointer: 0, dial: 0 });
  const samples = React.useRef<{ a: number; t: number }[]>([]);
  const dialRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const to = angleOf(target, levels);
    if (dragging.current || heading.current === to) return;
    if (!motionSafe) {
      settle.current?.stop();
      angle.jump(to);
      return;
    }
    settle.current?.stop();
    const c = animate(angle, to, springs.snap);
    settle.current = c;
    heading.current = to;
    return () => c.stop();
  }, [angle, levels, motionSafe, target]);

  const pointerAngle = (x: number, y: number) => {
    const el = dialRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  const nearest = (a: number) => {
    let best = 1;
    for (let k = 1; k <= levels; k++)
      if (
        Math.abs(angleOf(k, levels) - a) < Math.abs(angleOf(best, levels) - a)
      )
        best = k;
    return best;
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || status !== "ready",
    onStart: ({ point }) => {
      dragging.current = true;
      heading.current = null;
      settle.current?.stop();
      dragFrom.current = {
        pointer: pointerAngle(point.x, point.y),
        dial: angle.get(),
      };
      samples.current = [];
    },
    onMove: ({ point, event }) => {
      // Unwrap step by step, so a turn that crosses the bottom of the dial
      // (where the pointer's angle flips sign) stays continuous.
      const now = pointerAngle(point.x, point.y);
      let step = now - dragFrom.current.pointer;
      if (step > 180) step -= 360;
      if (step < -180) step += 360;
      dragFrom.current = { pointer: now, dial: dragFrom.current.dial + step };
      const raw = dragFrom.current.dial;
      const a = rubberClamp(raw, -SWEEP / 2, SWEEP / 2, 90);
      angle.set(r2(a));
      samples.current.push({ a, t: event.timeStamp });
      if (samples.current.length > 6) samples.current.shift();
      const k = nearest(Math.max(-SWEEP / 2, Math.min(SWEEP / 2, a)));
      if (k !== target) change(k);
    },
    onEnd: () => {
      dragging.current = false;
      const s = samples.current;
      const first = s[0];
      const last = s[s.length - 1];
      const dt = first && last ? last.t - first.t : 0;
      const velocity =
        first && last && dt > 8 ? ((last.a - first.a) / dt) * 1000 : 0;
      const projected = angle.get() + (velocity / 1000) * 90;
      const k = nearest(Math.max(-SWEEP / 2, Math.min(SWEEP / 2, projected)));
      const to = angleOf(k, levels);
      // The release springs to its detent carrying the throw; the depth
      // effect sees it heading there and leaves it alone.
      settle.current?.stop();
      heading.current = to;
      settle.current = motionSafe
        ? animate(angle, to, { ...springs.snap, velocity })
        : animate(angle, to, { duration: 0 });
      change(k);
    },
    onCancel: () => {
      dragging.current = false;
      heading.current = angleOf(target, levels);
      settle.current = animate(angle, heading.current, springs.snap);
    },
    onTap: (event) => {
      // A tap on the ring picks the nearest detent; the knob itself is a grip.
      const el = dialRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = Math.hypot(
        event.clientX - (r.left + r.width / 2),
        event.clientY - (r.top + r.height / 2),
      );
      if (dist > r.width * 0.3)
        change(nearest(pointerAngle(event.clientX, event.clientY)));
    },
  });

  const onKey = (event: React.KeyboardEvent) => {
    const k = event.key;
    let next: number | null = null;
    if (k === "ArrowUp" || k === "ArrowRight") next = target + 1;
    else if (k === "ArrowDown" || k === "ArrowLeft") next = target - 1;
    else if (k === "PageUp") next = target + 2;
    else if (k === "PageDown") next = target - 2;
    else if (k === "Home") next = 1;
    else if (k === "End") next = levels;
    else if (/^[1-9]$/.test(k) && Number(k) <= levels) next = Number(k);
    if (next === null) return;
    event.preventDefault();
    change(next);
  };

  const fill = useTransform(angle, (a) =>
    arcPath(
      56,
      56,
      41,
      -SWEEP / 2,
      Math.max(-SWEEP / 2, Math.min(SWEEP / 2 + 20, a)),
    ),
  );

  /* ------------------------------ styles ---------------------------- */

  const vars = {
    "--dd-accent": accent,
    "--dd-wash": `color-mix(in oklab, ${accent} 14%, transparent)`,
    "--dd-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--dd-solid": `oklch(from ${accent} 0.55 c h)`,
  } as React.CSSProperties;
  const focusRing =
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
  const nameOf = (k: number) =>
    levelNames[levelOf(k, levels, top) - 1] ?? `Level ${k}`;
  const valueText = `Level ${target} of ${levels}, ${nameOf(target)}${writing === target ? ", being written" : `, ${shownWords} words`}`;
  const ready = status === "ready";

  /* ------------------------------ answer ---------------------------- */

  const newIds = visible
    .flatMap((v) => v.sentences.map((s) => s.id))
    .filter((id) => !known.has(id));
  const step = cascade(Math.max(1, newIds.length)) / speed;
  const wordStep = 0.014 / speed;
  const lead = motionSafe ? 0.16 / speed : 0;
  const fade = (motionSafe ? durations.base : durations.fast) / speed;

  const renderWords = (s: DetailSentence) => {
    const list = words(s.text);
    const isNew = newIds.includes(s.id);
    const going = leaving?.has(s.id) ?? false;
    const order = newIds.indexOf(s.id);
    return list.map((w, i) => (
      <React.Fragment key={`${s.id}|${i}`}>
        {i > 0 ? " " : null}
        <motion.span
          data-dd-first={i === 0 ? s.id : undefined}
          layout={motionSafe ? "position" : false}
          initial={
            isNew
              ? motionSafe
                ? { opacity: 0, y: distances.nudge }
                : { opacity: 0 }
              : false
          }
          animate={going ? { opacity: 0, y: 0 } : { opacity: 1, y: 0 }}
          transition={{
            layout: motionSafe ? springs.glide : { duration: 0 },
            opacity: going
              ? { duration: fade * 0.8, ease: easings.exit }
              : {
                  duration: fade,
                  ease: easings.enter,
                  delay:
                    isNew && motionSafe
                      ? lead + order * step + i * wordStep
                      : 0,
                },
            y:
              isNew && motionSafe
                ? {
                    ...springs.glide,
                    delay: lead + order * step + i * wordStep,
                  }
                : { duration: 0 },
          }}
          className="inline-block"
        >
          {w}
        </motion.span>
      </React.Fragment>
    ));
  };

  const stepNos = visible.reduce<number[]>((acc, v, i) => {
    const prev = i > 0 ? (acc[i - 1] ?? 0) : 0;
    return [...acc, v.block.kind === "li" ? prev + 1 : 0];
  }, []);
  const blocks = visible.map((v, index) => {
    const stepNo = stepNos[index] ?? 0;
    const content = v.sentences.map((s, i) => (
      <React.Fragment key={s.id}>
        {i > 0 ? " " : null}
        <span
          data-dd-sentence={s.id}
          className={cn(
            "rounded-[3px] [box-decoration-break:clone] transition-[background-color] duration-700",
            newIds.includes(s.id) && motionSafe
              ? "bg-(--dd-wash)"
              : "bg-transparent",
          )}
        >
          {renderWords(s)}
        </span>
      </React.Fragment>
    ));
    if (v.block.kind === "h")
      return (
        <h3
          key={v.block.id}
          className="pt-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase"
        >
          {content}
        </h3>
      );
    if (v.block.kind === "li")
      return (
        <div key={v.block.id} role="listitem" className="flex gap-2.5">
          <motion.span
            aria-hidden
            layout={motionSafe ? "position" : false}
            transition={{ layout: springs.glide }}
            className="inline-flex h-[1.7em] w-4 shrink-0 items-center justify-end font-mono text-[11px] text-(--dd-accent) tabular-nums"
          >
            {stepNo}.
          </motion.span>
          <p className="min-w-0 flex-1">{content}</p>
        </div>
      );
    return <p key={v.block.id}>{content}</p>;
  });

  // Consecutive steps read as one list, keyed by its first step.
  const grouped = visible.reduce<
    { key: string; list: boolean; nodes: React.ReactNode[] }[]
  >((acc, v, i) => {
    const node = blocks[i];
    const last = acc[acc.length - 1];
    const isStep = v.block.kind === "li";
    if (isStep && last?.list) {
      return [...acc.slice(0, -1), { ...last, nodes: [...last.nodes, node] }];
    }
    return [...acc, { key: v.block.id, list: isStep, nodes: [node] }];
  }, []);

  /* ------------------------------ render ---------------------------- */

  const copy = () => {
    const text = textAt(answer, shownLevel);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    onCopyLevel?.(shownSafe, text);
    try {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    } catch {
      // No clipboard here; the callback still has the text.
    }
    setCopied(true);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const ticks = Array.from({ length: levels }, (_, i) => i + 1);
  const dial = (
    <div className="hidden flex-col items-center gap-2 @min-[36rem]/detail-dial:flex">
      <div
        ref={dialRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Answer depth"
        aria-valuemin={1}
        aria-valuemax={levels}
        aria-valuenow={target}
        aria-valuetext={valueText}
        aria-disabled={disabled || !ready || undefined}
        aria-orientation="vertical"
        onKeyDown={onKey}
        {...drag}
        className={cn(
          "relative size-28 touch-none rounded-full select-none",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-grab active:cursor-grabbing",
          focusRing,
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 112 112"
          className="size-28 overflow-visible"
        >
          <path
            d={arcPath(56, 56, 41, -SWEEP / 2, SWEEP / 2)}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className="stroke-hairline-strong"
          />
          <motion.path
            d={fill}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            className={cn(
              "stroke-(--dd-accent)",
              writing !== null && motionSafe && "animate-pulse",
            )}
          />
          {ticks.map((k) => {
            const a = angleOf(k, levels);
            const [x0, y0] = polar(56, 56, 46, a);
            const [x1, y1] = polar(56, 56, 50, a);
            const [lx, ly] = polar(56, 56, 56.5, a);
            const on = k <= target;
            return (
              <g key={k}>
                <line
                  x1={x0}
                  y1={y0}
                  x2={x1}
                  y2={y1}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className={on ? "stroke-(--dd-accent)" : "stroke-ink-3"}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    "font-mono text-[8.5px] tabular-nums",
                    k === target
                      ? "fill-(--dd-accent) font-semibold"
                      : "fill-ink-3",
                  )}
                >
                  {k}
                </text>
              </g>
            );
          })}
          <motion.g style={{ rotate: angle, originX: 0.5, originY: 0.5 }}>
            <circle
              cx={56}
              cy={56}
              r={30}
              className="fill-surface-1 stroke-hairline-strong"
              strokeWidth={1}
            />
            <circle cx={56} cy={56} r={25} className="fill-surface-2" />
            <line
              x1={56}
              y1={34}
              x2={56}
              y2={44}
              strokeWidth={3}
              strokeLinecap="round"
              className="stroke-(--dd-accent)"
            />
          </motion.g>
          <circle cx={56} cy={56} r={2} className="fill-ink-3" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-[13px] font-semibold text-foreground">
          {nameOf(target)}
        </span>
        <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
          {writing === target
            ? "writing…"
            : `${shownWords} words · ${readTime}`}
        </span>
      </div>
      <ul aria-hidden className="flex w-full flex-col gap-0.5 pt-1">
        {ticks.map((k) => (
          <li key={k}>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => change(k)}
              className={cn(
                "flex h-6 w-full items-center gap-2 rounded-2 px-2 text-left text-[11.5px] transition-colors duration-150",
                k === target
                  ? "bg-(--dd-wash) text-(--dd-accent)"
                  : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <span className="w-3 font-mono text-[10px] tabular-nums">
                {k}
              </span>
              {nameOf(k)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const segmented = (
    <div className="flex flex-col gap-1.5 @min-[36rem]/detail-dial:hidden">
      <div
        role="radiogroup"
        aria-label="Answer depth"
        className="relative flex rounded-2 border border-hairline bg-surface-1 p-0.5"
      >
        {ticks.map((k) => {
          const on = k === target;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onKeyDown={(event) => {
                onKey(event);
                if (/^(Arrow|Page|Home|End|[1-9])/.test(event.key)) {
                  const group = event.currentTarget.parentElement;
                  window.requestAnimationFrame(() =>
                    group
                      ?.querySelector<HTMLButtonElement>(
                        '[aria-checked="true"]',
                      )
                      ?.focus(),
                  );
                }
              }}
              onClick={() => change(k)}
              className={cn(
                "relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-[5px] px-1 text-[11.5px] transition-colors duration-150",
                on
                  ? "font-semibold text-(--dd-accent)"
                  : "text-ink-2 hover:text-foreground",
                focusRing,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-pill`}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className="absolute inset-0 rounded-[5px] border border-(--dd-line) bg-(--dd-wash)"
                />
              ) : null}
              <span className="relative truncate">{nameOf(k)}</span>
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[10.5px] text-ink-3 tabular-nums">
        {writing === target
          ? `Level ${target} of ${levels} · writing…`
          : `Level ${target} of ${levels} · ${shownWords} words · ${readTime}`}
      </p>
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container/detail-dial relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, height }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-(--dd-wash) font-mono text-[10px] font-semibold text-(--dd-accent)"
          >
            {model.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-[13.5px] leading-5 font-semibold"
            >
              {model}
            </h2>
            <p className="truncate font-mono text-[10.5px] text-ink-3">
              one answer · {levels} depths
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled || !ready}
          onClick={copy}
          aria-label={
            copied
              ? "Copied"
              : `Copy the ${nameOf(shownSafe).toLowerCase()} answer`
          }
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-[12px] transition-colors duration-150 disabled:opacity-50",
            copied
              ? "border-(--dd-line) bg-(--dd-wash) text-(--dd-accent)"
              : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
            focusRing,
          )}
        >
          {copied ? (
            <motion.span
              initial={motionSafe ? { scale: 0.6 } : false}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
              className="inline-flex"
            >
              <Check aria-hidden className="size-3.5" />
            </motion.span>
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          <span className="hidden @min-[24rem]/detail-dial:inline">
            {copied ? "Copied" : "Copy this level"}
          </span>
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4 pt-3 @min-[36rem]/detail-dial:flex-row-reverse @min-[36rem]/detail-dial:gap-6 @min-[36rem]/detail-dial:pt-4">
        <div className="shrink-0 @min-[36rem]/detail-dial:w-38">
          {segmented}
          {dial}
        </div>
        {/* Not a layoutScroll node on purpose: the FLIP is measured in screen
            space, so after the pane is scrolled to hold your place, the words
            you are reading measure as unmoved and stay still. */}
        <div
          ref={paneRef}
          className="relative flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] @min-[36rem]/detail-dial:-my-1 @min-[36rem]/detail-dial:py-1"
        >
          <div className="mx-auto flex max-w-[42rem] flex-col gap-3 pb-2">
            <p className="ml-auto max-w-[88%] rounded-3 rounded-tr-1 border border-hairline bg-surface-2 px-3 py-2 text-[13px] leading-[1.55] text-foreground">
              {question}
            </p>
            {status === "loading" ? (
              <div aria-busy className="flex flex-col gap-2.5">
                {[94, 88, 72].map((w, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="h-3 animate-pulse rounded-1 bg-surface-2"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </div>
            ) : status === "error" ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <TriangleAlert aria-hidden className="size-5 text-danger" />
                <p className="text-[13px] text-ink-2">
                  Couldn’t write the answer.
                </p>
                {onReload ? (
                  <button
                    type="button"
                    onClick={onReload}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs hover:bg-surface-2",
                      focusRing,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Try again
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-[13.5px] leading-[1.7] text-ink-2">
                {grouped.map((g) =>
                  g.list ? (
                    <div
                      key={g.key}
                      role="list"
                      className="flex flex-col gap-1.5"
                    >
                      {g.nodes}
                    </div>
                  ) : (
                    g.nodes
                  ),
                )}
                {writing !== null ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: durations.fast }}
                    className="flex flex-col gap-2"
                  >
                    <p className="flex items-center gap-1.5 font-mono text-[11px] text-(--dd-accent)">
                      {`Writing the ${nameOf(writing).toLowerCase()} version`}
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block h-3.5 w-[2px] rounded-full bg-(--dd-accent)",
                          motionSafe && "animate-pulse",
                        )}
                      />
                    </p>
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-[92%] rounded-1 bg-(--dd-wash)",
                        motionSafe && "animate-pulse",
                      )}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-[64%] rounded-1 bg-(--dd-wash)",
                        motionSafe && "animate-pulse",
                      )}
                    />
                  </motion.div>
                ) : null}
                {failedAt !== null ? (
                  <p className="flex items-center gap-1.5 text-[12px] text-danger">
                    <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                    Couldn’t write that level. Try again.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <p role="status" className="sr-only">
        {copied ? "Copied." : ""}
      </p>
    </section>
  );
}
