"use client";

import * as React from "react";

import { EnvSwitch, type EnvStop } from "@/registry/ui/env-switch";

/** Coldbrook's three stops: two internal, one guarded and public. */
const STOPS: EnvStop[] = [
  { id: "yard", name: "yard", host: "yard.coldbrook.internal" },
  { id: "dock", name: "dock", host: "dock.coldbrook.internal" },
  { id: "live", name: "live", host: "ledger.waylightpay.net", guarded: true },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function EnvSwitchDemo() {
  const [env, setEnv] = React.useState("yard");
  const [armed, setArmed] = React.useState<string | null>(null);

  const stop = STOPS.find((entry) => entry.id === env);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <EnvSwitch
        stops={STOPS}
        service="ledger-api"
        value={env}
        onValueChange={setEnv}
        onArmedChange={setArmed}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={env === "yard"}
          onClick={() => setEnv("yard")}
        >
          Reset to yard
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">Env {stop ? stop.name : "none"}</span>
        {stop ? ` · ${stop.host}` : ""}
        {armed ? ` · ${armed} armed` : " · not armed"}
      </p>
    </div>
  );
}
