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

export type MailDomains = "common" | "work";

export type MailFieldProps = {
  /** What the address is for. The field's visible label. */
  label: string;
  /** Controlled address. */
  value?: string;
  /** Initial address when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from the key, paste or accepted fix that changed the address. */
  onValueChange?: (value: string) => void;
  /** Fires when a valid address is stamped: the field was left, Enter pressed, or a fix used or declined. */
  onStamp?: (value: string) => void;
  /** Offer a fix when the domain looks like a slip of a known one. @default true */
  suggest?: boolean;
  /** Stamp a committed valid address; off, it gets a quiet check. @default true */
  stamp?: boolean;
  /** Which built-in domains the field knows and suggests: personal mail hosts or company domains. @default "common" */
  domains?: MailDomains;
  /** The host's own known domains, in place of the built-in list. */
  knownDomains?: string[];
  /** The form field name. The input itself carries the address. */
  name?: string;
  /** @default "name@fernmail.com" */
  placeholder?: string;
  /** Helper text under the field. */
  hint?: string;
  /** An error from the host. Replaces the hint and marks the field invalid. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Play the letters landing and the stamp. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

// Invented hosts and companies: nothing here names a real service.
const DOMAINS: Record<MailDomains, readonly string[]> = {
  common: [
    "fernmail.com",
    "larkpost.com",
    "waylight.net",
    "coldbrook.org",
    "fieldpost.co",
    "mossbox.com",
  ],
  work: [
    "basinworks.com",
    "gaugeworks.io",
    "fieldline.co",
    "fernworks.studio",
    "waylight.dev",
  ],
};

/** How long typing must pause before a fix is offered, in ms. */
const SETTLE_MS = 700;
/** The input's padding and border, which the letter layer must match. */
const PAD_LEFT = 37;
const PAD_RIGHT = 49;

const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Verdict = {
  state: "empty" | "partial" | "invalid" | "valid";
  message: string | null;
  /** A mistake that is certain, said while typing rather than on leaving. */
  now: boolean;
};

const LOCAL =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

function check(v: string): Verdict {
  const partial = (message: string): Verdict => ({
    state: "partial",
    message,
    now: false,
  });
  const invalid = (message: string): Verdict => ({
    state: "invalid",
    message,
    now: true,
  });
  if (v === "") return { state: "empty", message: null, now: false };
  if (/\s/.test(v)) return invalid("Addresses have no spaces.");
  const parts = v.split("@");
  if (parts.length > 2) return invalid("Only one @ in an address.");
  if (parts.length < 2) return partial("Add the @ and the part after it.");
  const [local = "", domain = ""] = parts;
  if (!local) return partial("Add the name before the @.");
  if (!LOCAL.test(local)) {
    return invalid(
      "The part before the @ has a character an address can't use.",
    );
  }
  if (!domain) return partial("Add the part after the @, like fernmail.com.");
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => l === "")) {
    return partial("Finish the part after the @, like fernmail.com.");
  }
  if (labels.some((l) => !LABEL.test(l))) {
    return invalid(
      "The part after the @ has a character an address can't use.",
    );
  }
  if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1] ?? "")) {
    return partial("Finish the ending, like .com.");
  }
  return { state: "valid", message: null, now: false };
}

type Op = {
  kind: "keep" | "sub" | "ins" | "del" | "swap";
  /** Index in the old text (keep, sub, del, swap). */
  a: number;
  /** Index in the new text (keep, sub, ins, swap). */
  b: number;
};

/**
 * The cheapest edit from a to b — keeps, substitutions, insertions,
 * deletions and swapped neighbours, each swap one edit — and the script of
 * it, so every letter knows where it goes.
 */
