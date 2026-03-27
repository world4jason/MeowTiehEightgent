# Plan: Refactor app.py (2973 lines → ~8 modules)

## Current State

`app.py` is a 2973-line monolith containing everything:
- Config management
- Agent registry & resolution
- Prompt building
- Subprocess execution (CLI/API streaming)
- 50+ HTTP endpoints (models, agents, skills, workspaces, scenarios, marketplace)
- WebSocket conversation handler
- History/session management
- Token tracking
- Error types

## Proposed Module Structure

```
app.py                  → FastAPI app factory + lifespan + static serving (~50 lines)
routes/
  __init__.py
  health.py             → /health, / (static)
  user.py               → /user/md
  models.py             → /models, /adapter-presets CRUD
  config.py             → /config CRUD
  agents.py             → /agents CRUD + agent-md/identity/soul + test/daily-summary
  marketplace.py        → /marketplace/agents CRUD + install
  skills.py             → /skills CRUD + upload
  workspaces.py         → /workspaces CRUD + file upload
  scenarios.py          → /scenarios CRUD
  sessions.py           → /sessions CRUD + recompress/rename/move
  providers.py          → /providers/ollama/*
  ws.py                 → /ws WebSocket handler
core/
  __init__.py
  config.py             → load_config, save_config, load_models, load_adapter_presets, migration
  registry.py           → get_agent_registry, _find_agent_dir, _merge_v0/v1_agent
  prompt.py             → build_prompt, resolve_human_text, intercept_mode_command
  runner.py             → stream_agent, stream_cli_agent, stream_api_agent, call_agent
  errors.py             → SubprocessError hierarchy, TokenUsage
  history.py            → session_dir, save_history, load_hidden, save_hidden, migrate_history
  workspace.py          → ensure_workspace, workspace helpers
  skills.py             → list_skill_slugs, find_skill_file, parse_skill
  security.py           → validate_filename, safe_workspace_path
  templates.py          → DEFAULT_*, ensure_default_template, ensure_agent_configs
conversation_engine.py  → (already extracted, keep as-is)
history_manager.py      → (already extracted, keep as-is)
```

## Module Dependency Order (build bottom-up)

```
1. core/errors.py          (no deps)
2. core/security.py        (no deps)
3. core/config.py          (depends on: errors)
4. core/templates.py       (depends on: config)
5. core/skills.py          (no deps)
6. core/workspace.py       (depends on: config)
7. core/registry.py        (depends on: config, workspace, templates)
8. core/prompt.py          (depends on: config, registry, skills)
9. core/history.py         (depends on: config)
10. core/runner.py          (depends on: config, registry, errors)
11. routes/*               (depends on: core/*)
12. app.py                 (assembles routes)
```

## Extraction Rules

1. **No behavior change** — pure mechanical move
2. **Shared state** (`PROJECT_DIR`, `AGENTS_DIR`, etc.) → `core/config.py` constants
3. **Each route file** gets its own `router = APIRouter()` and is included in `app.py`
4. **Tests run green after each extraction step** — run `pytest test_api.py -x -q` after every module extracted
5. **Imports in test_api.py** may need updating — use `from app import ...` redirects if needed

## Execution Phases

### Phase 1: Extract core/ (pure functions, no routes)
- core/errors.py
- core/security.py
- core/config.py (constants + load/save)
- core/templates.py
- core/skills.py
- core/workspace.py
- core/registry.py
- core/prompt.py
- core/history.py
- core/runner.py

### Phase 2: Extract routes/ (HTTP endpoints)
- Each route file creates `router = APIRouter()`
- app.py includes all routers
- One route file at a time, test after each

### Phase 3: Extract WebSocket handler
- routes/ws.py (the most complex piece, ~400 lines)
- Needs access to core/runner, core/prompt, conversation_engine, history_manager

### Phase 4: Cleanup
- app.py becomes thin assembly (~50 lines)
- Update imports in test_api.py
- Verify all 217 tests pass

## Risk Mitigation

- **Circular imports**: Build bottom-up, core/ never imports from routes/
- **Test breakage**: Tests import from `app`, add re-exports in `app.py` if needed
- **Monkeypatch paths**: Tests monkeypatch `app.PROJECT_DIR` etc — update to new module paths
