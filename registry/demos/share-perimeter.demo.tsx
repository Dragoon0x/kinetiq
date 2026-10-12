"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSharePeople,
  SharePerimeter,
  type ShareChange,
  type ShareLinkAccess,
  type SharePerson,
  type ShareStatus,
} from "@/registry/ui/share-perimeter";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Perimeter",
    default: "rings",
    options: ["rings", "orbit", "list"],
    names: { rings: "Rings", orbit: "Orbit", list: "List only" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

const LOAD_MS = 900;

const describe = (change: ShareChange, people: SharePerson[]): string => {
  const name = people.find((p) => p.id === change.personId)?.name ?? "someone";
  if (change.type === "move") return `${name} to ${change.to}`;
  if (change.type === "add") return `${name} added`;
  return `${name} removed`;
};

/**
 * Sharing Coldbrook's Harbour brief: six people on four rings, a link that
 * can be opened to anyone, and a directory to add more from.
 */
export function SharePerimeterDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [people, setPeople] = React.useState<SharePerson[]>(defaultSharePeople);
  const [link, setLink] = React.useState<ShareLinkAccess>("restricted");
  const [status, setStatus] = React.useState<ShareStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState("nothing changed yet");
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setLast(fail ? "the load failed" : "reloaded");
    }, LOAD_MS);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPeople(defaultSharePeople);
    setLink("restricted");
    setStatus("ready");
    setFailNext(false);
    setLast("reset");
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <SharePerimeter height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <SharePerimeter
      height={540}
      people={people}
      onChange={(next, change) => {
        setPeople(next);
        setLast(describe(change, change.type === "remove" ? people : next));
      }}
      linkAccess={link}
      onLinkAccessChange={(next) => {
        setLink(next);
        setLast(
          next === "restricted" ? "link restricted" : `link open: ${next}`,
        );
      }}
      onCopyLink={() => setLast("link copied")}
      status={status}
      onRetry={reload}
      {...values}
    />
  );

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {people.length + 1} people · link {link}
          </span>{" "}
          · {last}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={button}>
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={button}
          >
            {failNext ? "Next load fails" : "Fail next load"}
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
