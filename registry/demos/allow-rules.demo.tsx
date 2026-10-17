"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AllowRules,
  defaultAllowRequest,
  defaultAllowRules,
  type AllowRule,
} from "@/registry/ui/allow-rules";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "pill",
    options: ["pill", "tag", "code"],
    names: { pill: "Pill", tag: "Tag", code: "Code" },
  },
  listDensity: {
    kind: "choice",
    label: "Rows",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const fileOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The Basinworks file agent is merging gauge readings into the Q3 basin
 * report and asks to write the result; two more requests wait behind it.
 * Its standing rules sit beside the prompt with their fire counts.
 */
export function AllowRulesDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rules, setRules] = React.useState<AllowRule[]>(defaultAllowRules);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);

  const surface = (
    <AllowRules
      key={round}
      rules={rules}
      onRulesChange={setRules}
      onAllowOnce={(r) => setNote(`allowed once · ${r.verb} ${fileOf(r.path)}`)}
      onDeny={(r) => setNote(`denied · ${r.verb} ${fileOf(r.path)}`)}
      onCreateRule={(rule) =>
        setNote(
          `rule created · ${rule.pattern.verbs.join(" or ")} ${rule.pattern.path || "any file"} · fired 1×`,
        )
      }
      onRevokeRule={(rule) =>
        setNote(
          `revoked · ${rule.pattern.verbs.join(" or ")} ${rule.pattern.path || "any file"}`,
        )
      }
      onEditRule={(rule) =>
        setNote(
          `editing · ${rule.pattern.verbs.join(" or ")} ${rule.pattern.path || "any file"}`,
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRules(defaultAllowRules);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            `request · ${defaultAllowRequest.verb} ${fileOf(defaultAllowRequest.path)}`}
        </span>
        {` · ${rules.length} ${rules.length === 1 ? "rule" : "rules"}`}
      </p>
    </div>
  );
}
