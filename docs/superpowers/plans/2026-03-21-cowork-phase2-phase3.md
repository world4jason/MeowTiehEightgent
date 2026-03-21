# MeowTiehEightgent — Cowork Phase 2+3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Sync 35 updated Paperclip UI files into our Cowork tab, and (2) copy Paperclip's Node.js backend (server + 5 packages) into this repo as the standalone Cowork backend — renaming the `@paperclipai` namespace to `@meowtieheightgent`.

**Architecture:**
```
agent-cli-converation/
├── app.py                   ← Python backend (Chat tab, port 8000) — unchanged
├── ui/                      ← Vite+React frontend (npm, NOT in pnpm workspace)
│   └── src/
│       ├── chat/            ← Chat tab pages (Phase 1 work)
│       └── [Paperclip UI]   ← Cowork tab pages (synced in Phase 2)
├── server/                  ← Paperclip Node.js backend (Cowork, port 3100) — NEW Phase 3
└── packages/                ← Paperclip shared packages — NEW Phase 3
    ├── db/                  ← Drizzle ORM + embedded postgres
    ├── shared/              ← Shared types/utils
    ├── adapters/            ← LLM adapter layer
    ├── adapter-utils/       ← Adapter utilities
    └── plugins/sdk/         ← Plugin SDK (server imports in 15 places — REQUIRED)
```

> **Key constraint:** `ui/` stays on **npm** (not pnpm). pnpm workspace only covers `server/` and `packages/`. This preserves the 150-test npm vitest setup.

**Tech Stack:** Vite + React + TypeScript (UI), Python FastAPI (Chat backend), Express 5 + Drizzle ORM + embedded postgres (Cowork backend), pnpm workspaces

**Fork point:** Paperclip commit `9ee440b8` (2026-03-20 22:30)

---

## Prerequisites