function align(a: string, b: string): { distance: number; ops: Op[] } {
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => d[i]?.[j] ?? Infinity;
  const swapped = (i: number, j: number) =>
    i > 1 &&
    j > 1 &&
    a[i - 1] === b[j - 2] &&
    a[i - 2] === b[j - 1] &&
    a[i - 1] !== a[i - 2];
  for (let i = 1; i <= n; i += 1) {
    const row = d[i] as number[];
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        at(i - 1, j) + 1,
        at(i, j - 1) + 1,
        at(i - 1, j - 1) + cost,
      );
      if (swapped(i, j)) best = Math.min(best, at(i - 2, j - 2) + 1);
      row[j] = best;
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (swapped(i, j) && at(i, j) === at(i - 2, j - 2) + 1) {
      ops.push({ kind: "swap", a: i - 2, b: j - 2 });
      i -= 2;
      j -= 2;
    } else if (
      i > 0 &&
      j > 0 &&
      at(i, j) === at(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1)
    ) {
      ops.push({
        kind: a[i - 1] === b[j - 1] ? "keep" : "sub",
        a: i - 1,
        b: j - 1,
      });
      i -= 1;
      j -= 1;
    } else if (i > 0 && at(i, j) === at(i - 1, j) + 1) {
      ops.push({ kind: "del", a: i - 1, b: -1 });
      i -= 1;
    } else {
      ops.push({ kind: "ins", a: -1, b: j - 1 });
      j -= 1;
    }
  }
  return { distance: at(n, m), ops: ops.reverse() };
}

type Suggestion = {
  /** The whole corrected address. */
  full: string;
  /** Indices in `full` that the fix changed. */
  changed: number[];
};

/** A fix for a domain that looks finished but is a slip of a known one. */
function suggestionFor(v: string, known: readonly string[]): Suggestion | null {
  const at = v.lastIndexOf("@");
  if (at <= 0 || check(v).state === "invalid") return null;
  const domain = v.slice(at + 1).toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain)) return null;
  if (known.includes(domain)) return null;
  let best: { to: string; distance: number; ops: Op[] } | null = null;
  for (const k of known) {
    const found = align(domain, k);
    if (!best || found.distance < best.distance) best = { to: k, ...found };
  }
  if (!best || best.distance === 0) return null;
  if (best.distance > Math.min(2, Math.max(1, Math.floor(domain.length / 5)))) {
    return null;
  }
  const offset = at + 1;
  const changed = best.ops.flatMap((op) =>
    op.kind === "sub" || op.kind === "ins"
      ? [offset + op.b]
      : op.kind === "swap"
        ? [offset + op.b, offset + op.b + 1]
        : [],
  );
  return { full: `${v.slice(0, offset)}${best.to}`, changed };
}

type MorphCell = {
  key: string;
  ch: string;
  kind: "move" | "arc" | "dip" | "out" | "in" | "grow" | "shrink";
  from: number;
  to: number;
  delay: number;
  changed: boolean;
};

type Morph = { id: number; cells: MorphCell[]; cool: boolean };

let measurer: CanvasRenderingContext2D | null = null;

/**
 * Where every letter of the old address is and where it goes in the new
 * one, measured with the input's own font so the layer starts exactly on
 * the input's text.
 */
function layoutMorph(
  input: HTMLInputElement,
  from: string,
  to: string,
): { cells: MorphCell[]; landed: number } | null {
  if (!measurer) measurer = document.createElement("canvas").getContext("2d");
  const ctx = measurer;
  if (!ctx) return null;
  const cs = getComputedStyle(input);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const shift = input.scrollLeft;
  const xs = (s: string) =>
    Array.from({ length: s.length + 1 }, (_, i) =>
      r2(ctx.measureText(s.slice(0, i)).width - shift),
    );
  const xa = xs(from);
  const xb = xs(to);
  const { ops } = align(from, to);
  const cells: MorphCell[] = [];
  const cell = (
    key: string,
    ch: string,
    kind: MorphCell["kind"],
    fromX: number,
    toX: number,
    changed: boolean,
  ) => cells.push({ key, ch, kind, from: fromX, to: toX, delay: 0, changed });
  for (const op of ops) {
    const oldX = xa[op.a] ?? 0;
    const newX = xb[op.b] ?? 0;
    if (op.kind === "keep") {
      cell(`k${op.a}`, from[op.a] ?? "", "move", oldX, newX, false);
    } else if (op.kind === "swap") {
      // The two trade places: the one moving right arcs over the other.
      cell(
        `s${op.a}`,
        from[op.a] ?? "",
        "arc",
        oldX,
        xb[op.b + 1] ?? newX,
        true,
      );
      cell(
        `s${op.a + 1}`,
        from[op.a + 1] ?? "",
        "dip",
        xa[op.a + 1] ?? oldX,
        newX,
        true,
      );
    } else if (op.kind === "sub") {
      cell(`o${op.a}`, from[op.a] ?? "", "out", oldX, oldX, true);
      cell(`i${op.b}`, to[op.b] ?? "", "in", newX, newX, true);
    } else if (op.kind === "ins") {
      cell(`g${op.b}`, to[op.b] ?? "", "grow", newX, newX, true);
    } else {
      cell(`x${op.a}`, from[op.a] ?? "", "shrink", oldX, oldX, true);
    }
  }
  const changed = cells.filter((c) => c.changed).sort((p, q) => p.to - q.to);
  const beat = cascade(Math.max(1, changed.length));
  changed.forEach((c, i) => {
    c.delay = r2(0.04 + i * beat);
  });
  const last = changed[changed.length - 1];
  return { cells, landed: r2((last?.delay ?? 0) + 0.42) };
}

