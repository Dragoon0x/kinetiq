"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { AuthenticatorPair } from "@/registry/ui/authenticator-pair";

export const tweaks = defineTweaks({
  moduleStyle: {
    kind: "choice",
    label: "Modules",
    default: "square",
    options: ["square", "dot", "soft"],
    names: { square: "Square", dot: "Dot", soft: "Soft" },
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

/** The code the demo's pretend authenticator app is showing. */
const RIGHT = "418207";
/** A slip of the thumb: the last two digits swapped. */
const WRONG = "418270";

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Fieldline's security settings, turning on two-step sign-in for
 * mara@fieldline.io. Once the QR has assembled, the demo types a code with
 * two digits swapped, lets it be refused, then types the right one — once,
 * and only if the visitor hasn't touched the field.
 */
export function AuthenticatorPairDemo({
  chrome = true,
  // The setup is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [code, setCode] = React.useState("");
  const [note, setNote] = React.useState<string | null>(null);
  const [on, setOn] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const touched = React.useRef(false);

  // The scripted thumb: a wrong code, a pause, then the right one.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    const typeOut = async (text: string) => {
      for (let i = 1; i <= text.length; i += 1) {
        if (cancelled || touched.current) return false;
        setCode(text.slice(0, i));
        await wait(110);
      }
      return !cancelled && !touched.current;
    };
    const script = async () => {
      await wait(1500);
      if (!(await typeOut(WRONG))) return;
      await wait(1900);
      if (cancelled || touched.current) return;
      setCode("");
      await wait(400);
      await typeOut(RIGHT);
    };
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      void script();
    });
    io.observe(root);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [round]);

  const reset = () => {
    touched.current = false;
    setCode("");
    setNote(null);
    setOn(false);
    setRound((r) => r + 1);
  };

  const surface = (
    <div
      ref={rootRef}
      className="w-full"
      onPointerDownCapture={() => {
        touched.current = true;
      }}
      onKeyDownCapture={() => {
        touched.current = true;
      }}
    >
      <AuthenticatorPair
        key={round}
        value={code}
        onValueChange={(next) => {
          setCode(next);
          setNote(null);
        }}
        onVerify={async (attempt) => {
          setNote(`checking ${attempt.slice(0, 3)} ${attempt.slice(3)}`);
          await wait(500);
          const ok = attempt === RIGHT;
          setNote(ok ? "two-step on" : "code refused · digits kept");
          if (ok) setOn(true);
          return ok;
        }}
        onCopySecret={() => setNote("setup key copied")}
        onCancel={() => setNote("setup cancelled")}
        onDone={() => setNote("done · back to settings")}
        {...values}
      />
    </div>
  );

  if (!chrome) return surface;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <span className="text-[11px] text-ink-3">
          The demo app shows 418 207
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> ·{" "}
            {on ? "two-step on" : "mara@fieldline.io"}
          </>
        ) : (
          <>
            <span className="text-signal">scan</span> · key k7qm 2xra 4wdn 6htc
          </>
        )}
      </p>
    </div>
  );
}
