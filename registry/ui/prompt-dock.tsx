"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  AtSign,
  Braces,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  File,
  FileSpreadsheet,
  FileText,
  Hash,
  Image as ImageIcon,
  Paperclip,
  Upload,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DockItemKind =
  "file" | "doc" | "sheet" | "snippet" | "image" | "channel";

export type DockItem = {
  id: string;
  kind: DockItemKind;
  /** What the chip and the menu call it. */
  name: string;
  /** How many tokens it adds to the prompt. */
  tokens: number;
  /** A quiet note in the @ menu: "Sheet · 14 rows". */
  detail?: string;
};

export type DockModel = {
  id: string;
  /** The full name, shown when there is room. */
  name: string;
  /** A short name for narrow docks. @default name */
  short?: string;
  /** What it is good at, in a word or two. */
  note?: string;
};

export type DockTray = "open" | "count" | "auto";

export type DockMessage = {
  text: string;
  context: DockItem[];
  model: string;
};

export type PromptDockProps = {
  /** Controlled prompt text. */
  value?: string;
  /** Initial text when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from the keystroke, the @ choice or the send that changed the text. */
  onValueChange?: (text: string) => void;
  /** Controlled context items in the tray. */
  context?: DockItem[];
  /** Initial context when uncontrolled. @default defaultContext */
  defaultContext?: DockItem[];
  /** Fires from the drop, the @ choice or the remove that changed the tray. */
  onContextChange?: (items: DockItem[]) => void;
  /** What the @ menu offers. @default defaultSources */
  sources?: DockItem[];
  /** The models the pill switches between. @default defaultModels */
  models?: DockModel[];
  /** The selected model's id. A new value slides the pill to it; the visitor's switch is reported through onModelChange. @default the first model */
  model?: string;
  onModelChange?: (id: string) => void;
  /** The tray starts open, starts collapsed into a count, or collapses itself while there is text in the box. @default "open" */
  tray?: DockTray;
  /** The context budget in tokens: the meter warms toward it and Send stops past it. @default 8000 */
  limit?: number;
  /** Controlled: a reply is being written, so Send is Stop. */
  generating?: boolean;
  /** Initial generating state when uncontrolled. @default false */
  defaultGenerating?: boolean;
  onGeneratingChange?: (generating: boolean) => void;
  /** Send was pressed (or Enter), with what was sent. The box clears. */
  onSend?: (message: DockMessage) => void;
  /** Stop was pressed (or Escape while generating). */
  onStop?: () => void;
  /** Files dropped on the dock or picked with Attach. */
  onFilesAdd?: (files: File[]) => void;
  /** File types the Attach picker offers, as for an input's accept. */
  accept?: string;
  /** @default "Ask anything, or type @ to add context" */
  placeholder?: string;
  /** How tall the box grows before it scrolls, in lines. @default 6 */
  maxRows?: number;
  /** The dock's accessible name. @default "Prompt" */
  label?: string;
  /** Play the landings, the switches and the send. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

export const defaultContext: DockItem[] = [
  {
    id: "payouts-csv",
    kind: "sheet",
    name: "march-payouts.csv",
    tokens: 2400,
    detail: "Sheet · 14 rows",
  },
  {
    id: "policy",
    kind: "doc",
    name: "Payout policy",
    tokens: 1800,
    detail: "Doc · 6 pages",
  },
  {
    id: "cutoff",
    kind: "snippet",
    name: "Cut-off rule",
    tokens: 320,
    detail: "Snippet",
  },
];

export const defaultSources: DockItem[] = [
  {
    id: "board-memo",
    kind: "doc",
    name: "Q1 board memo",
    tokens: 2100,
    detail: "Doc · 4 pages",
  },
  {
    id: "windows",
    kind: "doc",
    name: "Settlement windows",
    tokens: 900,
    detail: "Help article",
  },
  {
    id: "forecast",
    kind: "sheet",
    name: "april-forecast.xlsx",
    tokens: 3200,
    detail: "Sheet · 3 tabs",
  },
  {
    id: "finance-ops",
    kind: "channel",
    name: "finance-ops",
    tokens: 1400,
    detail: "Channel · last 7 days",
  },
  {
    id: "refund",
    kind: "snippet",
    name: "Refund script",
    tokens: 260,
    detail: "Snippet",
  },
  {
    id: "vendors",
    kind: "sheet",
    name: "Vendor list",
    tokens: 1100,
    detail: "Sheet · 86 rows",
  },
  {
    id: "late-log",
    kind: "file",
    name: "late-batches.log",
    tokens: 640,
    detail: "Log · 12 KB",
  },
  {
    id: "receipt",
    kind: "image",
    name: "receipt-0314.png",
    tokens: 760,
    detail: "Image",
  },
];

export const defaultModels: DockModel[] = [
  {
    id: "model-3",
    name: "Fernworks Model 3",
    short: "Model 3",
    note: "Balanced",
  },
  {
    id: "reasoner",
    name: "Gaugeworks Reasoner",
    short: "Reasoner",
    note: "Thinks first",
  },
  { id: "swift", name: "Fernworks Swift", short: "Swift", note: "Fastest" },
];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const LINE = 20;
const OPTION_H = 32;
const MENU_ROWS = 3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const short = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`;
const tokensOf = (text: string, items: DockItem[]) =>
  items.reduce((sum, i) => sum + i.tokens, 0) + Math.ceil(text.length / 4);

const ICONS: Record<DockItemKind, typeof File> = {
  file: File,
  doc: FileText,
  sheet: FileSpreadsheet,
  snippet: Braces,
  image: ImageIcon,
  channel: Hash,
};

function kindOf(name: string): DockItemKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["csv", "xls", "xlsx", "tsv"].includes(ext)) return "sheet";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext))
    return "image";
  if (["md", "txt", "pdf", "doc", "docx", "rtf"].includes(ext)) return "doc";
  return "file";
}

/** The @ mention the caret sits in: "@" at a word start, then the query. */
function mentionAt(text: string, caret: number) {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@]*)$/.exec(before);
  if (!m) return null;
  const query = m[2] ?? "";
  return { start: caret - query.length - 1, query };
}

