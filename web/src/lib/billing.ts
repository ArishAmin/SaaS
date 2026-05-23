/** Must match API BILLING_ENFORCEMENT_ENABLED. Render blueprint sets both to true. */
export function isBillingEnforcementEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENFORCEMENT_ENABLED === "true";
}
