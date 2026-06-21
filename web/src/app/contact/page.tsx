"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Clock, ShieldCheck, Zap } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function ContactPage() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const data = {
      firstName: (document.getElementById("firstName") as HTMLInputElement).value,
      lastName: (document.getElementById("lastName") as HTMLInputElement).value,
      email: (document.getElementById("email") as HTMLInputElement).value,
      subject: (document.getElementById("subject") as HTMLSelectElement).value,
      message: (document.getElementById("message") as HTMLTextAreaElement).value,
    };

    try {
      await apiRequest("/support/contact", {
        method: "POST",
        body: data,
      });
      toast.success("Thank you for reaching out! A member of our team will contact you shortly.");
      const form = e.target as HTMLFormElement;
      form.reset();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send message. Please try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar />
      <main className="flex-grow pt-24 pb-20">
        <div className="flex flex-col gap-6 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-4 text-slate-900 dark:text-white">Contact Support</h1>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg max-w-2xl">
              Questions about Acutize, custom plans, or onboarding integrations? Our AI data scientists and engineers are here to assist. Provide details below and we'll route it directly to our experts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start mt-4">
            {/* Left column for contact info & trust markers */}
            <div className="md:col-span-1 space-y-6">
              <Card className="bg-slate-100 dark:bg-slate-900 border-none shadow-none">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                    <Mail className="w-4 h-4" />
                    Direct Email
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <a href="mailto:support@acutize.com" className="text-sm font-medium hover:underline text-blue-600 dark:text-blue-400">support@acutize.com</a>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Average response time: &lt;2 hours</p>
                </CardContent>
              </Card>

              <div className="space-y-4 px-2">
                <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500 dark:text-slate-400">Our Promise</h3>

                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Private workspace controls</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Uploaded datasets and generated outputs are stored in account-scoped private storage with ownership checks on dataset access, exports, and reports.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Instant AI Pipelines</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">We optimize models instantly by deploying advanced deterministic frameworks rather than slow, generic LLMs.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">24/7 Availability</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Our distributed systems scale asynchronously globally.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column for the actual form form */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
                <CardDescription>Questions, feedback, or need help? We typically respond within a few hours.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="firstName" className="text-sm font-medium">First Name</label>
                      <input
                        required
                        id="firstName"
                        type="text"
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="lastName" className="text-sm font-medium">Last Name</label>
                      <input
                        required
                        id="lastName"
                        type="text"
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium">Work Email</label>
                    <input
                      required
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="subject" className="text-sm font-medium">Topic</label>
                    <select id="subject" className="theme-select flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
                      <option value="enterprise" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">Enterprise Sales</option>
                      <option value="support" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">Technical Support</option>
                      <option value="bug" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">Bug Report</option>
                      <option value="other" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="message" className="text-sm font-medium">Details</label>
                    <textarea
                      required
                      id="message"
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Tell us exactly how we can help you..."
                    ></textarea>
                  </div>

                  <Button type="submit" className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
                    {loading ? "Sending securely..." : "Send Message"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
