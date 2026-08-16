import Link from "next/link";

import { LogoMark } from "@/components/brand/Logo";

const groups = [
  {
    title: "Product",
    links: [
      { href: "/ai-data-cleaning", label: "AI data cleaning" },
      { href: "/data-quality-analysis", label: "Data quality analysis" },
      { href: "/automated-eda", label: "Automated EDA" },
      { href: "/no-code-machine-learning", label: "No-code machine learning" },
      { href: "/business-data-forecasting", label: "Forecasting" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/csv-data-cleaning", label: "CSV data cleaning" },
      { href: "/use-cases/data-analysts", label: "For data analysts" },
      { href: "/use-cases/operations-teams", label: "For operations teams" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/security", label: "Security" },
      { href: "/help", label: "Help Center" },
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-zinc-200/50 py-12 dark:border-white/10">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 text-sm text-zinc-500 dark:text-zinc-400 sm:px-6 md:grid-cols-[1.3fr_2fr] lg:px-8">
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <p className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Acutize</p>
          </div>
          <p className="max-w-xs leading-6">
            Guided data cleaning, analysis, forecasting, and model exploration for structured business datasets.
          </p>
          <p>© {new Date().getFullYear()} All rights reserved.</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{group.title}</h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="transition hover:text-blue-700 dark:hover:text-blue-300">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
