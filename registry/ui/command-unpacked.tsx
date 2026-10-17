"use client";

import * as React from "react";

import { motion } from "motion/react";
import {
  Bot,
  Check,
  ChevronDown,
  Folder,
  Lock,
  Pencil,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type CommandPartKind =
  | "program"
  | "subcommand"
  | "flag"
  | "value"
  | "path"
  | "argument"
  | "operator";

export type CommandPart = {
  id: string;
  index: number;
  text: string;
  kind: CommandPartKind;
  /** Which simple command it belongs to (operators end one). */
  segment: number;
  /** The program of its segment. */
  program?: string;
  /** For a value: the flag it belongs to. */
  flag?: string;
  /** For a path: where it lands, resolved against the working directory. */
  resolved?: string;
  /** For a path: whether it lands inside the project root. */
  inside?: boolean;
  /** For a path: the program deletes or writes it. */
  effect?: "delete" | "write";
};

export type CommandProgram = {
  /** One or two words for the tag: "delete". */
  gist: string;
  /** What it does, in a plain sentence. */
  summary: string;
  /** Flag letter or long name (without dashes) → what it does, "name: meaning". */
  flags?: Record<string, string>;
  /** Subcommand → what it does. */
  subcommands?: Record<string, string>;
  /** Long flags that take the next word as their value. */
  values?: string[];
  /** What a plain argument means to it. */
  arguments?: string;
  /** What it does to the paths it is given. */
  effect?: "delete" | "write";
};

export type CommandContext = {
  parts: CommandPart[];
  cwd: string;
  root: string;
  programs: Record<string, CommandProgram>;
};

export type CommandRule = {
  id: string;
  /** Short name for the risk: "Recursive delete". */
  label: string;
  level: "danger" | "caution";
  /** Returns why this part is risky, or null. */
  test: (part: CommandPart, ctx: CommandContext) => string | null;
};

export type CommandPolicy = {
  /** Approval is not possible from here. */
  blocked: boolean;
  /** Why, in the policy's words. */
  reason: string;
  /** Whose policy it is. */
  source?: string;
};

export type CommandDecision = "pending" | "approved" | "denied";
export type CommandPartStyle = "chips" | "lines" | "boxes";
export type CommandTrigger = "inView" | "mount" | "manual";

export type CommandUnpackedProps = {
  /** The command the agent wants to run. @default defaultCommand */
  command?: string;
  /** Where it would run. @default "~/waylight/web" */
  cwd?: string;
  /** The project root; paths that land outside it are flagged. @default cwd */
  root?: string;
  /** Who is asking, why, and when it asked (ms; @default 12 s before now). @default the Waylight build agent */
  agent?: { name: string; task?: string; askedAt?: number };
  /** What each known program, flag and subcommand does. @default defaultCommandPrograms */
  programs?: Record<string, CommandProgram>;
  /** Explanations the agent gave for particular parts, keyed by the part's text. */
  annotations?: Record<string, string>;
  /** What counts as risky. @default defaultCommandRules */
  rules?: CommandRule[];
  /** A policy that blocks approval here. @default null */
  policy?: CommandPolicy | null;
  /** Controlled decision. */
  decision?: CommandDecision;
  /** Initial decision when uncontrolled. @default "pending" */
  defaultDecision?: CommandDecision;
  /** Approve or Enter on a part (twice when risky). */
  onApprove?: (command: string) => void;
  /** Deny or Escape. */
  onDeny?: (command: string) => void;
  /** The command was edited and saved. */
  onEditCommand?: (command: string) => void;
  /** A pattern to allow from now on, chosen from Allow similar. */
  onAllowSimilar?: (pattern: string) => void;
  /** Controlled: the parts are lifted apart. */
  unpacked?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultUnpacked?: boolean;
  /** Fires from the toggle and from the automatic unpack. */
  onUnpackedChange?: (unpacked: boolean) => void;
  /** When the command first lifts apart by itself. @default "inView" */
  trigger?: CommandTrigger;
  /** A risky command needs a second press to approve. @default true */
  confirmRisky?: boolean;
  /** Tinted chips, coloured underlines, or hollow boxes. @default "chips" */
  partStyle?: CommandPartStyle;
  /** Outline, stem, tag and callout for risky parts — any CSS colour. @default "var(--danger)" */
  riskColor?: string;
  /** Programs, the active outline and Approve — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The moment "12 s ago" counts from, ms. @default defaultCommandNow */
  now?: number;
  /** The card's accessible name. @default "Command approval" */
  label?: string;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultCommandNow = Date.UTC(2026, 9, 14, 16, 5, 30);

export const defaultCommand =
  "rm -rf build/.cache ../shared/dist && wl build web | tee build.log";

export const defaultCommandPrograms: Record<string, CommandProgram> = {
  rm: {
    gist: "delete",
    summary:
      "Removes files and folders. Nothing goes to a bin: what it removes is gone.",
    effect: "delete",
    flags: {
      r: "recursive: goes into folders and removes everything inside them",
      R: "recursive: goes into folders and removes everything inside them",
      f: "force: never asks, and stays quiet about files that aren’t there",
      i: "interactive: asks before each removal",
      v: "verbose: names each file as it goes",
      recursive:
        "recursive: goes into folders and removes everything inside them",
      force: "force: never asks, and stays quiet about files that aren’t there",
    },
  },
  wl: {
    gist: "Waylight",
    summary: "Waylight’s own command-line tool for this workspace.",
    subcommands: {
      build: "Builds the project for release.",
      dev: "Starts the development server.",
      test: "Runs the test suite.",
    },
    arguments: "Names the target to build: web, api or docs.",
    values: ["target", "mode"],
  },
  tee: {
    gist: "print + save",
    summary:
      "Prints what it receives and also writes it to a file, replacing what was there.",
    effect: "write",
    flags: { a: "append: adds to the end of the file instead of replacing it" },
  },
  cp: {
    gist: "copy",
    summary: "Copies files and folders.",
    effect: "write",
    flags: { r: "recursive: copies folders and everything inside them" },
  },
  mv: {
    gist: "move",
    summary: "Moves or renames files and folders.",
    effect: "write",
  },
  mkdir: {
    gist: "new folder",
    summary: "Creates folders.",
    flags: { p: "parents: creates any missing folders on the way" },
  },
  cat: { gist: "read", summary: "Prints files." },
  grep: {
    gist: "search",
    summary: "Prints the lines that match a pattern.",
    flags: {
      r: "recursive: searches folders too",
      i: "ignores case",
      n: "prints line numbers",
    },
  },
  find: { gist: "find files", summary: "Lists the files that pass a test." },
  ls: {
    gist: "list",
    summary: "Lists what a folder holds.",
    flags: {
      l: "long: one file per line with details",
      a: "all: includes hidden files",
    },
  },
  echo: { gist: "print", summary: "Prints its arguments." },
  sudo: {
    gist: "as admin",
    summary: "Runs the command after it as an administrator.",
  },
  sh: { gist: "shell", summary: "Runs a shell script." },
};

const writesOutside = (part: CommandPart): string | null =>
  part.kind === "path" && part.inside === false && part.effect
    ? `${part.effect === "delete" ? "Deletes" : "Writes"} outside the project: ${part.resolved ?? part.text}.`
    : null;

export const defaultCommandRules: CommandRule[] = [
  {
    id: "recursive-delete",
    label: "Recursive delete",
    level: "danger",
    test: (part) =>
      part.kind === "flag" &&
      part.program === "rm" &&
      (/^-[a-zA-Z]*[rR]/.test(part.text) || part.text === "--recursive")
        ? "Deletes folders and everything inside them, without asking."
        : null,
  },
  {
    id: "outside-project",
    label: "Outside the project",
    level: "danger",
    test: writesOutside,
  },
  {
    id: "as-admin",
    label: "Runs as administrator",
    level: "danger",
    test: (part) =>
      part.kind === "program" && part.text === "sudo"
        ? "Everything after it runs with full rights over this machine."
        : null,
  },
  {
    id: "pipe-to-shell",
    label: "Pipes into a shell",
    level: "danger",
    test: (part, ctx) => {
      if (part.kind !== "program" || !["sh", "bash", "zsh"].includes(part.text))
        return null;
      const before = ctx.parts[part.index - 1];
      return before?.text === "|" ? "Runs whatever arrives as a script." : null;
    },
  },
  {
    id: "unknown-program",
    label: "Unknown program",
    level: "caution",
    test: (part, ctx) =>
      part.kind === "program" && !ctx.programs[part.text]
        ? "Not on this agent’s list of known programs, so there is no description of what it does."
        : null,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Parsing                                  */
/* ----------------------------------------------------------------------- */

const OPERATORS = new Set(["&&", "||", "|", ";", ">", ">>", "<"]);

function tokenize(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (const ch of command) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      cur += ch;
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Joins a relative path onto a directory and folds `.` and `..` away. */
function resolvePath(cwd: string, path: string): string {
  const raw = path.replace(/^['"]|['"]$/g, "");
  const base =
    raw.startsWith("/") || raw.startsWith("~")
      ? raw
      : `${cwd.replace(/\/$/, "")}/${raw}`;
  const out: string[] = [];
  for (const seg of base.split("/")) {
    if (seg === "" && out.length > 0) continue;
    if (seg === ".") continue;
    if (seg === "..") {
      if (out.length > 1) out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join("/") || "/";
}

const looksLikePath = (t: string) =>
  /[/~]/.test(t) ||
  /^\.{1,2}$/.test(t) ||
  /^\.?[\w-]+\.[a-z0-9]{1,5}$/i.test(t);

export function parseCommand(
  command: string,
  cwd: string,
  root: string,
  programs: Record<string, CommandProgram>,
): CommandPart[] {
  const tokens = tokenize(command);
  const parts: CommandPart[] = [];
  let segment = 0;
  let program: string | undefined;
  let expectProgram = true;
  let afterRedirect = false;
  let pendingValue: string | undefined;
  let sawSub = false;
  tokens.forEach((text, index) => {
    const base = { id: `p${index}`, index, text, segment };
    if (OPERATORS.has(text)) {
      parts.push({ ...base, kind: "operator", program });
      if (text === ">" || text === ">>" || text === "<") afterRedirect = true;
      else {
        segment += 1;
        expectProgram = true;
        program = undefined;
      }
      pendingValue = undefined;
      return;
    }
    if (afterRedirect) {
      afterRedirect = false;
      const resolved = resolvePath(cwd, text);
      parts.push({
        ...base,
        kind: "path",
        program,
        resolved,
        inside: resolved === root || resolved.startsWith(`${root}/`),
        effect: "write",
      });
      return;
    }
    if (expectProgram) {
      parts.push({ ...base, kind: "program", program: text });
      program = text;
      sawSub = false;
      // sudo hands the rest to another program.
      expectProgram = text === "sudo";
      return;
    }
    const known = program ? programs[program] : undefined;
    if (pendingValue) {
      parts.push({ ...base, kind: "value", program, flag: pendingValue });
      pendingValue = undefined;
      return;
    }
    if (text.startsWith("-") && text.length > 1) {
      const name = text.replace(/^-+/, "").split("=")[0] ?? "";
      if (
        text.startsWith("--") &&
        !text.includes("=") &&
        known?.values?.includes(name)
      )
        pendingValue = text;
      parts.push({ ...base, kind: "flag", program });
      return;
    }
    if (!sawSub && known?.subcommands?.[text]) {
      sawSub = true;
      parts.push({ ...base, kind: "subcommand", program });
      return;
    }
    if (looksLikePath(text)) {
      const resolved = resolvePath(cwd, text);
      parts.push({
        ...base,
        kind: "path",
        program,
        resolved,
        inside: resolved === root || resolved.startsWith(`${root}/`),
        effect: known?.effect,
      });
      return;
    }
    parts.push({ ...base, kind: "argument", program });
  });
  return parts;
}

const OPERATOR_TEXT: Record<string, [string, string]> = {
  "&&": ["if it worked", "Runs the next command only if this one succeeded."],
  "||": ["else", "Runs the next command only if this one failed."],
  "|": [
    "pipe",
    "Sends this command’s output into the next one as it is printed.",
  ],
  ";": ["then", "Runs the next command whatever happened."],
  ">": [
    "write to",
    "Writes the output to the file after it, replacing what was there.",
  ],
  ">>": ["append to", "Adds the output to the end of the file after it."],
  "<": ["read from", "Feeds the file after it in as input."],
};

const KIND_LABEL: Record<CommandPartKind, string> = {
  program: "program",
  subcommand: "subcommand",
  flag: "flags",
  value: "value",
  path: "path",
  argument: "argument",
  operator: "operator",
};

function explain(
  part: CommandPart,
  programs: Record<string, CommandProgram>,
  annotations: Record<string, string> | undefined,
): { gist: string; text: string } {
  const known = part.program ? programs[part.program] : undefined;
  let gist = KIND_LABEL[part.kind];
  let text = "";
  if (part.kind === "program") {
    const p = programs[part.text];
    gist = p ? p.gist : "unknown";
    text = p
      ? p.summary
      : `No description for ${part.text}: it isn’t on this agent’s list of known programs.`;
  } else if (part.kind === "subcommand") {
    gist = part.text;
    text =
      known?.subcommands?.[part.text] ??
      `A subcommand of ${part.program ?? "the program"}.`;
  } else if (part.kind === "flag") {
    if (part.text.startsWith("--")) {
      const name = part.text.slice(2).split("=")[0] ?? "";
      const m = known?.flags?.[name];
      gist = m ? (m.split(":")[0] ?? name) : name;
      text = m
        ? `${part.text} ${m}.`
        : `An option for ${part.program ?? "the program"}.`;
    } else {
      const letters = part.text.slice(1).split("");
      const meant = letters.map((l) => [l, known?.flags?.[l]] as const);
      gist = meant
        .map(([l, m]) => (m ? (m.split(":")[0] ?? l) : `-${l}`))
        .join(" · ");
      text = meant
        .map(([l, m]) =>
          m
            ? `-${l} ${m}`
            : `-${l} isn’t described for ${part.program ?? "this program"}`,
        )
        .join(". ")
        .concat(".");
    }
  } else if (part.kind === "value") {
    gist = "value";
    text = `The value for ${part.flag ?? "the option before it"}.`;
  } else if (part.kind === "path") {
    gist = part.inside ? "in project" : "outside project";
    const where = `${part.inside ? "Inside the project" : "Outside the project"}: ${part.resolved ?? part.text}.`;
    text =
      part.effect === "delete"
        ? `${where} This is what gets deleted.`
        : part.effect === "write"
          ? `${where} This is the file it writes.`
          : where;
  } else if (part.kind === "operator") {
    const o = OPERATOR_TEXT[part.text];
    gist = o?.[0] ?? "operator";
    text = o?.[1] ?? "Joins two commands.";
  } else {
    gist = "argument";
    text =
      known?.arguments ??
      `Passed to ${part.program ?? "the program"} as it is.`;
  }
  const note = annotations?.[part.text];
  return { gist, text: note ?? text };
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Tags are set in mono, so their width is known from their length. */
const TAG_CH = 6.3;
const TAG_PAD = 14;
const BAND_TOP = 16;
const ROW_H = 26;
const TAG_H = 20;
/** How far a tag may lean into the well's padding. */
const BLEED = 10;

type Geo = {
  width: number;
  chips: Record<string, { cx: number; bottom: number }>;
};
type Tag = {
  id: string;
  left: number;
  width: number;
  row: number;
  cx: number;
  bottom: number;
  gist: string;
};

/**
 * Places each tag under its part. Hard rules: no two tags in a row overlap, a
 * tag's stem never runs through a shallower tag, and no deeper stem runs
 * through it. Within those, it prefers a spot that leaves every later part's
 * stem clear, then the shallowest row, then the smallest sideways slide — so
 * stems stay vertical and every tag reads straight up to its part.
 */
function packTags(order: { id: string; gist: string }[], geo: Geo): Tag[] {
  const placed: Tag[] = [];
  const xs = order.map((o) => geo.chips[o.id]?.cx ?? Number.NaN);
  // Tags may lean into the well's padding, so the first and last parts can
  // keep their neighbours' stems clear.
  const minLeft = -BLEED;
  order.forEach(({ id, gist }, index) => {
    const chip = geo.chips[id];
    if (!chip) return;
    const width = Math.round(gist.length * TAG_CH + TAG_PAD);
    const maxLeft = Math.max(minLeft, geo.width - width + BLEED);
    const centred = Math.min(Math.max(minLeft, chip.cx - width / 2), maxLeft);
    const reach = Math.max(0, Math.floor((width / 2 - 6) / 6));
    let best: Tag | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let strict = 1; strict >= 0 && !best; strict -= 1) {
      for (let k = -reach; k <= reach; k += 1) {
        const shift = k * 6;
        const left = Math.round(
          Math.min(Math.max(minLeft, centred + shift), maxLeft),
        );
        const right = left + width;
        if (chip.cx < left + 4 || chip.cx > right - 4) continue;
        const covers = xs.some(
          (x, j) => j > index && x >= left - 3 && x <= right + 3,
        );
        for (let row = 0; row < 4; row += 1) {
          const clear = placed.every((q) => {
            const qr = q.left + q.width;
            if (q.row === row) return left >= qr + 6 || right + 6 <= q.left;
            // The second pass lets a stem run behind a tag rather than
            // leave a tag with nowhere to go.
            if (!strict) return true;
            if (q.row < row) return chip.cx < q.left - 3 || chip.cx > qr + 3;
            return q.cx < left - 3 || q.cx > right + 3;
          });
          if (!clear) continue;
          const score = (covers ? 1000 : 0) + row * 100 + Math.abs(shift);
          if (score < bestScore) {
            bestScore = score;
            best = {
              id,
              left,
              width,
              row,
              cx: chip.cx,
              bottom: chip.bottom,
              gist,
            };
          }
        }
      }
    }
    placed.push(
      best ?? {
        id,
        left: Math.round(centred),
        width,
        row: 3,
        cx: chip.cx,
        bottom: chip.bottom,
        gist,
      },
    );
  });
  return placed;
}

function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

const ago = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
};

/* ----------------------------------------------------------------------- */
/*                                The card                                  */
/* ----------------------------------------------------------------------- */

/**
 * An approval card for an agent that wants to run a shell command. The
 * command first shows as one plain line; then its parts — program, flags,
 * paths, arguments, operators — lift apart: the gaps open and each part rises
 * on `springs.glide` in a `cascade()`, then a hairline stem drops from each to
 * a tag naming what it is, the tags packed into staggered rows so none
 * overlap. Anything a rule finds risky (a recursive delete, a delete or write
 * outside the project, running as administrator, piping into a shell) is
 * outlined in `riskColor`, stem, tag and all. The part in focus or under the
 * pointer is explained in plain words beneath, its outline sliding on
 * `springs.snap` and the panel's height gliding.
 *
 * Tab walks the parts; Enter approves (a risky command asks twice), Escape
 * denies. Allow similar offers patterns for the parts that are safe to allow
 * every time, Edit swaps the command for a field. Under 42rem the parts wrap
 * and stack as a list with their explanations. Under reduced motion the parts,
 * stems and tags fade in where they are.
 */
export function CommandUnpacked({
  command = defaultCommand,
  cwd = "~/waylight/web",
  root,
  agent = DEFAULT_AGENT,
  programs = defaultCommandPrograms,
  annotations,
  rules = defaultCommandRules,
  policy = null,
  decision: decisionProp,
  defaultDecision = "pending",
  onApprove,
  onDeny,
  onEditCommand,
  onAllowSimilar,
  unpacked: unpackedProp,
  defaultUnpacked = false,
  onUnpackedChange,
  trigger = "inView",
  confirmRisky = true,
  partStyle = "chips",
  riskColor = "var(--danger)",
  accent = "var(--accent-bright)",
  now = defaultCommandNow,
  label = "Command approval",
  className,
}: CommandUnpackedProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const projectRoot = root ?? cwd;

  /* ------------------------------ command ------------------------------ */

  const [edited, setEdited] = React.useState<string | null>(null);
  const [seenCommand, setSeenCommand] = React.useState(command);
  if (seenCommand !== command) {
    setSeenCommand(command);
    setEdited(null);
  }
  const shown = edited ?? command;
  const parts = React.useMemo(
    () => parseCommand(shown, cwd, projectRoot, programs),
    [shown, cwd, projectRoot, programs],
  );
  const ctx = React.useMemo<CommandContext>(
    () => ({ parts, cwd, root: projectRoot, programs }),
    [parts, cwd, projectRoot, programs],
  );
  const risks = React.useMemo(() => {
    const map = new Map<string, { rule: CommandRule; reason: string }[]>();
    for (const part of parts)
      for (const rule of rules) {
        const reason = rule.test(part, ctx);
        if (reason)
          map.set(part.id, [...(map.get(part.id) ?? []), { rule, reason }]);
      }
    return map;
  }, [parts, rules, ctx]);
  const dangerOf = (id: string) =>
    risks.get(id)?.some((r) => r.rule.level === "danger") ?? false;
  const cautionOf = (id: string) =>
    !dangerOf(id) && (risks.get(id)?.length ?? 0) > 0;
  const dangers = parts.filter((p) => dangerOf(p.id));
  const unknown = parts.some((p) =>
    risks.get(p.id)?.some((r) => r.rule.id === "unknown-program"),
  );
  const ruleNames = [
    ...new Set(
      [...risks.values()]
        .flat()
        .filter((r) => r.rule.level === "danger")
        .map((r) => r.rule.label.toLowerCase()),
    ),
  ];
  const explained = React.useMemo(
    () => new Map(parts.map((p) => [p.id, explain(p, programs, annotations)])),
    [parts, programs, annotations],
  );

  /* ------------------------------ decision ----------------------------- */

  const [ownDecision, setOwnDecision] =
    React.useState<CommandDecision>(defaultDecision);
  const decision = decisionProp ?? ownDecision;
  const pending = decision === "pending";
  const blocked = policy?.blocked === true;
  const [armed, setArmed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  React.useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const decide = (next: CommandDecision) => {
    if (decisionProp === undefined) setOwnDecision(next);
  };

  const approve = () => {
    if (!pending) return;
    if (blocked) {
      setAnnouncement(`Blocked by policy: ${policy?.reason ?? ""}`);
      return;
    }
    if (confirmRisky && dangers.length > 0 && !armed) {
      setArmed(true);
      setAnnouncement(
        `This command is risky: ${ruleNames.join(", ")}. Press Enter or Approve again within 4 seconds to run it.`,
      );
      return;
    }
    setArmed(false);
    decide("approved");
    onApprove?.(shown);
    setAnnouncement(`Approved. Running in ${cwd}.`);
  };

  const deny = () => {
    if (!pending) return;
    setArmed(false);
    decide("denied");
    onDeny?.(shown);
    setAnnouncement(`Denied. ${agent.name} was told.`);
  };

  /* ------------------------------- unpack ------------------------------ */

  const [ownUnpacked, setOwnUnpacked] = React.useState(defaultUnpacked);
  const unpacked = unpackedProp ?? ownUnpacked;
  const setUnpacked = React.useCallback(
    (next: boolean) => {
      if (unpackedProp === undefined) setOwnUnpacked(next);
      onUnpackedChange?.(next);
    },
    [unpackedProp, onUnpackedChange],
  );

  const rootRef = React.useRef<HTMLElement | null>(null);
  const [autoDone, setAutoDone] = React.useState(false);
  React.useEffect(() => {
    if (autoDone || trigger === "manual" || unpacked) return;
    const node = rootRef.current;
    let timer: number | undefined;
    const go = () => {
      timer = window.setTimeout(() => {
        setAutoDone(true);
        setUnpacked(true);
      }, 260);
    };
    if (
      trigger === "mount" ||
      !node ||
      typeof IntersectionObserver === "undefined"
    ) {
      go();
      return () => window.clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          io.disconnect();
          go();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [autoDone, trigger, unpacked, setUnpacked]);

  /* ------------------------------ geometry ----------------------------- */

  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const chipRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  // One stable ref callback for every part, for its whole life: a motion
  // element binds its ref once. The part's id rides on a data attribute.
  const registerChip = React.useCallback((node: HTMLButtonElement | null) => {
    const id = node?.dataset.cuPart;
    if (node && id) chipRefs.current.set(id, node);
  }, []);
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const partsKey = parts.map((p) => p.text).join(" ");

  const measure = React.useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const chips: Geo["chips"] = {};
    for (const [id, node] of chipRefs.current) {
      if (!node || !node.isConnected) continue;
      chips[id] = {
        cx: Math.round(node.offsetLeft + node.offsetWidth / 2),
        bottom: Math.round(node.offsetTop + node.offsetHeight),
      };
    }
    setGeo({ width: Math.round(content.scrollWidth), chips });
  }, []);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const raf = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined")
      return () => window.cancelAnimationFrame(raf);
    const ro = new ResizeObserver(() => measure());
    ro.observe(content);
    for (const node of chipRefs.current.values()) if (node) ro.observe(node);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measure, unpacked, partsKey, partStyle]);

  const tags = React.useMemo(() => {
    if (!geo || !unpacked) return [];
    return packTags(
      parts.map((p) => ({
        id: p.id,
        gist: explained.get(p.id)?.gist ?? p.kind,
      })),
      geo,
    );
  }, [geo, unpacked, parts, explained]);
  const rows = tags.reduce((m, t) => Math.max(m, t.row + 1), 0);
  const bandH = rows ? BAND_TOP + rows * ROW_H : 0;

  /* ------------------------------- active ------------------------------ */

  const firstRisk = dangers[0] ?? parts.find((p) => cautionOf(p.id));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = parts.find((p) => p.id === activeId) ?? firstRisk ?? parts[0];
  const [bindDetail, detailHeight] = useMeasured();

  /* -------------------------------- edit ------------------------------- */

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(shown);
  const editRef = React.useRef<HTMLInputElement | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);
  const startEdit = () => {
    if (!pending) return;
    setDraft(shown);
    setEditing(true);
    setMenuOpen(false);
  };
  const saveEdit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === shown) {
      editButtonRef.current?.focus();
      return;
    }
    setEdited(next);
    setActiveId(null);
    setArmed(false);
    onEditCommand?.(next);
    setAnnouncement(`Command changed to ${next}.`);
    editButtonRef.current?.focus();
  };

  /* ---------------------------- allow similar -------------------------- */

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [allowed, setAllowed] = React.useState<string | null>(null);
  const menuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const patterns = React.useMemo(() => {
    const out: { pattern: string; label: string }[] = [];
    const segments = new Map<number, CommandPart[]>();
    for (const p of parts)
      if (p.kind !== "operator")
        segments.set(p.segment, [...(segments.get(p.segment) ?? []), p]);
    for (const seg of segments.values()) {
      if (seg.some((p) => (risks.get(p.id)?.length ?? 0) > 0)) continue;
      const prog = seg.find((p) => p.kind === "program");
      if (!prog) continue;
      const sub = seg.find((p) => p.kind === "subcommand");
      const pattern = `${prog.text}${sub ? ` ${sub.text}` : ""} *`;
      out.push({ pattern, label: `Always allow ${pattern} in ${projectRoot}` });
    }
    return out;
  }, [parts, risks, projectRoot]);
  React.useEffect(() => {
    if (menuOpen) itemRefs.current[0]?.focus();
  }, [menuOpen]);
  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onRootKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (menuOpen) closeMenu();
    else if (editing) {
      setEditing(false);
      editButtonRef.current?.focus();
    } else deny();
  };

  /* ------------------------------- styling ----------------------------- */

  const vars = {
    "--cu-accent": accent,
    "--cu-wash": `color-mix(in oklab, ${accent} 13%, transparent)`,
    "--cu-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--cu-solid": `oklch(from ${accent} 0.55 c h)`,
    "--cu-on": "oklch(0.99 0.004 262)",
    "--cu-risk": riskColor,
    "--cu-risk-wash": `color-mix(in oklab, ${riskColor} 11%, transparent)`,
    "--cu-risk-line": `color-mix(in oklab, ${riskColor} 60%, transparent)`,
    "--cu-risk-solid": `oklch(from ${riskColor} 0.55 c h)`,
  } as React.CSSProperties;

  const chipLook = (p: CommandPart): string => {
    const danger = dangerOf(p.id);
    const caution = cautionOf(p.id);
    if (!unpacked)
      return cn(
        "border-transparent bg-transparent px-0",
        p.kind === "program"
          ? "text-foreground"
          : p.kind === "operator"
            ? "text-ink-3"
            : "text-ink-2",
      );
    const tone =
      p.kind === "program"
        ? "text-foreground font-semibold"
        : p.kind === "operator"
          ? "text-ink-3"
          : p.kind === "path"
            ? "text-foreground"
            : "text-ink-2";
    if (partStyle === "lines")
      return cn(
        "rounded-none border-x-0 border-t-0 border-b-2 bg-transparent px-0.5",
        tone,
        danger
          ? "border-b-(--cu-risk) text-(--cu-risk)"
          : caution
            ? "border-b-warn border-dashed"
            : p.kind === "program"
              ? "border-b-(--cu-accent)"
              : p.kind === "operator"
                ? "border-b-transparent"
                : "border-b-hairline-strong",
      );
    if (partStyle === "boxes")
      return cn(
        "bg-transparent px-1.5",
        tone,
        danger
          ? "border-(--cu-risk-line) text-(--cu-risk)"
          : caution
            ? "border-dashed border-warn"
            : p.kind === "program"
              ? "border-(--cu-line)"
              : p.kind === "operator"
                ? "border-transparent"
                : "border-hairline-strong",
      );
    return cn(
      "px-1.5",
      tone,
      danger
        ? "border-(--cu-risk-line) bg-(--cu-risk-wash) text-(--cu-risk)"
        : caution
          ? "border-dashed border-warn bg-[color-mix(in_oklab,var(--warn)_10%,transparent)]"
          : p.kind === "program"
            ? "border-transparent bg-(--cu-wash)"
            : p.kind === "operator"
              ? "border-transparent bg-transparent"
              : "border-transparent bg-surface-2",
    );
  };

  const step = cascade(parts.length);
  const askedAt = agent.askedAt ?? now - 12_000;
  const activeRisks = active ? (risks.get(active.id) ?? []) : [];
  const activeInfo = active ? explained.get(active.id) : undefined;

  /* -------------------------------- parts ------------------------------ */

  const chips = parts.map((p, i) => {
    const danger = dangerOf(p.id);
    const caution = cautionOf(p.id);
    const info = explained.get(p.id);
    const isActive = active?.id === p.id && unpacked;
    return (
      <motion.button
        key={`${p.id}-${p.text}`}
        ref={registerChip}
        data-cu-part={p.id}
        type="button"
        layout={motionSafe ? "position" : false}
        aria-label={`${p.text}, ${KIND_LABEL[p.kind]}${danger ? ", risky" : caution ? ", unknown" : ""}`}
        aria-describedby={`${uid}-d-${p.id}`}
        aria-current={isActive || undefined}
        onFocus={() => setActiveId(p.id)}
        onPointerEnter={() => setActiveId(p.id)}
        onClick={() => setActiveId(p.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            approve();
          }
        }}
        title={info?.text}
        className={cn(
          "relative inline-flex h-6 shrink-0 items-center rounded-1 border font-mono text-[12px] leading-none whitespace-pre transition-[background-color,border-color,color] duration-200",
          chipLook(p),
          FOCUS,
        )}
        initial={false}
        animate={{ y: unpacked && motionSafe ? -2 : 0 }}
        transition={
          motionSafe
            ? {
                ...springs.glide,
                delay: unpacked ? Number((i * step).toFixed(3)) : 0,
                layout: {
                  ...springs.glide,
                  delay: unpacked ? Number((i * step * 0.5).toFixed(3)) : 0,
                },
              }
            : { duration: 0 }
        }
      >
        {isActive ? (
          <motion.span
            layoutId={`${uid}-active`}
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-[3px] rounded-2 border-2",
              danger ? "border-(--cu-risk)" : "border-(--cu-accent)",
            )}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        ) : null}
        {p.text}
      </motion.button>
    );
  });

  return (
    <section
      ref={rootRef}
      aria-label={label}
      onKeyDown={onRootKey}
      className={cn(
        "@container/command-unpacked flex max-h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      {/* Who asks, and where it would run. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-(--cu-line) bg-(--cu-wash) text-(--cu-accent)">
            <Bot aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-5 font-medium">
              {`${agent.name} wants to run a command`}
            </p>
            <p className="truncate text-[11.5px] leading-4 text-ink-3">
              {[agent.task, ago(askedAt, now)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex h-6 items-center gap-1 rounded-1 border border-hairline bg-surface-1 px-1.5 font-mono text-[11px] text-ink-2"
            title={`Working directory: ${cwd}`}
          >
            <Folder aria-hidden className="size-3 shrink-0" />
            {cwd}
          </span>
          <button
            type="button"
            aria-pressed={unpacked}
            onClick={() => setUnpacked(!unpacked)}
            className={cn(
              "inline-flex h-6 items-center rounded-1 px-1.5 text-[11.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {unpacked ? "Pack" : "Unpack"}
          </button>
        </div>
      </div>

      <div className="[min-height:0] flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 py-3">
        {/* The command, and the drawing of its parts. */}
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              saveEdit();
            }}
          >
            <label htmlFor={`${uid}-edit`} className="text-[11.5px] text-ink-3">
              Edit the command, then press Enter to explain it again.
            </label>
            <input
              id={`${uid}-edit`}
              ref={editRef}
              value={draft}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                const v = event.currentTarget.value;
                setDraft(v);
              }}
              className={cn(
                "h-9 w-full rounded-3 border border-input bg-surface-0 px-3 font-mono text-[12px] text-foreground",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
          </form>
        ) : (
          <div
            className={cn(
              "rounded-3 border bg-surface-0 transition-colors",
              decision === "approved"
                ? "border-(--cu-line)"
                : decision === "denied"
                  ? "border-hairline opacity-70"
                  : "border-hairline",
            )}
          >
            <div className="[scrollbar-width:thin] overflow-x-auto px-3 py-3">
              <div
                ref={contentRef}
                className="relative w-full @min-[42rem]/command-unpacked:w-max @min-[42rem]/command-unpacked:min-w-full"
              >
                <ol
                  aria-label="Command parts"
                  className={cn(
                    "flex flex-wrap items-center gap-y-1.5 text-[12px] @min-[42rem]/command-unpacked:flex-nowrap",
                    unpacked ? "gap-x-1.5" : "gap-x-[0.6em]",
                  )}
                >
                  <li
                    aria-hidden
                    className="shrink-0 font-mono text-[12px] text-ink-3 select-none"
                  >
                    $
                  </li>
                  {chips.map((chip, i) => (
                    <li key={parts[i]?.id ?? i} className="contents">
                      {chip}
                    </li>
                  ))}
                </ol>

                {/* Stems and tags: the drawing, on wide cards. */}
                <motion.div
                  aria-hidden
                  className="relative hidden @min-[42rem]/command-unpacked:block"
                  initial={false}
                  animate={{ height: unpacked ? bandH : 0 }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                >
                  {geo && unpacked ? (
                    <svg
                      className="pointer-events-none absolute top-0 left-0 overflow-visible"
                      width={geo.width}
                      height={Math.max(1, bandH)}
                      viewBox={`0 0 ${geo.width} ${Math.max(1, bandH)}`}
                    >
                      {tags.map((t, i) => {
                        const top = BAND_TOP + t.row * ROW_H;
                        const d = `M ${t.cx} 3 V ${top}`;
                        const danger = dangerOf(t.id);
                        return (
                          <motion.path
                            key={`${t.id}-${partsKey}`}
                            d={d}
                            fill="none"
                            strokeWidth={danger ? 1.25 : 1}
                            className={
                              danger
                                ? "stroke-(--cu-risk)"
                                : cautionOf(t.id)
                                  ? "stroke-warn"
                                  : "stroke-hairline-strong"
                            }
                            initial={
                              motionSafe
                                ? { pathLength: 0, opacity: 0 }
                                : { opacity: 0 }
                            }
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={
                              motionSafe
                                ? {
                                    pathLength: {
                                      ...springs.glide,
                                      delay: Number(
                                        (0.22 + i * step).toFixed(3),
                                      ),
                                    },
                                    opacity: {
                                      duration: durations.fast,
                                      delay: Number(
                                        (0.22 + i * step).toFixed(3),
                                      ),
                                    },
                                  }
                                : { duration: durations.base }
                            }
                          />
                        );
                      })}
                    </svg>
                  ) : null}
                  {tags.map((t, i) => {
                    const danger = dangerOf(t.id);
                    const caution = cautionOf(t.id);
                    const on = active?.id === t.id;
                    return (
                      <motion.span
                        key={`${t.id}-${partsKey}`}
                        onPointerEnter={() => setActiveId(t.id)}
                        onClick={() => chipRefs.current.get(t.id)?.focus()}
                        className={cn(
                          "absolute flex cursor-default items-center justify-center rounded-1 border font-mono text-[10.5px] whitespace-nowrap transition-colors",
                          danger
                            ? "border-(--cu-risk-line) bg-(--cu-risk-wash) text-(--cu-risk)"
                            : caution
                              ? "border-dashed border-warn text-warn"
                              : on
                                ? "border-(--cu-line) bg-(--cu-wash) text-foreground"
                                : "border-hairline bg-card text-ink-2",
                        )}
                        style={{
                          left: t.left,
                          top: BAND_TOP + t.row * ROW_H,
                          width: t.width,
                          height: TAG_H,
                        }}
                        initial={
                          motionSafe
                            ? { opacity: 0, y: distances.nudge }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.glide,
                                delay: Number((0.34 + i * step).toFixed(3)),
                                opacity: {
                                  duration: durations.base,
                                  delay: Number((0.34 + i * step).toFixed(3)),
                                },
                              }
                            : { duration: durations.base }
                        }
                      >
                        {t.gist}
                      </motion.span>
                    );
                  })}
                </motion.div>
              </div>
            </div>
          </div>
        )}

        {/* Every part explained: a list on a phone… */}
        <motion.div
          aria-hidden
          className="overflow-hidden @min-[42rem]/command-unpacked:hidden"
          initial={false}
          animate={{
            opacity: unpacked && !editing ? 1 : 0,
            height: unpacked && !editing ? "auto" : 0,
          }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <ol className="flex flex-col gap-1 pt-2">
            {parts
              .filter((p) => p.kind !== "operator" || OPERATOR_TEXT[p.text])
              .map((p) => {
                const danger = dangerOf(p.id);
                const caution = cautionOf(p.id);
                const info = explained.get(p.id);
                const on = active?.id === p.id;
                return (
                  <li
                    key={p.id}
                    onClick={() => chipRefs.current.get(p.id)?.focus()}
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-2 border px-2 py-1.5 transition-colors",
                      danger
                        ? "border-(--cu-risk-line) bg-(--cu-risk-wash)"
                        : caution
                          ? "border-dashed border-warn"
                          : on
                            ? "border-(--cu-line) bg-(--cu-wash)"
                            : "border-transparent",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[12px] font-medium",
                        danger
                          ? "text-(--cu-risk)"
                          : p.kind === "program"
                            ? "text-foreground"
                            : "text-ink-2",
                      )}
                    >
                      {p.text}
                    </span>
                    <span className="min-w-0 text-[12px] leading-4 text-ink-2">
                      <span
                        className={cn(
                          "font-mono text-[10.5px]",
                          danger
                            ? "text-(--cu-risk)"
                            : caution
                              ? "text-warn"
                              : "text-ink-3",
                        )}
                      >
                        {info?.gist}
                      </span>
                      {" · "}
                      {(risks.get(p.id)?.[0]?.reason ?? info?.text) || ""}
                    </span>
                  </li>
                );
              })}
          </ol>
        </motion.div>

        {/* …and the part in focus, on wide cards. */}
        <motion.div
          className="hidden overflow-hidden @min-[42rem]/command-unpacked:block"
          initial={false}
          animate={{
            height: unpacked && !editing && active ? detailHeight : 0,
            opacity: unpacked && !editing ? 1 : 0,
          }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
          aria-hidden
        >
          <div ref={bindDetail} className="pt-3">
            <div className="grid">
              {active ? (
                <motion.div
                  key={`${active.id}-${partsKey}`}
                  className="flex flex-col gap-1.5 [grid-area:1/1]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={cn(
                        "font-mono text-[13px] font-semibold",
                        dangerOf(active.id)
                          ? "text-(--cu-risk)"
                          : "text-foreground",
                      )}
                    >
                      {active.text}
                    </span>
                    <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
                      {KIND_LABEL[active.kind]}
                      {active.program && active.kind !== "program"
                        ? ` · ${active.program}`
                        : ""}
                    </span>
                  </p>
                  <p className="max-w-[60ch] text-[13px] leading-5 text-ink-2">
                    {activeInfo?.text}
                  </p>
                  {activeRisks.map(({ rule, reason }) => (
                    <p
                      key={rule.id}
                      className={cn(
                        "flex items-start gap-1.5 text-[12.5px] leading-5",
                        rule.level === "danger"
                          ? "text-(--cu-risk)"
                          : "text-warn",
                      )}
                    >
                      <TriangleAlert
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                      <span>
                        <span className="font-medium">{rule.label}.</span>{" "}
                        {reason}
                      </span>
                    </p>
                  ))}
                </motion.div>
              ) : null}
            </div>
          </div>
        </motion.div>

        {/* What assistive tech reads for each part. */}
        <div hidden>
          {parts.map((p) => {
            const info = explained.get(p.id);
            const r = risks.get(p.id) ?? [];
            return (
              <p key={p.id} id={`${uid}-d-${p.id}`}>
                {`${info?.text ?? ""}${r.map((x) => ` ${x.rule.label}: ${x.reason}`).join("")}`}
              </p>
            );
          })}
        </div>
      </div>

      {/* Risks, policy and the decision. */}
      <div className="relative flex flex-col gap-2 border-t border-hairline px-3 py-2.5">
        {blocked ? (
          <p className="flex items-start gap-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-2.5 py-1.5 text-[12px] leading-4 text-foreground">
            <ShieldAlert
              aria-hidden
              className="mt-px size-3.5 shrink-0 text-danger"
            />
            <span>
              <span className="font-medium">Blocked by policy.</span>{" "}
              {policy?.reason}
              {policy?.source ? (
                <span className="text-ink-3">{` (${policy.source})`}</span>
              ) : null}
            </span>
          </p>
        ) : dangers.length > 0 || unknown ? (
          <p
            className={cn(
              "flex items-center gap-1.5 font-mono text-[11px] leading-4",
              dangers.length ? "text-(--cu-risk)" : "text-warn",
            )}
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {dangers.length
              ? `${dangers.length} ${dangers.length === 1 ? "risk" : "risks"} · ${ruleNames.join(" · ")}`
              : "Unknown program · read what it does before you approve"}
          </p>
        ) : null}

        {pending ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={`${uid}-menu`}
                aria-disabled={blocked || undefined}
                onClick={() => {
                  if (blocked) return;
                  setMenuOpen((o) => !o);
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  blocked && "opacity-50",
                  FOCUS,
                )}
              >
                {allowed ? (
                  <Check
                    aria-hidden
                    className="size-3.5 shrink-0 text-(--cu-accent)"
                  />
                ) : null}
                <span className="sr-only @min-[26rem]/command-unpacked:not-sr-only">
                  {allowed ? `Allowed ${allowed}` : "Allow similar"}
                </span>
                <span
                  className="@min-[26rem]/command-unpacked:hidden"
                  aria-hidden
                >
                  Allow
                </span>
                <ChevronDown aria-hidden className="size-3.5 shrink-0" />
              </button>
              {menuOpen ? (
                <motion.div
                  id={`${uid}-menu`}
                  role="menu"
                  aria-label="Allow similar commands"
                  className="absolute bottom-full left-0 z-20 mb-1.5 flex w-64 max-w-[calc(100cqw-1.5rem)] flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-lg"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  onKeyDown={(event) => {
                    const items = itemRefs.current.filter(
                      Boolean,
                    ) as HTMLButtonElement[];
                    const at = items.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const next =
                        items[
                          (at +
                            (event.key === "ArrowDown" ? 1 : -1) +
                            items.length) %
                            Math.max(1, items.length)
                        ];
                      next?.focus();
                    } else if (event.key === "Tab") {
                      setMenuOpen(false);
                    }
                  }}
                >
                  {patterns.length ? (
                    patterns.map((p, i) => (
                      <button
                        key={p.pattern}
                        ref={(node) => {
                          itemRefs.current[i] = node;
                        }}
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                          setAllowed(p.pattern);
                          onAllowSimilar?.(p.pattern);
                          setAnnouncement(
                            `${p.label}. The rest of this command still needs your approval.`,
                          );
                          closeMenu();
                        }}
                        className={cn(
                          "flex flex-col items-start rounded-2 px-2 py-1.5 text-left text-[12px] text-foreground transition-colors hover:bg-surface-2",
                          FOCUS,
                        )}
                      >
                        <span className="font-mono text-[12px]">
                          {p.pattern}
                        </span>
                        <span className="text-[11px] text-ink-3">{`Always allow in ${projectRoot}`}</span>
                      </button>
                    ))
                  ) : (
                    <button
                      ref={(node) => {
                        itemRefs.current[0] = node;
                      }}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      aria-disabled
                      onClick={closeMenu}
                      className={cn(
                        "rounded-2 px-2 py-1.5 text-left text-[12px] text-ink-3",
                        FOCUS,
                      )}
                    >
                      Nothing in this command is safe to allow every time.
                    </button>
                  )}
                </motion.div>
              ) : null}
            </div>
            <button
              ref={editButtonRef}
              type="button"
              onClick={editing ? saveEdit : startEdit}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <Pencil aria-hidden className="size-3.5 shrink-0" />
              {editing ? "Save" : "Edit"}
            </button>
            <span className="ml-auto" />
            <button
              type="button"
              onClick={deny}
              aria-keyshortcuts="Escape"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <X aria-hidden className="size-3.5 shrink-0" />
              Deny
              <kbd className="hidden font-mono text-[10px] text-ink-3 @min-[34rem]/command-unpacked:inline">
                Esc
              </kbd>
            </button>
            <button
              type="button"
              onClick={approve}
              aria-disabled={blocked || undefined}
              aria-keyshortcuts="Enter"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-[background-color,opacity] duration-200",
                blocked
                  ? "bg-surface-2 text-ink-3"
                  : armed
                    ? "bg-(--cu-risk-solid) text-(--cu-on)"
                    : "bg-(--cu-solid) text-(--cu-on) hover:bg-[color-mix(in_oklab,var(--cu-solid)_88%,black)]",
                FOCUS,
              )}
            >
              {blocked ? (
                <Lock aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <Check aria-hidden className="size-3.5 shrink-0" />
              )}
              {blocked ? "Approve" : armed ? "Approve anyway" : "Approve"}
              <kbd
                className={cn(
                  "hidden font-mono text-[10px] opacity-70 @min-[34rem]/command-unpacked:inline",
                  blocked && "@min-[34rem]/command-unpacked:hidden",
                )}
              >
                ↵
              </kbd>
            </button>
          </div>
        ) : (
          <motion.p
            key={decision}
            className={cn(
              "flex items-center gap-2 text-[12.5px]",
              decision === "approved" ? "text-foreground" : "text-ink-2",
            )}
            initial={motionSafe ? { opacity: 0, scale: 0.96 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              motionSafe ? springs.flick : { duration: durations.fast }
            }
          >
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-2 font-mono text-[11px] font-medium tracking-[0.04em] uppercase",
                decision === "approved"
                  ? "border-(--cu-line) bg-(--cu-wash) text-foreground"
                  : "border-hairline-strong text-ink-2",
              )}
            >
              {decision === "approved" ? (
                <Check aria-hidden className="size-3 shrink-0" />
              ) : (
                <X aria-hidden className="size-3 shrink-0" />
              )}
              {decision === "approved" ? "Approved" : "Denied"}
            </span>
            {decision === "approved"
              ? `Running in ${cwd}`
              : `${agent.name} was told`}
          </motion.p>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

const DEFAULT_AGENT = {
  name: "Waylight build agent",
  task: "Clearing stale caches before a clean build",
};
