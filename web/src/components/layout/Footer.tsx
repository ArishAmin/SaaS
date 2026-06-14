import Link from "next/link";

import { LogoMark } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="w-full mt-auto border-t border-zinc-200/50 dark:border-white/10 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-col items-center md:items-start gap-2">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <p className="font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Acutize
            </p>
          </div>
          <p>© {new Date().getFullYear()} All rights reserved.</p>
        </div>
        
        <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-2 font-medium">
          <Link href="/terms" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Terms of Service
          </Link>
          <Link href="/privacy" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Privacy Policy
          </Link>
          <Link href="/help" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Help Center
          </Link>
          <Link href="/dashboard/contact" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
            Contact Us
          </Link>
        </div>
      </div>
    </footer>
  );
}
