"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlugSeparator = "-" | "_";

export type SlugFieldProps = {
  /** Controlled title. */
  title?: string;
  /** Initial title when uncontrolled. @default "" */
  defaultTitle?: string;
  /** Fires as the title is typed. */
  onTitleChange?: (title: string) => void;
  /** The title field's visible label. @default "Title" */
  titleLabel?: string;
  /** Form field name for the title. */
  titleName?: string;
  /** Placeholder for an empty title. */
  titlePlaceholder?: string;
  /** Controlled slug. */
  value?: string;
  /** Initial slug when uncontrolled. @default derived from the title */
  defaultValue?: string;
  /** Fires from the keystroke, press or offer that changed the slug. */
  onValueChange?: (slug: string) => void;
  /** The slug field's visible label. @default "URL" */
  label?: string;
  /** Form field name for the slug. */
  name?: string;
  /** What comes before the slug, shown in the box, e.g. `fernworks.journal/posts/`. */
  prefix?: string;
  /** Controlled: whether the slug follows the title. */
  linked?: boolean;
  /** Initial link when uncontrolled. @default true, unless `defaultValue` differs from the title's slug */
  defaultLinked?: boolean;
  /** Fires when a hand edit unlinks the slug or the control relinks it. */
  onLinkedChange?: (linked: boolean) => void;
  /** The character between words. @default "-" */
  separator?: SlugSeparator;
  /** The longest slug the title makes; hand typing past it is flagged, not blocked. @default 48 */
  max?: number;
  /** Check whether the slug is free, with `isTaken`. @default true */
  check?: boolean;
  /** The host's availability check. May be async. */
  isTaken?: (slug: string) => boolean | Promise<boolean>;
  /** Guidance under the slug. @default what a slug may contain */
  hint?: string;
  /** An error from the host; shown and announced once. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Play the letters landing and the relink. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

type Kind = "flight" | "hand" | "plain";
type Meta = { kind: Kind; delay: number; ghost?: string };
type Glyph = Meta & { id: number; ch: string };
type Layer = { text: string; glyphs: Glyph[]; seq: number };
type Intent = {
  base: string;
  text: string;
  meta: Meta[];
  scroll: number | null;
};
type Ghost = {
  id: number;
  ch: string;
  mono: boolean;
  fall: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
  tilt: number;
};
type Result = { slug: string; taken: boolean; offer: string | null };
type Slugged = { text: string; from: number[] };

/** How long a letter takes to drop from the title into its slot, in s. */
const FLY = 0.32;
const MOST_FLIGHTS = 16;
const MOST_GHOSTS = 24;
const CHECK_MS = 300;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const APOSTROPHE = /['’‘`´]/;
const SPECIAL: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  đ: "d",
  ð: "d",
  ł: "l",
  þ: "th",
  ı: "i",
};

/** One character, folded to lowercase ASCII letters and digits, or nothing. */
function fold(ch: string): string {
  const lower = ch.toLowerCase();
  const special = SPECIAL[lower];
  if (special) return special;
  const plain = lower.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /^[a-z0-9]+$/.test(plain) ? plain : "";
}

/**
 * Text to a slug, remembering which character made each letter (`from`, -1
 * for a separator). Runs of anything else become one separator, apostrophes
 * vanish, "&" is the word "and". Cut at `max` on a word boundary when one is
 * close; a trailing separator is kept only while a hand is still typing.
 */
function slugOf(
  text: string,
  sep: string,
  opts: { max?: number; trailing?: boolean } = {},
): Slugged {
  const chars = Array.from(text);
  let out = "";
  const from: number[] = [];
  let gap = false;
  // Only a space or a separator typed at the end means "a word comes next";
  // a trailing "!" is simply dropped.
  let soft = false;
  chars.forEach((ch, i) => {
    if (APOSTROPHE.test(ch)) return;
    if (ch === "&") {
      if (out.length) {
        out += sep;
        from.push(-1);
      }
      for (const c of "and") {
        out += c;
        from.push(i);
      }
      gap = true;
      soft = false;
      return;
    }
    const f = fold(ch);
    if (!f) {
      gap = true;
      soft = /[\s\-_./]/.test(ch);
      return;
    }
    if (gap && out.length) {
      out += sep;
      from.push(-1);
    }
    gap = false;
    soft = false;
    for (const c of f) {
      out += c;
      from.push(i);
    }
  });
  if (opts.trailing && gap && soft && out.length) {
    out += sep;
    from.push(-1);
  }
  if (opts.max !== undefined && out.length > opts.max) {
    let cut = out.lastIndexOf(sep, opts.max);
    if (cut < Math.floor(opts.max * 0.6)) cut = opts.max;
    out = out.slice(0, cut);
    from.length = cut;
  }
  if (!opts.trailing || (opts.max !== undefined && out.length >= opts.max)) {
    while (out.endsWith(sep)) {
      out = out.slice(0, -1);
      from.pop();
    }
  }
  return { text: out, from };
}

/** A slug with a number on the end, still inside `max`. */
function numbered(base: string, n: number, sep: string, max: number): string {
  const tail = `${sep}${n}`;
  let head = base.slice(0, Math.max(1, max - tail.length));
  while (head.endsWith(sep)) head = head.slice(0, -1);
  return `${head}${tail}`;
}

/** Where two strings differ: common prefix, then how many went and came. */
function diff(a: string, b: string) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p += 1;
  let s = 0;
  while (
    s < a.length - p &&
    s < b.length - p &&
    a[a.length - 1 - s] === b[b.length - 1 - s]
  ) {
    s += 1;
  }
  return { p, removed: a.length - p - s, added: b.length - p - s };
}

