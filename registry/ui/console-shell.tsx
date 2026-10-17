"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  CircleCheck,
  CircleX,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Hammer,
  Info,
  LoaderCircle,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type ConsoleShellAccentName = "cobalt" | "plum" | "mint" | "ink";
export type ConsoleSnapPoints = "quarter" | "half" | "free";
export type ConsoleStatusStyle = "counts" | "pills" | "minimal";
export type ConsolePanelTab = "problems" | "output" | "console";
export type ConsoleBuild = "idle" | "building" | "passed" | "failed";

export type ConsoleFile = {
  id: string;
  /** "sensor.c". */
  name: string;
  /** Folder it sits in, "" for the project root: "src". */
  folder: string;
  lines: string[];
};

export type ConsoleProblem = {
  id: string;
  /** The file id it is in. */
  file: string;
  line: number;
  col?: number;
  severity: "error" | "warning" | "info";
  message: string;
};

export type ConsoleLine = {
  id: string;
  text: string;
  tone?: "muted" | "error" | "warn" | "success" | "command";
};

export type ConsoleShellProps = {
  /** The project's files; the explorer groups them by folder. @default defaultConsoleFiles */
  files?: ConsoleFile[];
  /** The file open first. @default the first file with a problem */
  defaultFile?: string;
  /** What the last build found. @default defaultConsoleProblems */
  problems?: ConsoleProblem[];
  /** The build log. @default defaultConsoleOutput */
  output?: ConsoleLine[];
  /** The console's history, oldest first. @default defaultConsoleHistory */
  history?: ConsoleLine[];
  /** Controlled panel tab. */
  tab?: ConsolePanelTab;
  /** Initial tab when uncontrolled. @default "problems" */
  defaultTab?: ConsolePanelTab;
  /** Fires from the tablist, the status counts or a shortcut that changed the tab. */
  onTabChange?: (tab: ConsolePanelTab) => void;
  /** Controlled panel height as a share of the space above the status bar, 0 (closed) to 1. */
  panel?: number;
  /** Initial panel height when uncontrolled. @default 0 */
  defaultPanel?: number;
  /** Fires when a drag, key or button settles the panel on a new height. */
  onPanelResize?: (height: number) => void;
  /** A command was entered in the console (or Build was pressed: "build"). */
  onRunCommand?: (command: string) => void;
  /** A problem was chosen; the editor has already opened its line. */
  onOpenProblem?: (problem: ConsoleProblem) => void;
  /** The build's state, shown in the status bar. @default "failed" */
  build?: ConsoleBuild;
  /** While building, how far along, 0 to 1. @default 0 */
  buildProgress?: number;
  /** Items on the right of the status bar. @default Ln/Col, encoding, board */
  statusItems?: { id: string; label: string }[];
  /** The project's name in the title bar. @default "Gaugeworks · gauge-fw" */
  project?: string;
  /** The branch in the status bar. @default "main" */
  branch?: string;
  /** The frame's height in px. @default 520 */
  frameHeight?: number;
  /** Where the panel can rest: closed, a quarter, half or full; closed, half or full; or anywhere it is let go. @default "quarter" */
  snapPoints?: ConsoleSnapPoints;
  /** How the status bar shows problems: icons and numbers, tinted pills, or one dot and a phrase. @default "counts" */
  statusStyle?: ConsoleStatusStyle;
  /** Focus, selection and the panel's edge. @default "cobalt" */
  accent?: ConsoleShellAccentName | (string & {});
  /** Read only: the panel cannot move and nothing runs. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultConsoleFiles: ConsoleFile[] = [
  {
    id: "sensor-c",
    name: "sensor.c",
    folder: "src",
    lines: [
      '#include "sensor.h"',
      '#include "board.h"',
      "",
      "#define SAMPLE_HZ  200",
      "#define SMOOTHING  0.12f",
      "",
      "static float level = 0.0f;",
      "static uint16_t raw_last;",
      "",
      "void sensor_init(void) {",
      "    adc_enable(ADC_CH_GAUGE);",
      "    timer_start(TIMER_SAMPLE, SAMPLE_HZ);",
      "}",
      "",
      "float sensor_read(void) {",
      "    uint16_t raw = adc_read(ADC_CH_GAUGE);",
      "    level += SMOOTHING * (raw_scaled(raw) - level);",
      "    raw_last = raw",
      "    return level;",
      "}",
      "",
      "int sensor_selftest(void) {",
      "    if (raw_last == 0) return -1; // no sample yet",
      "    return calibrate(raw_last, &level);",
      "}",
    ],
  },
  {
    id: "sensor-h",
    name: "sensor.h",
    folder: "src",
    lines: [
      "#pragma once",
      "#include <stdint.h>",
      "",
      "void sensor_init(void);",
      "float sensor_read(void);",
      "int sensor_selftest(void);",
    ],
  },
  {
    id: "main-c",
    name: "main.c",
    folder: "src",
    lines: [
      '#include "sensor.h"',
      '#include "display.h"',
      "",
      "int main(void) {",
      "    board_init();",
      "    sensor_init();",
      "    display_init();",
      "",
      "    for (;;) {",
      "        float level = sensor_read();",
      "        display_needle(level);",
      "        watchdog_kick();",
      "    }",
      "}",
    ],
  },
  {
    id: "display-c",
    name: "display.c",
    folder: "src",
    lines: [
      '#include "display.h"',
      "",
      "// Needle sweeps 270 degrees across the dial.",
      "void display_needle(float level) {",
      "    int frame_ms = 16;",
      "    servo_write(SERVO_NEEDLE, level * 270.0f);",
      "}",
    ],
  },
  {
    id: "board-toml",
    name: "board.toml",
    folder: "",
    lines: [
      "[board]",
      'name = "gauge-r3"',
      'mcu = "gw-m4"',
      "",
      "[pins]",
      'gauge_adc = "PA4"',
      'needle = "PB6"',
      'display_cs = "PA4"',
    ],
  },
];

export const defaultConsoleProblems: ConsoleProblem[] = [
  {
    id: "p1",
    file: "sensor-c",
    line: 18,
    col: 20,
    severity: "error",
    message: "expected ‘;’ after expression",
  },
  {
    id: "p2",
    file: "sensor-c",
    line: 24,
    col: 12,
    severity: "error",
    message: "implicit declaration of function ‘calibrate’",
  },
  {
    id: "p3",
    file: "display-c",
    line: 5,
    col: 9,
    severity: "warning",
    message: "unused variable ‘frame_ms’",
  },
  {
    id: "p4",
    file: "main-c",
    line: 12,
    col: 9,
    severity: "warning",
    message: "result of ‘watchdog_kick’ is ignored",
  },
  {
    id: "p5",
    file: "board-toml",
    line: 8,
    severity: "warning",
    message: "pin PA4 is already the gauge ADC input",
  },
];

export const defaultConsoleOutput: ConsoleLine[] = [
  { id: "o1", text: "> gauge build --board gauge-r3", tone: "command" },
  { id: "o2", text: "Compiling src/main.c", tone: "muted" },
  { id: "o3", text: "Compiling src/sensor.c", tone: "muted" },
  {
    id: "o4",
    text: "src/sensor.c:18:20: error: expected ‘;’ after expression",
    tone: "error",
  },
  {
    id: "o5",
    text: "src/sensor.c:24:12: error: implicit declaration of function ‘calibrate’",
    tone: "error",
  },
  { id: "o6", text: "Compiling src/display.c", tone: "muted" },
  {
    id: "o7",
    text: "src/display.c:5:9: warning: unused variable ‘frame_ms’",
    tone: "warn",
  },
  {
    id: "o8",
    text: "Build failed · 2 errors, 3 warnings · 3.4 s",
    tone: "error",
  },
];

export const defaultConsoleHistory: ConsoleLine[] = [
  { id: "h1", text: "$ gauge flash --port usb0", tone: "command" },
  { id: "h2", text: "Nothing to flash: the last build failed.", tone: "warn" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const SNAPS: Record<ConsoleSnapPoints, number[]> = {
  quarter: [0, 0.25, 0.5, 1],
  half: [0, 0.5, 1],
  free: [0, 1],
};

const ACCENTS: Record<ConsoleShellAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TITLE_H = 36;
const STATUS_H = 26;

const KEYWORDS = new Set([
  "void",
  "float",
  "int",
  "static",
  "return",
  "if",
  "for",
  "const",
  "struct",
]);
const TYPES = new Set(["uint16_t", "uint8_t", "uint32_t", "size_t"]);

type Tok = {
  text: string;
  kind: "kw" | "type" | "num" | "str" | "com" | "pre" | "plain";
};

/** Just enough C (and TOML) colouring to read like an editor; no parser. */
const tokenize = (line: string): Tok[] => {
  if (/^\s*#/.test(line)) return [{ text: line, kind: "pre" }];
  if (/^\s*\[.*\]\s*$/.test(line)) return [{ text: line, kind: "kw" }];
  const out: Tok[] = [];
  const re =
    /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?f?\b)|([A-Za-z_]\w*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [all, com, str, num, word] = m;
    if (com) out.push({ text: com, kind: "com" });
    else if (str) out.push({ text: str, kind: "str" });
    else if (num) out.push({ text: num, kind: "num" });
    else if (word)
      out.push({
        text: word,
        kind: KEYWORDS.has(word) ? "kw" : TYPES.has(word) ? "type" : "plain",
      });
    else out.push({ text: all, kind: "plain" });
  }
  return out;
};

const TOK_CLASS: Record<Tok["kind"], string> = {
  kw: "text-[var(--cs-ink)]",
  type: "text-[oklch(from_var(--cs-ink)_l_c_calc(h+70))]",
  num: "text-warn",
  str: "text-success",
  com: "text-ink-3 italic",
  pre: "text-ink-2",
  plain: "text-foreground",
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/* ----------------------------------------------------------------------- */
/*                               Rolling count                              */
/* ----------------------------------------------------------------------- */

/**
 * One number that rolls a face on snap the way it moved — up from below when
 * it grew — stacked in one cell so a quick second change never waits.
 */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setDir(value > prev ? 1 : -1);
    setPrev(value);
  }
  return (
    <span className="relative inline-grid overflow-hidden tabular-nums">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="col-start-1 row-start-1"
          variants={{
            enter: (d: number | undefined) => ({
              y: motionSafe
                ? `${(typeof d === "number" ? d : 1) * 100}%`
                : "0%",
              opacity: 0,
            }),
            center: { y: "0%", opacity: 1 },
            leave: (d: number | undefined) => ({
              y: motionSafe
                ? `${-(typeof d === "number" ? d : 1) * 100}%`
                : "0%",
              opacity: 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="center"
          exit="leave"
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An editor-style frame for a firmware project — title bar, file explorer,
 * an editor with file tabs, a bottom panel (Problems, Output, Console) and a
 * slim status bar — whose panel is pulled up by its edge.
 *
 * The pull is the moment it is built for. The edge follows the finger 1:1,
 * rubber-banding past full height; on release the height is projected with
 * the release velocity and committed to the nearest snap point — closed, a
 * quarter, half or full — on `glide`, which takes the throw's velocity, so a
 * flick up from closed lands high and a flick down shuts it. Closed, only the
 * status bar is left, and its counts roll one face on `snap` when new
 * problems arrive, the way they moved, while their chip warms once.
 *
 * Cmd or Ctrl+J toggles the panel (back to the height it had), F6 and
 * Shift+F6 move focus between explorer, editor, panel and status bar, and the
 * edge itself is a separator: Up and Down step its snap points, Home closes,
 * End fills, Enter toggles. Choosing a problem opens its line in the editor.
 * Below a 34rem container the explorer goes and the panel is a full-height
 * sheet. Under reduced motion the panel still follows the finger but lands
 * without travel, and counts change without rolling.
 */
export function ConsoleShell({
  files = defaultConsoleFiles,
  defaultFile,
  problems = defaultConsoleProblems,
  output = defaultConsoleOutput,
  history = defaultConsoleHistory,
  tab: tabProp,
  defaultTab = "problems",
  onTabChange,
  panel: panelProp,
  defaultPanel = 0,
  onPanelResize,
  onRunCommand,
  onOpenProblem,
  build = "failed",
  buildProgress = 0,
  statusItems,
  project: projectName = "Gaugeworks · gauge-fw",
  branch = "main",
  frameHeight = 520,
  snapPoints = "quarter",
  statusStyle = "counts",
  accent = "cobalt",
  disabled = false,
  className,
}: ConsoleShellProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const panelId = `${uid}-panel`;

  /* ------------------------------- state ------------------------------- */

  const firstProblemFile = problems[0]?.file;
  const [openFiles, setOpenFiles] = React.useState<string[]>(() => {
    const first = defaultFile ?? firstProblemFile ?? files[0]?.id ?? "";
    const second = files.find((f) => f.id !== first && f.name.endsWith(".c"));
    return second ? [first, second.id] : [first];
  });
  const [fileId, setFileId] = React.useState<string>(
    () => defaultFile ?? firstProblemFile ?? files[0]?.id ?? "",
  );
  const file = files.find((f) => f.id === fileId) ?? files[0] ?? null;
  const [lit, setLit] = React.useState<{ file: string; line: number } | null>(
    null,
  );
  const [cursor, setCursor] = React.useState({ line: 18, col: 20 });

  const [ownTab, setOwnTab] = React.useState<ConsolePanelTab>(defaultTab);
  const tab = tabProp ?? ownTab;

  const [ownPanel, setOwnPanel] = React.useState(clamp(defaultPanel, 0, 1));
  const frac = clamp(panelProp ?? ownPanel, 0, 1);
  const lastOpen = React.useRef(frac > 0 ? frac : 0.5);

  const [announcement, setAnnouncement] = React.useState("");
  const [command, setCommand] = React.useState("");
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  const infos = problems.length - errors - warnings;

  /* ------------------------------ geometry ----------------------------- */

  const [narrow, setNarrow] = React.useState(false);
  const [bodyH, setBodyH] = React.useState(
    Math.max(120, frameHeight - TITLE_H - STATUS_H),
  );
  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const [body, setBody] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const w = root.clientWidth;
      if (w > 0) setNarrow(w < 544);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  React.useEffect(() => {
    if (!body) return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(body.clientHeight);
      if (h > 0) setBodyH(h);
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, [body]);

  const snaps = narrow ? [0, 1] : SNAPS[snapPoints];
  const free = snapPoints === "free" && !narrow;

  // On a phone any open panel is the full-height sheet; the host's value is
  // kept as it is and reported back unchanged.
  const display = narrow && frac > 0 ? 1 : frac;
  const height = useMotionValue(Math.round(display * bodyH));
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  /** Where the running spring is heading, so a host that agrees never restarts it. */
  const runTo = React.useRef<number | null>(null);
  const dragging = React.useRef(false);
  const shownFrac = React.useRef(display);
  const displayRef = React.useRef(display);
  const refusal = React.useRef(0);
  React.useLayoutEffect(() => {
    displayRef.current = display;
  });
  React.useEffect(
    () => () => {
      run.current?.stop();
      cancelAnimationFrame(refusal.current);
    },
    [],
  );

  const glideTo = React.useCallback(
    (to: number, velocity: number) => {
      run.current?.stop();
      if (!motionSafe || Math.abs(height.get() - to) < 0.5) {
        runTo.current = null;
        height.jump(to);
        return;
      }
      runTo.current = to;
      run.current = animate(height.get(), to, {
        ...springs.glide,
        velocity,
        onUpdate: (x) => height.set(r2(Math.max(0, x))),
        onComplete: () => {
          runTo.current = null;
          height.jump(to);
        },
      });
    },
    [motionSafe, height],
  );

  // A host change (or a resize) moves the panel from wherever it is; a
  // release already heading to the same rest keeps its throw.
  React.useEffect(() => {
    if (dragging.current) return;
    const to = Math.round(display * bodyH);
    const moved = shownFrac.current !== display;
    shownFrac.current = display;
    if (runTo.current === to) return;
    if (!moved) {
      run.current?.stop();
      runTo.current = null;
      height.jump(to);
      return;
    }
    glideTo(to, 0);
  }, [display, bodyH, height, glideTo]);

  const commit = (next: number, velocity = 0, say = true) => {
    const v = clamp(Number(next.toFixed(3)), 0, 1);
    if (v > 0) lastOpen.current = v;
    const nextDisplay = narrow && v > 0 ? 1 : v;
    // The spring starts from the release with its velocity, right away.
    glideTo(Math.round(nextDisplay * bodyH), velocity);
    if (v === frac) return;
    if (panelProp === undefined) setOwnPanel(v);
    onPanelResize?.(v);
    if (say)
      setAnnouncement(
        v === 0
          ? "Panel closed."
          : v === 1
            ? "Panel full height."
            : `Panel ${Math.round(v * 100)}% height.`,
      );
    // A controlled host may refuse the height: if the state has not followed
    // by the next frame, the panel goes back to the height it does have.
    cancelAnimationFrame(refusal.current);
    refusal.current = requestAnimationFrame(() => {
      if (displayRef.current !== nextDisplay)
        glideTo(Math.round(displayRef.current * bodyH), 0);
    });
  };

  const toggle = () => {
    if (disabled) return;
    commit(frac > 0 ? 0 : narrow ? 1 : lastOpen.current);
  };

  const startH = React.useRef(0);
  const edgeDrag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      run.current?.stop();
      runTo.current = null;
      startH.current = height.get();
    },
    onMove: ({ offset }) => {
      const raw = startH.current - offset.y;
      // 1:1 between closed and full, with give past full.
      const h =
        raw > bodyH
          ? bodyH + rubberband(raw - bodyH, bodyH)
          : raw < 0
            ? Math.max(0, rubberband(raw, bodyH) * 0.2)
            : raw;
      height.set(r2(h));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const h = height.get();
      // Upward throws are negative y: the panel grows the other way.
      const throwV = -velocity.y;
      const landing = clamp(project(h, throwV, 0.995), 0, bodyH);
      let target: number;
      if (free) {
        target = landing / bodyH;
        // Within a finger's width of an end, it means the end.
        if (landing < 24) target = 0;
        if (landing > bodyH - 24) target = 1;
      } else {
        target = snaps.reduce(
          (best, s) =>
            Math.abs(s * bodyH - landing) < Math.abs(best * bodyH - landing)
              ? s
              : best,
          snaps[0] ?? 0,
        );
      }
      commit(target, throwV);
    },
    onCancel: () => {
      dragging.current = false;
      commit(frac, 0, false);
    },
    onTap: () => {
      if (frac === 0) commit(narrow ? 1 : lastOpen.current);
    },
  });

  // The edge is a thin handle and a fast pull leaves it before the drag has
  // taken the pointer: until it has, follow the pointer on the window too.
  const unfollow = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => unfollow.current?.(), []);
  const edgeHandlers = {
    ...edgeDrag,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      edgeDrag.onPointerDown(event);
      unfollow.current?.();
      const el = event.currentTarget;
      const id = event.pointerId;
      const mine = (ev: PointerEvent) =>
        ev.pointerId === id &&
        !el.contains(ev.target as Node) &&
        !el.hasPointerCapture(id);
      const move = (ev: PointerEvent) => {
        if (mine(ev))
          edgeDrag.onPointerMove(ev as unknown as React.PointerEvent);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        stop();
        if (mine(ev)) {
          if (ev.type === "pointercancel")
            edgeDrag.onPointerCancel(ev as unknown as React.PointerEvent);
          else edgeDrag.onPointerUp(ev as unknown as React.PointerEvent);
        }
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        unfollow.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      unfollow.current = stop;
    },
  };

  const stepSnap = (dirn: 1 | -1) => {
    if (free) {
      commit(clamp(Math.round((frac + dirn * 0.1) * 10) / 10, 0, 1));
      return;
    }
    const sorted = [...snaps].sort((a, b) => a - b);
    const next =
      dirn > 0
        ? (sorted.find((s) => s > frac + 0.001) ?? sorted[sorted.length - 1])
        : ([...sorted].reverse().find((s) => s < frac - 0.001) ?? sorted[0]);
    commit(next ?? frac);
  };

  /* ---------------------------- interactions --------------------------- */

  const selectTab = (t: ConsolePanelTab, open = false) => {
    if (t !== tab) {
      if (tabProp === undefined) setOwnTab(t);
      onTabChange?.(t);
    }
    if (open && frac === 0) commit(narrow ? 1 : lastOpen.current);
  };

  const openFile = (id: string) => {
    setOpenFiles((list) => (list.includes(id) ? list : [...list, id]));
    setFileId(id);
  };

  const editorScroller = React.useRef<HTMLDivElement | null>(null);
  const openProblem = (p: ConsoleProblem) => {
    openFile(p.file);
    setLit({ file: p.file, line: p.line });
    setCursor({ line: p.line, col: p.col ?? 1 });
    onOpenProblem?.(p);
    const f = files.find((x) => x.id === p.file);
    setAnnouncement(`${f?.name ?? "File"}, line ${p.line}: ${p.message}.`);
    // On a phone the sheet covers the editor: put it away to show the line.
    if (narrow && frac === 1) commit(0, 0, false);
  };
  // The highlighted line scrolls into view once its file is the one shown.
  React.useEffect(() => {
    if (!lit || lit.file !== fileId) return;
    const node = editorScroller.current?.querySelector<HTMLElement>(
      `[data-cs-line="${lit.line}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [lit, fileId]);

  const regions = React.useRef<(HTMLElement | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  // A motion element's ref binds once: one stable callback for its life.
  const panelRef = React.useCallback((el: HTMLDivElement | null) => {
    regions.current[2] = el;
  }, []);
  const onFrameKey = (event: React.KeyboardEvent) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "j"
    ) {
      event.preventDefault();
      toggle();
      return;
    }
    if (event.key === "F6") {
      event.preventDefault();
      const live = regions.current.filter(
        (el): el is HTMLElement =>
          // Shown and of real size: a shut panel is skipped.
          !!el &&
          el.offsetParent !== null &&
          el.getBoundingClientRect().height > 4,
      );
      if (live.length === 0) return;
      const at = live.findIndex((el) => el.contains(document.activeElement));
      const next =
        live[(at + (event.shiftKey ? -1 : 1) + live.length) % live.length];
      next?.focus();
    }
  };

  /* -------------------------------- parts ------------------------------ */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as ConsoleShellAccentName]
    : accent;

  const folders = React.useMemo(() => {
    const map = new Map<string, ConsoleFile[]>();
    for (const f of files) {
      const list = map.get(f.folder) ?? [];
      list.push(f);
      map.set(f.folder, list);
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
    );
  }, [files]);

  const problemLines = React.useMemo(() => {
    const map = new Map<number, ConsoleProblem["severity"]>();
    for (const p of problems)
      if (p.file === file?.id) {
        const prev = map.get(p.line);
        if (prev !== "error") map.set(p.line, p.severity);
      }
    return map;
  }, [problems, file]);

  // Explorer: a tree of folders and files with one roving stop.
  const treeKeys: string[] = [];
  for (const [folder, list] of folders) {
    if (folder) treeKeys.push(`d:${folder}`);
    if (!folder || !collapsed[folder])
      for (const f of list) treeKeys.push(`f:${f.id}`);
  }
  const [treeFocus, setTreeFocus] = React.useState(`f:${fileId}`);
  const treeEls = React.useRef(new Map<string, HTMLElement>());
  const moveTree = (key: string) => {
    setTreeFocus(key);
    treeEls.current.get(key)?.focus();
  };
  const onTreeKey = (event: React.KeyboardEvent, key: string) => {
    if (event.target !== event.currentTarget) return;
    const at = treeKeys.indexOf(key);
    const folder = key.startsWith("d:") ? key.slice(2) : null;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const k = treeKeys[Math.min(treeKeys.length - 1, at + 1)];
      if (k) moveTree(k);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const k = treeKeys[Math.max(0, at - 1)];
      if (k) moveTree(k);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (treeKeys[0]) moveTree(treeKeys[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      const k = treeKeys[treeKeys.length - 1];
      if (k) moveTree(k);
    } else if (event.key === "ArrowRight" && folder) {
      event.preventDefault();
      setCollapsed((c) => ({ ...c, [folder]: false }));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (folder) setCollapsed((c) => ({ ...c, [folder]: true }));
      else {
        const f = files.find((x) => `f:${x.id}` === key);
        if (f?.folder) moveTree(`d:${f.folder}`);
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (folder) setCollapsed((c) => ({ ...c, [folder]: !c[folder] }));
      else openFile(key.slice(2));
    }
  };

  const explorer = (
    <div
      ref={(el) => {
        regions.current[0] = el;
      }}
      role="region"
      aria-label="Explorer"
      tabIndex={-1}
      className={cn(
        "hidden w-40 shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline bg-surface-1 py-2 @[34rem]:flex @[60rem]:w-48",
        FOCUS_IN,
      )}
    >
      <p className="px-3 pb-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
        Explorer
      </p>
      <ul
        role="tree"
        aria-label="Project files"
        className="flex flex-col px-1.5"
      >
        {folders.map(([folder, list]) => {
          const open = !folder || !collapsed[folder];
          const rows = list.map((f) => {
            const key = `f:${f.id}`;
            const current = f.id === file?.id;
            const worst = problems.some(
              (p) => p.file === f.id && p.severity === "error",
            )
              ? "error"
              : problems.some((p) => p.file === f.id)
                ? "warning"
                : null;
            return (
              <li
                key={f.id}
                role="treeitem"
                aria-selected={current}
                tabIndex={treeFocus === key ? 0 : -1}
                ref={(el) => {
                  if (el) treeEls.current.set(key, el);
                  else treeEls.current.delete(key);
                }}
                onFocus={() => setTreeFocus(key)}
                onKeyDown={(event) => onTreeKey(event, key)}
                onClick={() => {
                  setTreeFocus(key);
                  openFile(f.id);
                }}
                className={cn(
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded-2 pr-2 text-[12.5px] select-none",
                  folder ? "pl-6" : "pl-2",
                  current
                    ? "bg-[var(--cs-wash)] text-foreground"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                {f.name.endsWith(".c") || f.name.endsWith(".h") ? (
                  <FileCode2
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                ) : (
                  <FileText
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {worst ? (
                  <span
                    aria-label={
                      worst === "error" ? "has errors" : "has warnings"
                    }
                    role="img"
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      worst === "error" ? "bg-danger" : "bg-warn",
                    )}
                  />
                ) : null}
              </li>
            );
          });
          if (!folder) return rows;
          const key = `d:${folder}`;
          return (
            <li
              key={key}
              role="treeitem"
              aria-expanded={open}
              aria-selected={false}
              tabIndex={treeFocus === key ? 0 : -1}
              ref={(el) => {
                if (el) treeEls.current.set(key, el);
                else treeEls.current.delete(key);
              }}
              onFocus={(event) => {
                if (event.target === event.currentTarget) setTreeFocus(key);
              }}
              onKeyDown={(event) => onTreeKey(event, key)}
              className={cn("flex flex-col rounded-2", FOCUS_IN)}
            >
              <span
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))
                }
                className="flex h-7 cursor-pointer items-center gap-1.5 rounded-2 px-1 text-[12.5px] text-ink-2 select-none hover:bg-surface-2"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3 shrink-0 transition-transform duration-150",
                    open && "rotate-90",
                  )}
                />
                {open ? (
                  <FolderOpen
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                ) : (
                  <Folder
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-3"
                  />
                )}
                {folder}
              </span>
              {open ? (
                <ul role="group" className="flex flex-col">
                  {rows}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const editor = (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        role="tablist"
        aria-label="Open files"
        className="flex h-8 shrink-0 [scrollbar-width:none] items-stretch overflow-x-auto border-b border-hairline bg-surface-1"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const at = openFiles.indexOf(fileId);
          const next =
            openFiles[
              (at + (event.key === "ArrowRight" ? 1 : -1) + openFiles.length) %
                openFiles.length
            ];
          if (!next) return;
          setFileId(next);
          event.currentTarget
            .querySelector<HTMLElement>(`[data-cs-tab="${CSS.escape(next)}"]`)
            ?.focus();
        }}
      >
        {openFiles.map((id) => {
          const f = files.find((x) => x.id === id);
          if (!f) return null;
          const on = id === fileId;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              data-cs-tab={id}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setFileId(id)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 border-r border-hairline px-3 text-[12px]",
                on
                  ? "bg-card text-foreground"
                  : "text-ink-3 hover:text-foreground",
                FOCUS_IN,
              )}
            >
              {on ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-[2px] bg-[var(--cs-ink)]"
                />
              ) : null}
              {f.name}
            </button>
          );
        })}
      </div>
      <div
        ref={(el) => {
          editorScroller.current = el;
          regions.current[1] = el;
        }}
        role="region"
        aria-label={`Editor, ${file?.name ?? "no file"}`}
        tabIndex={0}
        className={cn(
          "flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain bg-card py-2 font-mono text-[12px] leading-5",
          FOCUS_IN,
        )}
      >
        {file ? (
          <ol className="min-w-max">
            {file.lines.map((line, i) => {
              const n = i + 1;
              const sev = problemLines.get(n);
              const on = lit?.file === file.id && lit.line === n;
              return (
                <li
                  key={n}
                  data-cs-line={n}
                  className={cn("flex pr-4", on && "bg-[var(--cs-wash)]")}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "relative w-10 shrink-0 pr-3 text-right tabular-nums select-none",
                      on ? "text-foreground" : "text-ink-3",
                    )}
                  >
                    {sev ? (
                      <span
                        className={cn(
                          "absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full",
                          sev === "error"
                            ? "bg-danger"
                            : sev === "warning"
                              ? "bg-warn"
                              : "bg-ink-3",
                        )}
                      />
                    ) : null}
                    {n}
                  </span>
                  <span
                    className={cn(
                      "whitespace-pre",
                      sev &&
                        "underline decoration-wavy decoration-1 underline-offset-[3px]",
                      sev === "error"
                        ? "decoration-[color-mix(in_oklab,var(--danger)_70%,transparent)]"
                        : sev
                          ? "decoration-[color-mix(in_oklab,var(--warn)_70%,transparent)]"
                          : "",
                    )}
                  >
                    {line.length === 0
                      ? " "
                      : tokenize(line).map((t, k) => (
                          <span key={k} className={TOK_CLASS[t.kind]}>
                            {t.text}
                          </span>
                        ))}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="px-4 text-ink-3">No file open.</p>
        )}
      </div>
    </div>
  );

  /* ------------------------------- panel ------------------------------- */

  const TABS: { id: ConsolePanelTab; label: string; count?: number }[] = [
    { id: "problems", label: "Problems", count: problems.length },
    { id: "output", label: "Output" },
    { id: "console", label: "Console" },
  ];

  const sevIcon = (s: ConsoleProblem["severity"]) =>
    s === "error" ? (
      <CircleX aria-hidden className="size-3.5 shrink-0 text-danger" />
    ) : s === "warning" ? (
      <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
    ) : (
      <Info aria-hidden className="size-3.5 shrink-0 text-ink-3" />
    );

  const toneClass = (t?: ConsoleLine["tone"]) =>
    t === "error"
      ? "text-danger"
      : t === "warn"
        ? "text-warn"
        : t === "success"
          ? "text-success"
          : t === "command"
            ? "text-[var(--cs-ink)]"
            : t === "muted"
              ? "text-ink-3"
              : "text-foreground";

  let tabBody: React.ReactNode;
  if (tab === "problems") {
    tabBody =
      problems.length === 0 ? (
        <p className="flex items-center gap-1.5 px-3 py-2 text-[12.5px] text-ink-3">
          <CircleCheck aria-hidden className="size-3.5 text-success" />
          No problems in the workspace.
        </p>
      ) : (
        <ul aria-label="Problems" className="flex flex-col py-1">
          {problems.map((p) => {
            const f = files.find((x) => x.id === p.file);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => openProblem(p)}
                  aria-label={`${p.severity}: ${p.message}, ${f?.name ?? p.file} line ${p.line}`}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1 text-left text-[12.5px] hover:bg-surface-2",
                    FOCUS_IN,
                  )}
                >
                  {sevIcon(p.severity)}
                  <span className="min-w-0 flex-1 truncate">{p.message}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {`${f?.name ?? p.file}:${p.line}${p.col ? `:${p.col}` : ""}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      );
  } else if (tab === "output") {
    tabBody =
      output.length === 0 ? (
        <p className="px-3 py-2 text-[12.5px] text-ink-3">
          Nothing yet. Run a build to see its log.
        </p>
      ) : (
        <ol
          aria-label="Build output"
          className="flex flex-col px-3 py-1.5 font-mono text-[11.5px] leading-5"
        >
          {output.map((l) => (
            <li
              key={l.id}
              className={cn("whitespace-pre-wrap", toneClass(l.tone))}
            >
              {l.text}
            </li>
          ))}
        </ol>
      );
  } else {
    tabBody = (
      <div className="flex flex-col gap-1 px-3 py-1.5 font-mono text-[11.5px] leading-5">
        <ol aria-label="Console history" className="flex flex-col">
          {history.map((l) => (
            <li
              key={l.id}
              className={cn("whitespace-pre-wrap", toneClass(l.tone))}
            >
              {l.text}
            </li>
          ))}
        </ol>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const cmd = command.trim();
            if (!cmd || disabled) return;
            onRunCommand?.(cmd);
            setCommand("");
            setAnnouncement(`Ran ${cmd}.`);
          }}
        >
          <label htmlFor={`${uid}-cmd`} className="text-[var(--cs-ink)]">
            $<span className="sr-only">Command</span>
          </label>
          <input
            id={`${uid}-cmd`}
            value={command}
            onChange={(event) => {
              const v = event.currentTarget.value;
              setCommand(v);
            }}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            placeholder="gauge build"
            className="h-6 min-w-0 flex-1 rounded-1 bg-transparent text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
          />
        </form>
      </div>
    );
  }

  const panelEl = (
    <motion.div
      id={panelId}
      ref={panelRef}
      role="region"
      aria-label="Panel"
      tabIndex={-1}
      className={cn(
        "relative flex shrink-0 flex-col overflow-hidden border-t border-hairline-strong bg-surface-1",
        FOCUS_IN,
      )}
      style={{ height }}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-hairline pr-1 pl-2">
        {narrow ? (
          <span
            aria-hidden
            className="mr-1 h-1 w-6 shrink-0 rounded-full bg-hairline-strong"
          />
        ) : null}
        <div
          role="tablist"
          aria-label="Panel views"
          className="flex h-full min-w-0 flex-1 [scrollbar-width:none] items-stretch gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            const at = TABS.findIndex((t) => t.id === tab);
            const next =
              TABS[
                (at + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) %
                  TABS.length
              ];
            if (!next) return;
            selectTab(next.id);
            event.currentTarget
              .querySelector<HTMLElement>(`[data-cs-ptab="${next.id}"]`)
              ?.focus();
          }}
        >
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                data-cs-ptab={t.id}
                aria-selected={on}
                aria-controls={`${panelId}-body`}
                tabIndex={on ? 0 : -1}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 px-2 text-[11.5px] font-medium tracking-[0.02em] uppercase",
                  on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 px-1 font-mono text-[10px] text-ink-2">
                    <Roll value={t.count} motionSafe={motionSafe} />
                  </span>
                ) : null}
                {on ? (
                  <motion.span
                    layoutId={`${uid}-ptab`}
                    aria-hidden
                    className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[var(--cs-ink)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {!narrow ? (
          <button
            type="button"
            aria-label={frac >= 1 ? "Restore panel" : "Maximise panel"}
            title={frac >= 1 ? "Restore" : "Maximise"}
            disabled={disabled}
            onClick={() =>
              commit(
                frac >= 1 ? (lastOpen.current < 1 ? lastOpen.current : 0.5) : 1,
              )
            }
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground",
              FOCUS_IN,
            )}
          >
            {frac >= 1 ? (
              <ChevronsDown aria-hidden className="size-3.5" />
            ) : (
              <ChevronsUp aria-hidden className="size-3.5" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Close panel"
          title="Close · ⌘J"
          disabled={disabled}
          onClick={() => commit(0)}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground",
            FOCUS_IN,
          )}
        >
          {narrow ? (
            <ChevronDown aria-hidden className="size-3.5" />
          ) : (
            <X aria-hidden className="size-3.5" />
          )}
        </button>
      </div>
      <div
        id={`${panelId}-body`}
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === tab)?.label}
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {tabBody}
      </div>
    </motion.div>
  );

  /* ---------------------------- status bar ----------------------------- */

  const items = statusItems ?? [
    { id: "pos", label: `Ln ${cursor.line}, Col ${cursor.col}` },
    { id: "enc", label: "UTF-8" },
    { id: "board", label: "gauge-r3" },
  ];

  // New problems warm the counts once and are announced once, by what
  // arrived, in the render that sees them.
  const [pulse, setPulse] = React.useState(0);
  const [prevCounts, setPrevCounts] = React.useState({ errors, warnings });
  if (prevCounts.errors !== errors || prevCounts.warnings !== warnings) {
    const e = errors - prevCounts.errors;
    const w = warnings - prevCounts.warnings;
    if (e > 0 || w > 0) {
      setPulse((p) => p + 1);
      setAnnouncement(
        `${[
          e > 0 ? plural(e, "new error", "new errors") : "",
          w > 0 ? plural(w, "new warning", "new warnings") : "",
        ]
          .filter(Boolean)
          .join(" and ")}.`,
      );
    }
    setPrevCounts({ errors, warnings });
  }

  const countsLabel =
    problems.length === 0
      ? "No problems"
      : [
          errors > 0 ? plural(errors, "error", "errors") : "",
          warnings > 0 ? plural(warnings, "warning", "warnings") : "",
          infos > 0 ? plural(infos, "note", "notes") : "",
        ]
          .filter(Boolean)
          .join(", ");

  const counts = (
    <button
      ref={(el) => {
        regions.current[3] = el;
      }}
      type="button"
      aria-label={`${countsLabel}. Show problems.`}
      aria-controls={panelId}
      onClick={() => selectTab("problems", true)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-full items-center gap-2 px-2 text-[11.5px] hover:bg-surface-2",
        FOCUS_IN,
      )}
    >
      <AnimatePresence initial={false}>
        {pulse > 0 && motionSafe ? (
          <motion.span
            key={pulse}
            aria-hidden
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--warn)_22%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: durations.page,
              ease: easings.move,
              times: [0, 0.25, 1],
            }}
          />
        ) : null}
      </AnimatePresence>
      {statusStyle === "pills" ? (
        <>
          <span className="relative inline-flex h-4 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] px-1.5 text-danger">
            <Roll value={errors} motionSafe={motionSafe} />
            <span>{errors === 1 ? "error" : "errors"}</span>
          </span>
          <span className="relative inline-flex h-4 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] px-1.5 text-warn">
            <Roll value={warnings} motionSafe={motionSafe} />
            <span>{warnings === 1 ? "warning" : "warnings"}</span>
          </span>
        </>
      ) : statusStyle === "minimal" ? (
        <span className="relative inline-flex items-center gap-1.5 text-ink-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              errors > 0
                ? "bg-danger"
                : warnings > 0
                  ? "bg-warn"
                  : "bg-success",
            )}
          />
          {problems.length === 0 ? (
            "Clean"
          ) : (
            <>
              <Roll value={problems.length} motionSafe={motionSafe} />
              <span>{problems.length === 1 ? "problem" : "problems"}</span>
            </>
          )}
        </span>
      ) : (
        <>
          <span className="relative inline-flex items-center gap-1 text-ink-2">
            <CircleX aria-hidden className="size-3.5 text-danger" />
            <Roll value={errors} motionSafe={motionSafe} />
          </span>
          <span className="relative inline-flex items-center gap-1 text-ink-2">
            <TriangleAlert aria-hidden className="size-3.5 text-warn" />
            <Roll value={warnings} motionSafe={motionSafe} />
          </span>
        </>
      )}
    </button>
  );

  const buildLabel =
    build === "building"
      ? `Building ${Math.round(clamp(buildProgress, 0, 1) * 100)}%`
      : build === "failed"
        ? "Build failed"
        : build === "passed"
          ? "Build passed"
          : "Ready";

  const statusBar = (
    <div
      className={cn(
        "relative flex shrink-0 items-stretch justify-between gap-2 font-mono text-[11px] text-ink-2 transition-colors duration-200",
        build === "failed"
          ? "bg-[color-mix(in_oklab,var(--danger)_9%,var(--surface-1))]"
          : "bg-surface-1",
        narrow && "touch-pan-x select-none",
      )}
      style={{ height: STATUS_H }}
      // On a phone the whole status bar is the sheet's handle: pull it up.
      {...(narrow ? edgeHandlers : {})}
    >
      {build === "building" ? (
        <motion.span
          aria-hidden
          className="absolute inset-x-0 top-[-1px] h-[2px] origin-left bg-[var(--cs-ink)]"
          initial={false}
          animate={{ scaleX: Number(clamp(buildProgress, 0, 1).toFixed(3)) }}
          transition={{ duration: durations.base, ease: easings.move }}
        />
      ) : null}
      <div className="flex min-w-0 items-stretch">
        {/* The grab edge rides on top of the status bar while the panel is shut. */}
        {narrow ? (
          <span aria-hidden className="flex items-center px-2">
            <span className="h-1 w-6 rounded-full bg-hairline-strong" />
          </span>
        ) : null}
        <span className="hidden items-center gap-1 px-2 @[26rem]:inline-flex">
          <GitBranch aria-hidden className="size-3.5" />
          {branch}
        </span>
        {counts}
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 truncate px-2",
            build === "failed"
              ? "text-danger"
              : build === "passed"
                ? "text-success"
                : "text-ink-2",
          )}
        >
          {build === "building" ? (
            <LoaderCircle
              aria-hidden
              className={cn("size-3.5 shrink-0", motionSafe && "animate-spin")}
            />
          ) : build === "passed" ? (
            <CircleCheck aria-hidden className="size-3.5 shrink-0" />
          ) : null}
          <span className="truncate">{buildLabel}</span>
        </span>
      </div>
      <div className="hidden min-w-0 items-center gap-3 truncate px-2 text-ink-3 @[40rem]:flex">
        {items.map((it) => (
          <span key={it.id} className="truncate">
            {it.label}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <section
      ref={setRoot}
      aria-label={`${projectName} workspace`}
      onKeyDown={onFrameKey}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={
        {
          height: frameHeight,
          "--cs-ink": accentInk,
          "--cs-wash": "color-mix(in oklab, var(--cs-ink) 12%, transparent)",
          "--cs-soft": "color-mix(in oklab, var(--cs-ink) 36%, transparent)",
        } as React.CSSProperties
      }
    >
      {/* Title bar */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-hairline bg-surface-1 px-3"
        style={{ height: TITLE_H }}
      >
        <span aria-hidden className="flex shrink-0 gap-1.5">
          <span className="size-2.5 rounded-full bg-hairline-strong" />
          <span className="size-2.5 rounded-full bg-hairline-strong" />
          <span className="size-2.5 rounded-full bg-hairline-strong" />
        </span>
        <p className="min-w-0 flex-1 truncate text-center text-[12px] font-medium text-ink-2">
          {projectName}
        </p>
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            onRunCommand?.("build");
            selectTab("output", true);
          }}
          disabled={disabled || build === "building"}
          aria-label="Build"
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2 text-[11.5px] text-ink-2 hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
            FOCUS,
          )}
        >
          <Hammer aria-hidden className="size-3.5" />
          <span className="hidden @[26rem]:inline">Build</span>
        </button>
      </div>

      <div ref={setBody} className="relative flex flex-1 overflow-hidden">
        {explorer}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {editor}
          {/* The edge: a separator that is the panel's handle. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-controls={panelId}
            aria-label="Resize panel"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(display * 100)}
            aria-valuetext={
              display === 0
                ? "Panel closed"
                : display === 1
                  ? "Panel full height"
                  : `Panel ${Math.round(display * 100)}% height`
            }
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "ArrowUp") {
                event.preventDefault();
                stepSnap(1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                stepSnap(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                commit(0);
              } else if (event.key === "End") {
                event.preventDefault();
                commit(1);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
              }
            }}
            {...edgeHandlers}
            className={cn(
              // The hit area sits just above the panel's edge, so a shut panel
              // still leaves the whole handle in view above the status bar.
              "group/console-shell relative z-[2] -mt-2.5 -mb-0.5 h-3 shrink-0 cursor-row-resize touch-pan-x select-none",
              disabled && "cursor-default",
              FOCUS_IN,
            )}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0.5 h-[2px] translate-y-1/2 bg-transparent transition-colors duration-150 group-hover/console-shell:bg-[var(--cs-soft)] group-active/console-shell:bg-[var(--cs-ink)]"
            />
          </div>
          {panelEl}
        </div>
      </div>

      {statusBar}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
