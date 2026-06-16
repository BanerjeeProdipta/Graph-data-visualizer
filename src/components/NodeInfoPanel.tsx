import { X } from "lucide-react";
import type { NodeInfo } from "@/utils/nodeInfo";

interface NodeInfoPanelProps {
  info: NodeInfo;
  onClose: () => void;
  onSelectArtist: (id: string) => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function NodeInfoPanel({
  info,
  onClose,
  onSelectArtist,
}: NodeInfoPanelProps) {
  const topConnections = info.connections
    .sort((a, b) => b.followers - a.followers)
    .slice(0, 20);

  return (
    <div
      className="absolute right-4 top-4 z-20 w-72 rounded-lg border border-white/10 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-md"
      style={{ pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight">
            {info.label}
          </h2>
          <span className="mt-0.5 inline-block rounded bg-white/10 px-2 py-0.5 text-xs text-white/70">
            {info.genre || "Unknown genre"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 ml-2 flex h-6 w-6 items-center justify-center rounded hover:bg-white/10"
        >
          <X size={14} />
        </button>
      </div>

      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Followers
          </div>
          <div className="font-medium">{formatNumber(info.followers)}</div>
        </div>
        <div className="rounded bg-white/5 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Country
          </div>
          <div className="font-medium">{info.topCountry || "—"}</div>
        </div>
      </div>

      <div className="mb-2 rounded bg-white/5 px-2 py-1.5 text-sm">
        <div className="text-[10px] uppercase tracking-wider text-white/40">
          Connections
        </div>
        <div className="font-medium">
          {info.connections.length.toLocaleString()} artists
        </div>
      </div>

      {/* Top connections list */}
      {topConnections.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
            Top collaborators
          </div>
          <ul className="max-h-36 space-y-0.5 overflow-y-auto">
            {topConnections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full truncate rounded px-2 py-1 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => onSelectArtist(c.id)}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
