import { describe, expect, it } from "vitest";
import { AGENT_ADAPTER_TYPES } from "@meowtieheightgent/shared";
import { findServerAdapter } from "../adapters/index.js";

// Regression guard: hermes-paperclip-adapter was removed on 2026-03-22.
// These tests ensure it never comes back via accidental re-addition.

describe("hermes_local removal regression", () => {
  it("AGENT_ADAPTER_TYPES does not contain hermes_local", () => {
    expect(AGENT_ADAPTER_TYPES).not.toContain("hermes_local");
  });

  it("adapter registry has no hermes_local entry", () => {
    expect(findServerAdapter("hermes_local")).toBeNull();
  });
});
