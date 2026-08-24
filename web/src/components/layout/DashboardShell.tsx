"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  Download,
  LayoutGrid,
  LogOut,
  Mail,
  Sparkles,
  Settings,
  Wand2,
  LineChart,
  ListChecks,
  FlaskConical,
  CreditCard,
  CalendarClock,
  PieChart,
  HelpCircle,
  Building2,
  Lock,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

import { LogoLockup, LogoMark } from "@/components/brand/Logo";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isBillingEnforcementEnabled } from "@/lib/billing";
import { usePlan } from "@/components/providers/PlanProvider";

type UserLite = { id: string; name?: string | null; email?: string | null };

type NavItem = { 
  href: string; 
  label: string; 
  icon: ComponentType<{ className?: string }>;
  onClick?: (e: React.MouseEvent) => void;
  locked?: boolean;
};

const pipelineNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/analyzer", label: "Analyze & Explore", icon: LineChart },
  { href: "/dashboard/cleaning", label: "Clean & Encode", icon: ListChecks },
  { href: "/dashboard/business-insights", label: "Business Insights", icon: PieChart },
  { href: "/dashboard/feature-generation", label: "Generate Features", icon: Wand2 },
  { href: "/dashboard/recommendation", label: "Model Ideas", icon: Sparkles },
  { href: "/dashboard/training", label: "Train Models", icon: FlaskConical },
  { href: "/dashboard/forecasting", label: "Forecasting", icon: CalendarClock },
  { href: "/dashboard/export", label: "Export", icon: Download },
];

const moreNav: NavItem[] = [
  { href: "/dashboard/settings/credits", label: "Usage & credits", icon: CreditCard },
  { href: "/pricing", label: "Pricing", icon: Sparkles },
  { href: "/help", label: "Help", icon: HelpCircle },
  { href: "/contact", label: "Contact Us", icon: Mail },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={(e) => {
                if (item.onClick) item.onClick(e);
                if (onNavigate && !e.defaultPrevented) onNavigate();
              }}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="leading-snug flex-1">{item.label}</span>
              {item.locked && <Lock className="h-3.5 w-3.5 opacity-40 shrink-0" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { companyAccountEnabled } = usePlan();

  const generalNav: NavItem[] = [
    {
      href: companyAccountEnabled ? "/dashboard/company" : "#",
      label: "Company workspace",
      icon: Building2,
      locked: !companyAccountEnabled,
      onClick: !companyAccountEnabled
        ? (e) => {
            e.preventDefault();
            toast("Company workspaces are included with custom plans only.", {
              action: { label: "Upgrade", onClick: () => router.push("/pricing") },
            });
          }
        : undefined,
    },
    ...moreNav,
  ];

  const [user, setUser] = useState<UserLite | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;
    supabase.auth
      .getUser()
      .then((result: { data: { user: User | null } }) => {
        if (!mounted) return;
        if (result.data.user) {
          setUser({
            id: result.data.user.id,
            name: (result.data.user.user_metadata?.full_name as string | undefined) ?? null,
            email: result.data.user.email,
          });
        }
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;
      if (session?.user) {
        setUser({
          id: session.user.id,
          name: (session.user.user_metadata?.full_name as string | undefined) ?? null,
          email: session.user.email,
        });
      } else {
        setUser(null);
      }
    });

    const loadUser = async () => {
      if (!mounted) return;
      const { data } = await supabase.auth.getUser();
      if (data.user && mounted) {
        setUser({
          id: data.user.id,
          name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
          email: data.user.email,
        });
      }
    };

    const handleProfileUpdate = () => {
      void loadUser();
    };

    window.addEventListener("acutize:profile-updated", handleProfileUpdate);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      window.removeEventListener("acutize:profile-updated", handleProfileUpdate);
    };
  }, []);

  async function onLogout() {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/login");
  }

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="hidden md:block">
        <div className="flex">
          <aside className="w-64 border-r border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/20 backdrop-blur min-h-screen flex flex-col">
            <div className="p-4 flex items-center justify-between">
              <LogoLockup href="/dashboard" subtitle="Workspace" />
            </div>

            <nav className="px-3 pb-4 space-y-4 flex-1">
              <div>
                <p className="px-3 mb-2 text-xs text-foreground/55 leading-relaxed">
                  Upload your dataset and unlock powerful tools to clean, transform, and analyze your data.
                </p>
                <NavLinks items={pipelineNav} pathname={pathname} />
              </div>
              <div>
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                  General
                </p>
                <NavLinks items={generalNav} pathname={pathname} />
              </div>
            </nav>

            <div className="px-4 pb-4 border-t border-black/5 dark:border-white/5 pt-4">
              <PlanIndicator />
              
              <div className="flex items-center justify-between gap-3 mt-4">
                <div className="min-w-0">
                  <p className="text-[10px] text-foreground/50 uppercase font-bold tracking-tighter">Signed in as</p>
                  <p className="truncate text-sm font-medium">{user?.name || "Loading..."}</p>
                  <p className="truncate text-xs text-foreground/65">{user?.email ? user.email : ""}</p>
                </div>
                <ThemeToggle />
              </div>
              
              <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="mt-3 w-full" disabled={!user}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you sure you want to logout?</DialogTitle>
                    <DialogDescription>
                      You will need to login again to access your datasets and models.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button 
                      variant="destructive"
                      onClick={onLogout}
                      className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600"
                    >
                      Logout
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </aside>

          <main className="flex-1 p-4 md:p-6 flex flex-col justify-between overflow-x-hidden min-h-screen">
            <div>{children}</div>
            <DashboardFooter />
          </main>
        </div>
      </div>

      <div className="md:hidden">
        <header className="sticky top-0 z-30 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/50 backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Toggle navigation"
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
              <LogoMark className="h-8 w-8" />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Dialog open={isLogoutOpen} onOpenChange={setIsLogoutOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="p-2" disabled={!user}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Logout?</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to end your session?
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button 
                      variant="destructive"
                      onClick={onLogout}
                      className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600"
                    >
                      Logout
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="mt-1">
            <p className="text-sm font-medium truncate">{user?.name ?? "Loading..."}</p>
            <p className="text-xs text-foreground/70 truncate">{user?.email ?? ""}</p>
          </div>
        </header>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/30" onClick={closeMobile} aria-hidden />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white/95 dark:bg-black/90 border-r border-black/10 dark:border-white/10 p-4 overflow-auto">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Menu</p>
                <Button variant="ghost" size="sm" onClick={closeMobile}>
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                    Pipeline
                  </p>
                  <NavLinks items={pipelineNav} pathname={pathname} onNavigate={closeMobile} />
                </div>
                <div>
                  <p className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                    General
                  </p>
                  <NavLinks items={generalNav} pathname={pathname} onNavigate={closeMobile} />
                </div>
              </div>
              <div className="mt-8 border-t border-black/5 dark:border-white/5 pt-4">
                 <PlanIndicator />
              </div>
            </div>
          </div>
        ) : null}

        <main className="p-4 flex flex-col justify-between min-h-[calc(100vh-64px)] overflow-x-hidden">
          <div>{children}</div>
          <DashboardFooter />
        </main>
      </div>
    </div>
  );
}

