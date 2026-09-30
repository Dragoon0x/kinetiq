"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { VAULT_RULES, VaultPassword } from "@/registry/ui/vault-password";

export const tweaks = defineTweaks({
  rules: {
    kind: "range",
    label: "Rules",
    default: 4,
    min: 3,
    max: 6,
    step: 1,
  },
  door: {
    kind: "choice",
    label: "Door",
    default: "steel",
    options: ["steel", "brass", "matte"],
    names: { steel: "Steel", brass: "Brass", matte: "Matte" },
  },
  spin: { kind: "toggle", label: "Spin", default: true },
});

/**
 * Opening a Waylight Pay account: the password that guards the vault has to
 * shoot every bolt before the door will lock.
 */
export function VaultPasswordDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [password, setPassword] = React.useState("");
  const count = Math.min(
    VAULT_RULES.length,
    values.rules ?? tweaks.rules.default,
  );
  const home = VAULT_RULES.slice(0, count).filter((r) =>
    r.test(password),
  ).length;
  const locked = home === count;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <VaultPassword
        label="New password"
        hint="A phrase you'll remember works well."
        value={password}
        onValueChange={setPassword}
        name="password"
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
            {locked ? (
              <>
                <span className="text-signal">all {count} bolts home</span> ·
                vault locked
              </>
            ) : (
              <>
                <span className="text-signal">
                  {home} of {count} bolts home
                </span>{" "}
                · door open
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setPassword("")}
            disabled={password === ""}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