Before running any task, set `COWORK_SRC` to the local path of the upstream source repo (the code we're copying from):

```bash
export COWORK_SRC=/path/to/upstream  # e.g. ../upstream-cowork-src
# Verify:
ls "$COWORK_SRC/server/src/index.ts" && echo "COWORK_SRC OK"
```

All copy commands in this plan use `$COWORK_SRC`. No hardcoded local paths are used.

> **Name policy:** The words "paperclip" / "paperclipai" must NOT appear in any committed file in this repo — code, docs, env values, docker config, or comments. All references become "meowtieheightgent" or "mth".

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `App.tsx` three-way merge conflict | MEDIUM | Our version adds `VITE_COWORK_URL`; Paperclip adds `InstanceGeneralSettings`. Apply as additive — both changes can coexist. |
| Namespace rename scope (`@paperclipai` → `@meowtieheightgent`) | HIGH | ~100+ files across server + packages + ui. Use `grep -r @paperclipai` first to count; do rename atomically with sed or scripted find-replace. Validate with `grep -r @paperclipai` returning zero hits. |
| Embedded postgres version mismatch | MEDIUM | Paperclip pins `@electric-sql/pglite`. Copy `packages/db/package.json` verbatim; do not upgrade. |
| pnpm workspace not installed | LOW | Add `pnpm-workspace.yaml` before Phase 3 tasks. Verify with `pnpm -r ls`. |
| `ui/src` path collision | LOW | Our `ui/src/chat/` is a new directory Paperclip doesn't have — no collision. Other Paperclip `ui/src/` files are safe to overwrite since we're syncing forward. |
| Cowork backend depends on secrets/config file | MEDIUM | Paperclip loads `~/.paperclip/config.json`. Will need `~/.meowtieheightgent/config.json` or env-var override in Phase 3 config step. |
| Server has 136 TypeScript files — compile errors after rename | MEDIUM | Run `pnpm typecheck` in `server/` after rename and fix any stray `@paperclipai` references. |
| Tests in Paperclip reference `@paperclipai` imports | LOW | Same rename script covers test files. Run `vitest run` after rename to confirm. |

---

## Phase 2: Sync 35 Paperclip UI Files

These files changed in Paperclip from fork point `9ee440b8` to HEAD (`93ba7836`).
Copy each file verbatim from `paperclip/ui/src/` → `ui/src/` **except** `App.tsx` (handled separately with three-way merge).

### Task 1: Copy non-conflicting UI files (34 files)

**Files to CREATE or OVERWRITE** (copy from `paperclip/` to worktree):

```
ui/src/adapters/transcript.test.ts
ui/src/adapters/transcript.ts
ui/src/api/health.ts
ui/src/api/instanceSettings.ts
ui/src/components/AgentConfigForm.tsx
ui/src/components/CommentThread.tsx
ui/src/components/DevRestartBanner.tsx
ui/src/components/InstanceSidebar.tsx
ui/src/components/Layout.tsx
ui/src/components/MarkdownBody.test.tsx
ui/src/components/MarkdownBody.tsx
ui/src/components/OnboardingWizard.tsx
ui/src/components/Sidebar.tsx
ui/src/components/SidebarNavItem.tsx
ui/src/components/agent-config-primitives.tsx
ui/src/components/transcript/useLiveRunTranscripts.ts
ui/src/lib/instance-settings.test.ts
ui/src/lib/instance-settings.ts
ui/src/lib/legacy-agent-config.test.ts
ui/src/lib/legacy-agent-config.ts
ui/src/lib/queryKeys.ts
ui/src/lib/routine-trigger-patch.test.ts
ui/src/lib/routine-trigger-patch.ts
ui/src/lib/zip.test.ts
ui/src/lib/zip.ts
ui/src/pages/AgentDetail.tsx
ui/src/pages/CompanyExport.tsx
ui/src/pages/CompanyImport.tsx
ui/src/pages/CompanySkills.tsx
ui/src/pages/InstanceExperimentalSettings.tsx
ui/src/pages/InstanceGeneralSettings.tsx
ui/src/pages/RoutineDetail.tsx
ui/src/pages/Routines.tsx
```

- [ ] **Step 1.1: Copy 34 files from Paperclip**

```bash
PAPERCLIP="$COWORK_SRC"
DEST="$(git rev-parse --show-toplevel)"

files=(
  adapters/transcript.test.ts
  adapters/transcript.ts
  api/health.ts
  api/instanceSettings.ts
  components/AgentConfigForm.tsx
  components/CommentThread.tsx
  components/DevRestartBanner.tsx
  components/InstanceSidebar.tsx
  components/Layout.tsx
  components/MarkdownBody.test.tsx
  components/MarkdownBody.tsx
  components/OnboardingWizard.tsx
  components/Sidebar.tsx
  components/SidebarNavItem.tsx
  components/agent-config-primitives.tsx
  components/transcript/useLiveRunTranscripts.ts
  lib/instance-settings.test.ts
  lib/instance-settings.ts
  lib/legacy-agent-config.test.ts
  lib/legacy-agent-config.ts
  lib/queryKeys.ts
  lib/routine-trigger-patch.test.ts
  lib/routine-trigger-patch.ts
  lib/zip.test.ts
  lib/zip.ts
  pages/AgentDetail.tsx
  pages/CompanyExport.tsx
  pages/CompanyImport.tsx
  pages/CompanySkills.tsx
  pages/InstanceExperimentalSettings.tsx
  pages/InstanceGeneralSettings.tsx
  pages/RoutineDetail.tsx
  pages/Routines.tsx
)

for f in "${files[@]}"; do
  mkdir -p "$DEST/ui/src/$(dirname $f)"
  cp "$PAPERCLIP/ui/src/$f" "$DEST/ui/src/$f"
done
echo "Done: ${#files[@]} files copied"
```

Expected: `Done: 33 files copied`

- [ ] **Step 1.2: Verify files exist**

```bash
ls ui/src/pages/InstanceGeneralSettings.tsx
ls ui/src/lib/routine-trigger-patch.ts
echo "Spot check passed"
```

- [ ] **Step 1.3: Commit**

```bash
git add ui/src/
git commit -m "feat(cowork): sync 33 ui/src files from Paperclip (9ee440b8→93ba7836)"
```

---

### Task 2: Merge App.tsx (three-way merge)

`App.tsx` has changes in both repos:
- **Paperclip** added: `InstanceGeneralSettings` import + route, changed default redirect from `heartbeats` to `general`
- **Our version** added: `VITE_COWORK_URL` integration for the Cowork tab

```
Base (9ee440b8): original App.tsx
Theirs (93ba7836): + InstanceGeneralSettings + redirect change
Ours: + COWORK_URL integration
Merged: all three changes together
```

- [ ] **Step 2.1: Show our App.tsx vs Paperclip HEAD diff**

```bash
diff ui/src/App.tsx "$COWORK_SRC/ui/src/App.tsx"
```

- [ ] **Step 2.2: Apply Paperclip's InstanceGeneralSettings additions**

Add the following to our `ui/src/App.tsx` (based on Paperclip's changes):
- Import: `import { InstanceGeneralSettings } from "./pages/InstanceGeneralSettings";`
- Route: `<Route path="general" element={<InstanceGeneralSettings />} />`
- Change default redirect from `/heartbeats` to `/general`

Preserve our COWORK_URL integration unchanged.

- [ ] **Step 2.3: TypeScript compile check**

```bash
cd ui && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors (or only pre-existing errors unrelated to our changes)

- [ ] **Step 2.4: Commit**

```bash
git add ui/src/App.tsx
git commit -m "feat(cowork): merge Paperclip App.tsx changes (InstanceGeneralSettings + default redirect)"
```

---

### Task 3: Run UI tests to verify Phase 2

- [ ] **Step 3.1: Run existing test suite**

```bash
cd ui && npm run test:run 2>&1 | tail -20
```

Expected: all tests pass (150+)

- [ ] **Step 3.2: Verify Cowork UI loads**

```bash
cd ui && npm run dev &
sleep 3
curl -s http://localhost:5173 | grep -c "root" && echo "UI loads"
```

- [ ] **Step 3.3: Commit test results confirmation**

No new commits needed; tests are already committed.

---

## Phase 3: Copy Paperclip Backend + Configure

### Task 4: Add pnpm workspace configuration

This repo currently uses only Python (`app.py`). We need pnpm workspaces for the Node.js backend.

**Files to CREATE:**
- `pnpm-workspace.yaml`
- `package.json` (root, private)

- [ ] **Step 4.1: Create root package.json**

```json
{
  "name": "meowtieheightgent",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "pnpm --filter @meowtieheightgent/server dev",
    "dev:ui": "pnpm --filter @meowtieheightgent/ui dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest",
    "test:run": "vitest run",
    "db:generate": "pnpm --filter @meowtieheightgent/db generate",
    "db:migrate": "pnpm --filter @meowtieheightgent/db migrate"
  }
}
```

Save to: `package.json`

- [ ] **Step 4.2: Create pnpm-workspace.yaml**

> **Note:** `ui` is intentionally excluded — it stays on npm to preserve the existing 150-test setup.

```yaml
packages:
  - packages/*
  - packages/adapters/*
  - packages/plugins/sdk
  - server
```

Save to: `pnpm-workspace.yaml`

- [ ] **Step 4.3: Commit**

```bash
git add package.json pnpm-workspace.yaml
git commit -m "feat(cowork): add pnpm workspace config for Node.js backend"
```

---

### Task 5: Copy Paperclip packages

Copy the 4 shared packages from Paperclip:

| Source | Destination |
|--------|------------|
| `paperclip/packages/db/` | `packages/db/` |
| `paperclip/packages/shared/` | `packages/shared/` |
| `paperclip/packages/adapter-utils/` | `packages/adapter-utils/` |
| `paperclip/packages/adapters/` → dirs only | `packages/adapters/` |

> Note: `packages/adapters/` is itself a directory of sub-packages. Copy each sub-package separately.

- [ ] **Step 5.1: Copy shared packages**

```bash
cp -r "$COWORK_SRC/packages/db" packages/
cp -r "$COWORK_SRC/packages/shared" packages/
cp -r "$COWORK_SRC/packages/adapter-utils" packages/
cp -r "$COWORK_SRC/packages/adapters" packages/
mkdir -p packages/plugins
cp -r "$COWORK_SRC/packages/plugins/sdk" packages/plugins/

echo "Packages copied:"
ls packages/
ls packages/plugins/
```

Expected:
```
adapters  adapter-utils  db  plugins  shared
sdk
```

- [ ] **Step 5.2: Verify package.json names**

```bash
grep '"name"' packages/db/package.json
grep '"name"' packages/shared/package.json
grep '"name"' packages/adapter-utils/package.json
```

Expected: all show `@meowtieheightgent/...` (will rename in Task 7)

- [ ] **Step 5.3: Commit (before rename)**

```bash
git add packages/
git commit -m "feat(cowork): copy Paperclip shared packages (pre-rename)"
```

---

### Task 6: Copy Paperclip server

- [ ] **Step 6.1: Copy server directory**

```bash
cp -r "$COWORK_SRC/server" .

echo "Server files:"
ls server/src/ | head -10
```

- [ ] **Step 6.2: Verify server structure**

```bash
ls server/src/routes/ | head -10
ls server/src/middleware/ | head -5
```

- [ ] **Step 6.3: Commit (before rename)**

```bash
git add server/
git commit -m "feat(cowork): copy Paperclip server (pre-rename)"
```

---

### Task 7: Rename @paperclipai → @meowtieheightgent

This is the most critical task. Search all files for `@paperclipai` and replace atomically.

**Affected scopes:**
- `packages/*/package.json` — `name` and dependency references
- `server/package.json` — name and workspace dep references
- `server/src/**/*.ts` — import statements
- `packages/**/*.ts` — import statements
- `ui/package.json` — workspace dep references
- `ui/src/**/*.ts` / `.tsx` — any imports from `@meowtieheightgent/...`
- Root `package.json` — scripts referencing `@meowtieheightgent/server`

- [ ] **Step 7.1: Count occurrences before rename**

```bash
grep -r "@paperclipai" --include="*.ts" --include="*.tsx" --include="*.json" . \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l | wc -l
echo "Files with @paperclipai:"
grep -r "@paperclipai" --include="*.ts" --include="*.tsx" --include="*.json" . \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l
```

- [ ] **Step 7.2: Execute rename**

```bash
# Rename in .ts, .tsx, .json, .yaml, .sh, .mjs, .md files (excluding node_modules)
find . -type f \( \
  -name "*.ts" -o -name "*.tsx" \
  -o -name "*.json" \
  -o -name "*.yaml" -o -name "*.yml" \
  -o -name "*.sh" -o -name "*.mjs" \
  -o -name "*.md" \
\) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -exec sed -i '' 's/@meowtieheightgent/@meowtieheightgent/g' {} +

echo "Rename complete"
```

- [ ] **Step 7.3: Verify zero remaining occurrences**

```bash
remaining=$(grep -r "@paperclipai" --include="*.ts" --include="*.tsx" --include="*.json" . \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l | wc -l)
echo "Remaining @paperclipai occurrences: $remaining"
[ "$remaining" -eq 0 ] && echo "CLEAN" || echo "NEEDS FIX"
```

Expected: `Remaining @paperclipai occurrences: 0` / `CLEAN`

- [ ] **Step 7.4: Rename config directory paths (.paperclip → .meowtieheightgent)**

Paperclip's server hardcodes `~/.paperclip` in two files. Update them explicitly:

```bash
# Find all occurrences of .paperclip path strings
grep -rn '\.paperclip' server/src/ packages/ --include="*.ts" | grep -v node_modules

# The key files are:
#   server/src/home-paths.ts  — defines getDataDirectory(), getConfigPath()
#   server/src/config.ts      — may reference ~/.paperclip

# Apply rename
find server/src packages -type f -name "*.ts" \
  -not -path "*/node_modules/*" \
  -exec sed -i '' 's/\.paperclip/.meowtieheightgent/g' {} +

# Verify
grep -rn '\.paperclip' server/src/ packages/ --include="*.ts" | grep -v node_modules | wc -l
echo "Should be 0"
```

- [ ] **Step 7.5: Commit**

```bash
git add -A
git commit -m "feat(cowork): rename @paperclipai → @meowtieheightgent across all packages"
```

---

### Task 8: Install dependencies + typecheck

- [ ] **Step 8.1: Install pnpm if needed**

```bash
which pnpm || npm install -g pnpm
pnpm --version
```

- [ ] **Step 8.2: Install all workspace dependencies**

```bash
pnpm install 2>&1 | tail -20
```

Expected: no errors, lockfile created

- [ ] **Step 8.3: Run typecheck across all packages**

```bash
pnpm -r typecheck 2>&1 | grep -E "(error|Error|✓)" | head -40
```

Fix any type errors that result from the rename (stray `@paperclipai` in `.d.ts` or barrel exports).

- [ ] **Step 8.4: Commit fixes**

```bash
git add -A
git commit -m "fix(cowork): resolve typecheck errors post-rename"
```

---

### Task 9: Remove all "paperclip" branding from copied code

The upstream name must not appear anywhere in committed files. This covers:
- String literals: `"paperclip"` in SQL, env values, error messages
- Env var names: `PAPERCLIP_*` → `MTH_*`
- Comments and docs: "Paperclip" → "MeowTiehEightgent"
- Config file paths: `~/.paperclip` (already handled in Task 7.4)

- [ ] **Step 9.1: Find all remaining "paperclip" occurrences (case-insensitive)**

```bash
grep -ri "paperclip" . \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.yaml" --include="*.yml" --include="*.md" \
  --include="*.sh" --include="*.env*" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l
```

- [ ] **Step 9.2: Replace remaining "paperclip" string literals**

Review the list from 9.1. For each occurrence:
- `paperclip` (DB user/password/name) → `mth`
- `PAPERCLIP_*` env vars → `MTH_*`
- `"Paperclip"` in user-facing strings → `"MeowTiehEightgent"`
- Code comments mentioning Paperclip → update or remove

```bash
# Automated pass for common patterns
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.json" \
  -o -name "*.yaml" -o -name "*.yml" -o -name "*.sh" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' \
    -e 's/PAPERCLIP_/MTH_/g' \
    -e 's/paperclipai/meowtieheightgent/g' \
    {} +
# Then manually review .md files for prose "Paperclip" mentions
```

- [ ] **Step 9.3: Verify zero remaining occurrences**

```bash
remaining=$(grep -ri "paperclip" . \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.yaml" --include="*.yml" --include="*.sh" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l | wc -l)
echo "Remaining files with 'paperclip': $remaining"
[ "$remaining" -eq 0 ] && echo "CLEAN" || echo "NEEDS MANUAL FIX"
```

- [ ] **Step 9.4: Commit**

```bash
git add -A
git commit -m "feat(cowork): remove all upstream branding — rename to meowtieheightgent"
```

---

### Task 10: Add Docker Compose + DB init

The Cowork server requires postgres. Ship a `docker-compose.yml` that starts postgres and (optionally) the server, then run DB migrations.

- [ ] **Step 10.1: Create docker-compose.yml (DB only — Phase 3)**

> **Phase 3 scope:** Only the DB container is needed. Server runs locally via `pnpm dev` during development. Docker server build is deferred to Phase 4 after integration is stable.

Create `docker-compose.yml` at repo root:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: mth
      POSTGRES_PASSWORD: mth
      POSTGRES_DB: mth
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mth -d mth"]
      interval: 2s
      timeout: 5s
      retries: 30
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Save to: `docker-compose.yml`

- [ ] **Step 10.2: Start DB and run migrations**

```bash
docker compose up -d
# Wait for healthy
docker compose ps

# Run DB migrations via pnpm (uses DATABASE_URL from env)
DATABASE_URL=postgres://mth:mth@localhost:5432/mth pnpm db:migrate
```

Expected: migrations apply successfully, `pnpm db:migrate` exits 0

- [ ] **Step 10.3: Start server locally and verify**

```bash
DATABASE_URL=postgres://mth:mth@localhost:5432/mth \
  PORT=3100 \
  cd server && pnpm dev &
sleep 5
curl -s http://localhost:3100/health && echo "Server OK"
```

- [ ] **Step 10.4: Create .env.example**

Create `.env.example`:
```
DATABASE_URL=postgres://mth:mth@localhost:5432/mth
MTH_PUBLIC_URL=http://localhost:3100
BETTER_AUTH_SECRET=changeme-in-production
```

- [ ] **Step 10.5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(cowork): add Docker Compose (DB only) + server env config"
```

---

### Task 11: Configure server port + env

- [ ] **Step 11.1: Create server/.env.example**

Create `server/.env.example`:
```
PORT=3100
DATA_DIR=~/.meowtieheightgent
DATABASE_URL=postgres://mth:mth@localhost:5432/mth
```

- [ ] **Step 11.2: Update CLAUDE.md with startup instructions**

Add to `CLAUDE.md`:
```markdown
## Starting the Cowork backend (port 3100)

# With Docker (recommended):
docker compose up -d

# Without Docker (local pnpm):
cd server && pnpm dev
```

- [ ] **Step 11.3: Commit**

```bash
git add server/.env.example CLAUDE.md
git commit -m "feat(cowork): configure server port 3100, add startup docs"
```

---

### Task 12: Wire UI to Cowork backend

Verify `VITE_COWORK_URL` in `ui/src/App.tsx` points to port 3100.

- [ ] **Step 10.1: Check COWORK_URL wiring**

```bash
grep -n "COWORK_URL\|3100\|cowork" ui/src/App.tsx | head -10
```

Expected: `VITE_COWORK_URL ?? "http://localhost:3100"`

- [ ] **Step 10.2: Add ui/.env.example entry**

Append to `ui/.env.example` (or create):
```
VITE_COWORK_URL=http://localhost:3100
```

- [ ] **Step 10.3: Commit**

```bash
git add ui/.env.example
git commit -m "feat(cowork): document VITE_COWORK_URL=http://localhost:3100"
```

---

### Task 13: Run full test suite

- [ ] **Step 13.1: Run UI unit + integration tests (npm)**

```bash
cd ui && npm run test:run 2>&1 | tail -20
```

Expected: 150+ tests pass

- [ ] **Step 13.2: Run pnpm workspace tests (server + packages)**

```bash
pnpm -r test:run 2>&1 | grep -E "(PASS|FAIL|Tests)" | head -30
```

> Server tests use `vi.mock()` — no live DB required. Server has 86 test files.

- [ ] **Step 13.3: Smoke test full stack**

```bash
# DB + server should be running via docker compose (from Task 10)
curl -s http://localhost:3100/health | jq .
curl -s http://localhost:8000/health    # Python Chat backend
```

- [ ] **Step 13.4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix(cowork): fix any test failures post-Phase-3 setup"
```

---

## NOT in scope

| Item | Rationale |
|------|-----------|
| GitHub URLs / remote references to upstream | No runtime impact; clean up separately |
| Migrate existing upstream user data | No production data migration needed for initial copy |
| CI/CD pipeline for Node.js backend | Separate concern; Phase 1 CI is Python-only |
| Removing Python backend (app.py) | Chat tab still runs on Python; both backends coexist |
| `packages/plugins/` non-SDK copy | Only plugin-sdk is required; other plugins are optional |
| OAuth / auth config migration | Auth secrets are separate; not in initial copy scope |
| Upstream `packages/plugins/examples` | Dev examples, not needed for runtime |

## What already exists

| Existing | Status |
|----------|--------|
| `ui/src/chat/` | Phase 1 Chat UI — do NOT touch in Phase 2+3 |
| `ui/src/App.tsx` | Modified with COWORK_URL integration — merge carefully in Task 2 |
| `app.py` (port 8000) | Python Chat backend — unchanged |
| 150+ existing tests | Must continue to pass after all changes |
| `.worktrees/feat-chat-cowork-phase1/` branch | All Phase 2+3 work happens on this same branch |