/** Prefix matches first, then anywhere in the name; letters matched are drawn. */
function rank(items: DockItem[], query: string) {
  const q = query.toLowerCase();
  const scored: { item: DockItem; at: number }[] = [];
  for (const item of items) {
    const at = item.name.toLowerCase().indexOf(q);
    if (q && at === -1) continue;
    scored.push({ item, at: q ? at : -1 });
  }
  return scored
    .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1))
    .slice(0, 8);
}

/* ------------------------------ the morph ------------------------------ */

type Pt = readonly [number, number];
// Nine points each, in the same clockwise order, so the arrow folds into a
// square point for point: the tip becomes the top edge's middle, the wings
// its corners, the shaft its lower sides.
const ARROW: Pt[] = [
  [8, 2.6],
  [12.9, 7.5],
  [11.6, 8.8],
  [8.9, 6.1],
  [8.9, 13.4],
  [7.1, 13.4],
  [7.1, 6.1],
  [4.4, 8.8],
  [3.1, 7.5],
];
const SQUARE: Pt[] = [
  [8, 4.5],
  [11.5, 4.5],
  [11.5, 8],
  [11.5, 9.8],
  [11.5, 11.5],
  [4.5, 11.5],
  [4.5, 9.8],
  [4.5, 8],
  [4.5, 4.5],
];
const morphPath = (t: number) =>
  `M ${ARROW.map(([x, y], i) => {
    const [sx, sy] = SQUARE[i] ?? [x, y];
    return `${r2(x + (sx - x) * t)} ${r2(y + (sy - y) * t)}`;
  }).join(" L ")} Z`;

/* ------------------------------ small parts ----------------------------- */

const subscribeVisible = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const visibleNow = () => document.visibilityState !== "hidden";
const visibleOnServer = () => true;

function ItemIcon({
  kind,
  className,
}: {
  kind: DockItemKind;
  className?: string;
}) {
  const Icon = ICONS[kind] ?? File;
  return <Icon aria-hidden className={cn("size-3.5 shrink-0", className)} />;
}

type Flight = {
  key: number;
  item: DockItem;
  /** Client coordinates the flyer leaves from. */
  from: { x: number; y: number };
  order: number;
};

/**
 * A chip on its way to the tray. It leaves the drop point (or the menu row,
 * or the Attach button) and lands on its slot: x on glide and y on snap, so
 * the two settle at different rates and the path bows. A StrictMode re-run
 * starts the flight again from the same place rather than freezing it.
 */
