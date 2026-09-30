import type { ComponentType } from "react";

import type { TactileDemoProps, TweakSchema } from "@/registry/lib/tweaks";

/** What a gallery demo module gives a room: the demo and its tweaks. */
export type TactileModule = {
  Demo: ComponentType<TactileDemoProps<TweakSchema> & { chrome?: boolean }>;
  tweaks: TweakSchema;
};

export const mod = (Demo: unknown, tweaks: TweakSchema): TactileModule => ({
  Demo: Demo as TactileModule["Demo"],
  tweaks,
});
