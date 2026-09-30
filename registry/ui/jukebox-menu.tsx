"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type JukeboxRecord = {
  id: string;
  /** The song: the strip's first line. */
  title: string;
  /** Who plays it: the strip's second line. */
  artist?: string;
};

export type JukeboxFinish = "gold" | "silver" | "candy";

export type JukeboxMenuProps = {
  /** The catalogue, in rack order. Each gets a code: its page letter and strip number. */
  records: JukeboxRecord[];
  /** Controlled: the id of the record on the turntable, or null for none. */
  value?: string | null;
  /** Initial record when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the strip, key or code that picked a record, with its id. */
  onValueChange?: (id: string) => void;
  /** The listbox's accessible name. @default "Records" */
  label?: string;
  /** How many pages the rack splits the catalogue across, up to eight strips a page. @default 2 */
  pages?: number;
  /** The cabinet's trim, rack frame and key tops. @default "gold" */
  finish?: JukeboxFinish;
  /** A carriage arm fetches the record; off, the record travels to the turntable by itself. @default true */
  arm?: boolean;
  /** Play the keys, the carriage and the landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Jukebox letters skip I and O, which read as numbers on a keypad. */
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MOST_PER_PAGE = 8;

/*
 * The mechanism window, in its own units. The records stand edge-on in a fan
 * round the turntable's spindle (D), so the changer arm only has to turn,
 * reach, and pull the record back down onto the platter.
 */
const VW = 320;
const VH = 160;
const DX = 160;
const DY = 127;
/** Radius of the fan's centre line. */
const FAN_R = 94;
/** Half a record's diameter, seen edge-on. */
const BAR = 17;
const DISC_RX = 52;
const DISC_RY = 12.3;
const FAN_FROM = 160;
const FAN_TO = 20;
/** The tonearm, pivoting on the plinth right of the platter. */
const TONE_X = 236;
const TONE_Y = 138;
const TONE_L = 34;
const TONE_REST = 245;
const TONE_PLAY = 205;
const LIFT = -5;

const VINYL = "oklch(0.26 0.012 258)";
const VINYL_RIM = "oklch(0.52 0.012 258)";

/** Label colours: pigments at a fixed lightness, the same in both themes. */
const PIGMENTS = [
  "oklch(from var(--danger) 0.66 0.17 h)",
  "oklch(from var(--warn) 0.8 0.13 h)",
  "oklch(from var(--signal) 0.74 0.12 h)",
  "oklch(from var(--accent) 0.7 0.13 h)",
  "oklch(from var(--success) 0.68 0.12 h)",
  "oklch(from var(--danger) 0.74 0.1 calc(h + 330))",
];

type Finish = {
  light: string;
  base: string;
  dark: string;
  key: string;
  keyLight: string;
  keyDark: string;
  keyInk: string;
};

// Metal is pigment, not text colour: each finish takes a token's hue at fixed
// lightness, so gold reads as gold on the light page and the dark one alike.
const FINISHES: Record<JukeboxFinish, Finish> = {
  gold: {
    light: "oklch(from var(--warn) 0.95 0.05 h)",
    base: "oklch(from var(--warn) 0.8 0.12 h)",
    dark: "oklch(from var(--warn) 0.52 0.1 h)",
    key: "oklch(from var(--warn) 0.9 0.07 h)",
    keyLight: "oklch(from var(--warn) 0.96 0.04 h)",
    keyDark: "oklch(from var(--warn) 0.78 0.11 h)",
    keyInk: "oklch(from var(--warn) 0.3 0.06 h)",
  },
  silver: {
    light: "oklch(from var(--ink-3) 0.97 0.004 h)",
    base: "oklch(from var(--ink-3) 0.8 0.012 h)",
    dark: "oklch(from var(--ink-3) 0.5 0.018 h)",
    key: "oklch(from var(--ink-3) 0.93 0.008 h)",
    keyLight: "oklch(from var(--ink-3) 0.98 0.003 h)",
    keyDark: "oklch(from var(--ink-3) 0.8 0.012 h)",
    keyInk: "oklch(from var(--ink-3) 0.28 0.02 h)",
  },
  candy: {
    light: "oklch(from var(--danger) 0.93 0.05 h)",
    base: "oklch(from var(--danger) 0.72 0.15 h)",
    dark: "oklch(from var(--danger) 0.5 0.14 h)",
    key: "oklch(from var(--signal) 0.88 0.08 h)",
    keyLight: "oklch(from var(--signal) 0.95 0.04 h)",
    keyDark: "oklch(from var(--signal) 0.74 0.1 h)",
    keyInk: "oklch(from var(--signal) 0.3 0.06 h)",
  },
};

const r3 = (v: number) => Number(v.toFixed(3));
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Slot = {
  record: JukeboxRecord;
  index: number;
  page: number;
  col: 0 | 1;
  row: number;
  /** Position on its page, 0-based: the strip number less one. */
  at: number;
  code: string;
  /** Where the record stands in the fan, in degrees (0 = right, 90 = up). */
  angle: number;
  pigment: string;
};

type Rack = {
  slots: Slot[];
  pageCount: number;
  perPage: number;
  rows: number;
};

function rackOf(records: JukeboxRecord[], pages: number): Rack {
  const n = records.length;
  const want = Math.max(1, Math.round(Number.isFinite(pages) ? pages : 2));
  const perPage = Math.max(
    1,
    Math.min(MOST_PER_PAGE, Math.ceil(Math.max(1, n) / want)),
  );
  const rows = Math.ceil(perPage / 2);
  const pageCount = Math.max(1, Math.ceil(n / perPage));
  const slots = records.map((record, index): Slot => {
    const page = Math.floor(index / perPage);
    const at = index % perPage;
    const col = at < rows ? 0 : 1;
    return {
      record,
      index,
      page,
      col,
      row: col === 0 ? at : at - rows,
      at,
      code: `${LETTERS[page] ?? "Z"}${at + 1}`,
      angle: r3(
        n <= 1 ? 90 : FAN_FROM - ((FAN_FROM - FAN_TO) * index) / (n - 1),
      ),
      pigment: PIGMENTS[hash(record.id) % PIGMENTS.length] ?? "currentColor",
    };
  });
  return { slots, pageCount, perPage, rows };
}

/** Every record's code for a catalogue split across `pages`, e.g. { "r-2": "A2" }. */
export function jukeboxCodes(
  records: JukeboxRecord[],
  pages = 2,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of rackOf(records, pages).slots) out[s.record.id] = s.code;
  return out;
}

