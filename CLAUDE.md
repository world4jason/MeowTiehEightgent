# CLAUDE.md — MeowTiehEightgent Project Guide

## Architecture

Single Node.js backend with shared React UI:

| Service | Stack | Port | Role |
|---------|-------|------|------|
| Cowork | Node.js (Mth fork) | 3100 | Chat, project management, issues, agents |
| Frontend | React + Vite | 5173 | Shared UI, ModeToggle: Chat / Cowork / Settings |

### Starting Services

```bash
pnpm dev:server                                # Cowork server (Node.js, port 3100)
cd ui && pnpm dev                              # Frontend
```

## Data Model — Entity Relationships

```
config.json
  └── models: { claude, gemini, ollama, codex }
                    ↑ agent.model (string soft ref)
agents/{name}/
  ├── config.json (model, skills[], enabled, emoji, color)
  ├── AGENT.md / IDENTITY.md / SOUL.md / MEMORY.md
  └── memory/

agents/_default/     → template for new agents ({name} placeholder)
marketplace/{id}/    → install copies to agents/{dest_name}/

skills/{slug}/SKILL.md  ← agent.skills[] (string soft ref)

workspaces/{id}/
  ├── config.json (system_prompt, default_agents[])
  └── files/

history/{session_id}/
  └── messages.json → workspace_id (nullable), message.agent (soft ref)

scenarios/{id}.json → suggested_agents[] (soft ref)
```

All foreign keys are **string soft references** — no integrity constraints.

### Cascade Behavior

- Delete model → agents unaffected (graceful fallback)
- Delete agent → soft delete (enabled=false), history preserved
- Delete workspace → **hard delete** + sessions detached (workspace_id=null)
- Delete skill → no cascade, agent skills[] still references but unresolvable

## Settings Design Principles

### Core Tabs (affect both Chat and Cowork)

1. **Agent** — CRUD for installed agents. Each agent is unique with its own folder (`agents/{name}/`), isolated files (AGENT.md, IDENTITY.md, SOUL.md, memory/). Agents cannot see each other's data.
2. **Agent Marketplace** — READ-ONLY template library. Browse + Fork only (no edit). Fork creates a new agent in `agents/`.
3. **Skill** — Currently equivalent to Skill Marketplace. Browse installed skills, create new, edit. Future: separate installed vs marketplace.
4. **Skill Marketplace** — Currently merged with Skill tab. Future: separate template library.

### Other Tabs

5. **Models** — LLM model CRUD (CLI type: command-based, API type: Ollama with pull/model list)
6. **Workspaces** — Workspace CRUD with system_prompt, file uploads, default_agents assignment
7. **Soul (Default Templates)** — Edit _default/ templates (AGENT.md, IDENTITY.md, SOUL.md, USER.md) used when creating new agents
8. **About** — Static system info page

### Agent/Skill Creation Flow

```
Two paths to create:
  1. Fork from Marketplace → copy template → customize
  2. Create from scratch → blank + _default template
```

### Marketplace Sources (current + future)

1. External push to marketplace/
2. Marketplace UI for new templates (future)
3. Git or external install (future)
4. Push from Settings after creation (future)
5. GitHub repo management (future)

### Cross-Mode Integration

- Settings affects **both** Chat and Cowork modes
- Chat mode agents come from `agents/` (Node.js backend)
- Cowork agents (from Mth/Node.js) will be visible in Settings (future)
- Goal: Chat mode can invoke Cowork agents for conversation (future)

## UI Patterns

- Framework: shadcn/ui + Tailwind CSS + react-query
- Chat API client: `chatClient` (ui/src/chat/chatClient.ts) → Node.js backend `/chat/api`
- Cowork API client: `api` (ui/src/api/client.ts) → Vite proxy `/api` → Node.js :3100
- State: `useState` for forms, `useQuery`/`useMutation` for API
- Icons: lucide-react
- Language: zh-TW for UI labels

## Key File Locations

- Backend: `server/src/` (Node.js, all Chat + Cowork API)
- Frontend entry: `ui/src/App.tsx` (ModeToggle, routing)
- Chat module: `ui/src/chat/` (ChatPage, hooks, settings)
- Chat API hooks: `ui/src/chat/hooks/useChatApi.ts`
- UI components: `ui/src/components/ui/` (shadcn)
- Original reference UI: `static/index.html` (vanilla JS, full feature set)
