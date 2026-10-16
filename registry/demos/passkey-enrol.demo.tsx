"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPasskeyDevices,
  defaultPasskeyNow,
  PasskeyEnrol,
  type PasskeyDevice,
  type PasskeyDeviceKind,
} from "@/registry/ui/passkey-enrol";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Rings",
    default: "rings",
    options: ["rings", "arcs", "dots"],
    names: { rings: "Rings", arcs: "Arcs", dots: "Dots" },
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
    options: ["cobalt", "mint", "amber", "ink"],
    names: { cobalt: "Cobalt", mint: "Mint", amber: "Amber", ink: "Ink" },
  },
});

/** How long the simulated platform prompt stays open. */
const PROMPT_MS = 3000;
const NEW_DEVICES: { name: string; kind: PasskeyDeviceKind }[] = [
  { name: "This laptop", kind: "laptop" },
  { name: "Studio desktop", kind: "desktop" },
  { name: "Pocket phone", kind: "phone" },
];

/**
 * A Waylight account with two passkeys. Create opens a simulated platform
 * prompt that answers after three seconds; the docs can make the next prompt
 * close unanswered or pretend the browser has no passkeys at all.
 */
export function PasskeyEnrolDemo({
  chrome = true,
  // The step is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [devices, setDevices] = React.useState<PasskeyDevice[]>(
    defaultPasskeyDevices,
  );
  const [cancelNext, setCancelNext] = React.useState(false);
  const [unsupported, setUnsupported] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const cancelRef = React.useRef(false);
  const made = React.useRef(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    cancelRef.current = false;
    made.current = 0;
    setDevices(defaultPasskeyDevices);
    setCancelNext(false);
    setUnsupported(false);
    setNote(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <PasskeyEnrol
      key={round}
      devices={devices}
      onDevicesChange={setDevices}
      supported={!unsupported}
      onEnrol={() =>
        new Promise<PasskeyDevice>((resolve, reject) => {
          const cancel = cancelRef.current;
          cancelRef.current = false;
          if (cancel) setCancelNext(false);
          setNote("prompt open · waiting");
          timers.current.push(
            window.setTimeout(() => {
              if (cancel) {
                setNote("prompt closed · nothing saved");
                reject({ reason: "cancelled" });
                return;
              }
              const pick = NEW_DEVICES[made.current % NEW_DEVICES.length] ??
                NEW_DEVICES[0] ?? { name: "This laptop", kind: "laptop" };
              made.current += 1;
              setNote(`added ${pick.name.toLowerCase()}`);
              resolve({
                id: `new-${made.current}`,
                name: pick.name,
                kind: pick.kind,
                addedAt: defaultPasskeyNow,
                lastUsedAt: defaultPasskeyNow,
              });
            }, PROMPT_MS),
          );
        })
      }
      onRename={(_, name) => setNote(`renamed ${name.toLowerCase()}`)}
      onRemove={(d) => setNote(`removed ${d.name.toLowerCase()}`)}
      onFallback={(kind) =>
        setNote(
          kind === "password" ? "kept the password" : "use another device",
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={cancelNext}
          onClick={() => {
            cancelRef.current = !cancelNext;
            setCancelNext((v) => !v);
          }}
          className={cn(
            button,
            cancelNext && "border-warn/50 text-warn hover:text-warn",
          )}
        >
          Cancel next prompt
        </button>
        <button
          type="button"
          aria-pressed={unsupported}
          onClick={() => setUnsupported((v) => !v)}
          className={cn(
            button,
            unsupported && "border-warn/50 text-warn hover:text-warn",
          )}
        >
          Unsupported browser
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ?? `${devices.length} passkeys`}
        </span>{" "}
        · {devices.length >= 2 ? "password can retire" : "password on"}
      </p>
    </div>
  );
}