const unit = (angle: number) => {
  const a = (angle * Math.PI) / 180;
  return { x: Math.cos(a), y: -Math.sin(a) };
};

/**
 * A record out of its slot: edge-on it is a thin bar pointing out along its
 * slot's spoke; pulled in towards the spindle it turns to lie flat, and by the
 * time it reaches the platter it is the same ellipse as the record resting there.
 */
function Disc({
  angle,
  reach,
  lift,
  pigment,
}: {
  angle: number;
  reach: MotionValue<number>;
  lift: MotionValue<number>;
  pigment: string;
}) {
  const u = unit(angle);
  const flat = useTransform(reach, (r) => clamp(1 - r / FAN_R, 0, 1));
  const cx = useTransform(reach, (r) => r3(DX + u.x * r));
  const cy = useTransform(
    [reach, lift] as MotionValue<number>[],
    ([r = 0, l = 0]: number[]) => r3(DY + u.y * r + l),
  );
  const rx = useTransform(flat, (t) => r3(lerp(BAR, DISC_RX, t)));
  const ry = useTransform(flat, (t) => r3(lerp(1.6, DISC_RY, t)));
  // An ellipse is the same turned half a turn, so it lies down the short way.
  const settle = -angle > -90 ? 0 : -180;
  const rotate = useTransform(flat, (t) => r3(lerp(-angle, settle, t)));
  const labelRx = useTransform(rx, (v) => r3(v * 0.33));
  const labelRy = useTransform(ry, (v) => r3(v * 0.33));
  const labelOpacity = useTransform(flat, (t) => r2(clamp(t * 1.6, 0, 1)));
  const turn = { rotate, originX: 0.5, originY: 0.5 };
  return (
    <g>
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        strokeWidth={1.2}
        style={{ ...turn, fill: VINYL, stroke: VINYL_RIM }}
      />
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={labelRx}
        ry={labelRy}
        style={{ ...turn, fill: pigment, opacity: labelOpacity }}
      />
    </g>
  );
}

type Turn = { from: number; to: number; key: number };

/**
 * One leaf of the rack turning about the spine. Its own perspective (so the
 * rack frame can clip it), its face swapped at the edge-on moment, the back
 * un-mirrored, and a shade that deepens as it stands up.
 */
function Leaf({
  forward,
  delay,
  depth,
  count,
  front,
  back,
  cover,
  onLand,
}: {
  forward: boolean;
  delay: number;
  depth: number;
  count: number;
  front: React.ReactNode;
  back: React.ReactNode;
  cover?: React.ReactNode;
  onLand: (last: boolean) => void;
}) {
  const start = forward ? 0 : -180;
  const end = forward ? -180 : 0;
  const angle = useMotionValue(start);
  const onRight = useTransform(angle, (a) => (a > -90 ? 1 : 0));
  const frontOpacity = onRight;
  const backOpacity = useTransform(onRight, (r) => 1 - r);
  // On each side the leaf nearest the reader is on top: before it turns, the
  // first leaf; once over, the last one to land.
  const z = useTransform(onRight, (r) =>
    forward
      ? r
        ? 100 + count - depth
        : 150 + depth
      : r
        ? 100 + depth
        : 150 + count - depth,
  );
  const shade = useTransform(angle, (a) =>
    r2(0.3 * Math.abs(Math.sin((a * Math.PI) / 180))),
  );
  // The half not yet turned keeps showing the old page until the first leaf
  // has passed edge-on and covers it.
  const coverOpacity = useTransform(angle, (a) =>
    forward ? (a > -90 ? 1 : 0) : a < -90 ? 1 : 0,
  );

  const land = React.useRef(onLand);
  React.useEffect(() => {
    land.current = onLand;
  });

  React.useEffect(() => {
    angle.set(start);
    const controls = animate(angle, end, {
      ...springs.glide,
      delay,
      onComplete: () => land.current(depth === count - 1),
    });
    return () => controls.stop();
  }, [angle, start, end, delay, depth, count]);

  return (
    <>
      {cover ? (
        <motion.div
          aria-hidden
          className={cn(
            "absolute inset-y-0 w-1/2 bg-surface-1",
            forward ? "left-0" : "left-1/2",
          )}
          style={{ opacity: coverOpacity, zIndex: 50 }}
        >
          {cover}
        </motion.div>
      ) : null}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-1/2 bg-surface-1"
        style={{
          rotateY: angle,
          transformPerspective: 1200,
          originX: 0,
          zIndex: z,
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ opacity: frontOpacity }}
        >
          {front}
        </motion.div>
        <motion.div
          className="absolute inset-0 -scale-x-100"
          style={{ opacity: backOpacity }}
        >
          {back}
        </motion.div>
        <motion.div
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: shade }}
        />
      </motion.div>
    </>
  );
}

function NoteGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="size-2.5 shrink-0 fill-current"
    >
      <rect x="1" y="5" width="2" height="6" rx="1" />
      <rect x="5" y="2" width="2" height="9" rx="1" />
      <rect x="9" y="6" width="2" height="5" rx="1" />
    </svg>
  );
}

/**
 * A single-choice picker dressed as a jukebox. The catalogue sits on title
 * strips in a book-style rack whose leaves turn about the spine on the glide
 * spring (a jump of several pages riffles, a leaf at a time); every record has
 * a code — its page letter and strip number — and pressing a letter and then a
 * number on the selector, or clicking a strip, picks it.
 *
 * Above the rack, the records stand edge-on in a fan round the turntable. A
 * pick sends the changer arm round to the record on glide while its motor
 * whirs, reaches in and grips it, and pulls it back down to the spindle — the
 * record turning from edge-on to lying flat as it comes — then lets it drop
 * onto the platter on the recoil spring. The tonearm swings on and the label
 * turns. With `arm` off the record makes the trip by itself.
 *
 * Under the chrome it is a real `role="listbox"`: arrows walk the strips and
 * turn pages at the ends, Page keys turn a spread, a letter and a digit are
 * its typeahead, Enter picks. Under reduced motion nothing travels, turns or
 * spins: pages cross-fade and the record is simply on the platter, while the
 * readout, the lit strip and the announcement still change.
 */
