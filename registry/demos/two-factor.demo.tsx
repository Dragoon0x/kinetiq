"use client";

import * as React from "react";

import {
  TwoFactor,
  type TwoFactorMethod,
  type TwoFactorStatus,
} from "@/registry/ui/two-factor";

/** The seeded authenticator code the demo accepts. */
const CODE = "482913";
const CHECK_MS = 700;

type Pending = { route: TwoFactorMethod; code: string };

export function TwoFactorDemo() {
  const [method, setMethod] = React.useState<TwoFactorMethod>("code");
  const [status, setStatus] = React.useState<TwoFactorStatus>("waiting");
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [via, setVia] = React.useState<TwoFactorMethod | null>(null);

  // The round trip a real host would make; resolved from a timer with cleanup.
  React.useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      const ok = pending.route === "device" || pending.code === CODE;
      setStatus(ok ? "verified" : "failed");
      setVia(ok ? pending.route : null);
      if (!ok) setCode("");
      setPending(null);
    }, CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const reset = () => {
    setPending(null);
    setStatus("waiting");
    setCode("");
    setVia(null);
  };

  const line =
    status === "verified"
      ? `Verified · via ${via ?? method}`
      : status === "checking"
        ? `${method} · checking`
        : status === "failed"
          ? "Code · did not match"
          : method === "device"
            ? "Device · waiting for phone"
            : "Code · waiting";

  const buttonClass =
    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TwoFactor
        label="Coldbrook Bank sign-in"
        deviceName="Coldbrook phone"
        method={method}
        onMethodChange={setMethod}
        value={code}
        onValueChange={setCode}
        status={status}
        onStatusChange={setStatus}
        onSubmit={(digits) => setPending({ route: "code", code: digits })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={method !== "device" || status !== "waiting"}
          onClick={() => {
            setStatus("checking");
            setPending({ route: "device", code: "" });
          }}
          className={buttonClass}
        >
          Approve on phone
        </button>
        <button
          type="button"
          disabled={status === "waiting" && code === ""}
          onClick={reset}
          className={buttonClass}
        >
          Reset
        </button>
        <span className="ml-auto text-xs text-ink-3">
          Authenticator shows{" "}
          <span className="font-mono text-foreground tabular-nums">
            482 913
          </span>
        </span>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
