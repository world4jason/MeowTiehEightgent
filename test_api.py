"""
Regression + unit tests for agent-cli-converation API.

Run with:  python3 -m pytest test_api.py -v
"""
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

    monkeypatch.setattr(a, "AGENTS_DIR", agents_dir)
    monkeypatch.setattr(a, "HISTORY_DIR", history_dir)
    monkeypatch.setattr(a, "CONFIG_FILE", config_file)
    monkeypatch.setattr(a, "PROJECT_DIR", tmp_path)

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
        agent_dir = tmp_project / "agents" / "theta"
        assert (agent_dir / "AGENT.md").exists()
        assert (agent_dir / "MEMORY.md").exists()
        assert (agent_dir / "config.json").exists()


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

    def test_cloud_models_ok(self, client):
        mock_cls, mock_client = self._mock_httpx_get(
            {"models": [{"name": "llama3.3"}, {"name": "gemma3:27b"}]}
        )
        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/cloud-models")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert "llama3.3" in data["models"]

    def test_cloud_models_passes_cloud_param(self, client):
        mock_cls, mock_client = self._mock_httpx_get({"models": []})
        with patch("app.httpx.AsyncClient", mock_cls):
            client.get("/providers/ollama/cloud-models")
        call_kwargs = mock_client.get.call_args[1]
        assert call_kwargs.get("params", {}).get("cloud") == "true"

    def test_cloud_models_unreachable(self, client):
        import httpx
        mock_client = MagicMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_cls = MagicMock()
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.httpx.AsyncClient", mock_cls):
            r = client.get("/providers/ollama/cloud-models")
        assert r.status_code == 200
        assert r.json()["ok"] is False

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
