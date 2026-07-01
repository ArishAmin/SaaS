"use client";

import React from "react";
import { Check, ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "hobby",
    name: "Free",
    price: "$0",
    description: "Try Acutize with starter credits before choosing a paid plan.",
    features: [
      "200 credits one-time (until you upgrade)",
      "Enough credits to run every main workflow step once",
      "10 MB max file size, up to 20,000 rows per step",
      "Up to 3 active datasets",
      "Instant profile, EDA and quality views",
      "Pay credits only when you run a step",
      "Community support",
    ],
    buttonText: "Start for Free",
    badge: null,
    popular: false,
    href: "/login?next=/pricing",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$25",
    period: "/mo",
    description: "For practitioners running multiple datasets each month.",
    features: [
      "500 credits per month",
      "Enough credits for multiple full workflow runs per month",
      "30 MB max file size, up to 100,000 rows per step",
      "Model training trains on up to 100K rows",
      "Up to 12 active datasets",
      "All model-training models",
      "Generate features, model ideas, PDF/ZIP export",
      "Standard email support",
    ],
    buttonText: "Get Pro Now",
    badge: "Most Popular",
    popular: true,
    href: "/login?next=/pricing",
  },
  {
    id: "business",
    name: "Business",
    price: "$70",
    period: "/mo",
    description: "Unlimited datasets and larger files within server-safe limits.",
    features: [
      "2,500 credits per month",
      "Enough credits for high-volume workflow runs per month",
      "75 MB max file size, up to 100,000 rows per step",
      "Model training trains on up to 100K rows",
      "Unlimited concurrent datasets",
      "Everything in Pro",
      "Python full-training export script",
      "Priority email support",
    ],
    buttonText: "Scale with Business",
    badge: null,
    popular: false,
    href: "/login?next=/pricing",
  },
];

interface PricingSectionProps {
  hideCTA?: boolean;
}

export function PricingSection({ hideCTA = false }: PricingSectionProps) {
  return (
    <section id="pricing" className="py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-indigo-500/5 blur-[120px] -z-10" />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-purple-500/5 blur-[120px] -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-zinc-900 dark:text-white">
            {hideCTA ? "Start free, upgrade when you need more" : "Simple, Transparent Pricing"}
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            {hideCTA
              ? "Free credits are enough to test the workflow. Paid plans add monthly credits, larger files, and more active datasets."
              : "Choose the plan that's right for your data journey. Start free, upgrade as you grow."}
          </p>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col p-8 rounded-3xl bg-white dark:bg-zinc-900 border transition-all duration-300",
                plan.popular
                  ? "border-indigo-500 shadow-xl shadow-indigo-500/10 scale-105 z-10"
                  : "border-zinc-200 dark:border-white/5",
                !hideCTA && "hover:translate-y-[-4px]"
              )}
            >
              {plan.badge && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">{plan.price}</span>
                  {plan.period && (
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">{plan.period}</span>
                  )}
                </div>
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <div className="flex-grow space-y-4 mb-2">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{feature}</span>
                  </div>
                ))}
              </div>

              {!hideCTA && (
                <div className="mt-8">
                  <Button
                    asChild
                    className={cn(
                      "w-full h-12 rounded-xl font-bold transition-all group",
                      plan.popular
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                        : "bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-900 dark:text-white"
                    )}
                  >
                    <Link href={plan.href}>
                      {plan.buttonText}
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          ))}

            {/* Custom / Team card */}
            <div
              className={cn(
                "relative flex flex-col p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 transition-all duration-300",
                !hideCTA && "hover:translate-y-[-4px]"
              )}
            >
              <div className="mb-6">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Custom / Team</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-zinc-900 dark:text-white">5k+</span>
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">credits/mo</span>
                </div>
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Higher monthly credit packages with an optional shared company workspace for your team.
                </p>
              </div>

              <div className="flex-grow space-y-4 mb-2">
                {[
                  "5,000 – 100,000+ credits per month",
                  "Shared company workspace for your team",
                  "Invite colleagues to one credit pool",
                  "Custom-level file limits (200 MB)",
                  "Unlimited active datasets",
                  "Company admins monitor team activity",
                  "Priority support",
                ].map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{feature}</span>
                  </div>
                ))}
              </div>

              {!hideCTA && (
                <div className="mt-8">
                  <Button
                    asChild
                    className="w-full h-12 rounded-xl font-bold transition-all group bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-900 dark:text-white"
                  >
                    <Link href="/login?next=/pricing">
                      View Custom Plans
                      <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
        </div>
        {!hideCTA && (
          <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Prices exclude applicable taxes. Sales tax, VAT, or similar charges may be added at checkout based on your
            region.
          </p>
        )}
      </div>
    </section>
  );
}
