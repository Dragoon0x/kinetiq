"use client";

import * as React from "react";

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

export type DealtFeedEntry = {
  id: string;
  /** Who arrived. */
  name: string;
  /** A second line: what they did, where from. */
  detail?: string;
  /** A short tag beside the name, e.g. a plan. */
  meta?: string;
  /** When, as written ("just now", "2 min"). */
  time?: string;
  /** The avatar's hue in degrees. @default from the name */
  hue?: number;
};

export type DealtFeedDensity = "compact" | "cozy" | "roomy";

export type DealtFeedCorner =
  "top-right" | "top-left" | "bottom-right" | "bottom-left";

export type DealtFeedProps = {
  /** The list, newest first. An entry with a new id at the front is dealt onto the list. */
  entries?: readonly DealtFeedEntry[];
  /** How fast cards are thrown, 0.5 (a lazy toss) to 2 (a snap deal). @default 1 */
  dealSpeed?: number;
  /** How much a card spins in flight, 0 (it slides flat) to 1 (a spinning throw). @default 0.5 */
  spin?: number;
  /** Row height, avatar size and how much each row says. @default "cozy" */
  density?: DealtFeedDensity;
  /** Where the deck sits. @default "top-right" */
  deckCorner?: DealtFeedCorner;
  /** How many rows are kept; older ones slide out at the foot. @default 12 */
  max?: number;
  /** A pointer or keyboard focus in the feed holds the deal, so nothing moves under the reader; arrivals wait on the deck until it is pressed or left. @default true */
  pauseOnHover?: boolean;
  /** Cards leave the deck face down and turn over in flight. @default true */
  flip?: boolean;
  /** The heading. @default "Sign-ups" */
  title?: string;
  /** The count beside the heading. @default the number of entries */
  total?: number;
  /** A word after the count. @default "today" */
  totalLabel?: string;
  /** Names the list for assistive technology. @default "Sign-ups, newest first" */
  label?: string;
  /** The deck's colour and the new row's wash, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Fires as each dealt card lands. */
  onDeal?: (entry: DealtFeedEntry) => void;
  /** A paper slap as each card the visitor dealt lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Arrivals still land, but the deck cannot be pressed. @default false */
  disabled?: boolean;
  /** Sizes the box; the feed fills it. @default "h-full w-full" */
  className?: string;
};

type Density = { row: number; avatar: number; deckW: number; deckH: number };

const DENSITIES: Record<DealtFeedDensity, Density> = {
  compact: { row: 44, avatar: 26, deckW: 26, deckH: 36 },
  cozy: { row: 58, avatar: 32, deckW: 30, deckH: 42 },
  roomy: { row: 72, avatar: 38, deckW: 34, deckH: 46 },
};

/** Deals that arrive together leave the deck this far apart, ms at speed 1. */
const GAP = 260;

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

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

export const defaultDealtFeedEntries: readonly DealtFeedEntry[] = [
  {
    id: "s8",
    name: "Mara Okafor",
    detail: "Joined from the autumn walks page",
    meta: "Team",
    time: "2 min",
  },
  {
    id: "s7",
    name: "Tomas Reyne",
    detail: "Invited by Ines Varga",
    meta: "Solo",
    time: "6 min",
  },
  {
    id: "s6",
    name: "Ada Kerrow",
    detail: "Coldbrook, coast path group",
    meta: "Team",
    time: "11 min",
  },
  {
    id: "s5",
    name: "Sefa Lindqvist",
    detail: "Joined from the tide tables",
    meta: "Pro",
    time: "18 min",
  },
  {
    id: "s4",
    name: "Noor Haddad",
    detail: "Basinworks reading circle",
    meta: "Team",
    time: "25 min",
  },
  {
    id: "s3",
    name: "Elio Brandt",
    detail: "Joined from the map shop",
    meta: "Solo",
    time: "31 min",
  },
  {
    id: "s2",
    name: "Wren Abara",
    detail: "Invited by Ada Kerrow",
    meta: "Pro",
    time: "44 min",
  },
  {
    id: "s1",
    name: "Juno Vale",
    detail: "Fernworks walking club",
    meta: "Team",
    time: "1 h",
  },
];

