"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  rubberClamp,
  useDrag,
  type DragInfo,
  type Point,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MeldTagsTag = { id: string; label: string };

export type MeldTagsTint = "mono" | "tint";

export type MeldTagsChange = {
  /** `meld`: the tag joined a group. `free`: it was pulled out on its own. */
  kind: "meld" | "free";
  id: string;
  /** The group the tag is in after the change, in order. */
  group: string[];
};

export type MeldTagsProps = {
  tags: MeldTagsTag[];
  /** Controlled groups of tag ids, in order; a tag on its own is a group of one. */
  value?: string[][];
  /** Starting groups when uncontrolled. @default every tag on its own */
  defaultValue?: string[][];
  /** Fires from the drop or the key that changed the groups. */
  onValueChange?: (value: string[][], change: MeldTagsChange) => void;
  /** The set's accessible name. @default "Tags" */
  label?: string;
  /** How thick the liquid runs, 0 to 1: a thicker neck, a longer stretch before it tears, a slower settle. @default 0.5 */
  goo?: number;
  /** How near, in px, a tag must come before the neck reaches out, 8 to 48. @default 24 */
  radius?: number;
  /** Groups in neutral ink, or each in its own hue. @default "tint" */
  tint?: MeldTagsTint;
  /** The most tags a group takes, 2 to 6. @default 4 */
  maxGroup?: number;
  /** Play the gloop and the pop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Rect = { x: number; y: number; w: number; h: number };
type Circle = { x: number; y: number; r: number };
type Item = { key: string; members: string[] };
type Link = { key: string; fill: string; reach: number };

type Session = {
  id: string;
  member: boolean;
  /** The key of the item the tag came from. */
  ownKey: string;
  ownFill: string;
  w: number;
  h: number;
  start: Point;
  torn: boolean;
  /** The droplet a tear leaves: where it broke, and the pill it snaps back into. */
  popAt: { tip: Circle; home: Circle } | null;
  /** What the face is joined to by the neck, if anything. */
  link: Link | null;
  mode: "drag" | "flight";
  chasing: boolean;
  /** The neck actually showed: only then does a return re-seat audibly. */
  stretched: boolean;
  touched: boolean;
  /** What landing means: a meld sounds when it touches, a re-seat when it lands. */
  landing: "meld" | "reseat" | "none";
  /** The group's size once the tag is in: a bigger group gloops higher. */
  size: number;
  armed: string | null;
  full: string | null;
};

type Choice = { kind: "free" } | { kind: "meld"; key: string };

const HUES = ["--accent-bright", "--success", "--warn", "--signal"] as const;
// Shading toward the surface, so every mix is in oklab: an oklch mix with a
// near-grey surface loses its hue.
const SINGLE = "color-mix(in oklab, var(--ink) 10%, var(--bg-1))";
const MONO = "color-mix(in oklab, var(--ink) 19%, var(--bg-1))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const mix = (a: string, b: string, t: number) =>
  `color-mix(in oklab, ${a} ${Math.round(clamp01(t) * 100)}%, ${b})`;

/** FNV-1a, unsigned throughout, so a key always lands on the same hue. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
};

const fillOf = (key: string, tint: MeldTagsTint) =>
  tint === "mono"
    ? MONO
    : `color-mix(in oklab, var(${HUES[hash(key) % HUES.length]}) 30%, var(--bg-1))`;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/**
 * The two circles a neck joins: each pill is a capsule, so its end is the
 * nearest point on its spine with half its height as the radius. Returns the
 * circles, the distance between their centres and the gap between the pills.
 */
function nearest(a: Rect, b: Rect) {
  const ar = a.h / 2;
  const br = b.h / 2;
  const a1 = a.x + ar;
  const a2 = Math.max(a1, a.x + a.w - ar);
  const b1 = b.x + br;
  const b2 = Math.max(b1, b.x + b.w - br);
  let ax: number;
  let bx: number;
  if (a2 < b1) {
    ax = a2;
    bx = b1;
  } else if (b2 < a1) {
    ax = a1;
    bx = b2;
  } else {
    ax = bx = (Math.max(a1, b1) + Math.min(a2, b2)) / 2;
  }
  const A = { x: ax, y: a.y + ar, r: ar };
  const B = { x: bx, y: b.y + br, r: br };
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  return { a: A, b: B, d, gap: d - ar - br };
}

/**
 * The bridge between two circles, as a closed path: the metaball
 * construction (tangent points spread around each circle, joined by curves
 * whose handles shorten as the circles part). The pills are drawn over both
 * circles, so what shows is the neck alone — crisp at any size, rebuilt each
 * frame, no blur filter. The neck thins as the gap nears `reach` and is gone
 * past it.
 */
