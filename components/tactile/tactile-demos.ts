import type { ComponentType } from "react";

import type { TactileDemoProps, TweakSchema } from "@/registry/lib/tweaks";

/** What a Tactile demo module gives the gallery: the demo and its tweaks. */
export type TactileModule = {
  Demo: ComponentType<TactileDemoProps<TweakSchema> & { chrome?: boolean }>;
  tweaks: TweakSchema;
};

const mod = (Demo: unknown, tweaks: TweakSchema): TactileModule => ({
  Demo: Demo as TactileModule["Demo"],
  tweaks,
});

/**
 * One dynamic import per component, so /tactile ships none of them up front:
 * a card loads its own demo when it comes near the viewport. This map is the
 * only thing the gallery imports — never components/docs/demos.tsx, which
 * would pull every demo in the catalogue into the page.
 */
export const TACTILE_DEMOS: Record<string, () => Promise<TactileModule>> = {
  "gel-switch": () =>
    import("@/registry/demos/gel-switch.demo").then((m) =>
      mod(m.GelSwitchDemo, m.tweaks),
    ),
  "conjure-button": () =>
    import("@/registry/demos/conjure-button.demo").then((m) =>
      mod(m.ConjureButtonDemo, m.tweaks),
    ),
  "split-confirm": () =>
    import("@/registry/demos/split-confirm.demo").then((m) =>
      mod(m.SplitConfirmDemo, m.tweaks),
    ),
  "clicker-count": () =>
    import("@/registry/demos/clicker-count.demo").then((m) =>
      mod(m.ClickerCountDemo, m.tweaks),
    ),
  "keycap-press": () =>
    import("@/registry/demos/keycap-press.demo").then((m) =>
      mod(m.KeycapPressDemo, m.tweaks),
    ),
  "copy-slip": () =>
    import("@/registry/demos/copy-slip.demo").then((m) =>
      mod(m.CopySlipDemo, m.tweaks),
    ),
  "underline-peek": () =>
    import("@/registry/demos/underline-peek.demo").then((m) =>
      mod(m.UnderlinePeekDemo, m.tweaks),
    ),
  "edge-peek": () =>
    import("@/registry/demos/edge-peek.demo").then((m) =>
      mod(m.EdgePeekDemo, m.tweaks),
    ),
  "cross-grid": () =>
    import("@/registry/demos/cross-grid.demo").then((m) =>
      mod(m.CrossGridDemo, m.tweaks),
    ),
  "overflow-glide": () =>
    import("@/registry/demos/overflow-glide.demo").then((m) =>
      mod(m.OverflowGlideDemo, m.tweaks),
    ),
  "try-on": () =>
    import("@/registry/demos/try-on.demo").then((m) =>
      mod(m.TryOnDemo, m.tweaks),
    ),
  eyedropper: () =>
    import("@/registry/demos/eyedropper.demo").then((m) =>
      mod(m.EyedropperDemo, m.tweaks),
    ),
};
