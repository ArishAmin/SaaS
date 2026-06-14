/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Acutize",
  description: "Learn how Acutize collects, uses, stores, and protects your personal data and uploaded datasets.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <Link href="/dashboard" className="text-sm text-foreground/60 hover:text-foreground mb-6 inline-block">
            Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mt-2">Privacy Policy</h1>
          <p className="text-foreground/60 mt-3 text-base">Last updated: June, 2026</p>
        </div>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Who We Are</h2>
            <p>
              Acutize is an AI-powered data preparation and machine learning platform. This Privacy Policy explains how
              Acutize collects, stores, uses, and safeguards personal information when you use services at{" "}
              <strong>acutize.com</strong>. If you have questions, contact{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-2">We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Your name and email address when you register.</li>
              <li>
                <strong>Uploaded Data:</strong> Files (CSV, Excel, JSON, Parquet) that you upload to use our analysis,
                cleaning, forecasting, reporting, and model-preview features. These files and generated outputs are
                stored in private account-scoped storage so you can return to the latest state and download results.
              </li>
              <li><strong>Usage Data:</strong> Platform interactions, feature usage, and error events used to operate, secure, and improve the product. We do not sell this data.</li>
              <li><strong>Communication:</strong> If you contact us via our support form or email, we retain those messages to respond and improve our service quality.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate and identify you securely within the platform.</li>
              <li>To process your uploaded datasets through analysis, cleaning, feature-generation, forecasting, reporting, and model-preview workflows.</li>
              <li>To maintain your dataset workspace, latest processed outputs, exports, reports, credit usage, and account settings.</li>
              <li>To send essential account, security, billing, and service notifications.</li>
              <li>To improve platform reliability, diagnose errors, and develop new features based on aggregate usage trends.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Data Storage & Security</h2>
            <p>
              Uploaded raw files, cleaned datasets, engineered datasets, reports, and related workflow artifacts are
              stored in private cloud storage and linked to your account. Database and storage rules are designed to
              isolate each user's records and files, and server-side routes verify ownership before returning dataset
              data, exports, or reports. Data is transmitted over HTTPS, and storage/database encryption is handled by
              our cloud infrastructure providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Retention</h2>
            <p>
              Active datasets are retained while they remain in your workspace so you can view the latest state, rerun
              steps, and download outputs. If you delete a dataset through the dashboard, Acutize deletes the dataset
              record and related stored artifacts. In addition, inactive datasets are eligible for automated cleanup
              after 30 days from their last update, and shared report links are eligible for cleanup after 30 days.
              Account deletion requests are handled through support and associated account data is removed according
              to operational and legal requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Third-Party Services</h2>
            <p className="mb-2">We use trusted third-party providers to operate the platform:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase:</strong> User authentication, relational database management, and private object storage.</li>
              <li><strong>Paddle:</strong> Subscription checkout, customer billing, invoices, and tax handling for paid plans.</li>
              <li><strong>Render or hosting provider:</strong> Application hosting, scheduled cleanup jobs, and API infrastructure.</li>
              <li><strong>Email/support providers:</strong> Support messages and transactional communication when configured.</li>
            </ul>
            <p className="mt-2">We do not sell, trade, or rent your personal information to third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Cookies</h2>
            <p>
              We use essential session cookies to maintain your authenticated state across page visits. Your theme
              preference is stored locally in your browser. If analytics is enabled, we use it to understand product
              usage and improve reliability, not to sell advertising profiles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Your Rights</h2>
            <p className="mb-2">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Object to specific types of data processing.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, email us at{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date
              at the top of this page. We encourage you to review this policy periodically to stay informed about how
              we protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Contact Us</h2>
            <p>
              For privacy-related questions or requests, please reach out to us at{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 flex gap-6 text-sm text-foreground/60">
          <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link href="/help" className="hover:text-foreground">Help Center</Link>
          <Link href="/dashboard/contact" className="hover:text-foreground">Contact Support</Link>
        </div>
      </div>
    </div>
  );
}
