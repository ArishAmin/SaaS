import type { SeoPageContent } from "@/components/marketing/SeoLandingPage";

export const seoPageContent: Record<string, SeoPageContent> = {
  "ai-data-cleaning": {
    path: "/ai-data-cleaning",
    eyebrow: "AI data cleaning",
    title: "Clean business datasets with guided AI-assisted workflows",
    intro:
      "Acutize helps you inspect and prepare tabular data without assembling scripts for every file. Upload a supported dataset, review visible quality issues, choose cleaning strategies, and keep a processed copy for analysis or export.",
    summaryTitle: "Move from raw file to reviewable clean data",
    summary:
      "Data cleaning should be transparent enough to review. Acutize profiles the uploaded file, surfaces missing values, duplicates, and type issues, then lets you configure how common problems are handled before a cleaned dataset is saved.",
    highlights: [
      { title: "Profile before changing", text: "Review column types, missingness, uniqueness, duplicates, and quality signals before applying a cleaning strategy." },
      { title: "Keep choices visible", text: "Select approaches for imputation, categorical encoding, scaling, and duplicate handling instead of relying on an unexplained black box." },
      { title: "Export usable outputs", text: "Continue into analysis and modeling or download cleaned files and reports for review, handoff, or later work." },
    ],
    workflow: [
      { title: "Upload a supported file", text: "Start with CSV, Excel, JSON, or Parquet data from a business workflow." },
      { title: "Inspect quality signals", text: "Review schema, row counts, missing values, duplicates, distributions, and potential issues." },
      { title: "Configure cleaning", text: "Choose the target column and appropriate missing-value, encoding, scaling, and duplicate settings." },
      { title: "Save and validate", text: "Create a processed dataset, review the result, and use it for insights, forecasting, modeling, or export." },
    ],
    bestFor: [
      "Analysts preparing recurring spreadsheet and CSV exports.",
      "Operations teams that need consistent, reviewable cleanup steps.",
      "Practitioners who want a guided starting point before deeper Python or BI work.",
    ],
    faq: [
      { question: "Which file formats can I clean?", answer: "Acutize accepts structured CSV, Excel, JSON, and Parquet files within the file-size and row limits of your plan." },
      { question: "Does Acutize change my original file?", answer: "Cleaning creates a processed dataset state for continued work and export. You can review the workflow output rather than silently overwriting a local source file." },
      { question: "Can it handle missing values and categories?", answer: "The cleaning workflow includes configurable missing-value strategies, duplicate handling, categorical encoding, and numeric scaling where those operations apply." },
      { question: "Is AI output guaranteed to be correct?", answer: "No. Automated suggestions and generated results should be reviewed against your data definitions and business context before they support important decisions." },
    ],
    related: [
      { href: "/csv-data-cleaning", label: "CSV data cleaning" },
      { href: "/data-quality-analysis", label: "Data quality analysis" },
      { href: "/automated-eda", label: "Automated EDA" },
    ],
  },
  "csv-data-cleaning": {
    path: "/csv-data-cleaning",
    eyebrow: "CSV data cleaning",
    title: "Clean and analyze CSV files online without writing scripts",
    intro:
      "Upload a CSV file to inspect its structure, find missing values and duplicates, configure cleaning steps, and download useful outputs from one browser workspace.",
    summaryTitle: "A repeatable workflow for messy CSV exports",
    summary:
      "CSV files often arrive with inconsistent types, empty cells, duplicate records, and categories that are not ready for analysis. Acutize brings profiling, guided preparation, analysis, and export into a connected workflow.",
    highlights: [
      { title: "Understand the file", text: "See row and column counts, detected types, sample values, missingness, duplicate signals, and column-level summaries." },
      { title: "Prepare for analysis", text: "Configure common cleaning and encoding choices before generating charts, business insights, forecasts, or model previews." },
      { title: "Download the result", text: "Export cleaned CSV data, engineered datasets, reports, training scripts, or bundles when the relevant workflow steps are complete." },
    ],
    workflow: [
      { title: "Upload the CSV", text: "Choose a structured comma-separated file within your plan limits." },
      { title: "Check parsing and schema", text: "Confirm that columns, types, and sample rows reflect the dataset you intended to upload." },
      { title: "Resolve quality issues", text: "Review missing values, duplicates, categories, and numeric fields, then apply suitable settings." },
      { title: "Analyze or export", text: "Use the prepared file for insights and model exploration or download it for another system." },
    ],
    bestFor: [
      "Sales, marketing, finance, support, and operations exports.",
      "Analysts receiving CSV files from several business systems.",
      "Teams that need a reviewable file before a dashboard or model.",
    ],
    faq: [
      { question: "Can I preview a CSV before cleaning it?", answer: "Yes. The analysis workflow is designed to show the detected schema, sample rows, quality indicators, and column summaries before cleaning." },
      { question: "What CSV issues can I review?", answer: "You can inspect missing values, duplicates, inferred data types, uniqueness, distributions, and other column-level quality signals." },
      { question: "Can I download a cleaned CSV?", answer: "Yes. When the cleaning step completes successfully, the processed dataset can be used by later workflows and downloaded through the available export options." },
      { question: "How large can my CSV be?", answer: "Maximum file size, active dataset count, row limits, and credits vary by plan. The pricing page lists the current limits." },
    ],
    related: [
      { href: "/ai-data-cleaning", label: "AI data cleaning" },
      { href: "/data-quality-analysis", label: "Dataset quality checks" },
      { href: "/pricing", label: "File limits and pricing" },
    ],
  },
  "data-quality-analysis": {
    path: "/data-quality-analysis",
    eyebrow: "Data quality analysis",
    title: "Assess dataset quality before cleaning or modeling",
    intro:
      "Profile tabular data, review quality indicators, and identify issues that could affect analysis, forecasting, or machine-learning results before you commit to a downstream workflow.",
    summaryTitle: "Make data problems visible early",
    summary:
      "A useful quality review combines file-level context with column-level evidence. Acutize helps you inspect structure, types, missingness, uniqueness, duplicate signals, distributions, and practical next steps in one place.",
    highlights: [
      { title: "Schema overview", text: "Confirm detected columns and types and inspect representative values before treating the dataset as analysis-ready." },
      { title: "Quality indicators", text: "Surface missing cells, duplicates, high-cardinality fields, and other signals that deserve review." },
      { title: "Connected next steps", text: "Move from the quality review into cleaning, business insights, feature work, forecasting, or model comparison." },
    ],
    workflow: [
      { title: "Choose the active dataset", text: "Select the uploaded file whose current state you want to assess." },
      { title: "Review the profile", text: "Inspect schema, sample rows, types, distributions, missingness, uniqueness, and duplicate information." },
      { title: "Prioritize issues", text: "Separate problems that block analysis from fields that simply need business interpretation." },
      { title: "Take the next action", text: "Configure cleaning or continue with the appropriate analysis once the data is suitable." },
    ],
    bestFor: [
      "Analysts validating a new source before building reports.",
      "Teams checking recurring exports for changes or degradation.",
      "Modeling projects that need a defensible preparation step.",
    ],
    faq: [
      { question: "What is a dataset quality score?", answer: "It is a summary signal based on detectable characteristics of the current dataset. It is not a substitute for domain rules or human validation." },
      { question: "Can quality checks find every error?", answer: "No. Automated profiling can reveal structural and statistical issues, but it cannot know every business definition, valid exception, or source-system rule." },
      { question: "Should I clean every flagged column?", answer: "Not automatically. Review whether the signal matters for your intended analysis, reporting, forecast, or model target before making a change." },
      { question: "Can I include quality findings in a report?", answer: "Acutize can generate project-oriented reports and exports after the relevant workflow steps have produced the necessary results." },
    ],
    related: [
      { href: "/ai-data-cleaning", label: "Clean detected issues" },
      { href: "/automated-eda", label: "Explore distributions" },
      { href: "/help", label: "Read product guides" },
    ],
  },
  "automated-eda": {
    path: "/automated-eda",
    eyebrow: "Automated exploratory data analysis",
    title: "Explore tabular datasets with charts and plain-language context",
    intro:
      "Use automated profiling and exploratory analysis to understand distributions, relationships, quality concerns, and business-relevant patterns before building a report or model.",
    summaryTitle: "Turn a file into an informed first review",
    summary:
      "Exploratory data analysis is most useful when charts remain connected to the underlying schema and preparation state. Acutize combines dataset profiling, visual summaries, generated insights, and recommended next steps.",
    highlights: [
      { title: "Visual summaries", text: "Review automatically selected charts and descriptive signals for important numeric and categorical columns." },
      { title: "Business-friendly findings", text: "Generate plain-language observations and recommendations that can help frame deeper investigation." },
      { title: "Preparation awareness", text: "Use the current uploaded, cleaned, or engineered dataset state so your analysis reflects the version you intend to study." },
    ],
    workflow: [
      { title: "Upload and profile", text: "Confirm that the file structure and detected data types are suitable for exploration." },
      { title: "Review distributions", text: "Inspect summaries and charts for important variables, categories, ranges, and missingness." },
      { title: "Generate insights", text: "Use business-insight generation to surface patterns and questions worth investigating." },
      { title: "Validate and share", text: "Check findings against domain knowledge, then export a report or continue into forecasting and models." },
    ],
    bestFor: [
      "Business analysts beginning work on an unfamiliar dataset.",
      "Teams that need a fast first-pass summary before a meeting.",
      "Practitioners deciding which columns need cleaning or deeper analysis.",
    ],
    faq: [
      { question: "What does automated EDA include?", answer: "It can include schema summaries, missingness, uniqueness, descriptive statistics, automatically selected charts, and generated business-oriented observations." },
      { question: "Does automated EDA replace an analyst?", answer: "No. It accelerates an initial review. An analyst still needs to validate definitions, causal interpretations, exceptions, and decision relevance." },
      { question: "Can I analyze Excel and Parquet files?", answer: "Yes. Acutize supports structured CSV, Excel, JSON, and Parquet files within plan limits." },
      { question: "Can I export the analysis?", answer: "Available outputs can include PDF reports and export bundles, depending on the workflow results and plan capabilities." },
    ],
    related: [
      { href: "/data-quality-analysis", label: "Data quality analysis" },
      { href: "/business-data-forecasting", label: "Business forecasting" },
      { href: "/no-code-machine-learning", label: "No-code model exploration" },
    ],
  },
  "no-code-machine-learning": {
    path: "/no-code-machine-learning",
    eyebrow: "No-code machine learning",
    title: "Compare machine-learning models on tabular data without boilerplate",
    intro:
      "Prepare a dataset, choose a target, compare suitable model candidates, and review practical performance differences before deciding whether deeper modeling work is justified.",
    summaryTitle: "Model exploration connected to data preparation",
    summary:
      "A model score is only useful when the target, task type, dataset state, and evaluation context are clear. Acutize keeps model recommendations and preview comparisons connected to the prepared data used to produce them.",
    highlights: [
      { title: "Task detection", text: "Use the selected target and dataset characteristics to distinguish common classification and regression workflows." },
      { title: "Model comparison", text: "Review candidate algorithms and relevant metrics rather than receiving a single unexplained recommendation." },
      { title: "Exportable handoff", text: "Generate reports and Python training scripts that can support review or a more controlled next stage." },
    ],
    workflow: [
      { title: "Prepare the dataset", text: "Review quality, clean relevant fields, and select the target column for supervised modeling." },
      { title: "Generate model ideas", text: "Review algorithms that fit the detected task and the reasons they may be appropriate." },
      { title: "Run a comparison", text: "Train preview candidates and compare their available evaluation metrics." },
      { title: "Review before using", text: "Check leakage, sampling, target validity, metric choice, and business costs before relying on a result." },
    ],
    bestFor: [
      "Analysts testing whether a tabular prediction problem is promising.",
      "Teams comparing baseline models before involving deeper engineering.",
      "Practitioners who need a transparent bridge from clean data to a training script.",
    ],
    faq: [
      { question: "What kinds of ML tasks are supported?", answer: "The guided workflows focus on common supervised tabular classification and regression scenarios where a suitable target column is available." },
      { question: "Does the recommendation deploy a production model?", answer: "No. Preview comparisons and recommendations support exploration. Production deployment requires additional validation, monitoring, governance, and engineering." },
      { question: "Why should I clean the data first?", answer: "Missing values, incorrect types, leakage, duplicate rows, and unsuitable categories can distort evaluation and make model comparisons misleading." },
      { question: "Can I download code?", answer: "The export workflow can provide Python training scripts and related project outputs when the required steps are complete." },
    ],
    related: [
      { href: "/ai-data-cleaning", label: "Prepare training data" },
      { href: "/data-quality-analysis", label: "Review data quality" },
      { href: "/automated-eda", label: "Explore the dataset" },
    ],
  },
  "business-data-forecasting": {
    path: "/business-data-forecasting",
    eyebrow: "Business data forecasting",
    title: "Build an initial forecast from time-based business data",
    intro:
      "Configure a date column, metric, horizon, and aggregation to generate an initial forecast with visible context, then review the result against business events and source-data limitations.",
    summaryTitle: "A guided starting point for time-series questions",
    summary:
      "Forecasting requires more than drawing a trend line. Acutize helps structure the basic inputs, preserve the dataset context, and present forecast results alongside caveats that still require human review.",
    highlights: [
      { title: "Explicit configuration", text: "Select the time field, value to forecast, aggregation, and horizon instead of relying on hidden assumptions." },
      { title: "Connected data state", text: "Run forecasting from the active dataset state after reviewing quality and preparation needs." },
      { title: "Reviewable output", text: "Inspect forecast values and supporting context, then include relevant results in reports and exports." },
    ],
    workflow: [
      { title: "Validate the time field", text: "Confirm dates are parsed consistently and occur at a useful frequency for the business question." },
      { title: "Choose the metric", text: "Select a numeric measure and aggregation that match the decision you are trying to support." },
      { title: "Set the horizon", text: "Choose a forecast window that is credible for the amount and stability of historical data." },
      { title: "Interpret cautiously", text: "Compare the result with seasonality, promotions, outages, policy changes, and other events the file may not encode." },
    ],
    bestFor: [
      "Operations teams exploring demand, volume, or workload trends.",
      "Finance and revenue analysts creating an initial scenario.",
      "Practitioners checking whether a dataset supports deeper forecasting work.",
    ],
    faq: [
      { question: "What data is needed for forecasting?", answer: "You generally need a consistently parsed date or time column, a numeric metric, enough historical observations, and a frequency appropriate to the forecast horizon." },
      { question: "Can a forecast account for every business event?", answer: "No. Results are limited by the available columns and history. Promotions, policy changes, outages, and structural breaks may require explicit modeling and expert judgment." },
      { question: "Should I clean the data first?", answer: "Yes when dates, missing values, duplicates, or numeric fields would otherwise make the time series unreliable." },
      { question: "Is the forecast financial advice?", answer: "No. Forecasts are analytical outputs and should be independently validated before financial, operational, or other high-impact decisions." },
    ],
    related: [
      { href: "/data-quality-analysis", label: "Validate source data" },
      { href: "/automated-eda", label: "Explore historical patterns" },
      { href: "/help", label: "Forecasting guide" },
    ],
  },
  "use-cases/data-analysts": {
    path: "/use-cases/data-analysts",
    eyebrow: "For data analysts",
    title: "Prepare, explore, and hand off datasets from one workspace",
    intro:
      "Acutize gives analysts a connected path from file intake and quality review to cleaning, exploratory analysis, model previews, forecasts, and exportable project outputs.",
    summaryTitle: "Reduce setup work without hiding important decisions",
    summary:
      "Analysts often lose time moving among spreadsheet checks, one-off scripts, charts, and report templates. Acutize keeps common early-stage tasks together while leaving preparation choices and limitations visible for review.",
    highlights: [
      { title: "Faster dataset intake", text: "Profile supported files and identify structural issues before building downstream logic around an unreliable source." },
      { title: "Connected analysis", text: "Carry the current dataset state into cleaning, EDA, insights, forecasting, feature work, and model comparison." },
      { title: "Clearer handoff", text: "Export cleaned data, reports, scripts, and bundles that colleagues can review outside the workspace." },
    ],
    workflow: [
      { title: "Profile the source", text: "Confirm schema, types, missingness, duplicates, distributions, and the intended unit of analysis." },
      { title: "Prepare deliberately", text: "Choose cleaning and encoding rules that match the meaning and destination of the data." },
      { title: "Explore the question", text: "Generate charts, insights, forecasts, or model baselines appropriate to the task." },
      { title: "Document the output", text: "Export artifacts and communicate assumptions, validation needs, and known limitations." },
    ],
    bestFor: [
      "Analysts who receive recurring CSV and spreadsheet exports.",
      "Consultants who need reviewable deliverables for a client handoff.",
      "Small data teams evaluating a source before production work.",
    ],
    faq: [
      { question: "Does Acutize replace SQL, Python, or BI tools?", answer: "No. It covers a useful set of file-based preparation and exploration workflows and can produce outputs for deeper work in specialized tools." },
      { question: "Can I export a Python script?", answer: "Yes. Relevant export workflows can produce a Python training script alongside data files and reports." },
      { question: "Can I work with teammates?", answer: "Company workspaces support shared datasets, credits, invitations, and role-based collaboration according to the selected plan." },
      { question: "How should I validate generated insights?", answer: "Check them against source definitions, domain knowledge, reproducible calculations, and the decision context before sharing conclusions." },
    ],
    related: [
      { href: "/automated-eda", label: "Automated EDA" },
      { href: "/no-code-machine-learning", label: "Model comparison" },
      { href: "/business-data-forecasting", label: "Forecasting" },
    ],
  },
  "use-cases/operations-teams": {
    path: "/use-cases/operations-teams",
    eyebrow: "For operations teams",
    title: "Turn recurring operational files into cleaner, reviewable outputs",
    intro:
      "Profile and prepare exports from operational systems, summarize important patterns, explore future workload, and create files or reports that are easier to review and share.",
    summaryTitle: "A practical path for file-based operational analysis",
    summary:
      "Operations data often arrives through spreadsheets and exports with inconsistent fields, missing values, and changing categories. Acutize helps teams inspect those files before using them for reporting, planning, or model exploration.",
    highlights: [
      { title: "Check each export", text: "Review schema and quality indicators so source-system changes are less likely to pass unnoticed." },
      { title: "Prepare consistently", text: "Apply visible cleaning choices and keep the processed dataset connected to later analysis." },
      { title: "Create useful artifacts", text: "Download cleaned files, charts, insights, forecasts, and reports for planning or handoff." },
    ],
    workflow: [
      { title: "Upload the current export", text: "Start with structured sales, support, inventory, service, staffing, or other operational data." },
      { title: "Review changes and issues", text: "Check types, missingness, duplicate records, categories, and unusual distributions." },
      { title: "Prepare and analyze", text: "Clean relevant fields and generate the summaries or forecasts needed for the question." },
      { title: "Share with context", text: "Export the result together with assumptions, caveats, and the period covered by the source." },
    ],
    bestFor: [
      "Teams reviewing weekly or monthly system exports.",
      "Operations managers who need a structured first pass before escalation.",
      "Analysts supporting planning, service, inventory, or workload decisions.",
    ],
    faq: [
      { question: "What operational datasets work best?", answer: "Structured tabular files with consistent rows, named columns, business measures, categories, and dates are the strongest fit." },
      { question: "Can Acutize connect directly to our source systems?", answer: "The current workflow is centered on uploaded CSV, Excel, JSON, and Parquet files rather than claiming native connectors that are not present." },
      { question: "Can we use it for recurring reports?", answer: "You can process recurring files, but each result should be checked for schema changes and business events before it is treated as comparable." },
      { question: "Can operations teams share a workspace?", answer: "Company workspace capabilities include shared datasets, credits, invitations, and permissions, subject to the current plan configuration." },
    ],
    related: [
      { href: "/csv-data-cleaning", label: "Clean recurring CSV files" },
      { href: "/business-data-forecasting", label: "Forecast operational metrics" },
      { href: "/data-quality-analysis", label: "Check dataset quality" },
    ],
  },
  security: {
    path: "/security",
    eyebrow: "Security and data handling",
    title: "Understand how Acutize handles workspace and dataset access",
    intro:
      "Acutize uses authenticated workspaces, account-scoped dataset records, controlled file access, and a published retention policy to support private data-processing workflows.",
    summaryTitle: "Security information without inflated claims",
    summary:
      "This page describes product behavior visible in the current service and policies. It does not claim certifications or guarantees that Acutize has not independently obtained.",
    highlights: [
      { title: "Authenticated access", text: "Dashboard workflows require an authenticated account, and dataset records are associated with the authorized user or company workspace." },
      { title: "Controlled sharing", text: "Shared reports use dedicated tokens. They should be treated as confidential links and can be managed from the product workflow." },
      { title: "Retention and deletion", text: "Uploaded data and generated artifacts are retained for active workspace use and handled according to the published privacy and retention terms." },
    ],
    workflow: [
      { title: "Use the correct workspace", text: "Confirm whether a dataset belongs in a personal or company workspace before upload." },
      { title: "Limit source data", text: "Upload only the fields needed for the task and remove unnecessary sensitive information where practical." },
      { title: "Manage access", text: "Use account authentication and company roles carefully, and share report links only with intended recipients." },
      { title: "Delete when finished", text: "Remove datasets manually when they are no longer required instead of relying only on inactivity cleanup." },
    ],
    bestFor: [
      "Buyers reviewing how uploaded files are scoped and retained.",
      "Teams establishing an internal process for file-based analysis.",
      "Users deciding whether a particular dataset is appropriate for the service.",
    ],
    faq: [
      { question: "Are datasets public?", answer: "Dataset records and normal workspace exports are tied to authenticated access. A report becomes accessible through a share token only when a user intentionally creates that link." },
      { question: "Does Acutize claim a security certification?", answer: "No certification is claimed on this page. Buyers with specific compliance requirements should contact support before uploading regulated or highly sensitive data." },
      { question: "Can I delete a dataset?", answer: "Yes. The product provides manual dataset deletion, and the privacy policy describes retention handling for inactive data." },
      { question: "Where can I read the legal details?", answer: "Review the Privacy Policy and Terms of Service for the governing data-handling, retention, third-party, and service provisions." },
    ],
    related: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
      { href: "/contact", label: "Contact support" },
    ],
  },
  about: {
    path: "/about",
    eyebrow: "About Acutize",
    title: "A guided workspace for practical work with tabular data",
    intro:
      "Acutize brings common data preparation, exploratory analysis, forecasting, model comparison, and export workflows together for people working with business datasets.",
    summaryTitle: "Built to make the first stages of data work easier to review",
    summary:
      "The product focuses on structured file workflows where users need to understand a dataset, make preparation choices, explore possible findings, and produce useful outputs without rebuilding the same setup for every project.",
    highlights: [
      { title: "Practical scope", text: "Acutize works with CSV, Excel, JSON, and Parquet datasets used in analysis, operations, reporting, forecasting, and early model exploration." },
      { title: "Visible workflow", text: "The interface connects profiling, cleaning, insights, features, models, forecasts, and exports while keeping the major steps understandable." },
      { title: "Responsible expectations", text: "Generated insights, forecasts, and model results are starting points that require validation, not guarantees or substitutes for qualified judgment." },
    ],
    workflow: [
      { title: "Start with the source", text: "Upload a structured dataset and confirm that its rows, columns, and types match the intended question." },
      { title: "Improve readiness", text: "Review quality and choose preparation steps appropriate to the source and destination." },
      { title: "Explore useful paths", text: "Generate insights, forecasts, feature ideas, or model comparisons when the data supports them." },
      { title: "Take the work forward", text: "Export data, reports, scripts, and bundles for review or continued work in other tools." },
    ],
    bestFor: [
      "Business and data analysts working with tabular files.",
      "Operations teams that need clearer information from recurring exports.",
      "Practitioners evaluating a dataset before investing in deeper engineering.",
    ],
    faq: [
      { question: "What problem does Acutize solve?", answer: "It reduces the setup and tool-switching involved in profiling, cleaning, exploring, and exporting structured datasets." },
      { question: "Is Acutize an autonomous decision maker?", answer: "No. It supports analysis workflows. Users remain responsible for validating data, generated outputs, assumptions, and decisions." },
      { question: "Can I try it without a credit card?", answer: "Yes. The free plan is intended to let users try the main workflow before choosing a paid plan." },
      { question: "How can I ask a product question?", answer: "Use the public Help Center for workflow guidance or contact support for account, billing, company, and product questions." },
    ],
    related: [
      { href: "/ai-data-cleaning", label: "Explore data cleaning" },
      { href: "/security", label: "Security and data handling" },
      { href: "/help", label: "Help Center" },
    ],
  },
};
