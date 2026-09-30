"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CalcFieldRounding = "half-up" | "half-even" | "up" | "down";

export type CalcFieldProps = {
  /** What the amount is. Shown above the field and tied to it. */
  label: string;
  /** Controlled committed amount. `null` is no amount. */
  value?: number | null;
  /** Committed amount when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the Enter or blur that committed it, with the rounded amount. */
  onValueChange?: (value: number | null) => void;
  /** A sum the field starts with, uncommitted. */
  defaultText?: string;
  /** What a bare percentage is a share of: with 1240, "15%" is 186. */
  percentOf?: number;
  /** @default "0.00" at the field's precision */
  placeholder?: string;
  /** Decimals in the answer and the committed amount, 0 to 3. @default 2 */
  precision?: number;
  /** An ISO currency code for the symbol, or "none" for a plain number. @default "USD" */
  currency?: string;
  /** Show the sum written out under the field, and keep it as a receipt once committed. @default true */
  expression?: boolean;
  /** How the answer is brought to `precision`. "up" and "down" are away from and toward zero. @default "half-up" */
  rounding?: CalcFieldRounding;
  /** Tick as the answer changes, click on commit. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------ arithmetic */

type Op = "+" | "-" | "*" | "/" | "(" | ")" | "%";
type Tok = { t: "num"; v: number; raw: string } | { t: Op; raw: string };
type Lexed = { tokens: Tok[]; problem: string | null; unfinished: boolean };

/** Every character a sum can hold, after NFKC folds full-width forms. */
const ALLOWED = /^[\d.,\s+\-−–*×xX·/÷()%$€£¥]*$/;
const REFUSED = "Only numbers and + − × ÷ ( ) %";
const OPS: Record<string, Op> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "–": "-",
  "*": "*",
  "×": "*",
  x: "*",
  X: "*",
  "·": "*",
  "/": "/",
  "÷": "/",
  "(": "(",
  ")": ")",
  "%": "%",
};
const GLYPH: Record<Op, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "(": "(",
  ")": ")",
  "%": "%",
};
const LIMIT = 1e15;
/** How the tape says a rounded answer was brought to precision. */
const ROUNDED: Record<CalcFieldRounding, string> = {
  "half-up": "rounded half up",
  "half-even": "rounded half even",
  up: "rounded up",
  down: "rounded down",
};

