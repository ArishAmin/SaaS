"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import { usePlan } from "@/components/providers/PlanProvider";
import { isBillingEnforcementEnabled } from "@/lib/billing";

/** One brief disclaimer above instant preview. */
export function TrainingPlanBanner() {
  const { plan, loading } = usePlan();
  const enforcement = isBillingEnforcementEnabled();

  if (!enforcement || loading) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-4 py-3 flex gap-3 text-sm text-slate-600 dark:text-slate-400">
      <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p>
          Instant preview trains on a <span className="text-slate-800 dark:text-slate-200">row sample</span> of your
          dataset (up to {plan === "hobby" ? "20,000" : "100,000"} rows) so results stay fast on every plan.
        </p>
        {plan === "hobby" && (
          <p>
            Free tier includes basic preview models only.{" "}
            <Link href="/pricing" className="font-medium text-slate-800 dark:text-slate-200 hover:underline">
              Upgrade
            </Link>{" "}
            to unlock advanced models like Random Forest and XGBoost.
          </p>
        )}
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          ✨ Full dataset training coming soon for paid plans!
        </p>
      </div>
    </div>
  );
}
