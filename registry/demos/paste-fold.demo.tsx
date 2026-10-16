"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { Mail, RotateCcw, ScrollText, Table2 } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  gaugeworksLog,
  PasteFold,
  type PasteFoldHandle,
  type PasteFoldPart,
} from "@/registry/ui/paste-fold";

export const tweaks = defineTweaks({
  foldThreshold: {
    kind: "range",
    label: "Fold at",
    default: 8,
    min: 4,
    max: 40,
    step: 4,
    unit: "lines",
  },
  chipStyle: {
    kind: "choice",
    label: "Blocks",
    default: "tab",
    options: ["tab", "card", "pill"],
    names: { tab: "Tab", card: "Card", pill: "Pill" },
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

const START: PasteFoldPart[] = [
  { type: "text", text: "The overnight import failed again. " },
];

const READINGS = [
  "gauge\tregion\tlevel_m\tcapacity_pct\tread_at",
  "N-04\tnorth\t12.41\t78\t2026-10-13 23:00",
  "N-11\tnorth\t9.87\t71\t2026-10-13 23:00",
  "S-02\tsouth\t14.02\t83\t2026-10-13 23:00",
  "S-19\tsouth\t13.55\t80\t2026-10-13 23:00",
  "S-27\tsouth\t11.20\t69\t2026-10-13 23:00",
  "C-08\tcoast\t7.64\t58\t2026-10-13 23:00",
  "C-33\tcoast\t7.10\t54\t2026-10-13 23:00",
  "C-41\tcoast\t—\t—\t2026-10-12 23:00",
  "C-47\tcoast\t—\t—\t2026-10-12 23:00",
  "C-52\tcoast\t—\t—\t2026-10-12 23:00",
  "C-55\tcoast\t—\t—\t2026-10-12 23:00",
].join("\n");

const NOTE = [
  "From: Coast field team <coast@gaugeworks.example>",
  "Subject: Coast gauges 41 to 55 offline overnight",
  "",
  "Hi all,",
  "",
  "The relay at Saltings Point lost power at about 01:40, so gauges 41 to 55",
  "could not answer the archive. Power is back and they are reporting again,",
  "but last night's readings will need a manual pull this morning.",
  "",
  "Thanks,",
  "Coast field team",
].join("\n");

const lineCount = (t: string) => t.split("\n").length;

/**
 * Gaugeworks' import service: an engineer starts a message about last
 * night's failed run and pastes the whole error log into it. The demo pastes
 * the log itself a moment after it is first seen.
 */
export function PasteFoldDemo({
  chrome = true,
  // The composer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(
    START[0]?.type === "text" ? START[0].text.length : 0,
  );
  const handle = React.useRef<PasteFoldHandle | null>(null);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });
  const limit = 4000;

  // Pastes the log once per round, after the composer has been seen.
  const pasted = React.useRef(-1);
  React.useEffect(() => {
    if (!inView || pasted.current === round) return;
    const t = window.setTimeout(() => {
      pasted.current = round;
      handle.current?.paste(gaugeworksLog);
    }, 900);
    return () => window.clearTimeout(t);
  }, [inView, round]);

  const surface = (
    <PasteFold
      key={round}
      ref={handle}
      defaultValue={START}
      limit={limit}
      onValueChange={(parts) =>
        setTotal(
          parts.reduce(
            (n, p) =>
              n + (p.type === "text" ? p.text.length : p.block.text.length),
            0,
          ),
        )
      }
      onPasteDetected={(block) =>
        setEvent(`${block.kind} folded · ${lineCount(block.text)} lines`)
      }
      onTrim={(_block, kept) => setEvent(`trimmed · ${kept.length} lines kept`)}
      onSubmit={(parts) =>
        setEvent(
          `sent · ${parts.filter((p) => p.type === "block").length} blocks`,
        )
      }
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
  const over = total - limit;

  return (
    <div ref={frame} className="flex w-full max-w-2xl flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Gaugeworks · import service · run 4412
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handle.current?.paste(gaugeworksLog)}
          className={button}
        >
          <ScrollText aria-hidden className="size-3.5" />
          Paste the log
        </button>
        <button
          type="button"
          onClick={() => handle.current?.paste(READINGS)}
          className={button}
        >
          <Table2 aria-hidden className="size-3.5" />
          Paste readings
        </button>
        <button
          type="button"
          onClick={() => handle.current?.paste(NOTE)}
          className={button}
        >
          <Mail aria-hidden className="size-3.5" />
          Paste an email
        </button>
        <button
          type="button"
          onClick={() => {
            setEvent(null);
            setTotal(START[0]?.type === "text" ? START[0].text.length : 0);
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
        <span className="text-signal">
          {over > 0
            ? `over by ${String(over).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} characters`
            : (event ?? "type, or paste something long")}
        </span>{" "}
        · gaugeworks import
      </p>
    </div>
  );
}
