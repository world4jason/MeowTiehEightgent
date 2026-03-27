"""Skills endpoints."""
import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from core.skills import find_skill_file, parse_skill

router = APIRouter()


@router.get("/skills")
async def list_skills():
    import app as _app
    skills_dir = _app.PROJECT_DIR / "skills"
    result = []
    for slug_dir in sorted(skills_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        sf = find_skill_file(slug_dir)
        if sf:
            s = parse_skill(sf)
            display_name = f"{s['source']}:{s['name']}" if s.get("source") else s["name"]
            result.append({
                "slug": slug_dir.name,
                "name": display_name,
                "description": s["description"],
                "missing": False,
                "source": s["source"],
                "source_url": s["source_url"],
                "source_version": s["source_version"],
            })
        else:
            result.append({
                "slug": slug_dir.name, "name": slug_dir.name, "description": "", "missing": True,
                "source": "", "source_url": "", "source_version": "",
            })
    return result


@router.get("/skills/{slug}")
async def get_skill(slug: str):
    import app as _app
    sf = find_skill_file(_app.PROJECT_DIR / "skills" / slug)
    if not sf:
        raise HTTPException(status_code=404, detail="Skill not found")
    s = parse_skill(sf)
    return {
        "slug": slug, "name": s["name"], "description": s["description"], "body": s["body"],
        "source": s["source"], "source_url": s["source_url"], "source_version": s["source_version"],
    }


@router.put("/skills/{slug}")
async def save_skill(slug: str, payload: dict):
    import app as _app
    sf = find_skill_file(_app.PROJECT_DIR / "skills" / slug)
    if not sf:
        raise HTTPException(status_code=404, detail="Skill not found")
    name = payload.get("name", slug)
    description = payload.get("description", "")
    body = payload.get("body", "")
    sf.write_text(f"---\nname: {name}\ndescription: {description}\n---\n\n{body}")
    return {"ok": True}


@router.post("/skills")
async def create_skill(payload: dict):
    import app as _app
    slug = payload.get("slug", "").strip().lower().replace(" ", "-")
    if not slug:
        raise HTTPException(status_code=400, detail="slug required")
    skill_dir = _app.PROJECT_DIR / "skills" / slug
    if skill_dir.exists():
        raise HTTPException(status_code=409, detail="Skill already exists")
    skill_dir.mkdir(parents=True)
    name = payload.get("name", slug)
    description = payload.get("description", "")
    body = payload.get("body", "")
    (skill_dir / "SKILL.md").write_text(f"---\nname: {name}\ndescription: {description}\n---\n\n{body}")
    return {"ok": True, "slug": slug}


@router.post("/skills/upload")
async def upload_skills(file: UploadFile = File(...)):
    import app as _app
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")
    data = await file.read()
    created = []
    skipped = []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for member in zf.infolist():
                parts = Path(member.filename).parts
                if len(parts) < 2:
                    continue
                slug = parts[0]
                filename = parts[-1]
                if filename not in ("SKILL.md", "SKILLS.md"):
                    continue
                skill_dir = _app.PROJECT_DIR / "skills" / slug
                skill_dir.mkdir(parents=True, exist_ok=True)
                dest = skill_dir / filename
                dest.write_bytes(zf.read(member.filename))
                if slug not in created:
                    created.append(slug)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file")
    return {"ok": True, "created": created, "skipped": skipped}
