// ─── Shared validation helpers ────────────────────────────────

/**
 * Validates an agent or template name/ID.
 * Rules: non-empty, max 64 chars, no / \ . or whitespace.
 */
export const isValidName = (n: string): boolean =>
  n.length > 0 && n.length <= 64 && !/[/\\.\s]/.test(n);
