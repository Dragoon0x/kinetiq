"use client";

import * as React from "react";

import { motion } from "motion/react";
import { Rocket } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { ActionRelay } from "@/registry/ui/action-relay";
import { MetronomeLoader } from "@/registry/ui/metronome-loader";

type DeployState = "idle" | "working" | "done";

/** Check that draws itself when the relay lands on "done". */
function DrawnCheck() {
  const motionSafe = useMotionSafe();
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="size-4 shrink-0"
      aria-hidden
    >
      <motion.path
        d="M3.5 8.5l3.2 3.2 5.8-7.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

export function ActionRelayDemo() {
  const [state, setState] = React.useState<DeployState>("idle");
  const [log, setLog] = React.useState<string[]>([]);
  const timersRef = React.useRef<Set<number>>(new Set());

  const schedule = React.useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }, []);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  const advance = React.useCallback((from: DeployState, to: DeployState) => {
    setState(to);
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLog((lines) => [...lines, `${time}  ${from} → ${to}`].slice(-3));
  }, []);

  const deploy = () => {
    if (state !== "idle") return;
    advance("idle", "working");
    schedule(() => advance("working", "done"), 2000);
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        Release console · prod-eu-1
      </span>

      <ActionRelay
        size="lg"
        state={state}
        onClick={deploy}
        busyStates={["working"]}
        onSettled={(settled) => {
          if (settled === "done") schedule(() => advance("done", "idle"), 1600);
        }}
        announcements={{
          idle: "Deploy to production",
          working: "Deploying",
          done: "Deployed",
        }}
        states={{
          idle: (
            <>
              <Rocket className="size-4 shrink-0" aria-hidden />
              Deploy to production
            </>
          ),
          working: (
            <>
              <MetronomeLoader size="sm" variant="sweep" label="Deploying" />
              Deploying…
            </>
          ),
          done: (
            <>
              <DrawnCheck />
              Deployed
            </>
          ),
        }}
      />

      <div className="border-border bg-card w-full rounded-2 border px-3 py-2.5">
        <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
          Relay log
        </p>
        <div className="mt-1.5 flex h-12 flex-col justify-end gap-0.5">
          {log.length === 0 ? (
            <p className="text-muted-foreground/60 font-mono text-[10px]">
              — awaiting first deploy
            </p>
          ) : (
            log.map((line, index) => (
              <p
                key={`${index}-${line}`}
                className="text-muted-foreground font-mono text-[10px] tabular-nums"
              >
                {line}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