const layerOf = (text: string): Layer => ({
  text,
  glyphs: Array.from(text, (ch, i) => ({
    id: i,
    ch,
    kind: "plain",
    delay: 0,
  })),
  seq: text.length,
});

/** One cell of the slug: a letter that drops in, or a separator that opens. */
function GlyphCell({
  glyph,
  motionSafe,
  separator,
}: {
  glyph: Glyph;
  motionSafe: boolean;
  separator: boolean;
}) {
  return (
    <motion.span
      layout={motionSafe ? "position" : false}
      initial={
        motionSafe
          ? separator
            ? { opacity: 0, scaleX: 0, y: 0 }
            : {
                opacity: 0,
                scaleX: 1,
                y: glyph.kind === "flight" ? 0 : -distances.nudge,
              }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, scaleX: 1, y: 0 }}
      exit={
        motionSafe
          ? { opacity: 0, scale: 0.6, transition: exitFor(durations.fast) }
          : { opacity: 0, transition: exitFor(durations.blink) }
      }
      transition={
        motionSafe
          ? { ...springs.flick, delay: glyph.delay, layout: springs.glide }
          : { duration: durations.fast }
      }
      className="relative inline-block w-[1ch] shrink-0 text-center"
    >
      {glyph.ch}
      {glyph.ghost && motionSafe ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 text-ink-3"
          initial={{ y: -8, opacity: 1 }}
          animate={{ y: 3, opacity: 0 }}
          transition={{ duration: durations.base, ease: [0.5, 0, 0.9, 0.5] }}
        >
          {glyph.ghost}
        </motion.span>
      ) : null}
    </motion.span>
  );
}

/** Two links of chain; apart when the slug no longer follows the title. */
function Chain({
  broken,
  motionSafe,
}: {
  broken: boolean;
  motionSafe: boolean;
}) {
  const t = motionSafe
    ? broken
      ? springs.snap
      : springs.glide
    : { duration: 0 };
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0">
      <g transform="rotate(-45 8 8)">
        <motion.g
          initial={false}
          animate={broken ? { x: -1.6, rotate: -16 } : { x: 0, rotate: 0 }}
          transition={t}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          <rect
            x={1.25}
            y={5.75}
            width={7.75}
            height={4.5}
            rx={2.25}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </motion.g>
        <motion.g
          initial={false}
          animate={broken ? { x: 1.6, rotate: 16 } : { x: 0, rotate: 0 }}
          transition={t}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          <rect
            x={7}
            y={5.75}
            width={7.75}
            height={4.5}
            rx={2.25}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          />
        </motion.g>
      </g>
    </svg>
  );
}

