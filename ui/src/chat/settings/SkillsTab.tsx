import { useState, useRef, useEffect } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSkillDetail,
  useCreateSkill,
  useUpdateSkill,
  useUploadSkill,
} from "./useSettingsApi";
import { useSkillsList } from "../hooks/useChatApi";

// ─── Types ────────────────────────────────────────────────────

type View = { kind: "grid" } | { kind: "edit"; slug: string } | { kind: "create" };

// ─── Card Grid ────────────────────────────────────────────────

function SkillCard({ slug, description, onClick }: { slug: string; description: string; onClick: () => void }) {
  return (
    <button
      className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/30 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">🔧</span>
        <span className="font-mono text-sm font-semibold truncate">/{slug}</span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
    </button>
  );
}

// ─── Edit View ────────────────────────────────────────────────

function EditView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const { data, isLoading } = useSkillDetail(slug);
  const updateSkill = useUpdateSkill();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDescription(data.description);
      setBody(data.body);
    }
  }, [data]);

  const handleSave = async () => {
    await updateSkill.mutateAsync({ slug, name, description, body });
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onBack();
    }, 800);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-mono text-sm font-semibold">/{slug}</span>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 返回
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Body</label>
                <textarea
                  className="min-h-[300px] resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={updateSkill.isPending || saved}
                className="w-full"
              >
                {updateSkill.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {saved ? "已儲存 ✓" : "儲存"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Create View ──────────────────────────────────────────────

function CreateView({ onBack }: { onBack: () => void }) {
  const createSkill = useCreateSkill();

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");

  const handleCreate = async () => {
    await createSkill.mutateAsync({ slug, name, description, body });
    onBack();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-sm font-semibold">新增技能</span>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← 取消
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Slug（必填）</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-skill"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Body</label>
            <textarea
              className="min-h-[300px] resize-none rounded-lg border border-border bg-background p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={!slug || createSkill.isPending}
            className="w-full"
          >
            {createSkill.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            建立
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────

export function SkillsTab() {
  const { data: skills = [], isLoading } = useSkillsList();
  const uploadSkill = useUploadSkill();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>({ kind: "grid" });
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadSkill.mutateAsync(formData);
    const parts: string[] = [];
    if (result.created.length > 0) parts.push(`已建立: ${result.created.join(", ")}`);
    if (result.skipped.length > 0) parts.push(`已跳過: ${result.skipped.join(", ")}`);
    setUploadMsg(parts.join("　") || "上傳完成");

    setTimeout(() => setUploadMsg(null), 5000);

    // reset so same file can be re-uploaded if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (view.kind === "edit") {
    return <EditView slug={view.slug} onBack={() => setView({ kind: "grid" })} />;
  }

  if (view.kind === "create") {
    return <CreateView onBack={() => setView({ kind: "grid" })} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-sm font-semibold">已安裝的技能</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadSkill.isPending}
          >
            {uploadSkill.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            上傳
          </Button>
          <Button
            size="sm"
            onClick={() => setView({ kind: "create" })}
          >
            <Plus className="h-4 w-4 mr-1" />
            新增
          </Button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload result toast */}
      {uploadMsg && (
        <div className="mx-6 mt-3 rounded-lg border border-border bg-accent/30 px-4 py-2 text-xs text-foreground">
          {uploadMsg}
        </div>
      )}

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : skills.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            尚未安裝技能 — 點擊 + 新增或上傳 .zip
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {skills.map((skill) => (
              <SkillCard
                key={skill.slug}
                slug={skill.slug}
                description={skill.description}
                onClick={() => setView({ kind: "edit", slug: skill.slug })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
