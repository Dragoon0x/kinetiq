"use client";

import * as React from "react";

import {
  WalletConnect,
  type WalletConnectStatus,
} from "@/registry/ui/wallet-connect";

const ADDRESS = "bsn1q9f4k2mx7v3ptl8ha6ze0rj5cwyd";

const BUTTON =
  "flex h-8 flex-1 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function WalletConnectDemo() {
  const [status, setStatus] = React.useState<WalletConnectStatus>("idle");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <WalletConnect
        appName="Basinworks"
        walletName="Waylight"
        address={ADDRESS}
        status={status}
        onStatusChange={setStatus}
      />

      {/* The device answers out of band, so the demo answers for it — no timer
          invents an outcome the reader did not choose. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={status !== "pending"}
          onClick={() => setStatus("connected")}
        >
          Approve on device
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={status !== "pending"}
          onClick={() => setStatus("rejected")}
        >
          Reject
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Handshake <span className="text-signal">{status}</span>
        {status === "connected" ? (
          <>
            {" "}
            · <span className="text-signal">bsn1q9f4…cwyd</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
