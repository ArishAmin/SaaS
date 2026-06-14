"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  LineChart,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Table2,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

const capabilityGroups = [
  {
    icon: FileSpreadsheet,
    title: "Dataset upload and profiling",
    description:
      "Upload CSV, Excel, JSON, or Parquet files and inspect rows, columns, data types, missing values, duplicates, and quality signals before taking action.",
  },
  {
    icon: Wand2,
    title: "No-code cleaning workflow",
    description:
      "Clean common dataset problems with guided options for missing values, duplicates, categorical encoding, scaling, and repeatable preparation steps.",
  },
  {
    icon: BarChart3,
    title: "Business insights and EDA",
    description:
      "Generate charts, summaries, patterns, and business-friendly recommendations that help teams understand what the data is saying.",
  },
  {
    icon: Sparkles,
    title: "Generated feature suggestions",
    description:
      "Discover useful derived columns, review the expected impact, choose what to keep, and save an engineered dataset for modeling or export.",
  },
  {
    icon: LineChart,
    title: "Forecasting and model previews",
    description:
      "Preview model direction, compare useful metrics, review feature-importance signals, and forecast dated business metrics from your uploaded data.",
  },
  {
    icon: Download,
    title: "Reports and export bundles",
    description:
      "Download cleaned datasets, engineered files, PDF reports, Python training scripts, and ZIP bundles for review, handoff, or internal records.",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Upload a business dataset",
    detail: "Start with a tabular file from operations, sales, marketing, finance, support, or research.",
  },
  {
    step: "02",
    title: "Understand the current state",
    detail: "Review schema, quality issues, distributions, missing values, duplicates, and early insights.",
  },
  {
    step: "03",
    title: "Prepare the data",
    detail: "Clean, encode, scale, and create useful derived features with visible choices before export.",
  },
  {
    step: "04",
    title: "Analyze, forecast, or model",
    detail: "Use the prepared dataset for insight generation, forecasting, quick model previews, and reports.",
  },
  {
    step: "05",
    title: "Export what the team needs",
    detail: "Download files, reports, scripts, or bundles so the output can move into your next workflow.",
  },
];

const demoTours = [
  {
    title: "Analyze dataset quality",
    description:
      "See how Acutize profiles a dataset, surfaces missing values, identifies column types, and helps you choose the next step.",
    highlights: ["File preview", "Quality summary", "Column-level signals"],
    metric: "93%",
    metricLabel: "quality score",
    icon: Table2,
    videoSrc: "/demos/analyze-quality.mp4",
  },
  {
    title: "Clean and prepare data",
    description:
      "Walk through guided cleaning settings for missing values, duplicates, category handling, and numeric scaling.",
    highlights: ["Cleaning controls", "Processed copy", "Download-ready CSV"],
    metric: "18",
    metricLabel: "columns prepared",
    icon: ClipboardCheck,
    videoSrc: "/demos/clean-prepare.mp4",
  },
  {
    title: "Generate business insights",
    description:
      "Review dashboard-style charts, plain-English findings, and recommendations generated from uploaded data.",
    highlights: ["EDA charts", "Business summary", "PDF report"],
    metric: "12",
    metricLabel: "insights found",
    icon: BarChart3,
    videoSrc: "/demos/business-insights.mp4",
  },
  {
    title: "Compare model performance",
    description:
      "Compare model candidates, review score differences, and inspect the features that most influenced the preview.",
    highlights: ["Model comparison", "Score review", "Feature importance"],
    metric: "4",
    metricLabel: "models compared",
    icon: LineChart,
    videoSrc: "/demos/forecast-models.mp4",
  },
];

const sampleOutputs = [
  "Cleaned dataset CSV",
  "Engineered dataset CSV",
  "Business insights PDF",
  "Forecast result",
  "Model comparison report",
  "Python training script",
];

const landingPlans = [
  {
    name: "Free",
    price: "$0",
    description: "For trying Acutize with a real dataset before choosing a paid plan.",
    features: [
      "Upload and inspect supported tabular files",
      "Analyze data quality and column structure",
      "Try the core cleaning and insight workflow",
      "Download selected outputs",
    ],
    href: "/signup",
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$25",
    period: "/mo",
    description: "For practitioners who work with multiple datasets and need more room to operate.",
    features: [
      "Larger files and more active datasets",
      "Full workflow access for cleaning and insights",
      "Model previews, generated features, and reports",
      "Standard email support",
    ],
    href: "/pricing",
    cta: "View Pro",
    featured: true,
  },
  {
    name: "Business",
    price: "$70",
    period: "/mo",
    description: "For teams that need higher-volume workspace capacity and priority support.",
    features: [
      "Largest supported files and unlimited active datasets",
      "Everything in Pro",
      "Python full-training export script",
      "Priority email support",
    ],
    href: "/pricing",
    cta: "View Business",
  },
];

