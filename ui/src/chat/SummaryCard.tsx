import { useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SummaryCardProps {
  sessionId: string;
  summary: {
    exists: boolean;
    summary_text?: string;
    covered_message_count?: number;
    total_message_count?: number;
  };
  onRecompress: (hint: string) => Promise<void>;
  isRecompressing: boolean;
}

export function SummaryCard({ sessionId: _sessionId, summary, onRecompress, isRecompressing }: SummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hint, setHint] = useState("");
  const [showHint, setShowHint] = useState(false);

  if (!summary.exists) return null;

  const covered = summary.covered_message_count ?? 0;
  const total = summary.total_message_count ?? 0;

  return (
    <div className="mx-auto max-w-3xl mb-4 rounded-xl border border-border bg-muted/30 p-3">
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">對話摘要</span>
        <span className="text-xs text-muted-foreground ml-auto">
          已壓縮 {covered} 則訊息 / 共 {total} 則
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {summary.summary_text}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (showHint && hint) {
                  onRecompress(hint);
                } else if (showHint) {
                  onRecompress("");
                } else {
                  setShowHint(true);
                }
              }}
              disabled={isRecompressing}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isRecompressing ? "animate-spin" : ""}`} />
              {isRecompressing ? "壓縮中..." : "重新壓縮"}
            </Button>
            {showHint && !isRecompressing && (
              <Input
                placeholder="壓縮方向建議（選填）"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                className="h-8 text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRecompress(hint);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
