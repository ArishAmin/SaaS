"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Database,
  Lock,
  Sparkles,
  Wand2,
  Zap,
  CheckCircle2,
  ShieldCheck,
  Rocket,
} from "lucide-react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";
import { PricingSection } from "@/components/marketing/PricingSection";
import { Navbar } from "@/components/layout/Navbar";

const features = [
  {
    icon: Sparkles,
    title: "Instant Intelligence",
    description: "Get a bird's-eye view of your data quality and potential in seconds, not hours.",
  },
  {
    icon: Wand2,
    title: "No-Code Data Prep",
    description: "Handle missing values, outliers, and complex encodings with guided, intelligent tools.",
  },
  {
    icon: Zap,
    title: "Rapid Prototyping",
    description: "Train multiple advanced models simultaneously to find the best fit for your specific problem.",
  },
  {
    icon: BarChart3,
    title: "Clear Performance Metrics",
    description: "Translate complex math into actionable insights with side-by-side performance comparisons.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise-Grade Privacy",
    description: "Your data is isolated and protected with the highest standards of modern security.",
  },
  {
    icon: Rocket,
    title: "Built for Momentum",
    description: "Designed for teams that need to iterate fast and ship reliable models to production.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-[#030303] dark:text-zinc-50 selection:bg-indigo-500/30">
      <Navbar />

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative pt-24 pb-20 lg:pt-32 lg:pb-40 overflow-hidden">
          {/* Animated Background Gradients */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] -z-10 pointer-events-none overflow-hidden">
            <div className="absolute top-[-100px] left-[-150px] w-[600px] h-[600px] bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute top-[-50px] right-[-150px] w-[600px] h-[600px] bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-[120px] animate-pulse [animation-delay:1s]" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[100px]" />
          </div>

          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
            <div className="text-center">
              <h1 className="mx-auto max-w-5xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-[1.1] bg-clip-text text-transparent bg-linear-to-b from-zinc-900 via-zinc-800 to-zinc-600 dark:from-white dark:via-zinc-200 dark:to-zinc-500">
                Ship reliable models <br className="hidden md:block" /> from messy data in minutes.
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Acutize automates the tedious parts of data science. Upload, clean, and benchmark your models in one seamless workflow.
              </p>
              <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button size="lg" className="h-14 min-w-[220px] rounded-full text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/25 transition-all hover:scale-105 active:scale-95" asChild>
                  <Link href="/signup">Build Your First Model</Link>
                </Button>
                <Button size="lg" variant="outline" className="h-14 min-w-[220px] rounded-full text-base font-semibold border-zinc-200 dark:border-white/10 bg-white/50 backdrop-blur-sm dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all" asChild>
                  <Link href="#how-it-works">Learn the Process</Link>
                </Button>
              </div>
              <div className="mt-10 flex items-center justify-center gap-8 text-sm font-medium text-zinc-400 dark:text-zinc-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No complex setup
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Clean & Secure
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Production-Ready
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 border-y border-zinc-200/50 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-zinc-900 dark:text-white">
                Everything you need to master your data
              </h2>
              <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
                A purpose-built suite of tools designed to take you from CSV to a performing model with zero friction.
              </p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <div
                  key={f.title}
                  className="group relative rounded-3xl border border-zinc-200/50 bg-white p-8 dark:border-white/5 dark:bg-zinc-900/50 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 mb-6 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">{f.title}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-sm">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works / Workflow Section */}
        <section id="how-it-works" className="py-24 overflow-hidden">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:flex lg:items-center lg:gap-16">
              <div className="lg:w-1/2">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-zinc-900 dark:text-white mb-8">
                  A predictable path to <br /> model success.
                </h2>
                <div className="space-y-12">
                  {[
                    {
                      step: "01",
                      title: "Secure Upload & Validation",
                      content: "Upload your data files to your private, isolated workspace. We validate types and structure instantly."
                    },
                    {
                      step: "02",
                      title: "Automated Insights",
                      content: "Get immediate reports on data hygiene, column correlations, and hidden quality issues."
                    },
                    {
                      step: "03",
                      title: "Intelligent Preparation",
                      content: "Handle data cleaning and feature engineering using our guided interface. No more manual scripts."
                    },
                    {
                      step: "04",
                      title: "Benchmarking & Export",
                      content: "Train multiple algorithms in parallel, compare metrics side-by-side, and ship the best performer."
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-6">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-bold dark:bg-zinc-800 dark:text-zinc-400">
                        {item.step}
                      </span>
                      <div>
                        <h4 className="font-bold text-zinc-900 dark:text-white">{item.title}</h4>
                        <p className="mt-2 text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">{item.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-16 lg:mt-0 lg:w-1/2 relative">
                <div className="aspect-square rounded-3xl bg-linear-to-br from-indigo-500/20 via-purple-500/10 to-transparent p-1">
                  <div className="h-full w-full rounded-[calc(1.5rem-1px)] bg-white dark:bg-zinc-950 border border-zinc-200/50 dark:border-white/5 flex items-center justify-center overflow-hidden relative shadow-2xl">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(99,102,241,0.15),transparent)]" />
                    {/* Placeholder for an actual app screenshot or illustration */}
                    <div className="text-center p-8 z-10">
                      <BarChart3 className="h-16 w-16 text-indigo-500 mx-auto mb-4 opacity-50" />
                      <p className="text-sm font-medium text-zinc-400">Interactive Pipeline Visualization</p>
                    </div>
                  </div>
                </div>
                {/* Float Elements */}
                <div className="absolute -top-6 -right-6 h-24 w-24 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-white/5 shadow-xl flex items-center justify-center animate-bounce [animation-duration:4s]">
                  <Zap className="h-8 w-8 text-amber-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Acutize Section */}
        <section id="why-acutize" className="py-24 bg-zinc-900 text-white dark:bg-white dark:text-black rounded-[3rem] mx-4 sm:mx-6 lg:mx-8 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-indigo-600/20 blur-[120px] -z-0" />
          <div className="mx-auto max-w-7xl px-8 relative z-10">
            <div className="max-w-3xl">
              <h2 className="text-4xl font-extrabold tracking-tight mb-8">
                Stop fighting frameworks, <br /> start solving problems.
              </h2>
              <div className="grid gap-10 sm:grid-cols-2">
                <div>
                  <h4 className="text-indigo-400 dark:text-indigo-600 font-bold mb-2">Build with confidence</h4>
                  <p className="text-zinc-400 dark:text-zinc-500 text-sm leading-relaxed">
                    Acutize ensures your data is statistically sound before you ever hit "train", reducing the risk of biased or failing models.
                  </p>
                </div>
                <div>
                  <h4 className="text-indigo-400 dark:text-indigo-600 font-bold mb-2">Team-ready collaboration</h4>
                  <p className="text-zinc-400 dark:text-zinc-500 text-sm leading-relaxed">
                    Share your findings with stakeholders through secure, professional reports that anyone can understand.
                  </p>
                </div>
              </div>
              <Button size="lg" className="mt-12 rounded-full px-10 bg-white text-black hover:bg-zinc-200 dark:bg-black dark:text-white" asChild>
                <Link href="/signup">Join the Beta</Link>
              </Button>
            </div>
          </div>
        </section>

        <PricingSection hideCTA={true} />

        {/* CTA Section */}
        <section className="py-32">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <h2 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white mb-6">
              Ready to take flight?
            </h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-10">
              Start for free today. Upgrade as your data needs grow.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="h-14 min-w-[240px] rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/25 transition-all hover:scale-105" asChild>
                <Link href="/signup">Get Started Now</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
