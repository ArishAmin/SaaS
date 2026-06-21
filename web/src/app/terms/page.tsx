/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Acutize",
  description: "Read the Acutize Terms of Service for business use of the data preparation and machine learning platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <Link href="/dashboard" className="text-sm text-foreground/60 hover:text-foreground mb-6 inline-block">
            Back to Dashboard
          </Link>
          <h1 className="text-4xl font-bold tracking-tight mt-2">Terms of Service</h1>
          <p className="text-foreground/60 mt-3 text-base">Last updated: June, 2026</p>
        </div>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/85 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Agreement to These Terms</h2>
            <p>
              These Terms of Service govern access to and use of Acutize, including the website, dashboard, APIs,
              data-processing workflows, reports, exports, and related services. By creating an account, accessing the
              Service, or using the Service on behalf of a company or other organization, you confirm that you have
              authority to bind that organization to these Terms. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Business Use and Account Responsibility</h2>
            <p>
              Acutize is intended for business, professional, and internal analytics use. Account owners are responsible
              for the users, credentials, files, datasets, exports, and activity under their account. You must provide
              accurate account information, keep credentials secure, and promptly notify{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>{" "}
              of suspected unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Service Description</h2>
            <p>
              Acutize provides tools for uploading tabular datasets, profiling data, cleaning and encoding columns,
              generating business insights, suggesting features, previewing machine-learning model direction,
              forecasting dated metrics, creating reports, and exporting files or scripts. The Service is not a
              substitute for legal, financial, medical, compliance, or professional data-science review.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Customer Data and Ownership</h2>
            <p>
              You retain ownership of datasets, files, prompts, inputs, and other content uploaded to Acutize
              ("Customer Data"). Acutize does not claim ownership of Customer Data. You grant Acutize a limited right to
              host, store, copy, process, transform, analyze, and display Customer Data only as needed to provide,
              secure, troubleshoot, support, and improve the Service.
            </p>
            <p>
              You are responsible for ensuring that you have all required rights, notices, consents, permissions, and
              legal bases to upload and process Customer Data in Acutize, including any personal, confidential, or
              third-party data contained in your datasets.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Storage, Retention, and Deletion</h2>
            <p>
              Uploaded datasets and generated outputs may be stored so the workspace can show the latest state, support
              reruns, and provide downloads. Active datasets remain available while they remain in your workspace.
              Datasets deleted through the dashboard are removed from the dataset record and related stored artifacts.
              Inactive datasets are eligible for automated cleanup after 30 days from the last update, and shared report
              links are eligible for cleanup after 30 days. More detail is available in the Privacy Policy and Help
              Center.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Acceptable Use</h2>
            <p className="mb-2">You must not use the Service to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Upload illegal content, malware, viruses, or files intended to disrupt systems.</li>
              <li>Upload regulated or highly sensitive data unless you have confirmed that your use is lawful and appropriate for the Service.</li>
              <li>Violate privacy, intellectual-property, contractual, export-control, or other applicable laws.</li>
              <li>Attempt to bypass authentication, rate limits, credit limits, plan limits, or security controls.</li>
              <li>Reverse engineer, scrape, benchmark for competitive purposes, or extract source code, models, or system logic except where law prohibits this restriction.</li>
              <li>Resell, sublicense, or provide the Service to third parties without written permission.</li>
              <li>Use outputs as the sole basis for high-impact decisions without independent review by qualified professionals.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Plans, Credits, Billing, and Taxes</h2>
            <p>
              Some actions require credits. Plan limits, credit amounts, file-size limits, dataset limits, pricing, and
              supported features are described on the pricing and usage pages. Free credits are promotional, may be
              one-time, and do not automatically renew unless stated. Paid plans refresh credits on the applicable
              billing cycle. Unused credits may expire or reset according to the applicable plan.
            </p>
            <p>
              Paid subscriptions are billed through the payment provider shown at checkout. Prices may exclude taxes,
              VAT, duties, or similar charges. Unless required by law or expressly stated, fees are non-refundable once
              a billing period begins or credits are consumed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Outputs, Reports, Forecasts, and Model Results</h2>
            <p>
              Reports, forecasts, model metrics, feature suggestions, model recommendations, exported scripts, and other
              outputs are generated from your data and selected settings. Outputs may be incomplete, inaccurate, or
              unsuitable for a particular business purpose. You are responsible for validating outputs before relying on
              them in production, operational, financial, legal, regulatory, or customer-facing decisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Confidentiality</h2>
            <p>
              Customer Data is treated as confidential account content. Acutize uses Customer Data to provide and support
              the Service and does not sell Customer Data. You must also protect any confidential information, reports,
              exports, credentials, support responses, or non-public Service information received through Acutize.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Security and Third-Party Providers</h2>
            <p>
              Acutize uses technical and organizational measures designed to protect accounts, datasets, and stored
              artifacts. No online service can guarantee absolute security. The Service depends on third-party providers
              for hosting, authentication, storage, payments, email, logging, and related infrastructure. Acutize may
              change providers as needed to operate and improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Intellectual Property</h2>
            <p>
              Acutize and its licensors retain all rights in the Service, including software, workflows, interface,
              documentation, trademarks, and underlying technology. These Terms do not grant you ownership of the
              Service. Subject to these Terms, Acutize grants you a limited, non-exclusive, non-transferable right to
              access and use the Service for your internal business purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">12. Feedback</h2>
            <p>
              If you provide suggestions, ideas, or feedback, Acutize may use them without restriction or compensation,
              provided that doing so does not require disclosure of your Customer Data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">13. Service Changes, Availability, and Beta Features</h2>
            <p>
              Acutize may modify, suspend, limit, or discontinue parts of the Service, including features, credit costs,
              model availability, file limits, or plan packaging. The Service may include beta, experimental, or preview
              features that are provided as-is and may change or be removed without notice. Acutize does not guarantee
              uninterrupted or error-free operation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">14. Suspension and Termination</h2>
            <p>
              Acutize may suspend or terminate access if there is a suspected violation of these Terms, security risk,
              non-payment, abusive usage, legal requirement, or risk to the Service or other users. You may stop using
              the Service at any time. Account deletion or data deletion requests can be sent to{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.
              Data deletion is handled according to the Privacy Policy and operational retention requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">15. Disclaimers</h2>
            <p>
              To the maximum extent permitted by law, the Service is provided "as is" and "as available" without
              warranties of any kind, whether express, implied, statutory, or otherwise. Acutize disclaims warranties of
              merchantability, fitness for a particular purpose, non-infringement, accuracy, availability, and that the
              Service or outputs will meet your requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">16. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Acutize will not be liable for indirect, incidental, special,
              consequential, exemplary, or punitive damages, including loss of profits, revenue, goodwill, data, business
              opportunity, or business interruption. To the maximum extent permitted by law, Acutize's total liability
              for claims related to the Service will not exceed the amounts paid by you to Acutize for the Service in
              the three months before the event giving rise to the claim, or USD $100 if no paid subscription exists.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">17. Indemnity</h2>
            <p>
              You agree to defend and indemnify Acutize from claims, damages, liabilities, costs, and expenses arising
              from Customer Data, your use of the Service, violation of these Terms, violation of law, or infringement
              of third-party rights, to the extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">18. Governing Law and Disputes</h2>
            <p>
              These Terms are governed by applicable law, without regard to conflict-of-law rules. Any dispute will be
              handled in the courts or forum available under applicable law unless Acutize and the customer agree to a
              separate written contract that states otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">19. Changes to These Terms</h2>
            <p>
              Acutize may update these Terms from time to time. The "Last updated" date will be revised when changes
              are made. Continued use of the Service after updated Terms are posted means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">20. Contact</h2>
            <p>
              For questions about these Terms, contact{" "}
              <a href="mailto:support@acutize.com" className="underline text-foreground">support@acutize.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-black/10 dark:border-white/10 flex gap-6 text-sm text-foreground/60">
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link href="/help" className="hover:text-foreground">Help Center</Link>
          <Link href="/contact" className="hover:text-foreground">Contact Support</Link>
        </div>
      </div>
    </div>
  );
}
