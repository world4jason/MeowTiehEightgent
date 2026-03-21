# Marketplace

Local cache of agent and skill templates pulled from the marketplace GitHub repo.

## Structure

```
marketplace/
  agents/<slug>/              ← agent templates (from git pull)
  skills/<source>/<slug>/     ← skill templates (from git pull)
  registry.json               ← tracks installed versions and lineage
```

## Usage

- `/gstack:review` → resolves to `marketplace/skills/gstack/review/`
- `/review` → resolves to `skills/review/` (local instance or fork)
- To fork a template: copy `marketplace/skills/gstack/review/` to `skills/review/`

## Sync

Manual: `git pull` in this directory (or use the UI sync button in Phase 2).
