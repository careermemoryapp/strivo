"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Briefcase,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  MapPin,
  Clock3,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
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

// Icon + color per fit level -- strong keeps the brand-primary treatment
// (Strivo's own signature "top pick" color elsewhere in the app), good
// moved from an ad hoc amber to the shared --color-success token (green
// reads as unambiguously positive, where amber read more like a caution),
// and possible stays the neutral ink-soft grey it always was.
const FIT_CONFIG: Record<
  NonNullable<OpportunityCard["fit"]>,
  { label: string; icon: typeof Sparkles | null; badgeClass: string }
> = {
  strong: { label: "Strong fit", icon: Sparkles, badgeClass: "bg-brand-primary-soft text-brand-primary" },
  good: { label: "Good fit", icon: CheckCircle2, badgeClass: "bg-success/10 text-success" },
  possible: { label: "Worth exploring", icon: null, badgeClass: "bg-ink-soft/10 text-ink-soft" },
};

// Split out from the main list render so each card can track its own
// entrance-animation state -- see the `entered` comment below for why that
// turned out to matter. `onFeedback` is the parent's sendFeedback, passed
// through rather than duplicated here since the parent also owns
// feedbackGiven (it has to survive this one card re-sorting to a different
// position in the list, which a card-local state wouldn't).
//
// `feedback` used to be a boolean `reacting` that made the card fade out
// and get removed from the list entirely a moment after either button was
// tapped. Founder feedback after using it for real: the 5 test jobs in the
// pool were all genuinely relevant, and having a "Fit" tap make the card
// vanish just like a "Not a fit" tap did was actively wrong -- liking
// something shouldn't lose it. Tapping Not a fit shouldn't lose it either,
// just deprioritize it. So neither tap removes a card anymore; only a
// "not a fit" tap sinks it to the bottom of the list (see sortedVisible in
// the parent) and swaps its buttons for a static marker below, so it's
// still fully visible/readable (and still has an Apply link) but reads as
// "already judged, out of the way" rather than "gone."
function OpportunityCardItem({
  opp,
  index,
  feedback,
  onFeedback,
}: {
  opp: OpportunityCard;
  index: number;
  feedback: "relevant" | "not_for_me" | null;
  onFeedback: (jobId: string, feedback: "relevant" | "not_for_me") => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // One animation frame after mount, not the same tick -- so the browser
    // has actually painted the initial opacity-0/translate-y-2 state (see
    // phaseClass below) before this flips it to the shown state. Flipping
    // on the same tick risks the browser/React coalescing both states into
    // a single paint, which silently skips the transition altogether.
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Entrance only now -- built on a plain CSS *transition* (not the
  // globals.css `animate-fade-in-up` @keyframes animation this used
  // originally) so it can never lose a cascade-priority fight against
  // another class touching the same properties, the bug that motivated the
  // switch in the first place. `shown` flips true one animation frame
  // after mount (not the same tick -- see the effect above) so the browser
  // actually paints the initial hidden state before transitioning away
  // from it.
  //
  // There's no exit transition anymore -- see the comment above this
  // component for why a feedback tap no longer removes the card at all.
  // A "not a fit" tap does dim the card in place (below) once it's
  // resorted to the bottom of the list; that's a plain opacity/grayscale
  // swap on the same transition, not a separate animated phase.
  const fitCfg = opp.fit ? FIT_CONFIG[opp.fit] : null;
  const FitIcon = fitCfg?.icon ?? null;
  const isRecent = opp.postedDate && !isNaN(new Date(opp.postedDate).getTime());
  const dimmed = feedback === "not_for_me";
  const phaseClass = !shown
    ? "opacity-0 scale-100 translate-y-2 duration-500"
    : dimmed
      ? "opacity-60 scale-100 translate-y-0 duration-300"
      : "opacity-100 scale-100 translate-y-0 duration-500";

  return (
    <Card
      className={cn("transition-all ease-out", phaseClass, dimmed && "grayscale")}
      style={!shown ? { transitionDelay: `${Math.min(index, 8) * 60}ms` } : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-secondary-soft text-brand-secondary text-[16px] font-bold">
          {(opp.company?.trim()?.[0] ?? opp.title.trim()[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-semibold text-ink leading-snug">{opp.title}</p>
            {fitCfg && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  fitCfg.badgeClass
                )}
              >
                {FitIcon && <FitIcon size={12} />}
                {fitCfg.label}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-soft">
            {opp.company && <span className="font-medium">{opp.company}</span>}
            {opp.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} className="text-ink-faint" />
                {opp.location}
              </span>
            )}
            {isRecent && (
              <span className="inline-flex items-center gap-1">
                <Clock3 size={12} className="text-ink-faint" />
                {formatDistanceToNowStrict(new Date(opp.postedDate!), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>

      {opp.reason && <p className="mt-2.5 text-[13px] text-ink-soft leading-relaxed">{opp.reason}</p>}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        {/* Once feedback is given, the buttons are replaced by a static
            marker rather than staying clickable-but-disabled -- a direct
            founder ask, so a card that's been judged reads as settled
            (and can't be double-tapped) instead of looking broken. */}
        {feedback === "not_for_me" ? (
          <span className="flex items-center gap-1.5 rounded-pill bg-ink-soft/10 px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft">
            <ThumbsDown size={14} />
            Marked not a fit
          </span>
        ) : feedback === "relevant" ? (
          <span className="flex items-center gap-1.5 rounded-pill bg-success/10 px-3 py-1.5 text-[12.5px] font-semibold text-success">
            <ThumbsUp size={14} />
            Marked fit
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Fit"
              onClick={() => onFeedback(opp.id, "relevant")}
              className="flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition hover:border-success/40 hover:bg-success/10 hover:text-success active:scale-95"
            >
              <ThumbsUp size={14} />
              Fit
            </button>
            <button
              aria-label="Not a fit"
              onClick={() => onFeedback(opp.id, "not_for_me")}
              className="flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <ThumbsDown size={14} />
              Not a fit
            </button>
          </div>
        )}
        <a
          href={opp.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-input bg-gradient-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm active:scale-95 transition"
        >
          Apply <ExternalLink size={13} />
        </a>
      </div>
    </Card>
  );
}

export function OpportunitiesClient() {
  const router = useRouter();
  const user = useCurrentUser();
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Local, session-only record of which job a Fit/Not-a-fit tap was given
  // on and which way -- NOT a removal list. A card whose feedback is
  // "not_for_me" sinks to the bottom of the list (see sortedVisible below)
  // and renders dimmed; "relevant" just marks the card in place. Neither
  // removes it from view -- see the comment above OpportunityCardItem for
  // why that changed from the original "swipe to dismiss" design.
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "relevant" | "not_for_me">>({});

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

  function sendFeedback(jobId: string, feedback: "relevant" | "not_for_me") {
    setFeedbackGiven((prev) => ({ ...prev, [jobId]: feedback }));
    // Fire-and-forget, not awaited -- the card's own marker/re-sort above
    // is purely local state, not gated on this request completing.
    fetch(`/api/opportunities/${jobId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    }).catch(() => {
      // Best-effort -- the local marker/re-sort applies either way, and a
      // failed feedback write just means this one job doesn't get excluded
      // from a future ranking pass. Not worth surfacing an error for a
      // thumbs-up/down tap.
    });
  }

  const visible = data?.opportunities ?? [];
  // A "not a fit" tap deprioritizes rather than removes (see feedbackGiven
  // above) -- sink those to the end of the list, everything else keeps its
  // original rank order. Array.prototype.sort is stable in the JS engines
  // this app ships to, so cards within each group (sunk vs. not) keep their
  // relative order rather than jumping around on every tap.
  const sortedVisible = [...visible].sort((a, b) => {
    const aSunk = feedbackGiven[a.id] === "not_for_me" ? 1 : 0;
    const bSunk = feedbackGiven[b.id] === "not_for_me" ? 1 : 0;
    return aSunk - bSunk;
  });

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
          sortedVisible.map((opp, i) => (
            <OpportunityCardItem
              key={opp.id}
              opp={opp}
              index={i}
              feedback={feedbackGiven[opp.id] ?? null}
              onFeedback={sendFeedback}
            />
          ))}
      </div>
    </div>
  );
}
