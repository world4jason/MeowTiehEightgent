"""
Regression + unit tests for agent-cli-converation API.

Run with:  python3 -m pytest test_api.py -v
"""
import asyncio
import io
import json
import shutil
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def tmp_project(tmp_path, monkeypatch):
    """
    Redirect all filesystem globals in app.py to a temporary directory so
    tests never touch real data.
    """
    import app as a

    agents_dir = tmp_path / "agents"
    agents_dir.mkdir()
    history_dir = tmp_path / "history"
    history_dir.mkdir()
    skills_dir = tmp_path / "skills"
    skills_dir.mkdir()
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({"models": {
        "test-model": {
            "type": "api",
            "emoji": "🧪",
            "color": "#ff0000",
            "label": "Test Model",
            "api_base": "http://localhost",
            "api_key": "test",
            "model_name": "test-1",
        }
    }}, ensure_ascii=False))

    marketplace_dir = tmp_path / "marketplace"
    marketplace_dir.mkdir()

    workspaces_dir = tmp_path / "workspaces"
    workspaces_dir.mkdir()

    monkeypatch.setattr(a, "AGENTS_DIR", agents_dir)
    monkeypatch.setattr(a, "HISTORY_DIR", history_dir)
    monkeypatch.setattr(a, "CONFIG_FILE", config_file)
    monkeypatch.setattr(a, "PROJECT_DIR", tmp_path)
    monkeypatch.setattr(a, "MARKETPLACE_DIR", marketplace_dir)
    monkeypatch.setattr(a, "WORKSPACES_DIR", workspaces_dir)
    monkeypatch.setattr(a, "SCENARIOS_DIR", tmp_path / "scenarios")

    # Also patch history_manager module so its functions use the temp dir
    import history_manager as hm
    monkeypatch.setattr(hm, "HISTORY_DIR", history_dir)

    # Ensure _default template exists
    default_dir = agents_dir / "_default"
    default_dir.mkdir()
    (default_dir / "AGENT.md").write_text("# Agent Instructions\n{name}")
    (default_dir / "IDENTITY.md").write_text("# Identity\n{name}")
    (default_dir / "SOUL.md").write_text("# Soul\n")
    (default_dir / "MEMORY.md").write_text("# Memory\n")

    return tmp_path


@pytest.fixture()
def client(tmp_project):
    import app as a
    with TestClient(a.app) as c:
        yield c


# ── Models ────────────────────────────────────────────────────────────────────

class TestModels:
    def test_list_models(self, client):
        r = client.get("/models")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(m["id"] == "test-model" for m in data)

    def test_add_model(self, client):
        payload = {
            "id": "new-model",
            "type": "api",
            "emoji": "🆕",
            "color": "#00ff00",
            "label": "New Model",
            "api_base": "http://localhost",
            "api_key": "",
            "model_name": "new-1",
        }
        r = client.post("/models", json=payload)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        r2 = client.get("/models")
        ids = [m["id"] for m in r2.json()]
        assert "new-model" in ids

    def test_add_model_duplicate_rejected(self, client):
        payload = {"id": "test-model", "type": "api", "label": "Dup"}
        r = client.post("/models", json=payload)
        assert r.status_code == 409

    def test_update_model(self, client):
        r = client.put("/models/test-model", json={"label": "Updated"})
        assert r.status_code == 200
        assert r.json()["ok"] is True

        models = client.get("/models").json()
        m = next(x for x in models if x["id"] == "test-model")
        assert m["label"] == "Updated"

    def test_update_nonexistent_model(self, client):
        r = client.put("/models/ghost", json={"label": "X"})
        assert r.status_code == 404

    def test_delete_model(self, client):
        r = client.delete("/models/test-model")
        assert r.status_code == 200
        models = client.get("/models").json()
        assert not any(m["id"] == "test-model" for m in models)


# ── Agents ────────────────────────────────────────────────────────────────────

class TestAgents:
    def _create_agent(self, client, name="agent-x"):
        return client.post("/agents", json={
            "name": name,
            "emoji": "🤖",
            "color": "#888",
            "description": "Test",
            "model": "test-model",
            "skills": [],
            "enabled": True,
        })

    def test_list_agents_empty(self, client):
        r = client.get("/agents")
        assert r.status_code == 200
        # _default is skipped
        assert isinstance(r.json(), list)

    def test_add_agent(self, client):
        r = self._create_agent(client)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_add_agent_invalid_name(self, client):
        r = client.post("/agents", json={"name": "bad name!"})
        assert r.status_code == 400

    def test_add_agent_duplicate(self, client):
        self._create_agent(client)
        r = self._create_agent(client)
        assert r.status_code == 409

    def test_get_agent(self, client):
        self._create_agent(client, "beta")
        r = client.get("/agents/beta")
        assert r.status_code == 200
        assert r.json()["name"] == "beta"

    def test_get_agent_not_found(self, client):
        r = client.get("/agents/ghost")
        assert r.status_code == 404

    def test_update_agent(self, client):
        self._create_agent(client, "gamma")
        r = client.put("/agents/gamma", json={"emoji": "🔥", "enabled": False})
        assert r.status_code == 200

        data = client.get("/agents/gamma").json()
        assert data["emoji"] == "🔥"
        assert data["enabled"] is False

    def test_delete_agent_disables(self, client):
        self._create_agent(client, "delta")
        r = client.delete("/agents/delta")
        assert r.status_code == 200

        data = client.get("/agents/delta").json()
        assert data["enabled"] is False

    def test_agent_md_roundtrip(self, client):
        self._create_agent(client, "epsilon")
        content = "# My Agent\nHello world."
        r = client.put("/agents/epsilon/agent-md", json={"content": content})
        assert r.status_code == 200

        r2 = client.get("/agents/epsilon/agent-md")
        assert r2.json()["content"] == content

    def test_agent_identity_roundtrip(self, client):
        self._create_agent(client, "zeta")
        content = "# Identity\nI am zeta."
        client.put("/agents/zeta/identity", json={"content": content})
        r = client.get("/agents/zeta/identity")
        assert r.json()["content"] == content

    def test_agent_soul_roundtrip(self, client):
        self._create_agent(client, "eta")
        content = "# Soul\nPurpose: test."
        client.put("/agents/eta/soul", json={"content": content})
        r = client.get("/agents/eta/soul")
        assert r.json()["content"] == content

    def test_add_agent_creates_template_files(self, client, tmp_project):
        self._create_agent(client, "theta")
        # Agent is now in a UUID-prefixed folder, find it by suffix
        import app as a
        agent_dir = a._find_agent_dir("theta")
        assert agent_dir is not None
        assert (agent_dir / "AGENT.md").exists()
        assert (agent_dir / "MEMORY.md").exists()
        assert (agent_dir / "config.json").exists()

    def test_agent_test_endpoint_unknown_agent(self, client):
        r = client.post("/agents/ghost-xyz/test")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert "Unknown agent" in data["error"]

    def test_agent_test_endpoint_ok(self, client, tmp_project):
        """Test endpoint with a mock CLI (echo) — should return ok=True."""
        import json as _json
        # Add a CLI echo model to the config
        cfg = _json.loads((tmp_project / "config.json").read_text())
        cfg["models"]["echo-model"] = {
            "type": "cli",
            "cmd": ["echo", "I am ready"],
            "emoji": "🔊",
            "color": "#aaa",
        }
        (tmp_project / "config.json").write_text(_json.dumps(cfg))

        name = "echo-agent"
        self._create_agent(client, name)
        # v1 agent uses 'adapter' field for model lookup in registry
        client.put(f"/agents/{name}", json={"adapter": "echo-model"})

        r = client.post(f"/agents/{name}/test")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["response"]

    def test_list_agents_includes_source_chat(self, client):
        """Each agent in GET /agents must carry source='chat' for the unified settings view."""
        self._create_agent(client, name="source-test-agent")
        r = client.get("/agents")
        assert r.status_code == 200
        agents = r.json()
        matching = [a for a in agents if a["name"] == "source-test-agent"]
        assert len(matching) == 1
        assert matching[0]["source"] == "chat"

    def test_list_agents_includes_supports_thinking(self, client):
        """Each agent in GET /agents must carry supportsThinking field."""
        # Create an agent with supports_thinking in config
        name = "think-test-agent"
        client.post("/agents", json={"name": name, "emoji": "🤔", "color": "#000",
                                      "description": "", "model": "claude", "skills": [], "enabled": True})
        # Manually set supports_thinking via PUT
        client.put(f"/agents/{name}", json={"supports_thinking": True})
        r = client.get("/agents")
        assert r.status_code == 200
        agents = r.json()
        matching = [a for a in agents if a["name"] == name]
        assert len(matching) == 1
        assert "supportsThinking" in matching[0]


# ── Skills ────────────────────────────────────────────────────────────────────

