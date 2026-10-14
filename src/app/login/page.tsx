"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, Lock, Eye, EyeOff, ShieldCheck, KeyRound, ScrollText, Workflow, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { LogoMark } from "@/components/shell/logo";
import { NetworkBackground } from "@/components/login/network-background";
import { SparkleAccent } from "@/components/login/sparkle-accent";
import { ProductMockup } from "@/components/login/product-mockup";
import { FeatureBadge } from "@/components/login/feature-badge";
import { RoleSwitcherDialog } from "@/components/shell/role-switcher-dialog";
import { hasServerSession, signIn } from "@/lib/auth/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from "@/components/ui/input-group";
import { AnimatedBackground } from "@/components/login/animated-background";
import aiFoundryLogo from "@/assets/AI-Foundry.png";

const CAPABILITIES = [
  "No-Code Rule Builder",
  "Decision Matrix Configuration",
  "Approval Workflow & Governance",
  "Conflict Detection",
  "Full Audit Trail",
];

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "Secure Access" },
  { icon: KeyRound, label: "Role-Based Permissions" },
  { icon: ScrollText, label: "Full Audit Trail" },
  { icon: Workflow, label: "Workflow Automation" },
];

export default function LoginPage() {
  const router = useRouter();
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const login = useAppStore((s) => s.login);
  const rules = useAppStore((s) => s.rules);
  const simulations = useAppStore((s) => s.simulations);
  const appName = useAppStore((s) => s.appearance.appName);
  const tagline = useAppStore((s) => s.appearance.tagline);
  const customLogo = useAppStore((s) => s.appearance.loginLogo);
  const dashboardConfigs = useAppStore((s) => s.dashboardConfigs);
  const currentUserId = useAppStore((s) => s.currentUser.userId);

  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const logout = useAppStore((s) => s.logout);
  const [submitting, setSubmitting] = useState(false);

  // Where to go after sign-in: the page the proxy bounced us from (?next=…), else the user's landing page.
  const destination = () => {
    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    return next && next.startsWith("/") && !next.startsWith("//") ? next : dashboardConfigs[currentUserId]?.landingRoute ?? "/dashboard";
  };

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;
    // The browser remembers "signed in", but the server session may have
    // expired. Only skip the login screen if the server agrees.
    let cancelled = false;
    hasServerSession().then((valid) => {
      if (cancelled) return;
      if (valid) router.replace(destination());
      else logout();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, isAuthenticated]);

  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.status === "Published").length;
  const simulationsRun = simulations.length + 256;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim() || !password.trim()) {
      setError("Enter both your Employee ID and password to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    // The server checks the password and sets a signed, httpOnly session cookie.
    const result = await signIn(employeeId, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    login();
    toast.success("Signed in successfully");
    router.push(destination());
  };

  return (
    <div
      className="relative flex h-full flex-col overflow-y-auto md:flex-row md:overflow-hidden"
      style={
        {
          // The sign-in hero is a fixed brand visual (navy → teal, matching
          // the constellation backdrop below) — deliberately independent of
          // the authenticated app's Appearance Studio theme/color-mode, the
          // same way most products give their login screen its own fixed
          // look. Scoping these as local --sidebar-* overrides (rather than
          // touching every text-sidebar-foreground/bg-sidebar-accent/etc.
          // class already used throughout this page) means the existing
          // markup below picks up the fixed palette for free. Applied on the
          // full-width root (not just a half-width column) so the gradient
          // spans the whole screen, with the sign-in card floating on top of
          // it near the right edge — matches the shared reference layout.
          "--sidebar": "#0f2744",
          "--sidebar-foreground": "#f3f8fb",
          "--sidebar-primary": "#5eead4",
          "--sidebar-primary-foreground": "#082433",
          "--sidebar-accent": "#173a5a",
          "--sidebar-accent-foreground": "#f3f8fb",
          "--sidebar-border": "rgba(243, 248, 251, 0.14)",
          background:
            "linear-gradient(135deg, color-mix(in oklch, var(--sidebar) 88%, black 12%) 0%, var(--sidebar) 45%, color-mix(in oklch, var(--sidebar) 78%, var(--sidebar-primary) 22%) 100%)",
        } as React.CSSProperties
      }
    >
      <AnimatedBackground />
      {/* Full-screen, not scoped to the left panel — previously this sat
          inside the left-panel div below, so its "absolute inset-0" only
          ever filled that panel's width and the light sweep visibly stopped
          short of the sign-in card instead of continuing behind it. No
          z-index of its own (same as AnimatedBackground above), so normal
          DOM order keeps it behind both z-10 panels. */}
      <NetworkBackground className="pointer-events-none absolute inset-0 h-full w-full" />

      <div className="absolute top-6 right-6 lg:top-8 lg:right-10 z-20 hidden md:flex items-center gap-2">
        <Image 
          src={aiFoundryLogo} 
          alt="AI Foundry" 
          className="h-8 w-auto object-contain brightness-0 invert" 
          style={{ animation: 'logoPulseGlow 3s ease-in-out infinite' }}
        />
      </div>

      {/* Compact brand banner — mobile only (<768px). Replaces the old
          logo-only fallback so the trust story survives on phones instead
          of vanishing entirely. */}
      <div className="flex flex-col gap-3 border-b border-sidebar-border px-5 py-4 text-sidebar-foreground md:hidden z-10">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <div>
            <p className="text-sm font-semibold tracking-tight">{appName}</p>
            <p className="text-xs text-sidebar-foreground/80">{tagline}</p>
          </div>
        </div>
        <p className="text-xs text-sidebar-foreground/80">
          Configure once, evaluate everywhere.
        </p>
      </div>

      {/* Left/center — branding content, floating on the full-width gradient.
          Full detail from desktop (lg, ≥1024px); a condensed logo + hero
          subset from tablet (md, ≥768px) — the mockup/badges step in only at
          lg so the panel degrades gracefully instead of disappearing. */}
      <div className="relative hidden min-w-0 flex-1 flex-col justify-between overflow-hidden px-6 py-6 text-sidebar-foreground md:flex md:px-8 md:py-8 lg:px-10 lg:py-10 xl:px-14 z-10">
        <div className="relative">
          <div className="flex items-center gap-3">
            <LogoMark className="size-10" context="login" />
            <div>
              <p className="text-lg font-semibold tracking-tight">{appName}</p>
              <p className="text-sm text-sidebar-foreground/85">{tagline}</p>
            </div>
            <SparkleAccent className="ml-1 size-7 lg:size-9 shrink-0" />
          </div>

          <h1 className="mt-4 max-w-3xl text-3xl leading-tight font-bold tracking-tight lg:text-4xl">
            <span className="text-sidebar-foreground">One business rules engine </span>
            <span className="text-sidebar-primary">for every industry.</span>
          </h1>
          <p className="mt-2 mb-10 max-w-lg text-sm text-sidebar-foreground/80">
            Configure once, evaluate everywhere — no code required.
          </p>
        </div>

        <div className="flex flex-1 items-center justify-center py-2 lg:mt-0 lg:-translate-y-[6px]">
          <div className="relative">
            <ProductMockup totalRules={totalRules} activeRules={activeRules} simulationsRun={simulationsRun} />

            {/* No-Code Rule Builder (Top Left) */}
            <FeatureBadge label={CAPABILITIES[0]} className="absolute right-[100%] top-10 mr-6 hidden lg:flex whitespace-nowrap" style={{ animation: 'ucrmLoginBadgeBob 5.8s ease-in-out infinite' }} />

            {/* Decision Matrix Configuration (Middle Right) */}
            <FeatureBadge label={CAPABILITIES[1]} className="absolute left-[100%] top-1/4 ml-6 hidden lg:flex whitespace-nowrap" style={{ animation: 'ucrmLoginBadgeBob 6.2s ease-in-out infinite 0.5s' }} />

            {/* Approval Workflow & Governance (Bottom Right) */}
            <FeatureBadge label={CAPABILITIES[2]} className="absolute left-[100%] bottom-[64px] ml-5 hidden lg:flex whitespace-nowrap" style={{ animation: 'ucrmLoginBadgeBob 5.5s ease-in-out infinite 1s' }} />

            {/* Conflict Detection (Middle Left, moved slightly up) */}
            <FeatureBadge label={CAPABILITIES[3]} className="absolute right-[100%] top-[45%] mr-12 hidden lg:flex whitespace-nowrap" style={{ animation: 'ucrmLoginBadgeBob 6.0s ease-in-out infinite 1.5s' }} />

            {/* Full Audit Trail (Bottom Left, below Conflict Detection) */}
            <FeatureBadge label={CAPABILITIES[4]} className="absolute right-[100%] bottom-[40px] mr-6 hidden lg:flex whitespace-nowrap" style={{ animation: 'ucrmLoginBadgeBob 5.7s ease-in-out infinite 0.2s' }} />
          </div>
        </div>
      </div>

      {/* Right — sign-in card. Bounded, elevated container (the established
          rounded-xl/border/bg-card pattern used elsewhere in the app) so
          the credential form reads as the page's secure surface, with a
          single visually dominant CTA. */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10 md:flex-none md:justify-center md:px-10 md:py-12 lg:pr-10 xl:pr-12 z-10">
        <div className="w-full max-w-[30rem] animate-[breCardFloat_6s_ease-in-out_infinite]">
          <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.3)] sm:p-8">
            <div className="flex flex-col items-center text-center">
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Welcome Back</h2>
              <p className="mt-1 text-sm text-white/80">Sign in to your {appName} account</p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-1.5 text-left">
                <Label htmlFor="employeeId" className="font-medium text-white">Employee ID</Label>
                <InputGroup className="h-[42px] border-white/10 bg-black/20 backdrop-blur-md transition-all focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20">
                  <InputGroupAddon>
                    <User className="size-4 text-white/70" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="employeeId"
                    placeholder="EMP-0001"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    className="login-input text-white placeholder:text-white/50"
                  />
                </InputGroup>
              </div>

              <div className="space-y-1.5 text-left">
                <Label htmlFor="password" className="font-medium text-white">Password</Label>
                <InputGroup className="h-[42px] border-white/10 bg-black/20 backdrop-blur-md transition-all focus-within:border-white/40 focus-within:ring-2 focus-within:ring-white/20">
                  <InputGroupAddon>
                    <Lock className="size-4 text-white/70" />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="login-input text-white placeholder:text-white/50"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((s) => !s)}
                    >
                      {showPassword ? <EyeOff className="size-4 text-white/70" /> : <Eye className="size-4 text-white/70" />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>

              {error && (
                <p role="alert" aria-live="polite" className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="size-3.5 shrink-0" /> {error}
                </p>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-white/90">
                  <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(!!v)} className="border-white/40 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => toast.info("Contact your administrator to reset your password.")}
                  className="text-sm font-medium text-white hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <Button type="submit" size="lg" disabled={submitting} className="w-full h-12 font-semibold shadow-sm bg-blue-600 hover:bg-blue-500 border-0 text-white transition-all hover:-translate-y-[2px] hover:shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                {submitting ? "Signing in…" : "Sign In"}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-white/70">
              Need Demo Access?{" "}
              <button
                onClick={() => setPickerOpen(true)}
                className="font-medium text-white underline-offset-2 hover:underline"
              >
                Enter Demo Mode
              </button>
            </div>


          </div>
        </div>
      </div>

      <RoleSwitcherDialog open={pickerOpen} onOpenChange={setPickerOpen} redirectTo="/dashboard" />
    </div>
  );
}
