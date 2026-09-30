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
};