function DashboardFooter() {
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-black/10 py-6 text-xs text-foreground/60 dark:border-white/10">
      <Link href="/help" className="hover:text-foreground">Help Center</Link>
      <Link href="/contact" className="hover:text-foreground">Contact Support</Link>
      <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
      <Link href="/terms" className="hover:text-foreground">Terms</Link>
      <span>{"\u00a9"} Acutize</span>
    </footer>
  );
}

function PlanIndicator() {
  const { plan, loading, creditsBalance, creditsQuota } = usePlan();
  const enforcement = isBillingEnforcementEnabled();
  const low = enforcement && creditsQuota > 0 && creditsBalance <= Math.max(5, creditsQuota * 0.15);

  if (loading) return null;
  if (!enforcement) return null;

  return (
    <div
      className={cn(
        "block p-4 rounded-xl border transition-colors",
        low
          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
          : "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/20"
      )}
    >
      <Link href="/dashboard/settings/credits" className="block group">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Credits
          </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
              plan === "hobby"
                ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                : "bg-blue-600 text-white"
            )}
          >
            {plan}
          </span>
        </div>
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-none">
          {creditsBalance}
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/{creditsQuota}</span>
        </p>
        
        {plan !== "hobby" && (
          low ? (
            <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1.5 font-medium group-hover:underline">Running low — view usage</p>
          ) : (
            <p className="text-[10px] text-slate-500 mt-1.5 group-hover:underline">Usage & history</p>
          )
        )}
      </Link>

      {plan === "hobby" && (
        <div className="mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/5 flex gap-2">
          <Link
            href="/dashboard/settings/credits"
            className="flex-1 text-center py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Usage
          </Link>
          <Link
            href="/pricing"
            className="flex-1 text-center py-1.5 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
          >
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
}
