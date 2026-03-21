import { useState, useCallback } from "react";
import { SkillInfo } from "../types";

export function useSkillPicker(skills: SkillInfo[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusIdx, setFocusIdx] = useState(0);

  const filtered = query
    ? skills.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.slug.includes(query.toLowerCase()))
    : skills;

  const check = useCallback((text: string) => {
    const match = text.match(/\/(\S*)$/);
    if (match) {
      setOpen(true);
      setQuery(match[1] ?? "");
      setFocusIdx(0);
    } else {
      setOpen(false);
      setQuery("");
    }
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(""); }, []);

  function onKeyDown(e: React.KeyboardEvent, onSelect: (slug: string) => void): boolean {
    if (!open) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => Math.min(i + 1, filtered.length - 1)); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => Math.max(i - 1, 0)); return true; }
    if (e.key === "Enter" && filtered[focusIdx]) { e.preventDefault(); onSelect(filtered[focusIdx].slug); close(); return true; }
    if (e.key === "Escape") { close(); return true; }
    return false;
  }

  return { open, filtered, focusIdx, check, close, onKeyDown };
}