class TestSkills:
    def _make_skill(self, tmp_project, slug, name="My Skill", description="Desc", body="Content"):
        d = tmp_project / "skills" / slug
        d.mkdir(parents=True, exist_ok=True)
        (d / "SKILL.md").write_text(f"---\nname: {name}\ndescription: {description}\n---\n\n{body}")

    def test_list_skills_empty(self, client):
        r = client.get("/skills")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_skills_shows_existing(self, client, tmp_project):
        self._make_skill(tmp_project, "my-skill")
        r = client.get("/skills")
        slugs = [s["slug"] for s in r.json()]
        assert "my-skill" in slugs

    def test_list_skills_missing_file_flagged(self, client, tmp_project):
        (tmp_project / "skills" / "orphan").mkdir(parents=True)
        r = client.get("/skills")
        orphan = next(s for s in r.json() if s["slug"] == "orphan")
        assert orphan["missing"] is True

    def test_list_skills_finds_skills_md(self, client, tmp_project):
        d = tmp_project / "skills" / "alt-skill"
        d.mkdir(parents=True)
        (d / "SKILLS.md").write_text("---\nname: Alt\ndescription: alt\n---\n\nContent")
        r = client.get("/skills")
        item = next(s for s in r.json() if s["slug"] == "alt-skill")
        assert item["missing"] is False
        assert item["name"] == "Alt"

    def test_get_skill(self, client, tmp_project):
        self._make_skill(tmp_project, "read-skill", name="Read Skill", description="read", body="Body here")
        r = client.get("/skills/read-skill")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Read Skill"
        assert data["description"] == "read"
        assert data["body"] == "Body here"

    def test_get_skill_not_found(self, client):
        r = client.get("/skills/ghost-skill")
        assert r.status_code == 404

    def test_save_skill(self, client, tmp_project):
        self._make_skill(tmp_project, "edit-skill")
        r = client.put("/skills/edit-skill", json={
            "name": "Edited",
            "description": "Updated desc",
            "body": "New body",
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True

        data = client.get("/skills/edit-skill").json()
        assert data["name"] == "Edited"
        assert data["body"] == "New body"

    def test_create_skill(self, client, tmp_project):
        r = client.post("/skills", json={
            "slug": "brand-new",
            "name": "Brand New",
            "description": "Fresh skill",
            "body": "## Instructions\nDo stuff.",
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True

        skill_file = tmp_project / "skills" / "brand-new" / "SKILL.md"
        assert skill_file.exists()
        content = skill_file.read_text()
        assert "Brand New" in content
        assert "Do stuff." in content

    def test_create_skill_missing_slug(self, client):
        r = client.post("/skills", json={"name": "No Slug"})
        assert r.status_code == 400

    def test_create_skill_duplicate(self, client, tmp_project):
        self._make_skill(tmp_project, "dup-skill")
        r = client.post("/skills", json={"slug": "dup-skill", "name": "Dup"})
        assert r.status_code == 409

    def test_upload_skill_zip(self, client, tmp_project):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("zip-skill/SKILL.md",
                        "---\nname: Zip Skill\ndescription: from zip\n---\n\nZip content")
        buf.seek(0)

        r = client.post("/skills/upload", files={"file": ("skills.zip", buf, "application/zip")})
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert "zip-skill" in data["created"]

        skill_file = tmp_project / "skills" / "zip-skill" / "SKILL.md"
        assert skill_file.exists()

    def test_upload_skill_zip_supports_skills_md(self, client, tmp_project):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("another-skill/SKILLS.md",
                        "---\nname: Another\ndescription: alt format\n---\n\nContent")
        buf.seek(0)

        r = client.post("/skills/upload", files={"file": ("skills.zip", buf, "application/zip")})
        assert r.status_code == 200
        assert "another-skill" in r.json()["created"]

    def test_upload_non_zip_rejected(self, client):
        r = client.post("/skills/upload",
                        files={"file": ("not-a-zip.txt", b"hello", "text/plain")})
        assert r.status_code == 400

    def test_upload_bad_zip_rejected(self, client):
        r = client.post("/skills/upload",
                        files={"file": ("bad.zip", b"not zip data", "application/zip")})
        assert r.status_code == 400

    def test_created_skill_appears_in_list(self, client, tmp_project):
        client.post("/skills", json={"slug": "listed-skill", "name": "Listed", "description": "yes"})
        r = client.get("/skills")
        slugs = [s["slug"] for s in r.json()]
        assert "listed-skill" in slugs

    def test_uploaded_skill_appears_in_list(self, client, tmp_project):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("uploaded-skill/SKILL.md", "---\nname: Uploaded\ndescription: u\n---\n\nBody")
        buf.seek(0)
        client.post("/skills/upload", files={"file": ("s.zip", buf, "application/zip")})

        r = client.get("/skills")
        slugs = [s["slug"] for s in r.json()]
        assert "uploaded-skill" in slugs


# ── Parse skill (unit) ─────────────────────────────────────────────────────────

class TestParseSkill:
    def test_with_frontmatter(self, tmp_path):
        from app import parse_skill
        f = tmp_path / "SKILL.md"
        f.write_text("---\nname: My Skill\ndescription: Desc\n---\n\nBody text")
        result = parse_skill(f)
        assert result["name"] == "My Skill"
        assert result["description"] == "Desc"
        assert result["body"] == "Body text"

    def test_without_frontmatter(self, tmp_path):
        from app import parse_skill
        f = tmp_path / "SKILL.md"
        f.write_text("First line content\nSecond line")
        result = parse_skill(f)
        assert result["description"] == "First line content"

    def test_name_falls_back_to_dir_name(self, tmp_path):
        from app import parse_skill
        skill_dir = tmp_path / "my-folder"
        skill_dir.mkdir()
        f = skill_dir / "SKILL.md"
        f.write_text("---\ndescription: D\n---\n\nBody")
        result = parse_skill(f)
        assert result["name"] == "my-folder"


class TestFindSkillFile:
    def test_finds_skill_md(self, tmp_path):
        from app import find_skill_file
        (tmp_path / "SKILL.md").write_text("x")
        assert find_skill_file(tmp_path) == tmp_path / "SKILL.md"

    def test_finds_skills_md_fallback(self, tmp_path):
        from app import find_skill_file
        (tmp_path / "SKILLS.md").write_text("x")
        assert find_skill_file(tmp_path) == tmp_path / "SKILLS.md"

    def test_prefers_skill_md_over_skills_md(self, tmp_path):
        from app import find_skill_file
        (tmp_path / "SKILL.md").write_text("preferred")
        (tmp_path / "SKILLS.md").write_text("fallback")
        assert find_skill_file(tmp_path) == tmp_path / "SKILL.md"

    def test_returns_none_when_missing(self, tmp_path):
        from app import find_skill_file
        assert find_skill_file(tmp_path) is None


# ── Marketplace ───────────────────────────────────────────────────────────────

class TestMarketplace:
    def _seed_market(self, tmp_project, agent_id, installed=False):
        mkt_dir = tmp_project / "marketplace" / agent_id
        mkt_dir.mkdir(parents=True, exist_ok=True)
        (mkt_dir / "config.json").write_text(json.dumps({
            "emoji": "🧪", "color": "#fff", "description": "Test agent", "model": "", "skills": [], "enabled": True
        }))
        (mkt_dir / "AGENT.md").write_text("# Agent\nTest.")
        (mkt_dir / "IDENTITY.md").write_text("# Identity\nTest.")
        (mkt_dir / "SOUL.md").write_text("# Soul\nTest.")
        if installed:
            dst = tmp_project / "agents" / agent_id
            dst.mkdir(parents=True, exist_ok=True)
            (dst / "config.json").write_text((mkt_dir / "config.json").read_text())

    def test_list_empty(self, client, tmp_project):
        r = client.get("/marketplace/agents")
        assert r.status_code == 200
        assert r.json() == []

    def test_list_shows_agents(self, client, tmp_project):
        self._seed_market(tmp_project, "test-agent")
        r = client.get("/marketplace/agents")
        assert r.status_code == 200
        items = r.json()
        assert any(a["id"] == "test-agent" for a in items)

    def test_list_marks_installed(self, client, tmp_project):
        self._seed_market(tmp_project, "already-there", installed=True)
        r = client.get("/marketplace/agents")
        item = next(a for a in r.json() if a["id"] == "already-there")
        assert item["installed"] is True

    def test_list_marks_not_installed(self, client, tmp_project):
        self._seed_market(tmp_project, "not-yet")
        r = client.get("/marketplace/agents")
        item = next(a for a in r.json() if a["id"] == "not-yet")
        assert item["installed"] is False

    def test_install(self, client, tmp_project):
        self._seed_market(tmp_project, "fresh-agent")
        r = client.post("/marketplace/agents/fresh-agent/install")
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # Installed agent is now in a UUID-prefixed folder
        import app as a
        agent_dir = a._find_agent_dir("fresh-agent")
        assert agent_dir is not None
        assert (agent_dir / "AGENT.md").exists()
        assert (agent_dir / "MEMORY.md").exists()
        assert (agent_dir / "memory").is_dir()

    def test_install_copies_all_files(self, client, tmp_project):
        self._seed_market(tmp_project, "copy-test")
        client.post("/marketplace/agents/copy-test/install")
        import app as a
        agent_dir = a._find_agent_dir("copy-test")
        assert agent_dir is not None
        for fname in ["config.json", "AGENT.md", "IDENTITY.md", "SOUL.md"]:
            assert (agent_dir / fname).exists()

    def test_install_not_found(self, client, tmp_project):
        r = client.post("/marketplace/agents/ghost-agent/install")
        assert r.status_code == 404

    def test_install_duplicate(self, client, tmp_project):
        self._seed_market(tmp_project, "dup-agent", installed=True)
        r = client.post("/marketplace/agents/dup-agent/install")
        assert r.status_code == 409

    def test_installed_agent_appears_in_agents_list(self, client, tmp_project):
        self._seed_market(tmp_project, "visible-agent")
        client.post("/marketplace/agents/visible-agent/install")
        agents = client.get("/agents").json()
        assert any(a["name"] == "visible-agent" for a in agents)


# ── Ollama endpoints ───────────────────────────────────────────────────────────

class TestOllamaModels:
    def _mock_httpx_get(self, json_data):
        """Returns (mock_cls, mock_client) where get() is awaitable and returns a sync-method response."""
        # The response object uses sync .json() and .raise_for_status() in app code
        mock_response = MagicMock()
        mock_response.json.return_value = json_data

        # client.get() is awaited, so it must be an AsyncMock
        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        mock_cls = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        return mock_cls, mock_client

    def test_local_models_ok(self, client):
        mock_cls, mock_client = self._mock_httpx_get(
            {"models": [{"name": "llama3.2"}, {"name": "qwen3.5:27b"}]}
        )
        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/models")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert "llama3.2" in data["models"]

    def test_local_models_unreachable(self, client):
        import httpx
        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_cls = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/models")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is False
        assert data["models"] == []

    def test_local_models_accepts_base_url_param(self, client):
        mock_cls, mock_client = self._mock_httpx_get({"models": [{"name": "phi3"}]})
        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/models?base_url=http://remote:11434")
        assert r.status_code == 200
        call_url = mock_client.get.call_args[0][0]
        assert "remote:11434" in call_url

    def test_pull_missing_model_name(self, client):
        r = client.post("/providers/ollama/pull", json={"base_url": "http://localhost:11434"})
        assert r.status_code == 400

    def test_pull_streams_sse(self, client):
        class FakeStreamResp:
            async def aiter_lines(self):
                yield '{"status":"pulling manifest"}'
                yield '{"status":"success"}'
            async def __aenter__(self): return self
            async def __aexit__(self, *a): pass

        mock_client = MagicMock()
        mock_client.stream.return_value = FakeStreamResp()
        mock_cls = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.post("/providers/ollama/pull",
                            json={"model": "llama3.2", "base_url": "http://localhost:11434"})

        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]
        body = r.text
        assert "pulling manifest" in body
        assert "[DONE]" in body


# ── ConversationEngine ────────────────────────────────────────────────────────

class TestConversationEngine:
    def _agents(self, names):
        return [{"name": n} for n in names]

    # ── round-robin ──

    def test_two_agents_alternate(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B"]))
        assert eng.next_speaker()["name"] == "A"
        assert eng.next_speaker()["name"] == "B"
        assert eng.next_speaker()["name"] == "A"  # wraps

    def test_three_agents_full_cycle(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        order = [eng.next_speaker()["name"] for _ in range(6)]
        assert order == ["A", "B", "C", "A", "B", "C"]

    # ── on_human resets ──

    def test_on_human_resets_to_base_order(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        eng.next_speaker()  # A speaks
        eng.on_human()
        # next cycle should start from A again
        assert eng.next_speaker()["name"] == "A"

    # ── @mention ──

    def test_extract_mention_found(self):
        from conversation_engine import ConversationEngine
        assert ConversationEngine.extract_mention("hey @Claude what do you think") == "Claude"

    def test_extract_mention_none(self):
        from conversation_engine import ConversationEngine
        assert ConversationEngine.extract_mention("no mention here") is None

    def test_on_mention_returns_target(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        target = eng.on_mention("B")
        assert target is not None
        assert target["name"] == "B"

    def test_on_mention_unknown_returns_none(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B"]))
        assert eng.on_mention("Z") is None

    def test_on_mention_drops_rest_of_round(self):
        from conversation_engine import ConversationEngine
        # A B C D — after A speaks, @C → drops B; C speaks immediately
        eng = ConversationEngine(self._agents(["A", "B", "C", "D"]))
        eng.next_speaker()  # A
        eng.on_mention("C")
        # C is the immediate speaker (caller uses returned agent); next cycle starts C
        assert eng.next_speaker()["name"] == "C"

    def test_on_mention_next_cycle_starts_with_target(self):
        from conversation_engine import ConversationEngine
        # base: A B C; @B mid-round → next cycle: B A C; cycle after: A B C
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        eng.next_speaker()  # A
        eng.on_mention("B")
        # immediate: B (from on_mention call above, next_speaker gives next in queue)
        # cycle should be B first
        first = eng.next_speaker()["name"]
        assert first == "B"
        second = eng.next_speaker()["name"]
        third = eng.next_speaker()["name"]
        assert set([second, third]) == {"A", "C"}  # rest of first override cycle
        # cycle after returns to base A B C
        assert eng.next_speaker()["name"] == "A"

    # ── silence disabled for ≤2 agents ──

    def test_silence_never_passes_with_two_agents(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B"]), silence=True)
        # With 2 agents, _should_pass must always return False
        for _ in range(20):
            assert not eng._should_pass({"name": "A"}, 2)

    def test_silence_disabled_by_default(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        # silence=False → _should_pass always False regardless of agent count
        for _ in range(20):
            assert not eng._should_pass({"name": "A"}, 3)

    # ── add_agent / remove_agent ──

    def test_add_agent_speaks_in_cycle(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B"]))
        eng.next_speaker()  # A
        eng.add_agent({"name": "C"})
        # C should appear within the next few turns
        names = [eng.next_speaker()["name"] for _ in range(4)]
        assert "C" in names

    def test_add_agent_duplicate_returns_false(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B"]))
        assert eng.add_agent({"name": "A"}) is False
        assert len(eng.agents) == 2

    def test_remove_agent_no_longer_speaks(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        eng.remove_agent("B")
        names = [eng.next_speaker()["name"] for _ in range(6)]
        assert "B" not in names

    def test_remove_agent_unknown_returns_false(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B"]))
        assert eng.remove_agent("Z") is False

    def test_remove_agent_updates_agents_list(self):
        from conversation_engine import ConversationEngine
        eng = ConversationEngine(self._agents(["A", "B", "C"]))
        eng.remove_agent("C")
        assert not any(a["name"] == "C" for a in eng.agents)
        assert len(eng.agents) == 2


# ── Session folder structure ──────────────────────────────────────────────────

class TestSessionFolders:
    def test_save_history_creates_folder(self, tmp_project):
        import app as a
        sid = "test-session-001"
        msgs = [{"role": "human", "content": "hi"}]
        a.save_history(sid, msgs)
        assert (a.HISTORY_DIR / sid).is_dir()
        assert (a.HISTORY_DIR / sid / "messages.json").exists()

    def test_save_history_creates_workspace_subdir(self, tmp_project):
        import app as a
        a.save_history("ws-test", [])
        assert (a.HISTORY_DIR / "ws-test" / "workspace").is_dir()

    def test_save_and_read_roundtrip(self, tmp_project):
        import app as a
        sid = "roundtrip-session"
        msgs = [{"role": "human", "content": "hello"}, {"role": "agent", "name": "Claude", "content": "hi"}]
        a.save_history(sid, msgs)
        loaded = json.loads(a.session_messages_path(sid).read_text())
        assert loaded == msgs

    def test_list_sessions_finds_folder_sessions(self, client, tmp_project):
        import app as a
        a.save_history("folder-session", [{"role": "human", "content": "test"}])
        r = client.get("/sessions")
        assert r.status_code == 200
        assert any(s["id"] == "folder-session" for s in r.json()["sessions"])

    def test_migrate_flat_json_to_folder(self, tmp_project):
        import app as a
        # Create old-style flat .json file
        old_file = a.HISTORY_DIR / "legacy-session.json"
        msgs = [{"role": "human", "content": "legacy"}]
        old_file.write_text(json.dumps(msgs))
        # Run migration
        a.migrate_history_to_folders()
        # Old file gone, new folder structure exists
        assert not old_file.exists()
        assert (a.HISTORY_DIR / "legacy-session" / "messages.json").exists()
        loaded = json.loads((a.HISTORY_DIR / "legacy-session" / "messages.json").read_text())
        assert loaded == msgs

    def test_migrate_is_idempotent(self, tmp_project):
        import app as a
        # If messages.json already exists, migration should not overwrite
        old_file = a.HISTORY_DIR / "idempotent.json"
        old_content = [{"role": "human", "content": "old"}]
        old_file.write_text(json.dumps(old_content))
        # Pre-create the folder with different content
        folder = a.HISTORY_DIR / "idempotent"
        folder.mkdir()
        new_content = [{"role": "human", "content": "new"}]
        (folder / "messages.json").write_text(json.dumps(new_content))
        a.migrate_history_to_folders()
        # messages.json should NOT be overwritten
        loaded = json.loads((folder / "messages.json").read_text())
        assert loaded == new_content


# ── Marketplace name override ─────────────────────────────────────────────────

class TestMarketplaceNameOverride:
    def _seed_market(self, tmp_project, agent_id):
        mkt_dir = tmp_project / "marketplace" / agent_id
        mkt_dir.mkdir(parents=True, exist_ok=True)
        (mkt_dir / "config.json").write_text(json.dumps({
            "emoji": "🧪", "color": "#fff", "description": "Test", "model": "", "skills": [], "enabled": True
        }))
        for f in ["AGENT.md", "IDENTITY.md", "SOUL.md"]:
            (mkt_dir / f).write_text(f"# {f}\n")

    def test_install_with_custom_name(self, client, tmp_project):
        self._seed_market(tmp_project, "base-agent")
        r = client.post("/marketplace/agents/base-agent/install",
                        json={"name": "my-custom-agent"})
        assert r.status_code == 200
        # Agent is now in a UUID-prefixed folder
        import app as a
        agent_dir = a._find_agent_dir("my-custom-agent")
        assert agent_dir is not None
        assert agent_dir.is_dir()
        assert a._find_agent_dir("base-agent") is None  # base-agent not installed under that name

    def test_install_custom_name_in_config(self, client, tmp_project):
        self._seed_market(tmp_project, "base-agent2")
        client.post("/marketplace/agents/base-agent2/install",
                    json={"name": "renamed-agent"})
        import app as a
        agent_dir = a._find_agent_dir("renamed-agent")
        assert agent_dir is not None
        cfg = json.loads((agent_dir / "config.json").read_text())
        assert cfg["name"] == "renamed-agent"

    def test_install_same_template_twice_different_names(self, client, tmp_project):
        self._seed_market(tmp_project, "template-agent")
        r1 = client.post("/marketplace/agents/template-agent/install",
                         json={"name": "instance-one"})
        r2 = client.post("/marketplace/agents/template-agent/install",
                         json={"name": "instance-two"})
        assert r1.status_code == 200
        assert r2.status_code == 200
        import app as a
        assert a._find_agent_dir("instance-one") is not None
        assert a._find_agent_dir("instance-two") is not None

    def test_install_custom_name_duplicate_still_409(self, client, tmp_project):
        self._seed_market(tmp_project, "tmpl")
        client.post("/marketplace/agents/tmpl/install", json={"name": "taken"})
        r = client.post("/marketplace/agents/tmpl/install", json={"name": "taken"})
        assert r.status_code == 409


# ── Workspaces ────────────────────────────────────────────────────────────────

class TestWorkspaces:
    def test_list_empty(self, client):
        r = client.get("/workspaces")
        assert r.status_code == 200
        assert r.json() == []

    def test_create_workspace(self, client, tmp_project):
        r = client.post("/workspaces", json={"name": "My Project", "description": "desc", "system_prompt": "focus"})
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "My Project"
        assert data["description"] == "desc"
        assert data["system_prompt"] == "focus"
        assert "id" in data
        assert (tmp_project / "workspaces" / data["id"]).is_dir()
        assert (tmp_project / "workspaces" / data["id"] / "files").is_dir()

    def test_create_missing_name_400(self, client):
        r = client.post("/workspaces", json={})
        assert r.status_code == 400

    def test_list_after_create(self, client):
        client.post("/workspaces", json={"name": "WS One"})
        client.post("/workspaces", json={"name": "WS Two"})
        r = client.get("/workspaces")
        names = [w["name"] for w in r.json()]
        assert "WS One" in names
        assert "WS Two" in names

    def test_get_workspace(self, client):
        created = client.post("/workspaces", json={"name": "GetMe"}).json()
        r = client.get(f"/workspaces/{created['id']}")
        assert r.status_code == 200
        assert r.json()["name"] == "GetMe"
        assert "files" in r.json()

    def test_get_not_found(self, client):
        r = client.get("/workspaces/no-such-workspace")
        assert r.status_code == 404

    def test_update_workspace(self, client):
        created = client.post("/workspaces", json={"name": "Old Name"}).json()
        r = client.put(f"/workspaces/{created['id']}", json={"name": "New Name", "system_prompt": "updated"})
        assert r.status_code == 200
        assert r.json()["ok"] is True
        get = client.get(f"/workspaces/{created['id']}").json()
        assert get["name"] == "New Name"
        assert get["system_prompt"] == "updated"

    def test_delete_workspace(self, client, tmp_project):
        created = client.post("/workspaces", json={"name": "Temp"}).json()
        ws_path = tmp_project / "workspaces" / created["id"]
        assert ws_path.exists()
        r = client.delete(f"/workspaces/{created['id']}")
        assert r.status_code == 200
        assert not ws_path.exists()
        # Should not appear in list
        names = [w["name"] for w in client.get("/workspaces").json()]
        assert "Temp" not in names

    def test_delete_detaches_sessions(self, client, tmp_project):
        import app as a
        created = client.post("/workspaces", json={"name": "WS"}).json()
        ws_id = created["id"]
        # Create a fake session with workspace_id
        sess_dir = tmp_project / "history" / "test-session"
        sess_dir.mkdir()
        msgs = [{"type": "system", "text": "Topic: hello", "workspace_id": ws_id, "timestamp": "2026-01-01"}]
        (sess_dir / "messages.json").write_text(json.dumps(msgs))
        # Delete workspace
        client.delete(f"/workspaces/{ws_id}")
        # Session's workspace_id should be null
        updated = json.loads((sess_dir / "messages.json").read_text())
        assert updated[0]["workspace_id"] is None

    def test_sessions_list_includes_workspace_id(self, client, tmp_project):
        created = client.post("/workspaces", json={"name": "WS"}).json()
        ws_id = created["id"]
        sess_dir = tmp_project / "history" / "2026-test"
        sess_dir.mkdir()
        msgs = [{"type": "system", "text": "Topic: t", "workspace_id": ws_id, "timestamp": "2026-01-01"}]
        (sess_dir / "messages.json").write_text(json.dumps(msgs))
        sessions = client.get("/sessions").json()["sessions"]
        found = next((s for s in sessions if s["id"] == "2026-test"), None)
        assert found is not None
        assert found["workspace_id"] == ws_id


# ── Phase 0.1: Subprocess Recovery ───────────────────────────────────────────

class TestSubprocessRecovery:
    """Phase 0.1 — subprocess crash / timeout recovery."""

    def test_exception_base_class(self):
        import app as a
        e = a.SubprocessError(agent="claude", partial_output="hello", stderr_output="")
        assert e.agent == "claude"
        assert e.partial_output == "hello"

    def test_timeout_error_carries_seconds(self):
        import app as a
        e = a.SubprocessTimeoutError(
            agent="claude", partial_output="hi", stderr_output="", timeout_seconds=60
        )
        assert e.timeout_seconds == 60
        assert isinstance(e, a.SubprocessError)

    def test_crash_error_carries_exit_code(self):
        import app as a
        e = a.SubprocessCrashError(
            agent="gemini", partial_output="", stderr_output="err", exit_code=1
        )
        assert e.exit_code == 1
        assert isinstance(e, a.SubprocessError)

    def test_startup_error_empty_partial(self):
        import app as a
        e = a.SubprocessStartupError(agent="claude", cause="FileNotFoundError")
        assert e.partial_output == ""
        assert isinstance(e, a.SubprocessError)

    def test_resolve_timeout_agent_level_wins(self, tmp_project):
        import app as a
        agent = {"name": "claude", "workspace": tmp_project, "idle_timeout_seconds": 90}
        assert a._resolve_timeout(agent, "idle_timeout_seconds", 60) == 90

    def test_resolve_timeout_falls_back_to_default(self, tmp_project):
        import app as a
        agent = {"name": "claude", "workspace": tmp_project}
        assert a._resolve_timeout(agent, "idle_timeout_seconds", 60) == 60

    def test_error_message_timeout(self):
        import app as a
        e = a.SubprocessTimeoutError("claude", "", "", 60)
        assert "60" in a._error_message(e) and "claude" in a._error_message(e)

    def test_error_message_crash(self):
        import app as a
        e = a.SubprocessCrashError("gemini", exit_code=1)
        assert "gemini" in a._error_message(e)

    @pytest.mark.asyncio
    async def test_nonzero_exit_raises_crash_error(self, tmp_project):
        import app as a
        agent = {"name": "claude", "workspace": tmp_project,
                 "cmd": ["cat"], "startup_timeout_seconds": 5, "idle_timeout_seconds": 5}

        call_count = 0
        async def mock_read(n):
            nonlocal call_count
            call_count += 1
            return b"output" if call_count == 1 else b""

        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        mock_proc.stdout.read = mock_read
        mock_proc.stderr = AsyncMock()
        mock_proc.stderr.read = AsyncMock(return_value=b"some error")
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()
        mock_proc.returncode = 1

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with pytest.raises(a.SubprocessCrashError) as exc_info:
                async for _ in a.stream_cli_agent(agent, "hello"):
                    pass

        assert exc_info.value.exit_code == 1
        assert "some error" in exc_info.value.stderr_output

    @pytest.mark.asyncio
    async def test_command_not_found_raises_startup_error(self, tmp_project):
        import app as a
        agent = {"name": "claude", "workspace": tmp_project,
                 "cmd": ["nonexistent-xyz"], "startup_timeout_seconds": 5, "idle_timeout_seconds": 5}

        with patch("asyncio.create_subprocess_exec", side_effect=FileNotFoundError("no such file")):
            with pytest.raises(a.SubprocessStartupError) as exc_info:
                async for _ in a.stream_cli_agent(agent, "hello"):
                    pass
        assert exc_info.value.agent == "claude"
        assert exc_info.value.partial_output == ""

    @pytest.mark.asyncio
    async def test_startup_timeout_raises_startup_error(self, tmp_project):
        import app as a
        import asyncio as aio

        agent = {"name": "claude", "workspace": tmp_project,
                 "cmd": ["cat"], "startup_timeout_seconds": 0.05, "idle_timeout_seconds": 5}

        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        async def _hanging_read(n):
            await aio.sleep(999)
            return b""
        mock_proc.stdout.read = _hanging_read
        mock_proc.stderr = AsyncMock()
        mock_proc.stderr.read = AsyncMock(return_value=b"")
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with pytest.raises(a.SubprocessStartupError):
                async for _ in a.stream_cli_agent(agent, "hello"):
                    pass

    @pytest.mark.asyncio
    async def test_idle_timeout_raises_with_partial_output(self, tmp_project):
        import app as a
        import asyncio as aio

        agent = {"name": "claude", "workspace": tmp_project,
                 "cmd": ["cat"], "startup_timeout_seconds": 5, "idle_timeout_seconds": 0.05}

        call_count = 0
        async def mock_read(n):
            nonlocal call_count
            call_count += 1
            if call_count == 1: return b"hello "
            if call_count == 2: return b"world"
            await aio.sleep(999)

        mock_proc = MagicMock()
        mock_proc.stdout = MagicMock()
        mock_proc.stdout.read = mock_read
        mock_proc.stderr = AsyncMock()
        mock_proc.stderr.read = AsyncMock(return_value=b"")
        mock_proc.kill = MagicMock()
        mock_proc.wait = AsyncMock()
        mock_proc.returncode = 0

        chunks = []
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            with pytest.raises(a.SubprocessTimeoutError) as exc_info:
                async for chunk in a.stream_cli_agent(agent, "hello"):
                    chunks.append(chunk)

        assert chunks == ["hello ", "world"]
        assert exc_info.value.partial_output == "hello world"

    # ── Chunk 3: WS handler agent_error event ──────────────────────────────

    def test_ws_sends_agent_error_on_timeout(self, tmp_project):
        """agent_error WS event sent when stream_cli_agent raises SubprocessTimeoutError."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟣", "color": "#a78bfa", "model": "test-model", "enabled": True,
        }))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            yield "hello"
            raise a.SubprocessTimeoutError(
                agent="claude", partial_output="hello", stderr_output="", timeout_seconds=60
            )

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    events = []
                    for _ in range(30):
                        try:
                            msg = ws.receive_json()
                            events.append(msg)
                            if msg.get("type") in ("ready",):
                                break
                        except Exception:
                            break

        types = [e["type"] for e in events]
        assert "agent_error" in types, f"events: {types}"
        err = next(e for e in events if e["type"] == "agent_error")
        assert err["agent"] == "claude"
        assert err["error_type"] == "SubprocessTimeoutError"
        assert err["partial_text"] is None   # chunks already sent as "chunk" events

    def test_ws_sends_partial_text_on_startup_failure(self, tmp_project):
        """agent_error has partial_text when startup fails (no chunks sent)."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟣", "color": "#a78bfa", "model": "test-model", "enabled": True,
        }))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            raise a.SubprocessStartupError(agent="claude", cause="not found")
            yield  # make it a generator

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    events = []
                    for _ in range(30):
                        try:
                            msg = ws.receive_json()
                            events.append(msg)
                            if msg.get("type") in ("ready",):
                                break
                        except Exception:
                            break

        err = next((e for e in events if e["type"] == "agent_error"), None)
        assert err is not None, f"events: {[e['type'] for e in events]}"
        assert err["error_type"] == "SubprocessStartupError"
        # partial_text is "" (empty string, not None) — no output was produced
        assert err["partial_text"] is not None

    # ── Chunk 3: build_prompt continuation hint ────────────────────────────

    def test_build_prompt_injects_continuation_hint(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir, "pending_continuation": True}
        prompt = a.build_prompt(agent, "history here")
        assert "打斷" in prompt

    def test_build_prompt_clears_flag_after_injection(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir, "pending_continuation": True}
        a.build_prompt(agent, "history")
        assert agent.get("pending_continuation") is False

    def test_build_prompt_no_hint_when_flag_absent(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history")
        assert "打斷" not in prompt


class TestHistorySliding:
    """Phase 0.2 — history sliding window truncation."""

    def _h(self, turns):
        return "".join(f"\n[{a}]: {t}\n" for a, t in turns)

    def test_no_truncation_when_under_limit(self):
        import app as a
        h = self._h([("Claude", "hello"), ("Gemini", "world")])
        result = a.truncate_history(h, max_chars=10000)
        assert result == h
        assert a.TRUNCATION_MARKER not in result

    def test_truncation_removes_oldest_turns(self):
        import app as a
        h = self._h([("A", "x" * 100), ("B", "y" * 100), ("C", "z" * 100), ("D", "w" * 100)])
        result = a.truncate_history(h, max_chars=220)
        assert "[D]:" in result
        assert "[A]:" not in result
        assert a.TRUNCATION_MARKER in result

    def test_truncation_marker_appears_once(self):
        import app as a
        h = self._h([("A", "x" * 200), ("B", "y" * 200)])
        result = a.truncate_history(h, max_chars=50)
        assert result.count(a.TRUNCATION_MARKER) == 1

    def test_no_mid_sentence_cut(self):
        import app as a
        h = self._h([("A", "line1\nline2\nline3"), ("B", "short")])
        result = a.truncate_history(h, max_chars=30)
        stripped = result.replace(a.TRUNCATION_MARKER, "").strip()
        if stripped:
            assert stripped.startswith("[")

    def test_equal_to_limit_not_truncated(self):
        import app as a
        h = self._h([("A", "hello")])
        result = a.truncate_history(h, len(h))
        assert result == h

    def test_single_oversized_turn(self):
        import app as a
        h = self._h([("A", "x" * 500)])
        result = a.truncate_history(h, max_chars=10)
        assert a.TRUNCATION_MARKER in result


class TestImageCompat:
    """Phase 0.3 — supports_image flag per agent/model."""

    def test_resolve_supports_image_agent_level_false(self, tmp_project):
        import app as a
        agent = {"name": "codex", "workspace": tmp_project, "supports_image": False}
        assert a._resolve_supports_image(agent) is False

    def test_resolve_supports_image_agent_true_overrides_model(self, tmp_project):
        import app as a
        # agent-level True wins over model-level False
        agent = {"name": "codex", "workspace": tmp_project, "supports_image": True}
        assert a._resolve_supports_image(agent) is True

    def test_resolve_supports_image_defaults_true(self, tmp_project):
        import app as a
        # no flag anywhere → default True
        agent = {"name": "unknown-model", "workspace": tmp_project}
        assert a._resolve_supports_image(agent) is True

    def test_codex_default_models_false(self):
        import app as a
        assert a.DEFAULT_MODELS["codex"].get("supports_image") is False

    def test_claude_default_models_true(self):
        import app as a
        assert a.DEFAULT_MODELS["claude"].get("supports_image") is True

    @pytest.mark.asyncio
    async def test_no_image_args_when_not_supported(self, tmp_project):
        import app as a
        agent = {"name": "codex", "workspace": tmp_project,
                 "cmd": ["cat"], "supports_image": False,
                 "startup_timeout_seconds": 5, "idle_timeout_seconds": 5}

        images = [{"name": "test.png", "mime": "image/png",
                   "base64": "iVBORw0KGgo="}]  # tiny fake png

        captured_args = {}

        async def mock_exec(*args, **kwargs):
            captured_args["args"] = args
            # Return a mock that yields nothing and exits 0
            mock_proc = MagicMock()
            mock_proc.stdout = MagicMock()
            call_count = [0]
            async def _read(n):
                call_count[0] += 1
                return b"hello" if call_count[0] == 1 else b""
            mock_proc.stdout.read = _read
            mock_proc.stderr = MagicMock()
            mock_proc.stderr.read = AsyncMock(return_value=b"")
            mock_proc.kill = MagicMock()
            mock_proc.wait = AsyncMock()
            mock_proc.returncode = 0
            return mock_proc

        with patch("asyncio.create_subprocess_exec", side_effect=mock_exec):
            chunks = []
            async for chunk in a.stream_cli_agent(agent, "hello", images=images):
                chunks.append(chunk)

        assert "--add-file" not in " ".join(str(x) for x in captured_args.get("args", []))


# ── Phase 0.4: Protected Paths ────────────────────────────────────────────────

class TestProtectedPaths:
    """Phase 0.4 — filename validation and path protection."""

    # ── validate_filename unit tests ──────────────────────────────────────────

    def test_valid_filename_passes(self):
        import app as a
        a.validate_filename("note.txt")  # no exception

    def test_valid_filename_with_space(self):
        import app as a
        a.validate_filename("my note.md")

    def test_valid_filename_with_dash_and_numbers(self):
        import app as a
        a.validate_filename("report-2026.pdf")

    def test_dotdot_raises(self):
        import app as a
        with pytest.raises(ValueError, match=r"\.\."):
            a.validate_filename("../secret.txt")

    def test_slash_raises(self):
        import app as a
        with pytest.raises(ValueError, match="path separator"):
            a.validate_filename("subdir/file.txt")

    def test_backslash_raises(self):
        import app as a
        with pytest.raises(ValueError, match="path separator"):
            a.validate_filename("subdir\\file.txt")

    def test_double_dot_in_middle_raises(self):
        import app as a
        with pytest.raises(ValueError, match=r"\.\."):
            a.validate_filename("file..txt")

    def test_protected_filename_raises(self):
        import app as a
        with pytest.raises(ValueError, match="protected"):
            a.validate_filename("guide.md")

    def test_protected_filename_allowed_when_flag_set(self):
        import app as a
        a.validate_filename("guide.md", allow_protected=True)  # no exception

    def test_empty_filename_raises(self):
        import app as a
        with pytest.raises(ValueError, match="empty"):
            a.validate_filename("")

    def test_too_long_filename_raises(self):
        import app as a
        with pytest.raises(ValueError, match="too long"):
            a.validate_filename("a" * 256)

    def test_semicolon_raises(self):
        import app as a
        with pytest.raises(ValueError, match="invalid characters"):
            a.validate_filename("file;rm.txt")

    # ── safe_workspace_path unit tests ────────────────────────────────────────

    def test_safe_path_returns_correct_path(self, tmp_path):
        import app as a
        result = a.safe_workspace_path(str(tmp_path), "note.txt")
        assert result == str(tmp_path / "note.txt")

    def test_safe_path_detects_symlink_traversal(self, tmp_path):
        import app as a
        outside = tmp_path.parent / "outside_secret.txt"
        outside.write_text("secret")
        link = tmp_path / "link.txt"
        link.symlink_to(outside)
        with pytest.raises(ValueError, match="traversal"):
            a.safe_workspace_path(str(tmp_path), "link.txt")

    # ── integration tests on upload endpoint ──────────────────────────────────

    def test_upload_valid_file(self, client):
        ws = client.post("/workspaces", json={"name": "P04 Valid"}).json()
        ws_id = ws["id"]
        r = client.post(
            f"/workspaces/{ws_id}/files",
            files={"file": ("note.txt", b"hello world", "text/plain")},
        )
        assert r.status_code == 200

    def test_upload_path_traversal_403(self, client):
        ws = client.post("/workspaces", json={"name": "P04 Traversal"}).json()
        ws_id = ws["id"]
        r = client.post(
            f"/workspaces/{ws_id}/files",
            files={"file": ("../../etc/passwd", b"bad", "text/plain")},
        )
        assert r.status_code == 403

    def test_upload_protected_filename_403(self, client):
        ws = client.post("/workspaces", json={"name": "P04 Protected"}).json()
        ws_id = ws["id"]
        r = client.post(
            f"/workspaces/{ws_id}/files",
            files={"file": ("guide.md", b"hacked", "text/plain")},
        )
        assert r.status_code == 403

    def test_upload_invalid_char_403(self, client):
        ws = client.post("/workspaces", json={"name": "P04 Invalid"}).json()
        ws_id = ws["id"]
        r = client.post(
            f"/workspaces/{ws_id}/files",
            files={"file": ("x;y.txt", b"bad", "text/plain")},
        )
        assert r.status_code == 403


class TestAgentMode:
    """Phase 1.1 — agent chat/think mode."""

    def test_build_prompt_chat_mode_adds_concise_prefix(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history", mode="chat")
        assert "Keep your response concise" in prompt

    def test_build_prompt_think_mode_no_concise_prefix(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history", mode="think")
        assert "2-3 sentences" not in prompt

    def test_build_prompt_default_mode_is_chat(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt_default = a.build_prompt(agent, "history")
        prompt_chat = a.build_prompt(agent, "history", mode="chat")
        assert "Keep your response concise" in prompt_default

    @pytest.mark.asyncio
    async def test_stream_cli_adds_effort_max_when_think_supported(self, tmp_project):
        """think mode + supports_thinking=True → subprocess gets --effort max."""
        import app as a
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = list(args)
            raise FileNotFoundError("mock")

        agent = {
            "name": "claude",
            "cmd": ["claude", "--print"],
            "workspace": tmp_project,
            "supports_thinking": True,
            "supports_image": False,
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_cli_agent(agent, "prompt", mode="think"):
                    pass
            except Exception:
                pass
        args = captured.get("args", [])
        assert "--effort" in args, f"Expected --effort in args: {args}"
        idx = args.index("--effort")
        assert args[idx + 1] == "max", f"Expected max after --effort, got {args[idx+1]!r}"

    @pytest.mark.asyncio
    async def test_stream_cli_no_effort_when_not_supported(self, tmp_project):
        """think mode + supports_thinking=False → no --effort flag."""
        import app as a
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = list(args)
            raise FileNotFoundError("mock")

        agent = {
            "name": "claude",
            "cmd": ["claude", "--print"],
            "workspace": tmp_project,
            "supports_thinking": False,
            "supports_image": False,
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_cli_agent(agent, "prompt", mode="think"):
                    pass
            except Exception:
                pass
        assert "--effort" not in captured.get("args", []), f"args: {captured.get('args')}"

    @pytest.mark.asyncio
    async def test_stream_cli_no_effort_in_chat_mode(self, tmp_project):
        """chat mode → no --effort flag even if supports_thinking=True."""
        import app as a
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = list(args)
            raise FileNotFoundError("mock")

        agent = {
            "name": "claude",
            "cmd": ["claude", "--print"],
            "workspace": tmp_project,
            "supports_thinking": True,
            "supports_image": False,
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_cli_agent(agent, "prompt", mode="chat"):
                    pass
            except Exception:
                pass
        assert "--effort" not in captured.get("args", []), f"args: {captured.get('args')}"

    def test_set_mode_broadcast_to_all_clients(self, tmp_project):
        """set_mode WS message triggers mode_update broadcast."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟣", "color": "#a78bfa", "enabled": True,
        }))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    for _ in range(30):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "set_mode", "agent": "claude", "mode": "think"})
                    for _ in range(10):
                        msg = ws.receive_json()
                        if msg.get("type") == "mode_update":
                            assert msg["agent"] == "claude"
                            assert msg["mode"] == "think"
                            break
                    else:
                        pytest.fail("No mode_update received")

    def test_set_mode_unknown_agent_returns_error(self, tmp_project):
        """set_mode with unknown agent sends error to sender only."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "🟣", "color": "#a78bfa", "enabled": True,
        }))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    for _ in range(30):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "set_mode", "agent": "nonexistent", "mode": "think"})
                    for _ in range(10):
                        msg = ws.receive_json()
                        if msg.get("type") == "error":
                            assert "nonexistent" in msg.get("message", "").lower() or "unknown" in msg.get("message", "").lower()
                            break
                    else:
                        pytest.fail("No error received for unknown agent")

    def test_tui_think_command_sets_all_agents(self, tmp_project):
        """/think command sets all agents to think mode."""
        import app as a

        for name in ["claude", "gemini"]:
            d = tmp_project / "agents" / name
            d.mkdir(parents=True)
            (d / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
            (d / "AGENT.md").write_text(f"You are {name}.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude", "gemini"], "auto": False})
                    for _ in range(50):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "human", "text": "/think"})
                    updates = []
                    for _ in range(15):
                        msg = ws.receive_json()
                        if msg.get("type") == "mode_update":
                            updates.append(msg)
                        if len(updates) == 2:
                            break
                    assert len(updates) == 2
                    modes = {u["agent"]: u["mode"] for u in updates}
                    assert all(m == "think" for m in modes.values())

    def test_tui_think_at_agent_sets_only_that_agent(self, tmp_project):
        """/think @claude sets only claude."""
        import app as a

        for name in ["claude", "gemini"]:
            d = tmp_project / "agents" / name
            d.mkdir(parents=True)
            (d / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#aaa", "enabled": True}))
            (d / "AGENT.md").write_text(f"You are {name}.")

        async def mock_stream(*args, **kwargs):
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude", "gemini"], "auto": False})
                    for _ in range(50):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "human", "text": "/think @claude"})
                    updates = []
                    # Collect mode_updates, stop after receiving 'ready' or hitting the limit
                    for _ in range(20):
                        msg = ws.receive_json()
                        if msg.get("type") == "mode_update":
                            updates.append(msg)
                        elif msg.get("type") == "ready":
                            break
                    assert len(updates) == 1
                    assert updates[0]["agent"] == "claude"
                    assert updates[0]["mode"] == "think"

    def test_tui_command_not_forwarded_to_agents(self, tmp_project):
        """/think command is NOT sent to agents as a human message."""
        import app as a

        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({"emoji": "🟣", "color": "#a78bfa", "enabled": True}))
        (agent_dir / "AGENT.md").write_text("You are Claude.")

        received_prompts = []

        async def mock_stream(agent, prompt, **kwargs):
            received_prompts.append(prompt)
            yield "hello"

        with patch.object(a, "stream_agent", mock_stream):
            with TestClient(a.app) as client:
                with client.websocket_connect("/ws") as ws:
                    ws.send_json({"type": "start", "topic": "test",
                                  "agents": ["claude"], "auto": False})
                    for _ in range(30):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
                    ws.send_json({"type": "human", "text": "/think"})
                    for _ in range(10):
                        msg = ws.receive_json()
                        if msg.get("type") == "ready":
                            break
        for p in received_prompts:
            assert "/think" not in p


class TestInterceptModeCommand:
    """Unit tests for intercept_mode_command() helper."""

    def _agents(self):
        return [{"name": "Claude"}, {"name": "Gemini"}]

    def test_non_command_not_intercepted(self):
        import app as a
        modes = {"Claude": "chat", "Gemini": "chat"}
        intercepted, _ = a.intercept_mode_command("hello world", modes, self._agents())
        assert not intercepted

    def test_think_sets_all_agents(self):
        import app as a
        modes = {"Claude": "chat", "Gemini": "chat"}
        intercepted, updates = a.intercept_mode_command("/think", modes, self._agents())
        assert intercepted
        assert all(u["mode"] == "think" for u in updates)
        assert len(updates) == 2
        assert modes["Claude"] == "think"
        assert modes["Gemini"] == "think"

    def test_chat_at_agent_sets_only_that_agent(self):
        import app as a
        modes = {"Claude": "think", "Gemini": "think"}
        intercepted, updates = a.intercept_mode_command("/chat @Claude", modes, self._agents())
        assert intercepted
        assert len(updates) == 1
        assert updates[0]["agent"] == "Claude"
        assert updates[0]["mode"] == "chat"
        assert modes["Gemini"] == "think"  # unchanged

    def test_unknown_agent_returns_error(self):
        import app as a
        modes = {"Claude": "chat"}
        intercepted, updates = a.intercept_mode_command("/think @Nobody", modes, self._agents())
        assert intercepted
        assert len(updates) == 1
        assert "error" in updates[0]
        assert "Nobody" in updates[0]["error"]
        assert modes["Claude"] == "chat"  # unchanged


class TestScenarios:
    """Phase 1.2 — scenario templates."""

    def test_get_scenarios_empty_when_no_dir(self, client):
        """GET /scenarios returns [] when scenarios/ dir does not exist."""
        resp = client.get("/scenarios")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_scenarios_returns_all_valid_files(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir()
        (scenarios_dir / "test1.json").write_text(json.dumps({
            "id": "test1", "name": "Test 1", "description": "Desc",
            "system_prompt": "You are helpful."
        }))
        (scenarios_dir / "test2.json").write_text(json.dumps({
            "id": "test2", "name": "Test 2", "description": "Desc 2",
            "system_prompt": "Be concise."
        }))
        with TestClient(a.app) as client:
            resp = client.get("/scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        ids = {s["id"] for s in data}
        assert ids == {"test1", "test2"}

    def test_get_scenarios_skips_malformed_json(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir()
        (scenarios_dir / "valid.json").write_text(json.dumps({
            "id": "valid", "name": "Valid", "description": "ok", "system_prompt": "ok"
        }))
        (scenarios_dir / "broken.json").write_text("NOT VALID JSON {{{")
        with TestClient(a.app) as client:
            resp = client.get("/scenarios")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == "valid"

    def test_scenario_system_prompt_injected_in_build_prompt(self, tmp_project):
        """When scenario_system_prompt is set, it appears in the prompt."""
        import app as a
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(
            agent, "history",
            scenario_system_prompt="Review this code carefully.",
        )
        assert "Review this code carefully." in prompt

    def test_blank_mode_injects_no_context(self, tmp_project):
        """blank_mode=True skips both workspace guide and scenario."""
        import app as a
        ws_dir = tmp_project / "workspaces" / "ws1"
        ws_dir.mkdir(parents=True)
        (ws_dir / "config.json").write_text(json.dumps({
            "id": "ws1", "name": "WS", "system_prompt": "Secret guide"
        }))
        agent_dir = tmp_project / "agents" / "claude"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are Claude.")
        agent = {"name": "claude", "workspace": agent_dir}
        prompt = a.build_prompt(
            agent, "history",
            workspace_id="ws1",
            blank_mode=True,
        )
        assert "Secret guide" not in prompt
        assert "Workspace Guide" not in prompt


class TestParseSkillSource:
    def test_reads_source_from_frontmatter(self, tmp_path):
        from app import parse_skill
        f = tmp_path / "SKILL.md"
        f.write_text("---\nname: review\nsource: gstack\nsource_url: https://github.com/garrytan/gstack\nsource_version: 0.9.0\ndescription: Code review\n---\n\nBody here")
        s = parse_skill(f)
        assert s["source"] == "gstack"
        assert s["source_url"] == "https://github.com/garrytan/gstack"
        assert s["source_version"] == "0.9.0"

    def test_source_defaults_empty_when_absent(self, tmp_path):
        from app import parse_skill
        f = tmp_path / "SKILL.md"
        f.write_text("---\nname: brainstorm\ndescription: Think\n---\n\nBody")
        s = parse_skill(f)
        assert s["source"] == ""
        assert s["source_url"] == ""
        assert s["source_version"] == ""


# ── Task 2: list_skills / get_skill expose source metadata ────────────────────

class TestListSkillsSource:
    def _make_skill(self, root, slug, source="", name=None):
        d = root / "skills" / slug
        d.mkdir(parents=True, exist_ok=True)
        n = name or slug
        fm = f"name: {n}\n"
        if source:
            fm += f"source: {source}\n"
        (d / "SKILL.md").write_text(f"---\n{fm}---\n\nBody")

    def test_list_includes_source_fields(self, client, tmp_project):
        self._make_skill(tmp_project, "my-review", source="gstack", name="review")
        r = client.get("/skills")
        assert r.status_code == 200
        item = next(x for x in r.json() if x["slug"] == "my-review")
        assert item["source"] == "gstack"
        assert "source_url" in item
        assert "source_version" in item

    def test_list_display_name_with_source(self, client, tmp_project):
        self._make_skill(tmp_project, "my-review", source="gstack", name="review")
        r = client.get("/skills")
        item = next(x for x in r.json() if x["slug"] == "my-review")
        assert item["name"] == "gstack:review"

    def test_list_display_name_without_source(self, client, tmp_project):
        self._make_skill(tmp_project, "brainstorm", name="brainstorm")
        r = client.get("/skills")
        item = next(x for x in r.json() if x["slug"] == "brainstorm")
        assert item["name"] == "brainstorm"

    def test_get_skill_includes_source(self, client, tmp_project):
        self._make_skill(tmp_project, "my-skill", source="gstack", name="myskill")
        r = client.get("/skills/my-skill")
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "gstack"
        assert "source_url" in data
        assert "source_version" in data


# ── Task 3: resolve_human_text handles source:slug format ─────────────────────

class TestResolveSkillWithSource:
    def _make_gstack_skill(self, root, slug):
        gstack = root / "skills" / "gstack" / slug
        gstack.mkdir(parents=True, exist_ok=True)
        (gstack / "SKILL.md").write_text(f"---\nname: {slug}\ndescription: Gstack {slug}\n---\n\nSkill body for {slug}")
        link = root / "skills" / slug
        if not link.exists():
            link.symlink_to(gstack)

    def test_resolve_with_source_prefix(self, tmp_project):
        import app as a
        self._make_gstack_skill(tmp_project, "review")
        text, skill_name = a.resolve_human_text("/gstack:review")
        assert skill_name is not None
        assert "review" in skill_name.lower()
        assert "Skill body for review" in text

    def test_resolve_without_source_prefix_still_works(self, tmp_project):
        import app as a
        self._make_gstack_skill(tmp_project, "review")
        text, skill_name = a.resolve_human_text("/review")
        assert skill_name is not None


class TestThinkModeFlag:
    """Task 3 — think mode must use --effort max, not --extended-thinking."""

    def test_think_mode_uses_effort_max(self):
        """app.py must contain '--effort max' for think mode, not '--extended-thinking'."""
        from pathlib import Path
        source = (Path(__file__).parent / "app.py").read_text()
        assert '"--effort"' in source or '"--effort max"' in source, (
            "app.py has no --effort flag for think mode"
        )

    def test_think_mode_does_not_use_extended_thinking_flag(self):
        """--extended-thinking is not a valid Claude CLI flag and must not be used."""
        from pathlib import Path
        source = (Path(__file__).parent / "app.py").read_text()
        assert "--extended-thinking" not in source, (
            "Found --extended-thinking in app.py — use --effort max instead"
        )


class TestModelTiers:
    """model_tiers-based think mode model switching."""

    def test_resolve_thinking_model_with_tiers(self, tmp_project):
        """model_tiers.thinking exists → return resolved model info."""
        import app as a
        config = {
            "models": {
                "gemini": {"type": "cli", "cmd": ["gemini", "-p"]},
                "gemini-2.5-pro": {
                    "type": "cli",
                    "cmd": ["gemini", "-p"],
                    "extra_flags": ["--model", "gemini-2.5-pro"],
                    "idle_timeout_seconds": 600,
                    "startup_timeout_seconds": 120,
                },
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(config))
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "cmd": ["gemini", "-p"],
            "type": "cli",
            "workspace": tmp_project,
        }
        result = a.resolve_thinking_model(agent)
        assert result is not None
        assert result["cmd"] != agent["cmd"]
        assert "--model" in result["cmd"]

    def test_resolve_thinking_model_no_tiers(self, tmp_project):
        """No model_tiers → return None."""
        import app as a
        agent = {"name": "claude", "cmd": ["claude", "--print"], "workspace": tmp_project}
        result = a.resolve_thinking_model(agent)
        assert result is None

    def test_resolve_thinking_model_missing_key(self, tmp_project):
        """model_tiers.thinking references non-existent model → return None + warning."""
        import app as a
        config = {"models": {"gemini": {"type": "cli", "cmd": ["gemini", "-p"]}}}
        (tmp_project / "config.json").write_text(json.dumps(config))
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "nonexistent"},
            "workspace": tmp_project,
        }
        with patch.object(a.logger, "warning") as mock_warn:
            result = a.resolve_thinking_model(agent)
        assert result is None
        mock_warn.assert_called_once()

    @pytest.mark.asyncio
    async def test_stream_agent_uses_thinking_model_cmd(self, tmp_project):
        """stream_agent with model_tiers.thinking → uses resolved model cmd."""
        import app as a
        config = {
            "models": {
                "gemini": {"type": "cli", "cmd": ["gemini", "-p"]},
                "gemini-2.5-pro": {
                    "type": "cli",
                    "cmd": ["gemini", "-p"],
                    "extra_flags": ["--model", "gemini-2.5-pro"],
                },
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(config))
        captured = {}

        async def mock_create_subprocess(*args, **kwargs):
            captured["args"] = list(args)
            raise FileNotFoundError("mock")

        agent = {
            "name": "gemini",
            "cmd": ["gemini", "-p"],
            "type": "cli",
            "workspace": tmp_project,
            "supports_thinking": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "idle_timeout_seconds": 5,
            "startup_timeout_seconds": 3,
        }
        with patch("asyncio.create_subprocess_exec", mock_create_subprocess):
            try:
                async for _ in a.stream_agent(agent, "prompt", mode="think"):
                    pass
            except Exception:
                pass
        args = captured.get("args", [])
        assert "--model" in args, f"Expected --model in args: {args}"
        assert "gemini-2.5-pro" in args
        assert "--effort" not in args


class TestModelTiersNotification:
    """WS system message when model_tiers switches model."""

    def test_set_mode_think_with_tiers_sends_system_message(self, tmp_project):
        """set_mode think on agent with model_tiers → system message emitted."""
        import app as a
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "supports_thinking": True,
        }
        msg = a.build_mode_switch_notification(agent, "think")
        assert msg is not None
        assert "gemini-2.5-pro" in msg["text"]
        assert msg["type"] == "system"

    def test_set_mode_chat_with_tiers_sends_system_message(self, tmp_project):
        """set_mode chat on agent with model_tiers → system message emitted."""
        import app as a
        agent = {
            "name": "gemini",
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
            "supports_thinking": True,
        }
        msg = a.build_mode_switch_notification(agent, "chat")
        assert msg is not None
        assert msg["type"] == "system"

    def test_set_mode_no_tiers_no_notification(self, tmp_project):
        """set_mode on agent without model_tiers → no notification."""
        import app as a
        agent = {"name": "claude", "supports_thinking": True}
        msg = a.build_mode_switch_notification(agent, "think")
        assert msg is None


class TestTokenTracking:
    """Task 5 — per-agent cumulative token tracking."""

    def test_accumulate_adds_to_new_entry(self):
        """First usage for an agent creates a new entry."""
        from app import accumulate_token_usage
        totals: dict = {}
        accumulate_token_usage(totals, "claude", input_tokens=100, output_tokens=50)
        assert totals["claude"] == {"input": 100, "output": 50}

    def test_accumulate_adds_to_existing_entry(self):
        """Subsequent calls add to existing totals."""
        from app import accumulate_token_usage
        totals = {"claude": {"input": 100, "output": 50}}
        accumulate_token_usage(totals, "claude", input_tokens=200, output_tokens=80)
        assert totals["claude"] == {"input": 300, "output": 130}

    def test_accumulate_multiple_agents(self):
        """Different agents get separate entries."""
        from app import accumulate_token_usage
        totals: dict = {}
        accumulate_token_usage(totals, "claude", input_tokens=100, output_tokens=50)
        accumulate_token_usage(totals, "gemini", input_tokens=200, output_tokens=100)
        assert totals["claude"] == {"input": 100, "output": 50}
        assert totals["gemini"] == {"input": 200, "output": 100}

    def test_format_token_count_under_1k(self):
        """Values under 1000 show as integers."""
        from app import format_token_count
        assert format_token_count(999) == "999"

    def test_format_token_count_1k(self):
        """Values over 1000 show as '1.2k' format."""
        from app import format_token_count
        assert format_token_count(1234) == "1.2k"

    def test_format_token_count_10k(self):
        """Values over 10k show as '12.3k' format."""
        from app import format_token_count
        assert format_token_count(12345) == "12.3k"


class TestSlidingWindowHistory:
    """Task 4 — history sliding window compression."""

    def test_sliding_window_truncates_to_max_rounds(self):
        """When messages exceed max_rounds, only keep the most recent ones."""
        from app import apply_sliding_window
        messages = [{"type": "message", "agent": f"agent{i}", "text": f"msg{i}"} for i in range(50)]
        result = apply_sliding_window(messages, max_rounds=30)
        assert len(result) == 30
        assert result[-1]["text"] == "msg49"
        assert result[0]["text"] == "msg20"

    def test_sliding_window_passthrough_when_within_limit(self):
        """When messages are within the limit, all are returned unchanged."""
        from app import apply_sliding_window
        messages = [{"type": "message", "agent": "human", "text": "only one"}]
        result = apply_sliding_window(messages, max_rounds=30)
        assert result == messages

    def test_sliding_window_empty_list(self):
        """Empty input returns empty output."""
        from app import apply_sliding_window
        assert apply_sliding_window([], max_rounds=30) == []

    def test_sliding_window_exactly_at_limit(self):
        """When exactly at the limit, no truncation happens."""
        from app import apply_sliding_window
        messages = [{"type": "message", "text": f"m{i}"} for i in range(30)]
        result = apply_sliding_window(messages, max_rounds=30)
        assert len(result) == 30


class TestHealth:
    """Phase 1 — GET /health endpoint for offline badge detection."""

    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_returns_status_ok(self, client):
        r = client.get("/health")
        assert r.json() == {"status": "ok"}


# ── Per-session config ────────────────────────────────────────────────────────

class TestSessionConfig:
    """Per-session config override."""

    def test_load_session_config_no_file(self, tmp_project):
        """No session_config.json → returns empty dict."""
        from history_manager import load_session_config
        result = load_session_config("nonexistent_session")
        assert result == {}

    def test_load_session_config_with_overrides(self, tmp_project):
        """session_config.json exists → returns its contents."""
        from history_manager import load_session_config
        sid = "test-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "session_config.json").write_text(json.dumps({
            "max_history_rounds": 50,
            "summary_trigger_threshold": 5,
        }))
        result = load_session_config(sid)
        assert result["max_history_rounds"] == 50
        assert result["summary_trigger_threshold"] == 5


# ── History summarization (Phase 2) ──────────────────────────────────────────

def _write_haiku_config(tmp_project):
    """Helper: write config.json with a 'haiku' model entry for summarization tests."""
    config = {
        "models": {
            "haiku": {"type": "cli", "cmd": ["claude", "--print"], "extra_flags": ["--model", "claude-haiku"]},
        }
    }
    (tmp_project / "config.json").write_text(json.dumps(config))


class TestCompressHistory:
    """History summarization Phase 2."""

    @pytest.mark.asyncio
    async def test_no_overflow_returns_empty_summary(self, tmp_project):
        """All messages fit in window → no summary, no model call."""
        from history_manager import compress_history
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(5)]
        summary, windowed = await compress_history("sid", messages, window_size=10, summary_model="haiku", trigger_threshold=5)
        assert summary == ""
        assert len(windowed) == 5

    @pytest.mark.asyncio
    async def test_overflow_triggers_summarization(self, tmp_project):
        """Overflow exceeds threshold → calls model, writes summary.json."""
        from history_manager import compress_history
        _write_haiku_config(tmp_project)
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]
        mock_response = "This is a summary of the conversation."

        async def mock_call_agent(agent, prompt):
            return mock_response

        with patch("history_manager.call_agent", mock_call_agent):
            summary, windowed = await compress_history(
                "test-summ-session", messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == mock_response
        assert len(windowed) == 30
        sj = tmp_project / "history" / "test-summ-session" / "summary.json"
        assert sj.exists()
        data = json.loads(sj.read_text())
        assert data["covered_message_count"] == 10
        assert data["total_message_count"] == 40

    @pytest.mark.asyncio
    async def test_cached_summary_reused_below_threshold(self, tmp_project):
        """Cached summary exists, new overflow < threshold → reuse."""
        from history_manager import compress_history
        _write_haiku_config(tmp_project)
        sid = "test-cache-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "summary.json").write_text(json.dumps({
            "summary_text": "Old summary.",
            "covered_message_count": 10,
            "total_message_count": 40,
            "updated_at": "2026-03-24T10:00:00",
        }))
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(42)]

        call_count = 0
        async def mock_call_agent(agent, prompt):
            nonlocal call_count
            call_count += 1
            return "Should not be called"

        with patch("history_manager.call_agent", mock_call_agent):
            summary, windowed = await compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == "Old summary."
        assert call_count == 0
        assert len(windowed) == 30
        data = json.loads((sdir / "summary.json").read_text())
        assert data["total_message_count"] == 42  # updated from 40

    @pytest.mark.asyncio
    async def test_empty_summary_model_skips_summarization(self, tmp_project):
        """Empty summary_model → skip summarization, return empty."""
        from history_manager import compress_history
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]
        summary, windowed = await compress_history(
            "sid", messages, window_size=30,
            summary_model="", trigger_threshold=5,
        )
        assert summary == ""
        assert len(windowed) == 30

    @pytest.mark.asyncio
    async def test_cached_summary_refreshed_above_threshold(self, tmp_project):
        """Cached summary exists, new overflow >= threshold → refresh."""
        from history_manager import compress_history
        _write_haiku_config(tmp_project)
        sid = "test-refresh-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "summary.json").write_text(json.dumps({
            "summary_text": "Old summary.",
            "covered_message_count": 10,
            "total_message_count": 40,
            "updated_at": "2026-03-24T10:00:00",
        }))
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(50)]

        async def mock_call_agent(agent, prompt):
            return "Refreshed summary."

        with patch("history_manager.call_agent", mock_call_agent):
            summary, windowed = await compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == "Refreshed summary."
        data = json.loads((sdir / "summary.json").read_text())
        assert data["covered_message_count"] == 20
        assert data["total_message_count"] == 50

    @pytest.mark.asyncio
    async def test_summarization_failure_returns_empty(self, tmp_project):
        """Model call fails → returns empty summary (fallback to truncation)."""
        from history_manager import compress_history
        _write_haiku_config(tmp_project)
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]

        async def mock_call_agent_fail(agent, prompt):
            raise Exception("model crashed")

        with patch("history_manager.call_agent", mock_call_agent_fail):
            summary, windowed = await compress_history(
                "test-fail-session", messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == ""
        assert len(windowed) == 30
        # Verify failure marker written
        sj = tmp_project / "history" / "test-fail-session" / "summary.json"
        if sj.exists():
            data = json.loads(sj.read_text())
            assert data.get("failed") == True

    @pytest.mark.asyncio
    async def test_failure_cooldown_prevents_retry(self, tmp_project):
        """Failed summary with recent timestamp → skip retry."""
        from history_manager import compress_history
        sid = "test-cooldown-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        from datetime import datetime
        (sdir / "summary.json").write_text(json.dumps({
            "failed": True,
            "failed_at": datetime.now().isoformat(),
        }))
        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(40)]

        call_count = 0
        async def mock_call_agent(agent, prompt):
            nonlocal call_count
            call_count += 1
            return "Should not be called"

        with patch("history_manager.call_agent", mock_call_agent):
            summary, windowed = await compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=5,
            )
        assert summary == ""
        assert call_count == 0  # no retry due to cooldown


