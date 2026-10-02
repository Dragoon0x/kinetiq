import { mod, type TactileModule } from "@/components/tactile/demo-module";

/**
 * One dynamic import per piece, so /studio ships none of them up front: a
 * card loads its own demo when it comes near the viewport. This map is the
 * only thing the Studio gallery imports — never components/docs/demos.tsx,
 * which would pull every demo in the catalogue into the page.
 */
export const STUDIO_DEMOS: Record<string, () => Promise<TactileModule>> = {
  "follow-knot": () =>
    import("@/registry/demos/follow-knot.demo").then((m) =>
      mod(m.FollowKnotDemo, m.tweaks),
    ),
  "mute-cone": () =>
    import("@/registry/demos/mute-cone.demo").then((m) =>
      mod(m.MuteConeDemo, m.tweaks),
    ),
  "pin-press": () =>
    import("@/registry/demos/pin-press.demo").then((m) =>
      mod(m.PinPressDemo, m.tweaks),
    ),
  "privacy-blinds": () =>
    import("@/registry/demos/privacy-blinds.demo").then((m) =>
      mod(m.PrivacyBlindsDemo, m.tweaks),
    ),
  "renew-loop": () =>
    import("@/registry/demos/renew-loop.demo").then((m) =>
      mod(m.RenewLoopDemo, m.tweaks),
    ),
  "focus-moon": () =>
    import("@/registry/demos/focus-moon.demo").then((m) =>
      mod(m.FocusMoonDemo, m.tweaks),
    ),
  "repeat-coil": () =>
    import("@/registry/demos/repeat-coil.demo").then((m) =>
      mod(m.RepeatCoilDemo, m.tweaks),
    ),
  "latch-lock": () =>
    import("@/registry/demos/latch-lock.demo").then((m) =>
      mod(m.LatchLockDemo, m.tweaks),
    ),
  "eye-lid": () =>
    import("@/registry/demos/eye-lid.demo").then((m) =>
      mod(m.EyeLidDemo, m.tweaks),
    ),
  "wish-tag": () =>
    import("@/registry/demos/wish-tag.demo").then((m) =>
      mod(m.WishTagDemo, m.tweaks),
    ),
  "answer-panel": () =>
    import("@/registry/demos/answer-panel.demo").then((m) =>
      mod(m.AnswerPanelDemo, m.tweaks),
    ),
  "agent-run": () =>
    import("@/registry/demos/agent-run.demo").then((m) =>
      mod(m.AgentRunDemo, m.tweaks),
    ),
  "prompt-dock": () =>
    import("@/registry/demos/prompt-dock.demo").then((m) =>
      mod(m.PromptDockDemo, m.tweaks),
    ),
  "thread-view": () =>
    import("@/registry/demos/thread-view.demo").then((m) =>
      mod(m.ThreadViewDemo, m.tweaks),
    ),
  "usage-ledger": () =>
    import("@/registry/demos/usage-ledger.demo").then((m) =>
      mod(m.UsageLedgerDemo, m.tweaks),
    ),
  "side-by-side": () =>
    import("@/registry/demos/side-by-side.demo").then((m) =>
      mod(m.SideBySideDemo, m.tweaks),
    ),
  "artifact-pane": () =>
    import("@/registry/demos/artifact-pane.demo").then((m) =>
      mod(m.ArtifactPaneDemo, m.tweaks),
    ),
  "voice-mode": () =>
    import("@/registry/demos/voice-mode.demo").then((m) =>
      mod(m.VoiceModeDemo, m.tweaks),
    ),
  "source-search": () =>
    import("@/registry/demos/source-search.demo").then((m) =>
      mod(m.SourceSearchDemo, m.tweaks),
    ),
  "agent-inbox": () =>
    import("@/registry/demos/agent-inbox.demo").then((m) =>
      mod(m.AgentInboxDemo, m.tweaks),
    ),
};
