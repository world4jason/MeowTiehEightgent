import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

interface MockResponse {
  chunks: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, "../../../ui/e2e/fixtures/mock-responses");

function loadFixture(tag: string): MockResponse {
  const path = join(FIXTURES_DIR, `${tag}.json`);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8")) as MockResponse;
  }
  return { chunks: ["This is a mock response from the test agent. ", "It simulates a real LLM reply."] };
}

export class MockAgent {
  async *stream(prompt: string, tag?: string): AsyncGenerator<string> {
    const fixture = loadFixture(tag ?? "default");
    for (const chunk of fixture.chunks) {
      yield chunk;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
