# API Reference

All endpoints return JSON unless noted. Errors return `{"detail": "..."}` with an appropriate status code.

## Models

### `GET /models`
Returns all model configs.
```json
[{"id": "claude", "type": "cli", "emoji": "🟣", ...}]
```

### `POST /models`
Create a model. Body: `{id, type, emoji, color, label, ...type-specific fields}`.
- `409` if `id` already exists.

### `PUT /models/{id}`
Update fields on a model. Cannot change `id`.

### `DELETE /models/{id}`
Remove a model.

---

## Agents

### `GET /agents`
List all agents (excludes `_default`).

### `POST /agents`
Create an agent. Body: `{name, emoji, color, description, model, skills[], enabled}`.
- Name must match `[a-zA-Z0-9_-]+`.
- `409` if name already exists.
- Copies `_default` templates into the new folder with `{name}` substituted.

### `GET /agents/{name}`
Get agent config.

### `PUT /agents/{name}`
Update agent config fields. Cannot change `name`.

### `DELETE /agents/{name}`
Disables the agent (`enabled: false`). Does not delete files.

### `GET /agents/{name}/agent-md`
### `PUT /agents/{name}/agent-md`
Read / write `AGENT.md`. Body for PUT: `{content: "..."}`.

### `GET /agents/{name}/identity`
### `PUT /agents/{name}/identity`
Read / write `IDENTITY.md`.

### `GET /agents/{name}/soul`
### `PUT /agents/{name}/soul`
Read / write `SOUL.md`.

### `POST /agents/{name}/test`
Sends a short test prompt to the agent. Returns `{ok, response}`.

---

## Skills

### `GET /skills`
List all skill directories. Returns `missing: true` for dirs without a skill file.
```json
[{"slug": "discussion", "name": "Discussion", "description": "...", "missing": false}]
```

### `GET /skills/{slug}`
Get full skill content: `{slug, name, description, body}`.

### `PUT /skills/{slug}`
Update skill. Body: `{name, description, body}`.

### `POST /skills`
Create a new skill. Body: `{slug, name, description, body}`.
- `400` if slug is empty.
- `409` if skill already exists.

### `POST /skills/upload`
Upload a `.zip` file. Each top-level directory in the zip becomes a skill folder.
Only `SKILL.md` and `SKILLS.md` files are extracted.
Returns `{ok, created: [...slugs]}`.

---

## Ollama

### `GET /providers/ollama/models?base_url=`
List locally installed Ollama models. `base_url` defaults to the config value.
Returns `{ok, models: [...names]}`.

### `GET /providers/ollama/cloud-models?base_url=`
List models available to pull from Ollama's registry (`?cloud=true`).
Returns `{ok, models: [...names]}`.

### `POST /providers/ollama/pull`
Pull a model. Body: `{model, base_url?}`.
Returns a **Server-Sent Events** stream. Each event is a JSON line from Ollama's `/api/pull`:
```
data: {"status":"pulling manifest"}
data: {"status":"pulling abc123","total":4661211136,"completed":1234567}
data: {"status":"success"}
data: [DONE]
```

---

## Sessions

### `GET /sessions`
List non-hidden sessions: `[{id, message_count, first_message}]`.

### `GET /sessions/{id}`
Full session messages array.

### `DELETE /sessions/{id}`
Hide a session (adds to `hidden_sessions.json`; file kept on disk).

---

## Config

### `GET /config`
Raw app config JSON.

### `POST /config`
Replace app config. Body: full config object.
