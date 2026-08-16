import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { serializeJsonLd, SITE_URL } from "@/lib/seo";

export type SeoPageContent = {
  path: string;
  eyebrow: string;
  title: string;
  intro: string;
  summaryTitle: string;
  summary: string;
  highlights: Array<{ title: string; text: string }>;
  workflow: Array<{ title: string; text: string }>;
  bestFor: string[];
  faq: Array<{ question: string; answer: string }>;
  related: Array<{ href: string; label: string }>;
};

export function SeoLandingPage({ content }: { content: SeoPageContent }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: content.title,
            item: SITE_URL + content.path,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: content.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-[#050505] dark:text-zinc-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <Navbar />
      <main className="pt-16">
        <section className="border-b border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">
              <Link href="/" className="hover:text-blue-700 dark:hover:text-blue-300">
                Home
              </Link>
              <span aria-hidden="true" className="px-2">/</span>
              <span>{content.eyebrow}</span>
            </nav>
            <div className="max-w-4xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
                {content.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-5xl lg:text-6xl">
                {content.title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
                {content.intro}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Start free <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-18 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
                {content.summaryTitle}
              </h2>
              <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-300">{content.summary}</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {content.highlights.map((item) => (
                <article key={item.title} className="border border-zinc-200 p-6 dark:border-white/10 dark:bg-zinc-950">
                  <CheckCircle2 className="h-5 w-5 text-blue-700 dark:text-blue-300" />
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-300">{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-zinc-200 bg-zinc-50 py-18 dark:border-white/10 dark:bg-zinc-950 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">A practical workflow</h2>
              <div className="mt-8 space-y-7">
                {content.workflow.map((item, index) => (
                  <div key={item.title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 leading-7 text-zinc-600 dark:text-zinc-300">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Who this is for</h2>
              <ul className="mt-8 space-y-4">
                {content.bestFor.map((item) => (
                  <li key={item} className="flex gap-3 leading-7 text-zinc-700 dark:text-zinc-200">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-blue-700 dark:text-blue-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-18 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight">Frequently asked questions</h2>
            <div className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-white/10 dark:border-white/10">
              {content.faq.map((item) => (
                <article key={item.question} className="py-6">
                  <h3 className="text-lg font-semibold">{item.question}</h3>
                  <p className="mt-3 leading-7 text-zinc-600 dark:text-zinc-300">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-zinc-200 bg-zinc-50 py-16 dark:border-white/10 dark:bg-zinc-950">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold">Explore related workflows</h2>
            <div className="mt-6 flex flex-wrap gap-3">
              {content.related.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold transition hover:border-blue-600 hover:text-blue-700 dark:border-white/15 dark:bg-black dark:hover:text-blue-300"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-12 flex flex-col justify-between gap-6 border border-zinc-200 bg-white p-8 dark:border-white/10 dark:bg-black sm:flex-row sm:items-center">
              <div>
                <h2 className="text-2xl font-bold">Try the workflow with your own dataset</h2>
                <p className="mt-2 text-zinc-600 dark:text-zinc-300">Start on the free plan. No credit card is required.</p>
              </div>
              <Button size="lg" asChild>
                <Link href="/signup">Create an account</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
