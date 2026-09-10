"use client";

import * as React from "react";

import { RoleBadge, type RoleChange } from "@/registry/ui/role-badge";

const LADDER = ["guest", "member", "moderator", "admin"];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function RoleBadgeDemo() {
  const [role, setRole] = React.useState("member");
  const [open, setOpen] = React.useState(false);
  const [last, setLast] = React.useState<RoleChange | null>(null);

  const step = (delta: number) => {
    const at = LADDER.indexOf(role);
    const next = LADDER[Math.min(LADDER.length - 1, Math.max(0, at + delta))];
    if (next) setRole(next);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RoleBadge
        name="Marta Vieira"
        handle="marta"
        value={role}
        onValueChange={setRole}
        onRoleChange={setLast}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => step(1)}
          disabled={role === "admin"}
          className={chip}
        >
          Promote
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={role === "guest"}
          className={chip}
        >
          Demote
        </button>
        <button
          type="button"
          onClick={() => {
            setRole("member");
            setLast(null);
          }}
          disabled={role === "member" && last === null}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Marta · {last?.label ?? "Member"} ·{" "}
        <span className="text-signal">{last?.direction ?? "unchanged"}</span>
        {open ? " · list open" : ""}
      </p>
    </div>
  );
}
