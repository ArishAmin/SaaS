"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, ArrowRight, Loader2 } from "lucide-react";

import { apiRequest } from "@/lib/api";
import { isBillingEnforcementEnabled } from "@/lib/billing";
import { usePlan } from "@/components/providers/PlanProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BillingAccount = {
  plan: string;
  subscription_status: string;
  credits: {
    credits_balance: number;
    credits_quota: number;
    credits_refresh_mode: "one_time" | "monthly";
    credits_period_end: string | null;
  };
  plan_limits: {
    max_dataset_size_mb: number;
    max_concurrent_datasets: number | null;
    monthly_credits: number;
    allowed_models: string[];
    max_compute_seconds: number;
    support_priority: string;
    credits_refresh_mode: string;
  };
  data_limits?: {
    pipeline_max_rows: number;
    preview_max_rows: number;
    uses_full_dataset: boolean;
    max_columns: number;
  };
  credit_costs_table: Array<{ action: string; label: string; credits: number }>;
  transactions: Array<{
    id: string;
    action_label: string;
    credits_delta: number;
    balance_after: number;
    dataset_id: string | null;
    created_at: string;
  }>;
};

export default function CreditsSettingsPage() {
  const [data, setData] = useState<BillingAccount | null>(null);
  const { companyAccountEnabled } = usePlan();
  const enforcement = isBillingEnforcementEnabled();
  const [loading, setLoading] = useState(enforcement);

  useEffect(() => {
    if (!enforcement) {
      return;
    }
    apiRequest<BillingAccount>("/billing/account")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [enforcement]);

  if (!enforcement) {
    if (process.env.NODE_ENV !== "development") {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Usage & credits</CardTitle>
            <CardDescription>Sign in and enable billing to view usage.</CardDescription>
          </CardHeader>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage & credits</CardTitle>
          <CardDescription>Billing enforcement is off.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading account usage…
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Could not load billing data. Try again later.
        </CardContent>
      </Card>
    );
  }

  const { credits, plan_limits: limits } = data;
  const datasetsLabel =
    limits.max_concurrent_datasets == null
      ? "Unlimited"
      : String(limits.max_concurrent_datasets);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="h-7 w-7 text-blue-500" />
          Usage & credits
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track your balance, plan limits, and credit spend history.
        </p>
        {companyAccountEnabled ? (
          <p className="mt-2 text-sm">
            <Link href="/dashboard/company" className="text-blue-600 hover:underline dark:text-blue-400">
              Open company workspace →
            </Link>
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="capitalize">{data.plan} plan</CardTitle>
          
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Credits</p>
              <p className="text-3xl font-bold tabular-nums">
                {credits.credits_balance}
                <span className="text-lg font-normal text-muted-foreground">
                  {" "}/ {credits.credits_quota}
                </span>
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              {credits.credits_period_end ? (
                <p>Credits reset on {new Date(credits.credits_period_end).toLocaleDateString()}.</p>
              ) : (
                <p>Monthly credit refresh on your billing cycle.</p>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Max file size</p>
              <p className="font-semibold">{limits.max_dataset_size_mb} MB</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Active datasets</p>
              <p className="font-semibold">{datasetsLabel}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Instant preview models</p>
              <p className="font-semibold text-xs leading-relaxed">
                {limits.allowed_models.includes("all")
                  ? "All models"
                  : limits.allowed_models.join(", ")}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">Support</p>
              <p className="font-semibold capitalize">{limits.support_priority.replace("_", " ")}</p>
            </div>
            {data.data_limits ? (
              <>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Pipeline rows</p>
                  <p className="font-semibold">
                    {data.data_limits.uses_full_dataset
                      ? "Full file (server cap)"
                      : data.data_limits.pipeline_max_rows.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Instant preview rows</p>
                  <p className="font-semibold">{data.data_limits.preview_max_rows.toLocaleString()}</p>
                </div>
              </>
            ) : null}
          </div>

          {data.plan === "hobby" ? (
            <Button asChild>
              <Link href="/pricing">
                Upgrade for monthly credits <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/dashboard/settings">Manage subscription</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit costs</CardTitle>
          
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 px-4 font-medium">Action</th>
                  <th className="py-2 px-4 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {data.credit_costs_table.map((row) => (
                  <tr key={row.action} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{row.label}</td>
                    <td className="py-2.5 px-4 text-right font-medium tabular-nums text-slate-900 dark:text-white">
                      {row.credits === 0 ? "Free" : row.credits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>Recent credit usage on your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No credit activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium text-right">Change</th>
                    <th className="py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3">{tx.action_label}</td>
                      <td
                        className={`py-2.5 pr-3 text-right tabular-nums font-medium ${
                          tx.credits_delta < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600"
                        }`}
                      >
                        {tx.credits_delta > 0 ? "+" : ""}
                        {tx.credits_delta}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{tx.balance_after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
