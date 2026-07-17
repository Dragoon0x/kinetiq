import { StickyReveal, type Scene } from "@/registry/ui/sticky-reveal";

const SCENES: Scene[] = [
  {
    id: "intake",
    node: (
      <div>
        <p className="text-label text-ink-3">01 · INTAKE</p>
        <p className="mt-2 text-2xl font-semibold">The blank enters at 4.6 mm.</p>
      </div>
    ),
  },
  {
    id: "press",
    node: (
      <div>
        <p className="text-label text-ink-3">02 · PRESS</p>
        <p className="mt-2 text-2xl font-semibold">Nine tonnes, held for a beat.</p>
      </div>
    ),
  },
  {
    id: "seal",
    node: (
      <div>
        <p className="text-label text-ink-3">03 · SEAL</p>
        <p className="mt-2 text-2xl font-semibold">Two stages, inside a tenth.</p>
      </div>
    ),
  },
];

export function StickyRevealDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StickyReveal scenes={SCENES} height={260} aria-label="Cell run" />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Scroll{" "}
        <span className="text-[var(--signal,var(--primary))]">
          the stage stays, scenes swap
        </span>
      </p>
    </div>
  );
}