function Letter({
  cell,
  cool,
  motionSafe,
}: {
  cell: MorphCell;
  cool: boolean;
  motionSafe: boolean;
}) {
  const colour = cell.changed
    ? cool
      ? "text-foreground"
      : cell.kind === "out" || cell.kind === "shrink"
        ? "text-danger"
        : "text-cobalt-bright"
    : "text-foreground";
  const base =
    "absolute top-0 left-0 flex h-full items-center whitespace-pre transition-colors duration-500";
  if (!motionSafe) {
    // Nothing travels: the new address stands where it will be, its changed
    // letters tinted, and the tint fades to ink.
    if (cell.kind === "out" || cell.kind === "shrink") return null;
    return (
      <span
        className={cn(base, colour)}
        style={{ transform: `translateX(${cell.to}px)` }}
      >
        {cell.ch}
      </span>
    );
  }
  const { delay } = cell;
  switch (cell.kind) {
    case "move":
      return (
        <motion.span
          className={cn(base, colour)}
          initial={{ x: cell.from }}
          animate={{ x: cell.to }}
          transition={springs.glide}
        >
          {cell.ch}
        </motion.span>
      );
    case "arc":
    case "dip":
      return (
        <motion.span
          className={cn(base, colour)}
          initial={{ x: cell.from, y: 0 }}
          animate={{
            x: cell.to,
            y: cell.kind === "arc" ? [0, -distances.step, 0] : [0, 3, 0],
          }}
          transition={{
            x: { ...springs.glide, delay },
            y: {
              duration: 0.4,
              times: [0, 0.45, 1],
              ease: easings.move,
              delay,
            },
          }}
        >
          {cell.ch}
        </motion.span>
      );
    case "out":
    case "shrink":
      return (
        <motion.span
          className={cn(base, colour)}
          initial={{ x: cell.from, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={
            cell.kind === "out"
              ? { y: distances.step, opacity: 0, rotate: 16 }
              : { y: 3, opacity: 0, scale: 0.3 }
          }
          transition={{ duration: durations.base, ease: easings.exit, delay }}
        >
          {cell.ch}
        </motion.span>
      );
    default:
      return (
        <motion.span
          className={cn(base, colour)}
          initial={
            cell.kind === "in"
              ? { x: cell.to, y: -distances.step, opacity: 0 }
              : { x: cell.to, scale: 0.3, opacity: 0 }
          }
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{
            y: { ...springs.snap, delay },
            scale: { ...springs.snap, delay },
            opacity: { duration: durations.fast, delay },
          }}
        >
          {cell.ch}
        </motion.span>
      );
  }
}

/** A round postmark with a check: stamped on, at a seeded slant. */
function Stamp({
  seed,
  delay,
  motionSafe,
}: {
  seed: number;
  delay: number;
  motionSafe: boolean;
}) {
  const angle = -6 - (seed % 11);
  return (
    <motion.svg
      viewBox="0 0 32 32"
      className="size-8 text-success"
      initial={
        motionSafe
          ? { scale: 1.7, opacity: 0, rotate: angle - 16 }
          : { opacity: 0 }
      }
      animate={{ scale: 1, opacity: 0.92, rotate: angle }}
      exit={{ opacity: 0, scale: 1.08, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              scale: { ...springs.recoil, delay },
              rotate: { ...springs.snap, delay },
              opacity: { duration: durations.blink, delay },
            }
          : { duration: durations.base, delay }
      }
    >
      <circle
        cx={16}
        cy={16}
        r={13.5}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeDasharray="21 1.4 30 1 22 1.6 11"
      />
      <circle
        cx={16}
        cy={16}
        r={10.6}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.8}
        strokeDasharray="9 1 14 1.2 40"
      />
      <path
        d="M11 16.4 L14.6 20 L21.4 12.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </motion.svg>
  );
}

