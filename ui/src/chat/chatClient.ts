import { makeApiClient } from "@/lib/makeApiClient";

const BASE = (import.meta.env.VITE_CHAT_URL ?? "http://localhost:8000") as string;
export const chatClient = makeApiClient(BASE);
// Re-export error type for catch clauses
export { ApiClientError as ChatApiError } from "@/lib/makeApiClient";