function bridge(a: Circle, b: Circle, spread: number, reach: number): string {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const total = a.r + b.r;
  if (d < 0.5 || d - total > reach || d <= Math.abs(a.r - b.r)) return "";
  const thin = Number.isFinite(reach)
    ? 1 - clamp01((d - total) / Math.max(1, reach))
    : 1;
  const v = spread * (0.35 + 0.65 * thin);
  const dir = Math.atan2(b.y - a.y, b.x - a.x);
  const u1 =
    d < total
      ? Math.acos(clamp((a.r * a.r + d * d - b.r * b.r) / (2 * a.r * d), -1, 1))
      : 0;
  const u2 =
    d < total
      ? Math.acos(clamp((b.r * b.r + d * d - a.r * a.r) / (2 * b.r * d), -1, 1))
      : 0;
  const maxSpread = Math.acos(clamp((a.r - b.r) / d, -1, 1));
  const a1 = dir + u1 + (maxSpread - u1) * v;
  const b1 = dir - u1 - (maxSpread - u1) * v;
  const a2 = dir + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v;
  const b2 = dir - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v;
  const on = (c: Circle, t: number) =>
    [c.x + c.r * Math.cos(t), c.y + c.r * Math.sin(t)] as const;
  const p1a = on(a, a1);
  const p1b = on(a, b1);
  const p2a = on(b, a2);
  const p2b = on(b, b2);
  const handle =
    Math.min(v * 2.4, Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / total) *
    Math.min(1, (d * 2) / total);
  const h = (p: readonly [number, number], r: number, t: number) =>
    [p[0] + r * handle * Math.cos(t), p[1] + r * handle * Math.sin(t)] as const;
  const h1 = h(p1a, a.r, a1 - Math.PI / 2);
  const h2 = h(p2a, b.r, a2 + Math.PI / 2);
  const h3 = h(p2b, b.r, b2 - Math.PI / 2);
  const h4 = h(p1b, a.r, b1 + Math.PI / 2);
  const f = (p: readonly [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  return [
    `M${f(p1a)}`,
    `C${f(h1)} ${f(h2)} ${f(p2a)}`,
    `A${r2(b.r)} ${r2(b.r)} 0 0 0 ${f(p2b)}`,
    `C${f(h3)} ${f(h4)} ${f(p1b)}`,
    `A${r2(a.r)} ${r2(a.r)} 0 0 0 ${f(p1a)}Z`,
  ].join("");
}

const dot = (c: Circle) =>
  c.r < 0.5
    ? ""
    : `M${r2(c.x - c.r)} ${r2(c.y)}a${r2(c.r)} ${r2(c.r)} 0 1 0 ${r2(c.r * 2)} 0a${r2(c.r)} ${r2(c.r)} 0 1 0 ${r2(-c.r * 2)} 0Z`;

/** A box in the component's padding-box coordinates, as drawn right now. */
function rectIn(el: Element, box: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return {
    x: r.left - b.left - box.clientLeft,
    y: r.top - b.top - box.clientTop,
    w: r.width,
    h: r.height,
  };
}

/** Where a box's layout puts it, ignoring any transform in flight. */
function layoutIn(el: HTMLElement, box: HTMLElement): Point {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== box) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const joinList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * Tags you group by hand, and a liquid that does the grouping. Drag a tag
 * toward another tag or a group: within `radius` px a neck of liquid reaches
 * out between them, thickening as they close, and the tag takes on the
 * group's colour; let go and the neck draws it in and it melds with a
 * gloop. Drag a member out of its group and it stretches against the neck
 * until the neck tears with a pop and snaps back into the group, which
 * closes the gap and counts one fewer. A group never takes more than
 * `maxGroup` tags.
 *
 * The neck is the two-circle metaball bridge between the nearest ends of
 * the two pills, rebuilt from motion values each frame — no blur filter.
 * Releases fly on springs that take the release velocity, reflows glide,
 * and every tag is a real button: Enter picks it up, Left and Right choose
 * where it goes, Enter drops it with the same sound, Escape puts it back.
 * Under reduced motion the drops land in one step and the reflow is
 * instant, while colours, counts, outlines and sounds still answer.
 */
export function MeldTags({
  tags,
  value,
  defaultValue,
  onValueChange,
  label = "Tags",
  goo = 0.5,
  radius = 24,
  tint = "tint",
  maxGroup = 4,
  sound = false,
  disabled = false,
  className,
}: MeldTagsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;
  const g = clamp01(goo);
  const reach = clamp(radius, 0, 96);
  const cap = Math.max(2, Math.round(maxGroup));
  const spread = lerp(0.3, 0.72, g);
  const tear = lerp(18, 40, g);
  const settle = spring(lerp(520, 300, g), lerp(0.9, 0.62, g));

  const [own, setOwn] = React.useState<string[][]>(
    () => defaultValue ?? tags.map((t) => [t.id]),
  );
  const groups = value ?? own;
  const [anchors, setAnchors] = React.useState<Record<string, string>>({});
  const [minted, setMinted] = React.useState(0);
  const [drag, setDrag] = React.useState<{
    id: string;
    torn: boolean;
    full: string | null;
  } | null>(null);
  const [flying, setFlying] = React.useState<{
    id: string;
    velocity: Point;
    spring: ReturnType<typeof spring>;
  } | null>(null);
  const [picked, setPicked] = React.useState<{
    id: string;
    choice: number;
  } | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  // The live region. A change to the groups is spoken only while the groups
  // hold it, so a drop the host refuses is never announced; picking up and
  // choosing are the component's own and are spoken at once.
  const [said, setSaid] = React.useState<{
    text: string;
    group?: string[];
  }>({ text: "" });
  const say = (text: string, group?: string[]) => setSaid({ text, group });

  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const itemEls = React.useRef(new Map<string, HTMLLIElement>());
  const faceEls = React.useRef(new Map<string, HTMLElement>());
  const buttonEls = React.useRef(new Map<string, HTMLButtonElement>());
  const session = React.useRef<Session | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const retracting = React.useRef<AnimationPlaybackControls | null>(null);
  const pendingFocus = React.useRef<string | null>(null);
  // Read by blur, which can arrive from a node the drop has just moved.
  const pickedRef = React.useRef<{ id: string; choice: number } | null>(null);
  const choose = (next: { id: string; choice: number } | null) => {
    pickedRef.current = next;
    setPicked(next);
  };

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const retract = useMotionValue(1);
  const neck = useMotionValue("");
  const neckFill = useMotionValue(SINGLE);
  const faceFill = useMotionValue(SINGLE);

  const labelOf = (id: string) => tags.find((t) => t.id === id)?.label ?? id;

  // Every group keeps its key (its colour and its identity for the reflow)
  // while tags come and go: the key is remembered against the group's first
  // tag, and re-pinned whenever the first tag changes.
  const items: Item[] = [];
  {
    const used = new Set<string>();
    for (const members of groups) {
      const known = members.filter((id) => tags.some((t) => t.id === id));
      const first = known[0];
      if (first === undefined) continue;
      let key = anchors[first] ?? first;
      if (used.has(key)) key = known.join("+");
      used.add(key);
      items.push({ key, members: known });
    }
  }
  const order = items.flatMap((it) => it.members);
  const itemOf = (id: string) => items.find((it) => it.members.includes(id));
  const fillFor = (it: Item) =>
    it.members.length > 1 ? fillOf(it.key, tint) : SINGLE;
  const nameOfItem = (it: Item) =>
    it.members.length > 1
      ? `the ${labelOf(it.members[0] ?? "")} group, ${it.members.length} tags`
      : labelOf(it.members[0] ?? "");

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };

  const panAt = (x: number) => {
    const box = boxRef.current;
    if (!box) return 0;
    const b = box.getBoundingClientRect();
    return panFrom(b.left + box.clientLeft + x, box);
  };

  /**
   * Whether the drop actually landed in the group it aimed at, read from
   * the committed page: a meld the host refused flies home without a sound.
   */
  const seated = (s: Session) => {
    const face = faceEls.current.get(s.id);
    const into = s.link ? itemEls.current.get(s.link.key) : undefined;
    return Boolean(face && into?.contains(face));
  };

  const gloop = (size: number, x: number, quiet = false) =>
    audio.play("gloop", {
      pitch: r2(quiet ? 1.35 : 0.9 + Math.min(4, size) * 0.08),
      gain: quiet ? 0.3 : 0.6,
      pan: panAt(x),
    });

  /**
   * Draws the neck and tints the floating face for wherever it is now. Runs
   * from the motion values' own change events, so the finger, a spring or a
   * retracting droplet all redraw it the same way.
   */
  const paint = () => {
    const s = session.current;
    const box = boxRef.current;
    if (!s || !box) {
      neck.set("");
      return;
    }
    const face = { x: fx.get(), y: fy.get(), w: s.w, h: s.h };
    const t = retract.get();
    let base = s.member && !s.torn ? s.ownFill : SINGLE;
    if (s.torn && t < 1) base = mix(SINGLE, s.ownFill, t);
    let fill = base;
    let path = "";
    let pathFill = s.ownFill;
    if (s.link) {
      const el = itemEls.current.get(s.link.key);
      if (el) {
        const n = nearest(face, rectIn(el, box));
        path = bridge(n.a, n.b, spread, s.link.reach);
        pathFill = s.link.fill;
        const meld = Number.isFinite(s.link.reach)
          ? clamp01(1 - n.gap / Math.max(1, s.link.reach))
          : 1;
        if (s.link.fill !== base) fill = mix(s.link.fill, base, meld);
        if (s.mode === "flight" && !s.touched && n.gap <= 0.5) {
          s.touched = true;
          if (s.landing === "meld" && seated(s)) {
            gloop(s.size, face.x + face.w / 2);
          }
        }
      }
    }
    if (s.popAt && t < 1) {
      const { tip, home } = s.popAt;
      const drop = {
        x: lerp(tip.x, home.x, t),
        y: lerp(tip.y, home.y, t),
        r: lerp(tip.r * 0.55, 0.4, t),
      };
      path += bridge(home, drop, spread, Infinity) + dot(drop);
      if (!s.link) pathFill = s.ownFill;
    }
    neckFill.set(pathFill);
    faceFill.set(fill);
    neck.set(path);
  };

  const paintRef = React.useRef(paint);
  React.useEffect(() => {
    paintRef.current = paint;
  });
  React.useEffect(() => {
    const redraw = () => paintRef.current();
    const offs = [
      fx.on("change", redraw),
      fy.on("change", redraw),
      retract.on("change", redraw),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [fx, fy, retract]);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current = [];
      retracting.current?.stop();
    },
    [],
  );

  // Focus that has to follow a tag to its new place is bound once the node
  // for that place exists: every commit looks for it until it is there.
  React.useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const el = buttonEls.current.get(id);
    if (!el) return;
    pendingFocus.current = null;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
  });

  /** Commits new groups, keeps each group's key, and says what happened. */
  const commit = (
    next: string[][],
    change: MeldTagsChange,
    keep: { key: string; members: string[] }[],
    sentence: string,
  ) => {
    const pins: Record<string, string> = {};
    for (const k of keep) {
      const first = k.members[0];
      if (first !== undefined) pins[first] = k.key;
    }
    setAnchors((a) => ({ ...a, ...pins }));
    if (value === undefined) setOwn(next);
    say(sentence, change.group);
    onValueChange?.(next, change);
  };

  const meldInto = (id: string, key: string) => {
    const from = itemOf(id);
    const into = items.find((it) => it.key === key);
    if (!from || !into || from.key === key) return false;
    if (into.members.length >= cap) return false;
    const target = [...into.members, id];
    const rest = from.members.filter((m) => m !== id);
    const next: string[][] = [];
    for (const it of items) {
      if (it.key === into.key) next.push(target);
      else if (it.key === from.key) {
        if (rest.length) next.push(rest);
      } else next.push(it.members);
    }
    commit(
      next,
      { kind: "meld", id, group: target },
      [
        { key: into.key, members: target },
        { key: from.key, members: rest },
      ],
      `${labelOf(id)} joined ${labelOf(into.members[0] ?? "")}. ${target.length} tags.`,
    );
    return true;
  };

  const pullFree = (id: string) => {
    const from = itemOf(id);
    if (!from || from.members.length < 2) return false;
    const rest = from.members.filter((m) => m !== id);
    const fresh = `${id}~${minted + 1}`;
    setMinted((n) => n + 1);
    const next: string[][] = [];
    for (const it of items) {
      if (it.key === from.key) next.push(rest, [id]);
      else next.push(it.members);
    }
    commit(
      next,
      { kind: "free", id, group: [id] },
      [
        { key: from.key, members: rest },
        { key: fresh, members: [id] },
      ],
      `${labelOf(id)} pulled free.`,
    );
    return true;
  };

  /** Lifts a tag's face out of its slot into the floating layer. */
  const lift = (id: string): Session | null => {
    const box = boxRef.current;
    const face = faceEls.current.get(id);
    const it = itemOf(id);
    if (!box || !face || !it) return null;
    halt();
    retracting.current?.stop();
    const r = rectIn(face, box);
    const member = it.members.length > 1;
    const ownFill = fillFor(it);
    const s: Session = {
      id,
      member,
      ownKey: it.key,
      ownFill,
      w: r.w,
      h: r.h,
      start: { x: r.x, y: r.y },
      torn: false,
      popAt: null,
      link: member ? { key: it.key, fill: ownFill, reach: 2 * tear } : null,
      mode: "drag",
      chasing: false,
      stretched: false,
      touched: false,
      landing: "none",
      size: 1,
      armed: null,
      full: null,
    };
    session.current = s;
    retract.set(1);
    fx.set(r2(r.x));
    fy.set(r2(r.y));
    return s;
  };

  /** Puts the face somewhere, 1:1 — or, just after a tear, springs to it. */
  const place = (s: Session, x: number, y: number) => {
    if (s.chasing && motionSafe) {
      if (Math.abs(fx.get() - x) + Math.abs(fy.get() - y) > 1) {
        halt();
        running.current = [
          animate(fx, x, { ...springs.flick, velocity: fx.getVelocity() }),
          animate(fy, y, { ...springs.flick, velocity: fy.getVelocity() }),
        ];
        return;
      }
      s.chasing = false;
    }
    halt();
    fx.set(r2(x));
    fy.set(r2(y));
  };

  /** The nearest item within reach of the face, and whether it has room. */
  const arm = (s: Session, face: Rect) => {
    const box = boxRef.current;
    if (!box) return;
    let best: { key: string; gap: number } | null = null;
    for (const it of items) {
      if (it.key === s.ownKey && !s.torn) continue;
      const el = itemEls.current.get(it.key);
      if (!el) continue;
      const { gap } = nearest(face, rectIn(el, box));
      if (gap < reach && (!best || gap < best.gap)) best = { key: it.key, gap };
    }
    const bestKey = best?.key;
    const it = bestKey ? items.find((i) => i.key === bestKey) : undefined;
    const size = it
      ? it.members.length - (it.key === s.ownKey && s.torn ? 1 : 0)
      : 0;
    const full = it && size >= cap ? it.key : null;
    const armed = it && !full ? it.key : null;
    s.link =
      armed && it
        ? {
            key: armed,
            fill: it.key === s.ownKey ? s.ownFill : fillFor(it),
            reach,
          }
        : null;
    if (full !== s.full) {
      s.full = full;
      setDrag((d) => (d ? { ...d, full } : d));
    }
    s.armed = armed;
  };

  const tearNow = (s: Session, face: Rect, own: Rect) => {
    const n = nearest(face, own);
    s.torn = true;
    s.chasing = true;
    s.link = null;
    s.popAt = { tip: n.a, home: n.b };
    audio.play("pop", {
      pitch: r2(lerp(1.3, 0.85, g)),
      gain: 0.6,
      pan: panAt(face.x + face.w / 2),
    });
    retracting.current?.stop();
    if (motionSafe) {
      retract.set(0);
      retracting.current = animate(retract, 1, springs.flick);
    } else {
      retract.set(1);
    }
    setDrag((d) => (d ? { ...d, torn: true } : d));
  };

  const begin = (id: string) => {
    if (disabled || flying || picked) return;
    if (!lift(id)) return;
    setDrag({ id, torn: false, full: null });
  };

  const move = ({ offset }: DragInfo) => {
    const s = session.current;
    const box = boxRef.current;
    if (!s || s.mode !== "drag" || !box) return;
    let x = s.start.x + offset.x;
    let y = s.start.y + offset.y;
    if (s.member && !s.torn) {
      const el = itemEls.current.get(s.ownKey);
      const own = el ? rectIn(el, box) : null;
      const n = own ? nearest({ x, y, w: s.w, h: s.h }, own) : null;
      if (own && n && n.gap > 0) {
        if (n.gap > 4) s.stretched = true;
        // Out of the pill, the neck holds it back harder the further it
        // goes, until it gives: at twice `tear` it pops.
        const limit = 2 * tear;
        if (n.gap >= limit) {
          tearNow(s, { x, y, w: s.w, h: s.h }, own);
        } else if (motionSafe) {
          const shown = n.gap - (n.gap * n.gap) / (2 * limit);
          const back = n.gap - shown;
          x -= ((n.a.x - n.b.x) / n.d) * back;
          y -= ((n.a.y - n.b.y) / n.d) * back;
        }
      }
    }
    // Half the face's size as the band, so a pull past the edge never takes
    // more than half the tag out of view.
    x = rubberClamp(x, 0, box.clientWidth - s.w, s.h / 2);
    y = rubberClamp(y, 0, box.clientHeight - s.h, s.h / 2);
    if (!s.member || s.torn) arm(s, { x, y, w: s.w, h: s.h });
    place(s, x, y);
  };

  /** The face flies to its slot; the flight effect below measures where. */
  const fly = (s: Session, velocity: Point, how: ReturnType<typeof spring>) => {
    s.mode = "flight";
    s.touched = false;
    setDrag(null);
    setFlying({ id: s.id, velocity, spring: how });
  };

  const land = () => {
    const s = session.current;
    if (s && s.landing === "reseat") gloop(2, fx.get() + s.w / 2, true);
    if (s && s.landing === "meld" && !s.touched && seated(s)) {
      gloop(s.size, fx.get() + s.w / 2);
    }
    session.current = null;
    halt();
    neck.set("");
    setFlying(null);
  };

  /** Ends a drag or a keyboard drop: `to` is what the drop means. */
  const drop = (to: "meld" | "free" | "home", velocity: Point) => {
    const s = session.current;
    if (!s) return;
    const aim = s.link ? items.find((it) => it.key === s.link?.key) : undefined;
    if (to === "meld" && s.link && meldInto(s.id, s.link.key)) {
      s.landing = "meld";
      s.size = (aim?.members.length ?? 1) + 1;
    } else if (to === "free" && pullFree(s.id)) {
      s.landing = "none";
      s.link = null;
    } else {
      // Home. A member that never tore is still joined to its group: it
      // springs back in on the landing spring and re-seats with a soft gloop.
      if (s.torn) {
        s.torn = false;
        s.popAt = null;
        retract.set(1);
      }
      s.landing = s.member && s.stretched ? "reseat" : "none";
      s.link = s.member
        ? { key: s.ownKey, fill: s.ownFill, reach: Infinity }
        : null;
    }
    fly(
      s,
      velocity,
      s.landing === "reseat" ? { ...springs.recoil, mass: 1 } : settle,
    );
  };

  const end = ({ velocity }: DragInfo) => {
    const s = session.current;
    if (!s || s.mode !== "drag") return;
    if (s.member && !s.torn) drop("home", velocity);
    else if (s.armed) drop("meld", velocity);
    else if (s.torn) drop("free", velocity);
    else drop("home", velocity);
  };

  const cancel = () => {
    const s = session.current;
    if (!s || s.mode !== "drag") return;
    drop("home", { x: 0, y: 0 });
  };

  // The flight starts once the drop has been committed and laid out, so it
  // can aim at the slot the tag actually has now — measured from layout, not
  // from a box still gliding into place.
  const latest = React.useRef({ land, halt });
  React.useEffect(() => {
    latest.current = { land, halt };
  });
  React.useLayoutEffect(() => {
    if (!flying) return;
    const box = boxRef.current;
    const face = faceEls.current.get(flying.id);
    if (!box || !face || !session.current) {
      queueMicrotask(() => latest.current.land());
      return;
    }
    const to = layoutIn(face, box);
    latest.current.halt();
    if (!motionSafe) {
      fx.set(to.x);
      fy.set(to.y);
      queueMicrotask(() => latest.current.land());
      return;
    }
    let left = 2;
    const done = () => {
      left -= 1;
      if (left === 0) latest.current.land();
    };
    running.current = [
      animate(fx, to.x, {
        ...flying.spring,
        velocity: flying.velocity.x,
        onComplete: done,
      }),
      animate(fy, to.y, {
        ...flying.spring,
        velocity: flying.velocity.y,
        onComplete: done,
      }),
    ];
  }, [flying, fx, fy, motionSafe]);

  const cancelRef = React.useRef(cancel);
  React.useEffect(() => {
    cancelRef.current = cancel;
  });
  // Escape during a pointer drag puts the tag back, and is claimed so the
  // page (or a surrounding dialog) does not also act on it.
  React.useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drag]);

  const api = React.useRef({ begin, move, end, cancel });
  React.useEffect(() => {
    api.current = { begin, move, end, cancel };
  });

  // Keyboard: pick up, choose, drop.
  const choicesFor = (id: string): Choice[] => {
    const it = itemOf(id);
    if (!it) return [];
    const out: Choice[] = it.members.length > 1 ? [{ kind: "free" }] : [];
    const at = items.findIndex((i) => i.key === it.key);
    // Start with the neighbour to the right, then around.
    for (let k = 1; k < items.length; k += 1) {
      const other = items[(at + k) % items.length];
      if (other && other.key !== it.key)
        out.push({ kind: "meld", key: other.key });
    }
    return out;
  };

  const describe = (choice: Choice | undefined) => {
    if (!choice) return "Nowhere to go.";
    if (choice.kind === "free") return "On its own.";
    const it = items.find((i) => i.key === choice.key);
    if (!it) return "";
    if (it.members.length >= cap) {
      return `${labelOf(it.members[0] ?? "")} group is full, ${it.members.length} tags.`;
    }
    return `Over ${nameOfItem(it)}.`;
  };

  const keyDrop = (id: string, choice: Choice | undefined) => {
    if (!choice) return;
    if (choice.kind === "meld") {
      const it = items.find((i) => i.key === choice.key);
      if (!it || it.members.length >= cap) {
        say(describe(choice));
        return;
      }
    }
    choose(null);
    pendingFocus.current = id;
    const s = lift(id);
    if (!s) return;
    if (choice.kind === "free") {
      audio.play("pop", {
        pitch: r2(lerp(1.3, 0.85, g)),
        gain: 0.6,
        pan: panAt(s.start.x + s.w / 2),
      });
      s.link = null;
      drop("free", { x: 0, y: 0 });
      return;
    }
    const it = items.find((i) => i.key === choice.key);
    s.link = it ? { key: choice.key, fill: fillFor(it), reach } : null;
    s.armed = choice.key;
    drop("meld", { x: 0, y: 0 });
  };

  const onKey = (id: string, event: React.KeyboardEvent) => {
    if (disabled) return;
    if (picked && picked.id === id) {
      const list = choicesFor(id);
      const step: Record<string, number> = {
        ArrowRight: 1,
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowUp: -1,
      };
      if (event.key in step || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        if (!list.length) return;
        const choice =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : (picked.choice + (step[event.key] ?? 0) + list.length) %
                list.length;
        choose({ id, choice });
        say(describe(list[choice]));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        choose(null);
        say(`${labelOf(id)} put back.`);
      }
      return;
    }
    const at = order.indexOf(id);
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? at + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? at - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? order.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    const next = order[clamp(to, 0, order.length - 1)];
    if (next === undefined) return;
    setFocusId(next);
    buttonEls.current.get(next)?.focus();
  };

  const onPress = (id: string) => {
    if (disabled || flying || drag) return;
    if (picked && picked.id === id) {
      keyDrop(id, choicesFor(id)[picked.choice]);
      return;
    }
    const list = choicesFor(id);
    choose({ id, choice: 0 });
    say(`Picked up ${labelOf(id)}. ${describe(list[0])}`);
  };

  const pickedChoice = picked
    ? choicesFor(picked.id)[picked.choice]
    : undefined;
  const firstId = order[0];
  const tabStop =
    focusId !== null && order.includes(focusId) ? focusId : firstId;
  const floating = drag?.id ?? flying?.id ?? null;
  const layoutTransition = motionSafe ? springs.glide : { duration: 0 };

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "relative w-full overflow-clip rounded-3 border border-hairline bg-card p-3 [contain:paint]",
        disabled && "opacity-50",
        className,
      )}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      >
        <motion.path d={neck} style={{ fill: neckFill }} />
      </svg>

      <ul className="relative flex flex-wrap items-center gap-2">
        {items.map((it) => {
          const tornHere = drag?.torn && it.members.includes(drag.id) ? 1 : 0;
          const count = it.members.length - tornHere;
          const grouped = count > 1;
          const fill = fillOf(it.key, tint);
          const chosen =
            pickedChoice?.kind === "meld" && pickedChoice.key === it.key;
          const full =
            drag?.full === it.key || (chosen && it.members.length >= cap);
          return (
            <motion.li
              key={it.key}
              ref={(el: HTMLLIElement | null) => {
                if (el) itemEls.current.set(it.key, el);
                else itemEls.current.delete(it.key);
              }}
              layout
              transition={{ layout: layoutTransition }}
              className={cn(
                "relative flex items-center transition-[background-color,outline-color]",
                grouped && "gap-0.5 p-1",
                (chosen || full) && "outline-2 outline-offset-2 outline-dashed",
                full
                  ? "outline-warn"
                  : chosen
                    ? "outline-cobalt-bright"
                    : "outline-transparent",
              )}
              style={{
                borderRadius: 18,
                backgroundColor: grouped ? fill : "transparent",
              }}
            >
              {grouped ? (
                <motion.span
                  layout="position"
                  aria-hidden
                  className="relative flex size-5 shrink-0 items-center justify-center overflow-clip rounded-full bg-card/70 font-mono text-[10px] text-ink-2 tabular-nums"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={count}
                      initial={
                        motionSafe ? { y: 8, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      exit={
                        motionSafe
                          ? {
                              y: -8,
                              opacity: 0,
                              transition: {
                                duration: durations.fast,
                                ease: easings.exit,
                              },
                            }
                          : {
                              opacity: 0,
                              transition: { duration: durations.fast },
                            }
                      }
                      transition={
                        motionSafe ? springs.snap : { duration: durations.fast }
                      }
                    >
                      {count}
                    </motion.span>
                  </AnimatePresence>
                </motion.span>
              ) : null}
              {it.members.map((id) => {
                const others = it.members.filter((m) => m !== id);
                const name =
                  others.length > 0
                    ? `${labelOf(id)}, grouped with ${joinList(others.map(labelOf))}`
                    : labelOf(id);
                const dragged = drag?.id === id;
                const collapsed = dragged && drag.torn;
                const hidden = floating === id;
                return (
                  <TagButton
                    key={id}
                    id={id}
                    label={labelOf(id)}
                    name={name}
                    hintId={hintId}
                    tabbable={tabStop === id}
                    disabled={disabled}
                    grouped={grouped}
                    ghost={
                      hidden && dragged && !it.members.some((m) => m !== id)
                    }
                    hidden={hidden}
                    collapsed={collapsed}
                    lifted={picked?.id === id}
                    motionSafe={motionSafe}
                    api={api}
                    registerButton={(el) => {
                      if (el) buttonEls.current.set(id, el);
                      else buttonEls.current.delete(id);
                    }}
                    registerFace={(el) => {
                      if (el) faceEls.current.set(id, el);
                      else faceEls.current.delete(id);
                    }}
                    onKeyDown={(event) => onKey(id, event)}
                    onPress={() => onPress(id)}
                    onFocus={() => setFocusId(id)}
                    onBlur={() => {
                      if (pickedRef.current?.id === id) {
                        choose(null);
                        say(`${labelOf(id)} put back.`);
                      }
                    }}
                  />
                );
              })}
            </motion.li>
          );
        })}
      </ul>

      {floating !== null ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 flex h-7 items-center rounded-full px-3 text-sm whitespace-nowrap text-foreground shadow-md"
          style={{ left: fx, top: fy, backgroundColor: faceFill }}
        >
          {labelOf(floating)}
        </motion.span>
      ) : null}

      <span id={hintId} className="sr-only">
        Drag onto another tag to group them, or out of a group to free it. Or
        press Enter to pick it up, Left and Right to choose where it goes, and
        Enter to drop it.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said.group === undefined ||
        groups.some(
          (grp) =>
            grp.length === said.group?.length &&
            grp.every((id, i) => id === said.group?.[i]),
        )
          ? said.text
          : ""}
      </span>
    </div>
  );
}

