"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import { usePlan } from "@/components/providers/PlanProvider";
import { isBillingEnforcementEnabled } from "@/lib/billing";

const FREE_TIER_ROW_LIMIT = 20_000;

/** Free plan: pipeline steps use a row cap; paid plans use the full file. */
export function FreeTierRowLimitBanner() {
  const { plan, loading } = usePlan();
  const enforcement = isBillingEnforcementEnabled();

  if (!enforcement || loading || plan !== "hobby") return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-4 py-3 flex gap-3 text-sm text-slate-600 dark:text-slate-400">
      <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
      <p>
        On the free plan, this step works with up to{" "}
        <span className="text-slate-800 dark:text-slate-200">
          {FREE_TIER_ROW_LIMIT.toLocaleString()} rows
        </span>{" "}
        from your file.{" "}
        <Link href="/pricing" className="font-medium text-slate-800 dark:text-slate-200 hover:underline">
          Upgrade
        </Link>{" "}
        to process up to 100,000 rows on Pro or Business.
      </p>
    </div>
  );
}
