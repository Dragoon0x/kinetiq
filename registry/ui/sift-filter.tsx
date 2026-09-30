"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import {
  semitones,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SiftFilterItem = {
  id: string;
  /** The card's title. Searched, and lit where it matches. */
  title: string;
  /** A short second line. Searched too. */
  meta?: string;
  /** Extra words it answers to, never shown. */
  tags?: readonly string[];
};

export type SiftFilterProps = {
  /** The cards. */
  items: readonly SiftFilterItem[];
  /** What the field filters. Its visible label and accessible name. */
  label: string;
  /** @default "Type to filter" */
  placeholder?: string;
  /** Controlled query. */
  value?: string;
  /** Initial query when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the new query on every edit, and with "" when cleared. */
  onValueChange?: (query: string) => void;
  /** Whether a card answers a query. Defaults to every word of the query appearing in its title, meta or tags. */
  filter?: (item: SiftFilterItem, query: string) => boolean;
  /** Makes each card a button, and fires with the card pressed. */
  onSelect?: (item: SiftFilterItem) => void;
  /** How hard cards fall, px/s², 1000 to 6000. Also how hard the fallen are thrown back up. @default 2750 */
  gravity?: number;
  /** How far a card turns on its way down, in degrees, 0 to 40. @default 14 */
  spin?: number;
  /** The gap between one card leaving (or returning) and the next, ms, 0 to 100. @default 35 */
  stagger?: number;
  /** Light the query in each card. @default true */
  highlight?: boolean;
  /** Play a patter as cards fall through, and a rise when they come back. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const CARD_H = 64;
const GAP = 8;
const PITCH = CARD_H + GAP;
/** How far past the floor a card falls: enough for a turned card's corner. */
const BELOW = 64;
/** A returning card starts this far under the floor. */
const UNDER = 12;
/** The spoken count waits for typing to pause, ms. */
const SETTLE = 500;
/** The whole cascade stays inside the choreography budget, s. */
const BUDGET = 0.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const wordsOf = (query: string) =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

const defaultFilter = (item: SiftFilterItem, query: string) => {
  const hay = [item.title, item.meta ?? "", ...(item.tags ?? [])]
    .join(" ")
    .toLowerCase();
  return wordsOf(query).every((w) => hay.includes(w));
};

const topOf = (slot: number) => Math.floor(slot / 2) * PITCH;
const colOf = (slot: number) => slot % 2;
/** The set's height for a count; an empty set keeps one row for its message. */
const heightOf = (count: number) =>
  count === 0 ? CARD_H : Math.ceil(count / 2) * PITCH - GAP;

/** Unsigned FNV-1a: each card's own fall, the same every time. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The stagger per card for a batch of `count`, inside the budget. */
const gapFor = (stagger: number, count: number) =>
  count > 1 ? Math.min(clamp(stagger, 0, 200) / 1000, BUDGET / (count - 1)) : 0;

function runs(text: string, words: readonly string[]) {
  const lower = text.toLowerCase();
  if (words.length === 0 || lower.length !== text.length) {
    return [{ text, lit: false }];
  }
  const marks: [number, number][] = [];
  for (const w of words) {
    let at = lower.indexOf(w);
    while (at !== -1) {
      marks.push([at, at + w.length]);
      at = lower.indexOf(w, at + w.length);
    }
  }
  if (marks.length === 0) return [{ text, lit: false }];
  marks.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([m[0], m[1]]);
  }
  const out: { text: string; lit: boolean }[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a > cursor) out.push({ text: text.slice(cursor, a), lit: false });
    out.push({ text: text.slice(a, b), lit: true });
    cursor = b;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), lit: false });
  return out;
}