type TagApi = {
  begin: (id: string) => void;
  move: (info: DragInfo) => void;
  end: (info: DragInfo) => void;
  cancel: () => void;
};

function TagButton({
  id,
  label,
  name,
  hintId,
  tabbable,
  disabled,
  grouped,
  ghost,
  hidden,
  collapsed,
  lifted,
  motionSafe,
  api,
  registerButton,
  registerFace,
  onKeyDown,
  onPress,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  name: string;
  hintId: string;
  tabbable: boolean;
  disabled: boolean;
  grouped: boolean;
  ghost: boolean;
  hidden: boolean;
  collapsed: boolean;
  lifted: boolean;
  motionSafe: boolean;
  api: React.RefObject<TagApi>;
  registerButton: (el: HTMLButtonElement | null) => void;
  registerFace: (el: HTMLElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPress: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const drag = useDrag({
    disabled,
    onStart: () => api.current.begin(id),
    onMove: (info) => api.current.move(info),
    onEnd: (info) => api.current.end(info),
    onCancel: () => api.current.cancel(),
  });

  return (
    <button
      ref={registerButton}
      type="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={name}
      aria-describedby={hintId}
      disabled={disabled}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // Pointer presses belong to the drag. A click with no pointer
        // behind it — Enter, Space, assistive technology — picks up and drops.
        if (event.detail === 0) onPress();
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      {...drag}
      className={cn(
        "relative flex shrink-0 cursor-grab touch-none rounded-full outline-none select-none active:cursor-grabbing",
        "transition-[translate,box-shadow] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:cursor-default",
        lifted && "-translate-y-0.5 shadow-md ring-2 ring-cobalt-bright",
      )}
    >
      <motion.span
        initial={false}
        animate={{ width: collapsed ? 0 : "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className={cn("flex rounded-full", collapsed && "overflow-clip")}
      >
        <motion.span
          ref={registerFace}
          layout="position"
          className={cn(
            "flex h-7 items-center rounded-full px-3 text-sm whitespace-nowrap text-foreground",
            grouped && "hover:bg-card/50",
          )}
          style={{
            backgroundColor: grouped ? "transparent" : SINGLE,
            opacity: ghost ? 0.3 : hidden ? 0 : 1,
          }}
        >
          {label}
        </motion.span>
      </motion.span>
    </button>
  );
}
