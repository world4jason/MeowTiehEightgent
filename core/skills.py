"""Skill file discovery and parsing utilities."""
from pathlib import Path


def find_skill_file(slug_dir: Path) -> Path | None:
    """Find SKILL.md or SKILLS.md inside a skill directory."""
    for name in ["SKILL.md", "SKILLS.md"]:
        f = slug_dir / name
        if f.exists():
            return f
    return None


def parse_skill(skill_file: Path) -> dict:
    raw = skill_file.read_text().strip()
    name = skill_file.parent.name
    description = ""
    source = ""
    source_url = ""
    source_version = ""
    body = raw
    if raw.startswith("---"):
        end = raw.find("---", 3)
        if end != -1:
            fm = raw[3:end].strip()
            body = raw[end + 3:].strip()
            for line in fm.splitlines():
                if line.startswith("name:"):
                    name = line[5:].strip()
                elif line.startswith("description:"):
                    description = line[12:].strip()
                elif line.startswith("source:"):
                    source = line[7:].strip()
                elif line.startswith("source_url:"):
                    source_url = line[11:].strip()
                elif line.startswith("source_version:"):
                    source_version = line[15:].strip()
    if not description:
        lines = [l for l in body.splitlines() if l.strip() and not l.startswith("#")]
        description = lines[0].strip() if lines else ""
    return {
        "name": name,
        "description": description,
        "body": body,
        "source": source,
        "source_url": source_url,
        "source_version": source_version,
    }