class TestIntegrationThinkModeSummarization:
    """End-to-end integration tests."""

    @pytest.mark.asyncio
    async def test_compress_history_with_session_config_override(self, tmp_project):
        """Per-session config overrides global threshold."""
        from history_manager import compress_history
        sid = "test-override-session"
        sdir = tmp_project / "history" / sid
        sdir.mkdir(parents=True)
        (sdir / "session_config.json").write_text(json.dumps({
            "summary_trigger_threshold": 3,
        }))
        # Need haiku model in config
        config = {"models": {"haiku": {"type": "cli", "cmd": ["claude", "--print"]}}}
        (tmp_project / "config.json").write_text(json.dumps(config))

        messages = [{"type": "message", "agent": "Claude", "text": f"msg {i}"} for i in range(35)]

        async def mock_call_agent(agent, prompt):
            return "Session override summary."

        with patch("history_manager.call_agent", mock_call_agent):
            summary, windowed = await compress_history(
                sid, messages, window_size=30,
                summary_model="haiku", trigger_threshold=3,
            )
        assert summary == "Session override summary."

    def test_model_tiers_preserved_through_registry(self, tmp_project):
        """model_tiers from agent config.json survives get_agent_registry."""
        import app as a
        agent_dir = tmp_project / "agents" / "gemini"
        agent_dir.mkdir(parents=True)
        (agent_dir / "config.json").write_text(json.dumps({
            "emoji": "\U0001f7e2",
            "color": "#34d399",
            "model": "gemini",
            "enabled": True,
            "supports_thinking": True,
            "model_tiers": {"default": "gemini", "thinking": "gemini-2.5-pro"},
        }))
        config = {"models": {"gemini": {"type": "cli", "cmd": ["gemini", "-p"]}}}
        (tmp_project / "config.json").write_text(json.dumps(config))
        registry = a.get_agent_registry()
        assert "gemini" in registry
        assert registry["gemini"].get("model_tiers") == {"default": "gemini", "thinking": "gemini-2.5-pro"}


