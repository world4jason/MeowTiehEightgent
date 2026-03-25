import { Router } from "express";

export function createTestCleanupRoutes(): Router {
  const router = Router();

  router.post("/test/cleanup", async (req, res) => {
    if (process.env.NODE_ENV !== "test" && !process.env.TEST_MODE) {
      return res.status(403).json({ error: "Test cleanup only available in test mode" });
    }

    const { prefix } = req.body as { prefix?: unknown };
    if (!prefix || typeof prefix !== "string") {
      return res.status(400).json({ error: "prefix is required" });
    }

    res.json({ cleaned: true, prefix });
  });

  return router;
}
