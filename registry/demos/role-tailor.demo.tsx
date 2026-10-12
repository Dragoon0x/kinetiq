"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countTailorMembers,
  defaultTailorMembers,
  defaultTailorRoles,
  RoleTailor,
  type TailorRole,
  type TailorStatus,
} from "@/registry/ui/role-tailor";

export const tweaks = defineTweaks({
  controlStyle: {
    kind: "choice",
    label: "Cells",
    default: "segmented",
    options: ["segmented", "radios", "switches"],
    names: { segmented: "Segmented", radios: "Radios", switches: "Switches" },
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

/**
 * Coldbrook Admin's five roles: tailor what an Editor can do, set a role to a
 * preset, and compare it with Admin to see where they differ.
 */
export function RoleTailorDemo({
  chrome = true,
  // The editor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [roles, setRoles] = React.useState<TailorRole[]>(defaultTailorRoles);
  const [selected, setSelected] = React.useState<string | null>("editor");
  const [status, setStatus] = React.useState<TailorStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <RoleTailor height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setRoles(defaultTailorRoles);
    setSelected("editor");
    setStatus("ready");
    setFailNext(false);
  };

  const role = roles.find((r) => r.id === selected);
  const members = role ? countTailorMembers(defaultTailorMembers, role.id) : 0;
  const custom = roles.filter((r) => r.preset === null).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <RoleTailor
        height={540}
        roles={roles}
        onChange={setRoles}
        value={selected}
        onSelect={setSelected}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "ready"
              ? role
                ? `${role.name} · ${role.locked ? "locked" : role.preset === null ? "custom" : role.preset}`
                : "no role"
              : status}
          </span>{" "}
          · {members} members · {roles.length} roles · {custom} custom
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
