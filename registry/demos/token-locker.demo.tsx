"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { TokenLocker, type LockerToken } from "@/registry/ui/token-locker";

export const tweaks = defineTweaks({
  maskStyle: {
    kind: "choice",
    label: "Mask",
    default: "blur",
    options: ["blur", "dots", "bars"],
    names: { blur: "Blur", dots: "Dots", bars: "Bars" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

const count = (tokens: LockerToken[]) => {
  const revoked = tokens.filter((t) => t.revoked).length;
  return `${tokens.length - revoked} active · ${revoked} revoked`;
};

/**
 * Gaugeworks developer settings: the workspace's API tokens. Create one to see
 * it shown once; "Empty list" shows what a workspace with no tokens says.
 */
export function TokenLockerDemo({
  chrome = true,
  // Secrets are handled quietly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [empty, setEmpty] = React.useState(false);
  const [line, setLine] = React.useState<{ lead: string; rest: string }>({
    lead: "gaugeworks",
    rest: "4 active · 1 revoked",
  });

  const locker = (
    <TokenLocker
      key={empty ? "empty" : "seeded"}
      {...(empty ? { tokens: [] } : {})}
      onCreate={(draft) => {
        setLine({
          lead: draft.name.toLowerCase(),
          rest: `shown once · ${draft.scopes.length} ${draft.scopes.length === 1 ? "scope" : "scopes"}`,
        });
      }}
      onRotate={(token) => {
        setLine({
          lead: token.name.toLowerCase(),
          rest: "rotated · shown once",
        });
      }}
      onRevoke={(token) => {
        setLine({ lead: "revoked", rest: token.name.toLowerCase() });
      }}
      onTokensChange={(tokens) =>
        setLine((prev) =>
          prev.lead === "revoked"
            ? { ...prev, rest: `${prev.rest} · ${count(tokens)}` }
            : prev,
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{locker}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {locker}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={empty}
          onClick={() => {
            setEmpty((v) => !v);
            setLine({
              lead: "gaugeworks",
              rest: empty ? "4 active · 1 revoked" : "no tokens yet",
            });
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            empty && "border-hairline-strong text-foreground",
          )}
        >
          Empty list
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line.lead}</span> · {line.rest}
      </p>
    </div>
  );
}
