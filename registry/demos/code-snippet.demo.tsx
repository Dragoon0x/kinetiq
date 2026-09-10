"use client";

import * as React from "react";

import { CodeSnippet, type CodeBlock } from "@/registry/ui/code-snippet";

const HOLD = `# hold rules for order 4471, Coldbrook depot
let window = 0700 until 1230
when parcel gate is "north" and parcel weight > 18
  route parcel to bay 3
  hold parcel until window opens
else
  route parcel to bay 1
stop when bay 3 is full
send note to depot "held 4471 for the morning run, release it once the first belt run clears the north line"
let retry = 2
when hold fails
  send note to depot "gate 4 refused, retrying"
  stop
# checked by Rui`;

const FIX = `when parcel gate is "north"
  route parcel to bay 1
stop`;

const SNIPPETS: CodeBlock[] = [
  {
    id: "s1",
    from: "peer",
    language: "route",
    filename: "hold-4471.route",
    code: HOLD,
    time: "09:41",
  },
  {
    id: "s2",
    from: "me",
    language: "route",
    filename: "fix.route",
    code: FIX,
    time: "09:44",
    delivery: "read",
  },
];

const FOLD_LINES = 8;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CodeSnippetDemo() {
  const [open, setOpen] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [blocked, setBlocked] = React.useState(false);

  const first = SNIPPETS[0];
  const lines = first ? first.code.split("\n").length : 0;
  const unfolded = first ? open.includes(first.id) : false;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CodeSnippet
        label="Coldbrook depot thread"
        peerName="Rui"
        snippets={SNIPPETS}
        foldLines={FOLD_LINES}
        open={open}
        onOpenChange={(id, next) =>
          setOpen((prev) =>
            next ? [...prev, id] : prev.filter((item) => item !== id),
          )
        }
        onCopy={(id) => {
          setCopied(id);
          setBlocked(false);
        }}
        onCopyFail={() => setBlocked(true)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={unfolded}
          onClick={() => setOpen(SNIPPETS.map((item) => item.id))}
        >
          Unfold both
        </button>
        <button
          type="button"
          className={chip}
          disabled={open.length === 0}
          onClick={() => setOpen([])}
        >
          Fold both
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {first?.filename ?? "No block"} · {lines} lines ·{" "}
        {unfolded ? "unfolded" : `folded at ${FOLD_LINES}`} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {blocked ? "copy blocked" : copied ? "copied" : "not copied"}
        </span>
      </p>
    </div>
  );
}
