"use client";

import { hasServerSession, signIn } from "@/lib/auth/client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ShieldCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function RoleSwitcherDialog({
  open,
  onOpenChange,
  redirectTo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Navigate here after a user is picked — used when this dialog doubles as the sign-in shortcut on /login. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const users = useAppStore((s) => s.users);
  const currentUser = useAppStore((s) => s.currentUser);
  const loginAsUser = useAppStore((s) => s.loginAsUser);
  const dashboardConfigs = useAppStore((s) => s.dashboardConfigs);

  const selectUser = async (userId: string, name: string) => {
    // Demo Mode from the login screen still needs a server session. In local
    // demo mode (no APP_USERS) the server accepts it; on a real server it won't.
    if (redirectTo && !(await hasServerSession())) {
      const result = await signIn(userId, "demo");
      if (!result.ok) {
        toast.error("Demo Mode is off on this server", { description: "Sign in with your Employee ID and password." });
        return;
      }
    }
    loginAsUser(userId);
    onOpenChange(false);
    toast.success(`Signed in as ${name}`);
    // Every switch lands on that user's configured primary module.
    router.push(dashboardConfigs[userId]?.landingRoute ?? redirectTo ?? "/dashboard");
  };

  const initialsOf = (name: string) =>
    name.split(/[\s/]+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const avatarColors = [
    "text-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)] group-hover:bg-blue-500/20 group-hover:shadow-[0_0_35px_rgba(59,130,246,0.6)] group-hover:text-blue-600 dark:group-hover:text-blue-400",
    "text-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)] group-hover:bg-purple-500/20 group-hover:shadow-[0_0_35px_rgba(168,85,247,0.6)] group-hover:text-purple-600 dark:group-hover:text-purple-400",
    "text-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)] group-hover:bg-emerald-500/20 group-hover:shadow-[0_0_35px_rgba(16,185,129,0.6)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
    "text-amber-500 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)] group-hover:bg-amber-500/20 group-hover:shadow-[0_0_35px_rgba(245,158,11,0.6)] group-hover:text-amber-600 dark:group-hover:text-amber-400",
    "text-rose-500 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.15)] group-hover:bg-rose-500/20 group-hover:shadow-[0_0_35px_rgba(244,63,94,0.6)] group-hover:text-rose-600 dark:group-hover:text-rose-400",
    "text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)] group-hover:bg-cyan-500/20 group-hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] group-hover:text-cyan-600 dark:group-hover:text-cyan-400"
  ];

  const activeAvatarColors = [
    "bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]",
    "bg-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.5)]",
    "bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)]",
    "bg-amber-600 text-white shadow-[0_0_20px_rgba(245,158,11,0.5)]",
    "bg-rose-600 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)]",
    "bg-cyan-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.5)]"
  ];

  const activeRingColors = [
    "ring-2 ring-blue-500 bg-blue-500/10 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.2)]",
    "ring-2 ring-purple-500 bg-purple-500/10 shadow-[0_4px_16px_-4px_rgba(168,85,247,0.2)]",
    "ring-2 ring-emerald-500 bg-emerald-500/10 shadow-[0_4px_16px_-4px_rgba(16,185,129,0.2)]",
    "ring-2 ring-amber-500 bg-amber-500/10 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.2)]",
    "ring-2 ring-rose-500 bg-rose-500/10 shadow-[0_4px_16px_-4px_rgba(244,63,94,0.2)]",
    "ring-2 ring-cyan-500 bg-cyan-500/10 shadow-[0_4px_16px_-4px_rgba(6,182,212,0.2)]"
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-background/70 backdrop-blur-3xl border-border/50 shadow-2xl">
        <DialogHeader>
          <DialogTitle>Select a User</DialogTitle>
          <DialogDescription className="text-foreground/80 font-medium">Choose a user to sign in as and explore the platform.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-100 grid-cols-1 gap-2.5 overflow-y-auto sm:grid-cols-2 p-1.5">
          {users.map((user, index) => {
            const active = user.id === currentUser.userId;
            const colorIndex = index % avatarColors.length;
            
            return (
              <button
                key={user.id}
                onClick={() => selectUser(user.id, user.name)}
                className={cn(
                  "group flex items-center gap-3.5 rounded-2xl p-3 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.12)] border border-white/20 dark:border-white/10",
                  active ? activeRingColors[colorIndex] : "bg-background/40 backdrop-blur-md shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]"
                )}
              >
                <div className="relative flex shrink-0">
                  <span className={cn(
                    "flex size-11 items-center justify-center rounded-full text-sm font-bold transition-all duration-300",
                    active ? activeAvatarColors[colorIndex] : avatarColors[colorIndex]
                  )}>
                    {initialsOf(user.name)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-foreground transition-colors group-hover:text-primary">{user.name}</p>
                  <p className="truncate text-[11px] font-bold tracking-wider text-muted-foreground uppercase mt-0.5">{user.role}</p>
                </div>
                {user.adminScope && !active && (
                  <span
                    title={user.adminScope === "system" ? "System Administrator" : "Product Administrator"}
                    className={cn("shrink-0 transition-transform group-hover:scale-110", user.adminScope === "system" ? "text-amber-500" : "text-blue-500")}
                  >
                    <ShieldCheck className="size-5" />
                  </span>
                )}
                {active && <Check className="size-5 shrink-0 text-primary drop-shadow-sm" />}
              </button>
            );
          })}
          {users.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No users configured yet.
            </p>
          )}
        </div>
        <p className="text-center text-sm text-foreground/80 font-medium mt-2">
          Role-based access is enforced client-side in this preview environment.
        </p>
      </DialogContent>
    </Dialog>
  );
}
