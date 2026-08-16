import { Suspense } from "react";
import { CheckoutLauncher } from "./CheckoutLauncher";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Secure Checkout",
  description: "Complete your Acutize subscription checkout.",
  path: "/checkout",
  noIndex: true,
});

function CheckoutFallback() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 h-10 w-10 rounded-full border-2 border-slate-700 border-t-blue-400 animate-spin" />
        <h1 className="text-xl font-semibold">Opening secure checkout</h1>
        <p className="mt-2 text-sm text-slate-400">This usually takes a moment.</p>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <CheckoutLauncher />
    </Suspense>
  );
}
