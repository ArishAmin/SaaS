export type PlanId = "hobby" | "pro" | "business";
export type BillingInterval = "monthly" | "yearly";

export const CREDIT_COST_LABELS: Record<string, number> = {
  analyze: 2,
  clean: 3,
  feature_suggest: 4,
  feature_apply: 0,
  train_instant: 8,
  recommend: 2,
  export_pdf: 2,
  export_bundle: 4,
  forecast: 8,
  businessInsights: 16,
  feature_engineer: 4,
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

/** Generative path: suggest only; save + CSV download are free */
export const GENERATIVE_PIPELINE_CREDITS = 2 + 3 + 4 + 8 + 2; // analyze + clean + suggest + train + recommend = 19

export const YEARLY_DISCOUNT_PERCENT = 17;

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
    monthlyCredits: 60,
    maxFileMb: 10,
    datasetsLabel: "Up to 3 active datasets",
    features: [
      "60 credits one-time (until you upgrade)",
      "About 3 full pipeline runs on your starter pack",
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
    monthlyCredits: 450,
    maxFileMb: 30,
    datasetsLabel: "Up to 12 active datasets",
    features: [
      "450 credits per month",
      "About 23 generative pipeline runs per month",
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
      "About 130+ generative pipeline runs per month",
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
  { action: "Analyze / profile", credits: 2 },
  { action: "Clean and encode", credits: 3 },
  { action: "Generate features", credits: 4 },
  { action: "Instant model preview", credits: 8 },
  { action: "Model ideas", credits: 2 },
  { action: "Forecast future values", credits: 8 },
  { action: "Business insights", credits: 16 },
  { action: "PDF report", credits: 2 },
  { action: "ZIP export bundle", credits: 4 },
];
