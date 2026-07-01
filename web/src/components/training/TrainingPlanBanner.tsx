"use client";

import Link from "next/link";
import { Info, Sparkles } from "lucide-react";

import { usePlan } from "@/components/providers/PlanProvider";
import { isBillingEnforcementEnabled } from "@/lib/billing";

/** One brief disclaimer above model training. */
export function TrainingPlanBanner() {
  const { plan, loading } = usePlan();
  const enforcement = isBillingEnforcementEnabled();

  if (!enforcement || loading) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border-2 border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 md:p-6 flex items-start gap-4">
        <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-indigo-900 dark:text-indigo-300 mb-1">
            Full Dataset Training — Coming Soon
          </h3>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            We're rolling out the ability for paid plans to train machine learning models on your entire dataset with no row limits. Stay tuned!
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 px-4 py-3 flex gap-3 text-sm text-slate-600 dark:text-slate-400">
        <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Model training currently runs on a <span className="text-slate-800 dark:text-slate-200">row sample</span> of your
            dataset (up to 20,000 rows for free tier and up to 100,000 rows for paid plans) so results stay fast.
          </p>
          {plan === "hobby" && (
            <p>
              Free tier includes basic models only.{" "}
              <Link href="/pricing" className="font-medium text-slate-800 dark:text-slate-200 hover:underline">
                Upgrade
              </Link>{" "}
              to unlock advanced models like Random Forest and XGBoost.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