function lex(text: string): Lexed {
  const s = text.normalize("NFKC");
  const tokens: Tok[] = [];
  let problem: string | null = null;
  let unfinished = false;
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (/[\s$€£¥]/.test(c)) {
      i += 1;
      continue;
    }
    const num = /^(?:\d[\d,]*(?:\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (num) {
      const raw = num[0];
      if (raw.includes(",")) {
        const groups = (raw.split(".")[0] ?? "").split(",");
        const head = groups[0] ?? "";
        const rest = groups.slice(1);
        const ok = /^\d{1,3}$/.test(head) && rest.every((g) => g.length === 3);
        // "1,24" at the end is 1,240 still being typed, not a mistake.
        const growing =
          i + raw.length === s.length &&
          !raw.includes(".") &&
          rest.slice(0, -1).every((g) => g.length === 3) &&
          (rest[rest.length - 1]?.length ?? 3) < 3;
        if (!ok && growing) unfinished = true;
        else if (!ok)
          problem ??= "Commas group thousands, as in 1,240";
      }
      tokens.push({ t: "num", v: Number(raw.replace(/,/g, "")), raw });
      i += raw.length;
      continue;
    }
    const op = OPS[c];
    if (op) tokens.push({ t: op, raw: c });
    else if (c === "." && i === s.length - 1) unfinished = true;
    else problem ??= REFUSED;
    i += 1;
  }
  return { tokens, problem, unfinished };
}

/** A stop inside the parser; caught in `evaluate`, never thrown out of it. */
class Halt {
  constructor(
    readonly unfinished: boolean,
    readonly message = "",
  ) {}
}

type Part = { value: number; pct: boolean };

/**
 * Recursive descent over the tokens — brackets, unary signs, then × ÷, then
 * + −, left to right — with the calculator's percent: a + b% adds b% of a,
 * a × b% is a × b/100, and a bare b% at the top is b% of `percentOf`.
 */
function run(tokens: Tok[], percentOf: number | undefined): number {
  let i = 0;
  const peek = () => tokens[i];
  const expr = (top: boolean): number => {
    const head = term();
    let left =
      head.pct && top && percentOf !== undefined
        ? head.value * percentOf
        : head.value;
    for (let t = peek(); t?.t === "+" || t?.t === "-"; t = peek()) {
      i += 1;
      const next = term();
      const amount = next.pct ? left * next.value : next.value;
      left = t.t === "+" ? left + amount : left - amount;
    }
    return left;
  };
  const term = (): Part => {
    let part = unary();
    for (let t = peek(); t?.t === "*" || t?.t === "/"; t = peek()) {
      i += 1;
      const next = unary();
      if (t.t === "/" && next.value === 0) {
        throw new Halt(false, "Can’t divide by zero");
      }
      part = {
        value: t.t === "*" ? part.value * next.value : part.value / next.value,
        pct: false,
      };
    }
    return part;
  };
  const unary = (): Part => {
    const t = peek();
    if (t?.t === "-" || t?.t === "+") {
      i += 1;
      const p = unary();
      return { value: t.t === "-" ? -p.value : p.value, pct: p.pct };
    }
    const value = primary();
    if (peek()?.t === "%") {
      i += 1;
      return { value: value / 100, pct: true };
    }
    return { value, pct: false };
  };
  const primary = (): number => {
    const t = peek();
    if (!t) throw new Halt(true);
    if (t.t === "num") {
      i += 1;
      const after = peek()?.t;
      if (after === "num" || after === "(") {
        throw new Halt(false, "Missing an operator between numbers");
      }
      return t.v;
    }
    if (t.t === "(") {
      i += 1;
      const v = expr(false);
      const close = peek();
      if (!close) throw new Halt(true);
      if (close.t !== ")") throw new Halt(false, "Missing an operator");
      i += 1;
      const after = peek()?.t;
      if (after === "num" || after === "(") {
        throw new Halt(false, "Missing an operator after )");
      }
      return v;
    }
    if (t.t === ")") {
      throw new Halt(
        false,
        tokens[i - 1]?.t === "(" ? "Empty brackets" : "A number goes before )",
      );
    }
    if (t.t === "%") throw new Halt(false, "% goes after a number");
    throw new Halt(
      false,
      i === 0
        ? `A sum can’t start with ${GLYPH[t.t]}`
        : "Two operators in a row",
    );
  };
  const value = expr(true);
  const left = tokens[i];
  if (left) {
    throw new Halt(
      false,
      left.t === ")"
        ? "A ) with no ("
        : left.t === "%"
          ? "% goes after a number"
          : "Missing an operator",
    );
  }
  if (!Number.isFinite(value) || Math.abs(value) >= LIMIT) {
    throw new Halt(false, "Too large to be an amount");
  }
  return value;
}

/** The sum as it could stand now: a trailing operator dropped, brackets closed. */
function closed(tokens: Tok[]): Tok[] {
  const out = [...tokens];
  const open = new Set<Tok["t"]>(["+", "-", "*", "/", "("]);
  while (out.length > 0 && open.has(out[out.length - 1]?.t ?? "num")) {
    out.pop();
  }
  let depth = 0;
  for (const t of out) {
    if (t.t === "(") depth += 1;
    else if (t.t === ")") depth = Math.max(0, depth - 1);
  }
  for (let k = 0; k < depth; k += 1) out.push({ t: ")", raw: ")" });
  return out;
}

type Outcome =
  | { kind: "empty" }
  | { kind: "value"; value: number; literal: boolean }
  | { kind: "unfinished"; preview: number | null }
  | { kind: "invalid"; message: string; preview: number | null };

function evaluate(text: string, percentOf: number | undefined): Outcome {
  const { tokens, problem, unfinished } = lex(text);
  const preview = () => {
    try {
      const t = closed(tokens);
      return t.length > 0 ? run(t, percentOf) : null;
    } catch {
      return null;
    }
  };
  if (tokens.length === 0) {
    if (problem) return { kind: "invalid", message: problem, preview: null };
    return unfinished
      ? { kind: "unfinished", preview: null }
      : { kind: "empty" };
  }
  // A mis-typed number would make any preview a guess: none is offered.
  if (problem) return { kind: "invalid", message: problem, preview: null };
  try {
    const value = run(tokens, percentOf);
    if (unfinished) return { kind: "unfinished", preview: value };
    const literal = isLiteral(tokens);
    return { kind: "value", value, literal };
  } catch (error) {
    if (error instanceof Halt && error.unfinished) {
      return { kind: "unfinished", preview: preview() };
    }
    return {
      kind: "invalid",
      message:
        error instanceof Halt ? error.message : "That sum does not work out",
      preview: preview(),
    };
  }
}

/** One number, with at most a sign in front: nothing to work out. */
const isLiteral = (tokens: Tok[]) =>
  tokens[tokens.length - 1]?.t === "num" &&
  (tokens.length === 1 ||
    (tokens.length === 2 && (tokens[0]?.t === "-" || tokens[0]?.t === "+")));

/** The sum written out: × ÷ − for * / -, spaced binary operators, numbers as typed. */
function pretty(text: string): string {
  let out = "";
  let prev: Tok | null = null;
  for (const t of lex(text).tokens) {
    if (t.t === "num") out += t.raw;
    else if (t.t === "(" || t.t === ")" || t.t === "%") out += t.t;
    else {
      const binary =
        prev !== null && (prev.t === "num" || prev.t === ")" || prev.t === "%");
      out += binary ? ` ${GLYPH[t.t]} ` : GLYPH[t.t];
    }
    prev = t;
  }
  return out;
}

/** Rounds on the decimal digits, not the float: 1.005 at two places is 1.01. */
function roundTo(
  v: number,
  precision: number,
  mode: CalcFieldRounding,
): number {
  const f = 10 ** precision;
  const x = Number((Math.abs(v) * f).toPrecision(15));
  const whole = Math.floor(x);
  const frac = x - whole;
  const eps = 1e-9;
  let n = whole;
  if (mode === "up") n = frac > eps ? whole + 1 : whole;
  else if (mode === "half-even") {
    n =
      Math.abs(frac - 0.5) < eps
        ? whole % 2 === 0
          ? whole
          : whole + 1
        : frac > 0.5
          ? whole + 1
          : whole;
  } else if (mode === "half-up") n = frac >= 0.5 - eps ? whole + 1 : whole;
  const out = Number(((Math.sign(v) * n) / f).toFixed(precision));
  return out === 0 ? 0 : out;
}

const formatters = new Map<number, Intl.NumberFormat>();
/** Grouped figures at `precision` places: the text the field commits, and reads back. */
function figures(v: number, precision: number): string {
  let f = formatters.get(precision);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    formatters.set(precision, f);
  }
  return f.format(v);
}

