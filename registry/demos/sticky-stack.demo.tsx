import { StickyStack, type StackSection } from "@/registry/ui/sticky-stack";

const LINES = [
  "The rig settled at 4.6 mm after two passes.",
  "Tolerance held inside a tenth the whole run.",
  "Capture ran at 48 kHz, no dropped frames.",
  "Cobalt housing, brass collar, oxide seal.",
  "The press holds nine tonnes at the peak.",
  "Recalibrate on the 14th; drift is a tenth a month.",
];

const SECTIONS: StackSection[] = [
  { id: "intake", title: "01 · Intake" },
  { id: "press", title: "02 · Press" },
  { id: "cure", title: "03 · Cure" },
  { id: "seal", title: "04 · Seal" },
  { id: "ship", title: "05 · Ship" },
].map((section) => ({
  ...section,
  node: (
    <div className="flex flex-col gap-2">
      {LINES.map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  ),
}));

export function StickyStackDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StickyStack sections={SECTIONS} height={300} aria-label="Run log" />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Scroll{" "}
        <span className="text-[var(--signal,var(--primary))]">
          headers stack, then peel
        </span>
      </p>
    </div>
  );
}
