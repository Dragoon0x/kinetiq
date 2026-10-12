"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPrimerDecisions,
  defaultPrimerPermissions,
  PermissionPrimer,
  type PrimerDecision,
  type PrimerDecisions,
  type PrimerStatus,
} from "@/registry/ui/permission-primer";

export const tweaks = defineTweaks({
  illustration: {
    kind: "choice",
    label: "Illustration",
    default: "line",
    options: ["line", "filled"],
    names: { line: "Line", filled: "Filled" },
  },
  dialogStyle: {
    kind: "choice",
    label: "Dialog",
    default: "sheet",
    options: ["sheet", "centre"],
    names: { sheet: "Sheet", centre: "Centre" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "success", "ink"],
    names: { cobalt: "Cobalt", success: "Green", ink: "Ink" },
  },
});

type Answerer = "viewer" | "grant" | "deny";

const ANSWERER_NEXT: Record<Answerer, Answerer> = {
  viewer: "grant",
  grant: "deny",
  deny: "viewer",
};

const ANSWERER_WORD: Record<Answerer, string> = {
  viewer: "System: you answer",
  grant: "System: allows",
  deny: "System: denies",
};

const LOAD_MS = 900;
const SYSTEM_MS = 700;

/**
 * A Basinworks Field crew's first run: the app explains the camera, location
 * and notifications before the system asks, and the system can be played by
 * you in the mock dialog or made to allow or deny on its own.
 */
export function PermissionPrimerDemo({
  chrome = true,
  // The primer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [answerer, setAnswerer] = React.useState<Answerer>("viewer");
  const [status, setStatus] = React.useState<PrimerStatus>("ready");
  const [decisions, setDecisions] = React.useState<PrimerDecisions>(
    defaultPrimerDecisions,
  );
  const [note, setNote] = React.useState<string | null>(null);
  const loadTimer = React.useRef<number | null>(null);
  const systemTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
      if (systemTimer.current !== null)
        window.clearTimeout(systemTimer.current);
    },
    [],
  );

  const reload = () => {
    if (loadTimer.current !== null) window.clearTimeout(loadTimer.current);
    setStatus("loading");
    setNote(null);
    loadTimer.current = window.setTimeout(() => {
      loadTimer.current = null;
      setStatus("ready");
    }, LOAD_MS);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <PermissionPrimer height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <PermissionPrimer
      key={round}
      status={status}
      onRetry={reload}
      decisions={decisions}
      onDecisionsChange={setDecisions}
      onAsk={
        answerer === "viewer"
          ? undefined
          : () =>
              new Promise<PrimerDecision>((resolve) => {
                if (systemTimer.current !== null)
                  window.clearTimeout(systemTimer.current);
                systemTimer.current = window.setTimeout(() => {
                  systemTimer.current = null;
                  resolve(answerer === "grant" ? "granted" : "denied");
                }, SYSTEM_MS);
              })
      }
      onDecide={(p, d) => setNote(`${p.feature.toLowerCase()} ${d}`)}
      onNotNow={(p) => setNote(`${p.feature.toLowerCase()} skipped`)}
      onOpenSettings={(p) =>
        setNote(`opened settings for ${p.feature.toLowerCase()}`)
      }
      height={540}
      {...values}
    />
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const summary = defaultPrimerPermissions
    .map((p) => `${p.kind} ${decisions[p.id] ?? "not asked"}`)
    .join(" · ");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={answerer !== "viewer"}
          onClick={() => {
            setAnswerer((a) => ANSWERER_NEXT[a]);
            setNote(null);
          }}
          className={button}
        >
          {ANSWERER_WORD[answerer]}
        </button>
        <button
          type="button"
          aria-pressed={status !== "ready"}
          onClick={reload}
          className={button}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => {
            if (loadTimer.current !== null)
              window.clearTimeout(loadTimer.current);
            if (systemTimer.current !== null)
              window.clearTimeout(systemTimer.current);
            loadTimer.current = null;
            systemTimer.current = null;
            setStatus("ready");
            setDecisions(defaultPrimerDecisions);
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
        <span className="text-signal">
          {note ??
            (status === "loading"
              ? "loading"
              : status === "error"
                ? "load failed"
                : answerer === "viewer"
                  ? "you play the system"
                  : answerer === "grant"
                    ? "the system allows"
                    : "the system denies")}
        </span>{" "}
        · {summary}
      </p>
    </div>
  );
}
