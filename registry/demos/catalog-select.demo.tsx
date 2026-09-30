"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CatalogSelect,
  type CatalogOption,
} from "@/registry/ui/catalog-select";

export const tweaks = defineTweaks({
  cards: {
    kind: "range",
    label: "Cards",
    default: 7,
    min: 4,
    max: 12,
    step: 1,
  },
  drawer: {
    kind: "choice",
    label: "Drawer",
    default: "oak",
    options: ["oak", "steel", "card"],
    names: { oak: "Oak", steel: "Steel", card: "Board" },
  },
  flip: {
    kind: "range",
    label: "Flip",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const SUBJECTS: CatalogOption[] = [
  { value: "acoustics", label: "Acoustics", detail: "Shelf A-3 · 214 titles" },
  { value: "botany", label: "Botany", detail: "Shelf B-1 · 562 titles" },
  {
    value: "cartography",
    label: "Cartography",
    detail: "Shelf C-2 · 318 titles",
  },
  { value: "ceramics", label: "Ceramics", detail: "Shelf C-5 · 97 titles" },
  { value: "geology", label: "Geology", detail: "Shelf G-4 · 441 titles" },
  { value: "hydrology", label: "Hydrology", detail: "Shelf H-2 · 186 titles" },
  {
    value: "metallurgy",
    label: "Metallurgy",
    detail: "Away for rebinding",
    disabled: true,
  },
  { value: "optics", label: "Optics", detail: "Shelf O-1 · 203 titles" },
  { value: "textiles", label: "Textiles", detail: "Shelf T-6 · 158 titles" },
  { value: "zoology", label: "Zoology", detail: "Shelf Z-1 · 377 titles" },
];

/**
 * A reading-room pass at the Fernworks Library: the subject is chosen from
 * the catalog drawer, which starts pulled out so the file is in view.
 */
export function CatalogSelectDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [subject, setSubject] = React.useState<string | null>("cartography");
  const [open, setOpen] = React.useState(true);
  const chosen = SUBJECTS.find((s) => s.value === subject);
  const shelf = chosen?.detail?.split(" · ")[0] ?? "";

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <CatalogSelect
        label="Subject"
        hint="Shelf marks print on your pass."
        options={SUBJECTS}
        value={subject}
        onValueChange={setSubject}
        open={open}
        onOpenChange={setOpen}
        name="subject"
        className="max-w-xs self-center"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">drawer open</span> · arrows flip,
              enter chooses
            </>
          ) : (
            <>
              <span className="text-signal">
                subject · {chosen?.label ?? "none"}
              </span>
              {shelf ? ` · ${shelf}` : ""}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
