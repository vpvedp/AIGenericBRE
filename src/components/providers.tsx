"use client";

import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { useAppStore } from "@/lib/store";
import { getThemeDefinition, THEME_PRESETS } from "@/lib/theme-presets";
import { RuleSync } from "@/components/rule-sync";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyAppearance(appearance: ReturnType<typeof useAppStore.getState>["appearance"]) {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    const root = document.documentElement;
    const isDark = appearance.colorMode === "dark" || (appearance.colorMode === "system" && systemPrefersDark());
    root.classList.toggle("dark", isDark);
    root.classList.toggle("glass-mode", !!appearance.background.imageData);

    // Clean up any old sidebar variables from previous themes that were previously
    // hardcoded, so they cleanly fall back to globals.css cascading inheritance.
    const legacyVars = [
      "--sidebar", "--sidebar-foreground", "--sidebar-primary",
      "--sidebar-primary-foreground", "--sidebar-accent",
      "--sidebar-accent-foreground", "--sidebar-border"
    ];
    for (const v of legacyVars) {
      root.style.removeProperty(v);
    }

    for (const preset of THEME_PRESETS) {
      for (const k of Object.keys(preset.light)) root.style.removeProperty(k);
      for (const k of Object.keys(preset.dark)) root.style.removeProperty(k);
    }

    const def = getThemeDefinition(appearance.preset);
    const vars = isDark ? def.dark : def.light;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    // Custom color overrides (Colors tab) — plain hex is a valid CSS color
    // value, so no HSL/OKLCH conversion is needed to layer these on top of
    // the preset above.
    const cc = appearance.customColors;
    if (cc.primary) {
      root.style.setProperty("--primary", cc.primary);
      root.style.setProperty("--ring", cc.primary);
    }
    if (cc.sidebarBg) root.style.setProperty("--sidebar", cc.sidebarBg);
    if (cc.sidebarFg) root.style.setProperty("--sidebar-foreground", cc.sidebarFg);
    if (cc.sidebarActive) root.style.setProperty("--sidebar-primary", cc.sidebarActive);
    if (cc.chartAccent) root.style.setProperty("--chart-1", cc.chartAccent);

    // Background image — a single set of CSS vars feeds three possible layer
    // elements (full-app / dashboard-scoped / sidebar-scoped); data-bg-target
    // picks which one is actually visible, so switching "target" needs no JS.
    const bg = appearance.background;
    root.setAttribute("data-bg-target", bg.target);
    if (bg.imageData) {
      const blurPx = bg.displayMode === "blur" ? Math.min(40, bg.blur * 2 + 12) : bg.blur;
      root.style.setProperty("--app-wallpaper", `url(${bg.imageData})`);
      root.style.setProperty("--app-wallpaper-opacity", String(bg.opacity / 100));
      root.style.setProperty("--app-wallpaper-blur", `${blurPx}px`);
      root.style.setProperty("--app-wallpaper-brightness", `${bg.brightness}%`);
      root.style.setProperty("--app-wallpaper-dim", String(bg.dimOverlay / 100));
      root.style.setProperty("--app-wallpaper-size", bg.displayMode === "contain" ? "contain" : "cover");
      root.style.setProperty("--app-wallpaper-attachment", bg.displayMode === "fixed" ? "fixed" : "scroll");
    } else {
      root.style.removeProperty("--app-wallpaper");
      root.style.setProperty("--app-wallpaper-opacity", "0");
    }

    root.setAttribute("data-density", appearance.density);
    root.setAttribute("data-font-scale", appearance.fontScale);
    root.setAttribute("data-high-contrast", String(appearance.highContrast));
    root.setAttribute("data-large-targets", String(appearance.largeClickTargets));
    root.lang = appearance.language || "en";
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const appearance = useAppStore((s) => s.appearance);

  useEffect(() => {
    Promise.resolve(useAppStore.persist.rehydrate()).then(() => {
      setHydrated(true);
      useAppStore.getState().setHasHydrated(true);
    });
  }, []);

  useEffect(() => {
    applyAppearance(appearance);
    if (appearance.colorMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(appearance);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appearance]);

  return (
    <TooltipProvider delay={200}>
      <RuleSync />
      <div className="h-full" style={{ visibility: hydrated ? "visible" : "hidden" }}>{children}</div>
      <Toaster
        position="top-right"
        expand={false}
        closeButton
        duration={3500}
        toastOptions={{
          classNames: {
            toast: "group font-sans shadow-2xl backdrop-blur-xl rounded-2xl !bg-background/95 dark:!bg-muted/95 !border !border-border/50 overflow-hidden relative animate-toast-drift",
            title: "text-sm font-semibold tracking-tight !text-foreground dark:!text-foreground dark:[text-shadow:0_0_12px_rgba(255,255,255,0.4)]",
            description: "text-sm !text-muted-foreground dark:!text-muted-foreground",
            actionButton: "bg-primary text-primary-foreground font-semibold rounded-lg",
            cancelButton: "bg-muted text-muted-foreground rounded-lg",
            success: "!bg-emerald-50/95 dark:!bg-emerald-900/95 !border-emerald-200 dark:!border-emerald-700 !text-emerald-700 dark:!text-emerald-300 dark:[text-shadow:0_0_12px_rgba(110,231,183,0.6)] [&_svg]:!text-emerald-600 dark:[&_svg]:!text-emerald-300 dark:[&_svg]:[filter:drop-shadow(0_0_6px_rgba(110,231,183,0.6))]",
            error: "!bg-red-50/95 dark:!bg-red-900/95 !border-red-200 dark:!border-red-700 !text-red-700 dark:!text-red-300 dark:[text-shadow:0_0_12px_rgba(252,165,165,0.6)] [&_svg]:!text-red-600 dark:[&_svg]:!text-red-300 dark:[&_svg]:[filter:drop-shadow(0_0_6px_rgba(252,165,165,0.6))]",
            info: "!bg-blue-50/95 dark:!bg-blue-900/95 !border-blue-200 dark:!border-blue-700 !text-blue-700 dark:!text-blue-300 dark:[text-shadow:0_0_12px_rgba(147,197,253,0.6)] [&_svg]:!text-blue-600 dark:[&_svg]:!text-blue-300 dark:[&_svg]:[filter:drop-shadow(0_0_6px_rgba(147,197,253,0.6))]",
            warning: "!bg-amber-50/95 dark:!bg-amber-900/95 !border-amber-200 dark:!border-amber-700 !text-amber-700 dark:!text-amber-300 dark:[text-shadow:0_0_12px_rgba(252,211,77,0.6)] [&_svg]:!text-amber-600 dark:[&_svg]:!text-amber-300 dark:[&_svg]:[filter:drop-shadow(0_0_6px_rgba(252,211,77,0.6))]",
            closeButton: "!left-auto !right-2 !top-1/2 !-translate-y-1/2 !translate-x-0 opacity-100 !bg-transparent hover:!bg-foreground/5 !border-transparent text-foreground transition-colors"
          }
        }}
      />
    </TooltipProvider>
  );
}