/** A card back: the deck's colour, a fine twill and a pale inner rule. */
function backStyle(accent: string): React.CSSProperties {
  const base = `oklch(from ${accent} 0.52 c h)`;
  return {
    backgroundColor: base,
    backgroundImage: `repeating-linear-gradient(45deg, color-mix(in oklab, white 16%, transparent) 0 1.5px, transparent 1.5px 5px)`,
    boxShadow: `inset 0 0 0 2px color-mix(in oklab, white 30%, transparent), 0 1px 2px color-mix(in oklab, black 22%, transparent)`,
  };
}

function Avatar({ entry, size }: { entry: DealtFeedEntry; size: number }) {
  const hue = entry.hue ?? hash(entry.name) % 360;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `oklch(0.86 0.07 ${hue})`,
        color: `oklch(0.34 0.08 ${hue})`,
      }}
    >
      {initialsOf(entry.name)}
    </span>
  );
}

/** What a row says; the flying card wears the same face. */
function RowFace({
  entry,
  density,
}: {
  entry: DealtFeedEntry;
  density: DealtFeedDensity;
}) {
  const d = DENSITIES[density];
  return (
    <div className="flex h-full items-center gap-3 px-4">
      <Avatar entry={entry} size={d.avatar} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] leading-tight font-medium text-foreground">
            {entry.name}
          </span>
          {entry.meta ? (
            <span
              className={cn(
                "shrink-0 rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] tracking-[0.08em] text-ink-2 uppercase",
                density === "roomy"
                  ? "inline-flex"
                  : "hidden @[300px]:inline-flex",
              )}
            >
              {entry.meta}
            </span>
          ) : null}
        </div>
        {entry.detail && density !== "compact" ? (
          <p className="mt-0.5 truncate text-xs leading-tight text-ink-3">
            {entry.detail}
          </p>
        ) : null}
        {density === "roomy" && entry.meta ? (
          <p className="mt-1 truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
            {entry.meta} plan
          </p>
        ) : null}
      </div>
      {entry.time ? (
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {entry.time}
        </span>
      ) : null}
    </div>
  );
}

type RowProps = {
  entry: DealtFeedEntry;
  slot: number;
  height: number;
  density: DealtFeedDensity;
  accent: string;
  /** In the air: the row keeps its place but is not drawn yet. */
  waiting: boolean;
  /** Pushed past `max`: fading out under the foot. */
  leaving: boolean;
  /** Counts landings, so every row below a slap jostles. */
  slap: number;
  /** This row's own landing. */
  landed: number;
  motionSafe: boolean;
};

/**
 * One row. Its slot is a motion value of its own, so rows glide down as cards
 * land above them; the slap is a scale on recoil, and the jostle a few pixels
 * of its own, so neither fights the glide.
 */
