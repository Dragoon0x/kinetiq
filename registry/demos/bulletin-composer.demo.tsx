"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BulletinComposer,
  defaultBulletinBlocks,
  type BulletinBlock,
  type BulletinPreview,
} from "@/registry/ui/bulletin-composer";

export const tweaks = defineTweaks({
  previewWidth: {
    kind: "range",
    label: "Phone width",
    default: 380,
    min: 320,
    max: 420,
    step: 20,
    unit: "px",
  },
  blockStyle: {
    kind: "choice",
    label: "Blocks",
    default: "seamless",
    options: ["seamless", "framed", "stacked"],
    names: { seamless: "Seamless", framed: "Framed", stacked: "Stacked" },
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

const missing = (b: BulletinBlock) => b.kind === "image" && !b.alt.trim();

/**
 * The Fernworks letter for October, half written: seven blocks, and the
 * spore-print picture still has no alt text. Toggle the phone preview to
 * watch every block reflow, or drag a block to a new place.
 */
export function BulletinComposerDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [blocks, setBlocks] = React.useState<BulletinBlock[]>(
    defaultBulletinBlocks,
  );
  const [view, setView] = React.useState<BulletinPreview>("desktop");
  const [event, setEvent] = React.useState<string | null>(null);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  /** A host that answers after a short wait, like a real mail service. */
  const settleAfter = (ms: number, then: () => void) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        then();
        resolve();
      }, ms);
      timers.current.add(t);
    });

  const surface = (
    <BulletinComposer
      key={round}
      onChange={(next) => {
        if (next.length !== blocks.length) {
          setEvent(
            next.length > blocks.length ? "block added" : "block removed",
          );
        } else if (
          next.map((b) => b.id).join("|") !== blocks.map((b) => b.id).join("|")
        ) {
          const moved = next.findIndex((b, i) => b.id !== blocks[i]?.id);
          setEvent(`block moved to ${moved + 1}`);
        }
        setBlocks(next);
      }}
      onPreviewChange={setView}
      onSendTest={(address) =>
        settleAfter(900, () => setEvent(`test sent to ${address}`))
      }
      onSchedule={(at) =>
        settleAfter(700, () => {
          const d = new Date(at);
          const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
            d.getUTCDay()
          ];
          setEvent(
            `scheduled ${day} ${String(d.getUTCHours()).padStart(2, "0")}:00`,
          );
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const toFix = blocks.filter(missing).length;
  const width = values.previewWidth ?? 380;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBlocks(defaultBulletinBlocks);
            setView("desktop");
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
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
          {event ?? (view === "phone" ? `phone · ${width} px` : "desktop")}
        </span>{" "}
        · {blocks.length} blocks ·{" "}
        {toFix > 0 ? `${toFix} to fix` : "ready to send"}
      </p>
    </div>
  );
}
