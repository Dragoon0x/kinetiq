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
  "depth-of-field": () =>
    import("@/registry/demos/depth-of-field.demo").then((m) =>
      mod(m.DepthOfFieldDemo, m.tweaks),
    ),
  "orbit-script": () =>
    import("@/registry/demos/orbit-script.demo").then((m) =>
      mod(m.OrbitScriptDemo, m.tweaks),
    ),
  "caption-live": () =>
    import("@/registry/demos/caption-live.demo").then((m) =>
      mod(m.CaptionLiveDemo, m.tweaks),
    ),
  "deck-shuffle": () =>
    import("@/registry/demos/deck-shuffle.demo").then((m) =>
      mod(m.DeckShuffleDemo, m.tweaks),
    ),
  "foil-sheen": () =>
    import("@/registry/demos/foil-sheen.demo").then((m) =>
      mod(m.FoilSheenDemo, m.tweaks),
    ),
  "weight-field": () =>
    import("@/registry/demos/weight-field.demo").then((m) =>
      mod(m.WeightFieldDemo, m.tweaks),
    ),
  "contour-marquee": () =>
    import("@/registry/demos/contour-marquee.demo").then((m) =>
      mod(m.ContourMarqueeDemo, m.tweaks),
    ),
  "static-fuzz": () =>
    import("@/registry/demos/static-fuzz.demo").then((m) =>
      mod(m.StaticFuzzDemo, m.tweaks),
    ),
  "pigment-flow": () =>
    import("@/registry/demos/pigment-flow.demo").then((m) =>
      mod(m.PigmentFlowDemo, m.tweaks),
    ),
  "letter-rain": () =>
    import("@/registry/demos/letter-rain.demo").then((m) =>
      mod(m.LetterRainDemo, m.tweaks),
    ),
  "type-trail": () =>
    import("@/registry/demos/type-trail.demo").then((m) =>
      mod(m.TypeTrailDemo, m.tweaks),
    ),
  "glass-orb": () =>
    import("@/registry/demos/glass-orb.demo").then((m) =>
      mod(m.GlassOrbDemo, m.tweaks),
    ),
  "live-wire-mark": () =>
    import("@/registry/demos/live-wire-mark.demo").then((m) =>
      mod(m.LiveWireMarkDemo, m.tweaks),
    ),
  "dither-curtain": () =>
    import("@/registry/demos/dither-curtain.demo").then((m) =>
      mod(m.DitherCurtainDemo, m.tweaks),
    ),
  "lantern-cursor": () =>
    import("@/registry/demos/lantern-cursor.demo").then((m) =>
      mod(m.LanternCursorDemo, m.tweaks),
    ),
  "scroll-unfold": () =>
    import("@/registry/demos/scroll-unfold.demo").then((m) =>
      mod(m.ScrollUnfoldDemo, m.tweaks),
    ),
  "drop-ripple": () =>
    import("@/registry/demos/drop-ripple.demo").then((m) =>
      mod(m.DropRippleDemo, m.tweaks),
    ),
  "cloth-grid": () =>
    import("@/registry/demos/cloth-grid.demo").then((m) =>
      mod(m.ClothGridDemo, m.tweaks),
    ),
  murmuration: () =>
    import("@/registry/demos/murmuration.demo").then((m) =>
      mod(m.MurmurationDemo, m.tweaks),
    ),
  "halftone-wake": () =>
    import("@/registry/demos/halftone-wake.demo").then((m) =>
      mod(m.HalftoneWakeDemo, m.tweaks),
    ),
  "mosaic-flip": () =>
    import("@/registry/demos/mosaic-flip.demo").then((m) =>
      mod(m.MosaicFlipDemo, m.tweaks),
    ),
  "dot-lens": () =>
    import("@/registry/demos/dot-lens.demo").then((m) =>
      mod(m.DotLensDemo, m.tweaks),
    ),
  "enter-stage": () =>
    import("@/registry/demos/enter-stage.demo").then((m) =>
      mod(m.EnterStageDemo, m.tweaks),
    ),
  "haze-fade": () =>
    import("@/registry/demos/haze-fade.demo").then((m) =>
      mod(m.HazeFadeDemo, m.tweaks),
    ),
  "arc-border": () =>
    import("@/registry/demos/arc-border.demo").then((m) =>
      mod(m.ArcBorderDemo, m.tweaks),
    ),
  "moon-ring": () =>
    import("@/registry/demos/moon-ring.demo").then((m) =>
      mod(m.MoonRingDemo, m.tweaks),
    ),
  "block-dissolve": () =>
    import("@/registry/demos/block-dissolve.demo").then((m) =>
      mod(m.BlockDissolveDemo, m.tweaks),
    ),
  "sheen-glass": () =>
    import("@/registry/demos/sheen-glass.demo").then((m) =>
      mod(m.SheenGlassDemo, m.tweaks),
    ),
  "float-field": () =>
    import("@/registry/demos/float-field.demo").then((m) =>
      mod(m.FloatFieldDemo, m.tweaks),
    ),
  "logo-parade": () =>
    import("@/registry/demos/logo-parade.demo").then((m) =>
      mod(m.LogoParadeDemo, m.tweaks),
    ),
  "lock-on": () =>
    import("@/registry/demos/lock-on.demo").then((m) =>
      mod(m.LockOnDemo, m.tweaks),
    ),
  "halo-rings": () =>
    import("@/registry/demos/halo-rings.demo").then((m) =>
      mod(m.HaloRingsDemo, m.tweaks),
    ),
  "laser-sheet": () =>
    import("@/registry/demos/laser-sheet.demo").then((m) =>
      mod(m.LaserSheetDemo, m.tweaks),
    ),
  "forge-flow": () =>
    import("@/registry/demos/forge-flow.demo").then((m) =>
      mod(m.ForgeFlowDemo, m.tweaks),
    ),
  "dune-gradient": () =>
    import("@/registry/demos/dune-gradient.demo").then((m) =>
      mod(m.DuneGradientDemo, m.tweaks),
    ),
  "dew-web": () =>
    import("@/registry/demos/dew-web.demo").then((m) =>
      mod(m.DewWebDemo, m.tweaks),
    ),
  "survey-contours": () =>
    import("@/registry/demos/survey-contours.demo").then((m) =>
      mod(m.SurveyContoursDemo, m.tweaks),
    ),
  "light-corridor": () =>
    import("@/registry/demos/light-corridor.demo").then((m) =>
      mod(m.LightCorridorDemo, m.tweaks),
    ),
  "sliced-horizon": () =>
    import("@/registry/demos/sliced-horizon.demo").then((m) =>
      mod(m.SlicedHorizonDemo, m.tweaks),
    ),
  "pulse-tiles": () =>
    import("@/registry/demos/pulse-tiles.demo").then((m) =>
      mod(m.PulseTilesDemo, m.tweaks),
    ),
  "scan-bed": () =>
    import("@/registry/demos/scan-bed.demo").then((m) =>
      mod(m.ScanBedDemo, m.tweaks),
    ),
  "iron-sand": () =>
    import("@/registry/demos/iron-sand.demo").then((m) =>
      mod(m.IronSandDemo, m.tweaks),
    ),
  "glow-rain": () =>
    import("@/registry/demos/glow-rain.demo").then((m) =>
      mod(m.GlowRainDemo, m.tweaks),
    ),
  "aether-swirl": () =>
    import("@/registry/demos/aether-swirl.demo").then((m) =>
      mod(m.AetherSwirlDemo, m.tweaks),
    ),
  "prism-spill": () =>
    import("@/registry/demos/prism-spill.demo").then((m) =>
      mod(m.PrismSpillDemo, m.tweaks),
    ),
  "peel-label": () =>
    import("@/registry/demos/peel-label.demo").then((m) =>
      mod(m.PeelLabelDemo, m.tweaks),
    ),
  "mosaic-trail": () =>
    import("@/registry/demos/mosaic-trail.demo").then((m) =>
      mod(m.MosaicTrailDemo, m.tweaks),
    ),
  "cube-field": () =>
    import("@/registry/demos/cube-field.demo").then((m) =>
      mod(m.CubeFieldDemo, m.tweaks),
    ),
  "molten-mark": () =>
    import("@/registry/demos/molten-mark.demo").then((m) =>
      mod(m.MoltenMarkDemo, m.tweaks),
    ),
  "film-grain": () =>
    import("@/registry/demos/film-grain.demo").then((m) =>
      mod(m.FilmGrainDemo, m.tweaks),
    ),
  "chevron-tide": () =>
    import("@/registry/demos/chevron-tide.demo").then((m) =>
      mod(m.ChevronTideDemo, m.tweaks),
    ),
  "louver-light": () =>
    import("@/registry/demos/louver-light.demo").then((m) =>
      mod(m.LouverLightDemo, m.tweaks),
    ),
  "shape-swell": () =>
    import("@/registry/demos/shape-swell.demo").then((m) =>
      mod(m.ShapeSwellDemo, m.tweaks),
    ),
  "glass-drift": () =>
    import("@/registry/demos/glass-drift.demo").then((m) =>
      mod(m.GlassDriftDemo, m.tweaks),
    ),
  "fiber-mist": () =>
    import("@/registry/demos/fiber-mist.demo").then((m) =>
      mod(m.FiberMistDemo, m.tweaks),
    ),
  "tube-glow": () =>
    import("@/registry/demos/tube-glow.demo").then((m) =>
      mod(m.TubeGlowDemo, m.tweaks),
    ),
  "night-veil": () =>
    import("@/registry/demos/night-veil.demo").then((m) =>
      mod(m.NightVeilDemo, m.tweaks),
    ),
  "beacon-pillar": () =>
    import("@/registry/demos/beacon-pillar.demo").then((m) =>
      mod(m.BeaconPillarDemo, m.tweaks),
    ),
  "drape-silk": () =>
    import("@/registry/demos/drape-silk.demo").then((m) =>
      mod(m.DrapeSilkDemo, m.tweaks),
    ),
  "drift-lines": () =>
    import("@/registry/demos/drift-lines.demo").then((m) =>
      mod(m.DriftLinesDemo, m.tweaks),
    ),
  "window-shafts": () =>
    import("@/registry/demos/window-shafts.demo").then((m) =>
      mod(m.WindowShaftsDemo, m.tweaks),
    ),
  "crown-rays": () =>
    import("@/registry/demos/crown-rays.demo").then((m) =>
      mod(m.CrownRaysDemo, m.tweaks),
    ),
  "pixel-bloom": () =>
    import("@/registry/demos/pixel-bloom.demo").then((m) =>
      mod(m.PixelBloomDemo, m.tweaks),
    ),
  "color-fold": () =>
    import("@/registry/demos/color-fold.demo").then((m) =>
      mod(m.ColorFoldDemo, m.tweaks),
    ),
  "iris-watch": () =>
    import("@/registry/demos/iris-watch.demo").then((m) =>
      mod(m.IrisWatchDemo, m.tweaks),
    ),
  "harp-strings": () =>
    import("@/registry/demos/harp-strings.demo").then((m) =>
      mod(m.HarpStringsDemo, m.tweaks),
    ),
  "sweep-scope": () =>
    import("@/registry/demos/sweep-scope.demo").then((m) =>
      mod(m.SweepScopeDemo, m.tweaks),
    ),
  "polar-glow": () =>
    import("@/registry/demos/polar-glow.demo").then((m) =>
      mod(m.PolarGlowDemo, m.tweaks),
    ),
  "compass-field": () =>
    import("@/registry/demos/compass-field.demo").then((m) =>
      mod(m.CompassFieldDemo, m.tweaks),
    ),
  "phantom-cursor": () =>
    import("@/registry/demos/phantom-cursor.demo").then((m) =>
      mod(m.PhantomCursorDemo, m.tweaks),
    ),
  "edge-haze": () =>
    import("@/registry/demos/edge-haze.demo").then((m) =>
      mod(m.EdgeHazeDemo, m.tweaks),
    ),
  "click-bloom": () =>
    import("@/registry/demos/click-bloom.demo").then((m) =>
      mod(m.ClickBloomDemo, m.tweaks),
    ),
  lodestone: () =>
    import("@/registry/demos/lodestone.demo").then((m) =>
      mod(m.LodestoneDemo, m.tweaks),
    ),
  "kelp-strands": () =>
    import("@/registry/demos/kelp-strands.demo").then((m) =>
      mod(m.KelpStrandsDemo, m.tweaks),
    ),
  "soft-shape": () =>
    import("@/registry/demos/soft-shape.demo").then((m) =>
      mod(m.SoftShapeDemo, m.tweaks),
    ),
  "sight-lines": () =>
    import("@/registry/demos/sight-lines.demo").then((m) =>
      mod(m.SightLinesDemo, m.tweaks),
    ),
  "photo-scatter": () =>
    import("@/registry/demos/photo-scatter.demo").then((m) =>
      mod(m.PhotoScatterDemo, m.tweaks),
    ),
  "silk-ribbons": () =>
    import("@/registry/demos/silk-ribbons.demo").then((m) =>
      mod(m.SilkRibbonsDemo, m.tweaks),
    ),
  "ink-splash": () =>
    import("@/registry/demos/ink-splash.demo").then((m) =>
      mod(m.InkSplashDemo, m.tweaks),
    ),
  "lava-blobs": () =>
    import("@/registry/demos/lava-blobs.demo").then((m) =>
      mod(m.LavaBlobsDemo, m.tweaks),
    ),
  "jelly-cursor": () =>
    import("@/registry/demos/jelly-cursor.demo").then((m) =>
      mod(m.JellyCursorDemo, m.tweaks),
    ),
  "comet-border": () =>
    import("@/registry/demos/comet-border.demo").then((m) =>
      mod(m.CometBorderDemo, m.tweaks),
    ),
  "aurora-curtain": () =>
    import("@/registry/demos/aurora-curtain.demo").then((m) =>
      mod(m.AuroraCurtainDemo, m.tweaks),
    ),
  "plasma-bloom": () =>
    import("@/registry/demos/plasma-bloom.demo").then((m) =>
      mod(m.PlasmaBloomDemo, m.tweaks),
    ),
  "plasma-ribbon": () =>
    import("@/registry/demos/plasma-ribbon.demo").then((m) =>
      mod(m.PlasmaRibbonDemo, m.tweaks),
    ),
  "dust-motes": () =>
    import("@/registry/demos/dust-motes.demo").then((m) =>
      mod(m.DustMotesDemo, m.tweaks),
    ),
  "shutter-glow": () =>
    import("@/registry/demos/shutter-glow.demo").then((m) =>
      mod(m.ShutterGlowDemo, m.tweaks),
    ),
  "grain-mesh": () =>
    import("@/registry/demos/grain-mesh.demo").then((m) =>
      mod(m.GrainMeshDemo, m.tweaks),
    ),
  "horizon-grid": () =>
    import("@/registry/demos/horizon-grid.demo").then((m) =>
      mod(m.HorizonGridDemo, m.tweaks),
    ),
  "stage-beams": () =>
    import("@/registry/demos/stage-beams.demo").then((m) =>
      mod(m.StageBeamsDemo, m.tweaks),
    ),
  "pixel-snowfall": () =>
    import("@/registry/demos/pixel-snowfall.demo").then((m) =>
      mod(m.PixelSnowfallDemo, m.tweaks),
    ),
  "storm-front": () =>
    import("@/registry/demos/storm-front.demo").then((m) =>
      mod(m.StormFrontDemo, m.tweaks),
    ),
  "spectrum-burst": () =>
    import("@/registry/demos/spectrum-burst.demo").then((m) =>
      mod(m.SpectrumBurstDemo, m.tweaks),
    ),
  "star-spiral": () =>
    import("@/registry/demos/star-spiral.demo").then((m) =>
      mod(m.StarSpiralDemo, m.tweaks),
    ),
  "dither-dunes": () =>
    import("@/registry/demos/dither-dunes.demo").then((m) =>
      mod(m.DitherDunesDemo, m.tweaks),
    ),
  "relay-terminal": () =>
    import("@/registry/demos/relay-terminal.demo").then((m) =>
      mod(m.RelayTerminalDemo, m.tweaks),
    ),
  "ripple-lattice": () =>
    import("@/registry/demos/ripple-lattice.demo").then((m) =>
      mod(m.RippleLatticeDemo, m.tweaks),
    ),
  "pollen-flow": () =>
    import("@/registry/demos/pollen-flow.demo").then((m) =>
      mod(m.PollenFlowDemo, m.tweaks),
    ),
  "dot-tide": () =>
    import("@/registry/demos/dot-tide.demo").then((m) =>
      mod(m.DotTideDemo, m.tweaks),
    ),
  "thread-drift": () =>
    import("@/registry/demos/thread-drift.demo").then((m) =>
      mod(m.ThreadDriftDemo, m.tweaks),
    ),
  "night-drive": () =>
    import("@/registry/demos/night-drive.demo").then((m) =>
      mod(m.NightDriveDemo, m.tweaks),
    ),
  "oil-film": () =>
    import("@/registry/demos/oil-film.demo").then((m) =>
      mod(m.OilFilmDemo, m.tweaks),
    ),
  "tide-lines": () =>
    import("@/registry/demos/tide-lines.demo").then((m) =>
      mod(m.TideLinesDemo, m.tweaks),
    ),
  "bend-grid": () =>
    import("@/registry/demos/bend-grid.demo").then((m) =>
      mod(m.BendGridDemo, m.tweaks),
    ),
  "bead-pit": () =>
    import("@/registry/demos/bead-pit.demo").then((m) =>
      mod(m.BeadPitDemo, m.tweaks),
    ),
  "glow-orb": () =>
    import("@/registry/demos/glow-orb.demo").then((m) =>
      mod(m.GlowOrbDemo, m.tweaks),
    ),
  "letter-field": () =>
    import("@/registry/demos/letter-field.demo").then((m) =>
      mod(m.LetterFieldDemo, m.tweaks),
    ),
  "tile-drift": () =>
    import("@/registry/demos/tile-drift.demo").then((m) =>
      mod(m.TileDriftDemo, m.tweaks),
    ),
  "shape-lattice": () =>
    import("@/registry/demos/shape-lattice.demo").then((m) =>
      mod(m.ShapeLatticeDemo, m.tweaks),
    ),
  "chrome-pool": () =>
    import("@/registry/demos/chrome-pool.demo").then((m) =>
      mod(m.ChromePoolDemo, m.tweaks),
    ),
  "paint-vortex": () =>
    import("@/registry/demos/paint-vortex.demo").then((m) =>
      mod(m.PaintVortexDemo, m.tweaks),
    ),
};
