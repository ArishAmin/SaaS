/**
 * Browser QA — login and hit every dashboard route; collect failed fetches.
 */
import { chromium } from "playwright";

const BASE = process.env.WEB_BASE || "http://localhost:3000";
const EMAIL = "aminarish88@gmail.com";
const PASS = "arish123";

const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/terms",
  "/privacy",
  "/dashboard",
  "/dashboard/datasets",
  "/dashboard/analyzer",
  "/dashboard/cleaning",
  "/dashboard/feature-generation",
  "/dashboard/recommendation",
  "/dashboard/training",
  "/dashboard/evaluation",
  "/dashboard/export",
  "/dashboard/settings",
  "/dashboard/contact",
  "/dashboard/assistant",
  "/dashboard/feature-engineering",
  "/dashboard/feature-importance",
];

const failures = [];
const apiCalls = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (url.includes("127.0.0.1:8001") || url.includes("localhost:8001")) {
      failures.push({
        type: "requestfailed",
        url,
        method: req.method(),
        error: req.failure()?.errorText || "unknown",
      });
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes(":8001")) return;
    const status = res.status();
    apiCalls.push({ url, status, method: res.request().method() });
    if (status === 0 || status >= 500) {
      failures.push({ type: "bad_status", url, status });
    }
  });

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => null);

  const afterLogin = page.url();
  console.log("After login URL:", afterLogin);
  if (!afterLogin.includes("/dashboard")) {
    const toast = await page.locator("[data-sonner-toast]").allTextContents().catch(() => []);
    console.log("Login toasts:", toast);
    process.exit(1);
  }

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(1500);
      const body = await page.textContent("body");
      const hasFailedFetch =
        body?.includes("Failed to fetch") ||
        body?.includes("failed to fetch") ||
        body?.includes("Check if backend is running");
      if (hasFailedFetch) {
        failures.push({ type: "ui_error", route, snippet: body?.slice(0, 200) });
      }
      console.log("OK route", route, "->", page.url());
    } catch (e) {
      failures.push({ type: "navigation", route, error: String(e) });
      console.log("FAIL route", route, e.message);
    }
  }

  await browser.close();

  const networkFails = failures.filter((f) => f.type === "requestfailed");
  const uniqueFails = [...new Map(networkFails.map((f) => [f.url + f.error, f])).values()];

  console.log("\n=== API calls to backend ===");
  const byPath = {};
  for (const c of apiCalls) {
    const path = c.url.replace(/https?:\/\/[^/]+/, "");
    byPath[path] = byPath[path] || [];
    byPath[path].push(c.status);
  }
  for (const [p, statuses] of Object.entries(byPath).sort()) {
    console.log(`  ${p}: ${statuses.join(",")}`);
  }

  console.log("\n=== Network failures (8001) ===");
  if (uniqueFails.length === 0) console.log("  (none)");
  for (const f of uniqueFails) console.log(`  ${f.method} ${f.url} — ${f.error}`);

  console.log("\n=== UI / other issues ===");
  const other = failures.filter((f) => f.type !== "requestfailed");
  if (other.length === 0) console.log("  (none)");
  for (const f of other) console.log(" ", JSON.stringify(f));

  process.exit(uniqueFails.length > 0 || other.some((o) => o.type === "ui_error") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