export function JukeboxMenu({
  records,
  value,
  defaultValue = null,
  onValueChange,
  label = "Records",
  pages = 2,
  finish = "gold",
  arm = true,
  sound = false,
  disabled = false,
  className,
}: JukeboxMenuProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const metal = FINISHES[finish] ?? FINISHES.gold;

  const rack = React.useMemo(() => rackOf(records, pages), [records, pages]);
  const { slots, pageCount, perPage, rows } = rack;
  const n = slots.length;
  const byId = React.useMemo(
    () => new Map(slots.map((s) => [s.record.id, s])),
    [slots],
  );

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const picked = value !== undefined ? value : own;
  const current = picked !== null && byId.has(picked) ? picked : null;
  const currentSlot = current ? byId.get(current) : undefined;

  const [activeRaw, setActive] = React.useState(currentSlot?.index ?? 0);
  const active = clamp(activeRaw, 0, Math.max(0, n - 1));
  const activeSlot = slots[active];
  const shownPage = activeSlot?.page ?? 0;
  const [pending, setPending] = React.useState<number | null>(null);
  const [focused, setFocused] = React.useState(false);

  // A record chosen from outside brings its strip into view; the visitor's
  // own picks are already there.
  const [seenValue, setSeenValue] = React.useState(current);
  if (seenValue !== current) {
    setSeenValue(current);
    if (currentSlot && currentSlot.index !== active) {
      setActive(currentSlot.index);
    }
  }

  // The spread on show follows the active strip. A change of spread is a
  // turn of the leaves, unless the rack itself was re-cut (a new `pages`).
  const shape = `${pageCount}:${perPage}:${n}`;
  const [seen, setSeen] = React.useState({ page: shownPage, shape });
  const [turn, setTurn] = React.useState<Turn | null>(null);
  if (seen.page !== shownPage || seen.shape !== shape) {
    setSeen({ page: shownPage, shape });
    setTurn(
      seen.shape === shape && motionSafe
        ? { from: seen.page, to: shownPage, key: (turn?.key ?? 0) + 1 }
        : null,
    );
  }

  // Spoken once per change, frozen from the new value in the render that
  // flips it.
  const [said, setSaid] = React.useState({ n: 0, key: current, text: "" });
  if (said.key !== current) {
    const s = current ? byId.get(current) : undefined;
    setSaid({
      n: said.n + 1,
      key: current,
      text: s
        ? `Now playing ${s.code}, ${s.record.title}${s.record.artist ? ` by ${s.record.artist}` : ""}.`
        : "Nothing playing.",
    });
  }

  // The mechanism's own state: what is on the platter, what is in the arm,
  // what is on its way home.
  const [deck, setDeck] = React.useState<string | null>(current);
  const [carry, setCarry] = React.useState<{
    id: string;
    angle: number;
  } | null>(null);
  const [home, setHome] = React.useState<{
    id: string;
    angle: number;
    key: number;
  } | null>(null);
  const deckRef = React.useRef(deck);
  const carryRef = React.useRef(carry);
  const putDeck = (id: string | null) => {
    deckRef.current = id;
    setDeck(id);
  };
  const putCarry = (c: { id: string; angle: number } | null) => {
    carryRef.current = c;
    setCarry(c);
  };

  const sweep = useMotionValue(currentSlot?.angle ?? 90);
  const reach = useMotionValue(0);
  const lift = useMotionValue(0);
  const homeReach = useMotionValue(0);
  const tone = useMotionValue(current ? TONE_PLAY : TONE_REST);
  const noLift = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const keysRef = React.useRef<HTMLDivElement | null>(null);
  const runs = React.useRef(0);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const homeAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const whir = React.useRef<LoopHandle | null>(null);
  const voice = React.useRef<string | null>(null);
  const turnVoiced = React.useRef(false);
  const homeKey = React.useRef(0);
  const [keyFocus, setKeyFocus] = React.useState(0);
  const [awake, setAwake] = React.useState(true);

  const panOf = (x: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + (x / VW) * rect.width, null) : 0;
  };

  const stopWhir = () => {
    whir.current?.stop();
    whir.current = null;
  };

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
    stopWhir();
  };

  /** Resolves when the animation completes, and never if a newer pick took over. */
  const to = (
    mv: MotionValue<number>,
    target: number,
    transition: Transition,
    token: number,
  ) =>
    new Promise<void>((resolve) => {
      const done = () => {
        if (runs.current === token) resolve();
      };
      if (Math.abs(mv.get() - target) < 0.01 && transition.type === "spring") {
        mv.set(target);
        done();
        return;
      }
      running.current.push(
        animate(mv, target, { ...transition, onComplete: done }),
      );
    });

  /** A record out of its slot goes back to it, on the exit ease. */
  const sendHome = (id: string, angle: number, from: number) => {
    homeAnim.current?.stop();
    homeKey.current += 1;
    const key = homeKey.current;
    if (!motionSafe) {
      setHome(null);
      return;
    }
    homeReach.jump(clamp(from, 0, FAN_R + 10));
    setHome({ id, angle, key });
    homeAnim.current = animate(homeReach, FAN_R, {
      duration: durations.slow,
      ease: easings.exit,
      onComplete: () => setHome((h) => (h && h.key === key ? null : h)),
    });
  };

  const fetchTo = (id: string | null) => {
    runs.current += 1;
    const token = runs.current;
    halt();
    const voiced = sound && voice.current === id;
    if (voice.current === id) voice.current = null;
    const slot = id ? byId.get(id) : undefined;
    const held = carryRef.current;
    const onDeck = deckRef.current;

    if (held && held.id !== id) sendHome(held.id, held.angle, reach.get());
    else if (onDeck && onDeck !== id) {
      const s = byId.get(onDeck);
      if (s) sendHome(onDeck, s.angle, 0);
    }
    if (!slot) {
      putCarry(null);
      putDeck(null);
      if (motionSafe)
        running.current.push(animate(tone, TONE_REST, springs.snap));
      else tone.set(TONE_REST);
      reach.set(0);
      return;
    }
    if (onDeck === slot.record.id && !held) return;
    putDeck(null);

    if (!motionSafe) {
      putCarry(null);
      reach.set(0);
      lift.set(0);
      sweep.set(slot.angle);
      tone.set(TONE_PLAY);
      putDeck(slot.record.id);
      return;
    }

    running.current.push(animate(tone, TONE_REST, springs.snap));
    const pan = panOf(DX + unit(slot.angle).x * FAN_R);
    const motor = (gain: number) => {
      if (!voiced) return;
      stopWhir();
      whir.current = audio.start("whir", { pitch: 0.9, gain, pan });
    };
    const alreadyHeld = held?.id === slot.record.id;

    const run = async () => {
      if (!alreadyHeld) {
        if (arm) {
          motor(0.55);
          // The arm swings out half-reached, so the turn is seen, then
          // reaches into the fan.
          await Promise.all([
            to(reach, 40, springs.snap, token),
            to(
              sweep,
              slot.angle,
              {
                ...springs.glide,
                onUpdate: () =>
                  whir.current?.set({
                    pitch: r2(
                      0.75 + Math.min(1.1, Math.abs(sweep.getVelocity()) / 240),
                    ),
                  }),
              },
              token,
            ),
          ]);
          stopWhir();
          await to(reach, FAN_R, springs.snap, token);
          if (voiced) audio.play("clack", { pitch: 1.55, gain: 0.28, pan });
          putCarry({ id: slot.record.id, angle: slot.angle });
          lift.jump(0);
        } else {
          sweep.jump(slot.angle);
          reach.jump(FAN_R);
          lift.jump(0);
          putCarry({ id: slot.record.id, angle: slot.angle });
          await to(reach, FAN_R + 8, springs.snap, token);
        }
      }
      motor(0.35);
      await Promise.all([
        to(reach, 0, springs.glide, token),
        to(
          lift,
          LIFT,
          { duration: durations.base, ease: easings.enter },
          token,
        ),
      ]);
      stopWhir();
      if (voiced) {
        audio.play("clack", { pitch: 0.62, gain: 0.6, pan: panOf(DX) });
      }
      running.current.push(
        animate(tone, TONE_PLAY, { ...springs.snap, delay: 0.09 }),
      );
      await to(lift, 0, springs.recoil, token);
      putCarry(null);
      putDeck(slot.record.id);
    };
    void run();
  };

  const api = React.useRef({ fetchTo, halt });
  React.useEffect(() => {
    api.current = { fetchTo, halt };
  });

  const shown = React.useRef(current);
  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    api.current.fetchTo(current);
  }, [current]);

  React.useEffect(() => {
    const now = api.current;
    const homeward = homeAnim;
    return () => {
      now.halt();
      homeward.current?.stop();
    };
  }, []);

  // The label turns only while it can be seen.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    let onScreen = true;
    const update = () => setAwake(onScreen && !document.hidden);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      onScreen = Boolean(entry?.isIntersecting);
      update();
    });
    watcher.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const pageName = (p: number) => LETTERS[p] ?? "Z";

  const indexAt = (page: number, col: number, row: number) => {
    const first = page * perPage;
    const last = Math.min(n, first + perPage) - 1;
    return clamp(first + (col === 0 ? row : rows + row), first, last);
  };

  const moveTo = (index: number, voicedTurn: boolean) => {
    const next = clamp(index, 0, n - 1);
    const s = slots[next];
    if (!s) return;
    if (s.page !== shownPage) {
      turnVoiced.current = voicedTurn;
      setSaid((prev) => ({
        n: prev.n + 1,
        key: prev.key,
        text: `Page ${pageName(s.page)} of ${pageCount}.`,
      }));
    }
    setActive(next);
  };

  const pick = (index: number) => {
    const s = slots[index];
    if (!s || disabled) return;
    setActive(index);
    setPending(null);
    if (s.record.id === current) return;
    voice.current = s.record.id;
    if (value === undefined) setOwn(s.record.id);
    onValueChange?.(s.record.id);
  };

  const clack = (pitch: number, x?: number) =>
    audio.play("clack", {
      pitch,
      gain: 0.42,
      pan: x === undefined ? 0 : panFrom(x, rootRef.current),
    });

  const pressLetter = (p: number, x?: number) => {
    if (disabled || p >= pageCount) return;
    clack(1.12 + p * 0.05, x);
    setPending(p);
    moveTo(p * perPage, true);
    if (p === shownPage) {
      setSaid((prev) => ({
        n: prev.n + 1,
        key: prev.key,
        text: `Page ${pageName(p)}. Press a number.`,
      }));
    }
  };

  const pressDigit = (d: number, x?: number) => {
    if (disabled) return;
    const page = pending ?? shownPage;
    clack(0.94 + d * 0.03, x);
    setPending(null);
    if (d < 1 || d > perPage) return;
    const index = page * perPage + d - 1;
    if (index >= n) return;
    pick(index);
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || n === 0) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const s = activeSlot;
    if (!s) return;
    const go = (index: number) => {
      event.preventDefault();
      moveTo(index, true);
    };
    switch (event.key) {
      case "ArrowDown":
        go(active + 1);
        return;
      case "ArrowUp":
        go(active - 1);
        return;
      case "ArrowRight":
        if (s.col === 0) go(indexAt(s.page, 1, s.row));
        else if (s.page < pageCount - 1) go(indexAt(s.page + 1, 0, s.row));
        else event.preventDefault();
        return;
      case "ArrowLeft":
        if (s.col === 1) go(indexAt(s.page, 0, s.row));
        else if (s.page > 0) go(indexAt(s.page - 1, 1, s.row));
        else event.preventDefault();
        return;
      case "PageDown":
        go(s.page < pageCount - 1 ? indexAt(s.page + 1, s.col, s.row) : n - 1);
        return;
      case "PageUp":
        go(s.page > 0 ? indexAt(s.page - 1, s.col, s.row) : 0);
        return;
      case "Home":
        go(0);
        return;
      case "End":
        go(n - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        clack(1);
        pick(active);
        return;
      case "Escape":
        if (pending !== null) {
          event.preventDefault();
          setPending(null);
        }
        return;
    }
    const upper = event.key.toUpperCase();
    const letter = event.key.length === 1 ? LETTERS.indexOf(upper) : -1;
    if (letter >= 0 && letter < pageCount) {
      event.preventDefault();
      pressLetter(letter);
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      pressDigit(Number(event.key));
    }
  };

  // The selector keys: letters for the spreads, then the strip numbers.
  const keys = [
    ...Array.from({ length: pageCount }, (_, p) => ({
      kind: "letter" as const,
      n: p,
      text: pageName(p),
    })),
    ...Array.from({ length: perPage }, (_, d) => ({
      kind: "digit" as const,
      n: d + 1,
      text: String(d + 1),
    })),
  ];
  const keyAt = clamp(keyFocus, 0, keys.length - 1);

  const onKeysKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = keys.length - 1;
    let next = -1;
    if (event.key === "ArrowRight") next = keyAt >= last ? 0 : keyAt + 1;
    else if (event.key === "ArrowLeft") next = keyAt <= 0 ? last : keyAt - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next < 0) return;
    event.preventDefault();
    setKeyFocus(next);
    keysRef.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next]?.focus();
  };

  const pageSlots = (page: number, col: 0 | 1) => {
    const list: (Slot | null)[] = [];
    for (let row = 0; row < rows; row += 1) {
      const index = page * perPage + (col === 0 ? row : rows + row);
      const inPage = (col === 0 ? row : rows + row) < perPage;
      list.push(inPage && index < n ? (slots[index] ?? null) : null);
    }
    return list;
  };

  const strip = (s: Slot | null, key: string, live: boolean) => {
    if (!s) {
      return (
        <div
          key={key}
          aria-hidden
          className="flex h-10 items-center rounded-1 px-2"
          style={{ background: "var(--jb-paper)" }}
        >
          <span className="h-px w-full bg-hairline" />
        </div>
      );
    }
    const playing = s.record.id === current;
    const isActive = live && s.index === active;
    const name = `${s.code}, ${s.record.title}${s.record.artist ? `, ${s.record.artist}` : ""}`;
    return (
      <div
        key={key}
        id={live ? `${uid}-opt-${s.record.id}` : undefined}
        role={live ? "option" : undefined}
        aria-selected={live ? playing : undefined}
        aria-setsize={live ? n : undefined}
        aria-posinset={live ? s.index + 1 : undefined}
        aria-label={live ? name : undefined}
        title={live ? name : undefined}
        onClick={
          live
            ? (event) => {
                if (disabled) return;
                clack(1, event.clientX);
                pick(s.index);
              }
            : undefined
        }
        className={cn(
          "relative flex h-10 min-w-0 items-center gap-1.5 rounded-1 pr-1.5 transition-colors",
          live && !disabled && "cursor-pointer hover:brightness-95",
          playing && "ring-1 ring-cobalt-bright ring-inset",
          isActive &&
            focused &&
            "outline-2 -outline-offset-2 outline-ring outline-solid",
        )}
        style={{ background: "var(--jb-paper)" }}
      >
        <span
          className="flex h-full w-7 shrink-0 flex-col items-center justify-center gap-0.5 rounded-l-1 font-mono text-[10px] leading-none font-semibold tracking-[0.02em] text-[oklch(0.2_0.02_258)]"
          style={{ background: s.pigment }}
        >
          {s.code}
          {playing ? <NoteGlyph /> : null}
        </span>
        <span className="min-w-0 flex-1 leading-none">
          <span className="block truncate text-[12px] leading-4 font-medium text-foreground">
            {s.record.title}
          </span>
          {s.record.artist ? (
            <span className="block truncate text-[10px] leading-3.5 text-ink-3">
              {s.record.artist}
            </span>
          ) : null}
        </span>
      </div>
    );
  };

  const column = (page: number, col: 0 | 1, live: boolean) => (
    <div className="flex h-full flex-col gap-1 p-1.5">
      <span className="flex h-3 items-center justify-between px-0.5 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
        <span>
          {col === 0 || rows < perPage
            ? `${pageName(page)}${col === 0 ? 1 : rows + 1}–${pageName(page)}${col === 0 ? rows : perPage}`
            : ""}
        </span>
        {col === 1 ? (
          <span>
            {page + 1}/{pageCount}
          </span>
        ) : null}
      </span>
      {pageSlots(page, col).map((s, row) =>
        strip(s, `${live ? "l" : "c"}-${page}-${col}-${row}`, live),
      )}
    </div>
  );

  const leaves = (() => {
    if (!turn || !motionSafe) return null;
    const forward = turn.to > turn.from;
    const count = Math.abs(turn.to - turn.from);
    const gap = cascade(count + 1) * 1.4;
    return Array.from({ length: count }, (_, i) => {
      // Forward, leaf i turns page from+i over onto from+i+1; backward, it
      // turns from-i back onto from-1-i. Either way its front is the lower
      // page's right side and its back the higher page's left side.
      const a = forward ? turn.from + i : turn.from - 1 - i;
      const front = column(a, 1, false);
      const back = column(a + 1, 0, false);
      return (
        <Leaf
          key={`${turn.key}-${i}`}
          forward={forward}
          delay={r3(i * gap)}
          depth={i}
          count={count}
          front={front}
          back={back}
          cover={
            i === 0
              ? forward
                ? column(turn.from, 0, false)
                : column(turn.from, 1, false)
              : undefined
          }
          onLand={(last) => {
            if (turnVoiced.current) {
              audio.play("clack", { pitch: 0.74, gain: 0.22 });
            }
            if (last) {
              turnVoiced.current = false;
              setTurn((t) => (t && t.key === turn.key ? null : t));
            }
          }}
        />
      );
    });
  })();

  const fan = slots.map((s) => {
    const u = unit(s.angle);
    const p = (r: number) => ({ x: r3(DX + u.x * r), y: r3(DY + u.y * r) });
    const inner = p(FAN_R - BAR);
    const outer = p(FAN_R + BAR);
    const capEnd = p(FAN_R + BAR + 5);
    const out =
      s.record.id === deck ||
      s.record.id === carry?.id ||
      s.record.id === home?.id;
    return (
      <g key={s.record.id}>
        <line
          x1={outer.x}
          y1={outer.y}
          x2={capEnd.x}
          y2={capEnd.y}
          strokeWidth={3.4}
          strokeLinecap="round"
          style={{ stroke: s.pigment, opacity: out ? 0.35 : 1 }}
          className="transition-opacity duration-200"
        />
        {/* No fade here: the record leaving or arriving is drawn exactly
            over its slot, so the swap is seamless only if it is instant. */}
        <g style={{ opacity: out ? 0 : 1 }}>
          <line
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            strokeWidth={4.2}
            strokeLinecap="round"
            style={{ stroke: VINYL_RIM }}
          />
          <line
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ stroke: VINYL }}
          />
        </g>
      </g>
    );
  });

  const armTip = useTransform(
    [sweep, reach] as MotionValue<number>[],
    ([a = 90, r = 0]: number[]) => {
      const u = unit(a);
      return { x: DX + u.x * r, y: DY + u.y * r, px: -u.y, py: u.x };
    },
  );
  const armX2 = useTransform(armTip, (t) => r3(t.x));
  const armY2 = useTransform(armTip, (t) => r3(t.y));
  const jawX1 = useTransform(armTip, (t) => r3(t.x - t.px * 6));
  const jawY1 = useTransform(armTip, (t) => r3(t.y - t.py * 6));
  const jawX2 = useTransform(armTip, (t) => r3(t.x + t.px * 6));
  const jawY2 = useTransform(armTip, (t) => r3(t.y + t.py * 6));
  const armOpacity = useTransform(reach, (r) => (r > 4 ? 1 : 0));

  const toneHead = useTransform(tone, (a) => {
    const rad = (a * Math.PI) / 180;
    return {
      x: r3(TONE_X + TONE_L * Math.cos(rad)),
      y: r3(TONE_Y + TONE_L * Math.sin(rad)),
      c: Math.cos(rad),
      s: Math.sin(rad),
    };
  });
  const toneX = useTransform(toneHead, (h) => h.x);
  const toneY = useTransform(toneHead, (h) => h.y);
  const shellX = useTransform(toneHead, (h) => r3(h.x - h.c * 7));
  const shellY = useTransform(toneHead, (h) => r3(h.y - h.s * 7));

  const deckSlot = deck ? byId.get(deck) : undefined;
  const carrySlot = carry ? byId.get(carry.id) : undefined;
  const homeSlot = home ? byId.get(home.id) : undefined;

  const readout = (() => {
    if (pending !== null) {
      return (
        <>
          <span className="shrink-0 rounded-1 bg-cobalt-wash px-1.5 py-0.5 text-cobalt-bright">
            {pageName(pending)}_
          </span>
          <span className="truncate">Press a number</span>
        </>
      );
    }
    if (currentSlot) {
      return (
        <>
          <span className="shrink-0 text-ink-3">Now playing</span>
          <span className="shrink-0 rounded-1 bg-cobalt-wash px-1.5 py-0.5 text-cobalt-bright">
            {currentSlot.code}
          </span>
          <span
            className="min-w-0 truncate tracking-normal text-foreground normal-case"
            title={currentSlot.record.title}
          >
            {currentSlot.record.title}
          </span>
        </>
      );
    }
    return <span className="truncate text-ink-3">Pick a record</span>;
  })();

  const trim = `linear-gradient(135deg, var(--jb-light), var(--jb-base) 32%, var(--jb-dark) 58%, var(--jb-base) 78%, var(--jb-light))`;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative w-full max-w-[360px] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          "--jb-light": metal.light,
          "--jb-base": metal.base,
          "--jb-dark": metal.dark,
          "--jb-key": metal.key,
          "--jb-key-light": metal.keyLight,
          "--jb-key-dark": metal.keyDark,
          "--jb-key-ink": metal.keyInk,
          "--jb-paper":
            "color-mix(in oklab, var(--card) 88%, oklch(from var(--warn) 0.85 0.08 h))",
        } as React.CSSProperties
      }
    >
      <div
        className="rounded-[50%_50%_18px_18px/140px_140px_18px_18px] p-[3px]"
        style={{ background: trim }}
      >
        <div className="flex flex-col gap-2.5 rounded-[50%_50%_15px_15px/137px_137px_15px_15px] bg-card px-3 pt-4 pb-3">
          <div
            aria-hidden
            className="relative overflow-clip rounded-[50%_50%_10px_10px/62%_62%_10px_10px] border border-hairline-strong"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 100%, color-mix(in oklab, var(--ink-3) 34%, var(--card)), color-mix(in oklab, var(--ink-3) 14%, var(--card)))",
            }}
          >
            <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full">
              {fan}
              <ellipse
                cx={DX}
                cy={DY + 9}
                rx={70}
                ry={17}
                className="fill-ink/10"
              />
              <ellipse
                cx={DX}
                cy={DY + 3}
                rx={62}
                ry={15}
                style={{
                  fill: "oklch(from var(--ink-3) 0.66 0.01 h)",
                  stroke: "oklch(from var(--ink-3) 0.48 0.015 h)",
                }}
                strokeWidth={0.8}
              />
              {deckSlot ? (
                <motion.g
                  key={deckSlot.record.id}
                  initial={motionSafe ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast }}
                >
                  <g
                    transform={`translate(${DX} ${DY}) scale(1 ${r3(DISC_RY / DISC_RX)})`}
                  >
                    <g
                      className={cn(
                        "origin-center [transform-box:fill-box]",
                        motionSafe && "animate-spin",
                      )}
                      style={{
                        animationDuration: "1.8s",
                        animationPlayState: awake ? "running" : "paused",
                      }}
                    >
                      <circle
                        r={DISC_RX}
                        strokeWidth={2.4}
                        style={{ fill: VINYL, stroke: VINYL_RIM }}
                      />
                      {[44, 36, 28].map((r) => (
                        <circle
                          key={r}
                          r={r}
                          fill="none"
                          strokeWidth={1.4}
                          style={{ stroke: "oklch(0.4 0.01 258)" }}
                        />
                      ))}
                      <circle r={17} style={{ fill: deckSlot.pigment }} />
                      <rect
                        x={5}
                        y={-2.5}
                        width={9}
                        height={5}
                        rx={2}
                        style={{ fill: "oklch(0.97 0 0 / 0.75)" }}
                      />
                      <circle r={2.4} style={{ fill: VINYL }} />
                    </g>
                    <path
                      d="M -40 -30 A 50 50 0 0 1 -8 -51"
                      fill="none"
                      strokeWidth={5}
                      strokeLinecap="round"
                      style={{ stroke: "oklch(1 0 0 / 0.22)" }}
                    />
                  </g>
                </motion.g>
              ) : null}
              {homeSlot && home ? (
                <Disc
                  key={`home-${home.key}`}
                  angle={home.angle}
                  reach={homeReach}
                  lift={noLift}
                  pigment={homeSlot.pigment}
                />
              ) : null}
              {arm && motionSafe ? (
                <motion.g style={{ opacity: armOpacity }}>
                  <motion.line
                    x1={DX}
                    y1={DY}
                    x2={armX2}
                    y2={armY2}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    className="stroke-ink-2"
                  />
                </motion.g>
              ) : null}
              {carrySlot && carry ? (
                <Disc
                  angle={carry.angle}
                  reach={reach}
                  lift={lift}
                  pigment={carrySlot.pigment}
                />
              ) : null}
              {arm && motionSafe ? (
                <motion.g style={{ opacity: armOpacity }}>
                  <motion.line
                    x1={jawX1}
                    y1={jawY1}
                    x2={jawX2}
                    y2={jawY2}
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    className="stroke-ink-2"
                  />
                </motion.g>
              ) : null}
              <circle cx={DX} cy={DY} r={2.6} className="fill-ink-2" />
              <circle
                cx={TONE_X}
                cy={TONE_Y}
                r={5}
                style={{
                  fill: "oklch(from var(--ink-3) 0.7 0.01 h)",
                  stroke: "oklch(from var(--ink-3) 0.45 0.015 h)",
                }}
                strokeWidth={0.8}
              />
              <motion.line
                x1={TONE_X}
                y1={TONE_Y}
                x2={toneX}
                y2={toneY}
                strokeWidth={1.8}
                strokeLinecap="round"
                className="stroke-ink-2"
              />
              <motion.line
                x1={shellX}
                y1={shellY}
                x2={toneX}
                y2={toneY}
                strokeWidth={3.6}
                strokeLinecap="round"
                className="stroke-ink"
              />
            </svg>
          </div>

          <div className="flex h-7 min-w-0 items-center gap-2 rounded-2 border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] uppercase">
            {readout}
          </div>

          <div className="rounded-3 p-[3px]" style={{ background: trim }}>
            <div
              role="listbox"
              aria-label={label}
              aria-describedby={hintId}
              aria-activedescendant={
                activeSlot ? `${uid}-opt-${activeSlot.record.id}` : undefined
              }
              aria-disabled={disabled || undefined}
              tabIndex={disabled ? -1 : 0}
              onKeyDown={(event) => {
                setFocused(true);
                onListKeyDown(event);
              }}
              onFocus={(event) => {
                // The strip cursor shows for keyboard focus only; a click
                // on a strip focuses the list too and must not ring it.
                let keyboard = false;
                try {
                  keyboard = event.currentTarget.matches(":focus-visible");
                } catch {
                  keyboard = false;
                }
                setFocused(keyboard);
              }}
              onBlur={() => setFocused(false)}
              className={cn(
                "relative overflow-clip rounded-[9px] bg-surface-1 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              {n === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-ink-3">
                  The rack is empty.
                </p>
              ) : (
                <motion.div
                  key={motionSafe ? "rack" : `rack-${shownPage}`}
                  initial={motionSafe ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast }}
                  className="relative grid grid-cols-2"
                >
                  {column(shownPage, 0, true)}
                  {column(shownPage, 1, true)}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 bg-hairline-strong"
                  />
                  {leaves}
                </motion.div>
              )}
            </div>
          </div>

          <div
            ref={keysRef}
            role="toolbar"
            aria-label="Selector keys"
            onKeyDown={onKeysKeyDown}
            className="flex flex-col gap-1.5"
          >
            {[
              keys.filter((k) => k.kind === "letter"),
              keys.filter((k) => k.kind === "digit"),
            ].map((row, r) => (
              <div key={r} className="flex justify-center gap-1.5">
                {row.map((k) => {
                  const i = keys.indexOf(k);
                  const lit =
                    k.kind === "letter" &&
                    (pending === k.n ||
                      (pending === null && shownPage === k.n));
                  return (
                    <button
                      key={`${k.kind}-${k.n}`}
                      type="button"
                      tabIndex={i === keyAt ? 0 : -1}
                      disabled={disabled}
                      aria-pressed={
                        k.kind === "letter" ? pending === k.n : undefined
                      }
                      aria-label={
                        k.kind === "letter"
                          ? `Page ${k.text}`
                          : `Number ${k.text}`
                      }
                      onFocus={() => setKeyFocus(i)}
                      onClick={(event) => {
                        const x =
                          event.detail === 0 ? undefined : event.clientX;
                        if (k.kind === "letter") pressLetter(k.n, x);
                        else pressDigit(k.n, x);
                      }}
                      className={cn(
                        "flex h-8 max-w-10 min-w-0 flex-1 items-center justify-center border font-mono text-[11px] font-semibold transition-[transform,box-shadow] duration-100 outline-none",
                        k.kind === "letter" ? "rounded-full" : "rounded-2",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer disabled:cursor-not-allowed",
                        motionSafe && "enabled:active:translate-y-px",
                        lit && "ring-2 ring-cobalt-bright",
                      )}
                      style={{
                        background:
                          "linear-gradient(to bottom, var(--jb-key-light), var(--jb-key) 60%, var(--jb-key-dark))",
                        color: "var(--jb-key-ink)",
                        borderColor: "var(--jb-dark)",
                        boxShadow:
                          "inset 0 -2px 0 color-mix(in oklab, var(--jb-dark) 55%, transparent)",
                      }}
                    >
                      {k.text}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Arrow keys move through the strips, Page Up and Page Down turn a page,
        Enter picks. Type a page letter and a strip number to pick by code.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
