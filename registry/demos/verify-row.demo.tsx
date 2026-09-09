"use client";

import * as React from "react";

import { VerifyRow, type VerifyVerdict } from "@/registry/ui/verify-row";

/** Three claims from Fernworks Model 3's quarter summary, each with the verdict its source will give. */
const CLAIMS: {
  id: string;
  claim: string;
  source: { label: string; domain: string };
  verdict: VerifyVerdict;
}[] = [
  {
    id: "c1",
    claim: "Deposits rose 4.2% over the quarter.",
    source: {
      label: "Basinworks quarterly letter",
      domain: "basinworks.example",
    },
    verdict: "match",
  },
  {
    id: "c2",
    claim: "The Easy saver headline rate moved to 3.9% in May.",
    source: { label: "Savings rates", domain: "coldbrook.example" },
    verdict: "partial",
  },
  {
    id: "c3",
    claim: "Branch costs fell for a third quarter.",
    source: { label: "Branch survey", domain: "fieldline.example" },
    verdict: "mismatch",
  },
];

/** How long a check takes; long enough for the scan to make one full pass. */
const CHECK_MS = 1100;

export function VerifyRowDemo() {
  const [checking, setChecking] = React.useState<string | null>(null);
  const [verdicts, setVerdicts] = React.useState<Record<string, VerifyVerdict>>(
    {},
  );

  // A hidden tab pauses the check; a verdict should not land unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (checking === null || !visible) return;
    const row = CLAIMS.find((entry) => entry.id === checking);
    if (!row) return;
    const timer = window.setTimeout(() => {
      setVerdicts((current) => ({ ...current, [row.id]: row.verdict }));
      setChecking(null);
    }, CHECK_MS);
    return () => window.clearTimeout(timer);
  }, [checking, visible]);

  const verify = (id: string) => {
    setVerdicts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setChecking(id);
  };

  const tally = (verdict: VerifyVerdict) =>
    Object.values(verdicts).filter((entry) => entry === verdict).length;
  const checked = Object.keys(verdicts).length;
  const checkingIndex = CLAIMS.findIndex((entry) => entry.id === checking);

  const status =
    checkingIndex >= 0
      ? `Checking claim ${checkingIndex + 1}`
      : checked === 0
        ? `${CLAIMS.length} claims · none checked`
        : `${tally("match")} match · ${tally("partial")} partial · ${tally("mismatch")} mismatch`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        {CLAIMS.map((entry) => (
          <VerifyRow
            key={entry.id}
            claim={entry.claim}
            source={entry.source}
            verifying={checking === entry.id}
            verdict={verdicts[entry.id] ?? null}
            disabled={checking !== null && checking !== entry.id}
            onVerify={() => verify(entry.id)}
          />
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
