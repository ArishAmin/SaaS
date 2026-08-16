import type { Metadata } from "next";

export const SITE_URL = "https://www.acutize.com";

type MetadataOptions = {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
};

export function createMetadata({ title, description, path, noIndex = false }: MetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: noIndex ? undefined : { canonical: path },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        }
      : { index: true, follow: true },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
