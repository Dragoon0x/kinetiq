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
  "cipher-wheel": () =>
    import("@/registry/demos/cipher-wheel.demo").then((m) =>
      mod(m.CipherWheelDemo, m.tweaks),
    ),
  "word-bracket": () =>
    import("@/registry/demos/word-bracket.demo").then((m) =>
      mod(m.WordBracketDemo, m.tweaks),
    ),
  "buoyant-line": () =>
    import("@/registry/demos/buoyant-line.demo").then((m) =>
      mod(m.BuoyantLineDemo, m.tweaks),
    ),
  "read-along": () =>
    import("@/registry/demos/read-along.demo").then((m) =>
      mod(m.ReadAlongDemo, m.tweaks),
    ),
  "char-cast": () =>
    import("@/registry/demos/char-cast.demo").then((m) =>
      mod(m.CharCastDemo, m.tweaks),
    ),
  "scramble-brush": () =>
    import("@/registry/demos/scramble-brush.demo").then((m) =>
      mod(m.ScrambleBrushDemo, m.tweaks),
    ),
  "stamp-cycle": () =>
    import("@/registry/demos/stamp-cycle.demo").then((m) =>
      mod(m.StampCycleDemo, m.tweaks),
    ),
  "datamosh-type": () =>
    import("@/registry/demos/datamosh-type.demo").then((m) =>
      mod(m.DatamoshTypeDemo, m.tweaks),
    ),
  "speed-banner": () =>
    import("@/registry/demos/speed-banner.demo").then((m) =>
      mod(m.SpeedBannerDemo, m.tweaks),
    ),
  "breath-type": () =>
    import("@/registry/demos/breath-type.demo").then((m) =>
      mod(m.BreathTypeDemo, m.tweaks),
    ),
  "tally-roll": () =>
    import("@/registry/demos/tally-roll.demo").then((m) =>
      mod(m.TallyRollDemo, m.tweaks),
    ),
};
