"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RollSearchItem = {
  id: string;
  /** What the result is called. Searched, and lit where it matches. */
  label: string;
  /** A short second line: a section, a type. Searched too. */
  meta?: string;
  /** Extra words it answers to, never shown. */
  keywords?: readonly string[];
};

export type RollSearchResults = "list" | "cards";

export type RollSearchProps = {
  /** What is searched. */
  items: readonly RollSearchItem[];
  /** What is being searched, as "Search docs": the lens's name and the field's visible label. */
  label: string;
  /** @default "Search" */
  placeholder?: string;
  /** Controlled query. */
  value?: string;
  /** Initial query when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the new query on every edit, and with "" when the search rolls up. */
  onValueChange?: (query: string) => void;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or blur that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** Enter, or a press on a result. The search then rolls up. */
  onSelect?: (item: RollSearchItem) => void;
  /** Whether an item answers a query. Defaults to every word of the query appearing in its label, meta or keywords. */
  filter?: (item: RollSearchItem, query: string) => boolean;
  /** The most results shown at once. @default 4 */
  limit?: number;
  /** The key that opens it from anywhere on the page; `null` for none. @default "/" */
  shortcut?: string | null;
  /** How far the field unrolls, in px, 200 to 400. It shrinks to fit a narrower box. @default 320 */
  width?: number;
  /** The lens turns as it travels, like a wheel; off, it slides. @default true */
  roll?: boolean;
  /** Compact rows, or small cards in two columns. @default "list" */
  results?: RollSearchResults;
  /** Light the query in each result. @default true */
  highlight?: boolean;
  /** Play the roll's whir and a tick as each result lands. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The lens, and the height of the field, px. */
const LENS = 36;
/** A result's drop has landed about this long after it starts, s. */
const LANDS = 0.09;
/** The spoken count waits for typing to pause, ms. */
const SETTLE = 500;

const EDITABLE =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

const wordsOf = (query: string) =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

const defaultFilter = (item: RollSearchItem, query: string) => {
  const hay = [item.label, item.meta ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return wordsOf(query).every((w) => hay.includes(w));
};

/** The text cut into runs, with every occurrence of a query word marked. */
function runs(text: string, words: readonly string[]) {
  const lower = text.toLowerCase();
  // A few characters change length when lowercased; those are left unlit
  // rather than lit in the wrong place.
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

function PageGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-ink-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinejoin="round"
    >
      <path d="M4 1.75h5.25L12.5 5v9.25H4z" />
      <path d="M9 1.75V5.25h3.5M6 8.5h4M6 11h4" />
    </svg>
  );
}

type Seen = {
  key: string;
  ids: readonly string[];
  /** Arrival order of the rows new in this set. */
  rank: Readonly<Record<string, number>>;
  count: number;
};

/**
 * A search that lives as a round lens at the right end of its slot. Pressed,
 * or with "/" typed anywhere on the page, the lens rolls to the left end like
 * a wheel while the field unrolls behind it like a strip of carpet, and focus
 * lands in the input. Results drop in below in a list whose height is
 * measured, never reserved, with the query lit in each. Escape rolls the lens
 * back to the right, rolling the field up into it.
 *
 * One motion value carries the whole roll: the pill's width, the lens's place
 * and its turn are all read from it, so the wheel never slips. It opens on the
 * snap spring and closes on glide; the lens and pill are held inside the slot,
 * so the overshoot survives only as the wheel rocking against the end. The
 * rotation is a whole number of turns over the full travel, so the glyph
 * always lands upright.
 *
 * The input is a real combobox with a visible label heading its results:
 * arrows move through them, Enter picks one, Escape rolls it up and hands
 * focus back to the lens. Under reduced motion the slot cross-fades between
 * closed and open and results fade in place; the ticks still mark arrivals.
 */
export function RollSearch({
  items,
  label,
  placeholder = "Search",
  value,
  defaultValue = "",
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  onSelect,
  filter,
  limit = 4,
  shortcut = "/",
  width = 320,
  roll = true,
  results = "list",
  highlight = true,
  sound = false,
  disabled = false,
  className,
}: RollSearchProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const id = React.useId();
  const inputId = `${id}-input`;
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (itemId: string) =>
    `${listId}-${itemId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const [ownQuery, setOwnQuery] = React.useState(defaultValue);
  const query = value ?? ownQuery;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  // While an IME is composing, results hold the last committed query; the
  // input itself always shows what is typed.
  const [composing, setComposing] = React.useState(false);
  const [frozen, setFrozen] = React.useState("");
  const q = (composing ? frozen : query).trim();
  const words = wordsOf(q);
  const test = filter ?? defaultFilter;
  const matches = q ? items.filter((item) => test(item, q)) : [];
  const cap = Math.max(1, Math.round(limit));
  const shown = matches.slice(0, cap);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeIndex = shown.findIndex((item) => item.id === activeId);

  // Which rows are new in this set, and in what order they land.
  const key = shown.map((item) => item.id).join("\u0000");
  const [seen, setSeen] = React.useState<Seen>(() => ({
    key,
    ids: shown.map((item) => item.id),
    rank: {},
    count: 0,
  }));
  if (seen.key !== key) {
    const before = new Set(seen.ids);
    const arriving = shown.filter((item) => !before.has(item.id));
    setSeen({
      key,
      ids: shown.map((item) => item.id),
      rank: Object.fromEntries(arriving.map((item, n) => [item.id, n])),
      count: arriving.length,
    });
  }
  const step = seen.count > 1 ? cascade(seen.count) : 0;

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [slot, setSlot] = React.useState<HTMLDivElement | null>(null);
  const [slotWidth, setSlotWidth] = React.useState<number | null>(null);
  const [panel, setPanel] = React.useState<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const lensRef = React.useRef<HTMLButtonElement | null>(null);

  // Until the slot is measured, the requested width stands in for it.
  const reach = Math.max(0, (slotWidth ?? width) - LENS);
  const turns = Math.max(1, Math.round(reach / (Math.PI * LENS)));

  const travel = useMotionValue(isOpen ? reach : 0);
  const veil = useMotionValue(1);
  const speed = useVelocity(travel);
  const run = React.useRef<AnimationPlaybackControls[]>([]);
  const loop = React.useRef<LoopHandle | null>(null);
  const gestured = React.useRef(false);

  const stopWhir = React.useCallback(() => {
    loop.current?.stop();
    loop.current = null;
  }, []);

  const panOfLens = () => {
    const rect = lensRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const rollTo = (to: boolean, audible: boolean) => {
    for (const c of run.current) c.stop();
    run.current = [];
    const target = to ? reach : 0;
    if (!audible) stopWhir();
    if (!motionSafe) {
      stopWhir();
      run.current = [
        animate(veil, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            travel.set(target);
            run.current = [
              animate(veil, 1, {
                duration: durations.fast,
                ease: easings.enter,
              }),
            ];
          },
        }),
      ];
      return;
    }
    if (veil.get() < 1) {
      run.current.push(
        animate(veil, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    if (audible) {
      if (roll) {
        loop.current ??= audio.start("whir", {
          gain: 0,
          pitch: 0.8,
          pan: panOfLens(),
        });
      } else {
        audio.play("swish", { gain: 0.3, pitch: 1.1, pan: panOfLens() });
      }
    }
    // The wheel arrives with one crisp overshoot; rolling up is a plain move.
    run.current.push(
      animate(travel, target, {
        ...(to ? springs.snap : springs.glide),
        velocity: travel.getVelocity(),
        onComplete: stopWhir,
      }),
    );
  };

  const report = (next: string) => {
    if (value === undefined) setOwnQuery(next);
    onValueChange?.(next);
  };

  /** Open or close from a press, a key or a blur. */
  const request = (next: boolean) => {
    if (next === isOpen || (next && disabled)) return;
    gestured.current = true;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setActiveId(null);
      if (query !== "") report("");
    }
  };

  const openAndFocus = () => {
    if (disabled) return;
    request(true);
    // Focused inside the press itself, so a phone raises its keyboard.
    inputRef.current?.focus({ preventScroll: true });
  };

  const closeToLens = () => {
    request(false);
    lensRef.current?.focus({ preventScroll: true });
  };

  const select = (item: RollSearchItem) => {
    onSelect?.(item);
    closeToLens();
  };

  const latest = React.useRef({ rollTo, openAndFocus, disabled, shortcut });
  React.useEffect(() => {
    latest.current = { rollTo, openAndFocus, disabled, shortcut };
  });

  // Open or closed, by a press or by the host, the lens rolls there once.
  const shownOpen = React.useRef(isOpen);
  React.useEffect(() => {
    if (shownOpen.current === isOpen) return;
    shownOpen.current = isOpen;
    const audible = gestured.current;
    gestured.current = false;
    latest.current.rollTo(isOpen, audible);
  }, [isOpen]);

  // A slot that changes width moves the open lens with it.
  React.useEffect(() => {
    if (!shownOpen.current) return;
    for (const c of run.current) c.stop();
    run.current = [];
    stopWhir();
    travel.set(reach);
    veil.set(1);
  }, [reach, stopWhir, travel, veil]);

  // The whir is the lens's speed made audible, frame by frame.
  React.useEffect(
    () =>
      speed.on("change", (v) => {
        const l = loop.current;
        if (!l) return;
        const s = Math.abs(v);
        l.set({
          gain: r2(Math.min(0.55, s / 1400)),
          pitch: r2(0.7 + Math.min(1.1, s / 1600)),
        });
      }),
    [speed],
  );

  // A tick as each arriving result lands, a little lower down the list. The
  // next keystroke cancels any still to come.
  const soundRef = React.useRef(audio);
  React.useEffect(() => {
    soundRef.current = audio;
  });
  React.useEffect(() => {
    if (seen.count === 0) return;
    const gap = seen.count > 1 ? cascade(seen.count) : 0;
    const timers = Object.values(seen.rank).map((n) =>
      window.setTimeout(
        () =>
          soundRef.current.play("tick", {
            pitch: r2(1.25 * semitones(-2 * n)),
            gain: 0.32,
          }),
        Math.round((n * gap + LANDS) * 1000),
      ),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [seen]);

  // "/" anywhere on the page, unless someone is typing or the key is taken.
  React.useEffect(() => {
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const now = latest.current;
      if (!now.shortcut || now.disabled) return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== now.shortcut) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(EDITABLE)) return;
      if (root.closest("[inert]") || root.getClientRects().length === 0) {
        return;
      }
      const dialog = target?.closest(
        "dialog, [role='dialog'], [role='alertdialog']",
      );
      if (dialog && !dialog.contains(root)) return;
      event.preventDefault();
      now.openAndFocus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [root]);

  // The slot and the results are measured, never reserved.
  React.useEffect(() => {
    if (!slot) return;
    const observer = new ResizeObserver(() =>
      setSlotWidth(r2(slot.offsetWidth)),
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, [slot]);
  React.useEffect(() => {
    if (!panel) return;
    const observer = new ResizeObserver(() =>
      setPanelHeight(r2(panel.offsetHeight)),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  // The count is spoken once typing pauses, never per keystroke.
  const sentence = !isOpen
    ? ""
    : !q
      ? ""
      : matches.length === 0
        ? "No results."
        : `${matches.length} ${matches.length === 1 ? "result" : "results"}.`;
  const [spoken, setSpoken] = React.useState("");
  React.useEffect(() => {
    const t = window.setTimeout(() => setSpoken(sentence), SETTLE);
    return () => window.clearTimeout(t);
  }, [sentence]);

  React.useEffect(() => {
    if (disabled) stopWhir();
  }, [disabled, stopWhir]);

  // Unmounting (or a development re-run) finishes the roll rather than
  // freezing the lens half way; the whir stops either way.
  React.useEffect(
    () => () => {
      for (const c of run.current) c.complete();
      stopWhir();
    },
    [stopWhir],
  );

  // Per frame, all from the one travel value, every number rounded.
  const along = (t: number) => clamp(t, 0, reach);
  const lensX = useTransform(travel, (t) => r2(-along(t)));
  const pillWidth = useTransform(travel, (t) => r2(LENS + along(t)));
  // Counter-clockwise going left. The raw value, not the held one: an
  // overshoot past the end shows as the wheel rocking against it.
  const turn = useTransform(travel, (t) =>
    roll && reach > 0 ? r2(-(t / reach) * turns * 360) : 0,
  );
  const reveal = useTransform(
    travel,
    (t) => `inset(0px 0px 0px ${r2(Math.max(0, reach - along(t)))}px)`,
  );
  const closeOpacity = useTransform(travel, (t) => r2(clamp01(t / 24)));
  const keyOpacity = useTransform(travel, (t) => r2(1 - clamp01(t / 12)));

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (shown.length === 0) return;
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const from = activeIndex === -1 ? (dir > 0 ? -1 : 0) : activeIndex;
      const next = shown[(from + dir + shown.length) % shown.length];
      if (next) setActiveId(next.id);
    } else if (event.key === "Enter") {
      const item = shown[activeIndex] ?? shown[0];
      if (!item) return;
      event.preventDefault();
      select(item);
    }
  };

  const countText = !q
    ? "type to search"
    : matches.length > shown.length
      ? `${shown.length} of ${matches.length}`
      : `${matches.length} ${matches.length === 1 ? "result" : "results"}`;

  return (
    <div
      ref={setRoot}
      className={cn("w-full", disabled && "opacity-50", className)}
      style={{ maxWidth: width }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        // Handled here, wherever focus is inside, so the page never also
        // closes something on the same key.
        event.preventDefault();
        closeToLens();
      }}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (to instanceof Node && event.currentTarget.contains(to)) return;
        if (isOpen && query === "") request(false);
      }}
    >
      <motion.div
        ref={setSlot}
        className="group/slot relative"
        style={{ height: LENS, opacity: veil }}
      >
        {shortcut ? (
          <motion.kbd
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-11 grid size-5 -translate-y-1/2 place-items-center rounded-1 border border-hairline-strong font-mono text-[10px] text-ink-3"
            style={{ opacity: keyOpacity }}
          >
            {shortcut}
          </motion.kbd>
        ) : null}
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 right-0 rounded-full border bg-surface-1 transition-colors",
            isOpen ? "border-hairline-strong" : "border-hairline",
            "group-has-[input:focus-visible]/slot:outline-2 group-has-[input:focus-visible]/slot:outline-offset-2 group-has-[input:focus-visible]/slot:outline-ring group-has-[input:focus-visible]/slot:outline-solid",
          )}
          style={{ height: LENS, width: pillWidth }}
        />
        <motion.div
          aria-hidden={isOpen ? undefined : true}
          className="absolute inset-y-0 right-0 flex items-center"
          style={{ left: LENS, clipPath: reveal }}
        >
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen && shown.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 && shown[activeIndex]
                ? optionId(shown[activeIndex].id)
                : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={placeholder}
            value={query}
            tabIndex={isOpen ? 0 : -1}
            disabled={disabled}
            onChange={(event) => {
              report(event.target.value);
              setActiveId(null);
            }}
            onKeyDown={onInputKeyDown}
            onCompositionStart={() => {
              setFrozen(query);
              setComposing(true);
            }}
            onCompositionEnd={() => setComposing(false)}
            className="h-full min-w-0 flex-1 bg-transparent pl-1 text-sm text-foreground outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
          />
          <motion.button
            type="button"
            aria-label="Close search"
            tabIndex={isOpen ? 0 : -1}
            onClick={closeToLens}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid"
            style={{ opacity: closeOpacity }}
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
          </motion.button>
        </motion.div>
        <motion.button
          ref={lensRef}
          type="button"
          aria-label={label}
          aria-expanded={isOpen}
          aria-controls={inputId}
          aria-keyshortcuts={shortcut ?? undefined}
          tabIndex={isOpen ? -1 : 0}
          disabled={disabled}
          onClick={() => {
            if (isOpen) inputRef.current?.focus({ preventScroll: true });
            else openAndFocus();
          }}
          className={cn(
            "absolute top-0 right-0 grid size-9 cursor-pointer place-items-center rounded-full outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
            isOpen ? "text-cobalt-bright" : "text-ink-2 hover:text-foreground",
          )}
          style={{ x: lensX }}
        >
          <motion.svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ rotate: turn }}
          >
            <circle cx={7} cy={7} r={4.25} />
            <path d="M10.2 10.2L13.5 13.5" />
          </motion.svg>
        </motion.button>
      </motion.div>

      <motion.div
        className="overflow-clip"
        initial={false}
        animate={{ height: isOpen ? (panelHeight ?? "auto") : 0 }}
        transition={
          isOpen
            ? motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.enter }
            : exitFor(durations.base)
        }
        aria-hidden={isOpen ? undefined : true}
        inert={!isOpen}
      >
        <div ref={setPanel} className="pt-2">
          <div className="rounded-3 border border-hairline bg-surface-1 p-1.5">
            <div className="flex items-center justify-between gap-3 px-1.5 pt-0.5 pb-1.5">
              <label
                id={labelId}
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
                {countText}
              </span>
            </div>
            <ul
              id={listId}
              role={shown.length > 0 ? "listbox" : undefined}
              aria-labelledby={shown.length > 0 ? labelId : undefined}
              className={cn(
                "relative",
                results === "cards"
                  ? "grid grid-cols-2 gap-1.5"
                  : "flex flex-col gap-0.5",
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((item) => {
                  const active = item.id === activeId;
                  const delay = (seen.rank[item.id] ?? 0) * step;
                  return (
                    <motion.li
                      key={item.id}
                      id={optionId(item.id)}
                      role="option"
                      aria-selected={active}
                      layout="position"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: -distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        y: { ...springs.snap, delay },
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                          delay,
                        },
                        layout: springs.glide,
                      }}
                      // Keeps focus, and the caret, in the input on a press.
                      onPointerDown={(event) => event.preventDefault()}
                      onPointerMove={() => {
                        if (!active) setActiveId(item.id);
                      }}
                      onClick={() => select(item)}
                      className={cn(
                        "min-w-0 cursor-pointer rounded-2 transition-colors",
                        results === "cards"
                          ? "flex flex-col gap-0.5 border px-2.5 py-2"
                          : "flex h-8 items-center gap-2 px-2",
                        results === "cards" &&
                          (active
                            ? "border-hairline-strong bg-cobalt-wash"
                            : "border-hairline bg-surface-2"),
                        results === "list" && active && "bg-cobalt-wash",
                      )}
                    >
                      {results === "list" ? <PageGlyph /> : null}
                      <span
                        className={cn(
                          "min-w-0 truncate text-sm",
                          results === "list" && "flex-1",
                          active ? "text-foreground" : "text-ink-2",
                        )}
                        title={item.label}
                      >
                        <Lit text={item.label} words={words} on={highlight} />
                      </span>
                      {item.meta ? (
                        <span
                          className={cn(
                            "text-xs text-ink-3",
                            results === "list" ? "shrink-0" : "truncate",
                          )}
                        >
                          <Lit text={item.meta} words={words} on={highlight} />
                        </span>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            {q && matches.length === 0 ? (
              <p className="px-1.5 py-1.5 text-xs text-ink-3">
                {`Nothing matches “${q}”.`}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
