"use client";

import * as React from "react";

import { PinPad } from "@/registry/ui/pin-pad";

const VALID_CODE = "2468";

export function PinPadDemo() {
  const [state, setState] = React.useState("locked");
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const verify = (code: string) =>
    new Promise<boolean>((resolve) => {
      setState("checking");
      timers.current.push(
        window.setTimeout(() => {
          const ok = code === VALID_CODE;
          setState(ok ? "unlocked" : "wrong code");
          if (!ok) {
            timers.current.push(
              window.setTimeout(() => setState("locked"), 1400),
            );
          }
          resolve(ok);
        }, 640),
      );
    });

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <PinPad label="Waylight door code" onComplete={verify} />

      <p className="text-center text-xs text-muted-foreground">
        The door code is 2468. Escape clears the row.
      </p>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight entry <span className="text-cobalt-bright">{state}</span>
      </p>
    </div>
  );
}