# ── Adapter Preset CRUD ──────────────────────────────────────────────────────

class TestAdapterPresets:
    """Tests for /adapter-presets CRUD endpoints."""

    def test_list_presets_v0_format(self, client):
        """GET /adapter-presets returns converted old models as presets."""
        r = client.get("/adapter-presets")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # The fixture has "test-model" in the old models format
        assert any(p["adapter_type"] == "test-model" for p in data)

    def test_list_presets_v1_format(self, tmp_project, client):
        """GET /adapter-presets returns native adapter_presets when present."""
        import app as a
        cfg = {
            "adapter_presets": {
                "claude_local": {
                    "command": "claude",
                    "defaultArgs": ["--print"],
                    "defaultModel": "claude-sonnet-4-6",
                },
                "ollama_api": {
                    "baseUrl": "http://127.0.0.1:11434",
                },
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(cfg))

        r = client.get("/adapter-presets")
        assert r.status_code == 200
        data = r.json()
        types = [p["adapter_type"] for p in data]
        assert "claude_local" in types
        assert "ollama_api" in types
        # Verify fields are present
        claude = next(p for p in data if p["adapter_type"] == "claude_local")
        assert claude["command"] == "claude"
        assert claude["defaultArgs"] == ["--print"]

    def test_create_preset(self, client):
        """POST /adapter-presets creates a new preset."""
        payload = {
            "adapter_type": "new_adapter",
            "command": "new-cmd",
            "defaultArgs": ["--fast"],
            "defaultModel": "new-model-v1",
            "timeoutSec": 300,
        }
        r = client.post("/adapter-presets", json=payload)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert r.json()["adapter_type"] == "new_adapter"

        # Verify it appears in the list
        r2 = client.get("/adapter-presets")
        types = [p["adapter_type"] for p in r2.json()]
        assert "new_adapter" in types
        new = next(p for p in r2.json() if p["adapter_type"] == "new_adapter")
        assert new["command"] == "new-cmd"
        assert new["timeoutSec"] == 300

    def test_create_preset_missing_type(self, client):
        """POST /adapter-presets without adapter_type returns 400."""
        r = client.post("/adapter-presets", json={"command": "x"})
        assert r.status_code == 400

    def test_create_preset_duplicate(self, client):
        """POST /adapter-presets with existing adapter_type returns 409."""
        payload = {"adapter_type": "dup_adapter", "command": "x"}
        r1 = client.post("/adapter-presets", json=payload)
        assert r1.status_code == 200
        r2 = client.post("/adapter-presets", json=payload)
        assert r2.status_code == 409

    def test_update_preset(self, client):
        """PUT /adapter-presets/{type} updates an existing preset."""
        # Create first
        client.post("/adapter-presets", json={
            "adapter_type": "upd_adapter",
            "command": "old-cmd",
            "timeoutSec": 60,
        })
        # Update
        r = client.put("/adapter-presets/upd_adapter", json={
            "command": "new-cmd",
            "timeoutSec": 120,
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Verify
        presets = client.get("/adapter-presets").json()
        upd = next(p for p in presets if p["adapter_type"] == "upd_adapter")
        assert upd["command"] == "new-cmd"
        assert upd["timeoutSec"] == 120

    def test_update_preset_not_found(self, client):
        """PUT /adapter-presets/{type} for nonexistent type returns 404."""
        r = client.put("/adapter-presets/ghost_adapter", json={"command": "x"})
        assert r.status_code == 404

    def test_delete_preset(self, client):
        """DELETE /adapter-presets/{type} removes the preset."""
        client.post("/adapter-presets", json={
            "adapter_type": "del_adapter",
            "command": "x",
        })
        r = client.delete("/adapter-presets/del_adapter")
        assert r.status_code == 200
        assert r.json()["ok"] is True

        # Verify gone
        presets = client.get("/adapter-presets").json()
        assert not any(p["adapter_type"] == "del_adapter" for p in presets)

    def test_delete_preset_idempotent(self, client):
        """DELETE /adapter-presets/{type} for nonexistent type still returns ok."""
        r = client.delete("/adapter-presets/nonexistent")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_models_endpoint_returns_preset_data(self, tmp_project, client):
        """GET /models returns the same data as adapter_presets (backward compat)."""
        import app as a
        cfg = {
            "adapter_presets": {
                "claude_local": {
                    "command": "claude",
                    "defaultArgs": ["--print"],
                }
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(cfg))

        r = client.get("/models")
        assert r.status_code == 200
        data = r.json()
        assert any(m["id"] == "claude_local" for m in data)
        cl = next(m for m in data if m["id"] == "claude_local")
        assert cl["command"] == "claude"

    def test_create_preset_in_v1_config(self, tmp_project, client):
        """POST /adapter-presets writes to adapter_presets key (not models) in v1 config."""
        import app as a
        cfg = {
            "adapter_presets": {
                "claude_local": {"command": "claude"},
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(cfg))

        r = client.post("/adapter-presets", json={
            "adapter_type": "gemini_local",
            "command": "gemini",
            "defaultArgs": ["-p"],
        })
        assert r.status_code == 200

        # Verify it was written to adapter_presets, not models
        saved = json.loads((tmp_project / "config.json").read_text())
        assert "gemini_local" in saved["adapter_presets"]
        assert "models" not in saved

    def test_create_preset_in_v0_config(self, client, tmp_project):
        """POST /adapter-presets writes to models key in v0 config (backward compat)."""
        # The default fixture uses "models" key
        r = client.post("/adapter-presets", json={
            "adapter_type": "new_cli",
            "command": "new-cli-cmd",
        })
        assert r.status_code == 200

        saved = json.loads((tmp_project / "config.json").read_text())
        assert "new_cli" in saved["models"]


class TestOllamaResolveFromPresets:
    """Tests that Ollama endpoints resolve base_url from adapter_presets."""

    def _mock_httpx_get(self, json_data):
        mock_response = MagicMock()
        mock_response.json.return_value = json_data

        mock_client = MagicMock()
        mock_client.get = AsyncMock(return_value=mock_response)

        mock_cls = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        return mock_cls, mock_client

    def test_ollama_models_uses_v1_preset_url(self, tmp_project, client):
        """GET /providers/ollama/models uses baseUrl from adapter_presets.ollama_api."""
        cfg = {
            "adapter_presets": {
                "ollama_api": {"baseUrl": "http://custom-ollama:11434"},
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(cfg))

        mock_cls, mock_client = self._mock_httpx_get(
            {"models": [{"name": "llama3"}]}
        )
        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/models")

        assert r.status_code == 200
        call_url = mock_client.get.call_args[0][0]
        assert "custom-ollama:11434" in call_url

    def test_ollama_models_falls_back_to_v0(self, tmp_project, client):
        """GET /providers/ollama/models falls back to models.ollama.baseUrl."""
        cfg = {
            "models": {
                "ollama": {
                    "type": "api",
                    "baseUrl": "http://v0-ollama:11434",
                }
            }
        }
        (tmp_project / "config.json").write_text(json.dumps(cfg))

        mock_cls, mock_client = self._mock_httpx_get(
            {"models": [{"name": "phi3"}]}
        )
        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/models")

        assert r.status_code == 200
        call_url = mock_client.get.call_args[0][0]
        assert "v0-ollama:11434" in call_url

    def test_ollama_models_default_fallback(self, tmp_project, client):
        """GET /providers/ollama/models uses default URL when no config."""
        cfg = {"models": {}}
        (tmp_project / "config.json").write_text(json.dumps(cfg))

        mock_cls, mock_client = self._mock_httpx_get(
            {"models": [{"name": "gemma"}]}
        )
        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/models")

        assert r.status_code == 200
        call_url = mock_client.get.call_args[0][0]
        assert "127.0.0.1:11434" in call_url


# ── Kanban in build_prompt ─────────────────────────────────────────────────

class TestKanbanPromptInjection:
    """Tests for kanban state injection into agent prompts."""

    def _make_agent(self, tmp_project):
        agent_dir = tmp_project / "agents" / "test-agent"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are a test agent.")
        return {"name": "test-agent", "workspace": agent_dir}

    def test_kanban_state_injected(self, tmp_project):
        """Kanban items appear in the prompt under Discussion Board."""
        import app as a
        agent = self._make_agent(tmp_project)
        kanban = [
            {"id": 1, "text": "Design API", "status": "done"},
            {"id": 2, "text": "Implement feature", "status": "wip"},
            {"id": 3, "text": "Write tests", "status": "todo"},
        ]
        prompt = a.build_prompt(agent, "history", kanban_state=kanban)
        assert "## Discussion Board" in prompt
        assert "**In Progress:** Implement feature" in prompt
        assert "**TODO:** Write tests" in prompt
        assert "**Done:** Design API" in prompt

    def test_kanban_empty_not_injected(self, tmp_project):
        """Empty kanban list does not inject Discussion Board."""
        import app as a
        agent = self._make_agent(tmp_project)
        prompt = a.build_prompt(agent, "history", kanban_state=[])
        assert "Discussion Board" not in prompt

    def test_kanban_none_not_injected(self, tmp_project):
        """None kanban does not inject Discussion Board."""
        import app as a
        agent = self._make_agent(tmp_project)
        prompt = a.build_prompt(agent, "history", kanban_state=None)
        assert "Discussion Board" not in prompt

    def test_kanban_multiple_wip_items(self, tmp_project):
        """Multiple in-progress items are comma-separated."""
        import app as a
        agent = self._make_agent(tmp_project)
        kanban = [
            {"id": 1, "text": "Task A", "status": "wip"},
            {"id": 2, "text": "Task B", "status": "wip"},
        ]
        prompt = a.build_prompt(agent, "history", kanban_state=kanban)
        assert "**In Progress:** Task A, Task B" in prompt

    def test_kanban_only_done_still_injected(self, tmp_project):
        """Even if all items are done, board is still shown."""
        import app as a
        agent = self._make_agent(tmp_project)
        kanban = [{"id": 1, "text": "Completed task", "status": "done"}]
        prompt = a.build_prompt(agent, "history", kanban_state=kanban)
        assert "## Discussion Board" in prompt
        assert "**Done:** Completed task" in prompt

    def test_kanban_with_scenario_both_injected(self, tmp_project):
        """Kanban and scenario context can coexist in the prompt."""
        import app as a
        agent = self._make_agent(tmp_project)
        kanban = [{"id": 1, "text": "Review code", "status": "wip"}]
        prompt = a.build_prompt(
            agent, "history",
            scenario_system_prompt="This is a code review session.",
            kanban_state=kanban,
        )
        assert "## Session Context" in prompt
        assert "code review session" in prompt
        assert "## Discussion Board" in prompt
        assert "Review code" in prompt

    def test_kanban_focus_instruction_present(self, tmp_project):
        """Prompt includes instruction to focus on In Progress items."""
        import app as a
        agent = self._make_agent(tmp_project)
        kanban = [{"id": 1, "text": "Current task", "status": "wip"}]
        prompt = a.build_prompt(agent, "history", kanban_state=kanban)
        assert "Focus on In Progress items" in prompt


# ── Scenario CRUD ──────────────────────────────────────────────────────────

class TestScenarioCRUD:
    """Full CRUD tests for scenario endpoints."""

    def test_create_scenario(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        with TestClient(a.app) as client:
            r = client.post("/scenarios", json={
                "id": "test-scenario",
                "name": "Test Scenario",
                "description": "A test",
                "system_prompt": "Be helpful.",
                "topic_hint": "Tell me...",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "test-scenario"
        assert (scenarios_dir / "test-scenario.json").exists()

    def test_create_scenario_invalid_id(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        with TestClient(a.app) as client:
            r = client.post("/scenarios", json={
                "id": "../escape",
                "name": "Bad",
            })
        assert r.status_code == 400

    def test_get_single_scenario(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        (scenarios_dir / "my-sc.json").write_text(json.dumps({
            "id": "my-sc", "name": "My Scenario",
            "description": "desc", "system_prompt": "prompt",
        }))
        with TestClient(a.app) as client:
            r = client.get("/scenarios/my-sc")
        assert r.status_code == 200
        assert r.json()["name"] == "My Scenario"

    def test_get_nonexistent_scenario_404(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        with TestClient(a.app) as client:
            r = client.get("/scenarios/no-exist")
        assert r.status_code == 404

    def test_update_scenario(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        (scenarios_dir / "upd.json").write_text(json.dumps({
            "id": "upd", "name": "Original",
            "description": "old", "system_prompt": "old prompt",
        }))
        with TestClient(a.app) as client:
            r = client.put("/scenarios/upd", json={
                "name": "Updated",
                "description": "new desc",
                "system_prompt": "new prompt",
            })
        assert r.status_code == 200
        saved = json.loads((scenarios_dir / "upd.json").read_text())
        assert saved["name"] == "Updated"
        assert saved["system_prompt"] == "new prompt"

    def test_update_nonexistent_scenario_404(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        with TestClient(a.app) as client:
            r = client.put("/scenarios/ghost", json={"name": "X"})
        assert r.status_code == 404

    def test_delete_scenario(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        (scenarios_dir / "del-me.json").write_text(json.dumps({
            "id": "del-me", "name": "Delete Me",
        }))
        with TestClient(a.app) as client:
            r = client.delete("/scenarios/del-me")
        assert r.status_code == 200
        assert not (scenarios_dir / "del-me.json").exists()

    def test_delete_nonexistent_scenario_404(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        with TestClient(a.app) as client:
            r = client.delete("/scenarios/nope")
        assert r.status_code == 404

    def test_list_scenarios_returns_all(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        for i in range(3):
            (scenarios_dir / f"s{i}.json").write_text(json.dumps({
                "id": f"s{i}", "name": f"Scenario {i}",
            }))
        with TestClient(a.app) as client:
            r = client.get("/scenarios")
        assert r.status_code == 200
        assert len(r.json()) == 3

    def test_create_duplicate_scenario_fails(self, tmp_project):
        import app as a
        scenarios_dir = tmp_project / "scenarios"
        scenarios_dir.mkdir(exist_ok=True)
        (scenarios_dir / "dup.json").write_text(json.dumps({"id": "dup", "name": "Dup"}))
        with TestClient(a.app) as client:
            r = client.post("/scenarios", json={"id": "dup", "name": "Dup 2"})
        # Should fail because file already exists
        assert r.status_code in (400, 409)


# ── Build prompt integration ───────────────────────────────────────────────

class TestBuildPromptIntegration:
    """Integration tests for build_prompt with various combinations."""

    def _make_agent(self, tmp_project, name="agent1"):
        agent_dir = tmp_project / "agents" / name
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text(f"You are {name}.")
        return {"name": name, "workspace": agent_dir}

    def test_scenario_overrides_workspace(self, tmp_project):
        """Scenario context takes priority over workspace guide."""
        import app as a
        ws_dir = tmp_project / "workspaces" / "ws1"
        ws_dir.mkdir(parents=True)
        (ws_dir / "config.json").write_text(json.dumps({
            "id": "ws1", "name": "WS", "system_prompt": "Workspace guide here"
        }))
        agent = self._make_agent(tmp_project)
        prompt = a.build_prompt(
            agent, "history",
            workspace_id="ws1",
            scenario_system_prompt="Scenario context here",
        )
        assert "Scenario context here" in prompt
        assert "Workspace guide here" not in prompt

    def test_all_agents_listed_in_prompt(self, tmp_project):
        """When all_agents is provided, other agents are mentioned."""
        import app as a
        agent = self._make_agent(tmp_project, "claude")
        all_agents = [
            {"name": "claude", "emoji": "🤖"},
            {"name": "gemini", "emoji": "💚"},
        ]
        prompt = a.build_prompt(agent, "history", all_agents=all_agents)
        assert "gemini" in prompt

    def test_kanban_plus_scenario_plus_workspace(self, tmp_project):
        """Scenario wins over workspace; kanban is always added."""
        import app as a
        ws_dir = tmp_project / "workspaces" / "ws2"
        ws_dir.mkdir(parents=True)
        (ws_dir / "config.json").write_text(json.dumps({
            "id": "ws2", "name": "WS2", "system_prompt": "WS guide"
        }))
        agent = self._make_agent(tmp_project)
        kanban = [{"id": 1, "text": "Fix bug", "status": "wip"}]
        prompt = a.build_prompt(
            agent, "history",
            workspace_id="ws2",
            scenario_system_prompt="Code review mode",
            kanban_state=kanban,
        )
        assert "Code review mode" in prompt
        assert "WS guide" not in prompt
        assert "Fix bug" in prompt
        assert "Discussion Board" in prompt


# ── Memory: Heuristic Extraction ──────────────────────────────────────────

class TestMemoryHeuristic:
    """Test regex-based fact extraction."""

    def test_extract_decision(self):
        from core.memory import heuristic_extract_facts
        msgs = [{"type": "message", "agent": "Claude", "text": "We decided to use PostgreSQL for the database."}]
        facts = heuristic_extract_facts(msgs)
        assert len(facts) >= 1
        assert facts[0]["type"] == "DECISION"
        assert facts[0]["agent"] == "Claude"
        assert facts[0]["importance"] == 7

    def test_extract_preference(self):
        from core.memory import heuristic_extract_facts
        msgs = [{"type": "message", "agent": "Human", "text": "user prefers dark mode for the UI display settings"}]
        facts = heuristic_extract_facts(msgs)
        assert len(facts) >= 1
        assert facts[0]["type"] == "PREFERENCE"

    def test_extract_finding(self):
        from core.memory import heuristic_extract_facts
        msgs = [{"type": "message", "agent": "Gemini", "text": "root cause is a race condition in the event loop"}]
        facts = heuristic_extract_facts(msgs)
        assert len(facts) >= 1
        assert facts[0]["type"] == "FINDING"

    def test_extract_action(self):
        from core.memory import heuristic_extract_facts
        msgs = [{"type": "message", "agent": "Claude", "text": "todo: refactor the authentication module before release"}]
        facts = heuristic_extract_facts(msgs)
        assert len(facts) >= 1
        assert facts[0]["type"] == "ACTION"

    def test_skip_non_message(self):
        from core.memory import heuristic_extract_facts
        msgs = [{"type": "system", "text": "We decided to use Python."}]
        facts = heuristic_extract_facts(msgs)
        assert len(facts) == 0

    def test_dedup(self):
        from core.memory import heuristic_extract_facts
        msgs = [
            {"type": "message", "agent": "Claude", "text": "We decided to use PostgreSQL for database storage."},
            {"type": "message", "agent": "Gemini", "text": "We decided to use PostgreSQL for database storage."},
        ]
        facts = heuristic_extract_facts(msgs)
        assert len(facts) == 1

    def test_empty_messages(self):
        from core.memory import heuristic_extract_facts
        assert heuristic_extract_facts([]) == []

    def test_flush_to_file(self, tmp_path):
        from core.memory import flush_facts_to_memory
        ws = str(tmp_path / "agent1")
        facts = [{"type": "DECISION", "text": "Use Redis for caching", "importance": 7, "agent": "Claude"}]
        flush_facts_to_memory(facts, {"agent1": ws})
        import glob
        md_files = list((tmp_path / "agent1" / "memory").glob("*.md"))
        assert len(md_files) == 1
        content = md_files[0].read_text()
        assert "[DECISION]" in content
        assert "Redis" in content

    def test_flush_skips_low_importance(self, tmp_path):
        from core.memory import flush_facts_to_memory
        ws = str(tmp_path / "agent1")
        facts = [{"type": "ACTION", "text": "Minor cleanup needed", "importance": 2, "agent": "Claude"}]
        flush_facts_to_memory(facts, {"agent1": ws})
        mem_dir = tmp_path / "agent1" / "memory"
        if mem_dir.exists():
            md_files = list(mem_dir.glob("*.md"))
            for f in md_files:
                assert "[ACTION]" not in f.read_text()

    def test_flush_failure_is_silent(self):
        from core.memory import flush_facts_to_memory
        facts = [{"type": "DECISION", "text": "Use Redis for caching", "importance": 7, "agent": "Claude"}]
        # Writing to an invalid path should not raise
        flush_facts_to_memory(facts, {"agent1": "/nonexistent/path/that/cannot/exist"})

    def test_flush_empty_facts(self, tmp_path):
        from core.memory import flush_facts_to_memory
        ws = str(tmp_path / "agent1")
        flush_facts_to_memory([], {"agent1": ws})
        mem_dir = tmp_path / "agent1" / "memory"
        assert not mem_dir.exists()


# ── Memory: Injection (load_recent_facts / load_entities) ──────────────────

class TestMemoryInjection:
    """Test memory loading and injection into prompts."""

    def test_load_recent_facts(self, tmp_path):
        from core.memory import load_recent_facts
        from datetime import datetime
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        today = datetime.now().strftime("%Y-%m-%d")
        (mem_dir / f"{today}.md").write_text(
            "## 2026-03-27 10:00 — Session Extract\n"
            "- [DECISION] Use PostgreSQL\n"
            "- [FINDING] Root cause is race condition\n"
        )
        result = load_recent_facts(mem_dir, max_chars=500)
        assert "[DECISION]" in result
        assert "[FINDING]" in result

    def test_load_recent_facts_importance_sort(self, tmp_path):
        from core.memory import load_recent_facts
        from datetime import datetime
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        today = datetime.now().strftime("%Y-%m-%d")
        (mem_dir / f"{today}.md").write_text(
            "- [ACTION] Do something minor\n"
            "- [DECISION] Critical architecture choice\n"
        )
        result = load_recent_facts(mem_dir, max_chars=500)
        lines = result.strip().split("\n")
        # DECISION (importance=7) should come before ACTION (importance=5)
        assert "[DECISION]" in lines[0]

    def test_load_recent_facts_dedup(self, tmp_path):
        from core.memory import load_recent_facts
        from datetime import datetime
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        today = datetime.now().strftime("%Y-%m-%d")
        (mem_dir / f"{today}.md").write_text(
            "- [DECISION] Use PostgreSQL\n"
            "- [DECISION] Use PostgreSQL\n"
        )
        result = load_recent_facts(mem_dir, max_chars=500)
        assert result.count("[DECISION]") == 1

    def test_load_recent_facts_budget(self, tmp_path):
        from core.memory import load_recent_facts
        from datetime import datetime
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        today = datetime.now().strftime("%Y-%m-%d")
        lines = "\n".join(f"- [DECISION] Fact number {i} with some extra text padding" for i in range(50))
        (mem_dir / f"{today}.md").write_text(lines)
        result = load_recent_facts(mem_dir, max_chars=100)
        assert len(result) <= 150  # Some tolerance for single line overflow

    def test_load_recent_facts_nonexistent(self):
        from core.memory import load_recent_facts
        result = load_recent_facts(Path("/nonexistent/path"))
        assert result == ""

    def test_load_entities(self, tmp_path):
        from core.memory import load_entities
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        (mem_dir / "entities.json").write_text(json.dumps({
            "PostgreSQL": "Primary database for the project",
            "Redis": "Caching layer",
        }))
        result = load_entities(mem_dir, max_chars=300)
        assert "PostgreSQL" in result
        assert "Redis" in result

    def test_load_entities_budget(self, tmp_path):
        from core.memory import load_entities
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        data = {f"entity_{i}": f"Description for entity {i} with some padding text" for i in range(50)}
        (mem_dir / "entities.json").write_text(json.dumps(data))
        result = load_entities(mem_dir, max_chars=100)
        assert len(result) <= 200  # Some tolerance

    def test_load_entities_nonexistent(self, tmp_path):
        from core.memory import load_entities
        result = load_entities(tmp_path / "nope")
        assert result == ""

    def test_load_entities_skips_internal_keys(self, tmp_path):
        from core.memory import load_entities
        mem_dir = tmp_path / "memory"
        mem_dir.mkdir()
        (mem_dir / "entities.json").write_text(json.dumps({
            "_internal": "should be skipped",
            "Visible": "should appear",
        }))
        result = load_entities(mem_dir, max_chars=300)
        assert "_internal" not in result
        assert "Visible" in result

    def test_build_prompt_includes_recent_memory(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "mem_agent"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are mem_agent.")
        mem_dir = agent_dir / "memory"
        mem_dir.mkdir()
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        (mem_dir / f"{today}.md").write_text("- [DECISION] Use FastAPI\n")
        agent = {"name": "mem_agent", "workspace": agent_dir}
        prompt = a.build_prompt(agent, "history")
        assert "Recent Memory" in prompt
        assert "[DECISION]" in prompt

    def test_build_prompt_without_memory_dir(self, tmp_project):
        import app as a
        agent_dir = tmp_project / "agents" / "no_mem"
        agent_dir.mkdir(parents=True)
        (agent_dir / "AGENT.md").write_text("You are no_mem.")
        agent = {"name": "no_mem", "workspace": agent_dir}
        # Should not crash even without memory dir
        prompt = a.build_prompt(agent, "history")
        assert "no_mem" in prompt


# ── Memory: Distill Session ───────────────────────────────────────────────

class TestDistillSession:
    """Test post-session LLM distillation pipeline."""

    @pytest.mark.asyncio
    async def test_triage_heuristic_fallback(self):
        """When LLM fails, triage should use heuristic fallback."""
        from core.memory import _triage_session
        msgs = [
            {"type": "message", "agent": "Claude", "text": "We decided to use Redis. The bug fix is complete."},
            {"type": "message", "agent": "Human", "text": "Great, the todo is done."},
        ] * 5
        # Pass invalid model config so LLM call fails
        score = await _triage_session(msgs, {"name": "_test", "cmd": ["false"]})
        assert isinstance(score, int)
        assert 1 <= score <= 10

    @pytest.mark.asyncio
    async def test_triage_with_mock_llm(self):
        from core.memory import _triage_session
        msgs = [{"type": "message", "agent": "Claude", "text": "Test conversation"}]
        mock_model = {"name": "_test"}
        with patch("app.call_agent", new_callable=AsyncMock, return_value="7"):
            score = await _triage_session(msgs, mock_model)
        assert score == 7

    @pytest.mark.asyncio
    async def test_triage_clamps_score(self):
        from core.memory import _triage_session
        msgs = [{"type": "message", "agent": "Claude", "text": "Test"}]
        mock_model = {"name": "_test"}
        with patch("app.call_agent", new_callable=AsyncMock, return_value="15"):
            score = await _triage_session(msgs, mock_model)
        assert score == 10

    @pytest.mark.asyncio
    async def test_llm_extract_facts_valid_json(self):
        from core.memory import _llm_extract_facts
        msgs = [{"type": "message", "agent": "Claude", "text": "We decided to use Redis."}]
        mock_response = json.dumps([
            {"type": "DECISION", "text": "Use Redis for caching", "importance": 7, "entities": ["Redis"]},
            {"type": "ACTION", "text": "Minor cleanup", "importance": 2, "entities": []},
        ])
        with patch("app.call_agent", new_callable=AsyncMock, return_value=mock_response):
            facts = await _llm_extract_facts(msgs, {"name": "_test"})
        # importance < 4 should be filtered
        assert len(facts) == 1
        assert facts[0]["type"] == "DECISION"

    @pytest.mark.asyncio
    async def test_llm_extract_facts_garbage_output(self):
        from core.memory import _llm_extract_facts
        msgs = [{"type": "message", "agent": "Claude", "text": "Test"}]
        with patch("app.call_agent", new_callable=AsyncMock, return_value="This is not JSON at all!"):
            facts = await _llm_extract_facts(msgs, {"name": "_test"})
        assert facts == []

    @pytest.mark.asyncio
    async def test_llm_extract_facts_llm_failure(self):
        from core.memory import _llm_extract_facts
        msgs = [{"type": "message", "agent": "Claude", "text": "Test"}]
        with patch("app.call_agent", new_callable=AsyncMock, side_effect=Exception("LLM down")):
            facts = await _llm_extract_facts(msgs, {"name": "_test"})
        assert facts == []

    @pytest.mark.asyncio
    async def test_llm_extract_entities_valid(self):
        from core.memory import _llm_extract_entities
        msgs = [{"type": "message", "agent": "Claude", "text": "Redis is our caching layer."}]
        mock_response = json.dumps({"Redis": "Caching layer", "PostgreSQL": "Primary DB"})
        with patch("app.call_agent", new_callable=AsyncMock, return_value=mock_response):
            entities = await _llm_extract_entities(msgs, {"name": "_test"})
        assert "Redis" in entities
        assert "PostgreSQL" in entities

    @pytest.mark.asyncio
    async def test_llm_extract_entities_garbage(self):
        from core.memory import _llm_extract_entities
        msgs = [{"type": "message", "agent": "Claude", "text": "Test"}]
        with patch("app.call_agent", new_callable=AsyncMock, return_value="Not valid JSON"):
            entities = await _llm_extract_entities(msgs, {"name": "_test"})
        assert entities == {}

    def test_flush_entities_merge(self, tmp_path):
        from core.memory import flush_entities
        ws = tmp_path / "agent1"
        # First flush
        flush_entities(str(ws), {"Redis": "Cache", "PG": "Database"})
        path = ws / "memory" / "entities.json"
        assert path.exists()
        data = json.loads(path.read_text())
        assert data["Redis"] == "Cache"
        # Second flush — overwrite Redis, keep PG
        flush_entities(str(ws), {"Redis": "Updated cache layer"})
        data2 = json.loads(path.read_text())
        assert data2["Redis"] == "Updated cache layer"
        assert data2["PG"] == "Database"

    def test_flush_entities_empty(self, tmp_path):
        from core.memory import flush_entities
        ws = str(tmp_path / "agent1")
        flush_entities(ws, {})
        assert not (tmp_path / "agent1" / "memory" / "entities.json").exists()

    @pytest.mark.asyncio
    async def test_distill_session_full_pipeline(self, tmp_path):
        from core.memory import distill_session
        msgs = [
            {"type": "message", "agent": "Claude", "text": "We decided to use Redis."},
        ] * 10
        ws = str(tmp_path / "agent1")
        agent_ws = {"agent1": ws}
        triage_response = "7"
        facts_response = json.dumps([
            {"type": "DECISION", "text": "Use Redis", "importance": 8, "entities": ["Redis"]},
        ])
        entities_response = json.dumps({"Redis": "Caching layer"})

        call_count = 0
        async def mock_call_agent(agent, prompt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return triage_response
            elif call_count == 2:
                return facts_response
            else:
                return entities_response

        with patch("app.call_agent", side_effect=mock_call_agent):
            await distill_session("test-sess", msgs, agent_ws, {"name": "_test"})

        # Verify facts were written
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        fact_file = tmp_path / "agent1" / "memory" / f"{today}.md"
        assert fact_file.exists()
        assert "[DECISION]" in fact_file.read_text()

        # Verify entities were written
        entity_file = tmp_path / "agent1" / "memory" / "entities.json"
        assert entity_file.exists()
        assert "Redis" in entity_file.read_text()

    @pytest.mark.asyncio
    async def test_distill_session_low_triage_skips(self):
        from core.memory import distill_session
        msgs = [{"type": "message", "agent": "Claude", "text": "Hello"}]
        with patch("app.call_agent", new_callable=AsyncMock, return_value="2"):
            await distill_session("test-sess", msgs, {}, {"name": "_test"})
        # No error = success (low score means skip)

    @pytest.mark.asyncio
    async def test_safe_distill_dedup(self):
        from core.memory import safe_distill, _distilling_sessions
        # Manually add session to set
        _distilling_sessions.add("dup-sess")
        try:
            await safe_distill("dup-sess", [], {}, {"name": "_test"})
            # Should return immediately without error
        finally:
            _distilling_sessions.discard("dup-sess")

    @pytest.mark.asyncio
    async def test_safe_distill_timeout(self):
        from core.memory import safe_distill

        async def slow_call(agent, prompt):
            await asyncio.sleep(100)
            return "5"

        msgs = [{"type": "message", "agent": "Claude", "text": "Test"}] * 10
        with patch("app.call_agent", side_effect=slow_call):
            # Should not hang — timeout after 60s (we'll use a shorter real timeout)
            with patch("core.memory.distill_session", new_callable=AsyncMock) as mock_distill:
                mock_distill.side_effect = asyncio.TimeoutError()
                # Force the wait_for timeout by making distill_session itself timeout-like
                await safe_distill("timeout-sess", msgs, {}, {"name": "_test"})

    @pytest.mark.asyncio
    async def test_safe_distill_semaphore(self):
        from core.memory import safe_distill, _distill_semaphore
        # Just verify it runs without error under semaphore
        with patch("core.memory.distill_session", new_callable=AsyncMock):
            await safe_distill("sem-sess", [], {}, {"name": "_test"})


# ── Memory: append_memory raw path ────────────────────────────────────────

class TestAppendMemoryRawPath:
    """Test that append_memory writes to memory/raw/ subdirectory."""

    def test_append_memory_writes_to_raw(self, tmp_path):
        from core.runner import append_memory
        from datetime import datetime
        ws = tmp_path / "agent1"
        ws.mkdir()
        (ws / "memory").mkdir()
        agent = {"name": "Claude", "workspace": ws}
        append_memory(agent, "Test topic", "Test response")
        today = datetime.now().strftime("%Y-%m-%d")
        raw_file = ws / "memory" / "raw" / f"{today}.md"
        assert raw_file.exists()
        content = raw_file.read_text()
        assert "Test topic" in content
        assert "Test response" in content

    def test_append_memory_not_in_root(self, tmp_path):
        from core.runner import append_memory
        from datetime import datetime
        ws = tmp_path / "agent2"
        ws.mkdir()
        (ws / "memory").mkdir()
        agent = {"name": "Claude", "workspace": ws}
        append_memory(agent, "Topic", "Response")
        today = datetime.now().strftime("%Y-%m-%d")
        # Should NOT be in memory/ root
        root_file = ws / "memory" / f"{today}.md"
        assert not root_file.exists()


# ── Memory: session persistence + MEMORY.md consolidation ────────────────

class TestSessionMemoryPersistence:
    """Test facts/entities saved to history/{session_id}/."""

    def test_persist_session_memory(self, tmp_project):
        from core.memory import _persist_session_memory
        facts = [{"type": "DECISION", "text": "Use Python", "importance": 7}]
        entities = {"Jason": "Project lead"}
        _persist_session_memory("test-session-1", facts, entities)
        import app as a
        sess_dir = a.HISTORY_DIR / "test-session-1"
        assert (sess_dir / "facts.json").exists()
        assert (sess_dir / "entities.json").exists()
        saved_facts = json.loads((sess_dir / "facts.json").read_text())
        assert saved_facts[0]["text"] == "Use Python"
        saved_ents = json.loads((sess_dir / "entities.json").read_text())
        assert saved_ents["Jason"] == "Project lead"

    def test_persist_empty_facts(self, tmp_project):
        from core.memory import _persist_session_memory
        _persist_session_memory("test-session-2", [], {})
        import app as a
        sess_dir = a.HISTORY_DIR / "test-session-2"
        assert not (sess_dir / "facts.json").exists()
        assert not (sess_dir / "entities.json").exists()

    def test_persist_failure_is_silent(self, tmp_project, monkeypatch):
        from core.memory import _persist_session_memory
        import app as a
        monkeypatch.setattr(a, "HISTORY_DIR", Path("/nonexistent/path"))
        # Should not raise
        _persist_session_memory("bad-session", [{"type": "X", "text": "Y"}], {"A": "B"})


class TestMemoryConsolidation:
    """Test MEMORY.md index update and consolidated file creation."""

    def test_update_memory_index_new_section(self, tmp_path):
        from core.memory import _update_memory_index
        md = tmp_path / "MEMORY.md"
        md.write_text("# MEMORY.md\n\n_Sessions will be recorded here._\n")
        _update_memory_index(md, "2026-03-29", "consolidated-2026-03-29.md")
        content = md.read_text()
        assert "## Session Memory" in content
        assert "consolidated-2026-03-29.md" in content

    def test_update_memory_index_existing_section(self, tmp_path):
        from core.memory import _update_memory_index
        md = tmp_path / "MEMORY.md"
        md.write_text("# MEMORY.md\n\n## Session Memory\n- [old](old) — old entry\n")
        _update_memory_index(md, "2026-03-29", "consolidated-2026-03-29.md")
        content = md.read_text()
        assert "old entry" in content  # preserved
        assert "consolidated-2026-03-29.md" in content  # added

    def test_update_memory_index_no_duplicate(self, tmp_path):
        from core.memory import _update_memory_index
        md = tmp_path / "MEMORY.md"
        md.write_text("# MEMORY.md\n\n## Session Memory\n- [memory/consolidated-2026-03-29.md](memory/consolidated-2026-03-29.md) — existing\n")
        _update_memory_index(md, "2026-03-29", "consolidated-2026-03-29.md")
        content = md.read_text()
        assert content.count("consolidated-2026-03-29.md") == 2  # link + path, not doubled

    @pytest.mark.asyncio
    async def test_consolidate_agent_memory(self, tmp_path):
        from core.memory import _consolidate_agent_memory, flush_facts_to_memory
        from datetime import datetime
        ws = tmp_path / "agent1"
        ws.mkdir()
        (ws / "memory").mkdir()
        (ws / "MEMORY.md").write_text("# MEMORY.md\n\n_Sessions._\n")
        # Write some facts first
        flush_facts_to_memory(
            [{"type": "DECISION", "text": "Use FastAPI", "importance": 7}],
            {"agent1": str(ws)},
        )
        mock_result = "## Decisions\n- Use FastAPI for the backend\n\n## Lessons Learned\n- Do not hardcode templates"
        with patch("app.call_agent", new_callable=AsyncMock, return_value=mock_result):
            await _consolidate_agent_memory(str(ws), {"name": "_test"})
        today = datetime.now().strftime("%Y-%m-%d")
        consolidated = ws / "memory" / f"consolidated-{today}.md"
        assert consolidated.exists()
        content = consolidated.read_text()
        assert "FastAPI" in content
        assert "Lessons Learned" in content
        # MEMORY.md should have the index entry
        md_content = (ws / "MEMORY.md").read_text()
        assert "Session Memory" in md_content
        assert f"consolidated-{today}.md" in md_content

    @pytest.mark.asyncio
    async def test_consolidate_skips_when_no_facts(self, tmp_path):
        from core.memory import _consolidate_agent_memory
        ws = tmp_path / "agent2"
        ws.mkdir()
        (ws / "memory").mkdir()
        (ws / "MEMORY.md").write_text("# MEMORY.md\n")
        with patch("app.call_agent", new_callable=AsyncMock) as mock_call:
            await _consolidate_agent_memory(str(ws), {"name": "_test"})
        mock_call.assert_not_called()  # No facts → skip LLM call

    @pytest.mark.asyncio
    async def test_consolidate_failure_is_silent(self, tmp_path):
        from core.memory import _consolidate_agent_memory, flush_facts_to_memory
        ws = tmp_path / "agent3"
        ws.mkdir()
        (ws / "memory").mkdir()
        (ws / "MEMORY.md").write_text("# MEMORY.md\n")
        flush_facts_to_memory(
            [{"type": "FINDING", "text": "Something important", "importance": 6}],
            {"agent3": str(ws)},
        )
        with patch("app.call_agent", new_callable=AsyncMock, side_effect=Exception("LLM down")):
            # Should not raise
            await _consolidate_agent_memory(str(ws), {"name": "_test"})
