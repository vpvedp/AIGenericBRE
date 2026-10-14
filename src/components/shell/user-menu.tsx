"use client";

import { signOut } from "@/lib/auth/client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, User, ChevronDown } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleSwitcherDialog } from "./role-switcher-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const user = useAppStore((s) => s.currentUser);
  const logout = useAppStore((s) => s.logout);
  const router = useRouter();
  const roleName = user.role;
  const [switcherOpen, setSwitcherOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button className="flex items-center gap-1.5 rounded-full outline-none transition-opacity hover:opacity-80" />}
          aria-label="Account menu"
        >
          <div className="flex items-center justify-center rounded-full border-2 border-white ring-2 ring-[#D0E4F5]">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                {user.initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <ChevronDown className="size-3.5 text-muted-foreground mr-1" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{user.name}</span>
                <span className="text-sm font-normal text-muted-foreground">{roleName}</span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSwitcherOpen(true)}>
            <ShieldCheck className="size-4" />
            Switch Role
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <User className="size-4" />
            My Profile (Phase 2)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              await signOut(); // clears the server session cookie
              logout();
              router.push("/login");
            }}
          >
            <LogOut className="size-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RoleSwitcherDialog open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </>
  );
}
