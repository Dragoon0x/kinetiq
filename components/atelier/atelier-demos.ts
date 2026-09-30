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
};
