"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSpurAnswerFor,
  defaultSpurColumns,
  SpurColumns,
  type SpurAnswerFor,
  type SpurColumn,
} from "@/registry/ui/spur-columns";

export const tweaks = defineTweaks({
  columnWidth: {
    kind: "range",
    label: "Column",
    default: 280,
    min: 240,
    max: 360,
    step: 20,
    unit: "px",
  },
  spineStyle: {
    kind: "choice",
    label: "Spines",
    default: "label",
    options: ["label", "index", "bar"],
    names: { label: "Label", index: "Number", bar: "Bar" },
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

/**
 * A Fernworks onboarding question, already followed into "workspace roles".
 * Choose any dotted phrase — or select words — to open another column. The
 * answer about SCIM provisioning fails the first time so the retry shows;
 * anything without a canned answer comes back empty.
 */
export function SpurColumnsDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [columns, setColumns] =
    React.useState<SpurColumn[]>(defaultSpurColumns);
  const [activePhrase, setActivePhrase] = React.useState<string | null>(
    "workspace roles",
  );
  const [event, setEvent] = React.useState<string | null>(null);
  const failedOnce = React.useRef(false);

  const answerFor = React.useCallback<SpurAnswerFor>((prompt, context) => {
    if (
      context.kind === "spur" &&
      prompt.toLowerCase() === "scim provisioning" &&
      !failedOnce.current
    ) {
      failedOnce.current = true;
      return new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 900),
      );
    }
    return defaultSpurAnswerFor(prompt, context);
  }, []);

  const reset = () => {
    failedOnce.current = false;
    setColumns(defaultSpurColumns);
    setActivePhrase("workspace roles");
    setEvent(null);
    setRound((r) => r + 1);
  };

  const loading = columns.find((c) =>
    c.turns.some((t) => t.status === "loading"),
  );

  const surface = (
    <SpurColumns
      key={round}
      answerFor={answerFor}
      onColumnsChange={setColumns}
      onActiveChange={(id) => {
        const c = columns.find((x) => x.id === id);
        setActivePhrase(c?.phrase ?? null);
      }}
      onOpenSpur={(phrase) => {
        setActivePhrase(phrase);
        setEvent(`spur · ${phrase}`);
      }}
      onCloseSpur={() => setEvent("folded back")}
      onAsk={(text) => setEvent(`asked · ${text.slice(0, 24)}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {loading
            ? `answering “${loading.phrase ?? "question"}”`
            : (event ?? "ready")}
        </span>{" "}
        · {columns.length} columns · active: {activePhrase ?? "question"}
      </p>
    </div>
  );
}
