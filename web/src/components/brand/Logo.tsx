import Link from "next/link";

import { cn } from "@/lib/utils";

type LogoProps = {
  href?: string;
  variant?: "full" | "mark";
  className?: string;
  wordmarkClassName?: string;
  markClassName?: string;
};

/** Minimal brand mark — ascending data bars + pilot arrow. Theme-aware via currentColor. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-9 w-9 shrink-0", className)}
      aria-hidden
    >
      <rect
        width="32"
        height="32"
        rx="8"
        className="fill-zinc-900 dark:fill-white"
      />
      <rect x="7" y="17" width="4" height="8" rx="1.2" className="fill-indigo-500/50" />
      <rect x="14" y="12" width="4" height="13" rx="1.2" className="fill-indigo-500/75" />
      <rect x="21" y="7" width="4" height="18" rx="1.2" className="fill-indigo-400" />
      <path
        d="M23 7h5v5"
        className="stroke-white dark:stroke-zinc-900"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28 7 23 12"
        className="stroke-white dark:stroke-zinc-900"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  variant = "full",
  className,
  wordmarkClassName,
  markClassName,
}: LogoProps) {
  const inner = (
    <>
      <LogoMark className={markClassName} />
      {variant === "full" ? (
        <span
          className={cn(
            "font-bold text-xl tracking-tight bg-clip-text text-transparent bg-linear-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-400",
            wordmarkClassName
          )}
        >
          Acutize
        </span>
      ) : null}
    </>
  );

  if (!href) {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>{inner}</div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 group transition-opacity hover:opacity-90",
        className
      )}
    >
      {inner}
    </Link>
  );
}

/** Compact lockup for auth pages and dashboard sidebar. */
export function LogoLockup({
  href = "/",
  title = "Acutize",
  subtitle,
  className,
}: {
  href?: string;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foreground/25",
        className
      )}
    >
      <LogoMark />
      <div className="min-w-0">
        <p className="text-sm text-foreground/70 leading-none">{title}</p>
        {subtitle ? (
          <p className="text-base font-semibold leading-tight truncate">{subtitle}</p>
        ) : null}
      </div>
    </Link>
  );
}
