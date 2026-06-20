export type PlanId = "hobby" | "pro" | "business" | "custom";
export type BillingInterval = "monthly" | "yearly";

export const CREDIT_COST_LABELS: Record<string, number> = {
  analyze: 7,
  clean: 14,
  feature_suggest: 17,
  feature_apply: 0,
  train_instant: 37,
  recommend: 10,
  export_pdf: 7,
  export_bundle: 20,
  forecast: 34,
  business_insights: 54,
  feature_engineer: 0,
};

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  description: string;
  monthlyCredits: number;
  maxFileMb: number;
  datasetsLabel: string;
  features: string[];
  buttonText: string;
  badge: string | null;
  popular: boolean;
}

export interface CustomCreditTier {
  credits: number;
  priceMonthly: number | null;
  priceYearly: number | null;
  contactSupport: boolean;
}

/** Main one-run path stays within the 200-credit free starter pack. */
export const STARTER_FULL_WORKFLOW_CREDITS = 200;

export const YEARLY_DISCOUNT_PERCENT = 17;

export const CUSTOM_PLAN_FEATURES = [
  "Starts at 5,000 credits per month",
  "Monthly and yearly billing options",
  "Up to 200 MB max file size per dataset",
  "Shared company workspace for your team",
  "Invite colleagues to one credit pool and dataset library",
  "Company admins can monitor team activity",
  "100k+ credits are handled with support-assisted setup",
] as const;

export const CUSTOM_CREDIT_TIERS: CustomCreditTier[] = [
  { credits: 5_000, priceMonthly: 125, priceYearly: 1245, contactSupport: false },
  { credits: 10_000, priceMonthly: 225, priceYearly: 2241, contactSupport: false },
  { credits: 25_000, priceMonthly: 500, priceYearly: 4980, contactSupport: false },
  { credits: 50_000, priceMonthly: 900, priceYearly: 8964, contactSupport: false },
  { credits: 100_000, priceMonthly: null, priceYearly: null, contactSupport: true },
];

export const PLANS: PlanDefinition[] = [
  {
    id: "hobby",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    description: "Try Acutize with starter credits before choosing a paid plan.",
    monthlyCredits: 200,
    maxFileMb: 10,
    datasetsLabel: "Up to 3 active datasets",
    features: [
      "200 credits one-time (until you upgrade)",
      "Enough credits to run every main workflow step once",
      "10 MB max file size, up to 20,000 rows per step",
      "Instant profile, EDA and quality views (free to browse)",
      "Pay credits only when you run a step (clean, suggest, train, etc.)",
      "Community support",
    ],
    buttonText: "Start for free",
    badge: null,
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 25,
    priceYearly: 249,
    description: "For practitioners running multiple datasets each month.",
    monthlyCredits: 500,
    maxFileMb: 30,
    datasetsLabel: "Up to 12 active datasets",
    features: [
      "500 credits per month",
      "Enough credits for multiple full workflow runs per month",
      "30 MB max file size, full file on pipeline steps",
      "Instant preview trains on 20k rows (all plans)",
      "All instant-preview models",
      "Generate features (save and CSV download included)",
      "PDF/ZIP export and model ideas on demand",
      "Standard email support",
    ],
    buttonText: "Upgrade to Pro",
    badge: "Most popular",
    popular: true,
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 70,
    priceYearly: 697,
    description: "Unlimited datasets and larger files within server-safe limits.",
    monthlyCredits: 2500,
    maxFileMb: 75,
    datasetsLabel: "Unlimited active datasets",
    features: [
      "2,500 credits per month",
      "Enough credits for high-volume workflow runs per month",
      "75 MB max file size, full file on pipeline steps",
      "Instant preview trains on 20k rows (all plans)",
      "Unlimited concurrent datasets",
      "Everything in Pro + Python full-training export script",
      "Priority email support",
    ],
    buttonText: "Upgrade to Business",
    badge: null,
    popular: false,
  },
];

export function formatPlanPrice(plan: PlanDefinition, interval: BillingInterval): {
  main: string;
  sub?: string;
} {
  if (plan.priceMonthly === 0) return { main: "$0" };
  if (interval === "yearly") {
    const perMonth = (plan.priceYearly / 12).toFixed(2);
    return {
      main: `$${plan.priceYearly}`,
      sub: `/yr (~$${perMonth}/mo, ${YEARLY_DISCOUNT_PERCENT}% off)`,
    };
  }
  return { main: `$${plan.priceMonthly}`, sub: "/mo" };
}

export const CREDIT_USAGE_ROWS = [
  { action: "Analyze / profile", credits: 7 },
  { action: "Clean and encode", credits: 14 },
  { action: "Generate features", credits: 17 },
  { action: "Instant model preview", credits: 37 },
  { action: "Model ideas", credits: 10 },
  { action: "Forecast future values", credits: 34 },
  { action: "Business insights", credits: 54 },
  { action: "PDF report", credits: 7 },
  { action: "ZIP export bundle", credits: 20 },
];
