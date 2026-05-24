import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Acutize",
  description: "Learn how Acutize collects, uses, and protects your personal data and uploaded datasets.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <Link href="/dashboard" className="text-sm text-foreground/60 hover:text-foreground mb-6 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mt-2">Privacy Policy</h1>
          <p className="text-foreground/60 mt-3 text-base">
            Last updated: May, 2026
          </p>
        </div>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Who We Are</h2>
            <p>
              Acutize ("we", "us", or "our") is an AI-powered data preparation and machine learning platform. This Privacy Policy explains how we collect, store, use, and safeguard your personal information when you use our services at <strong>acutize.com</strong>. If you have questions, contact us at{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-2">We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Your name and email address when you register.</li>
              <li><strong>Uploaded Data:</strong> Files (CSV, Excel, JSON) that you upload to use our analysis and training features. These files are stored in a private, encrypted cloud partition linked exclusively to your account.</li>
              <li><strong>Usage Data:</strong> Anonymised platform interactions (e.g., features used, session duration) to help us improve the product. We do not sell this data.</li>
              <li><strong>Communication:</strong> If you contact us via our support form or email, we retain those messages to respond and improve our service quality.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate and identify you securely within the platform.</li>
              <li>To process your uploaded datasets through our proprietary AI analysis, cleaning, and model training pipelines.</li>
              <li>To send you essential account and security notifications (we do not send marketing emails without your explicit consent).</li>
              <li>To improve platform reliability, diagnose errors, and develop new features based on aggregate usage trends.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Data Storage & Security</h2>
            <p>
              All uploaded files are stored in isolated, private cloud storage. Each user's data is logically separated — no other user or administrator can access your files. We use industry-standard encryption in transit (TLS 1.3) and at rest (AES-256). Our infrastructure is hosted on globally distributed, SOC 2-certified cloud providers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Retention</h2>
            <p>
              Your uploaded datasets and generated reports are retained for as long as your account is active. If you delete a dataset through the dashboard, it is permanently removed from our storage within 30 days. Upon account deletion, all associated data is purged within 90 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Third-Party Services</h2>
            <p className="mb-2">We use the following trusted third-party providers to operate the platform:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase:</strong> Secure user authentication and relational database management.</li>
              <li><strong>Cloud Object Storage:</strong> Encrypted private file storage per user session.</li>
            </ul>
            <p className="mt-2">We do not sell, trade, or rent your personal information to third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Cookies</h2>
            <p>
              We use essential session cookies to maintain your authenticated state across page visits. We do not use tracking cookies or third-party advertising cookies. Your theme preference (light/dark mode) is stored locally in your browser and never transmitted to our servers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Your Rights</h2>
            <p className="mb-2">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your account and all associated data.</li>
              <li>Object to specific types of data processing.</li>
            </ul>
            <p className="mt-2">To exercise any of these rights, email us at <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date at the top of this page. We encourage you to review this policy periodically to stay informed about how we protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Contact Us</h2>
            <p>
              For any privacy-related questions or requests, please reach out to us at:{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 flex gap-6 text-sm text-foreground/60">
          <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link href="/dashboard/contact" className="hover:text-foreground">Contact Support</Link>
          <Link href="/dashboard" className="hover:text-foreground">Back to App</Link>
        </div>
      </div>
    </div>
  );
}