function Row({
  entry,
  slot,
  height,
  density,
  accent,
  waiting,
  leaving,
  slap,
  landed,
  motionSafe,
}: RowProps) {
  const pos = useMotionValue(slot * height);
  const jostle = useMotionValue(0);
  const scale = useMotionValue(1);
  const wash = useMotionValue(0);
  const fade = useMotionValue(waiting ? 0 : 1);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, c: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, c);
  };

  const target = slot * height;
  React.useEffect(() => {
    if (Math.abs(pos.get() - target) < 0.5) return;
    if (!motionSafe) {
      runs.current.get("pos")?.stop();
      pos.set(target);
      return;
    }
    run("pos", animate(pos, target, springs.glide));
    // StrictMode re-runs this: the re-run carries the glide on to rest.
  }, [target, motionSafe, pos]);

  // Landing: the slap, and the new row's wash fading out.
  const seenLanded = React.useRef(landed);
  React.useEffect(() => {
    if (landed === seenLanded.current) return;
    seenLanded.current = landed;
    if (!motionSafe) {
      run(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    fade.jump(1);
    scale.jump(1.045);
    run("scale", animate(scale, 1, springs.recoil));
    wash.jump(1);
    run("wash", animate(wash, 0, { duration: 1.4, ease: easings.exit }));
  }, [landed, motionSafe, fade, scale, wash]);

  // A slap above shakes the rows below it.
  const seenSlap = React.useRef(slap);
  React.useEffect(() => {
    if (slap === seenSlap.current) return;
    seenSlap.current = slap;
    if (!motionSafe || slot === 0 || waiting) return;
    jostle.jump(Math.max(0.6, 3 - slot * 0.4));
    run(
      "jostle",
      animate(jostle, 0, {
        ...springs.recoil,
        delay: Math.min(0.12, slot * 0.02),
      }),
    );
  }, [slap, slot, waiting, motionSafe, jostle]);

  React.useEffect(() => {
    if (!leaving) return;
    run(
      "leave",
      animate(fade, 0, { duration: durations.fast, ease: easings.exit }),
    );
  }, [leaving, fade]);

  React.useEffect(() => {
    const all = runs.current;
    return () => {
      for (const c of all.values()) c.stop();
      all.clear();
    };
  }, []);

  const y = useTransform([pos, jostle] as MotionValue<number>[], ([p, j]) =>
    r2((p as number) + (j as number)),
  );
  const washBg = useTransform(
    wash,
    (w) => `color-mix(in oklab, ${accent} ${Math.round(w * 12)}%, transparent)`,
  );

  return (
    <motion.li
      aria-hidden={waiting || leaving || undefined}
      className="absolute inset-x-0 top-0 border-b border-hairline"
      style={{ height, y, scale, opacity: fade, background: washBg }}
    >
      <RowFace entry={entry} density={density} />
    </motion.li>
  );
}

type Flight = {
  key: string;
  entry: DealtFeedEntry;
  from: { x: number; y: number; w: number; h: number; tilt: number };
  visitor: boolean;
};

/**
 * A card in the air: leaves the deck face down at the deck's size and tilt,
 * flies to its slot along an arc (x and y on different springs), widening as
 * it goes, turns face up and spins a little against its travel, then lands.
 */
function FlyingCard({
  flight,
  to,
  density,
  accent,
  speed,
  spin,
  flip,
  onLand,
}: {
  flight: Flight;
  to: { x: number; y: number; w: number; h: number };
  density: DealtFeedDensity;
  accent: string;
  speed: number;
  spin: number;
  flip: boolean;
  onLand: () => void;
}) {
  const { from } = flight;
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const w = useMotionValue(from.w);
  const h = useMotionValue(from.h);
  const turn = useMotionValue(flip ? 180 : 0);
  const rotate = useMotionValue(from.tilt);
  const lift = useMotionValue(1);
  const landRef = React.useRef(onLand);
  React.useEffect(() => {
    landRef.current = onLand;
  });

  // The flight's springs: stiffer with speed, squared, so a faster deal is
  // quicker without changing its shape.
  const k = clamp(speed, 0.5, 2) ** 2;
  const along = {
    type: "spring" as const,
    stiffness: 300 * k,
    damping: 34 * Math.sqrt(k),
    mass: 1,
    restDelta: 0.5,
    restSpeed: 20,
  };
  const drop = {
    type: "spring" as const,
    stiffness: 190 * k,
    damping: 28 * Math.sqrt(k),
    mass: 1,
    restDelta: 0.5,
    restSpeed: 20,
  };

  React.useEffect(() => {
    const running = [
      animate(x, to.x, along),
      animate(w, to.w, along),
      animate(h, to.h, drop),
      animate(turn, 0, {
        ...springs.glide,
        stiffness: springs.glide.stiffness * k,
      }),
      animate(rotate, 0, {
        ...springs.glide,
        stiffness: springs.glide.stiffness * k,
        // Thrown with a twist: it turns further before it straightens.
        velocity: -clamp(spin, 0, 1) * 320 * Math.sqrt(k),
      }),
      animate(lift, 0, { ...drop }),
      animate(y, to.y, { ...drop, onComplete: () => landRef.current() }),
    ];
    return () => {
      for (const c of running) c.stop();
    };
    // The slot can move while the card is in the air (another deal pushed
    // it down): the springs retarget from where the card is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to.x, to.y, to.w, to.h]);

  const face = useTransform(turn, (t) => (t > 90 ? 0 : 1));
  const back = useTransform(turn, (t) => (t > 90 ? 1 : 0));
  const shadow = useTransform(
    lift,
    (l) =>
      `0 ${r2(2 + 14 * l)}px ${r2(6 + 26 * l)}px color-mix(in oklab, black ${Math.round(14 + 14 * l)}%, transparent)`,
  );

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30 overflow-hidden rounded-2 border border-hairline bg-card"
      style={{
        x,
        y,
        width: w,
        height: h,
        rotate,
        rotateY: turn,
        transformPerspective: 900,
        boxShadow: shadow,
      }}
    >
      <motion.div
        className="absolute top-0 left-0"
        style={{ width: to.w, height: to.h, opacity: face }}
      >
        <RowFace entry={flight.entry} density={density} />
      </motion.div>
      <motion.div
        className="absolute inset-0 rounded-2"
        style={{ ...backStyle(accent), opacity: back }}
      />
    </motion.div>
  );
}

type Live = {
  held: boolean;
  motionSafe: boolean;
  keep: number;
  speed: number;
  deckW: number;
  deckH: number;
  tilt: number;
  onDeal?: (entry: DealtFeedEntry) => void;
  audio: ReturnType<typeof useTactileSound>;
};

type Dealer = {
  arrive: (
    fresh: DealtFeedEntry[],
    present: Map<string, DealtFeedEntry>,
  ) => void;
  /** The visitor pressed the deck: deal what waits, with sound. */
  release: () => void;
  wake: () => void;
  land: (key: string, entry: DealtFeedEntry, visitor: boolean) => void;
  dispose: () => void;
};

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/**
 * The queue and its clock, outside React's render: arrivals wait here, are
 * dealt one card a beat, and are announced in one sentence per burst.
 */
function createDealer(ctx: {
  live: React.RefObject<Live>;
  root: React.RefObject<HTMLDivElement | null>;
  deck: React.RefObject<HTMLButtonElement | null>;
  setRows: Setter<string[]>;
  setFlights: Setter<Flight[]>;
  setLandings: Setter<Record<string, number>>;
  setSlap: Setter<number>;
  setWaitingCount: Setter<number>;
  setSaid: Setter<{ n: number; text: string }>;
}): Dealer {
  const queue: { entry: DealtFeedEntry; visitor: boolean }[] = [];
  const batch: DealtFeedEntry[] = [];
  let lastDeal = -Infinity;
  let pumpTimer = 0;
  let batchTimer = 0;
  let force = false;
  let seq = 0;

  const announce = (entry: DealtFeedEntry) => {
    batch.push(entry);
    window.clearTimeout(batchTimer);
    batchTimer = window.setTimeout(() => {
      const list = batch.splice(0);
      const first = list[0];
      if (!first) return;
      const names = list.map((e) => e.name);
      const tail = names.pop();
      const text =
        list.length === 1
          ? `${first.name} joined${first.meta ? `, ${first.meta} plan` : ""}.`
          : `${list.length} new: ${names.join(", ")} and ${tail}.`;
      ctx.setSaid((s) => ({ n: s.n + 1, text }));
    }, 500);
  };

  const landed = (entry: DealtFeedEntry) => {
    ctx.setLandings((all) => ({
      ...all,
      [entry.id]: (all[entry.id] ?? 0) + 1,
    }));
    ctx.live.current.onDeal?.(entry);
    announce(entry);
  };

  /** Starts one card on its way: the row's place opens, the card leaves the deck. */
  const deal = (item: { entry: DealtFeedEntry; visitor: boolean }) => {
    const { entry, visitor } = item;
    const L = ctx.live.current;
    ctx.setRows((all) =>
      [entry.id, ...all.filter((id) => id !== entry.id)].slice(0, L.keep + 1),
    );
    const root = ctx.root.current;
    const deck = ctx.deck.current;
    if (!L.motionSafe || !root || !deck) {
      landed(entry);
      return;
    }
    const rb = root.getBoundingClientRect();
    const db = deck.getBoundingClientRect();
    const ox = rb.left + root.clientLeft;
    const oy = rb.top + root.clientTop;
    seq += 1;
    const key = `${entry.id}-${seq}`;
    ctx.setFlights((all) => [
      ...all,
      {
        key,
        entry,
        visitor,
        from: {
          x: r2(db.left - ox + (db.width - L.deckW) / 2),
          y: r2(db.top - oy + (db.height - L.deckH) / 2),
          w: L.deckW,
          h: L.deckH,
          // The deck's top card lies at two degrees; the throw adds the spin.
          tilt: L.tilt,
        },
      },
    ]);
  };

  /** Deals what is waiting, one card a beat, unless the reader is holding the list. */
  const pump = () => {
    window.clearTimeout(pumpTimer);
    pumpTimer = 0;
    const L = ctx.live.current;
    if (queue.length === 0) {
      force = false;
      ctx.setWaitingCount(0);
      return;
    }
    if (L.held && !force) {
      ctx.setWaitingCount(queue.length);
      return;
    }
    const gap = GAP / L.speed;
    const now = window.performance.now();
    if (now < lastDeal + gap) {
      pumpTimer = window.setTimeout(pump, lastDeal + gap - now);
      return;
    }
    const next = queue.pop();
    if (!next) return;
    lastDeal = now;
    ctx.setWaitingCount(queue.length);
    deal(next);
    if (queue.length > 0) pumpTimer = window.setTimeout(pump, gap);
    else force = false;
  };

  return {
    arrive(fresh, present) {
      // `pop` takes from the end: the oldest arrival goes first.
      queue.unshift(...fresh.map((entry) => ({ entry, visitor: false })));
      ctx.setWaitingCount(queue.length);
      ctx.setRows((all) => {
        const kept = all.filter((id) => present.has(id));
        return kept.length === all.length ? all : kept;
      });
      pumpTimer = window.setTimeout(pump, 0);
    },
    release() {
      if (queue.length === 0) return;
      for (const q of queue) q.visitor = true;
      force = true;
      pump();
    },
    wake() {
      window.clearTimeout(pumpTimer);
      pumpTimer = window.setTimeout(pump, 0);
    },
    land(key, entry, visitor) {
      ctx.setFlights((all) => all.filter((f) => f.key !== key));
      ctx.setSlap((n) => n + 1);
      if (visitor) {
        ctx.live.current.audio.play("paper", {
          pitch: 0.92 + (hash(entry.id) % 20) / 100,
          gain: 0.55,
        });
      }
      landed(entry);
    },
    dispose() {
      window.clearTimeout(pumpTimer);
      window.clearTimeout(batchTimer);
    },
  };
}

/** A count whose digits roll up as it climbs. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span className="inline-flex tabular-nums" style={{ lineHeight: 1 }}>
      {digits.map((d, i) => (
        <span
          key={digits.length - i}
          className="relative inline-block overflow-hidden"
          style={{ height: "1em", width: "0.62em" }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 block"
            initial={false}
            animate={{ y: `${-Number(d)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <span
                key={n}
                className="block text-center"
                style={{ height: "1em", lineHeight: 1 }}
              >
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * A live list whose new entries are dealt onto it like cards. Each one leaves
 * a deck in the corner face down, flies to the top along an arc — turning
 * face up and spinning a little against its travel — and slaps into place
 * with the recoil spring's two bounces while the rows below glide down to
 * make room and jostle as it lands, and the count beside the heading rolls
 * up. Several arrivals are dealt one after another.
 *
 * A pointer or keyboard focus in the feed holds the deal, so nothing moves
 * under the reader: arrivals wait on the deck with a count, and pressing the
 * deck deals them now. The list is an ordered list, landings are announced
 * politely once each, and the deck is a real button. Under reduced motion a
 * new entry fades in at the top and the rows move at once.
 */
export function DealtFeed({
  entries = defaultDealtFeedEntries,
  dealSpeed = 1,
  spin = 0.5,
  density = "cozy",
  deckCorner = "top-right",
  max = 12,
  pauseOnHover = true,
  flip = true,
  title = "Sign-ups",
  total,
  totalLabel = "today",
  label = "Sign-ups, newest first",
  accent = "var(--accent-bright)",
  onDeal,
  sound = false,
  disabled = false,
  className,
}: DealtFeedProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const d = DENSITIES[density] ?? DENSITIES.cozy;
  const keep = clamp(Math.round(max), 1, 50);
  const speed = clamp(dealSpeed, 0.5, 2);

  const byId = React.useMemo(
    () => new Map(entries.map((e) => [e.id, e])),
    [entries],
  );

  /** What the list shows, newest first; the last may be leaving. */
  const [rows, setRows] = React.useState<string[]>(() =>
    entries.slice(0, keep).map((e) => e.id),
  );
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [landings, setLandings] = React.useState<Record<string, number>>({});
  const [slap, setSlap] = React.useState(0);
  const [waitingCount, setWaitingCount] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [held, setHeld] = React.useState(false);
  /** Where the list sits in the box: the flying cards aim at its slots. */
  const [box, setBox] = React.useState({ x: 0, y: 0, w: 0 });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const deckRef = React.useRef<HTMLButtonElement | null>(null);
  const known = React.useRef(new Set(entries.map((e) => e.id)));
  const dealer = React.useRef<Dealer | null>(null);
  const hover = React.useRef(false);
  const focus = React.useRef(false);
  const live = React.useRef<Live>({
    held,
    motionSafe,
    keep,
    speed,
    deckW: d.deckW,
    deckH: d.deckH,
    tilt: deckCorner.endsWith("right") ? -2 : 2,
    onDeal,
    audio,
  });
  React.useEffect(() => {
    live.current = {
      held,
      motionSafe,
      keep,
      speed,
      deckW: d.deckW,
      deckH: d.deckH,
      tilt: deckCorner.endsWith("right") ? -2 : 2,
      onDeal,
      audio,
    };
  });

  React.useEffect(() => {
    const dl = createDealer({
      live,
      root: rootRef,
      deck: deckRef,
      setRows,
      setFlights,
      setLandings,
      setSlap,
      setWaitingCount,
      setSaid,
    });
    dealer.current = dl;
    return () => {
      dl.dispose();
      if (dealer.current === dl) dealer.current = null;
    };
  }, []);

  // New ids at the front of `entries` are queued, oldest first so the newest
  // lands on top; ids the host dropped leave the list. Before paint, so the
  // count never shows an arrival that has not landed.
  React.useLayoutEffect(() => {
    const fresh: DealtFeedEntry[] = [];
    for (const e of entries) {
      if (known.current.has(e.id)) continue;
      known.current.add(e.id);
      fresh.push(e);
    }
    dealer.current?.arrive(fresh, byId);
  }, [entries, byId]);

  // Letting go of the list deals whatever waited.
  React.useEffect(() => {
    if (!held) dealer.current?.wake();
  }, [held]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const list = listRef.current;
      if (!list) return;
      setBox({
        x: list.offsetLeft,
        y: list.offsetTop,
        w: Math.round(list.clientWidth),
      });
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const hold = () => {
    const next = pauseOnHover && (hover.current || focus.current);
    if (next !== held) setHeld(next);
  };

  const flying = new Set(flights.map((f) => f.entry.id));

  const shownTotal = (total ?? entries.length) - waitingCount - flights.length;
  const top = deckCorner.startsWith("top");
  const right = deckCorner.endsWith("right");

  return (
    <div
      ref={bindRoot}
      // Anywhere in the feed — the list, the deck — holds the deal, so the
      // reader can reach the deck without letting the cards go.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        hover.current = true;
        hold();
      }}
      onPointerLeave={() => {
        hover.current = false;
        hold();
      }}
      onFocus={() => {
        focus.current = true;
        hold();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        focus.current = false;
        hold();
      }}
      className={cn(
        "@container relative isolate flex h-full w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-card-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3",
          top && (right ? "pr-16" : "pl-16"),
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="truncate">{title}</span>
            <span aria-hidden className="relative flex size-2 shrink-0">
              {slap > 0 && motionSafe ? (
                <motion.span
                  key={slap}
                  className="absolute inset-0 rounded-full bg-success"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2.6, opacity: 0 }}
                  transition={{ duration: durations.page, ease: easings.enter }}
                />
              ) : null}
              <span className="relative size-2 rounded-full bg-success" />
            </span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-ink-3">
            <RollingCount value={shownTotal} motionSafe={motionSafe} />
            <span>{totalLabel}</span>
          </p>
        </div>
      </div>

      <div
        ref={listRef}
        tabIndex={0}
        aria-label={label}
        role="region"
        className="relative flex-1 overflow-hidden outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        <ol
          className="relative"
          style={{ height: Math.max(rows.length, 1) * d.row }}
        >
          {rows.map((id, slot) => {
            const entry =
              byId.get(id) ?? flights.find((f) => f.entry.id === id)?.entry;
            if (!entry) return null;
            return (
              <Row
                key={id}
                entry={entry}
                slot={slot}
                height={d.row}
                density={density}
                accent={accent}
                waiting={flying.has(id)}
                leaving={slot >= keep}
                slap={slap}
                landed={landings[id] ?? 0}
                motionSafe={motionSafe}
              />
            );
          })}
        </ol>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,var(--card),transparent)]"
        />
      </div>

      <button
        ref={deckRef}
        type="button"
        aria-label={
          waitingCount > 0
            ? `Deal ${waitingCount} waiting ${waitingCount === 1 ? "entry" : "entries"}`
            : "Nothing waiting on the deck"
        }
        aria-disabled={disabled || waitingCount === 0 || undefined}
        onClick={() => {
          if (!disabled) dealer.current?.release();
        }}
        className={cn(
          "absolute z-20 flex items-center justify-center rounded-2 p-1.5 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          top ? "top-2" : "bottom-2",
          right ? "right-2" : "left-2",
          waitingCount > 0 && !disabled ? "cursor-pointer" : "cursor-default",
        )}
        style={{ width: d.deckW + 22, height: d.deckH + 14 }}
      >
        {[2, 1, 0].map((i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-2"
            style={{
              width: d.deckW,
              height: d.deckH,
              transform: `translate(${(right ? -1 : 1) * i * 2}px, ${-i * 2}px) rotate(${(right ? -1 : 1) * (6 + (i - 1) * 4)}deg)`,
              ...backStyle(accent),
            }}
          />
        ))}
        {waitingCount > 0 ? (
          <span
            aria-hidden
            className={cn(
              "absolute -top-0.5 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-mono text-[10px] leading-none text-background tabular-nums",
              right ? "-left-0.5" : "-right-0.5",
            )}
          >
            {waitingCount}
          </span>
        ) : null}
      </button>

      {box.w > 0
        ? flights.map((f) => {
            const slot = rows.indexOf(f.entry.id);
            if (slot < 0) return null;
            return (
              <FlyingCard
                key={f.key}
                flight={f}
                to={{ x: box.x, y: box.y + slot * d.row, w: box.w, h: d.row }}
                density={density}
                accent={accent}
                speed={speed}
                spin={spin}
                flip={flip}
                onLand={() => dealer.current?.land(f.key, f.entry, f.visitor)}
              />
            );
          })
        : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
