"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

import { ThemeProvider } from "@/components/chrome/theme-provider";
import { ForceReducedMotionContext } from "@/registry/hooks/use-motion-safe";

type MotionTestContextValue = {
  /** True while the site-wide "REDUCED MOTION · TEST" switch is on. */
  testingReducedMotion: boolean;
  setTestingReducedMotion: (value: boolean) => void;
};

const MotionTestContext = createContext<MotionTestContextValue | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [testingReducedMotion, setTestingReducedMotion] = useState(false);

  // Interaction tests wait on this marker before pressing anything.
  useEffect(() => {
    document.body.dataset.hydrated = "";
  }, []);

  const motionTest = useMemo(
    () => ({ testingReducedMotion, setTestingReducedMotion }),
    [testingReducedMotion],
  );

  return (
    <ThemeProvider>
      <MotionConfig reducedMotion={testingReducedMotion ? "always" : "user"}>
        <LazyMotion features={domAnimation}>
          <MotionTestContext.Provider value={motionTest}>
            <ForceReducedMotionContext.Provider value={testingReducedMotion}>
              {testingReducedMotion ? (
                <div data-reduced-motion-test="">
                  <p
                    role="status"
                    className="bg-cobalt-wash text-cobalt-bright border-cobalt/30 sticky top-0 z-50 border-b px-4 py-1.5 text-center font-mono text-[11px] tracking-[0.08em] uppercase"
                  >
                    Reduced motion · test active — every demo is showing its
                    fallback
                  </p>
                  {children}
                </div>
              ) : (
                children
              )}
            </ForceReducedMotionContext.Provider>
          </MotionTestContext.Provider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}

export function useMotionTest(): MotionTestContextValue {
  const context = useContext(MotionTestContext);
  if (!context) {
    throw new Error("useMotionTest must be used within Providers");
  }
  return context;
}
