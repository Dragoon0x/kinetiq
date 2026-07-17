"use client";

import * as React from "react";

import { PaginationRail } from "@/registry/ui/pagination-rail";

export function PaginationRailDemo() {
  const [page, setPage] = React.useState(3);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <PaginationRail
        total={12}
        page={page}
        onPageChange={setPage}
        preview={(p) => `Jump to ${p}`}
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Page{" "}
        <span className="text-[var(--signal,var(--primary))]">{page}</span> of
        12
      </p>
    </div>
  );
}
