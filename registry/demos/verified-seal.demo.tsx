"use client";

import * as React from "react";

import { VerifiedSeal, type VerifiedCheck } from "@/registry/ui/verified-seal";

const CHECKS: VerifiedCheck[] = [
  { id: "identity", label: "Identity", at: "12 Mar 2026" },
  { id: "address", label: "Address", at: "12 Mar 2026" },
  { id: "payout", label: "Payout account", at: "3 Apr 2026" },
];
const CHECK_MS = 900;

export function VerifiedSealDemo() {
  const [verified, setVerified] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // The round trip a real host would make; resolved from a timer with cleanup.
  React.useEffect(() => {
    if (!checking) return;
    const timer = window.setTimeout(() => {
      setVerified(true);
      setChecking(false);
    }, CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [checking]);

  const line = checking
    ? "Checking"
    : verified
      ? open
        ? "Verified · details open"
        : `Verified · ${CHECKS.length} checks`
      : "Unverified";

  const buttonClass =
    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <VerifiedSeal
        name="Marta Ferreira"
        handle="@fernline · Fernworks seller"
        verified={verified}
        verifiedAt="3 Apr 2026"
        checks={CHECKS}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={verified || checking}
          onClick={() => setChecking(true)}
          className={buttonClass}
        >
          Run checks
        </button>
        <button
          type="button"
          disabled={!verified}
          onClick={() => {
            setVerified(false);
            setOpen(false);
          }}
          className={buttonClass}
        >
          Revoke
        </button>
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
