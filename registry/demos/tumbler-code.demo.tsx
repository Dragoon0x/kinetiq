"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TumblerCode } from "@/registry/ui/tumbler-code";

export const tweaks = defineTweaks({
  length: {
    kind: "range",
    label: "Length",
    default: 6,
    min: 4,
    max: 8,
    step: 1,
  },
  brass: {
    kind: "choice",
    label: "Metal",
    default: "brass",
    options: ["brass", "nickel", "black"],
    names: { brass: "Brass", nickel: "Nickel", black: "Black" },
  },
  verify: { kind: "toggle", label: "Verify", default: true },
});

/** The codes the bank texts, in turn; each is cut to the field's length. */
const CODES = ["40861527", "73190264", "25847913"] as const;

type Stage = "waiting" | "checking" | "open" | "wrong";

const spaced = (code: string) =>
  code.length > 4
    ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}`
    : code;

/**
 * Signing in to Coldbrook Bank: the code arrives by text, and the lock turns
 * when it is typed in right.
 */
export function TumblerCodeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const length = values.length ?? tweaks.length.default;
  const verify = values.verify ?? tweaks.verify.default;
  const [round, setRound] = React.useState(0);
  const [code, setCode] = React.useState("");
  const [stage, setStage] = React.useState<Stage>("waiting");
  const expected = (CODES[round % CODES.length] ?? CODES[0]).slice(0, length);

  const check = React.useCallback(
    (entered: string) =>
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(entered === expected), 420);
      }),
    [expected],
  );

  const shown = code.slice(0, length);
  const status =
    stage === "open"
      ? { lead: "unlocked", rest: "signed in to coldbrook" }
      : stage === "checking"
        ? { lead: "checking the code", rest: "hold on" }
        : stage === "wrong"
          ? { lead: "wrong code", rest: "pins dropped" }
          : shown.length === length
            ? { lead: "code complete", rest: "ready to send" }
            : {
                lead: `pins set ${shown.length} of ${length}`,
                rest: "waiting for the rest",
              };

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <TumblerCode
        label="Sign-in code"
        hint={`Coldbrook Bank texted ${spaced(expected)} to •• 42.`}
        value={code}
        onValueChange={(next) => {
          setCode(next);
          // A refusal empties the field: that keeps saying "wrong" until
          // the next digit.
          setStage((s) => (s === "wrong" && next === "" ? s : "waiting"));
        }}
        onComplete={() => setStage(verify ? "checking" : "waiting")}
        onResult={(ok) => setStage(ok ? "open" : "wrong")}
        check={check}
        name="code"
        className="self-center"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{status.lead}</span> · {status.rest}
          </p>
          <button
            type="button"
            onClick={() => {
              setRound((r) => r + 1);
              setCode("");
              setStage("waiting");
            }}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            New code
          </button>
        </div>
      ) : null}
    </div>
  );
}
