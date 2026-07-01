/**
 * Knowledge base for the Acutize help chatbot.
 *
 * Each entry maps to a specific help-center section, FAQ, or troubleshooting
 * tip. Fuse.js searches `title`, `content`, and `keywords` to find the best
 * matches for any user query.
 */

export interface KBArticle {
  /** Short, human-readable title shown in the chatbot result card */
  title: string;
  /** Plain-text summary used for search scoring */
  content: string;
  /** Extra terms that improve recall on common user phrasing */
  keywords: string[];
  /** Display category badge */
  category: string;
  /** Relative URL to the relevant help-center section */
  href: string;
}

export const knowledgeBase: KBArticle[] = [
  // ───────── Getting started ─────────
  {
    title: "What is Acutize?",
    content:
      "Acutize is a browser-based data workspace for inspecting, cleaning, analyzing, testing, and exporting tabular datasets without switching between spreadsheets, notebooks, and ML scripts. It works best with structured business data such as customers, orders, sales, churn, revenue, inventory, demand, usage, and operations tables.",
    keywords: ["what", "about", "overview", "introduction", "explain", "purpose", "platform"],
    category: "Getting started",
    href: "/help#getting-started",
  },
  {
    title: "Recommended workflow",
    content:
      "The recommended workflow is: 1) Upload a dataset (CSV, JSON, XLS, XLSX, or Parquet), 2) Analyze and review quality, 3) Clean and encode, 4) Generate insights, features, and model previews, 5) Export your work including cleaned data, reports, and scripts.",
    keywords: ["workflow", "steps", "order", "start", "how to", "begin", "first", "getting started", "guide"],
    category: "Getting started",
    href: "/help#getting-started",
  },

  // ───────── Datasets ─────────
  {
    title: "Supported file formats",
    content:
      "Acutize supports CSV, JSON, XLS, XLSX, and Parquet files. Your plan controls the maximum file size and the number of active datasets you can keep in your workspace.",
    keywords: ["file", "format", "csv", "json", "excel", "xls", "xlsx", "parquet", "upload", "type", "supported"],
    category: "Datasets",
    href: "/help#datasets",
  },
  {
    title: "Active dataset limits",
    content:
      "An active dataset is an uploaded dataset that still exists in your workspace. Free and Pro plans limit active dataset count. Deleting a dataset frees a slot so you can upload a new one.",
    keywords: ["active", "limit", "count", "slot", "maximum", "how many", "datasets", "delete"],
    category: "Datasets",
    href: "/help#datasets",
  },
  {
    title: "Uploading datasets",
    content:
      "Upload supported tabular files from the dashboard using click-to-select or drag-and-drop. Each upload receives a dataset ID so every later step stays connected to the same project. The dataset table shows file name, upload date, latest activity, and quick actions.",
    keywords: ["upload", "drag", "drop", "import", "add", "new dataset", "how to upload"],
    category: "Datasets",
    href: "/help#datasets",
  },

  // ───────── Analysis & Cleaning ─────────
  {
    title: "Analyze & Explore",
    content:
      "Profiles each column to review detected data types, missing-value percentages, unique-value counts, numeric summaries, and chart-ready distributions. Provides dataset quality signals that help you decide whether to clean, transform, or model next.",
    keywords: ["analyze", "explore", "profile", "quality", "statistics", "missing", "columns", "types", "distributions", "chart"],
    category: "Analysis & Cleaning",
    href: "/help#analysis-cleaning",
  },
  {
    title: "Clean & Encode",
    content:
      "Select a target column for supervised ML workflows. Choose missing-value handling (none, mean, median, or row drop), encode categorical fields with label or one-hot encoding, and scale numeric columns with standard or min-max scaling. A processed copy is saved and becomes the preferred input for generated features, training, and exports.",
    keywords: ["clean", "encode", "missing", "encoding", "label", "one-hot", "scaling", "target", "prepare", "transform", "preprocessing"],
    category: "Analysis & Cleaning",
    href: "/help#analysis-cleaning",
  },

  // ───────── Insights & Modeling ─────────
  {
    title: "Business Insights",
    content:
      "Creates dashboard-style exploratory analysis for business users. Summarizes patterns, trends, and recommendations in plain language. Best used after upload or cleaning when you need a stakeholder-friendly view of the dataset.",
    keywords: ["business", "insights", "patterns", "trends", "summary", "eda", "exploratory", "analysis", "dashboard"],
    category: "Insights & Modeling",
    href: "/help#insights-modeling",
  },
  {
    title: "Generate Features",
    content:
      "Suggests new predictive columns from your cleaned dataset. Each suggestion includes the formula, feature type, and expected impact. You can add or remove suggestions before saving. Applied features are saved as an engineered dataset and can be downloaded as CSV.",
    keywords: ["features", "generate", "engineering", "columns", "predictive", "derived", "suggestions", "engineered"],
    category: "Insights & Modeling",
    href: "/help#insights-modeling",
  },
  {
    title: "Model Ideas",
    content:
      "Recommends algorithm directions based on the target column and dataset shape. Detects whether the task is likely classification or regression. Explains suggested models so you can choose a practical next step before training a preview. This feature suggests algorithms and does not create new CSV columns.",
    keywords: ["model", "ideas", "algorithm", "recommendation", "classification", "regression", "suggest", "ml"],
    category: "Insights & Modeling",
    href: "/help#insights-modeling",
  },
  {
    title: "Train Models & Model Comparison",
    content:
      "Model training trains several models on a sample so you can compare likely performance quickly. Cleaning first is recommended because missing values and categorical encoding affect model quality. Model comparison displays saved preview results, charts, metrics, and recommendation context. Run Train Models first when no results are available.",
    keywords: ["train", "model", "comparison", "preview", "metrics", "performance", "accuracy", "compare", "instant"],
    category: "Insights & Modeling",
    href: "/help#insights-modeling",
  },
  {
    title: "Forecasting",
    content:
      "Forecasts dated business metrics such as revenue, sales, demand, usage, or volume. Use a dataset that includes a usable date/time column and a numeric value to forecast. Forecast results can appear in exports and reports when available.",
    keywords: ["forecast", "prediction", "time series", "date", "revenue", "sales", "demand", "future", "trend"],
    category: "Insights & Modeling",
    href: "/help#insights-modeling",
  },

  // ───────── Exports & Sharing ─────────
  {
    title: "Exports & Reports",
    content:
      "Download cleaned CSV files, engineered CSV files, PDF project reports with pipeline timeline, profiling, cleaning settings, insights, model results, and forecasts. Export a ZIP bundle containing README, report PDF, processed data, cleaning script, requirements, and full-training script. Download Python scripts for cleaning or local full-model training.",
    keywords: ["export", "download", "csv", "pdf", "report", "zip", "bundle", "python", "script", "cleaned", "share"],
    category: "Exports & Sharing",
    href: "/help#exports-sharing",
  },
  {
    title: "ZIP bundle contents",
    content:
      "The ZIP can include a README, project PDF, cleaned CSV, engineered CSV, cleaning pipeline script, full-training script, and requirements file depending on which workflow steps you have run.",
    keywords: ["zip", "bundle", "package", "readme", "what is included", "contents"],
    category: "Exports & Sharing",
    href: "/help#exports-sharing",
  },
  {
    title: "Full model training",
    content:
      "Model training runs in Acutize. Full training is exported as a Python script that you run on your own machine using the dataset path you choose.",
    keywords: ["full training", "python", "script", "local", "run", "machine", "export"],
    category: "Exports & Sharing",
    href: "/help#exports-sharing",
  },

  // ───────── Team Workspace ─────────
  {
    title: "Company team workspace",
    content:
      "A company workspace lets multiple employees share one credit pool, one dataset library, and one company portal. It is available on custom pricing plans only—not on Free, Pro, or Business individual plans. After purchase, the buyer becomes the workspace owner and can invite teammates.",
    keywords: ["team", "company", "workspace", "organization", "shared", "collaborate", "enterprise", "custom plan"],
    category: "Team Workspace",
    href: "/help#team-workspace",
  },
  {
    title: "Inviting teammates",
    content:
      "An owner or admin invites colleagues by email from Company workspace. When the invitee creates an account with that same email address, they are added to the team automatically. Existing users are added the next time they sign in. Invites last 14 days.",
    keywords: ["invite", "team", "colleague", "email", "add", "member", "join"],
    category: "Team Workspace",
    href: "/help#team-workspace",
  },
  {
    title: "Team roles and permissions",
    content:
      "Owners can do everything including billing. Admins can invite, manage members, rename portal, and cancel queued jobs. Members can use datasets, run analyses, view credits and team activity but cannot invite people or change settings.",
    keywords: ["role", "permission", "owner", "admin", "member", "access", "who can"],
    category: "Team Workspace",
    href: "/help#team-workspace",
  },
  {
    title: "Team billing",
    content:
      "Only the workspace owner can open Manage Billing or change the Paddle subscription. Admins and members who need plan changes should contact the owner or use Contact Support.",
    keywords: ["billing", "owner", "payment", "subscription", "paddle", "manage", "who pays"],
    category: "Team Workspace",
    href: "/help#team-workspace",
  },

  // ───────── Data Security ─────────
  {
    title: "Data storage and retention",
    content:
      "Uploaded raw files, cleaned datasets, engineered datasets, and model artifacts are stored in a private Supabase Storage bucket. Database and storage policies ensure authenticated users access only their own records and files. Active datasets are retained while in your workspace. Automated cleanup removes inactive datasets after 30 days from last update.",
    keywords: ["storage", "retention", "privacy", "security", "data", "where", "stored", "delete", "cleanup", "30 days"],
    category: "Data Security",
    href: "/help#data-security",
  },
  {
    title: "Manual deletion",
    content:
      "When you delete a dataset, Acutize removes the dataset record, related training runs and shared-report records, model artifacts, and storage objects under that dataset path.",
    keywords: ["delete", "remove", "permanent", "destroy", "erase"],
    category: "Data Security",
    href: "/help#data-security",
  },

  // ───────── Account & Billing ─────────
  {
    title: "Account settings",
    content:
      "Update your profile name, email, and password from Settings. Email changes may require inbox verification.",
    keywords: ["account", "settings", "profile", "name", "email", "password", "change"],
    category: "Account & Billing",
    href: "/help#account-billing",
  },
  {
    title: "Usage & credits",
    content:
      "Track current plan, credit balance, credit reset date, plan limits, action costs, and recent transaction history from the Usage & credits page.",
    keywords: ["credits", "usage", "balance", "plan", "cost", "transaction", "history", "limit", "how many credits"],
    category: "Account & Billing",
    href: "/help#account-billing",
  },
  {
    title: "Pricing and plans",
    content:
      "Acutize offers Free, Pro ($25/mo), and Business ($70/mo) plans. Plans are designed around dataset size, active workspace capacity, export needs, and support level. Custom credit packages are also available. Visit the pricing page for full details.",
    keywords: ["pricing", "plans", "price", "cost", "free", "pro", "business", "subscription", "upgrade", "downgrade", "how much"],
    category: "Account & Billing",
    href: "/pricing",
  },

  // ───────── Troubleshooting ─────────
  {
    title: "Upload is blocked",
    content:
      "Check the file extension, file size, and active dataset limit for your plan. If you recently deleted a dataset, refresh the dashboard and try again.",
    keywords: ["upload", "blocked", "error", "cannot upload", "failed", "rejected", "size limit"],
    category: "Troubleshooting",
    href: "/help#troubleshooting",
  },
  {
    title: "Cleaning fails",
    content:
      "Confirm the target column exists, contains usable values, and is not completely missing. Try a simpler missing-value strategy if many rows are incomplete.",
    keywords: ["cleaning", "fails", "error", "target column", "missing values", "cannot clean"],
    category: "Troubleshooting",
    href: "/help#troubleshooting",
  },
  {
    title: "Model preview gives weak results",
    content:
      "Run cleaning first, review target-column quality, remove columns that leak the answer, and check whether the task is classification or regression.",
    keywords: ["weak", "results", "bad", "accuracy", "poor", "model", "low score", "not working"],
    category: "Troubleshooting",
    href: "/help#troubleshooting",
  },
  {
    title: "Forecasting cannot run",
    content:
      "Forecasting needs a date/time column and a numeric metric column. Clean inconsistent date formats or missing metric values before trying again.",
    keywords: ["forecasting", "cannot", "run", "error", "date", "time", "column missing"],
    category: "Troubleshooting",
    href: "/help#troubleshooting",
  },
  {
    title: "Export button is disabled",
    content:
      "Some exports unlock only after the related step exists. Cleaned CSV requires cleaning, engineered CSV requires applied features, and full-training script requires model training.",
    keywords: ["export", "disabled", "greyed out", "cannot download", "button", "not working"],
    category: "Troubleshooting",
    href: "/help#troubleshooting",
  },

  // ───────── FAQ extras ─────────
  {
    title: "Do I need to clean before every feature?",
    content:
      "Not always. Analysis and business insights can start from the uploaded dataset, but cleaning is strongly recommended before generated features, model previews, model comparison, and Python training exports.",
    keywords: ["clean first", "before", "required", "necessary", "skip cleaning"],
    category: "FAQ",
    href: "/help#faq",
  },
  {
    title: "Difference between Generate Features and Model Ideas",
    content:
      "Generate Features proposes new columns and can save them into an engineered dataset. Model Ideas recommends algorithms for your target column and does not alter the dataset.",
    keywords: ["difference", "generate features", "model ideas", "compare", "versus", "vs"],
    category: "FAQ",
    href: "/help#faq",
  },
  {
    title: "Does Model Comparison train new models?",
    content:
      "No. Model Comparison reads the latest saved model-training results. Use Train Models first, then open Model Comparison for charts, metrics, PDF, and sharing workflows.",
    keywords: ["model comparison", "train", "new", "retrain", "rerun"],
    category: "FAQ",
    href: "/help#faq",
  },
  {
    title: "PDF report contents",
    content:
      "The report is designed as a project summary. It can include metadata, profiling, settings, insights, model summaries, and forecasts. Raw rows should be exported separately through CSV or ZIP files when you need the data itself.",
    keywords: ["pdf", "report", "what is included", "contents", "summary"],
    category: "FAQ",
    href: "/help#faq",
  },
];
