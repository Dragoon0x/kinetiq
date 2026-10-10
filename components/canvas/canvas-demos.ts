import { mod, type TactileModule } from "@/components/tactile/demo-module";

/**
 * One dynamic import per piece, so /canvas ships none of them up front: a
 * card loads its own demo when it comes near the viewport. This map is the
 * only thing the Canvas gallery imports — never components/docs/demos.tsx,
 * which would pull every demo in the catalogue into the page.
 */
export const CANVAS_DEMOS: Record<string, () => Promise<TactileModule>> = {
  "tune-in": () =>
    import("@/registry/demos/tune-in.demo").then((m) =>
      mod(m.TuneInDemo, m.tweaks),
    ),
  "drum-words": () =>
    import("@/registry/demos/drum-words.demo").then((m) =>
      mod(m.DrumWordsDemo, m.tweaks),
    ),
  "tide-mask": () =>
    import("@/registry/demos/tide-mask.demo").then((m) =>
      mod(m.TideMaskDemo, m.tweaks),
    ),
  "grain-gather": () =>
    import("@/registry/demos/grain-gather.demo").then((m) =>
      mod(m.GrainGatherDemo, m.tweaks),
    ),
  "depot-board": () =>
    import("@/registry/demos/depot-board.demo").then((m) =>
      mod(m.DepotBoardDemo, m.tweaks),
    ),
  "lens-warp": () =>
    import("@/registry/demos/lens-warp.demo").then((m) =>
      mod(m.LensWarpDemo, m.tweaks),
    ),
  "pen-outline": () =>
    import("@/registry/demos/pen-outline.demo").then((m) =>
      mod(m.PenOutlineDemo, m.tweaks),
    ),
  "stack-extrude": () =>
    import("@/registry/demos/stack-extrude.demo").then((m) =>
      mod(m.StackExtrudeDemo, m.tweaks),
    ),
  "paper-crease": () =>
    import("@/registry/demos/paper-crease.demo").then((m) =>
      mod(m.PaperCreaseDemo, m.tweaks),
    ),
  "after-image": () =>
    import("@/registry/demos/after-image.demo").then((m) =>
      mod(m.AfterImageDemo, m.tweaks),
    ),
  "cascade-split": () =>
    import("@/registry/demos/cascade-split.demo").then((m) =>
      mod(m.CascadeSplitDemo, m.tweaks),
    ),
};
