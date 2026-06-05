import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Acutize | Clean, Analyze, and Train Models on Datasets Online",
  description:
    "Upload CSV, Excel, JSON, or Parquet files to clean data, analyze patterns, preview ML models, and export reports from your browser.",
  icons: {
    icon: [{ url: "/logo-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo-mark.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Blocking inline script: reads localStorage before React hydrates to avoid theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('acutize:theme');
                  var theme = stored === 'dark' || stored === 'light' ? stored : 'dark';
                  if (theme === 'dark') document.documentElement.classList.add('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
        <script src="https://accounts.google.com/gsi/client" async defer />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
