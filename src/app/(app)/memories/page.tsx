"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Brain } from "lucide-react";
import { LogoWithWordmark } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { MemoryCard } from "@/components/MemoryCard";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { groupMemoriesByTime } from "@/lib/utils";
import type { Memory } from "@/lib/repo/memories";

export default function MemoriesPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [error, setError] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const load = useCallback(async (searchTerm: string, sortOrder: "newest" | "oldest") => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      params.set("sort", sortOrder);
      const res = await fetch(`/api/memories?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMemories(data.memories);
    } catch {
      setError("Couldn't load your memories. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search, sort), 250);
    return () => clearTimeout(t);
  }, [search, sort, load]);

  const groups = memories ? groupMemoriesByTime(memories) : [];

  return (
    <div>
      <div className="flex items-center justify-between px-5 pt-6">
        <LogoWithWordmark size={36} />
        <button onClick={() => router.push("/settings")} aria-label="Profile and settings">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} size={34} />
        </button>
      </div>

      <div className="px-5 pt-5">
        <h1 className="text-2xl font-bold text-ink">All Memories</h1>
        <p className="mt-1 text-sm text-ink-soft">Your experiences, insights and moments that matter.</p>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memories…"
              className="w-full rounded-input border border-border bg-surface py-3 pl-10 pr-3 text-ink placeholder:text-ink-faint outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft"
            />
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setSortMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-input border border-border bg-surface px-3 py-3 text-sm font-medium text-ink-soft"
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
      </div>

      <div className="px-5 pt-4">
        {error && <ErrorBanner message={error} onRetry={() => load(search, sort)} />}

        {!memories && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {memories && memories.length === 0 && (
          <EmptyState
            icon={<Brain size={22} />}
            title={search ? "No memories match your search" : "No memories yet"}
            description={search ? "Try a different search term." : "Capture your first memory to see it here."}
          />
        )}

        <div className="space-y-6 pb-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{group.label}</h3>
              <div className="space-y-2.5">
                {group.items.map((m) => (
                  <MemoryCard key={m.id} memory={m} onChanged={() => load(search, sort)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
