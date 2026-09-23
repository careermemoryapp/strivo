"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Briefcase, ThumbsUp, ThumbsDown, ExternalLink, Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
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

type JobPreferences = { city: string | null; function: string | null; industry: string | null };

type OpportunitiesResponse = {
  personalized: boolean;
  memoryCount: number;
  memoriesNeeded: number;
  statedPreferences: JobPreferences | null;
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

  // The "tell us what you're looking for" form shown on the locked state
  // (see the !data.personalized block below) -- seeded from whatever's
  // already stored (see load() below) so re-opening the tab shows what you
  // told Strivo last time, not a blank form every visit.
  const [prefCity, setPrefCity] = useState("");
  const [prefFunction, setPrefFunction] = useState("");
  const [prefIndustry, setPrefIndustry] = useState("");
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  // Same form, shown collapsed once someone's already personalized -- a
  // direct founder ask: people who already see matches should still be
  // able to change city/function/industry (e.g. relocating, switching
  // industries) rather than that only being possible from the locked
  // state's version of this form.
  const [showEditPrefs, setShowEditPrefs] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/opportunities");
      if (!res.ok) throw new Error();
      const json = (await res.json()) as OpportunitiesResponse;
      setData(json);
      setPrefCity(json.statedPreferences?.city ?? "");
      setPrefFunction(json.statedPreferences?.function ?? "");
      setPrefIndustry(json.statedPreferences?.industry ?? "");
    } catch {
      setError("Couldn't load opportunities. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    setPrefsError(null);
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/opportunities/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: prefCity.trim() || null,
          function: prefFunction.trim() || null,
          industry: prefIndustry.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      // Saving clears the server-side cache (see clearUserOpportunities in
      // lib/repo/userOpportunities.ts), so this re-fetch picks up real
      // matches immediately rather than the stale locked result.
      setLoading(true);
      await load();
    } catch {
      setPrefsError("Couldn't save that -- check your connection and try again.");
    } finally {
      setSavingPrefs(false);
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
          {/* Trust marker -- always shown, not tied to any particular
              result state, since it's a standing promise about the whole
              tab: every listing here resolves to the employer's own apply
              flow (see resolveDirectApplyUrl in lib/applyLinkResolver.ts,
              which drops anything that lands on LinkedIn, Naukri, Indeed,
              and similar). Called out explicitly because it's a real
              quality/trust differentiator, not just an implementation
              detail -- applying through a portal listing often just
              doesn't work the way applying on the company's own page
              does. */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80">
            <ShieldCheck size={13} className="shrink-0" />
            Only jobs you can apply to on the company&apos;s own page — never job portals
          </div>
        </div>
      </DarkHeader>

      <div className="px-4 pt-4 space-y-3">
        {error && <ErrorBanner message={error} onRetry={load} />}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner />
            <p className="mt-3 text-sm text-ink-soft">Finding opportunities for you…</p>
          </div>
        )}

        {/* Locked state: deliberately no jobs at all until Strivo has
            enough recorded memories, OR the person has told Strivo
            directly what they want (see wantsPersonalized in
            lib/opportunities.ts -- product decision, not a loading state).
            Showing a generic sample of the pool here used to undercut the
            whole incentive to record memories, so this replaces that with
            an explicit "unlock" card, PLUS a quick form as the faster path
            in for someone who doesn't want to wait on memories at all. */}
        {!loading && !error && data && !data.personalized && (
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-brand-primary">
                <Lock size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {data.memoriesNeeded > 0 ? "Record more memories to unlock Opportunities" : "Opportunities unlocks soon"}
                </p>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {data.memoriesNeeded > 0
                    ? "This tab stays empty until Strivo actually knows enough about your experience to judge fit — your seniority, industry, and location — rather than showing you a generic list from the pool."
                    : "You've recorded enough for Strivo to start naming real roles for you. This list fills in automatically once that finishes — usually within a few days."}
                </p>
                <Button variant="secondary" className="mt-3 !py-2 !px-3 text-[13px]" onClick={() => router.push("/record")}>
                  Record a memory
                </Button>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm font-semibold text-ink">Or tell us what you&apos;re looking for</p>
              <p className="mt-1 text-[13px] text-ink-soft">
                While we keep learning from your memories, you can point us at real jobs right now — city, role, and industry.
              </p>
              <div className="mt-3 space-y-3">
                <TextField label="City" placeholder="e.g. Bengaluru" value={prefCity} onChange={(e) => setPrefCity(e.target.value)} />
                <TextField
                  label="Function / role"
                  placeholder="e.g. Product Manager"
                  value={prefFunction}
                  onChange={(e) => setPrefFunction(e.target.value)}
                />
                <TextField
                  label="Industry"
                  placeholder="e.g. Fintech"
                  value={prefIndustry}
                  onChange={(e) => setPrefIndustry(e.target.value)}
                />
              </div>
              {prefsError && <p className="mt-2 text-[13px] text-red-600">{prefsError}</p>}
              <Button
                className="mt-3 !py-2 !px-4 text-[13px]"
                loading={savingPrefs}
                disabled={!prefCity.trim() && !prefFunction.trim() && !prefIndustry.trim()}
                onClick={savePreferences}
              >
                Find jobs for this
              </Button>
            </div>
          </Card>
        )}

        {/* Personalized users can still open the same city/function/
            industry form the locked state shows -- collapsed by default so
            it doesn't compete with the job list, but always reachable in
            case what Strivo has inferred (from memories or an earlier
            answer here) isn't right anymore. */}
        {!loading && !error && data?.personalized && (
          <div>
            <button
              onClick={() => setShowEditPrefs((v) => !v)}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft"
            >
              <SlidersHorizontal size={13} />
              {showEditPrefs ? "Hide search settings" : "Change city, role, or industry"}
            </button>
            {showEditPrefs && (
              <Card className="mt-2">
                <p className="text-[13px] text-ink-soft">
                  Point Strivo at a different city, role, or industry — this replaces what it&apos;s picked up from
                  your memories or an earlier answer here.
                </p>
                <div className="mt-3 space-y-3">
                  <TextField label="City" placeholder="e.g. Bengaluru" value={prefCity} onChange={(e) => setPrefCity(e.target.value)} />
                  <TextField
                    label="Function / role"
                    placeholder="e.g. Product Manager"
                    value={prefFunction}
                    onChange={(e) => setPrefFunction(e.target.value)}
                  />
                  <TextField
                    label="Industry"
                    placeholder="e.g. Automotive"
                    value={prefIndustry}
                    onChange={(e) => setPrefIndustry(e.target.value)}
                  />
                </div>
                {prefsError && <p className="mt-2 text-[13px] text-red-600">{prefsError}</p>}
                <Button
                  className="mt-3 !py-2 !px-4 text-[13px]"
                  loading={savingPrefs}
                  disabled={!prefCity.trim() && !prefFunction.trim() && !prefIndustry.trim()}
                  onClick={async () => {
                    await savePreferences();
                    setShowEditPrefs(false);
                  }}
                >
                  Update my search
                </Button>
              </Card>
            )}
          </div>
        )}

        {!loading && !error && data?.personalized && visible.length === 0 && (
          <EmptyState
            icon={<Briefcase size={24} />}
            title="No opportunities yet"
            description="Strivo's job pool is still warming up, or nothing new matches your profile right now — check back soon."
          />
        )}

        {!loading &&
          data?.personalized &&
          visible.map((opp) => (
            <Card key={opp.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink leading-snug">{opp.title}</p>
                  <p className="mt-0.5 text-[13px] text-ink-soft">
                    {[
                      opp.company,
                      opp.location,
                      // Adzuna's own "created" timestamp (see lib/adzuna.ts),
                      // not a distinct posted-date field -- close enough for
                      // "how fresh is this listing" at a glance. Guarded
                      // against an unparseable/missing value rather than
                      // trusting every upstream row to have a clean ISO
                      // string.
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
