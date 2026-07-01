import Link from "next/link";
import {
  BarChart3,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  Download,
  FileQuestion,
  FileSpreadsheet,
  HelpCircle,
  Lightbulb,
  LockKeyhole,
  Mail,
  PieChart,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";

import { Footer } from "@/components/layout/Footer";
import { HelpHeroActions } from "@/components/help/HelpHeroActions";
import { HelpContactButton } from "@/components/help/HelpContactButton";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";

const categories = [
  { href: "#getting-started", label: "Getting started" },
  { href: "#datasets", label: "Datasets" },
  { href: "#analysis-cleaning", label: "Analysis & cleaning" },
  { href: "#insights-modeling", label: "Insights & modeling" },
  { href: "#exports-sharing", label: "Exports & sharing" },
  { href: "#team-workspace", label: "Team workspace" },
  { href: "#data-security", label: "Data storage & retention" },
  { href: "#account-billing", label: "Account & billing" },
  { href: "#troubleshooting", label: "Troubleshooting" },
];

const workflowSteps = [
  {
    title: "Upload a dataset",
    detail: "Start with CSV, JSON, XLS, XLSX, or Parquet. Acutize creates a private dataset record and stores the file under your account.",
  },
  {
    title: "Analyze and review quality",
    detail: "Open Analyze & Explore to profile columns, types, missing values, uniqueness, basic statistics, charts, and quality signals.",
  },
  {
    title: "Clean and encode",
    detail: "Choose a target column, fill or drop missing values, encode categories, and scale numbers before downstream steps.",
  },
  {
    title: "Generate insights, features, and model previews",
    detail: "Use business insights, generated feature suggestions, model ideas, instant training, model comparison, and forecasting as needed.",
  },
  {
    title: "Export your work",
    detail: "Download cleaned data, generated-feature data, PDF reports, Python scripts, or a complete ZIP bundle.",
  },
];

const featureDocs = [
  {
    icon: FileSpreadsheet,
    title: "Data Hub and uploads",
    items: [
      "Upload supported tabular files from the dashboard using click-to-select or drag-and-drop.",
      "Supported formats are CSV, JSON, XLS, XLSX, and Parquet.",
      "Plan limits control maximum file size and active dataset count.",
      "Each upload receives a dataset ID so every later step stays connected to the same project.",
      "The dataset table shows file name, upload date, latest activity, and quick actions for the pipeline.",
    ],
  },
  {
    icon: BarChart3,
    title: "Analyze & Explore",
    items: [
      "Profiles each column so you can review detected data types before changing the file.",
      "Shows missing-value percentages, unique-value counts, numeric summaries, and chart-ready distributions.",
      "Provides dataset quality signals that help you decide whether to clean, transform, or model next.",
      "Opening the page with a selected dataset reuses saved context where available.",
    ],
  },
  {
    icon: Wand2,
    title: "Clean & Encode",
    items: [
      "Select the target column for supervised machine-learning workflows.",
      "Choose missing-value handling: none, mean, median, or row drop where appropriate.",
      "Encode categorical fields with label or one-hot encoding.",
      "Scale numeric columns with standard or min-max scaling.",
      "A processed copy is saved and becomes the preferred input for generated features, training, and exports.",
    ],
  },
  {
    icon: PieChart,
    title: "Business Insights",
    items: [
      "Creates dashboard-style exploratory analysis for business users.",
      "Summarizes patterns, trends, and recommendations in plain language.",
      "Best used after upload or cleaning when you need a stakeholder-friendly view of the dataset.",
    ],
  },
  {
    icon: Sparkles,
    title: "Generate Features",
    items: [
      "Suggests new predictive columns from your cleaned dataset.",
      "Each suggestion includes the formula, feature type, and expected impact.",
      "You can add or remove suggestions before saving your selected feature set.",
      "Applied features are saved as an engineered dataset and can be downloaded as CSV.",
    ],
  },
  {
    icon: Lightbulb,
    title: "Model Ideas",
    items: [
      "Recommends algorithm directions based on the target column and dataset shape.",
      "Detects whether the task is likely classification or regression.",
      "Explains suggested models so you can choose a practical next step before training a preview.",
      "This feature suggests algorithms; it does not create new CSV columns.",
    ],
  },
  {
    icon: Brain,
    title: "Train Models and Model Comparison",
    items: [
      "Model training trains several models on a sample so you can compare likely performance quickly.",
      "Cleaning first is recommended because missing values and categorical encoding affect model quality.",
      "Model comparison displays saved preview results, charts, metrics, and recommendation context.",
      "The comparison page reads the latest saved preview; run Train Models first when no results are available.",
    ],
  },
  {
    icon: CalendarClock,
    title: "Forecasting",
    items: [
      "Forecasts dated business metrics such as revenue, sales, demand, usage, or volume.",
      "Use a dataset that includes a usable date/time column and a numeric value to forecast.",
      "Forecast results can appear in exports and reports when available.",
    ],
  },
  {
    icon: Download,
    title: "Export & Reports",
    items: [
      "Download cleaned CSV files after running Clean & Encode.",
      "Download engineered CSV files after applying generated features.",
      "Create PDF project reports with pipeline timeline, profiling, cleaning settings, insights, model results, and forecasts where available.",
      "Export a ZIP bundle containing README instructions, report PDF, processed data, cleaning script, requirements, and full-training script when available.",
      "Download Python scripts for cleaning or local full-model training when the required workflow steps have been completed.",
    ],
  },
];

const faqGroups = [
  {
    title: "Dataset Questions",
    questions: [
      {
        q: "Which files can I upload?",
        a: "Acutize supports CSV, JSON, XLS, XLSX, and Parquet files. Your plan controls the maximum file size and the number of active datasets you can keep in the workspace.",
      },
      {
        q: "Do I need to clean a dataset before using every feature?",
        a: "Not always. Analysis and business insights can start from the uploaded dataset, but cleaning is strongly recommended before generated features, model previews, model comparison, and Python training exports.",
      },
      {
        q: "What is an active dataset?",
        a: "An active dataset is an uploaded dataset that still exists in your workspace. Free and Pro plans limit active dataset count; deleting a dataset frees a slot.",
      },
    ],
  },
  {
    title: "Workflow Questions",
    questions: [
      {
        q: "What is the recommended order of work?",
        a: "Upload, Analyze & Explore, Clean & Encode, then use Business Insights, Generate Features, Model Ideas, Train Models, Model Comparison, Forecasting, and Export as needed.",
      },
      {
        q: "How are Generate Features and Model Ideas different?",
        a: "Generate Features proposes new columns and can save them into an engineered dataset. Model Ideas recommends algorithms for your target column and does not alter the dataset.",
      },
      {
        q: "Does Model Comparison train new models?",
        a: "No. Model Comparison reads the latest saved model-training results. Use Train Models first, then open Model Comparison for charts, metrics, PDF, and sharing workflows.",
      },
    ],
  },
  {
    title: "Export Questions",
    questions: [
      {
        q: "What is included in the ZIP bundle?",
        a: "The ZIP can include a README, project PDF, cleaned CSV, engineered CSV, cleaning pipeline script, full-training script, and requirements file depending on which workflow steps you have run.",
      },
      {
        q: "Does the PDF include my raw data?",
        a: "The report is designed as a project summary. It can include metadata, profiling, settings, insights, model summaries, and forecasts, but raw rows should be exported separately through CSV or ZIP files when you need the data itself.",
      },
      {
        q: "Where does full model training happen?",
        a: "Model training runs in Acutize. Full training is exported as a Python script that you run on your own machine using the dataset path you choose.",
      },
    ],
  },
  {
    title: "Team workspace",
    questions: [
      {
        q: "Who gets a company workspace?",
        a: "Company workspaces are included with custom pricing plans only. Free, Pro, and Business plans are individual accounts. Contact us or choose a custom credit package on the pricing page to provision a shared team workspace.",
      },
      {
        q: "How do teammates join?",
        a: "An owner or admin invites colleagues by email from Company workspace. When the invitee creates an account with that same email address, they are added to the team automatically. Existing users are added the next time they sign in.",
      },
      {
        q: "Who pays and who manages billing?",
        a: "The workspace owner—the person who purchased the custom plan—retains billing access and Paddle subscription management. Admins and members cannot open the billing portal or change the subscription.",
      },
      {
        q: "Can members see what the team is working on?",
        a: "Yes. All team members can open Company workspace, view the shared credit pool, see the team roster, and read recent activity (who did what and when). Only owners and admins can invite people, change roles, cancel waiting tasks, or rename the portal.",
      },
    ],
  },
];

const troubleshooting = [
  {
    title: "Upload is blocked",
    detail: "Check the file extension, file size, and active dataset limit for your plan. If you recently deleted a dataset, refresh the dashboard and try again.",
  },
  {
    title: "Cleaning fails",
    detail: "Confirm the target column exists, contains usable values, and is not completely missing. Try a simpler missing-value strategy if many rows are incomplete.",
  },
  {
    title: "Model preview gives weak results",
    detail: "Run cleaning first, review target-column quality, remove columns that leak the answer, and check whether the task is classification or regression.",
  },
  {
    title: "Forecasting cannot run",
    detail: "Forecasting needs a date/time column and a numeric metric column. Clean inconsistent date formats or missing metric values before trying again.",
  },
  {
    title: "Export button is disabled",
    detail: "Some exports unlock only after the related step exists. For example, cleaned CSV requires cleaning, engineered CSV requires applied features, and full-training script requires model training.",
  },
];

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-slate-200 py-14 dark:border-slate-800">
      <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <Navbar />

      <main className="pt-24">
        <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <HelpCircle className="h-4 w-4" />
                  Help Center
                </div>
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
                  Acutize product documentation
                </h1>
                <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">
                  A practical guide to uploading datasets, preparing data, generating insights, testing model
                  direction, exporting deliverables, and understanding how your data is handled in the workspace.
                </p>
                <HelpHeroActions />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-semibold">Browse by category</p>
                <div className="mt-4 grid gap-2">
                  {categories.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-md px-3 py-2 text-sm text-slate-700 transition hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Section id="getting-started" eyebrow="Product Overview" title="What Acutize helps you do">
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                  Acutize is a browser-based data workflow for people who need to inspect, clean, analyze, test,
                  and export tabular datasets without moving between spreadsheets, notebooks, reporting tools, and
                  separate ML scripts. It is best suited for structured business data such as customers, orders,
                  sales, churn, revenue, inventory, demand, usage, and operations tables.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {[
                    "No-code dataset profiling",
                    "Guided cleaning and encoding",
                    "Business-friendly insights",
                    "Generated feature suggestions",
                    "Fast model preview and comparison",
                    "Forecasting and export packages",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-950/20">
                <p className="text-sm font-bold text-blue-800 dark:text-blue-200">Best first workflow</p>
                <ol className="mt-4 space-y-3">
                  {workflowSteps.map((step, index) => (
                    <li key={step.title} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{step.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {step.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Section>

          <Section id="datasets" eyebrow="Data Hub" title="Uploading and managing datasets">
            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  icon: Database,
                  title: "Private workspace",
                  detail: "Datasets are linked to your account, listed in your dashboard, and accessible through authenticated workflows.",
                },
                {
                  icon: FileSpreadsheet,
                  title: "Supported files",
                  detail: "Use CSV, JSON, XLS, XLSX, or Parquet files. Large files and active dataset counts are controlled by plan limits.",
                },
                {
                  icon: Trash2,
                  title: "Delete when done",
                  detail: "Use the dataset table delete action to permanently remove a dataset and its related artifacts from the workspace.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <card.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="mt-4 font-bold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="analysis-cleaning" eyebrow="Preparation" title="Analysis, cleaning, and transformation">
            <div className="grid gap-5 lg:grid-cols-2">
              {featureDocs.slice(1, 3).map((doc) => (
                <div key={doc.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <doc.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-bold">{doc.title}</h3>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {doc.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section id="insights-modeling" eyebrow="Intelligence" title="Insights, features, models, and forecasting">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {featureDocs.slice(3, 8).map((doc) => (
                <div key={doc.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <doc.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-bold">{doc.title}</h3>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {doc.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section id="exports-sharing" eyebrow="Deliverables" title="Exports, reports, and handoff">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold">What customers can export</h3>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {featureDocs[8].items.map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section id="team-workspace" eyebrow="Collaboration" title="Company team workspace (custom plans)">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                A company workspace lets multiple employees share one credit pool, one dataset library, and one
                company portal. It is available on <strong className="text-slate-900 dark:text-white">custom pricing</strong>{" "}
                only—not on Free, Pro, or Business individual plans. After purchase, the buyer becomes the{" "}
                <strong className="text-slate-900 dark:text-white">workspace owner</strong> and can invite teammates
                from <strong className="text-slate-900 dark:text-white">Company workspace</strong> in the dashboard sidebar.
              </p>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              {[
                {
                  icon: Building2,
                  title: "One shared company portal",
                  detail:
                    "Set your company name at the top of Company workspace. Everyone on the team sees the same name, shared credit balance, team roster, and recent activity feed.",
                },
                {
                  icon: Users,
                  title: "Shared credits & datasets",
                  detail:
                    "Credits are deducted from one company pool when anyone runs analyze, clean, forecast, business insights, or other paid actions. Datasets belong to the company workspace so the team works from the same library.",
                },
                {
                  icon: UserPlus,
                  title: "Email invitations",
                  detail:
                    "Owners and admins invite colleagues by email. Invites last 14 days. New users sign up with the invited address and land in the company workspace automatically.",
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
                >
                  <card.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="mt-4 font-bold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-bold">Roles and permissions</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="py-2 pr-4 font-semibold">Action</th>
                        <th className="py-2 px-2 font-semibold">Owner</th>
                        <th className="py-2 px-2 font-semibold">Admin</th>
                        <th className="py-2 pl-2 font-semibold">Member</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-600 dark:text-slate-300">
                      {[
                        ["Use datasets & run analyses", "Yes", "Yes", "Yes"],
                        ["View shared credits", "Yes", "Yes", "Yes"],
                        ["View team activity (read-only for members)", "Yes", "Yes", "Yes"],
                        ["Invite teammates", "Yes", "Yes", "No"],
                        ["Promote / demote admin ↔ member", "Yes", "No", "No"],
                        ["Remove members", "Yes", "Members only*", "No"],
                        ["Rename company portal", "Yes", "Yes", "No"],
                        ["Cancel queued team jobs", "Yes", "Yes", "No"],
                        ["Manage Paddle billing", "Yes", "No", "No"],
                      ].map(([action, owner, admin, member]) => (
                        <tr key={action} className="border-b border-slate-100 dark:border-slate-800/80">
                          <td className="py-2.5 pr-4">{action}</td>
                          <td className="py-2.5 px-2">{owner}</td>
                          <td className="py-2.5 px-2">{admin}</td>
                          <td className="py-2.5 pl-2">{member}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  * Admins can remove members but not other admins. The owner cannot be removed and always keeps billing control.
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-950/20">
                <h3 className="font-bold text-blue-950 dark:text-blue-100">Owner onboarding checklist</h3>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-blue-950/80 dark:text-blue-100/80">
                  {[
                    "Complete custom plan checkout—you are redirected to Company workspace.",
                    "Set your company name (top-left, pencil icon). This name is visible to all teammates.",
                    "Invite colleagues by email and choose Member or Admin for each invite.",
                    "Teammates sign up with the invited email and appear on the team list automatically.",
                    "Promote trusted colleagues to Admin if they should help invite others or manage activity.",
                    "Use Usage & credits or Company workspace to monitor the shared credit pool.",
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                {
                  title: "What teammates experience",
                  detail:
                    "After accepting an invite, members see Company workspace in the sidebar, the shared credit meter, the team list, and read-only recent activity. They run the same Analyze, Clean, Insights, and Export workflows against the company dataset library.",
                },
                {
                  title: "Billing stays with the owner",
                  detail:
                    "Only the workspace owner can open Manage Billing in Settings or change the Paddle subscription. Admins and members who need plan changes should contact the owner or use Contact Support for account questions.",
                },
                {
                  title: "Getting a company workspace",
                  detail:
                    "Choose a custom credit tier on the Pricing page or contact us about custom pricing. Free, Pro, and Business plans remain single-user workspaces.",
                },
                {
                  title: "Revoking access",
                  detail:
                    "Owners and admins can cancel pending invites or remove active members from Company workspace. Removed users lose access to the shared workspace; the owner role and billing relationship never transfer automatically.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="data-security" eyebrow="Data Handling" title="Storage, access, deletion, and retention">
            <div className="grid gap-5 lg:grid-cols-2">
              {[
                {
                  icon: LockKeyhole,
                  title: "Where dataset files are stored",
                  detail: "Uploaded raw files, cleaned datasets, engineered datasets, and model artifacts are stored in a private Supabase Storage bucket named datasets. Object paths are organized by user ID and dataset ID.",
                },
                {
                  icon: ShieldCheck,
                  title: "How access is isolated",
                  detail: "Database and storage policies are designed so authenticated users can access only records and files attached to their own user ID. Server-side routes verify ownership before returning dataset data, exports, or reports.",
                },
                {
                  icon: Database,
                  title: "What metadata is stored",
                  detail: "Acutize stores dataset metadata, file name, file extension, status, analysis summaries, cleaning settings, generated-feature settings, forecast results, business insights, model-training results, timestamps, and credit/activity events needed to operate the product.",
                },
                {
                  icon: Trash2,
                  title: "Manual deletion",
                  detail: "When you delete a dataset, Acutize removes the dataset database record, related training runs and shared-report records through database relationships, model artifacts referenced by runs, and storage objects under that dataset path.",
                },
                {
                  icon: CalendarClock,
                  title: "Retention policy",
                  detail: "Active datasets are retained while they remain in your workspace. Automated cleanup is enabled for inactive datasets after 30 days from their last update, as long as no training run is queued or running. Shared report links are eligible for cleanup after 30 days.",
                },
                {
                  icon: FileQuestion,
                  title: "Legal note",
                  detail: "This Help Center explains product behavior and should be read together with the separate Privacy Policy and Terms pages. For contractual, compliance, or regulated-data requirements, contact support before uploading sensitive data.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <card.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="mt-4 font-bold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{card.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="account-billing" eyebrow="Administration" title="Account, settings, credits, and support">
            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  icon: Settings,
                  title: "Account settings",
                  detail: "Update your profile name, email, and password from Settings. Email changes may require inbox verification.",
                },
                {
                  icon: Sparkles,
                  title: "Usage & credits",
                  detail: "Track current plan, credit balance, credit reset date, plan limits, action costs, and recent transaction history.",
                },
                {
                  icon: Mail,
                  title: "Support",
                  detail: "Use Contact Support for technical help, billing questions, custom credit packages, onboarding, or bug reports.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <card.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="mt-4 font-bold">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="faq" eyebrow="FAQ" title="Frequently asked questions">
            <div className="grid gap-5 lg:grid-cols-3">
              {faqGroups.map((group) => (
                <div key={group.title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="font-bold">{group.title}</h3>
                  <div className="mt-5 space-y-5">
                    {group.questions.map((item) => (
                      <div key={item.q}>
                        <p className="text-sm font-semibold">{item.q}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="troubleshooting" eyebrow="Troubleshooting" title="Common issues and fixes">
            <div className="grid gap-4 md:grid-cols-2">
              {troubleshooting.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.detail}</p>
                </div>
              ))}
            </div>
          </Section>

          <section className="pb-16">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-950/20">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-blue-950 dark:text-blue-100">Still need help?</h2>
                  <p className="mt-2 text-sm leading-6 text-blue-900/70 dark:text-blue-100/70">
                    Reach out for product questions, billing, custom team plans, onboarding, or anything else—we&apos;re
                    happy to help. Include what you were trying to do and any error message you saw.
                  </p>
                </div>
                <HelpContactButton />
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
