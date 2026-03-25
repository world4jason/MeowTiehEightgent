import { execSync } from "child_process";

export default async function globalSetup() {
  // 1. Check TEST_MODE
  if (!process.env.TEST_MODE) {
    throw new Error(
      "TEST_MODE environment variable is not set. E2E tests require TEST_MODE=true to use mock agents.\n" +
      "Run: TEST_MODE=true pnpm test:e2e"
    );
  }

  // 2. Check PostgreSQL
  try {
    execSync("pg_isready -h localhost -p 5432", { timeout: 5000 });
  } catch {
    throw new Error(
      "PostgreSQL is not running.\n" +
      "Start with: docker compose -f ui/e2e/docker-compose.e2e.yml up -d"
    );
  }

  // 3. Run migrations
  try {
    execSync("cd server && pnpm drizzle-kit push", {
      timeout: 30000,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
  } catch (e) {
    throw new Error(`Database migration failed: ${e}`);
  }

  // 4. Create auth storageState
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("http://localhost:5173");
    const resp = await page.request.post("http://localhost:3100/auth/sign-in", {
      data: { email: "test@meowtieh.local", password: "test-password-e2e" },
    });
    if (resp.ok()) {
      await context.storageState({ path: "e2e/.auth/user.json" });
      console.log("[e2e] Auth storageState saved");
    } else {
      console.log("[e2e] Auth not required or test user not found — proceeding without auth");
    }
  } catch {
    console.log("[e2e] Auth endpoint unavailable — proceeding without auth state");
  } finally {
    await browser.close();
  }

  console.log("[e2e] Global setup complete: TEST_MODE=true, DB ready, migrations applied");
}
