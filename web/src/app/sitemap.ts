import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

const pages = [
  ["/", "weekly", 1],
  ["/pricing", "weekly", 0.9],
  ["/ai-data-cleaning", "monthly", 0.8],
  ["/csv-data-cleaning", "monthly", 0.8],
  ["/data-quality-analysis", "monthly", 0.8],
  ["/automated-eda", "monthly", 0.8],
  ["/no-code-machine-learning", "monthly", 0.8],
  ["/business-data-forecasting", "monthly", 0.8],
  ["/use-cases/data-analysts", "monthly", 0.7],
  ["/use-cases/operations-teams", "monthly", 0.7],
  ["/security", "monthly", 0.6],
  ["/about", "monthly", 0.6],
  ["/help", "weekly", 0.7],
  ["/contact", "monthly", 0.5],
  ["/privacy", "yearly", 0.3],
  ["/terms", "yearly", 0.3],
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(([path, changeFrequency, priority]) => ({
    url: SITE_URL + path,
    changeFrequency,
    priority,
  }));
}
