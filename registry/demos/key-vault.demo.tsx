"use client";

import * as React from "react";

import { KeyVault, type VaultKey } from "@/registry/ui/key-vault";

const KEYS: VaultKey[] = [
  {
    id: "payout",
    label: "Payout signing key",
    kind: "ed25",
    value: "cbk_sk_4f81c0a97d2e6b3948af",
  },
  {
    id: "settle",
    label: "Settlement token",
    kind: "bearer",
    value: "cbk_tok_9b27ea5d4c108f6371",
  },
  {
    id: "hook",
    label: "Webhook secret",
    kind: "hmac",
    value: "whsec_2a6f80d31c94be57",
  },
  {
    id: "recovery",
    label: "Recovery pointer",
    kind: "shard",
    value: "cbk_rc_7e0348a2f5db916c",
  },
];

export function KeyVaultDemo() {
  const [unlocked, setUnlocked] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);

  const nameOf = (id: string) => KEYS.find((key) => key.id === id)?.label ?? id;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <KeyVault
        label="Coldbrook Bank · Keys"
        keys={KEYS}
        unlocked={unlocked}
        onUnlockedChange={(next) => {
          setUnlocked(next);
          if (!next) setLast(null);
        }}
        autoLockMs={9000}
        onAutoLock={() => setLast("auto-locked")}
        onReveal={(id, shown) =>
          setLast(`${nameOf(id)} ${shown ? "revealed" : "hidden"}`)
        }
        onCopy={(id, ok) =>
          setLast(`${nameOf(id)} ${ok ? "copied" : "copy blocked"}`)
        }
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Vault{" "}
        <span className="text-signal">{unlocked ? "unlocked" : "locked"}</span>
        {last === null ? null : ` · Last ${last}`}
      </p>
    </div>
  );
}
