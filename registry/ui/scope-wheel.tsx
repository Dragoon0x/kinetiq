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
import {
  ArrowUp,
  Building2,
  ChevronDown,
  FileText,
  FolderKanban,
  Globe,
  LoaderCircle,
  Lock,
  type LucideIcon,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ScopeWheelArea = "page" | "section" | "workspace" | "web";

export type ScopeWheelScope = {
  id: string;
  /** "This project". */
  label: string;
  /** "Project" — the pill's label on a phone. */
  short: string;
  /** What it searches, drawn on the map. */
  area: ScopeWheelArea;
  /** Searchable items in it. Omit for an uncounted scope like the web. */
  count?: number;
  /** What the count counts. @default "items" */
  unit?: string;
  /** The field's placeholder while this scope is chosen. */
  placeholder: string;
  /** Out of reach for this user: shown with a lock, never chosen. */
  locked?: boolean;
  /** Why it is locked, in a sentence. */
  lockedNote?: string;
};

export type ScopeWheelPage = { id: string; label: string };
export type ScopeWheelSection = {
  id: string;
  label: string;
  pages: ScopeWheelPage[];
};
export type ScopeWheelMap = {
  name: string;
  sections: ScopeWheelSection[];
  /** Where the user is: the section and page the near scopes search. */
  here: { section: string; page: string };
};

export type ScopeWheelMapStyle = "blocks" | "wire" | "dots";
export type ScopeWheelStatus = "ready" | "counting" | "error";

export type ScopeWheelProps = {
  /** The scopes on the wheel, nearest first (Cmd or Ctrl with 1–4 picks by position). @default defaultScopeWheelScopes */
  scopes?: ScopeWheelScope[];
  /** The workspace the map draws. @default defaultScopeWheelMap */
  map?: ScopeWheelMap;
  /** Controlled scope id. */
  scope?: string;
  /** Initial scope when uncontrolled. @default "project" */
  defaultScope?: string;
  /** Fires from the turn, key or menu that changed the scope. */
  onScopeChange?: (id: string) => void;
  /** Controlled text. */
  draft?: string;
  /** Initial text when uncontrolled. @default "" */
  defaultDraft?: string;
  /** Fires from every edit. */
  onDraftChange?: (draft: string) => void;
  /** Enter or Send: the question and where to look. */
  onSubmit?: (ask: { text: string; scope: ScopeWheelScope }) => void;
  /** A locked scope was reached for. */
  onLockedPick?: (scope: ScopeWheelScope) => void;
  /** How notchy the wheel is, 0 to 1: 0 rolls freely and snaps on release, 1 clicks from detent to detent as you drag. @default 0.6 */
  detents?: number;
  /** The map's drawing: filled tiles, a hairline blueprint, or dot-matrix tiles. @default "blocks" */
  mapStyle?: ScopeWheelMapStyle;
  /** Outline, notches, count and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Draw the workspace map above the field (always hidden on a phone). @default true */
  showMap?: boolean;
  /** Whether the counts are known: counting shows a spinner, error says so. @default "ready" */
  status?: ScopeWheelStatus;
  /** An answer is being written: Send holds. @default false */
  busy?: boolean;
  /** The field's accessible name. @default "Ask Fieldline" */
  label?: string;
  /** Nothing can be typed, turned or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultScopeWheelScopes: ScopeWheelScope[] = [
  {
    id: "page",
    label: "This page",
    short: "Page",
    area: "page",
    count: 38,
    unit: "blocks",
    placeholder: "Ask about Site notes…",
  },
  {
    id: "project",
    label: "This project",
    short: "Project",
    area: "section",
    count: 1284,
    placeholder: "Ask about Larch Street…",
  },
  {
    id: "workspace",
    label: "The workspace",
    short: "Workspace",
    area: "workspace",
    count: 23906,
    placeholder: "Ask across all of Fieldline…",
  },
  {
    id: "web",
    label: "The open web",
    short: "Web",
    area: "web",
    placeholder: "Search the open web…",
    locked: true,
    lockedNote:
      "Open web search is off for Fieldline. An admin can turn it on.",
  },
];

const pages = (...labels: string[]): ScopeWheelPage[] =>
  labels.map((label) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
  }));

export const defaultScopeWheelMap: ScopeWheelMap = {
  name: "Fieldline",
  sections: [
    {
      id: "larch",
      label: "Larch Street",
      pages: pages(
        "Site notes",
        "Snag list",
        "Drawings",
        "Budget",
        "Crew rota",
        "Permits",
      ),
    },
    {
      id: "mill",
      label: "Mill Road",
      pages: pages("Site notes", "Snag list", "Drawings", "Budget", "Handover"),
    },
    {
      id: "harbour",
      label: "Harbour Yard",
      pages: pages("Survey", "Drawings", "Budget", "Permits"),
    },
    {
      id: "handbook",
      label: "Handbook",
      pages: pages("Safety", "Onboarding", "Policies"),
    },
    {
      id: "suppliers",
      label: "Suppliers",
      pages: pages("Concrete", "Steel", "Scaffold", "Plant hire"),
    },
  ],
  here: { section: "larch", page: "site-notes" },
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ICONS: Record<ScopeWheelArea, LucideIcon> = {
  page: FileText,
  section: FolderKanban,
  workspace: Building2,
  web: Globe,
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clampNum = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Thousands by hand: locale formatting differs between server and browser. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Degrees between faces on the drum and its radius. */
const STEP = 42;
const RADIUS = 28;
/** The drum's surface speed at the window: a drag of this many pixels turns it one face, 1:1. */
const PX_PER_STEP = Math.round(RADIUS * ((STEP * Math.PI) / 180) * 10) / 10;
const FACE_H = 26;
const WHEEL_H = 72;

type Rect = { x: number; y: number; w: number; h: number };

/** The map's geometry, in percent of its box, so it renders the same everywhere. */
function layoutMap(map: ScopeWheelMap) {
  const ws: Rect = { x: 3, y: 12, w: 94, h: 78 };
  const gap = 1.4;
  const total = map.sections.reduce(
    (n, s) => n + Math.max(1, s.pages.length),
    0,
  );
  const usable = ws.w - 2.4 - gap * (map.sections.length - 1);
  let x = ws.x + 1.2;
  const sections = map.sections.map((section) => {
    const w = (usable * Math.max(1, section.pages.length)) / Math.max(1, total);
    const rect: Rect = { x, y: ws.y + 6, w, h: ws.h - 12 };
    x += w + gap;
    const rows = 2;
    const cols = Math.max(1, Math.ceil(section.pages.length / rows));
    const tg = 0.9;
    const top = rect.y + rect.h * 0.34;
    const tileW = (rect.w - 2 - tg * (cols - 1)) / cols;
    const tileH = (rect.y + rect.h - 4 - top - 6 * (rows - 1)) / rows;
    const tiles = section.pages.map((page, i) => ({
      page,
      rect: {
        x: rect.x + 1 + (i % cols) * (tileW + tg),
        y: top + Math.floor(i / cols) * (tileH + 6),
        w: tileW,
        h: tileH,
      },
    }));
    return { section, rect, tiles };
  });
  return { ws, sections };
}

function areaRect(
  area: ScopeWheelArea,
  geo: ReturnType<typeof layoutMap>,
  here: ScopeWheelMap["here"],
): Rect {
  const sec = geo.sections.find((s) => s.section.id === here.section);
  if (area === "page") {
    const tile = sec?.tiles.find((t) => t.page.id === here.page);
    if (tile) return tile.rect;
  }
  if ((area === "page" || area === "section") && sec) return sec.rect;
  if (area === "web") return { x: 0.8, y: 5, w: 98.4, h: 90 };
  return geo.ws;
}

const pct = (v: number) => `${r3(v)}%`;

/* ----------------------------------------------------------------------- */
/*                               Drum parts                                 */
/* ----------------------------------------------------------------------- */

function DrumFace({
  pos,
  index,
  scope,
  checked,
  tabbable,
  disabled,
  onPick,
  onKey,
}: {
  pos: MotionValue<number>;
  index: number;
  scope: ScopeWheelScope;
  checked: boolean;
  tabbable: boolean;
  disabled: boolean;
  onPick: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  // Each face sits on the drum at its own angle; turning the drum is one
  // number, and every face reads its height, squash and shade from it.
  const y = useTransform(pos, (p) => {
    const t = clampNum((index - p) * STEP, -90, 90);
    return r2(RADIUS * Math.sin(rad(t)));
  });
  const scaleY = useTransform(pos, (p) =>
    r3(Math.max(0, Math.cos(rad(clampNum((index - p) * STEP, -90, 90))))),
  );
  const opacity = useTransform(pos, (p) => {
    const t = (index - p) * STEP;
    return Math.abs(t) >= 88 ? 0 : r3(Math.pow(Math.cos(rad(t)), 1.6));
  });
  const Icon = ICONS[scope.area];
  const count =
    scope.count === undefined
      ? ""
      : `, ${grouped(scope.count)} ${scope.unit ?? "items"}`;

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={scope.locked || disabled || undefined}
      aria-label={`${scope.label}${count}${scope.locked ? ", locked" : ""}`}
      aria-keyshortcuts={
        index < 4 ? `Control+${index + 1} Meta+${index + 1}` : undefined
      }
      tabIndex={tabbable ? 0 : -1}
      onClick={onPick}
      onKeyDown={onKey}
      className={cn(
        "absolute inset-x-1 top-1/2 flex items-center justify-center rounded-2 transition-colors",
        checked ? "text-(--sw-accent)" : "text-ink-2",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{ height: FACE_H, marginTop: -FACE_H / 2, y, scaleY, opacity }}
    >
      <span className="relative inline-flex">
        <Icon aria-hidden className="size-4" />
        {scope.locked ? (
          <Lock
            aria-hidden
            className="absolute -right-1.5 -bottom-1 size-2.5 rounded-full bg-surface-2 text-ink-3"
          />
        ) : null}
      </span>
    </motion.button>
  );
}

/** The knurled rim: one path, rebuilt from the drum's turn, crisp at any DPR. */
function Ridges({ pos }: { pos: MotionValue<number> }) {
  const d = useTransform(pos, (p) => {
    const parts: string[] = [];
    const ridgeStep = 15;
    for (let k = 0; k < 24; k += 1) {
      let phi = (k * ridgeStep - p * STEP) % 360;
      if (phi > 180) phi -= 360;
      if (phi < -180) phi += 360;
      if (Math.cos(rad(phi)) < 0.12) continue;
      const y = r2(WHEEL_H / 2 + (RADIUS + 4) * Math.sin(rad(phi)));
      parts.push(`M1 ${y}H6M38 ${y}H43`);
    }
    return parts.join("");
  });
  return (
    <svg
      aria-hidden
      viewBox={`0 0 44 ${WHEEL_H}`}
      className="pointer-events-none absolute inset-0 size-full"
      preserveAspectRatio="none"
    >
      <motion.path
        d={d}
        className="stroke-[color-mix(in_oklab,var(--foreground)_32%,transparent)]"
        strokeWidth={1}
        shapeRendering="crispEdges"
        fill="none"
      />
    </svg>
  );
}

/** A count whose digits roll to the new value on snap. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = grouped(value);
  const chars = text.split("");
  return (
    <span className="inline-flex h-4 overflow-hidden font-mono text-[11px] leading-4 tabular-nums">
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (ch === ",")
          return (
            <span key={`c${fromRight}`} className="leading-4">
              ,
            </span>
          );
        const digit = Number(ch);
        return (
          <span
            key={`d${fromRight}`}
            className="relative inline-block h-4 w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: -digit * 16 }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: (chars.length - i) * 0.025 }
                  : { duration: 0 }
              }
            >
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className="block h-4 leading-4">
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

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A composer with a thumbwheel at its left edge choosing where the assistant
 * looks — this page, this project, the workspace, the open web. The wheel is
 * a drum seen edge-on: drag it and it rolls 1:1 under the finger (shaped
 * toward the nearest detent by `detents`), release and it settles into the
 * detent the throw was heading for on `springs.snap`, taking the release
 * velocity. As the scope lands, an outline of the searched area sweeps across
 * a mini map of the workspace on `springs.glide` with a scan line running
 * over it, the count of searchable items rolls digit by digit on snap, and
 * the placeholder rewrites itself from the shared prefix.
 *
 * Locked scopes show a lock: the wheel rolls past them and settles back with
 * a note. The wheel is a radiogroup (arrows turn it, Home and End jump, Cmd
 * or Ctrl with 1–4 picks from the field); on a phone the map hides and the
 * wheel becomes a pill that opens a menu. Under reduced motion the drum and
 * the outline jump, the digits and placeholder swap whole.
 */
export function ScopeWheel({
  scopes = defaultScopeWheelScopes,
  map = defaultScopeWheelMap,
  scope: scopeProp,
  defaultScope = "project",
  onScopeChange,
  draft: draftProp,
  defaultDraft = "",
  onDraftChange,
  onSubmit,
  onLockedPick,
  detents = 0.6,
  mapStyle = "blocks",
  accent = "var(--accent-bright)",
  showMap = true,
  status = "ready",
  busy = false,
  label = "Ask Fieldline",
  disabled = false,
  className,
}: ScopeWheelProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  /* ------------------------------- values ------------------------------- */

  const [ownScope, setOwnScope] = React.useState(defaultScope);
  const scopeId = scopeProp ?? ownScope;
  const currentIndex = Math.max(
    0,
    scopes.findIndex((s) => s.id === scopeId),
  );
  const current = scopes[currentIndex] ?? defaultScopeWheelScopes[1]!;

  const [ownDraft, setOwnDraft] = React.useState(defaultDraft);
  const draft = draftProp ?? ownDraft;

  const [announcement, setAnnouncement] = React.useState("");
  const [lockedMsg, setLockedMsg] = React.useState<string | null>(null);

  const reachable = scopes
    .map((s, i) => (s.locked ? -1 : i))
    .filter((i) => i >= 0);

  const say = (s: ScopeWheelScope) =>
    `${s.label}.${s.count !== undefined ? ` Searching ${grouped(s.count)} ${s.unit ?? "items"}.` : ""}`;

  const choose = (index: number) => {
    const target = scopes[index];
    if (!target || disabled) return false;
    if (target.locked) {
      const note = target.lockedNote ?? `${target.label} is locked.`;
      setLockedMsg(note);
      setAnnouncement(note);
      onLockedPick?.(target);
      return false;
    }
    setLockedMsg(null);
    if (target.id !== current.id) {
      if (scopeProp === undefined) setOwnScope(target.id);
      onScopeChange?.(target.id);
      setAnnouncement(say(target));
    }
    return true;
  };

  /* -------------------------------- drum -------------------------------- */

  const pos = useMotionValue(currentIndex);
  const spin = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const grabbed = React.useRef(0);

  const spinTo = React.useCallback(
    (index: number, velocity = 0) => {
      spin.current?.stop();
      spin.current = animate(
        pos,
        index,
        motionSafe ? { ...springs.snap, velocity } : { duration: 0 },
      );
    },
    [motionSafe, pos],
  );

  // The drum follows the chosen scope, however it was chosen.
  React.useEffect(() => {
    if (dragging.current) return;
    if (Math.abs(pos.get() - currentIndex) > 0.001) spinTo(currentIndex);
  }, [currentIndex, pos, spinTo]);

  React.useEffect(() => () => spin.current?.stop(), []);

  /** The reachable detent nearest a locked one, ties going back the way it came. */
  const nearestReachable = (from: number, toward: number) => {
    let best = from;
    let bestScore = Infinity;
    for (const i of reachable) {
      const score =
        Math.abs(i - toward) * 2 + (Math.abs(i - from) > 0 ? 0 : -1);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };

  const settle = (raw: number, velocity: number) => {
    const last = scopes.length - 1;
    const projected = project(raw, velocity, 0.99);
    const target = clampNum(Math.round(projected), 0, last);
    if (scopes[target]?.locked) {
      const back = nearestReachable(currentIndex, target);
      if (back !== currentIndex) choose(back);
      // The note comes last, so it stays up after the wheel settles back.
      choose(target);
      spinTo(back, velocity);
      return;
    }
    choose(target);
    spinTo(target, velocity);
  };

  const k = 1 + 3 * clampNum(detents, 0, 1);
  const shape = (raw: number) => {
    const last = scopes.length - 1;
    if (raw < 0) return rubberband(raw, 1.2);
    if (raw > last) return last + rubberband(raw - last, 1.2);
    const base = Math.round(raw);
    const r = raw - base;
    // Notchy detents: the drum holds near a detent and gives way past the
    // middle, the harder the higher `detents` is.
    return r3(base + Math.sign(r) * 0.5 * Math.pow(Math.abs(2 * r), k));
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      spin.current?.stop();
      grabbed.current = pos.get();
    },
    // Dragging down rolls the drum's front face down, bringing the scope
    // above it into the window.
    onMove: ({ offset }) => {
      pos.set(shape(grabbed.current - offset.y / PX_PER_STEP));
    },
    onEnd: ({ offset, velocity }) => {
      dragging.current = false;
      settle(
        grabbed.current - offset.y / PX_PER_STEP,
        -velocity.y / PX_PER_STEP,
      );
    },
    onCancel: () => {
      dragging.current = false;
      spinTo(currentIndex);
    },
  });

  const step = (dir: 1 | -1, from = currentIndex) => {
    let i = from + dir;
    while (i >= 0 && i < scopes.length && scopes[i]?.locked) i += dir;
    if (i < 0 || i >= scopes.length) {
      const edge = from + dir;
      if (edge >= 0 && edge < scopes.length) {
        choose(edge);
        // A nudge toward the lock that gives back.
        spinTo(from, dir * 6);
      }
      return from;
    }
    choose(i);
    spinTo(i);
    return i;
  };

  const faceRefs = React.useRef<HTMLDivElement | null>(null);
  const focusFace = (index: number) => {
    faceRefs.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [index]?.focus({ preventScroll: true });
  };

  const onFaceKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = step(1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = step(-1);
    else if (event.key === "Home") {
      next = reachable[0] ?? currentIndex;
      choose(next);
      spinTo(next);
    } else if (event.key === "End") {
      next = reachable[reachable.length - 1] ?? currentIndex;
      choose(next);
      spinTo(next);
    } else return;
    event.preventDefault();
    focusFace(next);
  };

  // A mouse wheel over the drum turns it a detent per notch; at either end
  // it lets the page scroll on.
  const housingRef = React.useRef<HTMLDivElement | null>(null);
  const live = React.useRef({ step, currentIndex, scopes, disabled });
  React.useEffect(() => {
    live.current = { step, currentIndex, scopes, disabled };
  });
  React.useEffect(() => {
    const node = housingRef.current;
    if (!node) return;
    let acc = 0;
    const onWheel = (event: WheelEvent) => {
      const L = live.current;
      if (L.disabled) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      acc += event.deltaY * unit;
      const dir = acc > 0 ? 1 : -1;
      const edge = L.currentIndex + dir;
      if (edge < 0 || edge >= L.scopes.length) {
        acc = 0;
        return;
      }
      event.preventDefault();
      if (Math.abs(acc) >= 36) {
        acc = 0;
        L.step(dir as 1 | -1);
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  /* ----------------------------- placeholder ---------------------------- */

  const target = current.placeholder;
  const [typed, setTyped] = React.useState(target);
  React.useEffect(() => {
    if (!motionSafe) return;
    const t = window.setInterval(() => {
      setTyped((now) => {
        if (now === target) return now;
        let common = 0;
        while (
          common < now.length &&
          common < target.length &&
          now[common] === target[common]
        )
          common += 1;
        // Erase back to the shared prefix, then type the new ending.
        return now.length > common
          ? now.slice(0, Math.max(common, now.length - 2))
          : target.slice(0, now.length + 1);
      });
    }, 16);
    return () => window.clearInterval(t);
  }, [target, motionSafe]);
  const shownPlaceholder = motionSafe ? typed : target;

  /* ------------------------------- sending ------------------------------ */

  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const send = () => {
    if (disabled || busy) return;
    const text = draft.trim();
    if (!text) {
      setAnnouncement("Write a question first.");
      fieldRef.current?.focus();
      return;
    }
    onSubmit?.({ text, scope: current });
    if (draftProp === undefined) setOwnDraft("");
    onDraftChange?.("");
    setAnnouncement(`Asked ${current.label.toLowerCase()}.`);
  };

  const onRootKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1 || n > Math.min(4, scopes.length)) return;
    event.preventDefault();
    if (choose(n - 1)) spinTo(n - 1);
  };

  /* -------------------------------- menu -------------------------------- */

  const [menuOpen, setMenuOpen] = React.useState(false);
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitemradio"]',
    );
    items?.[currentIndex]?.focus({ preventScroll: true });
    // Focus lands on the chosen scope when the menu opens, not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    pillRef.current?.focus({ preventScroll: true });
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      event.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown" || event.key === "ArrowRight") go(at + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") setMenuOpen(false);
  };

  /* -------------------------------- map --------------------------------- */

  const geo = layoutMap(map);
  const area = areaRect(current.area, geo, map.here);
  const isWeb = current.area === "web";
  const tileClass =
    mapStyle === "wire"
      ? "border border-[color-mix(in_oklab,var(--foreground)_22%,transparent)]"
      : mapStyle === "dots"
        ? "bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_34%,transparent)_0.75px,transparent_1.25px)] bg-size-[4px_4px]"
        : "bg-[color-mix(in_oklab,var(--foreground)_11%,transparent)]";

  const mapView = (
    <div
      aria-hidden
      className="relative hidden h-[84px] overflow-hidden rounded-3 border border-hairline bg-surface-1 @min-[30rem]/scope-wheel:block"
    >
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_22%,transparent)_0.75px,transparent_1.25px)] bg-size-[7px_7px]"
        initial={false}
        animate={{ opacity: isWeb ? 1 : 0.25 }}
        transition={{ duration: durations.slow, ease: easings.enter }}
      />
      <div
        className={cn(
          "absolute rounded-2 bg-card",
          mapStyle === "wire"
            ? "border border-dashed border-hairline-strong"
            : "border border-hairline",
        )}
        style={{
          left: pct(geo.ws.x),
          top: pct(geo.ws.y),
          width: pct(geo.ws.w),
          height: pct(geo.ws.h),
        }}
      />
      {geo.sections.map(({ section, rect, tiles }) => (
        <div key={section.id}>
          <span
            className={cn(
              "absolute truncate font-mono text-[9px] leading-none tracking-[0.04em] uppercase",
              section.id === map.here.section
                ? "text-foreground"
                : "text-ink-3",
            )}
            style={{
              left: pct(rect.x + 0.6),
              top: pct(rect.y + 2),
              width: pct(rect.w - 1),
            }}
          >
            {section.label}
          </span>
          {tiles.map(({ page, rect: t }) => {
            const here =
              section.id === map.here.section && page.id === map.here.page;
            return (
              <span
                key={page.id}
                className={cn(
                  "absolute rounded-1",
                  tileClass,
                  here && "bg-(--sw-wash)",
                )}
                style={{
                  left: pct(t.x),
                  top: pct(t.y),
                  width: pct(t.w),
                  height: pct(t.h),
                }}
              >
                {here ? (
                  <span className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-(--sw-accent)" />
                ) : null}
              </span>
            );
          })}
        </div>
      ))}
      <motion.div
        className="absolute"
        initial={false}
        animate={{
          left: pct(area.x),
          top: pct(area.y),
          width: pct(area.w),
          height: pct(area.h),
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <span className="absolute -inset-[3px] rounded-[7px] border-2 border-(--sw-accent) bg-(--sw-wash)" />
        {motionSafe ? (
          <span className="absolute inset-0 overflow-hidden rounded-1">
            <motion.span
              key={current.id}
              className="absolute inset-y-0 w-[2px] bg-(--sw-accent)"
              initial={{ left: "0%", opacity: 0 }}
              animate={{ left: "100%", opacity: [0, 0.9, 0] }}
              transition={{ duration: 0.6, ease: easings.move, delay: 0.2 }}
            />
          </span>
        ) : null}
      </motion.div>
      {isWeb ? (
        <motion.span
          className="absolute right-2 bottom-1.5 rounded-1 bg-card px-1 font-mono text-[9px] leading-3 tracking-[0.04em] text-(--sw-accent) uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, delay: motionSafe ? 0.2 : 0 }}
        >
          + open web
        </motion.span>
      ) : null}
    </div>
  );

  /* ------------------------------- layout ------------------------------- */

  const vars = {
    "--sw-accent": accent,
    "--sw-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--sw-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--sw-solid": `oklch(from ${accent} 0.55 c h)`,
    "--sw-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const CurrentIcon = ICONS[current.area];
  const notch = Math.round(3 + 5 * clampNum(detents, 0, 1));

  const wheel = (
    <div
      ref={(node) => {
        housingRef.current = node;
        faceRefs.current = node;
      }}
      role="radiogroup"
      aria-label="Where to look"
      aria-disabled={disabled || undefined}
      {...drag}
      className={cn(
        "relative hidden w-11 shrink-0 cursor-ns-resize touch-pan-x overflow-hidden rounded-3 border border-hairline-strong bg-surface-2 select-none @min-[30rem]/scope-wheel:block",
        disabled && "cursor-not-allowed opacity-60",
      )}
      style={{ height: WHEEL_H }}
    >
      <Ridges pos={pos} />
      {scopes.map((s, i) => (
        <DrumFace
          key={s.id}
          pos={pos}
          index={i}
          scope={s}
          checked={i === currentIndex}
          tabbable={i === currentIndex}
          disabled={disabled}
          onPick={() => {
            if (choose(i)) spinTo(i);
            else spinTo(currentIndex, (i - currentIndex) * 4);
          }}
          onKey={onFaceKey}
        />
      ))}
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,black_24%,transparent),transparent_36%,transparent_64%,color-mix(in_oklab,black_24%,transparent))]" />
      <span
        className="pointer-events-none absolute top-1/2 left-0 h-[2px] -translate-y-1/2 rounded-r-full bg-(--sw-accent)"
        style={{ width: notch }}
      />
      <span
        className="pointer-events-none absolute top-1/2 right-0 h-[2px] -translate-y-1/2 rounded-l-full bg-(--sw-accent)"
        style={{ width: notch }}
      />
    </div>
  );

  const pill = (
    <button
      ref={pillRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-controls={menuOpen ? `${uid}-menu` : undefined}
      aria-label={`Where to look: ${current.label}`}
      onClick={() => setMenuOpen((o) => !o)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setMenuOpen(true);
        }
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 self-start rounded-full border border-(--sw-line) bg-(--sw-wash) pr-2 pl-2.5 text-[12px] font-medium text-foreground @min-[30rem]/scope-wheel:hidden",
        FOCUS,
      )}
    >
      <CurrentIcon aria-hidden className="size-3.5 text-(--sw-accent)" />
      {current.short}
      <ChevronDown
        aria-hidden
        className={cn(
          "size-3 text-ink-3 transition-transform",
          menuOpen && "rotate-180",
        )}
      />
    </button>
  );

  const menu = (
    <motion.div
      className="overflow-hidden @min-[30rem]/scope-wheel:hidden"
      initial={false}
      animate={{ height: menuOpen ? "auto" : 0, opacity: menuOpen ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
    >
      {menuOpen ? (
        <div
          ref={menuRef}
          id={`${uid}-menu`}
          role="menu"
          aria-label="Where to look"
          onKeyDown={onMenuKey}
          className="grid grid-cols-2 gap-1 rounded-3 border border-hairline bg-surface-1 p-1"
        >
          {scopes.map((s, i) => {
            const Icon = ICONS[s.area];
            const on = i === currentIndex;
            return (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                aria-disabled={s.locked || undefined}
                tabIndex={-1}
                onClick={() => {
                  if (choose(i)) {
                    spinTo(i);
                    closeMenu();
                  }
                }}
                className={cn(
                  "flex h-8 min-w-0 items-center gap-1.5 rounded-2 px-2 text-left text-[12px] transition-colors",
                  on
                    ? "bg-(--sw-wash) font-medium text-foreground"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  s.locked && "text-ink-3",
                  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                <Icon aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{s.short}</span>
                {s.locked ? (
                  <Lock aria-hidden className="size-3 shrink-0" />
                ) : s.count !== undefined ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                    {s.count >= 10000
                      ? `${Math.round(s.count / 1000)}k`
                      : grouped(s.count)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </motion.div>
  );

  const countView =
    status === "counting" ? (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-3">
        <LoaderCircle aria-hidden className="size-3 motion-safe:animate-spin" />
        counting
      </span>
    ) : status === "error" ? (
      <span className="font-mono text-[11px] text-ink-3">
        count unavailable
      </span>
    ) : current.count !== undefined ? (
      <span className="inline-flex items-center gap-1 text-(--sw-accent)">
        <RollingCount value={current.count} motionSafe={motionSafe} />
        <span className="font-mono text-[11px] text-ink-3">
          {current.unit ?? "items"}
        </span>
      </span>
    ) : null;

  return (
    <section
      aria-label={`${label}, looking in ${current.label.toLowerCase()}`}
      onKeyDown={onRootKey}
      className={cn(
        "@container/scope-wheel flex w-full flex-col gap-2.5 rounded-4 border border-hairline bg-card p-3 text-foreground",
        className,
      )}
      style={vars}
    >
      {showMap ? mapView : null}
      <div
        className={cn(
          "flex items-stretch gap-2.5 rounded-3 border border-input bg-surface-0 p-1.5 transition-colors focus-within:border-(--sw-line)",
          "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
        )}
      >
        {wheel}
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
          {pill}
          <div className="relative grid">
            <span
              aria-hidden
              className="invisible max-h-[60px] overflow-hidden px-1 py-1 text-[13.5px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
            >
              {`${draft} `}
            </span>
            {draft ? null : (
              <span
                aria-hidden
                className="pointer-events-none truncate px-1 py-1 text-[13.5px] leading-5 text-ink-3 [grid-area:1/1]"
              >
                {shownPlaceholder}
                {motionSafe && shownPlaceholder !== target ? (
                  <span className="ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-(--sw-accent)" />
                ) : null}
              </span>
            )}
            <textarea
              ref={fieldRef}
              aria-label={label}
              aria-describedby={`${uid}-meta`}
              rows={2}
              value={draft}
              readOnly={disabled}
              placeholder={target}
              onChange={(event) => {
                const v = event.currentTarget.value;
                if (draftProp === undefined) setOwnDraft(v);
                onDraftChange?.(v);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
              className={cn(
                // The ring is drawn on the composer around it, not on the text.
                "block h-full w-full resize-none overflow-y-auto rounded-1 bg-transparent px-1 py-1 text-[13.5px] leading-5 text-foreground outline-none [grid-area:1/1] placeholder:text-transparent",
              )}
            />
          </div>
          <div
            id={`${uid}-meta`}
            className="flex min-w-0 items-center justify-between gap-2 px-1"
          >
            {lockedMsg ? (
              <span className="flex min-w-0 items-center gap-1 text-[11.5px] leading-4 text-warn">
                <Lock aria-hidden className="size-3 shrink-0" />
                <span className="truncate" title={lockedMsg}>
                  {lockedMsg}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4 text-ink-2">
                <CurrentIcon
                  aria-hidden
                  className="size-3 shrink-0 text-(--sw-accent)"
                />
                <span className="truncate">
                  {current.area === "page"
                    ? `${current.label} · ${map.sections.find((s) => s.id === map.here.section)?.pages.find((p) => p.id === map.here.page)?.label ?? ""}`
                    : current.area === "section"
                      ? `${current.label} · ${map.sections.find((s) => s.id === map.here.section)?.label ?? ""}`
                      : current.label}
                </span>
              </span>
            )}
            {countView}
          </div>
        </div>
        <button
          type="button"
          onClick={send}
          aria-label={
            busy ? "Writing the answer" : `Ask ${current.label.toLowerCase()}`
          }
          aria-disabled={disabled || busy || undefined}
          aria-busy={busy || undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center self-end rounded-full bg-(--sw-solid) text-(--sw-on) transition-[background-color,opacity] hover:bg-[color-mix(in_oklab,var(--sw-solid)_88%,black)]",
            (disabled || busy) && "opacity-60",
            FOCUS,
          )}
        >
          {busy ? (
            <LoaderCircle
              aria-hidden
              className="size-4 motion-safe:animate-spin"
            />
          ) : (
            <ArrowUp aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {menu}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
