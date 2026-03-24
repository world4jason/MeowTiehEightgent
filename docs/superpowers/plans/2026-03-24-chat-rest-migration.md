# Chat REST Migration (Plan B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Migrate all Chat REST endpoints from Python to Node.js Express routes, switch UI to unified backend, retire Python.

**Architecture:** Create Express routes in `server/src/chat/` that serve the same file-based data as Python. UI switches from `chatClient` (:8000) to Vite proxy `/chat/api` → Mth server. Python backend can be stopped.

**Spec:** `docs/superpowers/specs/2026-03-24-backend-merge-design.md`

---

## Task 1: Session REST endpoints

Create `server/src/chat/routes/sessions.ts` — Express router for session CRUD.

Endpoints (reading/writing `history/` directory):
- `GET /chat/api/sessions` — list sessions (limit, offset)
- `POST /chat/api/sessions` — create empty session
- `GET /chat/api/sessions/:id` — get all messages
- `DELETE /chat/api/sessions/:id` — hide session
- `PUT /chat/api/sessions/:id/topic` — rename
- `PUT /chat/api/sessions/:id/workspace` — assign workspace

## Task 2: Agent REST endpoints

Create `server/src/chat/routes/agents.ts` — uses file-based agent registry.

- `GET /chat/api/agents` — list agents (from agents/ dir)
- `GET /chat/api/agents/:name` — agent detail
- `POST /chat/api/agents` — create (UUID folder, v1 config)
- `PUT /chat/api/agents/:name` — update
- `DELETE /chat/api/agents/:name` — soft delete
- `GET/PUT /chat/api/agents/:name/agent-md` — AGENT.md
- `GET/PUT /chat/api/agents/:name/identity` — IDENTITY.md
- `GET/PUT /chat/api/agents/:name/soul` — SOUL.md
- `POST /chat/api/agents/:name/test` — test agent

## Task 3: Adapter Presets + Skills + Workspaces + Scenarios + Marketplace

Create route files for remaining CRUD endpoints, all file-based:
- `server/src/chat/routes/adapter-presets.ts`
- `server/src/chat/routes/skills.ts`
- `server/src/chat/routes/workspaces.ts`
- `server/src/chat/routes/scenarios.ts`
- `server/src/chat/routes/marketplace.ts`

## Task 4: History Manager (compression/summarization)

Port `history_manager.py` to `server/src/chat/history-manager.ts`.
- `GET /chat/api/sessions/:id/summary` — get cached summary
- `POST /chat/api/sessions/:id/recompress` — force re-summarization

## Task 5: Mount all routes + Vite proxy

- Mount all chat routes under `/chat/api/*` in `server/src/app.ts`
- Add `/chat/api` Vite proxy in `ui/vite.config.ts`

## Task 6: UI switch — chatClient → unified API

Update `ui/src/chat/chatClient.ts` to point to `/chat/api` instead of `:8000`.
Update all imports and hooks.

## Task 7: E2E verification + Python retirement
