"use client";

import { DatatableInlineEdit } from "@/registry/blocks/datatable-inline-edit/datatable-inline-edit";

/** The section at its own scale — full width, default narrative. */
export function DatatableInlineEditDemo() {
  return (
    <div className="w-full">
      <DatatableInlineEdit />
    </div>
  );
}
