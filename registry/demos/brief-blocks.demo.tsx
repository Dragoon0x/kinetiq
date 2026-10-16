"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BriefBlocks,
  defaultBriefBlocks,
  defaultBriefKinds,
  type BriefBlock,
  type BriefMode,
} from "@/registry/ui/brief-blocks";

export const tweaks = defineTweaks({
  blockStyle: {
    kind: "choice",
    label: "Blocks",
    default: "card",
    options: ["card", "strip", "line"],
    names: { card: "Card", strip: "Strip", line: "Line" },
  },
  ribbonFont: {
    kind: "choice",
    label: "Ribbon",
    default: "sans",
    options: ["sans", "serif", "mono"],
    names: { sans: "Sans", serif: "Serif", mono: "Mono" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const LIMIT = 1200;

/** A pasted research dump: the kind of context that pushes a brief over. */
const DUMP =
  " Interview notes: nine of twelve riders said they screenshot their route before a tunnel. Three switched to paper maps on the coast road. Support macros for offline issues were used 412 times in March. The rider app already caches the last viewed map tile set, but not turn instructions, so a route that starts offline shows a map with no directions. The commuter segment rides the same three routes on most days, which means a small saved set would cover most trips. Battery impact of pre-downloading is unknown and needs a test on older phones. Legal has asked whether stored routes count as location history under the new data policy, and the answer affects how long we may keep them on the device. Two rider councils, in Lisbon and Porto, offered to test an early build, and both asked for a clear sign of which routes are saved and when each one was last updated.";

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const labelOf = (b: BriefBlock) =>
  (
    defaultBriefKinds.find((k) => k.id === b.kind)?.label ?? b.kind
  ).toLowerCase();

/**
 * A Waylight product manager briefs the assistant on a one-page brief for
 * offline routes. The gallery card threads the blocks into the ribbon once
 * it is seen, then unthreads them.
 */
export function BriefBlocksDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [blocks, setBlocks] = React.useState<BriefBlock[]>(defaultBriefBlocks);
  const [mode, setMode] = React.useState<BriefMode>("edit");
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  const total = blocks.reduce((n, b) => n + b.text.trim().length, 0);
  const longest = blocks.reduce<BriefBlock | null>(
    (best, b) => (!best || b.text.length > best.text.length ? b : best),
    null,
  );
  const empty = blocks.filter((b) => !b.text.trim()).length;
  const status =
    note ??
    (total > LIMIT
      ? `too long · ${longest ? labelOf(longest) : "a block"} is the culprit`
      : mode === "ribbon"
        ? `ribbon · ${blocks.length} blocks`
        : `${blocks.length} blocks · ${group(total)} of ${group(LIMIT)} · ${empty ? `${empty} empty` : "ready"}`);

  // The gallery card threads the ribbon once it has been seen, then lets go.
  const played = React.useRef(false);
  React.useEffect(() => {
    if (chrome || !inView || played.current) return;
    const a = window.setTimeout(() => setMode("ribbon"), 1100);
    const b = window.setTimeout(() => {
      played.current = true;
      setMode("edit");
    }, 4600);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [chrome, inView]);

  const surface = (
    <BriefBlocks
      key={round}
      blocks={blocks}
      onChange={(next) => {
        setBlocks(next);
        setNote(null);
      }}
      mode={mode}
      onModeChange={(m) => {
        setMode(m);
        setNote(null);
      }}
      maxLength={LIMIT}
      onSavePreset={(p) => setNote(`preset saved · ${p.name.toLowerCase()}`)}
      onSubmit={(_, sent) => setNote(`sent · ${sent.length} blocks`)}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBlocks((list) =>
              list.map((b) =>
                b.kind === "context" && !b.text.includes("Interview notes")
                  ? { ...b, text: b.text + DUMP }
                  : b,
              ),
            );
            setNote(null);
          }}
          className={button}
        >
          Overfill
        </button>
        <button
          type="button"
          onClick={() => {
            setBlocks(defaultBriefBlocks);
            setMode("edit");
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span>
        {" · waylight offline routes"}
      </p>
    </div>
  );
}