function symbolOf(currency: string): string {
  if (!currency || currency.toLowerCase() === "none") return "";
  try {
    const part = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency.toUpperCase();
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/* --------------------------------------------------------------- rolling */

type Spin = { d: number; safe: boolean };
const spin = {
  enter: ({ d, safe }: Spin) => ({ y: safe ? `${d * 90}%` : "0%", opacity: 0 }),
  rest: ({ safe }: Spin) => ({
    y: "0%",
    opacity: 1,
    transition: safe
      ? { ...springs.snap, opacity: { duration: durations.fast } }
      : { duration: durations.fast },
  }),
  leave: ({ d, safe }: Spin) => ({
    y: safe ? `${-d * 90}%` : "0%",
    opacity: 0,
    transition: exitFor(durations.fast),
  }),
};

/**
 * The answer as slots counted from the right, so the units stay the units:
 * a changed glyph rolls out and the new one rolls in, up when the answer
 * grew and down when it shrank; a slot gained or lost opens or closes its
 * width instead of shoving the rest.
 */
function Roll({ text, spin: s }: { text: string; spin: Spin }) {
  const chars = Array.from(text);
  return (
    <span className="inline-flex">
      <AnimatePresence initial={false}>
        {chars.map((ch, i) => {
          const slot = chars.length - 1 - i;
          return (
            <motion.span
              key={slot}
              className="inline-grid overflow-clip"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{
                width: 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                s.safe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: 0 }
              }
            >
              <AnimatePresence initial={false} custom={s}>
                <motion.span
                  key={ch}
                  custom={s}
                  variants={spin}
                  initial="enter"
                  animate="rest"
                  exit="leave"
                  className="[grid-area:1/1]"
                >
                  {ch}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------- component */

type Fold = {
  key: number;
  from: string;
  to: string;
  /** Where the old text started inside the field, less its scroll, px. */
  fromLeft: number;
  /** Where the new text starts: it is short, so unscrolled. */
  toLeft: number;
  /** Down into the receipt, or away. */
  down: boolean;
};

/**
 * An amount field that takes arithmetic. Type 1240/3, 12*4+3, (86.5+12)*2 or
 * 15% and the answer rides in a bubble just after the last character, kept
 * up with on the snap spring; its digits roll up when the answer grows and
 * down when it shrinks. An unfinished sum keeps the last answer, dimmed.
 * Enter or leaving the field commits: the sum folds away (or down into a
 * receipt under the field, with `expression`) while the answer folds down
 * into its place, split-flap style. A character that can never be part of a
 * sum is refused and the field shakes softly; a sum that does not work out
 * shakes and says why.
 *
 * The parser is a small recursive descent: no eval, no Function, and it
 * never throws. The input is native, so typing, selection, IME (full-width
 * digits work), paste and undo behave; the commit's rewrite goes through the
 * editing command, so undo brings the sum straight back. The answer is in
 * the field's description and announced once typing settles. Under reduced
 * motion digits cross-fade, the commit is a cross-fade and a failed commit
 * turns the border instead of shaking.
 */
export function CalcField({
  label,
  value,
  defaultValue,
  onValueChange,
  defaultText,
  percentOf,
  placeholder,
  precision: precisionProp = 2,
  currency = "USD",
  expression = true,
  rounding = "half-up",
  sound = false,
  disabled = false,
  className,
}: CalcFieldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const baseId = React.useId();
  const inputId = `${baseId}-field`;
  const hintId = `${baseId}-hint`;
  const answerId = `${baseId}-answer`;
  const precision = Math.round(clamp(precisionProp, 0, 3));
  const symbol = symbolOf(currency);

  const [text, setText] = React.useState(
    () =>
      defaultText ??
      (defaultValue != null ? figures(defaultValue, precision) : ""),
  );
  const [own, setOwn] = React.useState<number | null>(defaultValue ?? null);
  const committed = value !== undefined ? value : own;

  // The text of the last commit (Escape returns to it) and the sum it came
  // from (the receipt).
  const [savedText, setSavedText] = React.useState(() =>
    defaultValue != null ? figures(defaultValue, precision) : "",
  );
  const [receipt, setReceipt] = React.useState<string | null>(null);

  // A host that moves the value somewhere this field did not report: the
  // field writes the new amount in.
  const [heard, setHeard] = React.useState(committed);
  const [reported, setReported] = React.useState(committed);
  if (committed !== heard) {
    setHeard(committed);
    if (committed !== reported) {
      const said = committed === null ? "" : figures(committed, precision);
      setText(said);
      setSavedText(said);
      setReceipt(null);
      setReported(committed);
    }
  } else if (value !== undefined && reported !== committed) {
    // The host kept its value when this field committed: the field goes
    // back to the amount the host holds rather than show a false commit.
    const said = committed === null ? "" : figures(committed, precision);
    setText(said);
    setSavedText(said);
    setReceipt(null);
    setReported(committed);
  }

  const outcome = React.useMemo(
    () => evaluate(text, percentOf),
    [text, percentOf],
  );
  const live =
    outcome.kind === "value"
      ? outcome.value
      : outcome.kind === "empty"
        ? null
        : outcome.preview;
  const answer = live === null ? null : roundTo(live, precision, rounding);
  const stale = outcome.kind !== "value";
  const approx =
    live !== null && answer !== null && Math.abs(answer - live) > 1e-12;
  // A sum gets the bubble; a plain number only when rounding changes it.
  const sum = React.useMemo(() => {
    const { tokens } = lex(text);
    return tokens.length > 0 && !isLiteral(tokens);
  }, [text]);
  const showBubble =
    answer !== null && text.trim() !== "" && (sum || (!stale && approx));
  const money = (v: number) =>
    `${v < 0 ? "−" : ""}${symbol}${figures(Math.abs(v), precision)}`;

  // Digits roll the way the answer moved.
  const [lastAnswer, setLastAnswer] = React.useState(answer);
  const [rollDir, setRollDir] = React.useState(1);
  if (answer !== lastAnswer) {
    if (answer !== null && lastAnswer !== null) {
      setRollDir(answer > lastAnswer ? 1 : -1);
    }
    setLastAnswer(answer);
  }

  const [fold, setFold] = React.useState<Fold | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const meterRef = React.useRef<HTMLSpanElement | null>(null);
  const [bubble, setBubble] = React.useState<HTMLSpanElement | null>(null);
  const bubbleX = useMotionValue(0);
  // Hidden until measured into place, so server markup never shows the
  // bubble sitting over the text before the page is live.
  const bubbleReady = useMotionValue(0);
  const placed = React.useRef<number | null>(null);
  const gliding = React.useRef<AnimationPlaybackControls | null>(null);
  const shaking = React.useRef<AnimationPlaybackControls | null>(null);
  const announceTimer = React.useRef<number | null>(null);
  const foldTimer = React.useRef<number | null>(null);
  const composing = React.useRef(false);
  const writing = React.useRef(false);
  const pasted = React.useRef(false);
  /** The last commit was a blur, which the browser's own undo cannot reverse. */
  const blurCommitted = React.useRef(false);

  /**
   * The bubble's place: just past the end of the text (measured in the
   * input's font, less its scroll), never past the field's right edge. The
   * input keeps exactly the bubble's width free on its right.
   */
  const place = React.useCallback(
    (glide: boolean) => {
      const input = inputRef.current;
      const meter = meterRef.current;
      const layer = layerRef.current;
      if (!input || !meter || !layer) return;
      const width = bubble?.offsetWidth ?? 0;
      input.style.paddingRight = bubble ? `${Math.ceil(width + 10)}px` : "";
      if (!bubble) {
        placed.current = null;
        bubbleReady.set(0);
        return;
      }
      // The browser scrolled the caret into view before the reservation
      // grew; a caret at the end is brought back into view.
      const at = input.value.length;
      if (
        document.activeElement === input &&
        input.selectionStart === at &&
        input.selectionEnd === at
      ) {
        input.scrollLeft = input.scrollWidth;
      }
      const padLeft = parseFloat(getComputedStyle(input).paddingLeft) || 12;
      const end = padLeft + meter.offsetWidth - input.scrollLeft + 4;
      const target = r2(clamp(end, padLeft - 4, layer.clientWidth - width - 4));
      if (placed.current !== null && Math.abs(placed.current - target) < 0.5) {
        return;
      }
      const first = placed.current === null;
      placed.current = target;
      bubbleReady.set(1);
      gliding.current?.stop();
      if (first || !glide || !motionSafe) bubbleX.set(target);
      else {
        gliding.current = animate(bubbleX, target, {
          ...springs.snap,
          velocity: bubbleX.getVelocity(),
        });
      }
    },
    [bubble, bubbleReady, bubbleX, motionSafe],
  );

  React.useLayoutEffect(() => {
    place(true);
  }, [text, answer, place]);

  React.useEffect(() => {
    if (!bubble) {
      place(false);
      return;
    }
    const observer = new ResizeObserver(() => place(true));
    observer.observe(bubble);
    return () => observer.disconnect();
  }, [bubble, place]);

  React.useEffect(
    () => () => {
      gliding.current?.stop();
      shaking.current?.stop();
      if (announceTimer.current !== null) {
        window.clearTimeout(announceTimer.current);
      }
      if (foldTimer.current !== null) window.clearTimeout(foldTimer.current);
    },
    [],
  );

  const shake = () => {
    const el = fieldRef.current;
    audio.play("shrug", { gain: 0.22, pitch: 1.1 });
    if (!el || !motionSafe) return;
    shaking.current?.stop();
    shaking.current = animate(
      el,
      { x: [0, -4, 4, -3, 3, -1, 0] },
      { duration: 0.36, ease: easings.move },
    );
  };

  const refuse = (message: string) => {
    setFailed(message);
    setAnnouncement(`${message}.`);
    shake();
  };

  // Typed characters that can never be arithmetic are refused before they
  // land. Composition and paste are left alone: an IME's text is folded by
  // NFKC, and a paste is flagged, not dropped.
  const latest = React.useRef({ refuse });
  React.useEffect(() => {
    latest.current = { refuse };
  });
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.isComposing || event.inputType !== "insertText") return;
      if (!event.data || ALLOWED.test(event.data.normalize("NFKC"))) return;
      event.preventDefault();
      latest.current.refuse(REFUSED);
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, []);

  const panOfBubble = () => {
    const el = bubble ?? inputRef.current;
    if (!el) return 0;
    const box = el.getBoundingClientRect();
    return panFrom(box.left + box.width / 2, null);
  };

  const announceLater = (sentence: string) => {
    if (announceTimer.current !== null) {
      window.clearTimeout(announceTimer.current);
    }
    announceTimer.current = window.setTimeout(() => {
      announceTimer.current = null;
      setAnnouncement(sentence);
    }, 900);
  };

  /** A new sum, from typing, paste, autofill, undo or the end of an IME run. */
  const heardText = (next: string) => {
    const o = evaluate(next, percentOf);
    const v = o.kind === "value" ? o.value : null;
    const a = v === null ? null : roundTo(v, precision, rounding);
    if (a !== null && a !== answer) {
      audio.play("tick", {
        pitch: r2(clamp(0.8 + 0.12 * Math.log10(1 + Math.abs(a)), 0.7, 1.6)),
        gain: 0.35,
        pan: panOfBubble(),
      });
    }
    if (pasted.current && o.kind === "invalid") refuse(o.message);
    pasted.current = false;
    announceLater(
      o.kind === "value" && a !== null && (!o.literal || a !== v)
        ? `Equals ${Math.abs(a - (v ?? a)) > 1e-12 ? "about " : ""}${money(a)}.`
        : o.kind === "invalid"
          ? `${o.message}.`
          : "",
    );
  };

  /** Rewrites the text through the editing command, so undo can reverse it. */
  const writeText = (next: string, focused: boolean) => {
    const el = inputRef.current;
    let done = false;
    if (el && focused && document.activeElement === el) {
      writing.current = true;
      el.select();
      try {
        done =
          next === ""
            ? document.execCommand("delete")
            : document.execCommand("insertText", false, next);
      } catch {
        done = false;
      }
      writing.current = false;
      done = done && el.value === next;
    }
    if (!done) setText(next);
  };

  const commit = (how: "enter" | "blur"): boolean => {
    const input = inputRef.current;
    if (text.trim() === "") {
      if (committed === null) return false;
      setSavedText("");
      setReceipt(null);
      setReported(null);
      if (value === undefined) setOwn(null);
      audio.play("click", { gain: 0.45, pitch: 0.9, pan: panOfBubble() });
      setAnnouncement("Amount cleared.");
      onValueChange?.(null);
      return true;
    }
    if (outcome.kind !== "value") {
      refuse(
        outcome.kind === "invalid" ? outcome.message : "Finish the sum first",
      );
      return true;
    }
    const amount = roundTo(outcome.value, precision, rounding);
    const nextText = figures(amount, precision);
    if (nextText === text && amount === committed) return false;
    if (announceTimer.current !== null) {
      window.clearTimeout(announceTimer.current);
      announceTimer.current = null;
    }
    const sum = outcome.literal ? null : text;
    if (input && nextText !== text) {
      const padLeft = parseFloat(getComputedStyle(input).paddingLeft) || 12;
      setFold({
        key: (fold?.key ?? 0) + 1,
        from: text,
        to: nextText,
        fromLeft: r2(padLeft - input.scrollLeft),
        toLeft: r2(padLeft),
        down: expression && sum !== null,
      });
      // The field's own text is hidden while the flap turns; if the turn is
      // ever cut short, the text still comes back.
      const key = (fold?.key ?? 0) + 1;
      if (foldTimer.current !== null) window.clearTimeout(foldTimer.current);
      foldTimer.current = window.setTimeout(() => {
        foldTimer.current = null;
        setFold((f) => (f?.key === key ? null : f));
      }, 700);
    }
    setReceipt(sum);
    setSavedText(nextText);
    setFailed(null);
    setReported(amount);
    if (value === undefined) setOwn(amount);
    writeText(nextText, how === "enter");
    blurCommitted.current = how === "blur" && sum !== null;
    audio.play("click", { gain: 0.55, pan: panOfBubble() });
    setAnnouncement(`Set to ${money(amount)}.`);
    onValueChange?.(amount);
    return true;
  };

  const restore = () => {
    if (receipt === null) return;
    inputRef.current?.focus();
    writeText(receipt, true);
    setFold(null);
    heardText(receipt);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing.current) return;
    if (event.key === "Enter") {
      if (commit("enter")) event.preventDefault();
      return;
    }
    if (event.key === "Escape" && text !== savedText) {
      event.preventDefault();
      setFold(null);
      writeText(savedText, true);
      setFailed(null);
      return;
    }
    // After a blur commit the browser has no undo step for the rewrite, so
    // the first undo brings the sum back here instead.
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === "z" &&
      blurCommitted.current &&
      receipt !== null &&
      text === savedText
    ) {
      event.preventDefault();
      blurCommitted.current = false;
      restore();
    }
  };

  // The receipt and the hint: measured, and sprung to their height.
  const [shelf, setShelf] = React.useState<HTMLDivElement | null>(null);
  const shelfHeight = useMotionValue(-1);
  const shelfStyle = useTransform(shelfHeight, (h) =>
    h < 0 ? "auto" : `${h}px`,
  );
  React.useEffect(() => {
    if (!shelf) return;
    let run: AnimationPlaybackControls | null = null;
    const measure = () => {
      const h = r2(shelf.offsetHeight);
      if (shelfHeight.get() < 0 || !motionSafe) {
        run?.stop();
        shelfHeight.set(h);
        return;
      }
      if (h === shelfHeight.get()) return;
      run?.stop();
      run = animate(shelfHeight, h, springs.glide);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shelf);
    return () => {
      observer.disconnect();
      run?.stop();
    };
  }, [shelf, shelfHeight, motionSafe]);

  const editing = text !== savedText;
  const tape = !expression
    ? null
    : editing && sum && outcome.kind !== "invalid"
      ? {
          live: true,
          text: pretty(text),
          // Says why the bubble reads ≈, and which way it went.
          note: approx && !stale ? ROUNDED[rounding] : null,
        }
      : !editing && receipt !== null
        ? { live: false, text: pretty(receipt), note: null }
        : null;
  const invalid = failed !== null || outcome.kind === "invalid";
  const hint = failed
    ? { text: failed, danger: true }
    : outcome.kind === "invalid"
      ? { text: outcome.message, danger: false }
      : text.trim() === ""
        ? {
            text: `Type a sum: 1240/3, 12*4+3${percentOf !== undefined ? `, 15% of ${figures(percentOf, 0)}` : ""}`,
            danger: false,
          }
        : null;
  const spin: Spin = { d: rollDir, safe: motionSafe };
  const sign = approx ? "≈" : "=";

  return (
    <div className={cn("relative flex w-full flex-col", className)}>
      <label
        htmlFor={inputId}
        className={cn("pb-1.5 text-xs text-ink-3", disabled && "opacity-50")}
      >
        {label}
      </label>
      <div ref={fieldRef} className="relative rounded-3 bg-surface-1">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={placeholder ?? figures(0, precision)}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={`${answerId} ${hintId}`}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (writing.current) return;
            setFold(null);
            setFailed(null);
            blurCommitted.current = false;
            if (!composing.current) heardText(next);
          }}
          onPaste={() => {
            pasted.current = true;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            heardText(event.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!disabled) commit("blur");
          }}
          onScroll={() => place(false)}
          onSelect={() => place(true)}
          style={
            symbol
              ? { paddingLeft: `calc(0.75rem + ${symbol.length}ch + 0.25rem)` }
              : undefined
          }
          className={cn(
            "relative block h-10 w-full min-w-0 rounded-3 border bg-transparent px-3 font-mono text-sm text-foreground tabular-nums caret-foreground transition-colors outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid && failed
              ? "border-danger/70"
              : "border-input enabled:hover:border-ink-3/50",
            fold && "text-transparent",
          )}
        />
        {symbol ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-ink-3",
              disabled && "opacity-50",
            )}
          >
            {symbol}
          </span>
        ) : null}

        <div
          ref={layerRef}
          aria-hidden
          className="pointer-events-none absolute inset-px overflow-clip rounded-3 font-mono text-sm tabular-nums"
        >
          <span
            ref={meterRef}
            className="invisible absolute top-0 left-0 whitespace-pre"
          >
            {text}
          </span>

          {fold ? (
            <React.Fragment key={fold.key}>
              <motion.span
                className="absolute top-1/2 -mt-2.5 leading-5 whitespace-pre text-foreground"
                style={{
                  left: fold.fromLeft,
                  originY: fold.down ? 1 : 0,
                  transformPerspective: 480,
                }}
                initial={{ rotateX: 0, y: 0, opacity: 1 }}
                animate={
                  motionSafe
                    ? {
                        rotateX: fold.down ? -80 : 80,
                        y: fold.down ? 10 : 0,
                        opacity: 0,
                      }
                    : { opacity: 0 }
                }
                transition={{ duration: durations.fast, ease: easings.exit }}
              >
                {fold.from}
              </motion.span>
              <motion.span
                className="absolute top-1/2 -mt-2.5 leading-5 whitespace-pre text-foreground"
                style={{
                  left: fold.toLeft,
                  originY: 0,
                  transformPerspective: 480,
                }}
                initial={{ rotateX: motionSafe ? -80 : 0, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        delay: 0.1,
                        opacity: { duration: durations.fast, delay: 0.1 },
                      }
                    : { duration: durations.fast }
                }
                onAnimationComplete={() =>
                  setFold((f) => (f?.key === fold.key ? null : f))
                }
              >
                {fold.to}
              </motion.span>
            </React.Fragment>
          ) : null}

          <motion.span
            className="absolute inset-0"
            style={{ opacity: bubbleReady }}
          >
            <AnimatePresence initial={false}>
              {showBubble && answer !== null ? (
                <motion.span
                  key="bubble"
                  ref={setBubble}
                  className={cn(
                    "absolute top-1/2 left-0 flex h-7 -translate-y-1/2 items-center gap-1 rounded-2 px-2 leading-5 whitespace-nowrap transition-colors",
                    stale
                      ? "bg-surface-2 text-ink-3"
                      : "bg-cobalt-wash text-cobalt-bright",
                  )}
                  style={{ x: bubbleX, originX: 0 }}
                  initial={{ opacity: 0, scale: motionSafe ? 0.85 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.85 : 1,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <span className="grid">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={sign}
                        className="[grid-area:1/1]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{ duration: durations.fast }}
                      >
                        {sign}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <Roll text={money(answer)} spin={spin} />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.span>
        </div>
      </div>

      <span id={answerId} className="sr-only">
        {showBubble && answer !== null
          ? `${stale ? "Last answer" : "Equals"} ${approx ? "about " : ""}${money(answer)}.`
          : ""}
      </span>

      <motion.div className="overflow-clip" style={{ height: shelfStyle }}>
        <div
          ref={setShelf}
          className={cn("flex flex-col gap-1", (tape || hint) && "pt-1.5")}
        >
          {tape ? (
            tape.live ? (
              <p
                aria-hidden
                className="flex min-w-0 gap-1 px-0.5 font-mono text-[11px] leading-4 text-ink-3"
                title={tape.text}
              >
                <span className="min-w-0 truncate">{tape.text}</span>
                {tape.note ? (
                  <span className="shrink-0 font-sans">· {tape.note}</span>
                ) : null}
              </p>
            ) : (
              <motion.button
                type="button"
                onClick={restore}
                disabled={disabled}
                aria-label={`Edit the sum ${tape.text}`}
                initial={
                  motionSafe ? { rotateX: 70, opacity: 0 } : { opacity: 0 }
                }
                animate={{ rotateX: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                style={{ originY: 0, transformPerspective: 480 }}
                className="flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-1 px-0.5 font-mono text-[11px] leading-4 text-ink-3 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid enabled:hover:text-foreground disabled:cursor-not-allowed"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.5 4.5h4.25a2.25 2.25 0 0 1 0 4.5H5" />
                  <path d="M5 2.75 3.25 4.5 5 6.25" />
                </svg>
                <span className="truncate">from {tape.text}</span>
              </motion.button>
            )
          ) : null}
          {hint ? (
            <p
              id={hintId}
              className={cn(
                "px-0.5 text-[11px] leading-4",
                hint.danger ? "text-danger" : "text-ink-3",
              )}
            >
              {hint.text}
            </p>
          ) : (
            <span id={hintId} hidden />
          )}
        </div>
      </motion.div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