const faqs = [
  {
    q: "Can I understand Acutize without creating an account?",
    a: "Yes. The public page explains the main workflow, supported file types, core capabilities, sample outputs, data handling, and common use cases before signup.",
  },
  {
    q: "Is Acutize a replacement for a data science team?",
    a: "No. Acutize is designed to help teams move faster on common data preparation, exploration, forecasting, and model-preview tasks. Critical business decisions should still be reviewed by qualified people.",
  },
  {
    q: "What kind of datasets work best?",
    a: "Acutize works best with structured tabular datasets such as CSV, Excel, JSON, and Parquet files that contain business metrics, categories, dates, targets, or operational records.",
  },
  {
    q: "How is uploaded data handled?",
    a: "Uploaded datasets and generated outputs stay tied to the authenticated account. They are kept to support the active workspace and are removed by the published retention policy when they are no longer active.",
  },
];

function ProductPreview() {
  return (
    <div className="border border-zinc-200 bg-white shadow-2xl shadow-zinc-900/10 dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-white/10">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Acutize workspace</p>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Customer churn dataset</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Ready to analyze
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03] lg:border-b-0 lg:border-r">
          {["Data Hub", "Analyze", "Clean & Encode", "Business Insights", "Train Models", "Forecasting", "Export"].map(
            (item, index) => (
              <div
                key={item}
                className={`mb-2 flex items-center gap-2 px-3 py-2 text-sm ${
                  index === 1
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {item}
              </div>
            )
          )}
        </aside>
        <div className="p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Rows", "18,420"],
              ["Columns", "28"],
              ["Missing cells", "2.8%"],
            ].map(([label, value]) => (
              <div key={label} className="border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="mt-2 text-2xl font-bold text-zinc-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 border border-zinc-200 dark:border-white/10">
            <div className="grid grid-cols-4 border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
              {["Column", "Type", "Quality", "Signal"].map((head) => (
                <div key={head} className="px-3 py-2">
                  {head}
                </div>
              ))}
            </div>
            {[
              ["monthly_spend", "number", "98%", "Strong"],
              ["tenure_months", "number", "100%", "Useful"],
              ["support_tickets", "number", "91%", "Review"],
              ["contract_type", "category", "96%", "Useful"],
            ].map((row) => (
              <div
                key={row[0]}
                className="grid grid-cols-4 border-b border-zinc-100 text-xs text-zinc-700 last:border-b-0 dark:border-white/5 dark:text-zinc-300"
              >
                {row.map((cell) => (
                  <div key={cell} className="px-3 py-3">
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="border border-zinc-200 p-4 dark:border-white/10">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Recommended next step</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Clean missing support ticket values and review category encoding before model preview.
              </p>
            </div>
            <div className="flex items-center justify-center bg-zinc-900 p-4 text-center text-white dark:bg-white dark:text-zinc-950">
              <div>
                <p className="text-3xl font-bold">4</p>
                <p className="text-xs">issues to review</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-[#050505] dark:text-zinc-50 selection:bg-emerald-500/25">
      <Navbar />

      <main className="pt-16">
        <section className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
            <div className="flex flex-col justify-center">
              <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                AI data workspace for business teams
              </p>
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-5xl lg:text-6xl">
                Clean, analyze, forecast, and report on datasets without writing scripts.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                Acutize helps teams turn raw tabular files into clean datasets, business insights, model previews,
                forecasts, and export-ready reports from one secure browser workspace.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="h-12 rounded-lg bg-zinc-900 px-6 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200" asChild>
                  <Link href="/signup">
                    Start free <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 rounded-lg border-zinc-300 bg-white px-6 dark:border-white/15 dark:bg-transparent" asChild>
                  <Link href="#pricing">
                    View pricing <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 text-sm text-zinc-600 dark:text-zinc-300 sm:grid-cols-3">
                {["No credit card to start", "CSV, Excel, JSON, Parquet", "Downloadable outputs"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Capabilities
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
                Everything a buyer should understand before logging in.
              </h2>
              <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                Acutize brings data preparation, exploration, forecasting, model previews, and exports into one
                practical workspace for business datasets.
              </p>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {capabilityGroups.map((item) => (
                <div key={item.title} className="border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
                  <item.icon className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
                  <h3 className="mt-5 text-lg font-semibold text-zinc-950 dark:text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-zinc-200 bg-zinc-50 py-20 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  Product workflow
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
                  From raw file to useful output in one guided flow.
                </h2>
                <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                  Acutize is built for teams that need practical results: better data, clearer insights, exportable
                  files, and faster model exploration.
                </p>
              </div>
              <div className="grid gap-3">
                {workflowSteps.map((item) => (
                  <div key={item.step} className="grid gap-4 border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#050505] sm:grid-cols-[72px_1fr]">
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{item.step}</div>
                    <div>
                      <h3 className="font-semibold text-zinc-950 dark:text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="demo-videos" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  Demo videos
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
                  Short product tours for the most important workflows.
                </h2>
                <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                  These guided previews use Acutize-style product screens to show the real capabilities available in
                  the platform. Exact layouts may evolve as the product improves, but the workflows and outputs shown
                  here reflect what Acutize is built to help you do.
                </p>
              </div>
              <Button variant="outline" className="h-11 rounded-lg border-zinc-300 dark:border-white/15" asChild>
                <Link href="/help">Open Help Center</Link>
              </Button>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              {demoTours.map((demo) => (
                <div key={demo.title} className="border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950">
                  <div className="border-b border-zinc-200 bg-zinc-900 text-white dark:border-white/10">
                    <div className="relative">
                      <video
                        aria-label={`${demo.title} product demo`}
                        className="aspect-video w-full bg-zinc-950 object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                        preload="metadata"
                      >
                        <source src={demo.videoSrc} type="video/mp4" />
                      </video>
                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                        <div className="flex items-center gap-3 bg-zinc-950/85 px-4 py-3 backdrop-blur">
                          <demo.icon className="h-5 w-5 text-emerald-300" />
                          <h3 className="text-base font-semibold">{demo.title}</h3>
                        </div>
                        <div className="hidden border border-white/15 bg-zinc-950/85 p-3 text-right backdrop-blur sm:block">
                          <p className="text-2xl font-bold">{demo.metric}</p>
                          <p className="text-xs text-zinc-300">{demo.metricLabel}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{demo.description}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {demo.highlights.map((item) => (
                        <span key={item} className="border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-zinc-200 bg-zinc-50 py-20 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Pricing
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
                Start free, then choose the workspace size that fits your team.
              </h2>
              <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                Plans are designed around dataset size, active workspace capacity, export needs, and support level.
                Detailed limits are available on the pricing page.
              </p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {landingPlans.map((plan) => (
                <div
                  key={plan.name}
                  className={`flex flex-col border bg-white p-6 dark:bg-[#050505] ${
                    plan.featured
                      ? "border-emerald-600 shadow-xl shadow-emerald-900/10 dark:border-emerald-400"
                      : "border-zinc-200 dark:border-white/10"
                  }`}
                >
                  {plan.featured && (
                    <div className="mb-5 w-fit bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">
                      Popular
                    </div>
                  )}
                  <h3 className="text-xl font-semibold text-zinc-950 dark:text-white">{plan.name}</h3>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-bold text-zinc-950 dark:text-white">{plan.price}</span>
                    {plan.period && <span className="pb-1 text-sm text-zinc-500 dark:text-zinc-400">{plan.period}</span>}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{plan.description}</p>
                  <div className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className={`mt-8 h-11 rounded-lg ${
                      plan.featured
                        ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        : "bg-zinc-100 text-zinc-950 hover:bg-zinc-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    }`}
                    asChild
                  >
                    <Link href={plan.href}>
                      {plan.cta} <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="outputs" className="border-y border-zinc-200 bg-zinc-50 py-20 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Sample outcomes
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
                Know exactly what you can take away from Acutize.
              </h2>
              <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                Buyers should not have to guess what the platform produces. Acutize creates practical artifacts that
                can be reviewed, downloaded, and shared with a team.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {sampleOutputs.map((item) => (
                <div key={item} className="flex items-center gap-3 border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#050505]">
                  <Download className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="why-acutize" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-3">
              {[
                {
                  icon: Database,
                  title: "Built around the latest dataset state",
                  text: "Acutize keeps the latest uploaded, cleaned, engineered, and generated outputs available inside the workspace so users can continue where they left off.",
                },
                {
                  icon: ShieldCheck,
                  title: "Clear retention posture",
                  text: "Datasets and generated reports are retained for active workspace use and removed under the published retention policy after inactivity.",
                },
                {
                  icon: LockKeyhole,
                  title: "Private account access",
                  text: "Dataset records and exports are tied to the authenticated account. Public marketing content should never imply that customer datasets are sold or exposed.",
                },
              ].map((item) => (
                <div key={item.title} className="border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
                  <item.icon className="h-6 w-6 text-emerald-700 dark:text-emerald-300" />
                  <h3 className="mt-5 text-lg font-semibold text-zinc-950 dark:text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-zinc-200 bg-zinc-50 py-20 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Buyer FAQ
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
                Questions visitors ask before signing up.
              </h2>
            </div>
            <div className="mt-10 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-white/10 dark:border-white/10">
              {faqs.map((item) => (
                <div key={item.q} className="py-6">
                  <h3 className="font-semibold text-zinc-950 dark:text-white">{item.q}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
              See what Acutize can do with your first dataset.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
              Start with a real business file, inspect the data, clean what needs fixing, and export the results when
              they are ready.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-12 rounded-lg bg-zinc-900 px-6 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200" asChild>
                <Link href="/signup">
                  Start free <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 rounded-lg border-zinc-300 bg-white px-6 dark:border-white/15 dark:bg-transparent" asChild>
                <Link href="/help">Read Help Center</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
