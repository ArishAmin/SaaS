"use client";

import React, { useState } from "react";
import {
  Check,
  Zap,
  Coins,
  ArrowRight,
  Loader2,
  HelpCircle,
  Database,
  FileSpreadsheet,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { apiRequest } from "@/lib/api";
import { isBillingEnforcementEnabled } from "@/lib/billing";
import {
  CREDIT_USAGE_ROWS,
  GENERATIVE_PIPELINE_CREDITS,
  PLANS,
  YEARLY_DISCOUNT_PERCENT,
  formatPlanPrice,
  type BillingInterval,
  type PlanId,
} from "@/lib/plans";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const router = useRouter();

  const handleSelectPlan = async (planId: PlanId) => {
    if (!isBillingEnforcementEnabled() || planId === "hobby") {
      router.push("/dashboard");
      return;
    }

    setLoadingPlan(planId);
    try {
      const res = await apiRequest<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: {
          plan: planId,
          interval,
          success_url: `${window.location.origin}/dashboard?checkout=success`,
          cancel_url: `${window.location.origin}/pricing`,
        },
      });

      if (res.url) {
        window.location.href = res.url;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start checkout";
      toast.error(message);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar />

      <main className="flex-grow pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-medium mb-4">
              <Coins className="w-4 h-4" />
              Credits on demand
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
              Simple pricing for your data pipeline
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Credits are spent only when you run a step
              (analyze, clean, suggest features, train preview, etc.). A typical generative run ≈{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {GENERATIVE_PIPELINE_CREDITS} credits
              </strong>
              .
            </p>

            <div className="inline-flex mt-6 p-1 rounded-full bg-slate-200 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setInterval("monthly")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-semibold transition-colors",
                  interval === "monthly"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow"
                    : "text-slate-600 dark:text-slate-400"
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval("yearly")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-semibold transition-colors",
                  interval === "yearly"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow"
                    : "text-slate-600 dark:text-slate-400"
                )}
              >
                Yearly ({YEARLY_DISCOUNT_PERCENT}% off)
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {PLANS.map((plan) => {
              const priced = formatPlanPrice(plan, interval);
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col p-8 rounded-3xl bg-white dark:bg-slate-900 border ${plan.popular
                    ? "border-blue-500 shadow-xl shadow-blue-500/10 md:scale-105 z-10"
                    : "border-slate-200 dark:border-slate-800"
                    } transition-all duration-300 hover:translate-y-[-4px]`}
                >
                  {plan.badge && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      {plan.badge}
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{plan.name}</h3>
                    <div className="flex flex-col items-start gap-0.5">
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                          {priced.main}
                        </span>
                        {priced.sub && (
                          <span className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                            {priced.sub}
                          </span>
                        )}
                      </div>
                      {plan.id !== "hobby" && interval === "yearly" && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Save ${plan.priceMonthly * 12 - plan.priceYearly}/year vs monthly
                        </p>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {plan.monthlyCredits.toLocaleString()} credits / month
                    </p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {plan.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
                        <FileSpreadsheet className="w-3 h-3" />
                        {plan.maxFileMb} MB max file
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
                        <Database className="w-3 h-3" />
                        {plan.datasetsLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex-grow space-y-3 mb-8">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-300">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={!!loadingPlan}
                    className={`w-full py-4 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group ${plan.popular
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loadingPlan === plan.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        {plan.id === "hobby"
                          ? plan.buttonText
                          : interval === "yearly"
                            ? `${plan.buttonText} (yearly)`
                            : plan.buttonText}
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="max-w-3xl mx-auto mb-16 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 md:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Credit costs per action
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {CREDIT_USAGE_ROWS.map((row) => (
                    <tr
                      key={row.action}
                      className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">{row.action}</td>
                      <td className="py-2.5 text-right font-medium text-slate-900 dark:text-white">
                        {row.credits === 0 ? "Free" : row.credits}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center">
              Frequently asked questions
            </h2>
            {[
              {
                q: "How do Generate features and Model ideas differ?",
                a: "Generate features (4 credits) suggests new columns from your data; saving and CSV download are free. Model ideas (2 credits) recommends algorithms, not new columns.",
              },
              {
                q: "What happens if I run out of credits?",
                a: "Free tier gets 60 credits once (not monthly). Paid plans refill every 30 days. Opening pages and viewing cached analysis does not spend credits — you'll see an upgrade prompt if an action needs more credits.",
              },
              {
                q: "How do yearly plans work?",
                a: `Pro is $249/year and Business is $697/year (${YEARLY_DISCOUNT_PERCENT}% off vs paying monthly). You still receive the same monthly credit quota.`,
              },
              {
                q: "Is full model training included?",
                a: "Instant preview runs in the cloud (8 credits). Full training is a Python script you run locally—no extra cloud training charge.",
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <h4 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white mb-2">
                  <HelpCircle className="w-4 h-4 text-blue-500" />
                  {faq.q}
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