/**
 * A title and the URL slug that follows it. As the title is typed each new
 * slug letter drops out of the title — a ghost of the character as typed,
 * capital or accent and all, falls from the caret into its slot and becomes
 * the lowercase letter as it lands, on the flick spring — while a character
 * the slug cannot hold (`!`, `?`, an emoji) falls away before it gets there.
 * Words are joined by `separator`, the slug is cut at `max` on a word
 * boundary, and editing the middle of a title slides the later letters to
 * their new cells on the glide spring.
 *
 * Typing in the slug itself is folded the same way as you type and unlinks it
 * from the title: the tether between the label and the link control snaps and
 * its halves droop apart, and the chain comes undone. The "Follow title"
 * toggle relinks it, and the slug re-derives with its letters dropping in.
 * With `check`, a pause checks the slug with `isTaken`; a taken slug offers
 * the first free numbered one, which stays linked to the title.
 *
 * Both are real inputs — the slug's glyphs are drawn over a transparent one,
 * so the caret, selection, undo and IME are the platform's. Under reduced
 * motion nothing flies, falls or slides: letters fade into their cells, and
 * the slug, the check and the counter still update.
 */
export function SlugField({
  title,
  defaultTitle = "",
  onTitleChange,
  titleLabel = "Title",
  titleName,
  titlePlaceholder,
  value,
  defaultValue,
  onValueChange,
  label = "URL",
  name,
  prefix,
  linked,
  defaultLinked,
  onLinkedChange,
  separator = "-",
  max = 48,
  check = true,
  isTaken,
  hint,
  error,
  required = false,
  disabled = false,
  sound = false,
  className,
}: SlugFieldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const slugId = `${uid}-slug`;
  const hintId = `${uid}-hint`;
  const statusId = `${uid}-status`;
  const errorId = `${uid}-error`;
  const sep = separator === "_" ? "_" : "-";
  const top = clamp(Math.round(max), 8, 200);

  const [ownTitle, setOwnTitle] = React.useState(defaultTitle);
  const [ownLinked, setOwnLinked] = React.useState(
    () =>
      defaultLinked ??
      (defaultValue === undefined ||
        defaultValue === slugOf(defaultTitle, sep, { max: top }).text),
  );
  const [ownSlug, setOwnSlug] = React.useState(
    () => defaultValue ?? slugOf(defaultTitle, sep, { max: top }).text,
  );
  const [suffix, setSuffix] = React.useState<{
    base: string;
    n: number;
  } | null>(null);

  // A new separator carries a hand-made slug and a taken number across.
  const [sepSeen, setSepSeen] = React.useState(sep);
  if (sepSeen !== sep) {
    setSepSeen(sep);
    setOwnSlug(ownSlug.split(sepSeen).join(sep));
    if (suffix) {
      setSuffix({ ...suffix, base: suffix.base.split(sepSeen).join(sep) });
    }
  }

  const titleNow = title ?? ownTitle;
  const isLinked = linked ?? ownLinked;
  const base = slugOf(titleNow, sep, { max: top }).text;
  const followed =
    suffix && base && suffix.base === base
      ? numbered(base, suffix.n, sep, top)
      : base;
  const current = value ?? (isLinked ? followed : ownSlug);

  const [intent, setIntent] = React.useState<Intent | null>(null);
  const [layer, setLayer] = React.useState<Layer>(() => layerOf(current));
  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [result, setResult] = React.useState<Result | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // The glyphs follow the slug: the common ends keep their cells (and slide),
  // the middle is new. A change this field made carries how its letters
  // arrive; one from the host just lands.
  if (layer.text !== current) {
    const { p, removed, added } = diff(layer.text, current);
    const meta =
      intent && intent.base === layer.text && intent.text === current
        ? intent.meta
        : null;
    const fresh: Glyph[] = Array.from({ length: added }, (_, j) => ({
      kind: "plain",
      delay: 0,
      ...meta?.[j],
      id: layer.seq + j,
      ch: current.charAt(p + j),
    }));
    setLayer({
      text: current,
      glyphs: [
        ...layer.glyphs.slice(0, p),
        ...fresh,
        ...layer.glyphs.slice(p + removed),
      ],
      seq: layer.seq + added,
    });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLInputElement | null>(null);
  const slugRef = React.useRef<HTMLInputElement | null>(null);
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const titleMirror = React.useRef<HTMLSpanElement | null>(null);
  const cellMirror = React.useRef<HTMLSpanElement | null>(null);
  const ghostSeq = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const checker = React.useRef(isTaken);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };

  const pan = () => {
    const b = areaRef.current?.getBoundingClientRect();
    return b ? panFrom(b.left + b.width / 2, null) : 0;
  };

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /** Where things are, for letters that travel between the two fields. */
  const measure = () => {
    const root = rootRef.current;
    const t = titleRef.current;
    const area = areaRef.current;
    const mirror = titleMirror.current;
    const cells = cellMirror.current;
    if (!root || !t || !area || !mirror || !cells) return null;
    const rr = root.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const ar = area.getBoundingClientRect();
    const ts = getComputedStyle(t);
    // Measured in the page's own fonts: a copy of the title's type for the
    // caret positions, and ten slug cells for the width of one.
    const ch = cells.getBoundingClientRect().width / 10 || 8;
    const pad =
      (parseFloat(ts.paddingLeft) || 0) + (parseFloat(ts.borderLeftWidth) || 0);
    const widthOf = (text: string) => {
      mirror.textContent = text;
      const w = mirror.getBoundingClientRect().width;
      mirror.textContent = "";
      return w;
    };
    return {
      ch,
      areaLeft: ar.left - rr.left,
      areaWidth: ar.width,
      slotY: r2(ar.top - rr.top + ar.height / 2),
      titleY: r2(tr.top - rr.top + tr.height / 2),
      titleX: (chars: string[], i: number) => {
        const left = widthOf(chars.slice(0, i).join(""));
        const w = widthOf(chars[i] ?? "");
        const x = tr.left - rr.left + pad + left + w / 2 - t.scrollLeft;
        return r2(clamp(x, tr.left - rr.left + pad, tr.right - rr.left - pad));
      },
    };
  };

  const report = (next: string, meta: Meta[], scroll: number | null) => {
    setIntent({ base: current, text: next, meta, scroll });
    onValueChange?.(next);
  };

  const launch = (list: Ghost[]) => {
    if (list.length) setGhosts((g) => [...g, ...list].slice(-MOST_GHOSTS));
  };

  /** The title's letters take off for their slots; stripped ones fall away. */
  const flights = (
    prevTitle: string,
    nextTitle: string,
    made: Slugged,
    prevSlug: string,
    nextSlug: string,
  ) => {
    const { p: sp, added: sa } = diff(prevSlug, nextSlug);
    const before = Array.from(prevTitle);
    const after = Array.from(nextTitle);
    let tp = 0;
    while (
      tp < before.length &&
      tp < after.length &&
      before[tp] === after[tp]
    ) {
      tp += 1;
    }
    let ts = 0;
    while (
      ts < before.length - tp &&
      ts < after.length - tp &&
      before[before.length - 1 - ts] === after[after.length - 1 - ts]
    ) {
      ts += 1;
    }
    const geo = motionSafe ? measure() : null;
    const n = Math.min(MOST_FLIGHTS, sa);
    const step = Math.min(0.03, cascade(Math.max(2, n)));
    let scroll: number | null = null;
    if (geo) {
      const total = nextSlug.length * geo.ch;
      scroll =
        total > geo.areaWidth
          ? r2(
              clamp(
                (sp + sa + 2) * geo.ch - geo.areaWidth,
                0,
                total - geo.areaWidth + 2,
              ),
            )
          : 0;
    }
    const meta: Meta[] = [];
    const out: Ghost[] = [];
    const landings: number[] = [];
    let flown = 0;
    for (let j = 0; j < sa; j += 1) {
      const k = sp + j;
      const ch = nextSlug.charAt(k);
      const src =
        made.text === nextSlug.slice(0, made.text.length)
          ? (made.from[k] ?? -1)
          : -1;
      if (!geo || ch === sep || src < 0 || flown >= MOST_FLIGHTS) {
        meta.push({ kind: "plain", delay: r2(Math.min(flown, n) * step) });
        continue;
      }
      const delay = r2(flown * step);
      flown += 1;
      const source = after[src] ?? ch;
      ghostSeq.current += 1;
      out.push({
        id: ghostSeq.current,
        ch: fold(source).length === 1 ? source : ch,
        mono: false,
        fall: false,
        x0: geo.titleX(after, src),
        y0: geo.titleY,
        x1: r2(geo.areaLeft + (k + 0.5) * geo.ch - (scroll ?? 0)),
        y1: geo.slotY,
        delay,
        tilt: 0,
      });
      meta.push({ kind: "flight", delay: r2(delay + FLY - 0.05) });
      landings.push(delay + FLY);
    }
    if (geo) {
      for (let i = tp; i < after.length - ts; i += 1) {
        const c = after[i] ?? "";
        if (!c || /\s/.test(c) || c === "&" || fold(c)) continue;
        ghostSeq.current += 1;
        const tilt = ghostSeq.current % 2 ? 1 : -1;
        const x0 = geo.titleX(after, i);
        out.push({
          id: ghostSeq.current,
          ch: c,
          mono: false,
          fall: true,
          x0,
          y0: geo.titleY,
          x1: r2(x0 + tilt * 5),
          y1: r2(geo.titleY + 24),
          delay: 0,
          tilt,
        });
      }
    }
    return { meta, ghosts: out, scroll, landings };
  };

  const unlink = () => {
    if (linked === undefined) setOwnLinked(false);
    onLinkedChange?.(false);
    audio.play("tick", { pitch: 0.6, gain: 0.35, pan: pan() });
    say("The URL no longer follows the title.");
  };

  const onTitle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.currentTarget.value;
    const prevTitle = titleNow;
    if (title === undefined) setOwnTitle(nextTitle);
    onTitleChange?.(nextTitle);
    if (!isLinked) return;
    const made = slugOf(nextTitle, sep, { max: top });
    const keep = suffix && made.text && suffix.base === made.text;
    if (suffix && !keep) setSuffix(null);
    const nextSlug = keep ? numbered(made.text, suffix.n, sep, top) : made.text;
    const plan = flights(prevTitle, nextTitle, made, current, nextSlug);
    launch(plan.ghosts);
    for (const [k, at] of plan.landings.entries()) {
      later(at * 1000, () =>
        audio.play("tick", {
          pitch: r2(1 + (k % 6) * 0.035),
          gain: 0.3,
          pan: pan(),
        }),
      );
    }
    if (nextSlug !== current) {
      if (value === undefined) setOwnSlug(nextSlug);
      report(nextSlug, plan.meta, plan.scroll);
    }
  };

  const onSlug = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const rawChars = Array.from(raw);
    const made = slugOf(raw, sep, { trailing: true });
    const next = made.text;
    const at = slugOf(rawChars.slice(0, caret).join(""), sep, {
      trailing: true,
    }).text.length;
    if (input.value !== next) {
      input.value = next;
      input.setSelectionRange(at, at);
    }
    const { p, added } = diff(current, next);
    const meta: Meta[] = Array.from({ length: added }, (_, j) => {
      const src = made.from[p + j] ?? -1;
      const source = src >= 0 ? (rawChars[src] ?? "") : "";
      const ch = next.charAt(p + j);
      return {
        kind: "hand",
        delay: 0,
        ghost:
          source && source !== ch && fold(source).length === 1
            ? source
            : undefined,
      };
    });
    // A character the slug cannot hold falls away from the caret.
    const stripped = rawChars.filter(
      (c) => !/\s/.test(c) && c !== "&" && !fold(c) && c !== sep,
    );
    const geo = motionSafe && stripped.length ? measure() : null;
    if (geo) {
      const scroll = slugRef.current?.scrollLeft ?? 0;
      launch(
        stripped.slice(0, 4).map((c, k) => {
          ghostSeq.current += 1;
          const tilt = ghostSeq.current % 2 ? 1 : -1;
          const x0 = r2(geo.areaLeft + (at + 0.5) * geo.ch - scroll);
          return {
            id: ghostSeq.current,
            ch: c,
            mono: true,
            fall: true,
            x0,
            y0: geo.slotY,
            x1: r2(x0 + tilt * 5),
            y1: r2(geo.slotY + 18),
            delay: r2(k * 0.04),
            tilt,
          };
        }),
      );
    }
    if (next !== current || stripped.length) {
      audio.play("tick", { pitch: 1.1, gain: 0.28, pan: pan() });
    }
    if (suffix) setSuffix(null);
    if (isLinked) {
      if (value === undefined) setOwnSlug(next);
      unlink();
    } else if (value === undefined) {
      setOwnSlug(next);
    }
    if (next !== current) report(next, meta, null);
  };

  const onSlugBlur = () => {
    const tidy = slugOf(current, sep).text;
    if (tidy === current || disabled) return;
    if (value === undefined && !isLinked) setOwnSlug(tidy);
    report(tidy, [], null);
  };

  const toggleLink = () => {
    if (disabled) return;
    const next = !isLinked;
    if (linked === undefined) setOwnLinked(next);
    onLinkedChange?.(next);
    if (!next) {
      if (value === undefined) setOwnSlug(current);
      audio.play("tick", { pitch: 0.6, gain: 0.35, pan: pan() });
      say("The URL no longer follows the title.");
      return;
    }
    setSuffix(null);
    const made = slugOf(titleNow, sep, { max: top });
    audio.play("pop", { gain: 0.5, pan: pan() });
    say("The URL follows the title again.");
    if (made.text === current) return;
    const { added } = diff(current, made.text);
    const step = cascade(Math.max(2, added));
    report(
      made.text,
      Array.from({ length: added }, (_, j) => ({
        kind: "plain" as const,
        delay: r2(Math.min(j, MOST_FLIGHTS) * step),
      })),
      0,
    );
  };

  const takeOffer = (offer: string) => {
    if (disabled) return;
    const match = new RegExp(`^(.*)\\${sep}(\\d+)$`).exec(offer);
    if (isLinked && match && match[1] === base) {
      setSuffix({ base, n: Number(match[2]) });
    } else if (value === undefined) {
      setOwnSlug(offer);
    }
    const { added } = diff(current, offer);
    report(
      offer,
      Array.from({ length: added }, (_, j) => ({
        kind: "hand" as const,
        delay: r2(j * 0.03),
      })),
      null,
    );
    audio.play("pop", { gain: 0.5, pan: pan() });
    slugRef.current?.focus();
  };

  React.useEffect(() => {
    checker.current = isTaken;
  });

  // The slug is checked once it has stood still; a taken one earns an offer.
  // A linked slug's number is its own suffix, never digits from the title
  // ("Top 10" is not "top" number ten); a hand-made one may end in a number.
  const canCheck = check && Boolean(isTaken) && current.length > 0;
  const ends = new RegExp(`^(.*)\\${sep}(\\d+)$`).exec(current);
  const offerRoot = isLinked
    ? suffix && suffix.base === base
      ? base
      : current
    : (ends?.[1] ?? current);
  const offerFrom = isLinked
    ? suffix && suffix.base === base
      ? suffix.n + 1
      : 2
    : ends
      ? Number(ends[2]) + 1
      : 2;
  React.useEffect(() => {
    if (!canCheck) return;
    let live = true;
    const slug = current;
    const timer = window.setTimeout(async () => {
      const ask = checker.current;
      if (!ask) return;
      try {
        const taken = await ask(slug);
        if (!live) return;
        let offer: string | null = null;
        if (taken) {
          for (let n = offerFrom; n < offerFrom + 20; n += 1) {
            const candidate = numbered(offerRoot, n, sep, top);
            if (!(await ask(candidate))) {
              offer = candidate;
              break;
            }
            if (!live) return;
          }
        }
        if (!live) return;
        setResult({ slug, taken, offer });
        setSaid((s) => ({
          n: s.n + 1,
          text: taken
            ? `${slug} is taken.${offer ? ` ${offer} is free.` : ""}`
            : `${slug} is available.`,
        }));
      } catch {
        // A check that fails says nothing rather than something wrong.
      }
    }, CHECK_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [canCheck, current, offerFrom, offerRoot, sep, top]);

  // The glyphs scroll with the input; a title change can ask for its end.
  React.useLayoutEffect(() => {
    const input = slugRef.current;
    const drawn = layerRef.current;
    if (!input || !drawn) return;
    if (intent && intent.text === current && intent.scroll !== null) {
      input.scrollLeft = intent.scroll;
    }
    drawn.scrollLeft = input.scrollLeft;
  }, [current, intent]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const syncScroll = () => {
    const input = slugRef.current;
    const drawn = layerRef.current;
    if (input && drawn) drawn.scrollLeft = input.scrollLeft;
  };

  const ghostDone = (id: number) =>
    setGhosts((g) => g.filter((x) => x.id !== id));

  const status: "checking" | "free" | "taken" | null = canCheck
    ? result?.slug === current
      ? result.taken
        ? "taken"
        : "free"
      : "checking"
    : null;
  const offer = status === "taken" ? (result?.offer ?? null) : null;
  const tooLong = current.length > top;
  const shownError =
    error ?? (tooLong ? `Keep it to ${top} characters.` : undefined);
  const invalid = Boolean(shownError) || status === "taken";
  // An error is said once, in the render it appears.
  const [voiced, setVoiced] = React.useState(shownError);
  if (voiced !== shownError) {
    setVoiced(shownError);
    if (shownError) setSaid((v) => ({ n: v.n + 1, text: shownError }));
  }
  const shownHint =
    hint ??
    `Lowercase letters, numbers and ${sep === "-" ? "dashes" : "underscores"}.`;
  const statusText =
    status === "checking"
      ? "Checking."
      : status === "free"
        ? "Available."
        : status === "taken"
          ? `Taken.${offer ? ` ${offer} is free.` : ""}`
          : isLinked
            ? "Follows the title."
            : "Edited by hand.";
  const tether = isLinked ? "bg-cobalt-bright/50" : "bg-hairline-strong";
  const snapTo = motionSafe
    ? isLinked
      ? springs.glide
      : springs.snap
    : { duration: 0 };

  const cell = (on: boolean) => ({
    "aria-hidden": !on || undefined,
    inert: !on,
    initial: false as const,
    animate: { opacity: on ? 1 : 0 },
    transition: { duration: durations.fast, ease: easings.enter },
  });

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex w-full max-w-md flex-col gap-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor={titleId}
          className="text-xs leading-4 font-medium text-ink-2"
        >
          {titleLabel}
        </label>
        <input
          ref={titleRef}
          id={titleId}
          type="text"
          name={titleName}
          value={titleNow}
          placeholder={titlePlaceholder}
          disabled={disabled}
          autoComplete="off"
          onChange={onTitle}
          className={cn(
            "h-9 w-full min-w-0 rounded-2 border border-input bg-surface-1 px-3 text-sm text-foreground outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
          )}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex h-6 items-center gap-2">
          <label
            htmlFor={slugId}
            className="shrink-0 text-xs leading-4 font-medium text-ink-2"
          >
            {label}
            {required ? (
              <span className="font-normal text-ink-3"> (required)</span>
            ) : null}
          </label>
          <span aria-hidden className="flex min-w-4 flex-1 items-center">
            <motion.span
              className={cn(
                "h-px flex-1 origin-left transition-colors",
                tether,
              )}
              initial={false}
              animate={
                isLinked
                  ? { scaleX: 1, rotate: 0, y: 0 }
                  : { scaleX: 0.78, rotate: 1.2, y: 1 }
              }
              transition={snapTo}
            />
            <motion.span
              className={cn(
                "h-px flex-1 origin-right transition-colors",
                tether,
              )}
              initial={false}
              animate={
                isLinked
                  ? { scaleX: 1, rotate: 0, y: 0 }
                  : { scaleX: 0.78, rotate: -1.2, y: 1 }
              }
              transition={snapTo}
            />
          </span>
          <button
            type="button"
            aria-pressed={isLinked}
            disabled={disabled}
            onClick={toggleLink}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-2 px-1.5 text-xs transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              isLinked
                ? "text-cobalt-bright hover:bg-cobalt-wash"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              "disabled:cursor-not-allowed",
            )}
          >
            <Chain broken={!isLinked} motionSafe={motionSafe} />
            Follow title
          </button>
        </div>

        <div
          onMouseDown={(event) => {
            // The prefix and the padding are part of the box: a press there
            // puts the caret in the slug, at its end.
            const input = slugRef.current;
            if (!input || event.target === input || disabled) return;
            event.preventDefault();
            input.focus();
            const end = input.value.length;
            input.setSelectionRange(end, end);
          }}
          className={cn(
            "flex h-9 min-w-0 cursor-text items-center overflow-clip rounded-2 border bg-surface-1 px-3 font-mono text-[13px]",
            shownError
              ? "border-danger/60"
              : status === "taken"
                ? "border-warn/60"
                : "border-input",
            "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
            disabled && "cursor-not-allowed",
          )}
        >
          {prefix ? (
            <span
              className="max-w-[48%] shrink-0 truncate text-ink-3"
              title={prefix}
            >
              {prefix}
            </span>
          ) : null}
          <div ref={areaRef} className="relative h-full min-w-0 flex-1">
            <input
              ref={slugRef}
              id={slugId}
              type="text"
              name={name}
              value={current}
              required={required}
              disabled={disabled}
              placeholder={`follows${sep}the${sep}title`}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              aria-invalid={invalid || undefined}
              aria-describedby={[hintId, statusId, shownError ? errorId : null]
                .filter(Boolean)
                .join(" ")}
              onChange={onSlug}
              onBlur={onSlugBlur}
              onScroll={syncScroll}
              onSelect={syncScroll}
              className="absolute inset-0 h-full w-full bg-transparent p-0 font-mono text-[13px] text-transparent caret-foreground outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
            />
            <motion.div
              ref={layerRef}
              layoutScroll
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="relative flex h-full w-max items-center whitespace-pre text-foreground">
                <AnimatePresence initial={false} mode="popLayout">
                  {layer.glyphs.map((g) => (
                    <GlyphCell
                      key={g.id}
                      glyph={g}
                      motionSafe={motionSafe}
                      separator={g.ch === sep}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="flex h-5 items-center justify-between gap-3 text-xs leading-4">
          <div className="grid min-w-0 flex-1">
            <motion.span
              {...cell(status === "checking")}
              className="flex items-center gap-1.5 text-ink-3 [grid-area:1/1]"
            >
              Checking…
            </motion.span>
            <motion.span
              {...cell(status === "free")}
              className="flex items-center gap-1 text-success [grid-area:1/1]"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-3.5 shrink-0"
              >
                <motion.path
                  d="M 3.5 8.5 L 6.5 11.5 L 12.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: status === "free" ? 1 : 0 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
              Available
            </motion.span>
            <motion.span
              {...cell(status === "taken")}
              className="flex min-w-0 items-center gap-2 text-warn [grid-area:1/1]"
            >
              <span className="shrink-0">Taken</span>
              {offer ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => takeOffer(offer)}
                  title={`Use ${offer}`}
                  className={cn(
                    "inline-flex h-5 min-w-0 items-center rounded-1 bg-surface-2 px-1.5 font-mono text-[11px] text-foreground transition-colors outline-none hover:bg-cobalt-wash",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  <span className="truncate">Use {offer}</span>
                </button>
              ) : null}
            </motion.span>
            <motion.span
              {...cell(status === null)}
              className="flex items-center text-ink-3 [grid-area:1/1]"
            >
              {isLinked ? "Follows the title" : "Edited by hand"}
            </motion.span>
          </div>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tabular-nums",
              tooLong ? "text-danger" : "text-ink-3",
            )}
          >
            {current.length}/{top}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p id={hintId} className="text-xs leading-4 text-ink-3">
          {shownHint}
        </p>
        {shownError ? (
          <p id={errorId} className="text-xs leading-4 text-danger">
            {shownError}
          </p>
        ) : null}
      </div>
      <span id={statusId} className="sr-only">
        {statusText}
      </span>
      <p aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>

      <span
        ref={titleMirror}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 text-sm whitespace-pre"
      />
      <span
        ref={cellMirror}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 w-[10ch] font-mono text-[13px]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        {ghosts.map((g) => (
          <motion.span
            key={g.id}
            className={cn(
              "absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 leading-none whitespace-pre",
              g.mono ? "font-mono text-[13px]" : "text-sm",
              g.fall ? "text-ink-3" : "text-foreground",
            )}
            initial={{ x: g.x0, y: g.y0, opacity: 0, rotate: 0, scale: 1 }}
            animate={
              g.fall
                ? {
                    x: g.x1,
                    y: g.y1,
                    opacity: [0, 1, 0],
                    rotate: g.tilt * 28,
                  }
                : {
                    x: g.x1,
                    y: g.y1,
                    opacity: [0, 1, 1, 0],
                    scale: 0.92,
                  }
            }
            transition={
              g.fall
                ? {
                    delay: g.delay,
                    duration: 0.46,
                    ease: [0.5, 0, 0.9, 0.5],
                    opacity: {
                      delay: g.delay,
                      duration: 0.46,
                      times: [0, 0.12, 1],
                    },
                  }
                : {
                    delay: g.delay,
                    duration: FLY,
                    x: { delay: g.delay, duration: FLY, ease: easings.enter },
                    y: {
                      delay: g.delay,
                      duration: FLY,
                      ease: [0.55, 0, 1, 0.45],
                    },
                    opacity: {
                      delay: g.delay,
                      duration: FLY,
                      times: [0, 0.1, 0.82, 1],
                    },
                  }
            }
            onAnimationComplete={() => ghostDone(g.id)}
          >
            {g.ch}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