function Flyer({
  flight,
  getRoot,
  getTarget,
  onLand,
}: {
  flight: Flight;
  getRoot: () => HTMLElement | null;
  getTarget: (id: string) => HTMLElement | null;
  onLand: (key: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(0.82);
  const land = React.useRef(onLand);
  React.useEffect(() => {
    land.current = onLand;
  });

  React.useLayoutEffect(() => {
    const node = ref.current;
    const root = getRoot();
    const target = getTarget(flight.item.id);
    if (!node || !root || !target) {
      land.current(flight.key);
      return;
    }
    const rr = root.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const x0 = r2(
      Math.min(rr.width - w, Math.max(0, flight.from.x - rr.left - w / 2)),
    );
    const y0 = r2(
      Math.min(rr.height - h, Math.max(0, flight.from.y - rr.top - h / 2)),
    );
    const x1 = r2(tr.left - rr.left + (tr.width - w) / 2);
    const y1 = r2(tr.top - rr.top + (tr.height - h) / 2);
    x.jump(x0);
    y.jump(y0);
    scale.jump(0.82);
    const delay = flight.order * cascade(4);
    const a = animate(x, x1, { ...springs.glide, delay });
    const b = animate(y, y1, { ...springs.snap, delay });
    const c = animate(scale, 1, {
      ...springs.glide,
      delay,
      onComplete: () => land.current(flight.key),
    });
    return () => {
      a.stop();
      b.stop();
      c.stop();
    };
  }, [flight, getRoot, getTarget, x, y, scale]);

  return (
    <motion.div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30 flex h-7 items-center gap-1.5 rounded-full border border-cobalt-bright/50 bg-popover pr-2.5 pl-1 text-xs text-foreground shadow-[0_6px_18px_color-mix(in_oklab,black_22%,transparent)]"
      style={{ x, y, scale }}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright">
        <ItemIcon kind={flight.item.kind} className="size-3" />
      </span>
      <span className="max-w-[9rem] truncate">{flight.item.name}</span>
    </motion.div>
  );
}

/* -------------------------------- the dock ------------------------------- */

type Said = { n: number; text: string };

/**
 * A prompt box with everything it needs around it. Above the text, a tray of
 * context — files, docs, snippets — that collapses into a count: the chips'
 * icons fly together into a stack on glide (each icon is one shared layout
 * element) and fly back out when it opens. Files dropped anywhere on the dock
 * leave the drop point as chips and land in the tray; Attach does the same
 * from its button. Typing @ turns the tray's place into a menu of what can be
 * attached, filtered as you type, and the chosen row flies into the tray.
 *
 * Under the text, a model pill opens in place into every model with a
 * highlight that slides between them on snap; its label slides to the new
 * name. A token meter fills and warms toward the limit — ink, then warn, then
 * danger — and bumps on recoil as it crosses 90% and the limit. Send lifts
 * the text out of the box and its arrow folds into a stop square on snap;
 * while a reply is written, Stop (or Escape) ends it.
 *
 * The box is a real textarea and a combobox for the @ menu. Under reduced
 * motion nothing flies or slides: chips appear in their slots, labels swap,
 * the icon changes at once — and the meter still fills and warms.
 */
export function PromptDock({
  value,
  defaultValue = "",
  onValueChange,
  context: contextProp,
  defaultContext: initialContext = defaultContext,
  onContextChange,
  sources = defaultSources,
  models = defaultModels,
  model: modelProp,
  onModelChange,
  tray = "open",
  limit = 8000,
  generating: generatingProp,
  defaultGenerating = false,
  onGeneratingChange,
  onSend,
  onStop,
  onFilesAdd,
  accept,
  placeholder = "Ask anything, or type @ to add context",
  maxRows = 6,
  label = "Prompt",
  sound = false,
  disabled = false,
  className,
}: PromptDockProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const listId = `${uid}-menu`;
  const trayId = `${uid}-tray`;
  const meterId = `${uid}-meter`;
  const rows = Math.max(1, Math.round(maxRows));
  const budget = Math.max(1, limit);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const attachRef = React.useRef<HTMLButtonElement | null>(null);
  const toggleRef = React.useRef<HTMLButtonElement | null>(null);
  const trayListRef = React.useRef<HTMLUListElement | null>(null);
  const chipNodes = React.useRef(new Map<string, HTMLLIElement>());
  const optionNodes = React.useRef(new Map<string, HTMLDivElement>());
  const modelNodes = React.useRef(new Map<string, HTMLDivElement>());
  const pendingCaret = React.useRef<number | null>(null);
  const focusNext = React.useRef<"list" | "pill" | null>(null);
  const seq = React.useRef(0);
  const inView = useInView(rootRef, { amount: 0 });
  const visible = React.useSyncExternalStore(
    subscribeVisible,
    visibleNow,
    visibleOnServer,
  );

  /* ------------------------------- values ------------------------------- */

  const [ownText, setOwnText] = React.useState(defaultValue);
  const text = value ?? ownText;
  const [ownContext, setOwnContext] = React.useState(initialContext);
  const items = contextProp ?? ownContext;
  const [ownGenerating, setOwnGenerating] = React.useState(defaultGenerating);
  const generating = generatingProp ?? ownGenerating;

  const firstModel = models[0]?.id ?? "";
  const [ownModel, setOwnModel] = React.useState(modelProp ?? firstModel);
  // A new `model` from the host is adopted, here in render.
  const [seenModel, setSeenModel] = React.useState(modelProp);
  const [slide, setSlide] = React.useState(1);
  if (seenModel !== modelProp) {
    setSeenModel(modelProp);
    if (modelProp !== undefined) {
      // The label slides the way the list runs: up to a later model.
      const from = models.findIndex((m) => m.id === ownModel);
      const to = models.findIndex((m) => m.id === modelProp);
      setSlide(to >= from ? 1 : -1);
      setOwnModel(modelProp);
    }
  }
  const modelId = models.some((m) => m.id === ownModel) ? ownModel : firstModel;
  const modelIndex = Math.max(
    0,
    models.findIndex((m) => m.id === modelId),
  );
  const current = models[modelIndex];

  // The tray's policy is a prop; a new one resets the visitor's toggle.
  const [userOpen, setUserOpen] = React.useState<boolean | null>(null);
  const [seenTray, setSeenTray] = React.useState(tray);
  if (seenTray !== tray) {
    setSeenTray(tray);
    setUserOpen(null);
  }
  const empty = text.trim().length === 0;
  const [seenEmpty, setSeenEmpty] = React.useState(empty);
  if (tray === "auto" && seenEmpty !== empty) {
    setSeenEmpty(empty);
    setUserOpen(null);
  }
  const trayOpen =
    userOpen ?? (tray === "count" ? false : tray === "auto" ? empty : true);

  const [caret, setCaret] = React.useState(0);
  const [dismissed, setDismissed] = React.useState<number | null>(null);
  const [active, setActive] = React.useState(0);
  const [picking, setPicking] = React.useState(false);
  const [hi, setHi] = React.useState(modelIndex);
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [ghost, setGhost] = React.useState<{
    key: number;
    text: string;
  } | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const [height, setHeight] = React.useState<number | null>(null);

  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  const mention = disabled ? null : mentionAt(text, caret);
  const menuOpen = mention !== null && mention.start !== dismissed;
  const offered = menuOpen
    ? rank(
        sources.filter((s) => !items.some((i) => i.id === s.id)),
        mention.query,
      )
    : [];
  const activeIndex = Math.min(active, Math.max(0, offered.length - 1));
  const activeItem = offered[activeIndex]?.item;

  const total = tokensOf(text, items);
  const ratio = total / budget;
  const over = total > budget;

  /* ------------------------------ setters ------------------------------ */

  const warnIfCrossing = (before: number, after: number) => {
    if (before / budget < 0.9 && after / budget >= 0.9 && after <= budget)
      say(
        `Context near the limit: ${short(after)} of ${short(budget)} tokens.`,
      );
    if (before <= budget && after > budget)
      say(
        `Over the limit by ${after - budget} tokens. Remove something to send.`,
      );
  };

  const commitText = (next: string) => {
    warnIfCrossing(total, tokensOf(next, items));
    if (value === undefined) setOwnText(next);
    onValueChange?.(next);
  };

  const commitContext = (next: DockItem[]) => {
    warnIfCrossing(total, tokensOf(text, next));
    if (contextProp === undefined) setOwnContext(next);
    onContextChange?.(next);
  };

  const setGenerating = (next: boolean) => {
    if (next === generating) return;
    if (generatingProp === undefined) setOwnGenerating(next);
    onGeneratingChange?.(next);
  };

  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const centreOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : null;
  };

  /** Adds items to the tray; each flies in from `from` when there is one. */
  const addItems = (
    incoming: DockItem[],
    from: { x: number; y: number } | null,
  ) => {
    const fresh = incoming.filter(
      (i, k) =>
        !items.some((c) => c.id === i.id) &&
        incoming.findIndex((j) => j.id === i.id) === k,
    );
    if (fresh.length === 0) return;
    commitContext([...items, ...fresh]);
    if (motionSafe && from) {
      const added = fresh.map((item, order) => {
        seq.current += 1;
        return { key: seq.current, item, from, order };
      });
      setFlights((f) => [...f, ...added]);
    } else {
      audio.play("pop", { pitch: 1, gain: 0.5, pan: panOf(toggleRef.current) });
    }
    say(
      fresh.length === 1
        ? `Added ${fresh[0]?.name ?? "an item"} to context.`
        : `Added ${fresh.length} items to context.`,
    );
  };

  const fromFiles = (files: File[]): DockItem[] =>
    files.map((f) => {
      seq.current += 1;
      return {
        id: `${uid}-file-${seq.current}`,
        kind: kindOf(f.name),
        name: f.name,
        tokens: Math.max(20, Math.round(f.size / 4)),
        detail: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      };
    });

  const takeFiles = (
    list: FileList | null,
    from: { x: number; y: number } | null,
  ) => {
    if (disabled || !list || list.length === 0) return;
    const files = Array.from(list);
    onFilesAdd?.(files);
    addItems(fromFiles(files), from);
  };

  const remove = (item: DockItem, el: Element | null) => {
    if (disabled) return;
    const index = items.findIndex((i) => i.id === item.id);
    commitContext(items.filter((i) => i.id !== item.id));
    audio.play("click", { pitch: 0.8, gain: 0.4, pan: panOf(el) });
    say(`Removed ${item.name}.`);
    // Focus goes to the chip that took its place, or back to the box.
    const next = items[index + 1] ?? items[index - 1];
    requestAnimationFrame(() => {
      const node = next ? chipNodes.current.get(next.id) : null;
      const button = node?.querySelector<HTMLButtonElement>("button");
      (button ?? areaRef.current)?.focus();
    });
  };

  const choose = (item: DockItem) => {
    if (!mention) return;
    const from = centreOf(optionNodes.current.get(item.id));
    const after = text.slice(0, mention.start) + text.slice(caret);
    pendingCaret.current = mention.start;
    commitText(after);
    setCaret(mention.start);
    setActive(0);
    addItems([item], from);
  };

  const toggleTray = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    audio.play("click", {
      pitch: trayOpen ? 0.9 : 1.1,
      gain: 0.4,
      pan: panOf(event.currentTarget),
    });
    setUserOpen(!trayOpen);
  };

  const send = () => {
    if (disabled || generating || empty || over) return;
    const message: DockMessage = {
      text: text.trim(),
      context: items,
      model: modelId,
    };
    audio.play("swish", { pitch: 1, gain: 0.5, pan: panOf(areaRef.current) });
    seq.current += 1;
    setGhost({ key: seq.current, text });
    commitText("");
    setCaret(0);
    setGenerating(true);
    onSend?.(message);
    say(`Sent to ${current?.name ?? "the model"}.`);
  };

  const stop = (el: Element | null) => {
    if (!generating) return;
    audio.play("click", { pitch: 0.8, gain: 0.5, pan: panOf(el) });
    setGenerating(false);
    onStop?.();
    say("Stopped.");
  };

  const pickModel = (index: number, el: Element | null) => {
    const m = models[index];
    focusNext.current = "pill";
    setPicking(false);
    if (!m || m.id === modelId) return;
    setSlide(index > modelIndex ? 1 : -1);
    setOwnModel(m.id);
    onModelChange?.(m.id);
    audio.play("click", {
      pitch: index > modelIndex ? 1.15 : 0.9,
      gain: 0.45,
      pan: panOf(el),
    });
    say(`Model: ${m.name}.`);
  };

  const openPicker = () => {
    if (disabled || models.length < 2) return;
    setHi(modelIndex);
    focusNext.current = "list";
    setPicking(true);
  };

  /* ------------------------------ effects ------------------------------ */

  // The box grows with its text, up to `maxRows`, then scrolls.
  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = LINE * rows + 12;
    const next = Math.min(
      cap,
      Math.max(LINE * Math.min(2, rows) + 12, el.scrollHeight),
    );
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
    if (pendingCaret.current !== null) {
      const at = pendingCaret.current;
      pendingCaret.current = null;
      el.setSelectionRange(at, at);
    }
  }, [text, rows]);

  // The dock's height is measured — bound when its node arrives — and
  // glides as the tray, menu and text change.
  const measureInner = React.useCallback((node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight;
      setHeight(r2(h));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // The highlighted option stays in view, inside the menu only.
  React.useEffect(() => {
    if (!activeItem) return;
    const node = optionNodes.current.get(activeItem.id);
    const list = node?.parentElement;
    if (!node || !list) return;
    if (node.offsetTop < list.scrollTop) list.scrollTop = node.offsetTop;
    else if (
      node.offsetTop + node.offsetHeight >
      list.scrollTop + list.clientHeight
    )
      list.scrollTop = node.offsetTop + node.offsetHeight - list.clientHeight;
  }, [activeItem]);

  // A press outside the dock puts the model picker away.
  React.useEffect(() => {
    if (!picking) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      focusNext.current = null;
      setPicking(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [picking]);

  /* ------------------------------ derived ------------------------------ */

  const trayOpenRef = React.useRef(trayOpen);
  React.useEffect(() => {
    trayOpenRef.current = trayOpen;
  });
  const getRoot = React.useCallback(() => innerRef.current, []);
  // Where a flyer lands: its chip, brought into view at the tray's end first
  // (new chips go on the end), or the count when the tray is collapsed.
  const getTarget = React.useCallback((id: string) => {
    const chip = trayOpenRef.current ? chipNodes.current.get(id) : null;
    const list = trayListRef.current;
    if (chip && list) list.scrollLeft = list.scrollWidth;
    return chip ?? toggleRef.current;
  }, []);
  const flying = new Set(flights.map((f) => f.item.id));

  const fill = useMotionValue(clamp01(ratio));
  const heat = useMotionValue(ratio);
  const bump = useMotionValue(1);
  const lastRatio = React.useRef(ratio);
  React.useEffect(() => {
    const before = lastRatio.current;
    lastRatio.current = ratio;
    if (!motionSafe) {
      fill.set(clamp01(ratio));
      heat.set(ratio);
      return;
    }
    const a = animate(fill, clamp01(ratio), springs.glide);
    const b = animate(heat, ratio, springs.glide);
    const crossed =
      (before < 0.9 && ratio >= 0.9) || (before <= 1 && ratio > 1);
    let c: AnimationPlaybackControls | null = null;
    if (crossed) {
      bump.jump(1.18);
      c = animate(bump, 1, springs.recoil);
    }
    return () => {
      a.stop();
      b.stop();
      c?.stop();
      bump.set(1);
    };
  }, [ratio, motionSafe, fill, heat, bump]);
  const tint = useTransform(heat, (h) => {
    if (h < 0.7) return "var(--ink-3)";
    if (h < 0.9)
      return `color-mix(in oklab, var(--warn) ${Math.round(((h - 0.7) / 0.2) * 100)}%, var(--ink-3))`;
    if (h < 1)
      return `color-mix(in oklab, var(--danger) ${Math.round(((h - 0.9) / 0.1) * 100)}%, var(--warn))`;
    return "var(--danger)";
  });
  const ringLength = useTransform(fill, (f) => r2(Math.max(0.001, f)));

  const morph = useMotionValue(generating ? 1 : 0);
  React.useEffect(() => {
    const to = generating ? 1 : 0;
    if (!motionSafe) {
      morph.set(to);
      return;
    }
    const a = animate(morph, to, springs.snap);
    return () => a.stop();
  }, [generating, motionSafe, morph]);
  const glyph = useTransform(morph, (t) => morphPath(clamp01(t)));

  // The model picker's highlight slides between options on snap.
  const pillX = useMotionValue(0);
  const pillW = useMotionValue(0);
  const hiId = models[hi]?.id;
  React.useLayoutEffect(() => {
    if (!picking || !hiId) return;
    const node = modelNodes.current.get(hiId);
    if (!node) return;
    const x = node.offsetLeft;
    const w = node.offsetWidth;
    if (!motionSafe || pillW.get() === 0) {
      pillX.jump(x);
      pillW.jump(w);
      return;
    }
    const a = animate(pillX, x, springs.snap);
    const b = animate(pillW, w, springs.snap);
    return () => {
      a.stop();
      b.stop();
    };
  }, [picking, hiId, motionSafe, pillX, pillW]);

  // Focus follows the picker when it arrives and the pill when it comes back.
  const bindPicker = React.useCallback((node: HTMLDivElement | null) => {
    if (!node || focusNext.current !== "list") return;
    focusNext.current = null;
    node
      .querySelector<HTMLElement>("[role='option'][aria-selected='true']")
      ?.focus();
  }, []);
  const bindPill = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node || focusNext.current !== "pill") return;
    focusNext.current = null;
    node.focus();
  }, []);

  const spin = generating && motionSafe && inView && visible;
  const canSend = !disabled && !generating && !empty && !over;

  /* ------------------------------- keys -------------------------------- */

  const onAreaKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (menuOpen) {
      const n = offered.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (n === 0) return;
        setActive((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + n) % n);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && activeItem) {
        event.preventDefault();
        choose(activeItem);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (mention) setDismissed(mention.start);
        return;
      }
    }
    if (event.key === "Escape" && generating) {
      event.preventDefault();
      stop(event.currentTarget);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
      return;
    }
    if (
      event.key === "Backspace" &&
      text.length === 0 &&
      items.length > 0 &&
      !disabled
    ) {
      const last = items[items.length - 1];
      if (last) {
        event.preventDefault();
        commitContext(items.slice(0, -1));
        audio.play("click", {
          pitch: 0.8,
          gain: 0.4,
          pan: panOf(event.currentTarget),
        });
        say(`Removed ${last.name}.`);
      }
    }
  };

  const onPickerKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = models.length;
    const move = (to: number) => {
      const k = (to + n) % n;
      setHi(k);
      const id = models[k]?.id;
      if (id) modelNodes.current.get(id)?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(hi + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(hi - 1);
        return;
      case "Home":
        event.preventDefault();
        move(0);
        return;
      case "End":
        event.preventDefault();
        move(n - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        pickModel(hi, event.target instanceof Element ? event.target : null);
        return;
      case "Escape":
        event.preventDefault();
        focusNext.current = "pill";
        setPicking(false);
        return;
    }
  };

  /* ------------------------------- render ------------------------------- */

  const iconButton = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
    FOCUS,
  );
  const stagger = cascade(Math.max(1, offered.length));
  const nameOf = (m: DockModel) => m.short ?? m.name;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onDragEnter={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setDragOver(false);
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragOver(false);
        takeFiles(event.dataTransfer.files, {
          x: event.clientX,
          y: event.clientY,
        });
      }}
      className={cn(
        "@container relative w-full",
        disabled && "opacity-60",
        className,
      )}
    >
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden rounded-4 border border-hairline-strong bg-card text-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_10%,transparent)]"
      >
        <div ref={measureInner} className="relative flex flex-col gap-2 p-2">
          {/* The tray, or in its place the @ menu. */}
          {menuOpen ? (
            <div
              id={listId}
              role="listbox"
              aria-label="Add context"
              className="relative [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-3 bg-surface-1 p-1"
              style={{ maxHeight: OPTION_H * MENU_ROWS + 8 }}
            >
              {offered.length === 0 ? (
                <p className="flex h-8 items-center px-2.5 text-xs text-ink-3">
                  Nothing matches “{mention?.query}”
                </p>
              ) : (
                <>
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 top-1 rounded-2 bg-cobalt-wash"
                    style={{ height: OPTION_H }}
                    initial={false}
                    animate={{ y: activeIndex * OPTION_H }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                  {offered.map(({ item, at }, k) => {
                    const q = mention?.query.length ?? 0;
                    return (
                      <motion.div
                        key={item.id}
                        ref={(node) => {
                          if (node) optionNodes.current.set(item.id, node);
                          else optionNodes.current.delete(item.id);
                        }}
                        id={`${uid}-opt-${item.id}`}
                        role="option"
                        aria-selected={k === activeIndex}
                        onPointerMove={() => {
                          if (k !== activeIndex) setActive(k);
                        }}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => choose(item)}
                        initial={
                          motionSafe
                            ? { opacity: 0, y: distances.nudge }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? { ...springs.snap, delay: k * stagger }
                            : { duration: durations.fast }
                        }
                        className="relative flex cursor-pointer items-center gap-2.5 rounded-2 px-2.5 text-[13px]"
                        style={{ height: OPTION_H }}
                      >
                        <ItemIcon
                          kind={item.kind}
                          className={
                            k === activeIndex
                              ? "text-cobalt-bright"
                              : "text-ink-3"
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-ink-2">
                          {at >= 0 && q > 0 ? (
                            <>
                              {item.name.slice(0, at)}
                              <span className="font-medium text-foreground">
                                {item.name.slice(at, at + q)}
                              </span>
                              {item.name.slice(at + q)}
                            </>
                          ) : (
                            <span className="text-foreground">{item.name}</span>
                          )}
                        </span>
                        <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[36rem]:inline">
                          {item.detail}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                          {short(item.tokens)}
                        </span>
                      </motion.div>
                    );
                  })}
                </>
              )}
            </div>
          ) : items.length > 0 || flights.length > 0 ? (
            <LayoutGroup id={`${uid}-tray`}>
              <div className="flex h-7 items-center gap-1.5">
                <motion.button
                  ref={toggleRef}
                  type="button"
                  layout={motionSafe ? "position" : false}
                  aria-expanded={trayOpen}
                  aria-controls={trayId}
                  aria-label={
                    trayOpen
                      ? `Collapse context, ${items.length} ${items.length === 1 ? "item" : "items"}`
                      : `Show context, ${items.length} ${items.length === 1 ? "item" : "items"}, ${short(items.reduce((s, i) => s + i.tokens, 0))} tokens`
                  }
                  disabled={disabled}
                  onClick={toggleTray}
                  transition={springs.glide}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 text-xs text-ink-2 transition-colors hover:border-hairline-strong hover:text-foreground disabled:pointer-events-none",
                    trayOpen ? "px-2" : "pr-2.5 pl-1",
                    FOCUS,
                  )}
                >
                  {trayOpen ? (
                    <>
                      <span className="font-mono text-[11px] tabular-nums">
                        {items.length}
                      </span>
                      <ChevronsLeft aria-hidden className="size-3.5" />
                    </>
                  ) : (
                    <>
                      <span className="flex -space-x-1.5">
                        {items.slice(0, 4).map((item, k) => (
                          <motion.span
                            key={item.id}
                            layoutId={
                              motionSafe ? `${uid}-ico-${item.id}` : undefined
                            }
                            transition={springs.glide}
                            className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-ink-2 ring-2 ring-surface-1"
                            style={{ zIndex: 4 - k }}
                          >
                            <ItemIcon kind={item.kind} className="size-3" />
                          </motion.span>
                        ))}
                      </span>
                      <span className="whitespace-nowrap text-foreground">
                        {items.length} in context
                      </span>
                      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                        {short(items.reduce((s, i) => s + i.tokens, 0))}
                      </span>
                      <ChevronsRight aria-hidden className="size-3.5" />
                    </>
                  )}
                </motion.button>
                {trayOpen ? (
                  <motion.ul
                    ref={trayListRef}
                    id={trayId}
                    aria-label="Context"
                    layoutScroll
                    className="flex h-7 min-w-0 flex-1 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-16px),transparent)]"
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {items.map((item) => (
                        <motion.li
                          key={item.id}
                          ref={(node) => {
                            if (node) chipNodes.current.set(item.id, node);
                            else chipNodes.current.delete(item.id);
                          }}
                          layout={motionSafe ? "position" : false}
                          initial={false}
                          exit={{
                            opacity: 0,
                            scale: motionSafe ? 0.9 : 1,
                            transition: exitFor(durations.fast),
                          }}
                          transition={springs.glide}
                          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 pr-0.5 pl-1 text-xs"
                          style={{ opacity: flying.has(item.id) ? 0 : 1 }}
                        >
                          <motion.span
                            layoutId={
                              motionSafe ? `${uid}-ico-${item.id}` : undefined
                            }
                            transition={springs.glide}
                            className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-ink-2"
                          >
                            <ItemIcon kind={item.kind} className="size-3" />
                          </motion.span>
                          <span
                            className="max-w-[9rem] truncate text-foreground"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <span className="hidden font-mono text-[10px] text-ink-3 tabular-nums @min-[44rem]:inline">
                            {short(item.tokens)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${item.name}`}
                            disabled={disabled}
                            onClick={(event) =>
                              remove(item, event.currentTarget)
                            }
                            className={cn(
                              "inline-flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                              FOCUS_IN,
                            )}
                          >
                            <X aria-hidden className="size-3" />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </motion.ul>
                ) : null}
              </div>
            </LayoutGroup>
          ) : null}

          <div className="relative">
            <textarea
              ref={areaRef}
              rows={Math.min(2, rows)}
              value={text}
              disabled={disabled}
              // No placeholder under the sent text while it lifts away.
              placeholder={
                ghost
                  ? ""
                  : generating
                    ? "Writing a reply. Press Escape to stop."
                    : placeholder
              }
              aria-label={label}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? listId : undefined}
              aria-activedescendant={
                menuOpen && activeItem
                  ? `${uid}-opt-${activeItem.id}`
                  : undefined
              }
              aria-describedby={meterId}
              onChange={(event) => {
                const el = event.currentTarget;
                commitText(el.value);
                setCaret(el.selectionStart ?? el.value.length);
                setActive(0);
              }}
              onSelect={(event) => {
                const el = event.currentTarget;
                setCaret(el.selectionStart ?? 0);
              }}
              onKeyDown={onAreaKey}
              onBlur={() => setDismissed(mention?.start ?? null)}
              onFocus={() => setDismissed(null)}
              className={cn(
                "block w-full resize-none [scrollbar-width:thin] rounded-2 bg-transparent px-2 py-1.5 text-sm leading-5 text-foreground placeholder:text-ink-3",
                FOCUS_IN,
              )}
              style={{ height: LINE * Math.min(2, rows) + 12 }}
            />
            <AnimatePresence>
              {ghost ? (
                <motion.p
                  key={ghost.key}
                  aria-hidden
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: motionSafe ? -12 : 0 }}
                  transition={{ duration: 0.28, ease: easings.exit }}
                  onAnimationComplete={() =>
                    setGhost((g) => (g && g.key === ghost.key ? null : g))
                  }
                  className="pointer-events-none absolute inset-x-0 top-0 line-clamp-2 px-2 py-1.5 text-sm leading-5 whitespace-pre-wrap text-foreground"
                >
                  {ghost.text}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex h-8 items-center gap-1">
            <AnimatePresence initial={false}>
              {picking ? null : (
                <motion.div
                  key="tools"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{
                    opacity: 0,
                    width: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                  className="flex shrink-0 items-center gap-1 overflow-hidden"
                >
                  <button
                    ref={attachRef}
                    type="button"
                    aria-label="Attach files"
                    disabled={disabled}
                    onClick={() => fileRef.current?.click()}
                    className={iconButton}
                  >
                    <Paperclip aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Add context with @"
                    disabled={disabled}
                    onClick={() => {
                      const el = areaRef.current;
                      if (!el) return;
                      const at = el.selectionStart ?? text.length;
                      const lead =
                        at > 0 && !/\s/.test(text[at - 1] ?? "") ? " @" : "@";
                      const next = text.slice(0, at) + lead + text.slice(at);
                      pendingCaret.current = at + lead.length;
                      commitText(next);
                      setCaret(at + lead.length);
                      setDismissed(null);
                      setActive(0);
                      el.focus();
                    }}
                    className={iconButton}
                  >
                    <AtSign aria-hidden className="size-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={accept}
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={(event) => {
                takeFiles(
                  event.currentTarget.files,
                  centreOf(attachRef.current),
                );
                event.currentTarget.value = "";
              }}
            />

            {models.length > 0 ? (
              <AnimatePresence initial={false} mode="wait">
                {picking ? (
                  <motion.div
                    key="picker"
                    ref={bindPicker}
                    role="listbox"
                    aria-label="Model"
                    aria-orientation="horizontal"
                    onKeyDown={onPickerKey}
                    onBlur={(event) => {
                      const next = event.relatedTarget;
                      if (
                        next instanceof Node &&
                        event.currentTarget.contains(next)
                      )
                        return;
                      focusNext.current = null;
                      setPicking(false);
                    }}
                    initial={{ opacity: 0, scaleX: motionSafe ? 0.92 : 1 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe ? springs.snap : { duration: durations.fast }
                    }
                    className="relative flex h-8 min-w-0 origin-left items-center rounded-full border border-hairline-strong bg-surface-1 p-0.5"
                  >
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-full bg-cobalt-wash"
                      style={{ x: pillX, width: pillW }}
                    />
                    {models.map((m, k) => (
                      <div
                        key={m.id}
                        ref={(node) => {
                          if (node) modelNodes.current.set(m.id, node);
                          else modelNodes.current.delete(m.id);
                        }}
                        role="option"
                        aria-selected={k === modelIndex}
                        tabIndex={k === hi ? 0 : -1}
                        title={m.note ? `${m.name} · ${m.note}` : m.name}
                        onPointerEnter={() => setHi(k)}
                        onClick={(event) => pickModel(k, event.currentTarget)}
                        className={cn(
                          "relative flex h-7 cursor-pointer items-center rounded-full px-2.5 text-xs whitespace-nowrap transition-colors",
                          k === hi
                            ? "text-cobalt-bright"
                            : "text-ink-2 hover:text-foreground",
                          FOCUS_IN,
                        )}
                      >
                        <span className="@min-[36rem]:hidden">{nameOf(m)}</span>
                        <span className="hidden @min-[36rem]:inline">
                          {m.name}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.button
                    key="pill"
                    ref={bindPill}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={false}
                    aria-label={`Model: ${current?.name ?? ""}`}
                    disabled={disabled || models.length < 2}
                    onClick={openPicker}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.fast }}
                    className={cn(
                      "inline-flex h-8 min-w-0 items-center gap-1 rounded-full border border-hairline bg-surface-1 pr-2 pl-3 text-xs text-foreground transition-colors hover:border-hairline-strong disabled:pointer-events-none",
                      FOCUS,
                    )}
                  >
                    {/* Every name in one cell, so the pill keeps the width of
                        the longest and its neighbours never shift. */}
                    <span className="relative grid overflow-hidden">
                      {models.map((m) => (
                        <span
                          key={m.id}
                          aria-hidden
                          className="invisible col-start-1 row-start-1 whitespace-nowrap"
                        >
                          <span className="@min-[36rem]:hidden">
                            {nameOf(m)}
                          </span>
                          <span className="hidden @min-[36rem]:inline">
                            {m.name}
                          </span>
                        </span>
                      ))}
                      <AnimatePresence initial={false} custom={slide}>
                        <motion.span
                          key={modelId}
                          aria-hidden
                          custom={slide}
                          variants={{
                            enter: (d: number) => ({
                              y: motionSafe ? d * distances.step : 0,
                              opacity: 0,
                            }),
                            center: { y: 0, opacity: 1 },
                            leave: (d: number) => ({
                              y: motionSafe ? -d * distances.step : 0,
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }),
                          }}
                          initial="enter"
                          animate="center"
                          exit="leave"
                          transition={
                            motionSafe
                              ? springs.snap
                              : { duration: durations.fast }
                          }
                          className="col-start-1 row-start-1 whitespace-nowrap"
                        >
                          {current ? (
                            <>
                              <span className="@min-[36rem]:hidden">
                                {nameOf(current)}
                              </span>
                              <span className="hidden @min-[36rem]:inline">
                                {current.name}
                              </span>
                            </>
                          ) : null}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className="size-3.5 shrink-0 text-ink-3"
                    />
                  </motion.button>
                )}
              </AnimatePresence>
            ) : null}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <motion.div
                id={meterId}
                className="flex items-center gap-1.5"
                style={{ scale: bump }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-4 -rotate-90"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    fill="none"
                    strokeWidth="2"
                    className="stroke-hairline-strong"
                  />
                  <motion.circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{ pathLength: ringLength, stroke: tint }}
                  />
                </svg>
                <span
                  className={cn(
                    "font-mono text-[11px] whitespace-nowrap tabular-nums",
                    over
                      ? "text-danger"
                      : ratio >= 0.9
                        ? "text-warn"
                        : "text-ink-3",
                  )}
                >
                  <span className="sr-only">
                    {over
                      ? `Over the token limit by ${total - budget}. `
                      : `${total} of ${budget} tokens. `}
                  </span>
                  <span aria-hidden>
                    {over ? (
                      <>
                        <span className="@min-[36rem]:hidden">
                          +{short(total - budget)}
                        </span>
                        <span className="hidden @min-[36rem]:inline">
                          Over by {short(total - budget)}
                        </span>
                      </>
                    ) : (
                      <>
                        {short(total)}
                        <span className="hidden @min-[36rem]:inline">
                          {" "}
                          / {short(budget)}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </motion.div>

              <button
                type="button"
                aria-label={generating ? "Stop generating" : "Send"}
                aria-disabled={!generating && !canSend ? true : undefined}
                aria-describedby={over ? meterId : undefined}
                disabled={disabled}
                onClick={(event) => {
                  if (generating) stop(event.currentTarget);
                  else send();
                }}
                className={cn(
                  "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  generating || canSend
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-surface-2 text-ink-3",
                  FOCUS,
                )}
              >
                <svg aria-hidden viewBox="0 0 16 16" className="size-4">
                  <motion.path
                    d={glyph}
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth={1.1}
                    strokeLinejoin="round"
                  />
                </svg>
                {generating ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 32 32"
                    className={cn(
                      "absolute inset-0 size-8",
                      spin && "animate-spin",
                    )}
                  >
                    <circle
                      cx="16"
                      cy="16"
                      r="14.5"
                      fill="none"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeDasharray="22 70"
                      className="stroke-primary-foreground/70"
                    />
                  </svg>
                ) : null}
              </button>
            </div>
          </div>

          {flights.map((flight) => (
            <Flyer
              key={flight.key}
              flight={flight}
              getRoot={getRoot}
              getTarget={getTarget}
              onLand={(key) => {
                setFlights((f) => f.filter((x) => x.key !== key));
                audio.play("pop", {
                  pitch: 1 + flight.order * 0.08,
                  gain: 0.5,
                  pan: panOf(toggleRef.current),
                });
              }}
            />
          ))}

          <AnimatePresence>
            {dragOver ? (
              <motion.div
                key="veil"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center gap-2 rounded-3 border border-dashed border-cobalt-bright bg-card text-[13px] text-cobalt-bright"
              >
                <Upload className="size-4" />
                Drop to add to context
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
