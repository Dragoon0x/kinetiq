"use client";

import * as React from "react";

import { Plus, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultHazardActions,
  defaultHazardWorkspace,
  HazardShelf,
  type HazardAction,
  type HazardStatus,
} from "@/registry/ui/hazard-shelf";

export const tweaks = defineTweaks({
  coverStyle: {
    kind: "choice",
    label: "Cover",
    default: "hinge",
    options: ["hinge", "slide", "fade"],
    names: { hinge: "Hinge", slide: "Slide", fade: "Fade" },
  },
  holdSeconds: {
    kind: "range",
    label: "Hold",
    default: 1.2,
    min: 0.6,
    max: 2.4,
    step: 0.1,
    unit: "s",
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "danger",
    options: ["danger", "warn"],
    names: { danger: "Red", warn: "Amber" },
  },
});

const EXTRA: HazardAction = {
  id: "wipe-exports",
  title: "Purge export history",
  summary: "Every generated export and its download link stops resolving.",
  verb: "Purge",
  busyText: "Purging export history",
  doneText: "Export history purged",
  icon: "alert",
};

/**
 * The danger zone of the Basinworks workspace: lift a cover, type the name,
 * and hold the button. Archive and Transfer give you eight seconds to change
 * your mind; Delete and Rotate do not.
 */
export function HazardShelfDemo({
  chrome = true,
  // The shelf is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<HazardStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [actions, setActions] = React.useState(defaultHazardActions);
  const [confirmed, setConfirmed] = React.useState(0);
  const [epoch, setEpoch] = React.useState(0);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const confirm = (action: HazardAction) =>
    new Promise<void>((resolve, reject) => {
      const fail = failNext;
      setFailNext(false);
      later(900, () => {
        if (fail) {
          reject(new Error(`${action.title} failed`));
          return;
        }
        setConfirmed((n) => n + 1);
        resolve();
      });
    });

  const reload = () => {
    setStatus("loading");
    later(900, () => setStatus("ready"));
  };

  const reset = () => {
    setActions(defaultHazardActions);
    setConfirmed(0);
    setFailNext(false);
    setStatus("ready");
    setEpoch((e) => e + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <HazardShelf height={540} {...values} />
      </div>
    );
  }

  const added = actions.some((a) => a.id === EXTRA.id);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <HazardShelf
        key={epoch}
        actions={actions}
        workspaceName={defaultHazardWorkspace}
        status={status}
        onRetry={reload}
        onConfirm={confirm}
        height={560}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {confirmed} {confirmed === 1 ? "action" : "actions"} confirmed
          </span>{" "}
          · next {failNext ? "fails" : "succeeds"} · {status}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next
          </button>
          <button
            type="button"
            aria-disabled={added || undefined}
            onClick={() => {
              if (!added) setActions((list) => [...list, EXTRA]);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50"
          >
            <Plus aria-hidden className="size-3.5" />
            Add a hazard
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