/**
 * An email field that checks as you type, catches a slipped domain, and
 * stamps a good address. A dot at its end says where the address stands;
 * certain mistakes (a space, a second @) are said at once, an unfinished
 * address only once the field is left.
 *
 * When the domain looks finished but is one edit or two from a known one —
 * a swap counts as one — a row folds open under the field at its measured
 * height on glide, offering the fix. Using it morphs the address in place:
 * the input's text hides and a layer of letters laid out from the input's own
 * font takes over. Letters that stay slide to their new places on glide, two
 * swapped letters trade places with one arcing over the other, a wrong letter
 * drops out as the right one drops in on snap, a missing one grows and a
 * spare one shrinks away. Changed letters land in cobalt one after another
 * on cascade(), each with a tick, then fade to ink and the real input is
 * back. A committed valid address — the field left, Enter, a fix used or
 * declined — is stamped with a postmark that lands on recoil, with a pop.
 *
 * The fix is announced once and is the next thing Tab reaches; Escape in the
 * field declines it. Under reduced motion letters change in place with a
 * fading tint and the stamp fades in.
 */
export function MailField({
  label,
  value,
  defaultValue = "",
  onValueChange,
  onStamp,
  suggest = true,
  stamp = true,
  domains = "common",
  knownDomains,
  name,
  placeholder = "name@fernmail.com",
  hint,
  error,
  required = false,
  disabled = false,
  sound = false,
  className,
}: MailFieldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const inputId = `${uid}-input`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const known = knownDomains ?? DOMAINS[domains] ?? DOMAINS.common;

  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  const verdict = check(current);

  const [settled, setSettled] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  const [morph, setMorph] = React.useState<Morph | null>(null);
  const [stamped, setStamped] = React.useState<{
    value: string;
    delay: number;
  } | null>(() =>
    // An address the page starts with is already committed.
    verdict.state === "valid" && !(suggest && suggestionFor(current, known))
      ? { value: current, delay: 0 }
      : null,
  );
  const [measured, setMeasured] = React.useState<number | null>(null);

  const found = suggest ? suggestionFor(current, known) : null;
  const offer =
    found && settled && !morph && !dismissed.includes(current) ? found : null;
  // The row keeps its last words while it folds shut.
  const [shown, setShown] = React.useState<Suggestion | null>(offer);
  if (offer && offer.full !== shown?.full) setShown(offer);
  const isStamped = stamped?.value === current && verdict.state === "valid";

  const problem =
    error ??
    (verdict.state === "invalid" && (verdict.now || touched)
      ? verdict.message
      : verdict.state === "partial" && touched
        ? verdict.message
        : required && touched && verdict.state === "empty"
          ? "Enter an email address."
          : null);

  // One polite region; each sentence is said once, at the render that made it.
  const parts = {
    offer: offer?.full ?? "",
    problem: problem ?? "",
    stamp: isStamped ? current : "",
  };
  const [said, setSaid] = React.useState({ ...parts, n: 0, text: "" });
  if (
    said.offer !== parts.offer ||
    said.problem !== parts.problem ||
    said.stamp !== parts.stamp
  ) {
    const text = [
      parts.offer && parts.offer !== said.offer
        ? `Did you mean ${parts.offer}?`
        : "",
      parts.problem && parts.problem !== said.problem ? parts.problem : "",
      parts.stamp && parts.stamp !== said.stamp ? "Address checked." : "",
    ]
      .filter(Boolean)
      .join(" ");
    setSaid({ ...parts, n: said.n + (text ? 1 : 0), text: text || said.text });
  }

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const settleTimer = React.useRef(0);
  const morphTimers = React.useRef<number[]>([]);
  const soundTimers = React.useRef<number[]>([]);
  const morphs = React.useRef(0);

  const panHere = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.right - 24, null) : 0;
  };

  const clearMorph = () => {
    for (const t of morphTimers.current) window.clearTimeout(t);
    morphTimers.current = [];
  };

  const commit = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** Stamps the address (or checks it quietly), after `delay` seconds. */
  const stampNow = (v: string, delay = 0) => {
    if (check(v).state !== "valid" || stamped?.value === v) return;
    setStamped({ value: v, delay });
    onStamp?.(v);
    for (const t of soundTimers.current) window.clearTimeout(t);
    const pan = panHere();
    soundTimers.current = [
      window.setTimeout(
        () =>
          audio.play("pop", {
            pitch: stamp ? 0.8 : 1.3,
            gain: stamp ? 0.6 : 0.35,
            pan,
          }),
        Math.round(delay * 1000) + (stamp && motionSafe ? 40 : 0),
      ),
    ];
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    clearMorph();
    setMorph(null);
    setSettled(false);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setSettled(true), SETTLE_MS);
    commit(event.currentTarget.value);
  };

  const accept = () => {
    const s = shown;
    if (!s || disabled) return;
    const input = inputRef.current;
    const from = current;
    const to = s.full;
    const laid = input ? layoutMorph(input, from, to) : null;
    clearMorph();
    for (const t of soundTimers.current) window.clearTimeout(t);
    soundTimers.current = [];
    morphs.current += 1;
    const id = morphs.current;
    const landed = laid?.landed ?? 0;
    if (laid) setMorph({ id, cells: laid.cells, cool: false });
    const pan = panHere();
    if (laid && motionSafe) {
      laid.cells
        .filter((c) => c.changed && c.kind !== "out" && c.kind !== "shrink")
        .forEach((c, i) => {
          soundTimers.current.push(
            window.setTimeout(
              () =>
                audio.play("tick", { pitch: r2(1 + i * 0.09), gain: 0.4, pan }),
              Math.round((c.delay + 0.12) * 1000),
            ),
          );
        });
    }
    morphTimers.current = [
      window.setTimeout(
        () => setMorph((m) => (m && m.id === id ? { ...m, cool: true } : m)),
        Math.round(landed * 1000),
      ),
      window.setTimeout(
        () => setMorph((m) => (m && m.id === id ? null : m)),
        Math.round(landed * 1000) + 560,
      ),
    ];
    window.clearTimeout(settleTimer.current);
    setSettled(true);
    commit(to);
    input?.focus({ preventScroll: true });
    // Setting the value put the caret at the end, where the typing goes on.
    stampNow(to, motionSafe ? landed : 0);
  };

  const keep = () => {
    if (disabled) return;
    setDismissed((d) => [...d, current]);
    inputRef.current?.focus({ preventScroll: true });
    stampNow(current);
  };

  React.useEffect(() => {
    const settle = settleTimer;
    const morphing = morphTimers;
    const sounding = soundTimers;
    return () => {
      window.clearTimeout(settle.current);
      for (const t of morphing.current) window.clearTimeout(t);
      for (const t of sounding.current) window.clearTimeout(t);
    };
  }, []);

  const bindOffer = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setMeasured(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const describedBy = problem ? errorId : hint ? hintId : undefined;
  const dot =
    verdict.state === "valid"
      ? "bg-cobalt-bright"
      : verdict.state === "invalid" && verdict.now
        ? "bg-danger"
        : verdict.state === "empty"
          ? "bg-transparent"
          : "bg-ink-3/40";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        disabled && "opacity-50",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className="text-sm leading-5 font-medium text-foreground"
      >
        {label}
      </label>

      <div className="relative h-11">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          name={name}
          placeholder={placeholder}
          value={current}
          onChange={onChange}
          onBlur={() => {
            window.clearTimeout(settleTimer.current);
            setSettled(true);
            setTouched(true);
            if (!(suggest && found && !dismissed.includes(current))) {
              stampNow(current);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && offer) {
              event.preventDefault();
              keep();
            } else if (event.key === "Enter" && !(suggest && found)) {
              stampNow(current);
            }
          }}
          required={required}
          disabled={disabled}
          aria-invalid={problem ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "absolute inset-0 h-full w-full rounded-2 border bg-surface-1 pr-12 pl-9 text-base text-foreground transition-colors outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
            morph && "text-transparent",
            problem
              ? "border-danger"
              : "border-input hover:border-hairline-strong",
          )}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3"
        >
          <svg viewBox="0 0 16 16" className="size-4">
            <rect
              x={1.5}
              y={3.5}
              width={13}
              height={9}
              rx={1.5}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
            />
            <path
              d="M2 4.5 L8 9 L14 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {morph ? (
          <div
            aria-hidden
            data-morph=""
            className="pointer-events-none absolute inset-y-0 overflow-clip text-base"
            style={{ left: PAD_LEFT, right: PAD_RIGHT }}
          >
            {morph.cells.map((cell) => (
              <Letter
                key={`${morph.id}-${cell.key}`}
                cell={cell}
                cool={morph.cool}
                motionSafe={motionSafe}
              />
            ))}
          </div>
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-1.5 flex w-9 items-center justify-center"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {isStamped ? (
              stamp ? (
                <Stamp
                  key={`stamp-${current}`}
                  seed={hash(current)}
                  delay={stamped?.delay ?? 0}
                  motionSafe={motionSafe}
                />
              ) : (
                <motion.svg
                  key={`check-${current}`}
                  viewBox="0 0 16 16"
                  className="size-4 text-success"
                  initial={
                    motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    ...(motionSafe
                      ? springs.flick
                      : { duration: durations.base }),
                    delay: stamped?.delay ?? 0,
                  }}
                >
                  <path
                    d="M3.5 8.4 L6.6 11.4 L12.5 4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </motion.svg>
              )
            ) : (
              <motion.span
                key="dot"
                className={cn("size-1.5 rounded-full transition-colors", dot)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              />
            )}
          </AnimatePresence>
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{
          height: offer ? (measured ?? "auto") : 0,
          opacity: offer ? 1 : 0,
        }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: { duration: durations.fast } }
            : { duration: 0 }
        }
        className="-mt-1.5 overflow-clip"
        inert={!offer}
      >
        {shown ? (
          <div
            ref={bindOffer}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2"
          >
            <p className="min-w-0 text-sm leading-5 text-ink-2">
              Did you mean{" "}
              <span className="font-medium break-all text-foreground">
                {Array.from(shown.full).map((ch, i) =>
                  shown.changed.includes(i) ? (
                    <span
                      key={i}
                      className="text-cobalt-bright underline decoration-dotted underline-offset-2"
                    >
                      {ch}
                    </span>
                  ) : (
                    <React.Fragment key={i}>{ch}</React.Fragment>
                  ),
                )}
              </span>
              ?
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={accept}
                aria-label={`Use ${shown.full}`}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                Use it
              </button>
              <button
                type="button"
                onClick={keep}
                aria-label={`Keep ${current}`}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                Keep mine
              </button>
            </div>
          </div>
        ) : null}
      </motion.div>

      {hint || problem ? (
        <div className="grid text-xs leading-4">
          {hint ? (
            <p
              id={hintId}
              aria-hidden={problem ? true : undefined}
              className={cn(
                "col-start-1 row-start-1 text-ink-3 transition-opacity",
                problem ? "opacity-0" : "opacity-100",
              )}
            >
              {hint}
            </p>
          ) : null}
          <p
            id={errorId}
            className={cn(
              "col-start-1 row-start-1 text-danger transition-opacity",
              problem ? "opacity-100" : "opacity-0",
            )}
          >
            {problem}
          </p>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
