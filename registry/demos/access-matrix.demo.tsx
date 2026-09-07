"use client";

import * as React from "react";

import { AccessMatrix, type AccessGrants } from "@/registry/ui/access-matrix";

const ROLES = [
  { id: "owner", label: "Owner" },
  { id: "editor", label: "Editor" },
  { id: "viewer", label: "Viewer" },
];

const ACTIONS = [
  { id: "read", label: "Read" },
  { id: "comment", label: "Comment" },
  { id: "edit", label: "Edit" },
  { id: "export", label: "Export" },
  { id: "admin", label: "Admin" },
];

const INITIAL: AccessGrants = {
  owner: ["read", "comment", "edit", "export", "admin"],
  editor: ["read", "comment", "edit"],
  viewer: ["read"],
};

const TOTAL = ROLES.length * ACTIONS.length;

export function AccessMatrixDemo() {
  const [grants, setGrants] = React.useState<AccessGrants>(INITIAL);
  const granted = Object.values(grants).reduce(
    (count, held) => count + held.length,
    0,
  );

  return (
    <div className="flex w-full max-w-xl flex-col gap-5">
      <AccessMatrix
        label="Gaugeworks workspace roles"
        roles={ROLES}
        actions={ACTIONS}
        value={grants}
        onValueChange={setGrants}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{granted}</span> of{" "}
        <span className="tabular-nums">{TOTAL}</span> permissions granted
      </p>
    </div>
  );
}
