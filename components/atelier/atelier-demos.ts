import { mod, type TactileModule } from "@/components/tactile/demo-module";

/**
 * One dynamic import per piece, so /atelier ships none of them up front: a
 * card loads its own demo when it comes near the viewport. This map is the
 * only thing the Atelier gallery imports — never components/docs/demos.tsx,
 * which would pull every demo in the catalogue into the page.
 */
export const ATELIER_DEMOS: Record<string, () => Promise<TactileModule>> = {
  beeper: () =>
    import("@/registry/demos/beeper.demo").then((m) =>
      mod(m.BeeperDemo, m.tweaks),
    ),
  "island-pill": () =>
    import("@/registry/demos/island-pill.demo").then((m) =>
      mod(m.IslandPillDemo, m.tweaks),
    ),
  "inbox-chute": () =>
    import("@/registry/demos/inbox-chute.demo").then((m) =>
      mod(m.InboxChuteDemo, m.tweaks),
    ),
  "ribbon-unfurl": () =>
    import("@/registry/demos/ribbon-unfurl.demo").then((m) =>
      mod(m.RibbonUnfurlDemo, m.tweaks),
    ),
  "edge-tab": () =>
    import("@/registry/demos/edge-tab.demo").then((m) =>
      mod(m.EdgeTabDemo, m.tweaks),
    ),
  "quick-reply": () =>
    import("@/registry/demos/quick-reply.demo").then((m) =>
      mod(m.QuickReplyDemo, m.tweaks),
    ),
  "live-activity": () =>
    import("@/registry/demos/live-activity.demo").then((m) =>
      mod(m.LiveActivityDemo, m.tweaks),
    ),
  "paper-slip": () =>
    import("@/registry/demos/paper-slip.demo").then((m) =>
      mod(m.PaperSlipDemo, m.tweaks),
    ),
  "cork-notes": () =>
    import("@/registry/demos/cork-notes.demo").then((m) =>
      mod(m.CorkNotesDemo, m.tweaks),
    ),
  "pneumatic-tube": () =>
    import("@/registry/demos/pneumatic-tube.demo").then((m) =>
      mod(m.PneumaticTubeDemo, m.tweaks),
    ),
  "tumbler-code": () =>
    import("@/registry/demos/tumbler-code.demo").then((m) =>
      mod(m.TumblerCodeDemo, m.tweaks),
    ),
  "vault-password": () =>
    import("@/registry/demos/vault-password.demo").then((m) =>
      mod(m.VaultPasswordDemo, m.tweaks),
    ),
  "globe-phone": () =>
    import("@/registry/demos/globe-phone.demo").then((m) =>
      mod(m.GlobePhoneDemo, m.tweaks),
    ),
  "swatch-mixer": () =>
    import("@/registry/demos/swatch-mixer.demo").then((m) =>
      mod(m.SwatchMixerDemo, m.tweaks),
    ),
  "folder-drop": () =>
    import("@/registry/demos/folder-drop.demo").then((m) =>
      mod(m.FolderDropDemo, m.tweaks),
    ),
  "slug-field": () =>
    import("@/registry/demos/slug-field.demo").then((m) =>
      mod(m.SlugFieldDemo, m.tweaks),
    ),
  "coin-amount": () =>
    import("@/registry/demos/coin-amount.demo").then((m) =>
      mod(m.CoinAmountDemo, m.tweaks),
    ),
  "catalog-select": () =>
    import("@/registry/demos/catalog-select.demo").then((m) =>
      mod(m.CatalogSelectDemo, m.tweaks),
    ),
  "ink-checklist": () =>
    import("@/registry/demos/ink-checklist.demo").then((m) =>
      mod(m.InkChecklistDemo, m.tweaks),
    ),
  "mail-field": () =>
    import("@/registry/demos/mail-field.demo").then((m) =>
      mod(m.MailFieldDemo, m.tweaks),
    ),
  "ribbon-tabs": () =>
    import("@/registry/demos/ribbon-tabs.demo").then((m) =>
      mod(m.RibbonTabsDemo, m.tweaks),
    ),
  "cabinet-menu": () =>
    import("@/registry/demos/cabinet-menu.demo").then((m) =>
      mod(m.CabinetMenuDemo, m.tweaks),
    ),
  "cantilever-menu": () =>
    import("@/registry/demos/cantilever-menu.demo").then((m) =>
      mod(m.CantileverMenuDemo, m.tweaks),
    ),
  "thumb-index": () =>
    import("@/registry/demos/thumb-index.demo").then((m) =>
      mod(m.ThumbIndexDemo, m.tweaks),
    ),
  "key-ring": () =>
    import("@/registry/demos/key-ring.demo").then((m) =>
      mod(m.KeyRingDemo, m.tweaks),
    ),
  "blind-menu": () =>
    import("@/registry/demos/blind-menu.demo").then((m) =>
      mod(m.BlindMenuDemo, m.tweaks),
    ),
  "jukebox-menu": () =>
    import("@/registry/demos/jukebox-menu.demo").then((m) =>
      mod(m.JukeboxMenuDemo, m.tweaks),
    ),
  "view-morph": () =>
    import("@/registry/demos/view-morph.demo").then((m) =>
      mod(m.ViewMorphDemo, m.tweaks),
    ),
  "pocket-nav": () =>
    import("@/registry/demos/pocket-nav.demo").then((m) =>
      mod(m.PocketNavDemo, m.tweaks),
    ),
  "liquid-tabbar": () =>
    import("@/registry/demos/liquid-tabbar.demo").then((m) =>
      mod(m.LiquidTabbarDemo, m.tweaks),
    ),
  "hourglass-turn": () =>
    import("@/registry/demos/hourglass-turn.demo").then((m) =>
      mod(m.HourglassTurnDemo, m.tweaks),
    ),
  "knot-tie": () =>
    import("@/registry/demos/knot-tie.demo").then((m) =>
      mod(m.KnotTieDemo, m.tweaks),
    ),
  "radio-tune": () =>
    import("@/registry/demos/radio-tune.demo").then((m) =>
      mod(m.RadioTuneDemo, m.tweaks),
    ),
  "abacus-count": () =>
    import("@/registry/demos/abacus-count.demo").then((m) =>
      mod(m.AbacusCountDemo, m.tweaks),
    ),
  "yarn-knit": () =>
    import("@/registry/demos/yarn-knit.demo").then((m) =>
      mod(m.YarnKnitDemo, m.tweaks),
    ),
  "geared-pen": () =>
    import("@/registry/demos/geared-pen.demo").then((m) =>
      mod(m.GearedPenDemo, m.tweaks),
    ),
  "kettle-steam": () =>
    import("@/registry/demos/kettle-steam.demo").then((m) =>
      mod(m.KettleSteamDemo, m.tweaks),
    ),
  "tape-reels": () =>
    import("@/registry/demos/tape-reels.demo").then((m) =>
      mod(m.TapeReelsDemo, m.tweaks),
    ),
  "lava-drift": () =>
    import("@/registry/demos/lava-drift.demo").then((m) =>
      mod(m.LavaDriftDemo, m.tweaks),
    ),
  "sundial-hour": () =>
    import("@/registry/demos/sundial-hour.demo").then((m) =>
      mod(m.SundialHourDemo, m.tweaks),
    ),
  "ink-bleed": () =>
    import("@/registry/demos/ink-bleed.demo").then((m) =>
      mod(m.InkBleedDemo, m.tweaks),
    ),
  "platen-print": () =>
    import("@/registry/demos/platen-print.demo").then((m) =>
      mod(m.PlatenPrintDemo, m.tweaks),
    ),
  "neon-strike": () =>
    import("@/registry/demos/neon-strike.demo").then((m) =>
      mod(m.NeonStrikeDemo, m.tweaks),
    ),
  "crossword-guess": () =>
    import("@/registry/demos/crossword-guess.demo").then((m) =>
      mod(m.CrosswordGuessDemo, m.tweaks),
    ),
  "sand-script": () =>
    import("@/registry/demos/sand-script.demo").then((m) =>
      mod(m.SandScriptDemo, m.tweaks),
    ),
  "redline-draft": () =>
    import("@/registry/demos/redline-draft.demo").then((m) =>
      mod(m.RedlineDraftDemo, m.tweaks),
    ),
  "morse-status": () =>
    import("@/registry/demos/morse-status.demo").then((m) =>
      mod(m.MorseStatusDemo, m.tweaks),
    ),
  "braille-rise": () =>
    import("@/registry/demos/braille-rise.demo").then((m) =>
      mod(m.BrailleRiseDemo, m.tweaks),
    ),
  "kiln-glow": () =>
    import("@/registry/demos/kiln-glow.demo").then((m) =>
      mod(m.KilnGlowDemo, m.tweaks),
    ),
  "lens-sweep": () =>
    import("@/registry/demos/lens-sweep.demo").then((m) =>
      mod(m.LensSweepDemo, m.tweaks),
    ),
  "darkroom-develop": () =>
    import("@/registry/demos/darkroom-develop.demo").then((m) =>
      mod(m.DarkroomDevelopDemo, m.tweaks),
    ),
  "instant-shake": () =>
    import("@/registry/demos/instant-shake.demo").then((m) =>
      mod(m.InstantShakeDemo, m.tweaks),
    ),
  "sketch-paint": () =>
    import("@/registry/demos/sketch-paint.demo").then((m) =>
      mod(m.SketchPaintDemo, m.tweaks),
    ),
  "screen-print": () =>
    import("@/registry/demos/screen-print.demo").then((m) =>
      mod(m.ScreenPrintDemo, m.tweaks),
    ),
  "kaleido-resolve": () =>
    import("@/registry/demos/kaleido-resolve.demo").then((m) =>
      mod(m.KaleidoResolveDemo, m.tweaks),
    ),
  "slide-projector": () =>
    import("@/registry/demos/slide-projector.demo").then((m) =>
      mod(m.SlideProjectorDemo, m.tweaks),
    ),
  "paint-numbers": () =>
    import("@/registry/demos/paint-numbers.demo").then((m) =>
      mod(m.PaintNumbersDemo, m.tweaks),
    ),
  "film-burn": () =>
    import("@/registry/demos/film-burn.demo").then((m) =>
      mod(m.FilmBurnDemo, m.tweaks),
    ),
  "jigsaw-set": () =>
    import("@/registry/demos/jigsaw-set.demo").then((m) =>
      mod(m.JigsawSetDemo, m.tweaks),
    ),
  "etch-reveal": () =>
    import("@/registry/demos/etch-reveal.demo").then((m) =>
      mod(m.EtchRevealDemo, m.tweaks),
    ),
  "sun-arc": () =>
    import("@/registry/demos/sun-arc.demo").then((m) =>
      mod(m.SunArcDemo, m.tweaks),
    ),
  "moon-phase": () =>
    import("@/registry/demos/moon-phase.demo").then((m) =>
      mod(m.MoonPhaseDemo, m.tweaks),
    ),
  "egg-timer": () =>
    import("@/registry/demos/egg-timer.demo").then((m) =>
      mod(m.EggTimerDemo, m.tweaks),
    ),
  "plant-care": () =>
    import("@/registry/demos/plant-care.demo").then((m) =>
      mod(m.PlantCareDemo, m.tweaks),
    ),
  "bin-day": () =>
    import("@/registry/demos/bin-day.demo").then((m) =>
      mod(m.BinDayDemo, m.tweaks),
    ),
  "commute-line": () =>
    import("@/registry/demos/commute-line.demo").then((m) =>
      mod(m.CommuteLineDemo, m.tweaks),
    ),
  "summit-steps": () =>
    import("@/registry/demos/summit-steps.demo").then((m) =>
      mod(m.SummitStepsDemo, m.tweaks),
    ),
  "dandelion-air": () =>
    import("@/registry/demos/dandelion-air.demo").then((m) =>
      mod(m.DandelionAirDemo, m.tweaks),
    ),
  "wind-sock": () =>
    import("@/registry/demos/wind-sock.demo").then((m) =>
      mod(m.WindSockDemo, m.tweaks),
    ),
  "parking-meter": () =>
    import("@/registry/demos/parking-meter.demo").then((m) =>
      mod(m.ParkingMeterDemo, m.tweaks),
    ),
  "tear-pass": () =>
    import("@/registry/demos/tear-pass.demo").then((m) =>
      mod(m.TearPassDemo, m.tweaks),
    ),
  "mail-postcard": () =>
    import("@/registry/demos/mail-postcard.demo").then((m) =>
      mod(m.MailPostcardDemo, m.tweaks),
    ),
  "wax-seal": () =>
    import("@/registry/demos/wax-seal.demo").then((m) =>
      mod(m.WaxSealDemo, m.tweaks),
    ),
  "library-card": () =>
    import("@/registry/demos/library-card.demo").then((m) =>
      mod(m.LibraryCardDemo, m.tweaks),
    ),
  "stat-card": () =>
    import("@/registry/demos/stat-card.demo").then((m) =>
      mod(m.StatCardDemo, m.tweaks),
    ),
  wristband: () =>
    import("@/registry/demos/wristband.demo").then((m) =>
      mod(m.WristbandDemo, m.tweaks),
    ),
  "emboss-card": () =>
    import("@/registry/demos/emboss-card.demo").then((m) =>
      mod(m.EmbossCardDemo, m.tweaks),
    ),
  "punch-card": () =>
    import("@/registry/demos/punch-card.demo").then((m) =>
      mod(m.PunchCardDemo, m.tweaks),
    ),
  "award-seal": () =>
    import("@/registry/demos/award-seal.demo").then((m) =>
      mod(m.AwardSealDemo, m.tweaks),
    ),
  "booth-strip": () =>
    import("@/registry/demos/booth-strip.demo").then((m) =>
      mod(m.BoothStripDemo, m.tweaks),
    ),
  "pocket-phone": () =>
    import("@/registry/demos/pocket-phone.demo").then((m) =>
      mod(m.PocketPhoneDemo, m.tweaks),
    ),
  "lid-laptop": () =>
    import("@/registry/demos/lid-laptop.demo").then((m) =>
      mod(m.LidLaptopDemo, m.tweaks),
    ),
  "slate-tablet": () =>
    import("@/registry/demos/slate-tablet.demo").then((m) =>
      mod(m.SlateTabletDemo, m.tweaks),
    ),
  "crown-watch": () =>
    import("@/registry/demos/crown-watch.demo").then((m) =>
      mod(m.CrownWatchDemo, m.tweaks),
    ),
  "tab-browser": () =>
    import("@/registry/demos/tab-browser.demo").then((m) =>
      mod(m.TabBrowserDemo, m.tweaks),
    ),
  "fold-phone": () =>
    import("@/registry/demos/fold-phone.demo").then((m) =>
      mod(m.FoldPhoneDemo, m.tweaks),
    ),
  "pocket-console": () =>
    import("@/registry/demos/pocket-console.demo").then((m) =>
      mod(m.PocketConsoleDemo, m.tweaks),
    ),
  viewfinder: () =>
    import("@/registry/demos/viewfinder.demo").then((m) =>
      mod(m.ViewfinderDemo, m.tweaks),
    ),
  "ink-reader": () =>
    import("@/registry/demos/ink-reader.demo").then((m) =>
      mod(m.InkReaderDemo, m.tweaks),
    ),
  "stand-monitor": () =>
    import("@/registry/demos/stand-monitor.demo").then((m) =>
      mod(m.StandMonitorDemo, m.tweaks),
    ),
};