function Lit({
  text,
  words,
  on,
}: {
  text: string;
  words: readonly string[];
  on: boolean;
}) {
  if (!on) return <>{text}</>;
  return (
    <>
      {runs(text, words).map((run, i) =>
        run.lit ? (
          <mark key={i} className="rounded-1 bg-cobalt-wash text-cobalt-bright">
            {run.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{run.text}</React.Fragment>
        ),
      )}
    </>
  );
}

type CardProps = {
  item: SiftFilterItem;
  /** Its place among the matches, or -1 once it has fallen. */
  slot: number;
  /** When this card goes, after the batch starts, s. */
  delay: number;
  floor: MotionValue<number>;
  /** Where the floor is heading. */
  floorTarget: number;
  gravity: number;
  spin: number;
  words: readonly string[];
  highlight: boolean;
  motionSafe: boolean;
  audio: TactileSound;
  onSelect?: (item: SiftFilterItem) => void;
};

function SiftCard({
  item,
  slot,
  delay,
  floor,
  floorTarget,
  gravity,
  spin,
  words,
  highlight,
  motionSafe,
  audio,
  onSelect,
}: CardProps) {
  const fallen = slot < 0;
  const h = hash(item.id);
  // Each card falls its own way: a side, and most or all of the spin.
  const turn = (h & 1 ? 1 : -1) * (0.7 + ((h >>> 1) % 7) / 20);
  const voice = 1.1 * semitones(((h >>> 4) % 9) - 4);

  const top = useMotionValue(fallen ? floorTarget + BELOW : topOf(slot));
  const col = useMotionValue(fallen ? 0 : colOf(slot));
  const rot = useMotionValue(0);
  const alpha = useMotionValue(fallen ? 0 : 1);
  const running = React.useRef<AnimationPlaybackControls[]>([]);

  const latest = React.useRef({
    delay,
    floorTarget,
    gravity,
    spin,
    motionSafe,
    audio,
  });
  React.useEffect(() => {
    latest.current = { delay, floorTarget, gravity, spin, motionSafe, audio };
  });

  const was = React.useRef(slot);
  React.useEffect(() => {
    const from = was.current;
    if (from === slot) return;
    was.current = slot;
    for (const c of running.current) c.stop();
    running.current = [];
    const now = latest.current;
    const g = clamp(now.gravity, 200, 20000);
    const moving = Math.abs(top.getVelocity()) > 40;
    const wait = moving ? 0 : now.delay;
    const patter = () =>
      now.audio.play("plip", {
        pitch: r2(voice),
        gain: 0.3,
        pan: col.get() > 0.5 ? 0.3 : -0.3,
      });

    if (slot < 0) {
      // Past the floor, wherever the floor is or is heading.
      const floorY = Math.max(floor.get(), now.floorTarget);
      const y0 = top.get();
      if (!now.motionSafe) {
        running.current = [
          animate(alpha, 0, {
            duration: durations.fast,
            ease: easings.exit,
            delay: wait,
            onComplete: () => {
              top.set(floorY + BELOW);
              rot.set(0);
              patter();
            },
          }),
        ];
        return;
      }
      // A body falling: y = y0 + v0·t + ½·g·t², from whatever speed it had,
      // so a card caught on its way back up slows, turns and drops.
      const v0 = moving ? top.getVelocity() : 0;
      const distance = Math.max(1, floorY + BELOW - y0);
      const duration = (-v0 + Math.sqrt(v0 * v0 + 2 * g * distance)) / g;
      const r0 = rot.get();
      const r1 = turn * clamp(now.spin, 0, 90);
      let through = y0 >= floor.get();
      running.current = [
        animate(0, duration, {
          duration,
          ease: easings.linear,
          delay: wait,
          onUpdate: (t) => {
            const y = y0 + v0 * t + 0.5 * g * t * t;
            top.set(r2(y));
            rot.set(r2(r0 + (r1 - r0) * (t / duration)));
            if (!through && y >= floor.get()) {
              through = true;
              patter();
            }
          },
        }),
        // Gone once it is past the floor, so a floor that later drops lower
        // never shows it resting there. Scheduled with the fall rather than
        // set from its completion, which can land after the frame has
        // rendered and never be drawn.
        animate(alpha, 0, {
          duration: durations.blink,
          ease: easings.linear,
          delay: wait + duration,
        }),
      ];
      return;
    }

    const to = topOf(slot);
    const toCol = colOf(slot);

    if (from < 0) {
      // Back from below the floor it will have, unless it never got there.
      const gone = alpha.get() < 0.01 || top.get() >= floor.get();
      if (!now.motionSafe) {
        top.set(to);
        col.set(toCol);
        rot.set(0);
        alpha.set(0);
        running.current = [
          animate(alpha, 1, {
            duration: durations.fast,
            ease: easings.enter,
            delay: wait,
          }),
        ];
        return;
      }
      let velocity = top.getVelocity();
      if (gone) {
        const start = Math.max(floor.get(), now.floorTarget) + UNDER;
        top.set(start);
        col.set(toCol);
        alpha.set(1);
        // Thrown up at a share of the speed that would carry it to its slot
        // under gravity: enough to feel thrown, not enough to fly past.
        velocity = -0.35 * Math.sqrt(2 * g * Math.max(0, start - to));
      }
      running.current = [
        animate(top, to, { ...springs.snap, velocity, delay: wait }),
        animate(rot, 0, { ...springs.snap, delay: wait }),
        animate(col, toCol, { ...springs.glide, delay: wait }),
      ];
      if (!gone && alpha.get() < 1) {
        running.current.push(
          animate(alpha, 1, { duration: durations.fast, ease: easings.enter }),
        );
      }
      return;
    }

    // Closing ranks: a layout move, on glide, at once.
    if (!now.motionSafe) {
      running.current = [
        animate(alpha, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            top.set(to);
            col.set(toCol);
            running.current = [
              animate(alpha, 1, {
                duration: durations.fast,
                ease: easings.enter,
              }),
            ];
          },
        }),
      ];
      return;
    }
    running.current = [
      animate(top, to, { ...springs.glide, velocity: top.getVelocity() }),
      animate(col, toCol, springs.glide),
      animate(rot, 0, springs.glide),
    ];
    if (alpha.get() < 1) {
      running.current.push(
        animate(alpha, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
  }, [alpha, col, floor, rot, slot, top, turn, voice]);

  // Unmounting (or a development re-run) finishes a move rather than
  // freezing it half way.
  React.useEffect(
    () => () => {
      for (const c of running.current) c.complete();
      running.current = [];
    },
    [],
  );

  const transform = useTransform(
    [top, col, rot] as MotionValue<number>[],
    ([t = 0, c = 0, r = 0]: number[]) =>
      `translateX(calc(${r2(c * 100)}% + ${r2(c * GAP)}px)) translateY(${r2(t)}px) rotate(${r2(r)}deg)`,
  );

  const body = (
    <>
      <span className="truncate text-sm text-foreground" title={item.title}>
        <Lit text={item.title} words={words} on={highlight} />
      </span>
      {item.meta ? (
        <span className="truncate text-xs text-ink-3">
          <Lit text={item.meta} words={words} on={highlight} />
        </span>
      ) : null}
    </>
  );
  const face =
    "flex h-full w-full min-w-0 flex-col justify-center gap-0.5 rounded-3 border border-hairline bg-surface-1 px-3 text-left";

  return (
    <motion.li
      aria-hidden={fallen ? true : undefined}
      inert={fallen}
      className={cn("absolute top-0 left-0", fallen ? "z-0" : "z-[1]")}
      style={{
        width: `calc(50% - ${GAP / 2}px)`,
        height: CARD_H,
        transform,
        opacity: alpha,
      }}
    >
      {onSelect ? (
        <button
          type="button"
          tabIndex={fallen ? -1 : undefined}
          onClick={() => onSelect(item)}
          className={cn(
            face,
            "cursor-pointer transition-colors outline-none hover:border-hairline-strong hover:bg-surface-2",
            // Inset: the set clips at its edges, and a ring outside would be cut.
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          {body}
        </button>
      ) : (
        <div className={face}>{body}</div>
      )}
    </motion.li>
  );
}

type Batch = {
  key: string;
  /** How many cards match. */
  count: number;
  /** Every card's slot in this set; missing means fallen. */
  slots: Readonly<Record<string, number>>;
  /** The cards that fell in this change: where from, and in what order. */
  fell: readonly { id: string; from: number; rank: number }[];
  /** The cards that came back in this change, in the order they land. */
  rose: Readonly<Record<string, number>>;
  riseCount: number;
};

/**
 * A filter field over a two-column set of cards. As you type, every card that
 * stops matching drops off the bottom under gravity with a slight spin, while
 * the cards that still match close ranks into the gaps; delete back, or clear
 * the field, and the fallen come back up from below on springs.
 *
 * A fall is a body falling: constant acceleration from whatever speed the
 * card had, so its time is √(2d/g) from rest and a card called back and then
 * dropped again turns over naturally. The set clips at its floor, so cards
 * leave through it, and the floor waits for the last of them before it glides
 * up to fit. Survivors glide to their new places; the returning land on the
 * snap spring with their spin unwinding. Everything runs on motion values,
 * one set per card, never React state per frame.
 *
 * The field is a real input with a visible label, and composing text with an
 * IME filters on what was committed. Fallen cards are hidden from assistive
 * technology and the tab order from the moment they go. Under reduced motion
 * cards fade out and in where they are and the floor changes height on a
 * short tween; the count, the spoken summary and the patter still answer.
 */
export function SiftFilter({
  items,
  label,
  placeholder = "Type to filter",
  value,
  defaultValue = "",
  onValueChange,
  filter,
  onSelect,
  gravity = 2750,
  spin = 14,
  stagger = 35,
  highlight = true,
  sound = false,
  disabled = false,
  className,
}: SiftFilterProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const id = React.useId();
  const inputId = `${id}-input`;

  const [own, setOwn] = React.useState(defaultValue);
  const text = value ?? own;
  const [composing, setComposing] = React.useState(false);
  const [frozen, setFrozen] = React.useState("");
  const q = (composing ? frozen : text).trim();
  const words = wordsOf(q);
  const test = filter ?? defaultFilter;
  const matchesOf = (query: string) =>
    query ? items.filter((item) => test(item, query)) : items;
  const visible = matchesOf(q);
  const count = visible.length;

  const slots: Record<string, number> = {};
  visible.forEach((item, i) => {
    slots[item.id] = i;
  });
  const key = visible.map((item) => item.id).join("\u0000");
  const [batch, setBatch] = React.useState<Batch>(() => ({
    key,
    count,
    slots,
    fell: [],
    rose: {},
    riseCount: 0,
  }));
  if (batch.key !== key) {
    const fell = items
      .filter(
        (item) =>
          batch.slots[item.id] !== undefined && slots[item.id] === undefined,
      )
      .map((item, rank) => ({
        id: item.id,
        from: batch.slots[item.id] ?? 0,
        rank,
      }));
    const rose = visible.filter((item) => batch.slots[item.id] === undefined);
    setBatch({
      key,
      count,
      slots,
      fell,
      rose: Object.fromEntries(rose.map((item, n) => [item.id, n])),
      riseCount: rose.length,
    });
  }
  const fallGap = gapFor(stagger, batch.fell.length);
  const riseGap = gapFor(stagger, batch.riseCount);
  const fallDelay: Record<string, number> = {};
  for (const f of batch.fell) fallDelay[f.id] = f.rank * fallGap;

  const target = heightOf(count);
  const floor = useMotionValue(target);
  const floorRun = React.useRef<AnimationPlaybackControls | null>(null);
  const latest = React.useRef({ gravity, motionSafe, fallGap });
  React.useEffect(() => {
    latest.current = { gravity, motionSafe, fallGap };
  });

  // The floor rises only once the last faller is through it; it drops at
  // once, so the returning have somewhere to land.
  React.useEffect(() => {
    const to = heightOf(batch.count);
    const now = floor.get();
    const { gravity: g0, motionSafe: safe, fallGap: gap } = latest.current;
    floorRun.current?.stop();
    if (to === now) return;
    if (!safe) {
      const wait = to < now ? durations.fast + batch.fell.length * gap : 0;
      floorRun.current = animate(floor, to, {
        duration: durations.fast,
        ease: easings.enter,
        delay: wait,
      });
      return;
    }
    let wait = 0;
    if (to < now) {
      const g = clamp(g0, 200, 20000);
      for (const f of batch.fell) {
        const d = now + BELOW - topOf(f.from);
        wait = Math.max(wait, f.rank * gap + Math.sqrt((2 * d) / g));
      }
    }
    floorRun.current = animate(floor, to, { ...springs.glide, delay: wait });
  }, [batch, floor]);

  React.useEffect(() => () => floorRun.current?.complete(), []);

  // The count is spoken once typing pauses, never per keystroke.
  const sentence = q
    ? `${count} of ${items.length} match.`
    : `All ${items.length} shown.`;
  const [spoken, setSpoken] = React.useState("");
  const first = React.useRef(sentence);
  React.useEffect(() => {
    if (first.current === sentence) return;
    first.current = "";
    const t = window.setTimeout(() => setSpoken(sentence), SETTLE);
    return () => window.clearTimeout(t);
  }, [sentence]);

  const report = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** The rise is heard from the edit that brings cards back. */
  const riseFor = (from: string, to: string) => {
    const before = new Set(matchesOf(from.trim()).map((item) => item.id));
    const back = matchesOf(to.trim()).filter(
      (item) => !before.has(item.id),
    ).length;
    if (back > 0) {
      audio.play("rise", {
        pitch: r2(0.9 + Math.min(0.5, back * 0.05)),
        gain: 0.35,
      });
    }
  };

  const clear = () => {
    if (text === "") return;
    riseFor(q, "");
    report("");
  };

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={inputId}
          className="min-w-0 truncate text-xs text-ink-2"
          title={label}
        >
          {label}
        </label>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-ink-3 tabular-nums"
        >
          {q ? `${count} of ${items.length}` : `${items.length}`}
        </span>
      </div>
      <div
        className={cn(
          "mt-1.5 flex h-9 items-center rounded-2 border border-input bg-surface-1 transition-colors",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
          disabled ? "opacity-50" : "hover:border-ink-3/60",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="ml-3 size-4 shrink-0 text-ink-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 3.5h11L9.25 8.5v4l-2.5 1.25V8.5z" />
        </svg>
        <input
          id={inputId}
          type="text"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => {
            const next = event.target.value;
            const mid =
              composing || (event.nativeEvent as InputEvent).isComposing;
            // Mid-composition the set holds still; compositionend decides.
            if (!mid) riseFor(q, next);
            report(next);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || event.nativeEvent.isComposing) {
              return;
            }
            if (text === "") return;
            // Handled here, so the page never also closes something on it.
            event.preventDefault();
            clear();
          }}
          onCompositionStart={() => {
            setFrozen(q);
            setComposing(true);
          }}
          onCompositionEnd={(event) => {
            setComposing(false);
            riseFor(frozen, event.currentTarget.value);
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          aria-label="Clear filter"
          tabIndex={text ? undefined : -1}
          disabled={disabled || text === ""}
          onClick={clear}
          className={cn(
            "mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-1 text-ink-3 transition-[color,opacity] outline-none hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
            text ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="relative mt-3">
        <motion.ul
          role="list"
          className="relative"
          // The floor clips; a returning card's small overshoot may show in
          // the gap above.
          style={{ height: floor, clipPath: "inset(-8px 0px 0px 0px)" }}
        >
          {items.map((item) => {
            const slot = slots[item.id] ?? -1;
            const delay =
              slot < 0
                ? (fallDelay[item.id] ?? 0)
                : (batch.rose[item.id] ?? 0) * riseGap;
            return (
              <SiftCard
                key={item.id}
                item={item}
                slot={slot}
                delay={delay}
                floor={floor}
                floorTarget={target}
                gravity={gravity}
                spin={spin}
                words={words}
                highlight={highlight}
                motionSafe={motionSafe}
                audio={audio}
                onSelect={disabled ? undefined : onSelect}
              />
            );
          })}
        </motion.ul>
        <AnimatePresence initial={false}>
          {count === 0 ? (
            <motion.p
              key="none"
              className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center rounded-3 border border-dashed border-hairline px-4 text-center text-xs text-ink-3"
              style={{ height: CARD_H }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: motionSafe ? 0.2 : 0,
                },
              }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              {`Nothing matches “${q}”.`}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
