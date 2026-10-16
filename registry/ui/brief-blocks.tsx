"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  GripVertical,
  LoaderCircle,
  Plus,
  SendHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type BriefBlockKind = {
  /** Unique; blocks name their kind by it. */
  id: string;
  /** The block's label, kept in the ribbon's margin: "Role". */
  label: string;
  /** What belongs in it, in a few words. */
  hint: string;
  placeholder: string;
  /** Only one of this kind per brief. */
  single?: boolean;
};

export type BriefBlock = { id: string; kind: string; text: string };

export type BriefPreset = { id: string; name: string; blocks: BriefBlock[] };

export type BriefBlockStyle = "card" | "strip" | "line";
export type BriefRibbonFont = "sans" | "serif" | "mono";
export type BriefMode = "edit" | "ribbon";
export type BriefStatus = "ready" | "sending";

export type BriefBlocksProps = {
  /** Controlled blocks, in order. */
  blocks?: BriefBlock[];
  /** Initial blocks when uncontrolled. @default defaultBriefBlocks */
  defaultBlocks?: BriefBlock[];
  /** Fires from every edit, add, remove, move and preset with the whole list. */
  onChange?: (blocks: BriefBlock[]) => void;
  /** The kinds the rail offers. @default defaultBriefKinds */
  kinds?: BriefBlockKind[];
  /** Saved starting points for the preset menu. @default defaultBriefPresets */
  presets?: BriefPreset[];
  /** Save as preset was confirmed with a name. The preset joins the menu. */
  onSavePreset?: (preset: BriefPreset) => void;
  /** Send was pressed (or Cmd/Ctrl+Enter) with every block filled and the length in bounds. */
  onSubmit?: (prompt: string, blocks: BriefBlock[]) => void;
  /** Turns blocks into the prompt that is sent. @default labelled paragraphs, "Role: …" */
  assemble?: (blocks: BriefBlock[], kinds: BriefBlockKind[]) => string;
  /** Controlled view: the block editor, or the threaded ribbon. */
  mode?: BriefMode;
  /** Initial view when uncontrolled. @default "edit" */
  defaultMode?: BriefMode;
  /** Fires from the switch that changed the view. */
  onModeChange?: (mode: BriefMode) => void;
  /** The longest prompt Send accepts, in characters. @default 1200 */
  maxLength?: number;
  /** Hold Send busy while the host sends. @default "ready" */
  status?: BriefStatus;
  /** The brief's name, in the header. @default "Waylight product brief" */
  title?: string;
  /** Filled cards, flush strips with an edge, or bare dashed outlines. @default "card" */
  blockStyle?: BriefBlockStyle;
  /** The ribbon's typeface. @default "sans" */
  ribbonFont?: BriefRibbonFont;
  /** The active block, grip lift, meter and Send: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The surface's height in px; the blocks scroll inside. @default 540 */
  height?: number;
  /** Nothing can be edited, moved or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultBriefKinds: BriefBlockKind[] = [
  {
    id: "role",
    label: "Role",
    hint: "Who should answer",
    placeholder: "You are a…",
    single: true,
  },
  {
    id: "goal",
    label: "Goal",
    hint: "What you need back",
    placeholder: "Write a…",
    single: true,
  },
  {
    id: "audience",
    label: "Audience",
    hint: "Who will read it",
    placeholder: "Written for…",
  },
  {
    id: "context",
    label: "Context",
    hint: "What it should know",
    placeholder: "The background…",
  },
  {
    id: "constraints",
    label: "Constraints",
    hint: "Limits and rules",
    placeholder: "Keep it…",
  },
  {
    id: "format",
    label: "Format",
    hint: "The shape of the answer",
    placeholder: "Use sections for…",
    single: true,
  },
  {
    id: "example",
    label: "Example",
    hint: "One good sample",
    placeholder: "Something like…",
  },
];

export const defaultBriefBlocks: BriefBlock[] = [
  {
    id: "b-role",
    kind: "role",
    text: "You are a senior product manager at Waylight, writing for the leadership team.",
  },
  {
    id: "b-goal",
    kind: "goal",
    text: "Draft a one-page brief for offline routes, so we can decide whether to build it next quarter.",
  },
  {
    id: "b-context",
    kind: "context",
    text: "Riders lose signal in tunnels and along the coast road, and 14% of last month's support tickets were about routes that would not load offline.",
  },
  {
    id: "b-constraints",
    kind: "constraints",
    text: "Keep it under 400 words. No engineering estimates; list open questions instead.",
  },
  {
    id: "b-format",
    kind: "format",
    text: "A title, a two-sentence summary, then Problem, Proposal, Risks and Open questions as short sections.",
  },
];

export const defaultBriefPresets: BriefPreset[] = [
  { id: "product", name: "Product brief", blocks: defaultBriefBlocks },
  {
    id: "triage",
    name: "Bug triage",
    blocks: [
      {
        id: "t-role",
        kind: "role",
        text: "You are the on-call engineer for the Waylight rider app.",
      },
      {
        id: "t-goal",
        kind: "goal",
        text: "Sort these crash reports by how many riders they affect, and name the likeliest cause of each.",
      },
      { id: "t-context", kind: "context", text: "" },
      {
        id: "t-format",
        kind: "format",
        text: "A table: report, riders affected, likely cause, next step.",
      },
    ],
  },
  {
    id: "release",
    name: "Release note",
    blocks: [
      {
        id: "r-role",
        kind: "role",
        text: "You write Waylight's release notes in a plain, friendly voice.",
      },
      {
        id: "r-audience",
        kind: "audience",
        text: "Riders who update the app from the store, most of them on phones.",
      },
      {
        id: "r-constraints",
        kind: "constraints",
        text: "Under 80 words. No version numbers in the first line.",
      },
      {
        id: "r-format",
        kind: "format",
        text: "One headline and three short bullets.",
      },
    ],
  },
];

/** Labelled paragraphs: the plain prompt a model reads. */
export const assembleBrief = (
  blocks: BriefBlock[],
  kinds: BriefBlockKind[],
): string =>
  blocks
    .filter((b) => b.text.trim())
    .map((b) => {
      const label = kinds.find((k) => k.id === b.kind)?.label ?? b.kind;
      return `${label}: ${b.text.trim()}`;
    })
    .join("\n\n");

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const EMPTY_PRESETS: BriefPreset[] = [];

type Phase = "edit" | "mirror" | "ribbon" | "back";

const FONT: Record<BriefRibbonFont, string> = {
  sans: "font-sans text-[14px] leading-[1.8]",
  serif: "font-serif text-[15px] leading-[1.75]",
  mono: "font-mono text-[12.5px] leading-[1.85]",
};

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A prompt built from parts. Each block — role, goal, context, constraints,
 * format — is a labelled card you fill, add from the rail and drag into
 * order: the grip follows the pointer 1:1, the other blocks glide out of its
 * way on `springs.glide`, and on release it settles into its slot carrying the
 * throw. Alt with the arrow keys makes the same move.
 *
 * Preview threads the blocks into one readable prompt. Every word is a shared
 * layout element, so each block's text slides out of its card into its place
 * in the sentence on glide, block after block a cascade apart, and each label
 * flies to the margin beside the line its text starts on, where it stays as a
 * faint tag. Edit slides every word back into its card before the text fields
 * return. Empty blocks are flagged, and a brief over `maxLength` marks the
 * block that is longest as the one to cut, with Send waiting until it fits.
 * Under 40rem the rail becomes a plus menu and the tags sit inline. Under
 * reduced motion the ribbon and the reorders cross-fade.
 */
export function BriefBlocks({
  blocks,
  defaultBlocks = defaultBriefBlocks,
  onChange,
  kinds = defaultBriefKinds,
  presets = defaultBriefPresets,
  onSavePreset,
  onSubmit,
  assemble = assembleBrief,
  mode,
  defaultMode = "edit",
  onModeChange,
  maxLength = 1200,
  status = "ready",
  title = "Waylight product brief",
  blockStyle = "card",
  ribbonFont = "sans",
  accent = "var(--accent-bright)",
  height = 540,
  disabled = false,
  className,
}: BriefBlocksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sectionRef = React.useRef<HTMLElement | null>(null);

  /* ----------------------------- blocks ----------------------------- */

  const [own, setOwn] = React.useState(defaultBlocks);
  const list = blocks ?? own;
  const listRef = React.useRef(list);
  React.useEffect(() => {
    listRef.current = list;
  }, [list]);
  const commitBlocks = (next: BriefBlock[]) => {
    listRef.current = next;
    if (blocks === undefined) setOwn(next);
    onChange?.(next);
  };
  const kindOf = (id: string) => kinds.find((k) => k.id === id);
  const labelOf = (b: BriefBlock) => kindOf(b.kind)?.label ?? b.kind;

  const total = list.reduce((n, b) => n + b.text.trim().length, 0);
  const over = total > maxLength;
  const culprit = over
    ? list.reduce<BriefBlock | null>(
        (best, b) => (!best || b.text.length > best.text.length ? b : best),
        null,
      )
    : null;
  const empties = list.filter((b) => !b.text.trim());

  /* ------------------------------ mode ------------------------------ */

  const [ownMode, setOwnMode] = React.useState<BriefMode>(defaultMode);
  const view = mode ?? ownMode;
  const [phase, setPhase] = React.useState<Phase>(
    view === "ribbon" ? "ribbon" : "edit",
  );
  const [lastFocus, setLastFocus] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);

  const setMode = (next: BriefMode) => {
    if (next === view) return;
    if (mode === undefined) setOwnMode(next);
    onModeChange?.(next);
  };

  const flight = React.useRef({ motionSafe, count: list.length });
  React.useEffect(() => {
    flight.current = { motionSafe, count: list.length };
  });

  // Threading takes two commits: the text fields become word-for-word
  // mirrors in place, then the ribbon takes their words. Unthreading flies
  // the words back into mirrors, and only once they have landed do the text
  // fields return.
  const shownView = React.useRef(view);
  React.useEffect(() => {
    // Only a change of view threads or unthreads; the first render rests.
    if (shownView.current === view) return;
    shownView.current = view;
    const { motionSafe: rich, count } = flight.current;
    let raf = 0;
    let timer = 0;
    if (view === "ribbon") {
      if (!rich) {
        raf = window.requestAnimationFrame(() => setPhase("ribbon"));
      } else {
        raf = window.requestAnimationFrame(() => {
          setPhase("mirror");
          raf = window.requestAnimationFrame(() => setPhase("ribbon"));
        });
      }
    } else if (!rich) {
      raf = window.requestAnimationFrame(() => setPhase("edit"));
    } else {
      raf = window.requestAnimationFrame(() => setPhase("back"));
      timer = window.setTimeout(
        () => setPhase("edit"),
        Math.round(520 + cascade(count) * count * 1000),
      );
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [view]);

  // When the text fields return, focus goes back to the block you were in.
  React.useEffect(() => {
    if (phase !== "edit" || view !== "edit" || !lastFocus) return;
    const raf = window.requestAnimationFrame(() => setFocusId(lastFocus));
    return () => window.cancelAnimationFrame(raf);
    // Only the return to editing moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ----------------------------- editing ---------------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  const [flash, setFlash] = React.useState<string | null>(null);
  const flashTimer = React.useRef<number | null>(null);
  const flashBlock = (id: string) => {
    setFlash(id);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 900);
  };
  React.useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const editText = (id: string, text: string) =>
    commitBlocks(
      listRef.current.map((b) => (b.id === id ? { ...b, text } : b)),
    );

  const counter = React.useRef(0);
  const addBlock = (kindId: string) => {
    if (disabled) return;
    const kind = kindOf(kindId);
    if (!kind) return;
    if (kind.single && listRef.current.some((b) => b.kind === kindId)) {
      setAnnouncement(`${kind.label} is already in the brief.`);
      const existing = listRef.current.find((b) => b.kind === kindId);
      if (existing) {
        setFocusId(existing.id);
        flashBlock(existing.id);
      }
      return;
    }
    counter.current += 1;
    const block: BriefBlock = {
      id: `${kindId}-${counter.current}-${listRef.current.length}`,
      kind: kindId,
      text: "",
    };
    const at = lastFocus
      ? listRef.current.findIndex((b) => b.id === lastFocus) + 1
      : listRef.current.length;
    const next = [...listRef.current];
    next.splice(at <= 0 ? next.length : at, 0, block);
    commitBlocks(next);
    if (view === "ribbon") setMode("edit");
    setFocusId(block.id);
    setAnnouncement(
      `${kind.label} block added, ${next.indexOf(block) + 1} of ${next.length}.`,
    );
  };

  const removeBlock = (id: string) => {
    if (disabled) return;
    const index = listRef.current.findIndex((b) => b.id === id);
    const block = listRef.current[index];
    if (!block) return;
    const next = listRef.current.filter((b) => b.id !== id);
    commitBlocks(next);
    const neighbour = next[index] ?? next[index - 1];
    if (neighbour) setFocusId(neighbour.id);
    else
      // The last block is gone: focus goes to whatever adds one.
      window.requestAnimationFrame(() => {
        const root = sectionRef.current;
        const rail = root?.querySelector<HTMLElement>(
          '[role="toolbar"] button[tabindex="0"]',
        );
        const plus = root?.querySelector<HTMLElement>(
          'button[aria-label="Add block"]',
        );
        (rail && rail.offsetParent !== null ? rail : plus)?.focus();
      });
    setAnnouncement(`${labelOf(block)} block removed.`);
  };

  const moveBlock = (id: string, by: number) => {
    if (disabled) return;
    const from = listRef.current.findIndex((b) => b.id === id);
    const to = Math.max(0, Math.min(listRef.current.length - 1, from + by));
    if (from < 0 || to === from) return;
    const next = [...listRef.current];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    commitBlocks(next);
    setAnnouncement(`${labelOf(moved)} moved to ${to + 1} of ${next.length}.`);
  };

  const applyPreset = (p: BriefPreset) => {
    counter.current += 1;
    const stamp = counter.current;
    commitBlocks(p.blocks.map((b) => ({ ...b, id: `${b.id}-${stamp}` })));
    setAnnouncement(`${p.name} loaded, ${p.blocks.length} blocks.`);
  };

  /* ------------------------------ presets --------------------------- */

  const [extraPresets, setExtraPresets] =
    React.useState<BriefPreset[]>(EMPTY_PRESETS);
  const allPresets = [...presets, ...extraPresets];
  const [naming, setNaming] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");
  const [saved, setSaved] = React.useState<string | null>(null);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    counter.current += 1;
    const preset: BriefPreset = {
      id: `preset-${counter.current}`,
      name,
      blocks: listRef.current.map((b) => ({ ...b })),
    };
    setExtraPresets((p) => [...p, preset]);
    onSavePreset?.(preset);
    setNaming(false);
    setPresetName("");
    setSaved(name);
    setAnnouncement(`Saved as ${name}.`);
  };

  /* ------------------------------- send ----------------------------- */

  const [sent, setSent] = React.useState(false);
  const sentTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
    },
    [],
  );
  const blockedReason = over
    ? `Too long: ${group(total)} of ${group(maxLength)} characters. ${culprit ? `${labelOf(culprit)} is the longest block.` : ""}`
    : empties.length
      ? `${empties.length === 1 ? `${labelOf(empties[0] as BriefBlock)} is` : `${empties.length} blocks are`} empty.`
      : list.length === 0
        ? "Add a block first."
        : null;

  const submit = () => {
    if (disabled || status === "sending") return;
    const first = empties[0];
    if (first) {
      if (view === "ribbon") setMode("edit");
      setFocusId(first.id);
      flashBlock(first.id);
      setAnnouncement(`${labelOf(first)} is empty. Fill it or remove it.`);
      return;
    }
    if (over || list.length === 0) {
      if (culprit) {
        if (view === "ribbon") setMode("edit");
        setFocusId(culprit.id);
        flashBlock(culprit.id);
      }
      setAnnouncement(blockedReason ?? "");
      return;
    }
    onSubmit?.(assemble(list, kinds), list);
    setSent(true);
    setAnnouncement("Brief sent.");
    if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
    sentTimer.current = window.setTimeout(() => setSent(false), 1800);
  };

  /* ------------------------------- drag ----------------------------- */

  const [listNode, setListNode] = React.useState<HTMLOListElement | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const dragY = useMotionValue(0);
  const dragState = React.useRef<{
    id: string;
    from: number;
    tops: Map<string, number>;
    heights: Map<string, number>;
    gap: number;
    startTop: number;
    order: string[];
  } | null>(null);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);

  const slotTop = (order: string[], id: string) => {
    const s = dragState.current;
    if (!s) return 0;
    let y = s.tops.get(s.order[0] ?? "") ?? 0;
    for (const other of order) {
      if (other === id) return y;
      y += (s.heights.get(other) ?? 0) + s.gap;
    }
    return y;
  };

  const startDrag = (id: string) => {
    if (!listNode) return;
    settle.current?.stop();
    const tops = new Map<string, number>();
    const heights = new Map<string, number>();
    const cards = listNode.querySelectorAll<HTMLElement>("[data-bb-block]");
    for (const el of cards) {
      const bid = el.dataset.bbBlock ?? "";
      tops.set(bid, el.offsetTop);
      heights.set(bid, el.offsetHeight);
    }
    const order = listRef.current.map((b) => b.id);
    const gap = Number.parseFloat(getComputedStyle(listNode).rowGap) || 0;
    dragState.current = {
      id,
      from: order.indexOf(id),
      tops,
      heights,
      gap,
      startTop: tops.get(id) ?? 0,
      order,
    };
    dragY.jump(0);
    setDragId(id);
  };

  const moveDrag = (offset: number) => {
    const s = dragState.current;
    if (!s) return;
    const h = s.heights.get(s.id) ?? 0;
    const first = s.tops.get(s.order[0] ?? "") ?? 0;
    const lastId = s.order[s.order.length - 1] ?? "";
    const last = (s.tops.get(lastId) ?? 0) + (s.heights.get(lastId) ?? 0) - h;
    const raw = s.startTop + offset;
    const top =
      raw < first
        ? first + rubberband(raw - first, h)
        : raw > last
          ? last + rubberband(raw - last, h)
          : raw;
    const centre = top + h / 2;
    const others = s.order.filter((x) => x !== s.id);
    let index = 0;
    for (const o of others) {
      const oc = (s.tops.get(o) ?? 0) + (s.heights.get(o) ?? 0) / 2;
      if (centre > oc) index += 1;
    }
    const order = [...others.slice(0, index), s.id, ...others.slice(index)];
    if (order.join() !== listRef.current.map((b) => b.id).join()) {
      const byId = new Map(listRef.current.map((b) => [b.id, b]));
      commitBlocks(
        order.map((x) => byId.get(x)).filter((b): b is BriefBlock => !!b),
      );
    }
    dragY.set(Math.round((top - slotTop(order, s.id)) * 10) / 10);
  };

  const endDrag = (velocity: number) => {
    const s = dragState.current;
    dragState.current = null;
    if (!s) return;
    const index = listRef.current.findIndex((b) => b.id === s.id);
    const moved = listRef.current[index];
    if (moved && index !== s.from)
      setAnnouncement(
        `${labelOf(moved)} moved to ${index + 1} of ${listRef.current.length}.`,
      );
    const done = () => setDragId((d) => (d === s.id ? null : d));
    settle.current = animate(
      dragY,
      0,
      motionSafe
        ? { ...springs.glide, velocity, onComplete: done }
        : { duration: 0, onComplete: done },
    );
  };

  React.useEffect(() => () => settle.current?.stop(), []);

  /* -------------------------- ribbon tags --------------------------- */

  const [ribbonNode, setRibbonNode] =
    React.useState<HTMLParagraphElement | null>(null);
  const [merged, setMerged] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (!ribbonNode) return;
    const measure = () => {
      const tags = [
        ...ribbonNode.querySelectorAll<HTMLElement>("[data-bb-tag]"),
      ];
      const next: Record<string, string> = {};
      let lead: { id: string; top: number; label: string } | null = null;
      for (const el of tags) {
        if (getComputedStyle(el).position !== "absolute") continue;
        const id = el.dataset.bbTag ?? "";
        const label = el.dataset.bbLabel ?? "";
        const top = el.offsetTop;
        if (lead && Math.abs(top - lead.top) < 4) {
          lead.label = `${lead.label} · ${label}`;
          next[lead.id] = lead.label;
          next[id] = "";
        } else {
          lead = { id, top, label };
        }
      }
      setMerged((m) => (JSON.stringify(m) === JSON.stringify(next) ? m : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(ribbonNode);
    return () => ro.disconnect();
  }, [ribbonNode, list, ribbonFont]);

  /* ------------------------------ menus ----------------------------- */

  const [menu, setMenu] = React.useState<"presets" | "add" | null>(null);
  const [railIndex, setRailIndex] = React.useState(0);

  /* ------------------------------ styles ---------------------------- */

  const vars = {
    "--bb-accent": accent,
    "--bb-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--bb-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--bb-solid": `oklch(from ${accent} 0.55 c h)`,
  } as React.CSSProperties;
  const focusRing =
    "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
  const flying = phase === "mirror" || phase === "back";
  const step = cascade(Math.max(1, list.length));
  const wordTransition = (index: number) => ({
    layout: motionSafe
      ? { ...springs.glide, delay: index * step }
      : { duration: 0 },
  });

  const renderWords = (b: BriefBlock, index: number) => {
    let n = 0;
    return b.text.split(/(\s+)/).map((token, i) => {
      if (!token) return null;
      if (/^\s+$/.test(token))
        return <React.Fragment key={i}>{token}</React.Fragment>;
      n += 1;
      return (
        <motion.span
          key={i}
          layoutId={motionSafe ? `${uid}-${b.id}-w${n}` : undefined}
          layout={motionSafe ? "position" : false}
          transition={wordTransition(index)}
          className="inline-block"
        >
          {token}
        </motion.span>
      );
    });
  };

  /* ------------------------------ blocks ---------------------------- */

  const stack = (
    <ol
      ref={setListNode}
      aria-label="Blocks"
      className="relative flex flex-col gap-2.5"
    >
      <AnimatePresence initial={false}>
        {list.map((b, index) => (
          <BlockCard
            key={b.id}
            block={b}
            index={index}
            count={list.length}
            kind={kindOf(b.kind)}
            uid={uid}
            phase={phase}
            styleName={blockStyle}
            motionSafe={motionSafe}
            disabled={disabled}
            dragging={dragId === b.id}
            dragY={dragY}
            culprit={culprit?.id === b.id}
            total={total}
            maxLength={maxLength}
            flash={flash === b.id}
            focusMe={focusId === b.id}
            onFocused={() => setFocusId(null)}
            onFocusIn={() => setLastFocus(b.id)}
            onText={(text) => editText(b.id, text)}
            onRemove={() => removeBlock(b.id)}
            onMove={(by) => moveBlock(b.id, by)}
            onDragStart={() => startDrag(b.id)}
            onDragMove={moveDrag}
            onDragEnd={endDrag}
            words={flying ? renderWords(b, index) : null}
            focusRing={focusRing}
          />
        ))}
      </AnimatePresence>
      {list.length === 0 ? (
        <li className="rounded-3 border border-dashed border-hairline-strong px-4 py-8 text-center text-[12.5px] text-ink-3">
          No blocks yet. Add a role and a goal to start.
        </li>
      ) : null}
    </ol>
  );

  const ribbon = (
    <motion.div
      initial={{ opacity: motionSafe ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.fast }}
      className="rounded-3 border border-hairline bg-surface-1 p-4"
    >
      <p
        ref={setRibbonNode}
        className={cn(
          "relative text-foreground @min-[40rem]/brief-blocks:pl-26",
          FONT[ribbonFont] ?? FONT.sans,
        )}
      >
        {list.map((b, index) => {
          const label = labelOf(b);
          const tag = merged[b.id];
          return (
            <React.Fragment key={b.id}>
              {index > 0 ? " " : null}
              <motion.span
                data-bb-tag={b.id}
                data-bb-label={label.toUpperCase()}
                layoutId={motionSafe ? `${uid}-tag-${b.id}` : undefined}
                layout={motionSafe ? "position" : false}
                transition={wordTransition(index)}
                className={cn(
                  "mr-1.5 inline-block rounded-1 bg-surface-2 px-1 align-[0.1em] font-mono text-[9.5px] leading-[1.6] font-medium tracking-[0.08em] text-ink-3 uppercase",
                  "@min-[40rem]/brief-blocks:absolute @min-[40rem]/brief-blocks:left-0 @min-[40rem]/brief-blocks:mt-[0.45em] @min-[40rem]/brief-blocks:mr-0 @min-[40rem]/brief-blocks:max-w-24 @min-[40rem]/brief-blocks:truncate @min-[40rem]/brief-blocks:bg-transparent @min-[40rem]/brief-blocks:px-0",
                  tag === "" && "@min-[40rem]/brief-blocks:opacity-0",
                )}
              >
                {tag || label.toUpperCase()}
              </motion.span>
              {b.text.trim() ? (
                <span
                  onClick={() => {
                    if (disabled) return;
                    setLastFocus(b.id);
                    setMode("edit");
                  }}
                  className="cursor-text rounded-[3px] [box-decoration-break:clone] hover:bg-(--bb-wash)"
                >
                  {renderWords(b, index)}
                </span>
              ) : (
                <span className="rounded-1 border border-dashed border-warn/60 px-1.5 text-[0.85em] text-warn">
                  {`${label} is empty`}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </p>
    </motion.div>
  );

  /* ------------------------------ render ---------------------------- */

  const kindItems = kinds.map((k) => ({
    k,
    taken: !!k.single && list.some((b) => b.kind === k.id),
  }));

  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-foreground disabled:opacity-50";

  return (
    <section
      ref={sectionRef}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
      className={cn(
        "@container/brief-blocks relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, height }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="truncate text-[13.5px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p className="font-mono text-[10.5px] text-ink-3 tabular-nums">
            {`${list.length} ${list.length === 1 ? "block" : "blocks"} · ${group(total)} of ${group(maxLength)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="@min-[40rem]/brief-blocks:hidden">
            <MenuButton
              label="Add block"
              icon={<Plus aria-hidden className="size-3.5" />}
              open={menu === "add"}
              onOpenChange={(o) => setMenu(o ? "add" : null)}
              disabled={disabled}
              className={cn(button, focusRing)}
              items={kindItems.map(({ k, taken }) => ({
                id: k.id,
                label: k.label,
                meta: taken ? "added" : k.hint,
                disabled: taken,
              }))}
              onSelect={(id) => {
                setMenu(null);
                addBlock(id);
              }}
              motionSafe={motionSafe}
              iconOnly
            />
          </div>
          {naming ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                savePreset();
              }}
              className="flex items-center gap-1.5"
            >
              <label className="sr-only" htmlFor={`${uid}-preset`}>
                Preset name
              </label>
              <input
                id={`${uid}-preset`}
                autoFocus
                value={presetName}
                onChange={(event) => {
                  const v = event.currentTarget.value;
                  setPresetName(v);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setNaming(false);
                  }
                }}
                placeholder="Preset name"
                className={cn(
                  "h-8 w-32 rounded-2 border border-(--bb-line) bg-surface-1 px-2 text-[12px] text-foreground placeholder:text-ink-3",
                  focusRing,
                )}
              />
              <button
                type="submit"
                aria-disabled={!presetName.trim() || undefined}
                className={cn(button, "px-2", focusRing)}
              >
                <Check aria-hidden className="size-3.5" />
                <span className="sr-only">Save preset</span>
              </button>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setNaming(false)}
                className={cn(button, "px-2", focusRing)}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </form>
          ) : (
            <>
              <MenuButton
                label="Presets"
                icon={<ChevronDown aria-hidden className="size-3.5" />}
                open={menu === "presets"}
                onOpenChange={(o) => setMenu(o ? "presets" : null)}
                disabled={disabled}
                className={cn(button, focusRing)}
                items={allPresets.map((p) => ({
                  id: p.id,
                  label: p.name,
                  meta: `${p.blocks.length} blocks`,
                }))}
                onSelect={(id) => {
                  setMenu(null);
                  const p = allPresets.find((x) => x.id === id);
                  if (p) applyPreset(p);
                }}
                motionSafe={motionSafe}
                trailingIcon
                align="end"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSaved(null);
                  setNaming(true);
                }}
                className={cn(button, focusRing)}
              >
                {saved ? (
                  <Check aria-hidden className="size-3.5 text-(--bb-accent)" />
                ) : (
                  <BookmarkPlus aria-hidden className="size-3.5" />
                )}
                <span className="hidden @min-[30rem]/brief-blocks:inline">
                  {saved ? "Saved" : "Save as preset"}
                </span>
                <span className="sr-only @min-[30rem]/brief-blocks:hidden">
                  Save as preset
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div
          role="toolbar"
          aria-label="Add a block"
          aria-orientation="vertical"
          onKeyDown={(event) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button",
              ),
            ];
            const i = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                    items.length;
            event.preventDefault();
            setRailIndex(next);
            items[next]?.focus();
          }}
          className="hidden w-34 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-hairline p-2 @min-[40rem]/brief-blocks:flex"
        >
          <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Add
          </p>
          {kindItems.map(({ k, taken }, i) => (
            <button
              key={k.id}
              type="button"
              tabIndex={i === railIndex ? 0 : -1}
              onFocus={() => setRailIndex(i)}
              aria-disabled={taken || disabled || undefined}
              title={taken ? `${k.label} is already in the brief` : k.hint}
              onClick={() => addBlock(k.id)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-2 px-2 text-left text-[12.5px] transition-colors duration-150",
                taken
                  ? "text-ink-3"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                focusRing,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center rounded-1 border",
                  taken
                    ? "border-hairline text-ink-3"
                    : "border-hairline-strong text-ink-2",
                )}
              >
                {taken ? (
                  <Check className="size-2.5" />
                ) : (
                  <Plus className="size-2.5" />
                )}
              </span>
              <span className="truncate">{k.label}</span>
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 @min-[40rem]/brief-blocks:p-4">
          <div className="mx-auto max-w-[44rem]">
            {phase === "ribbon" ? ribbon : stack}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
        <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
          <div className="flex items-center justify-between gap-2 font-mono text-[10.5px] tabular-nums">
            <span
              className={
                over
                  ? "text-danger"
                  : empties.length
                    ? "text-warn"
                    : "text-ink-3"
              }
            >
              {over
                ? `${group(total - maxLength)} over`
                : empties.length
                  ? `${empties.length} empty`
                  : "ready"}
            </span>
            <span className={over ? "text-danger" : "text-ink-3"}>
              {`${group(total)} / ${group(maxLength)}`}
            </span>
          </div>
          <span
            aria-hidden
            className="relative h-1 overflow-hidden rounded-full bg-surface-2"
          >
            <motion.span
              className={cn(
                "absolute inset-y-0 left-0 w-full rounded-full",
                over ? "bg-danger" : "bg-(--bb-accent)",
              )}
              style={{ originX: 0 }}
              initial={false}
              animate={{
                scaleX: Math.min(
                  1,
                  Math.round((total / Math.max(1, maxLength)) * 1000) / 1000,
                ),
              }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="View"
            className="flex h-8 rounded-2 border border-hairline bg-surface-1 p-0.5"
          >
            {(["edit", "ribbon"] as const).map((m) => {
              const on = view === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  disabled={disabled}
                  onClick={() => setMode(m)}
                  onKeyDown={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      const next = m === "edit" ? "ribbon" : "edit";
                      setMode(next);
                      const parent = event.currentTarget.parentElement;
                      window.requestAnimationFrame(() =>
                        parent
                          ?.querySelector<HTMLButtonElement>(
                            '[aria-checked="true"]',
                          )
                          ?.focus(),
                      );
                    }
                  }}
                  className={cn(
                    "relative inline-flex items-center rounded-[5px] px-2.5 text-[12px] transition-colors duration-150",
                    on
                      ? "font-medium text-foreground"
                      : "text-ink-3 hover:text-foreground",
                    focusRing,
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId={`${uid}-view`}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      className="absolute inset-0 rounded-[5px] border border-hairline-strong bg-card"
                    />
                  ) : null}
                  <span className="relative">
                    {m === "edit" ? "Edit" : "Preview"}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-disabled={
              !!blockedReason || status === "sending" || disabled || undefined
            }
            aria-busy={status === "sending" || undefined}
            aria-describedby={blockedReason ? `${uid}-blocked` : undefined}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onClick={submit}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors duration-150",
              blockedReason || disabled
                ? "bg-surface-2 text-ink-3"
                : "bg-(--bb-solid) text-primary-foreground hover:bg-(--bb-accent)",
              focusRing,
            )}
          >
            {status === "sending" ? (
              <LoaderCircle
                aria-hidden
                className={cn("size-3.5", motionSafe && "animate-spin")}
              />
            ) : sent ? (
              <motion.span
                initial={motionSafe ? { scale: 0.5 } : false}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
                className="inline-flex"
              >
                <Check aria-hidden className="size-3.5" />
              </motion.span>
            ) : (
              <SendHorizontal aria-hidden className="size-3.5" />
            )}
            {status === "sending" ? "Sending" : sent ? "Sent" : "Send"}
          </button>
          {blockedReason ? (
            <span id={`${uid}-blocked`} className="sr-only">
              {blockedReason}
            </span>
          ) : null}
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Block card                                */
/* ----------------------------------------------------------------------- */

type BlockCardProps = {
  block: BriefBlock;
  index: number;
  count: number;
  kind: BriefBlockKind | undefined;
  uid: string;
  phase: Phase;
  styleName: BriefBlockStyle;
  motionSafe: boolean;
  disabled: boolean;
  dragging: boolean;
  dragY: MotionValue<number>;
  culprit: boolean;
  total: number;
  maxLength: number;
  flash: boolean;
  focusMe: boolean;
  onFocused: () => void;
  onFocusIn: () => void;
  onText: (text: string) => void;
  onRemove: () => void;
  onMove: (by: number) => void;
  onDragStart: () => void;
  onDragMove: (offset: number) => void;
  onDragEnd: (velocity: number) => void;
  /** The text as word spans, while it is flying to or from the ribbon. */
  words: React.ReactNode;
  focusRing: string;
};

function BlockCard({
  block,
  index,
  count,
  kind,
  uid,
  phase,
  styleName,
  motionSafe,
  disabled,
  dragging,
  dragY,
  culprit,
  total,
  maxLength,
  flash,
  focusMe,
  onFocused,
  onFocusIn,
  onText,
  onRemove,
  onMove,
  onDragStart,
  onDragMove,
  onDragEnd,
  words,
  focusRing,
}: BlockCardProps) {
  const label = kind?.label ?? block.kind;
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Only the grabbed card follows the shared drag value; the rest rest at 0.
  const y = useMotionValue(0);
  React.useEffect(() => {
    if (!dragging) {
      y.jump(0);
      return;
    }
    y.jump(dragY.get());
    return dragY.on("change", (v) => y.set(v));
  }, [dragging, dragY, y]);
  const empty = !block.text.trim();
  const [focused, setFocused] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text, words]);

  React.useEffect(() => {
    if (!focusMe) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    onFocused();
  }, [focusMe, onFocused, words]);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => onDragStart(),
    onMove: ({ offset }) => onDragMove(offset.y),
    onEnd: ({ velocity }) => onDragEnd(velocity.y),
    onCancel: () => onDragEnd(0),
  });

  const onKeys = (event: React.KeyboardEvent, fromGrip: boolean) => {
    const up = event.key === "ArrowUp";
    const down = event.key === "ArrowDown";
    if (!up && !down) return;
    if (!fromGrip && !event.altKey) return;
    event.preventDefault();
    onMove(up ? -1 : 1);
  };

  const share = Math.round(
    (block.text.trim().length / Math.max(1, maxLength)) * 100,
  );
  const shell = cn(
    "relative transition-[border-color,background-color,box-shadow] duration-200",
    styleName === "card" &&
      cn(
        "rounded-3 border bg-surface-1 p-2.5",
        culprit
          ? "border-danger/60"
          : empty
            ? "border-warn/50"
            : focused
              ? "border-(--bb-line)"
              : "border-hairline",
      ),
    styleName === "strip" &&
      cn(
        "rounded-r-2 border-l-[3px] bg-surface-2/70 py-2 pr-2 pl-2.5",
        culprit
          ? "border-danger"
          : empty
            ? "border-warn"
            : focused
              ? "border-(--bb-accent)"
              : "border-hairline-strong",
      ),
    styleName === "line" &&
      cn(
        "rounded-3 border border-dashed p-2.5",
        culprit
          ? "border-danger/70"
          : empty
            ? "border-warn/60"
            : focused
              ? "border-(--bb-accent)"
              : "border-hairline-strong",
      ),
    flash && "bg-(--bb-wash)",
    dragging &&
      "shadow-[0_14px_28px_-14px_color-mix(in_oklab,black_45%,transparent)]",
  );

  return (
    <motion.li
      data-bb-block={block.id}
      layout={dragging || !motionSafe ? false : "position"}
      transition={{ layout: springs.glide }}
      exit={
        motionSafe
          ? { opacity: 0, scale: 0.97, transition: exitFor() }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      style={{ y, zIndex: dragging ? 5 : 1, position: "relative" }}
      aria-label={`${label}, ${index + 1} of ${count}`}
      onFocus={() => {
        setFocused(true);
        onFocusIn();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <motion.div
        initial={
          motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
        }
        animate={{
          opacity: 1,
          y: 0,
          scale: dragging && motionSafe ? 1.015 : 1,
        }}
        transition={{
          opacity: { duration: durations.base, ease: easings.enter },
          y: motionSafe ? springs.glide : { duration: 0 },
          scale: springs.flick,
        }}
        className={shell}
      >
        <div className="mb-1 flex items-center gap-1.5">
          <button
            type="button"
            aria-label={`Move ${label}, ${index + 1} of ${count}. Up and Down move it.`}
            disabled={disabled}
            onKeyDown={(event) => onKeys(event, true)}
            {...drag}
            className={cn(
              "inline-flex size-6 shrink-0 touch-pan-x items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
              dragging ? "cursor-grabbing text-(--bb-accent)" : "cursor-grab",
              focusRing,
            )}
          >
            <GripVertical aria-hidden className="size-3.5" />
          </button>
          <motion.span
            layoutId={
              motionSafe && phase !== "edit"
                ? `${uid}-tag-${block.id}`
                : undefined
            }
            layout={motionSafe && phase !== "edit" ? "position" : false}
            transition={{
              layout: {
                ...springs.glide,
                delay: motionSafe ? index * cascade(count) : 0,
              },
            }}
            className="inline-block rounded-1 bg-surface-2 px-1.5 font-mono text-[10px] leading-[1.7] font-medium tracking-[0.08em] text-ink-2 uppercase"
          >
            {label}
          </motion.span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
            {kind?.hint}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] tabular-nums",
              culprit ? "text-danger" : "text-ink-3",
            )}
          >
            {group(block.text.trim().length)}
          </span>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            disabled={disabled}
            onClick={onRemove}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
              focusRing,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
        {words && phase !== "edit" ? (
          <div
            aria-hidden
            className="px-1 text-[13px] leading-[1.55] break-words whitespace-pre-wrap text-foreground"
          >
            {block.text ? (
              words
            ) : (
              <span className="text-ink-3">{kind?.placeholder}</span>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            value={block.text}
            disabled={disabled}
            aria-label={`${label}: ${kind?.hint ?? ""}`}
            aria-invalid={empty || culprit || undefined}
            placeholder={kind?.placeholder}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onText(value);
            }}
            onKeyDown={(event) => onKeys(event, false)}
            className="block w-full resize-none overflow-hidden bg-transparent px-1 text-[13px] leading-[1.55] text-foreground outline-none placeholder:text-ink-3"
          />
        )}
        {culprit ? (
          <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-danger">
            <TriangleAlert aria-hidden className="size-3 shrink-0" />
            {`Longest block, ${share}% of the limit. Trim ${group(total - maxLength)} characters to send.`}
          </p>
        ) : empty ? (
          <p className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] text-warn">
            <TriangleAlert aria-hidden className="size-3 shrink-0" />
            Empty. Fill it or remove it.
          </p>
        ) : null}
      </motion.div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Menu button                                */
/* ----------------------------------------------------------------------- */

type MenuItem = {
  id: string;
  label: string;
  meta?: string;
  disabled?: boolean;
};

function MenuButton({
  label,
  icon,
  open,
  onOpenChange,
  items,
  onSelect,
  disabled,
  className,
  motionSafe,
  iconOnly = false,
  trailingIcon = false,
  align = "start",
}: {
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MenuItem[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
  motionSafe: boolean;
  iconOnly?: boolean;
  trailingIcon?: boolean;
  /** Which edge the menu hangs from; "end" switches to the right edge once the header has room. */
  align?: "start" | "end";
}) {
  const menuId = React.useId();
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = React.useState(0);
  const [menuNode, setMenuNode] = React.useState<HTMLUListElement | null>(null);

  React.useEffect(() => {
    if (!open || !menuNode) return;
    const raf = window.requestAnimationFrame(() =>
      menuNode
        .querySelectorAll<HTMLElement>("[role=menuitem]")
        [active]?.focus(),
    );
    return () => window.cancelAnimationFrame(raf);
  }, [open, menuNode, active]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (!menuNode?.contains(t) && !buttonRef.current?.contains(t))
        onOpenChange(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open, menuNode, onOpenChange]);

  const close = () => {
    onOpenChange(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={iconOnly ? label : undefined}
        disabled={disabled}
        onClick={() => {
          setActive(0);
          onOpenChange(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive(event.key === "ArrowDown" ? 0 : items.length - 1);
            onOpenChange(true);
          }
        }}
        className={className}
      >
        {trailingIcon ? null : icon}
        {iconOnly ? null : label}
        {trailingIcon ? icon : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            ref={setMenuNode}
            id={menuId}
            role="menu"
            aria-label={label}
            initial={
              motionSafe ? { opacity: 0, y: -distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            onKeyDown={(event) => {
              const n = items.length;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((a) => (a + 1) % n);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((a) => (a - 1 + n) % n);
              } else if (event.key === "Home") {
                event.preventDefault();
                setActive(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setActive(n - 1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "Tab") {
                onOpenChange(false);
              }
            }}
            className={cn(
              "absolute top-full left-0 z-30 mt-1.5 flex w-48 flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-lg",
              align === "end" &&
                "@min-[30rem]/brief-blocks:right-0 @min-[30rem]/brief-blocks:left-auto",
            )}
          >
            {items.map((item, i) => (
              <li
                key={item.id}
                role="menuitem"
                tabIndex={i === active ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                onPointerEnter={() => setActive(i)}
                onClick={() => {
                  if (item.disabled) return;
                  onSelect(item.id);
                  window.requestAnimationFrame(() =>
                    buttonRef.current?.focus(),
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (item.disabled) return;
                    onSelect(item.id);
                    window.requestAnimationFrame(() =>
                      buttonRef.current?.focus(),
                    );
                  }
                }}
                className={cn(
                  "flex h-9 cursor-pointer items-center justify-between gap-3 rounded-2 px-2.5 text-[12.5px] outline-none",
                  i === active ? "bg-surface-2 text-foreground" : "text-ink-2",
                  item.disabled && "cursor-default opacity-50",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                <span className="truncate">{item.label}</span>
                {item.meta ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">
                    {item.meta}
                  </span>
                ) : null}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
