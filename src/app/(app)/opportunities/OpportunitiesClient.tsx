"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Briefcase, ThumbsUp, ThumbsDown, ExternalLink, Sparkles } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";

type OpportunityCard = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  sourceUrl: string;
  postedDate: string | null;
  fit: "strong" | "good" | "possible" | null;
  reason: string | null;
};

type OpportunitiesResponse = {
  personalized: boolean;
  memoryCount: number;
  memoriesNeeded: number;
  opportunities: OpportunityCard[];
};

const FIT_LABEL: Record<NonNullable<OpportunityCard["fit"]>, string> = {
  strong: "Strong fit",
  good: "Good fit",
  possible: "Worth exploring",
};

export function OpportunitiesClient() {
  const router = useRouter();
  const user = useCurrentUser();
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Local, session-only -- once you've reacted to a card it disappears
  // from this render immediately rather than waiting on a re-fetch/re-rank,
  // same "optimistic local removal" pattern as MemoryCard's delete.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/opportunities");
      if (!res.ok) throw new Error();
      const json = (await res.json()) as OpportunitiesResponse;
      setData(json);
    } catch {
      setError("Couldn't load opportunities. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred via setTimeout, not called directly -- same pattern as
    // MemoriesListClient's own fetch-on-mount, which keeps the actual
    // setState-triggering call out of the effect's synchronous body (see
    // react-hooks/set-state-in-effect).
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, []);

  async function sendFeedback(jobId: string, feedback: "relevant" | "not_for_me") {
    setDismissedIds((prev) => new Set(prev).add(jobId));
    try {
      await fetch(`/api/opportunities/${jobId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
    } catch {
      // Best-effort -- the card already left the local list either way,
      // and a failed feedback write just means this one job doesn't get
      // excluded from a future ranking pass. Not worth surfacing an error
      // for a thumbs-up/down tap.
    }
  }

  const visible = data?.opportunities.filter((o) => !dismissedIds.has(o.id)) ?? [];

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
        <div className="mt-5">
          <h1 className="text-[21px] font-bold text-white">Opportunities</h1>
          <p className="mt-1 text-[12px] text-white/55">Based on your experience and everything Strivo knows about your career.</p>
        </div>
      </DarkHeader>

      <div className="px-4 pt-4 space-y-3">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {!error && data && !data.personalized && (
          <Card className="!bg-brand-primary-soft !border-brand-primary/20">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-primary">
                <Sparkles size={18} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">
                  {data.memoriesNeeded > 0
                    ? `Record ${data.memoriesNeeded} more ${data.memoriesNeeded === 1 ? "memory" : "memories"} to personalize this list`
                    : "Add a few more memories to sharpen these matches"}
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  These are broad matches for now. The more Strivo knows about what you&apos;ve actually done, the more specific — and better-fitting — your opportunities get.
                </p>
                <Button variant="secondary" className="mt-3 !py-2 !px-3 text-[13px]" onClick={() => router.push("/record")}>
                  Record a memory
                </Button>
              </div>
            </div>
          </Card>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner />
            <p className="mt-3 text-sm text-ink-soft">Finding opportunities for you…</p>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <EmptyState
            icon={<Briefcase size={24} />}
            title="No opportunities yet"
            description="Strivo's job pool is still warming up, or nothing new matches your profile right now — check back soon."
          />
        )}

        {!loading &&
          visible.map((opp) => (
            <Card key={opp.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink leading-snug">{opp.title}</p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {[
                      opp.company,
                      opp.location,
                      // Jooble's own "updated" timestamp, not a distinct
                      // posted-date field -- close enough for "how fresh is
                      // this listing" at a glance. Guarded against an
                      // unparseable/missing value rather than trusting
                      // every upstream row to have a clean ISO string.
                      opp.postedDate && !isNaN(new Date(opp.postedDate).getTime())
                        ? formatDistanceToNowStrict(new Date(opp.postedDate), { addSuffix: true })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {opp.fit && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      opp.fit === "strong" && "bg-brand-primary-soft text-brand-primary",
                      opp.fit === "good" && "bg-amber-50 text-amber-700",
                      opp.fit === "possible" && "bg-ink-soft/10 text-ink-soft"
                    )}
                  >
                    {FIT_LABEL[opp.fit]}
                  </span>
                )}
              </div>

              {opp.reason && <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">{opp.reason}</p>}

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Relevant"
                    onClick={() => sendFeedback(opp.id, "relevant")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-brand-primary-soft hover:text-brand-primary transition"
                  >
                    <ThumbsUp size={16} />
                  </button>
                  <button
                    aria-label="Not for me"
                    onClick={() => sendFeedback(opp.id, "not_for_me")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-red-50 hover:text-red-600 transition"
                  >
                    <ThumbsDown size={16} />
                  </button>
                </div>
                <a
                  href={opp.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[13px] font-semibold text-brand-primary"
                >
                  Apply <ExternalLink size={14} />
                </a>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
}
