"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function Navbar() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const isPricingPage = pathname === "/pricing";

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const refreshLoginState = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
    };

    refreshLoginState();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshLoginState();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-zinc-200/50 bg-white/70 backdrop-blur-xl dark:border-white/5 dark:bg-black/50">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo href="/" markClassName="h-10 w-10 group-hover:scale-105 transition-transform" />
        
        {!(isPricingPage || (isLoggedIn && (pathname === "/help" || pathname === "/contact"))) && (
          <nav className="hidden items-center gap-10 text-sm font-medium text-zinc-500 dark:text-zinc-400 md:flex">
            <Link href="/#features" className="transition hover:text-indigo-600 dark:hover:text-indigo-400">
              Capabilities
            </Link>
            <Link href="/#how-it-works" className="transition hover:text-indigo-600 dark:hover:text-indigo-400">
              Workflow
            </Link>
            <Link href="/#demo-videos" className="transition hover:text-indigo-600 dark:hover:text-indigo-400">
              Demos
            </Link>
            <Link href="/#pricing" className="transition hover:text-indigo-600 dark:hover:text-indigo-400">
              Pricing
            </Link>
            <Link href="/#why-acutize" className="transition hover:text-indigo-600 dark:hover:text-indigo-400">
              Security
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="h-6 w-px bg-zinc-200 dark:bg-white/10 hidden sm:block" />
          
          {isLoggedIn === null ? (
            <div className="w-20 h-8 bg-zinc-100 dark:bg-white/5 animate-pulse rounded-full" />
          ) : isLoggedIn ? (
            <Button size="sm" className="rounded-full px-5 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-black border-none shadow-lg" asChild>
              <Link href="/dashboard">
                <LayoutGrid className="mr-1.5 h-4 w-4" />
                Dashboard
              </Link>
            </Button>
          ) : !isPricingPage ? (
            <>
              <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hidden sm:block">
                Log in
              </Link>
              <Button size="sm" className="rounded-full px-5 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500 dark:hover:bg-indigo-600 border-none shadow-lg shadow-indigo-500/20" asChild>
                <Link href="/signup">
                  Start Free
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : (
             <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                Log in
              </Link>
          )}
        </div>
      </div>
    </header>
  );
}
