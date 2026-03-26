import { execSync } from "child_process";
import { createConnection } from "net";

async function checkPostgres(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "localhost", port: 5432 });
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.setTimeout(3000, () => { socket.destroy(); resolve(false); });
  });
}

export default async function globalSetup() {
  // 1. Check TEST_MODE
  if (!process.env.TEST_MODE) {
    throw new Error(
      "TEST_MODE environment variable is not set. E2E tests require TEST_MODE=true to use mock agents.\n" +
      "Run: TEST_MODE=true pnpm test:e2e"
    );
  }

  // 2. Check PostgreSQL (TCP connect, no pg_isready binary needed)
  const pgReady = await checkPostgres();
  if (!pgReady) {
    throw new Error(
      "PostgreSQL is not running on localhost:5432.\n" +
      "Start with: docker compose -f ui/e2e/docker-compose.e2e.yml up -d"
    );
  }

  // 3. Run migrations
  try {
    execSync("cd ../packages/db && pnpm drizzle-kit push", {
      timeout: 30000,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
  } catch (e) {
    throw new Error(`Database migration failed: ${e}`);
  }

  // 4. Create auth storageState
  const { chromium } = await import("@playwright/test");
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
