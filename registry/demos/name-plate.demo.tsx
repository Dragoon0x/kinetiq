"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultCheckHandle,
  defaultNamePlateColours,
  defaultNamePlateValue,
  NamePlate,
  type NamePlateCheck,
  type NamePlateHandleState,
  type NamePlateStatus,
  type NamePlateValue,
} from "@/registry/ui/name-plate";

export const tweaks = defineTweaks({
  finish: {
    kind: "choice",
    label: "Finish",
    default: "brass",
    options: ["brass", "slate", "paper"],
    names: { brass: "Brass", slate: "Slate", paper: "Paper" },
  },
  tilt: { kind: "toggle", label: "Tilt", default: true },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const LOAD_MS = 900;

/**
 * Mara Lind joining Coldbrook: her first choice of handle is already taken,
 * so she takes a suggestion, picks a colour, and watches the plate engrave.
 */
export function NamePlateDemo({
  chrome = true,
  // The plate is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<NamePlateValue>(
    defaultNamePlateValue,
  );
  const [status, setStatus] = React.useState<NamePlateStatus>("ready");
  const [load, setLoad] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const [handleState, setHandleState] = React.useState<
    NamePlateHandleState | "saved"
  >("checking");
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  React.useEffect(() => {
    if (load === 0) return;
    const t = window.setTimeout(() => setStatus("ready"), LOAD_MS);
    return () => window.clearTimeout(t);
  }, [load]);

  // Fails the next lookup once, then hands the rest to the simulator.
  const check = React.useCallback<NamePlateCheck>((handle, context) => {
    if (failRef.current) {
      failRef.current = false;
      setFailNext(false);
      return Promise.reject(new Error("The availability service timed out."));
    }
    return defaultCheckHandle(handle, context);
  }, []);

  const reload = () => {
    setStatus("loading");
    setLoad((n) => n + 1);
  };

  const surface = (
    <NamePlate
      key={round}
      value={value}
      onChange={(next, change) => {
        setValue(next);
        if (change.field === "handle") setHandleState("checking");
        else if (handleState === "saved") setHandleState("free");
      }}
      checkHandle={check}
      onHandleCheck={(_handle, state) => setHandleState(state)}
      onSubmit={() => setHandleState("saved")}
      status={status}
      onRetry={reload}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const colour =
    defaultNamePlateColours.find((c) => c.id === value.colour)?.label ??
    value.colour;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reload} className={button}>
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext(!failNext);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next check
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(defaultNamePlateValue);
            setHandleState("checking");
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
          {status === "loading"
            ? "loading profile"
            : handleState === "saved"
              ? "plate engraved"
              : handleState === "checking"
                ? `checking @${value.handle || "handle"}`
                : handleState === "failed"
                  ? "check failed"
                  : `@${value.handle} ${handleState}`}
        </span>{" "}
        &middot; {value.name.trim() || "no name"} &middot;{" "}
        {value.avatar === "upload" ? "photo" : colour.toLowerCase()}
      </p>
    </div>
  );
}
