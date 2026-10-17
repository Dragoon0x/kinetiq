"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRunJournalEntries,
  RunJournal,
  type RunJournalEntry,
  type RunJournalState,
} from "@/registry/ui/run-journal";

export const tweaks = defineTweaks({
  nibStyle: {
    kind: "choice",
    label: "Nib",
    default: "nib",
    options: ["nib", "pencil", "caret"],
    names: { nib: "Nib", pencil: "Pencil", caret: "Caret" },
  },
  condenseAfter: {
    kind: "range",
    label: "Keep open",
    default: 3,
    min: 1,
    max: 6,
    step: 1,
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

/** Words, with a `[[link|several words]]` kept whole so it never shows half-typed. */
const tokens = (text: string) =>
  text.match(/\[\[[^\]]*\]\]\S*\s*|\S+\s*/g) ?? [];

const SCRIPT = defaultRunJournalEntries.map((e) => tokens(e.text));
/** The approval pause comes after this entry is written. */
const PAUSE_AFTER = 5;
const TICK = 150;
const BETWEEN = 900;
const HOLD = 2600;
const MIN = 60_000;

/** Where the journal opens: three entries done, the fourth begun. */
const START = { entry: 3, word: 4 };

type Play = {
  entry: number;
  word: number;
  state: RunJournalState;
  /** The pause for approval has happened. */
  asked: boolean;
};

type Said =
  | { kind: "open"; label: string }
  | { kind: "expand"; summary: string; open: boolean }
  | { kind: "stop"; entry: number };

function useOnScreen(node: HTMLElement | null) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let inView = false;
    const sync = () => setOn(inView && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      sync();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [node]);
  return on;
}

/**
 * Waylight's migration agent writing up Run 18 as it goes: it pauses once
 * for approval of the cut-over, then finishes and starts over.
 */
export function RunJournalDemo({
  chrome = true,
  // The journal is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [play, setPlay] = React.useState<Play>({
    ...START,
    state: "writing",
    asked: false,
  });
  const [said, setSaid] = React.useState<Said | null>(null);
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(node);

  const entries = React.useMemo<RunJournalEntry[]>(() => {
    const out: RunJournalEntry[] = [];
    for (let i = 0; i <= play.entry; i++) {
      const e = defaultRunJournalEntries[i];
      if (!e) break;
      const words = SCRIPT[i] ?? [];
      out.push(
        i < play.entry
          ? e
          : { ...e, text: words.slice(0, play.word).join("").trimEnd() },
      );
    }
    return out;
  }, [play.entry, play.word]);

  // One word per tick; a breath between entries; a held pause for approval.
  React.useEffect(() => {
    if (!onScreen || play.state === "failed") return;
    const words = SCRIPT[play.entry]?.length ?? 0;
    const lastEntry = play.entry >= SCRIPT.length - 1;
    let wait = TICK;
    let next: Play;
    if (play.state === "finished") {
      wait = HOLD * 2;
      next = { ...START, state: "writing", asked: false };
    } else if (play.state === "paused") {
      wait = HOLD;
      next = { ...play, state: "writing", asked: true };
    } else if (play.word < words) {
      next = { ...play, word: play.word + 1 };
    } else if (play.entry === PAUSE_AFTER && !play.asked) {
      wait = BETWEEN;
      next = { ...play, state: "paused" };
    } else if (lastEntry) {
      wait = BETWEEN;
      next = { ...play, state: "finished" };
    } else {
      wait = BETWEEN;
      next = { ...play, entry: play.entry + 1, word: 1 };
    }
    const id = window.setTimeout(() => {
      if (play.state === "finished") setRound((r) => r + 1);
      setPlay(next);
    }, wait);
    return () => window.clearTimeout(id);
  }, [onScreen, play]);

  const current = defaultRunJournalEntries[play.entry];
  const now =
    (current?.at ?? 0) +
    Math.round((play.word / Math.max(1, SCRIPT[play.entry]?.length ?? 1)) * 2) *
      MIN;

  const surface = (
    <RunJournal
      key={round}
      entries={entries}
      state={play.state}
      now={now}
      onStop={() => {
        setPlay((p) => ({ ...p, state: "failed" }));
        setSaid({ kind: "stop", entry: play.entry + 1 });
      }}
      onResume={() => setPlay((p) => ({ ...p, state: "writing", asked: true }))}
      error="Stopped by hand; the read flag is back at 0%."
      onOpenArtifact={(artifact, event) => {
        // The demo keeps the reader on the page; a product would navigate.
        event.preventDefault();
        setSaid({ kind: "open", label: artifact.label });
      }}
      onExpandEntry={(id, open) => {
        const e = defaultRunJournalEntries.find((x) => x.id === id);
        if (e) setSaid({ kind: "expand", summary: e.summary, open });
      }}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={setNode} className="w-full">
        {surface}
      </div>
    );
  }

  const total = defaultRunJournalEntries.length;

  return (
    <div ref={setNode} className="flex w-full max-w-md flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setPlay({ ...START, state: "writing", asked: false });
            setSaid(null);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Restart
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {said?.kind === "open" ? (
          <>
            <span className="text-signal">opened {said.label}</span> · entry{" "}
            {play.entry + 1} of {total}
          </>
        ) : said?.kind === "expand" ? (
          <>
            <span className="text-signal">
              {said.open ? "opened" : "folded"}
            </span>{" "}
            · {said.summary.replace(/\.$/, "")}
          </>
        ) : said?.kind === "stop" && play.state === "failed" ? (
          <>
            <span className="text-signal">stopped</span> · at entry {said.entry}{" "}
            of {total}
          </>
        ) : play.state === "paused" ? (
          <>
            <span className="text-signal">paused</span> · awaiting approval
          </>
        ) : play.state === "finished" ? (
          <>
            <span className="text-signal">finished</span> · {total} entries
          </>
        ) : (
          <>
            <span className="text-signal">
              writing entry {play.entry + 1} of {total}
            </span>{" "}
            · {Math.max(0, play.entry + 1 - (values.condenseAfter ?? 3))}{" "}
            condensed
          </>
        )}
      </p>
    </div>
  );
}
