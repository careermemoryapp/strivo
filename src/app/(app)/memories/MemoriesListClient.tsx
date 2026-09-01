"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Brain, Trophy, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn, groupMemoriesByTime } from "@/lib/utils";
import { MEMORY_CATEGORIES_LIST, MEMORY_COMPETENCIES_LIST } from "@/lib/config";
import type { Memory } from "@/lib/repo/memories";

const CATEGORY_FILTER_OPTIONS = ["All", ...MEMORY_CATEGORIES_LIST];
const COMPETENCY_FILTER_OPTIONS = ["All", ...MEMORY_COMPETENCIES_LIST];

type Filters = { category: string; competency: string };

// initialMemories is the default (no search, newest-first) list, already
// fetched server-side by page.tsx — see ChatDetailClient.tsx and
// ChatsListClient.tsx for the full reasoning. Search/sort/filter changes
// still fetch client-side, since those are driven by live typing/tapping;
// only the very first render is skipped now.
export function MemoriesListClient({ initialMemories }: { initialMemories: Memory[] }) {
  const router = useRouter();
  const user = useCurrentUser();
  const [memories, setMemories] = useState<Memory[] | null>(initialMemories);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [filters, setFilters] = useState<Filters>({ category: "All", competency: "All" });
  const [error, setError] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isFirstRun = useRef(true);

  const load = useCallback(async (searchTerm: string, sortOrder: "newest" | "oldest", f: Filters) => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      params.set("sort", sortOrder);
      if (f.category !== "All") params.set("category", f.category);
      if (f.competency !== "All") params.set("competency", f.competency);
      const res = await fetch(`/api/memories?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMemories(data.memories);
    } catch {
      setError("Couldn't load your memories. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    // The very first render already has the right data from the server —
    // skip re-fetching it a moment later. Only real search/sort/filter
    // changes after that should hit the API.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const t = setTimeout(() => load(search, sort, filters), 250);
    return () => clearTimeout(t);
  }, [search, sort, filters, load]);

  const groups = memories ? groupMemoriesByTime(memories) : [];
  const activeFilterCount = (filters.category !== "All" ? 1 : 0) + (filters.competency !== "All" ? 1 : 0);
  const noResultsFromFilter = !!search || activeFilterCount > 0;

  return (
    <div className="pb-6">
      <DarkHeader
        wordmark
        avatarRight={
          <div className="flex items-center gap-3.5">
            <NotificationBell />
            <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
              <Avatar firstName={user?.firstName} lastName={user?.lastName} size={32} />
            </button>
          </div>
        }
      >
        <div className="relative mt-5">
          <h1 className="text-[21px] font-bold text-white">All Memories</h1>
          <p className="mt-1 text-[12px] text-white/55">Your experiences, insights and moments that matter.</p>
        </div>

        {/* Entry point to the Story Bank coverage view (see
            /memories/coverage) — which competencies the user has strong
            stories for and which are still gaps worth filling. */}
        <button
          onClick={() => router.push("/memories/coverage")}
          className="relative mt-4 flex w-full items-center justify-between rounded-[13px] border border-white/10 bg-white/8 px-3.5 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-white">
            <Trophy size={16} className="text-amber-300" /> Story Bank
          </span>
          <span className="flex items-center gap-1 text-xs text-white/55">
            See your coverage <ChevronRight size={14} />
          </span>
        </button>

        <div className="relative mt-4 flex items-center gap-2">
          <div className="flex flex-1 min-w-0 items-center gap-2 rounded-[13px] border border-white/10 bg-white/8 px-3.5 py-3">
            <Search size={16} className="shrink-0 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            className={cn(
              "relative flex shrink-0 items-center gap-1 rounded-[13px] border px-3 py-3 text-sm font-medium",
              activeFilterCount > 0
                ? "border-white/20 bg-white text-[#26213c]"
                : "border-white/10 bg-white/8 text-white/70"
            )}
            aria-label="Filter memories"
          >
            <SlidersHorizontal size={15} />
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#26213c] text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-[13px] border border-white/10 bg-white/8 px-3 py-3 text-sm font-medium text-white/70"
            >
              {sort === "newest" ? "Newest" : "Oldest"}
              <ChevronDown size={15} />
            </button>
            {sortMenuOpen && (
              <div
                className="absolute right-0 top-12 z-10 w-32 rounded-card border border-border bg-surface p-1"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {(["newest", "oldest"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSort(s);
                      setSortMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-input px-3 py-2 text-sm text-ink hover:bg-bg capitalize"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DarkHeader>

      <div className="px-5 pt-5">
        {error && <ErrorBanner message={error} onRetry={() => load(search, sort, filters)} />}

        {!memories && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {memories && memories.length === 0 && (
          <EmptyState
            icon={<Brain size={22} />}
            title={noResultsFromFilter ? "No memories match" : "No memories yet"}
            description={
              noResultsFromFilter
                ? "Try a different search term or clear a filter."
                : "Capture your first memory to see it here."
            }
          />
        )}

        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{group.label}</h3>
              <div className="space-y-2.5">
                {group.items.map((m) => (
                  <MemoryCard key={m.id} memory={m} onChanged={() => load(search, sort, filters)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => setFiltersOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 pb-8"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Filter memories</h3>
              <button onClick={() => setFiltersOpen(false)} aria-label="Close">
                <X size={20} className="text-ink-soft" />
              </button>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Category</p>
            <div className="mb-5 flex flex-wrap gap-2">
              {CATEGORY_FILTER_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilters((f) => ({ ...f, category: c }))}
                  className={cn(
                    "rounded-pill px-3.5 py-1.5 text-xs font-semibold",
                    filters.category === c ? "bg-[#26213c] text-white" : "bg-bg text-ink-soft"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Competency</p>
            <div className="mb-5 flex flex-wrap gap-2">
              {COMPETENCY_FILTER_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilters((f) => ({ ...f, competency: c }))}
                  className={cn(
                    "rounded-pill px-3.5 py-1.5 text-xs font-semibold",
                    filters.competency === c ? "bg-[#26213c] text-white" : "bg-bg text-ink-soft"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilters({ category: "All", competency: "All" })}
                className="flex-1 rounded-pill border border-border py-3 text-sm font-semibold text-ink-soft"
              >
                Clear filters
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                className="flex-1 rounded-pill bg-[#26213c] py-3 text-sm font-semibold text-white"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
