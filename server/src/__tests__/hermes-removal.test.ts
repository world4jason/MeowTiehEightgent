import { describe, expect, it } from "vitest";
import { AGENT_ADAPTER_TYPES } from "@meowtieheightgent/shared";
import { findServerAdapter, listServerAdapters } from "../adapters/index.js";

// Regression guard: hermes-paperclip-adapter was removed in 2026-03-22.
// These tests ensure it never comes back via accidental re-addition.

describe("hermes_local removal regression", () => {
  it("AGENT_ADAPTER_TYPES does not contain hermes_local", () => {
    expect(AGENT_ADAPTER_TYPES).not.toContain("hermes_local");
  });

  it("adapter registry has no hermes_local entry", () => {
    const adapter = findServerAdapter("hermes_local");
    expect(adapter).toBeNull();
  });

  it("listServerAdapters returns no hermes_local adapter", () => {
    const types = listServerAdapters().map((a) => a.type);
    expect(types).not.toContain("hermes_local");
  });
});
