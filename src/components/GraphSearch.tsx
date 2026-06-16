import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import { Input } from "@/components/ui/input";
import { searchArtistsByLabel } from "@/utils/graphSearch";
import { X } from "lucide-react";

const ITEM_H = 34; // px — height of each genre row in the virtual list
const VISIBLE_ROWS = 8; // how many rows are shown before scrolling

// ─── Virtualized genre dropdown ──────────────────────────────────────────────

interface GenreOption {
  name: string;
  color: string;
  count: number;
}

interface GenreAutocompleteProps {
  genres: string[];
  genreColors: Map<string, string>;
  genreCounts: Map<string, number>;
  selectedGenre: string | null;
  onChange: (genre: string | null) => void;
}

function GenreAutocomplete({
  genres,
  genreColors,
  genreCounts,
  selectedGenre,
  onChange,
}: GenreAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allOptions = useMemo<GenreOption[]>(() => {
    const sorted = [...genres].sort(
      (a, b) => (genreCounts.get(b) ?? 0) - (genreCounts.get(a) ?? 0),
    );
    return [
      { name: "__all__", color: "#888888", count: 0 },
      ...sorted.map((g) => ({
        name: g,
        color: genreColors.get(g) ?? "#888888",
        count: genreCounts.get(g) ?? 0,
      })),
    ];
  }, [genres, genreColors, genreCounts]);

  const filteredOptions = useMemo<GenreOption[]>(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return allOptions;
    return [
      allOptions[0], // always keep "All genres" at top
      ...allOptions.slice(1).filter((o) => o.name.toLowerCase().includes(q)),
    ];
  }, [allOptions, inputValue]);

  // Virtual-list window
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_H) - 1);
  const endIdx = Math.min(filteredOptions.length, startIdx + VISIBLE_ROWS + 3);
  const listH = Math.min(filteredOptions.length, VISIBLE_ROWS) * ITEM_H;

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const openDropdown = useCallback(() => {
    setInputValue("");
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
    setOpen(true);
  }, []);

  const selectOption = useCallback(
    (opt: GenreOption) => {
      const genre = opt.name === "__all__" ? null : opt.name;
      onChange(genre);
      setInputValue("");
      setOpen(false);
    },
    [onChange],
  );

  const clearSelection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setInputValue("");
      setOpen(false);
    },
    [onChange],
  );

  const displayLabel = selectedGenre ?? "Filter by genre…";
  const dotColor = selectedGenre
    ? (genreColors.get(selectedGenre) ?? "#888")
    : null;

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger row */}
      <div
        className="flex items-center gap-2 cursor-pointer rounded-md border border-white/20 bg-black/40 px-3 h-9"
        onClick={() => {
          openDropdown();
          inputRef.current?.focus();
        }}
      >
        {dotColor && (
          <span
            className="shrink-0 rounded-full"
            style={{ width: 8, height: 8, background: dotColor }}
          />
        )}
        <input
          ref={inputRef}
          value={open ? inputValue : selectedGenre ? "" : ""}
          placeholder={open ? "Search genre…" : displayLabel}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={openDropdown}
          className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-white/50"
          style={{ caretColor: "white" }}
        />
        {!open && selectedGenre && (
          <span className="text-sm text-white/70 truncate max-w-[140px] shrink">
            {selectedGenre}
          </span>
        )}
        {selectedGenre && !open && (
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 text-white/40 hover:text-white/80 transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-auto rounded-md border border-white/10 bg-black/95 shadow-xl"
          style={{ height: listH }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {/* Spacer = total virtual height */}
          <div
            style={{
              height: filteredOptions.length * ITEM_H,
              position: "relative",
            }}
          >
            {filteredOptions.slice(startIdx, endIdx).map((opt, i) => {
              const isAll = opt.name === "__all__";
              const isSelected = isAll
                ? !selectedGenre
                : opt.name === selectedGenre;
              return (
                <div
                  key={opt.name}
                  className={`absolute left-0 right-0 flex items-center gap-2 px-3 cursor-pointer text-sm transition-colors ${
                    isSelected
                      ? "bg-white/15 text-white"
                      : "text-white/75 hover:bg-white/8 hover:text-white"
                  }`}
                  style={{ top: (startIdx + i) * ITEM_H, height: ITEM_H }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(opt)}
                >
                  <span
                    className="shrink-0 rounded-full border border-white/20"
                    style={{
                      width: 8,
                      height: 8,
                      background: isAll ? "transparent" : opt.color,
                    }}
                  />
                  <span className="truncate flex-1">
                    {isAll ? "All genres" : opt.name}
                  </span>
                  {!isAll && (
                    <span className="shrink-0 text-xs text-white/40 tabular-nums">
                      {opt.count.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main search panel ────────────────────────────────────────────────────────

interface GraphSearchProps {
  graph: Graph;
  rankedNodeIds: string[];
  genres: string[];
  genreColors: Map<string, string>;
  genreCounts: Map<string, number>;
  onSelectArtist: (id: string) => void;
  onSelectGenre: (genre: string | null) => void;
}

export function GraphSearch({
  graph,
  rankedNodeIds,
  genres,
  genreColors,
  genreCounts,
  onSelectArtist,
  onSelectGenre,
}: GraphSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [showMatches, setShowMatches] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(
    () => searchArtistsByLabel(graph, rankedNodeIds, query),
    [graph, rankedNodeIds, query],
  );

  // If a genre is selected, restrict matches to that genre
  const matchesFiltered = useMemo(() => {
    if (!selectedGenre) return matches;
    return matches.filter((m) => m.genre === selectedGenre);
  }, [matches, selectedGenre]);

  const handleGenreChange = useCallback(
    (genre: string | null) => {
      setSelectedGenre(genre);
      onSelectGenre(genre);
    },
    [onSelectGenre],
  );

  // Close matches on outside click (ignore clicks inside the whole search panel)
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowMatches(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute top-4 left-4 z-10 flex w-72 flex-col gap-2 rounded-lg border border-white/10 bg-black/70 p-3 text-white backdrop-blur-sm"
      style={{ pointerEvents: "auto" }}
    >
      {/* Artist search */}
      <div className="relative">
        <Input
          ref={(el: HTMLInputElement) => (inputRef.current = el)}
          placeholder="Search artist…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowMatches(true);
          }}
          onFocus={() => setShowMatches(true)}
          className="border-white/20 bg-black/40 text-white placeholder:text-white/40"
        />
        {showMatches && matchesFiltered.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/90 shadow-lg">
            {matchesFiltered.map((match) => (
              <li key={match.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={() => {
                    onSelectArtist(match.id);
                    setQuery(match.label);
                    setShowMatches(false);
                    inputRef.current?.blur();
                  }}
                >
                  <div>{match.label}</div>
                  <div className="text-xs text-white/50">{match.genre}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Genre autocomplete with virtualization */}
      <GenreAutocomplete
        genres={genres}
        genreColors={genreColors}
        genreCounts={genreCounts}
        selectedGenre={selectedGenre}
        onChange={handleGenreChange}
      />
    </div>
  );
}
