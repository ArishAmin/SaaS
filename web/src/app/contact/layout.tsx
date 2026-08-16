import type { ReactNode } from "react";

import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Contact Support",
  description: "Contact Acutize for product support, billing questions, company workspaces, and custom data-processing needs.",
  path: "/contact",
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
