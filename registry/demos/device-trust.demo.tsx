"use client";

import * as React from "react";

import { DeviceTrust } from "@/registry/ui/device-trust";

const DEVICE = {
  name: "Fieldline Air 13",
  platform: "Fieldline OS 4",
  location: "Basin City",
  lastSeen: "just now",
  kind: "laptop" as const,
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

export function DeviceTrustDemo() {
  const [trusted, setTrusted] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [revoked, setRevoked] = React.useState(false);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  // The card never invents time — approval resolves here, in an effect with
  // cleanup, and holds while the tab is hidden rather than landing unseen.
  React.useEffect(() => {
    if (!visible || !pending) return;
    const timer = window.setTimeout(() => {
      setPending(false);
      setTrusted(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [visible, pending]);

  const line = pending
    ? "approving"
    : trusted
      ? "trusted · 30 days"
      : revoked
        ? "revoked · asks every time"
        : "untrusted · asks every time";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DeviceTrust
        label="Coldbrook Bank · this device"
        device={DEVICE}
        trusted={trusted}
        pending={pending}
        onTrust={() => setPending(true)}
        onTrustedChange={(next) => {
          setTrusted(next);
          if (!next) setRevoked(true);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{line}</span>
      </p>
    </div>
  );
}
