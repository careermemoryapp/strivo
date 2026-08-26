"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Send,
  Search,
  Activity,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Newspaper,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import type { AdminMetrics, AdminUserRow } from "@/lib/repo/admin";
import type { Nudge } from "@/lib/repo/nudges";
import type { NudgeSegment } from "@/lib/repo/pushTokens";
import type { EmailSegment, EmailCampaign } from "@/lib/repo/emailCampaigns";
import type { EmailTemplate } from "@/lib/repo/emailTemplates";
// Pure string-rendering helpers, no server-only imports (no db, no crypto) --
// safe to run client-side so the composer can show an exact live preview
// without a round trip to the server or an actual test send.
import { renderMarkdownLiteToHtml, wrapBrandedEmail, personalize } from "@/lib/emailTemplate";
import type { SentryIssue } from "@/lib/sentry";
import type { SecurityCheck, DependencyAuditSummary } from "@/lib/securityStatus";
import type { LiveSecurityStatus } from "@/lib/liveSecurityStatus";
import type { BlogPost } from "@/lib/repo/blogPosts";

const DARK = "#26213c";

// Appends " · Yearly" / " · Monthly" to a status badge, regardless of
// whether the user is on trial, expired, or already paid -- so the admin
// can see which plan someone chose (or would convert to) even after their
// trial has run out, not just once they're a paying customer.
function planSuffix(plan: "monthly" | "annual" | "later" | null): string {
  if (!plan) return "";
  if (plan === "later") return " · Deciding";
  return ` · ${plan === "annual" ? "Yearly" : "Monthly"}`;
}

const SEGMENT_OPTIONS: { value: NudgeSegment; label: string; hint: string }[] = [
  { value: "all", label: "Everyone", hint: "Every registered device" },
  {
    value: "recent_missed_today",
    label: "Missed today",
    hint: "Opened in the last 3 days, but not yet today",
  },
  { value: "inactive", label: "Haven't opened in a while", hint: "No open in 7+ days (or never)" },
];

function segmentLabel(segment: NudgeSegment): string {
  return SEGMENT_OPTIONS.find((s) => s.value === segment)?.label ?? "Everyone";
}

// "expired" is doing double duty as the closest available proxy for
// "cancelled" until real Play Billing cancellation webhooks exist (see
// repo/emailCampaigns.ts's comment on EmailSegment) -- labeled "Trial
// ended" here rather than "Cancelled" so the admin isn't misled into
// thinking this is tracking real cancellations yet.
const EMAIL_SEGMENT_OPTIONS: { value: EmailSegment; label: string; hint: string }[] = [
  { value: "all", label: "Everyone", hint: "Every registered user" },
  { value: "trial", label: "On free trial", hint: "Trial hasn't ended" },
  { value: "paid_monthly", label: "Paid · Monthly", hint: "Active, reserved monthly" },
  { value: "paid_annual", label: "Paid · Yearly", hint: "Active, reserved yearly" },
  { value: "expired", label: "Trial ended", hint: "Ran out, never converted" },
  { value: "decide_later", label: "Chose: decide later", hint: "Picked 'I'll choose later' at signup" },
];

function emailSegmentLabel(segment: EmailSegment): string {
  return EMAIL_SEGMENT_OPTIONS.find((s) => s.value === segment)?.label ?? "Everyone";
}

// Preset swatches for the accent-color picker -- keeps the composer from
// needing a full color-picker widget while still covering the common
// cases (brand purple default, plus a few others for promos/alerts). The
// hex input next to the swatches covers anything outside this set.
const ACCENT_SWATCHES = ["#8b5cf6", "#60a5fa", "#f97316", "#10b981", "#ef4444", "#0ea5e9"];
const DEFAULT_ACCENT_COLOR = "#8b5cf6";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

type AdminHealth = {
  status: "ok" | "degraded";
  database: { ok: boolean; responseMs: number };
  process: {
    pm2InstanceId: string | null;
    uptimeSeconds: number;
    nodeVersion: string;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
  };
  checkedAt: string;
};

// Simple day-by-day bar chart, no charting library — keeps this a pure web
// deploy with zero new npm dependencies. The most recent bar is highlighted
// with the brand gradient, older bars are a flat muted tint.
function BarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const barWidth = 26;
  const gap = 8;
  const height = 84;
  const width = data.length * (barWidth + gap) - gap;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const h = Math.max(3, (d.count / max) * height);
        const isLast = i === data.length - 1;
        return (
          <rect
            key={d.date}
            x={i * (barWidth + gap)}
            y={height - h}
            width={barWidth}
            height={h}
            rx={4}
            fill={isLast ? "url(#barGradient)" : "#ece5f5"}
          />
        );
      })}
    </svg>
  );
}

// Classic SVG donut trick: a circle with radius 15.91549430918952 has a
// circumference of exactly 100, so each segment's dasharray can just be its
// raw percentage — no circumference math needed per segment.
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 15.91549430918952;
  let cumulative = 0;
  return (
    <svg width={104} height={104} viewBox="0 0 42 42" role="img" aria-label="Subscription breakdown">
      <circle cx="21" cy="21" r={r} fill="transparent" stroke="#f3f0fa" strokeWidth="6" />
      {total > 0 &&
        segments.map((s) => {
          const segPct = (s.value / total) * 100;
          const dashoffset = 25 - cumulative;
          cumulative += segPct;
          return (
            <circle
              key={s.label}
              cx="21"
              cy="21"
              r={r}
              fill="transparent"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={`${segPct} ${100 - segPct}`}
              strokeDashoffset={dashoffset}
            />
          );
        })}
      <text x="21" y="24" textAnchor="middle" fontSize="7" fontWeight="700" fill="#26213c">
        {total}
      </text>
    </svg>
  );
}

function ProgressRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-[#8a82a8]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-[7px] rounded-full bg-[#f3f0fa]">
        <div
          className="h-[7px] rounded-full"
          style={{ width: `${width}%`, background: "linear-gradient(90deg,#a78bfa,#60a5fa)" }}
        />
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
      <p className="mb-3 text-[12px] font-semibold text-[#3c3650]">{title}</p>
      {children}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [recentNudges, setRecentNudges] = useState<Nudge[]>([]);
  const [nudgeTitle, setNudgeTitle] = useState("");
  const [nudgeMessage, setNudgeMessage] = useState("");
  const [nudgeSegment, setNudgeSegment] = useState<NudgeSegment>("all");
  const [audienceCounts, setAudienceCounts] = useState<Record<NudgeSegment, number> | null>(null);
  const [sendingNudge, setSendingNudge] = useState(false);
  const [recentCampaigns, setRecentCampaigns] = useState<EmailCampaign[]>([]);
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignSegment, setCampaignSegment] = useState<EmailSegment>("all");
  const [campaignAudienceCounts, setCampaignAudienceCounts] = useState<Record<EmailSegment, number> | null>(null);
  const [campaignSesReady, setCampaignSesReady] = useState(true);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [campaignBannerUrl, setCampaignBannerUrl] = useState("");
  const [campaignButtonText, setCampaignButtonText] = useState("");
  const [campaignButtonUrl, setCampaignButtonUrl] = useState("");
  const [campaignAccentColor, setCampaignAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [showSaveTemplateInput, setShowSaveTemplateInput] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateActionId, setTemplateActionId] = useState<string | null>(null);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [sentryIssues, setSentryIssues] = useState<SentryIssue[] | null>(null);
  const [sentryConfigured, setSentryConfigured] = useState(true);
  const [sentryError, setSentryError] = useState(false);
  const [securityChecklist, setSecurityChecklist] = useState<SecurityCheck[] | null>(null);
  const [dependencyAudit, setDependencyAudit] = useState<DependencyAuditSummary | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const [liveSecurityStatus, setLiveSecurityStatus] = useState<LiveSecurityStatus | null | undefined>(undefined);
  const [liveSecurityError, setLiveSecurityError] = useState(false);
  const [blogPosts, setBlogPosts] = useState<BlogPost[] | null>(null);
  const [blogError, setBlogError] = useState(false);

  const handleUnauthorized = useCallback(() => {
    router.replace("/admin/login");
  }, [router]);

  const loadMetrics = useCallback(async () => {
    const res = await fetch("/api/admin/metrics");
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) return setError("Couldn't load metrics.");
    const data = await res.json();
    setMetrics(data.metrics);
  }, [handleUnauthorized]);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/health");
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) return setHealthError(true);
      setHealth(await res.json());
      setHealthError(false);
    } catch {
      setHealthError(true);
    }
  }, [handleUnauthorized]);

  const loadSentryIssues = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sentry-errors");
      if (res.status === 401) return handleUnauthorized();
      const data = await res.json().catch(() => null);
      if (!data) return setSentryError(true);
      setSentryConfigured(data.configured ?? false);
      setSentryIssues(data.issues ?? []);
      setSentryError(!res.ok);
    } catch {
      setSentryError(true);
    }
  }, [handleUnauthorized]);

  const loadSecurityStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/security-status");
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) return setSecurityError(true);
      const data = await res.json();
      setSecurityChecklist(data.checklist ?? []);
      setDependencyAudit(data.dependencyAudit ?? null);
      setSecurityError(false);
    } catch {
      setSecurityError(true);
    }
  }, [handleUnauthorized]);

  const loadLiveSecurityStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live-security-status");
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) return setLiveSecurityError(true);
      const data = await res.json();
      setLiveSecurityStatus(data.liveStatus ?? null);
      setLiveSecurityError(false);
    } catch {
      setLiveSecurityError(true);
    }
  }, [handleUnauthorized]);

  const loadBlogPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blog");
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) return setBlogError(true);
      const data = await res.json();
      setBlogPosts(data.posts ?? []);
      setBlogError(false);
    } catch {
      setBlogError(true);
    }
  }, [handleUnauthorized]);

  const loadNudge = useCallback(async () => {
    const res = await fetch("/api/admin/nudge");
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) return;
    const data = await res.json();
    setRecentNudges(data.recent ?? []);
    setAudienceCounts(data.audienceCounts ?? null);
  }, [handleUnauthorized]);

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/api/admin/email-campaign");
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) return;
    const data = await res.json();
    setRecentCampaigns(data.recent ?? []);
    setCampaignAudienceCounts(data.audienceCounts ?? null);
    setCampaignSesReady(data.sesConfigured ?? false);
  }, [handleUnauthorized]);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/admin/email-templates");
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) return;
    const data = await res.json();
    setEmailTemplates(data.templates ?? []);
  }, [handleUnauthorized]);

  const loadUsers = useCallback(
    async (term: string) => {
      const params = term ? `?search=${encodeURIComponent(term)}` : "";
      const res = await fetch(`/api/admin/users${params}`);
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users);
    },
    [handleUnauthorized]
  );

  useEffect(() => {
    // Initial auth-gated fetch on mount, not a render loop.
    /* eslint-disable react-hooks/set-state-in-effect */
    Promise.all([
      loadMetrics(),
      loadNudge(),
      loadCampaigns(),
      loadTemplates(),
      loadUsers(""),
      loadHealth(),
      loadSentryIssues(),
      loadSecurityStatus(),
      loadLiveSecurityStatus(),
      loadBlogPosts(),
    ]).finally(() => setCheckedAuth(true));
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Keep the health card live without needing a manual refresh -- cheap
  // single-row SQLite query, so polling every 30s is not a real cost.
  useEffect(() => {
    const interval = setInterval(loadHealth, 30_000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  // Errors don't need second-by-second freshness -- once a minute is
  // plenty and keeps this from hammering Sentry's API.
  useEffect(() => {
    const interval = setInterval(loadSentryIssues, 60_000);
    return () => clearInterval(interval);
  }, [loadSentryIssues]);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(search), 250);
    return () => clearTimeout(t);
  }, [search, loadUsers]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  async function handleSendNudge(e: FormEvent) {
    e.preventDefault();
    if (!nudgeTitle.trim() || !nudgeMessage.trim()) return;
    setSendingNudge(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nudgeTitle.trim(), message: nudgeMessage.trim(), segment: nudgeSegment }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't send that nudge.");
        return;
      }
      setNudgeTitle("");
      setNudgeMessage("");
      setNudgeSegment("all");
      await loadNudge();
    } finally {
      setSendingNudge(false);
    }
  }

  // Two-tap send: the first submit just flips confirmingSend to true and
  // relabels the button with the real recipient count, so the admin can't
  // fire off a broadcast to everyone with one accidental click. Any edit to
  // subject/body/segment resets confirmingSend back to false (see the
  // onChange handlers below) so a stale confirmation can't carry over to a
  // message the admin has since changed.
  async function handleSendCampaign(e: FormEvent) {
    e.preventDefault();
    if (!campaignSubject.trim() || !campaignBody.trim()) return;
    if (!confirmingSend) {
      setConfirmingSend(true);
      return;
    }
    setSendingCampaign(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: campaignSubject.trim(),
          bodyMarkdown: campaignBody.trim(),
          segment: campaignSegment,
          bannerImageUrl: campaignBannerUrl.trim(),
          buttonText: campaignButtonText.trim(),
          buttonUrl: campaignButtonUrl.trim(),
          accentColor: campaignAccentColor.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't send that campaign.");
        return;
      }
      setCampaignSubject("");
      setCampaignBody("");
      setCampaignSegment("all");
      setCampaignBannerUrl("");
      setCampaignButtonText("");
      setCampaignButtonUrl("");
      setCampaignAccentColor(DEFAULT_ACCENT_COLOR);
      setTestStatus(null);
      setShowSaveTemplateInput(false);
      await loadCampaigns();
    } finally {
      setSendingCampaign(false);
      setConfirmingSend(false);
    }
  }

  async function handleSendTestCampaign() {
    if (!testEmail.trim() || !campaignSubject.trim() || !campaignBody.trim()) return;
    setSendingTest(true);
    setTestStatus(null);
    try {
      const res = await fetch("/api/admin/email-campaign/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: testEmail.trim(),
          subject: campaignSubject.trim(),
          bodyMarkdown: campaignBody.trim(),
          bannerImageUrl: campaignBannerUrl.trim(),
          buttonText: campaignButtonText.trim(),
          buttonUrl: campaignButtonUrl.trim(),
          accentColor: campaignAccentColor.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setTestStatus(res.ok ? `Test sent to ${testEmail.trim()}.` : (data.error ?? "Test send failed."));
    } catch {
      setTestStatus("Test send failed.");
    } finally {
      setSendingTest(false);
    }
  }

  // Populates every composer field from a saved/starter template. Doesn't
  // send or save anything -- just a fast way to start from something
  // written before instead of a blank subject/body.
  function handleLoadTemplate(t: EmailTemplate) {
    setCampaignSubject(t.subject);
    setCampaignBody(t.body);
    setCampaignBannerUrl(t.banner_image_url ?? "");
    setCampaignButtonText(t.button_text ?? "");
    setCampaignButtonUrl(t.button_url ?? "");
    setCampaignAccentColor(t.accent_color ?? DEFAULT_ACCENT_COLOR);
    setConfirmingSend(false);
    setTestStatus(null);
  }

  async function handleSaveTemplate() {
    if (!newTemplateName.trim() || !campaignSubject.trim() || !campaignBody.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          subject: campaignSubject.trim(),
          body: campaignBody.trim(),
          bannerImageUrl: campaignBannerUrl.trim(),
          buttonText: campaignButtonText.trim(),
          buttonUrl: campaignButtonUrl.trim(),
          accentColor: campaignAccentColor.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save that template.");
        return;
      }
      setNewTemplateName("");
      setShowSaveTemplateInput(false);
      await loadTemplates();
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    setTemplateActionId(id);
    try {
      const res = await fetch(`/api/admin/email-templates/${id}`, { method: "DELETE" });
      if (res.ok) await loadTemplates();
    } finally {
      setTemplateActionId(null);
    }
  }

  async function handleSetStatus(userId: string, status: "trial" | "active", plan?: "monthly" | "annual") {
    setUserActionId(userId);
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan ? { status, plan } : { status }),
      });
      await Promise.all([loadUsers(search), loadMetrics()]);
    } finally {
      setUserActionId(null);
    }
  }

  // Renders the exact same HTML the recipient will get, using a fake
  // "there" firstName and a placeholder unsubscribe link (a real one needs
  // a signed per-user token, which is server-only -- see emailUnsubscribe.ts
  // -- but the footer text/styling looks identical either way). Recomputes
  // on every keystroke since it's just string templating, no network call.
  const emailPreviewHtml = useMemo(() => {
    const bodyMarkdown = personalize(campaignBody || "_Your message will appear here._", "there");
    return wrapBrandedEmail({
      bodyHtml: renderMarkdownLiteToHtml(bodyMarkdown),
      unsubscribeUrl: "https://strivo.ai/api/email/unsubscribe?t=preview",
      accentColor: campaignAccentColor,
      bannerImageUrl: campaignBannerUrl,
      buttonText: campaignButtonText,
      buttonUrl: campaignButtonUrl,
    });
  }, [campaignBody, campaignAccentColor, campaignBannerUrl, campaignButtonText, campaignButtonUrl]);
  const emailPreviewSubject = personalize(campaignSubject || "(no subject yet)", "there");

  if (!checkedAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <div className="relative overflow-hidden px-5 pb-6 pt-6 sm:px-8" style={{ background: DARK }}>
        <div
          className="pointer-events-none absolute right-4 top-16 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-2 top-24 h-28 w-28 rounded-full bg-brand-secondary/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <div>
              <p className="text-[16px] font-bold tracking-tight text-white">Strivo Admin</p>
              <p className="text-[11px] text-white/50">Metrics, nudges, and users</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-pill border border-white/15 bg-white/8 px-3.5 py-2 text-xs font-semibold text-white/85"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 pt-6 sm:px-8">
        {error && (
          <div className="mb-5">
            <ErrorBanner message={error} />
          </div>
        )}

        <section className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">System health</p>
          <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
            {healthError || (health && health.status !== "ok") ? (
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-red-600">
                  {healthError ? "Couldn't reach the health check." : "Database unreachable — investigate now."}
                </p>
              </div>
            ) : !health ? (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-ink">All systems normal</p>
                  <Activity size={13} className="text-[#a8a2bd]" />
                  <p className="text-[11px] text-ink-faint">
                    checked {new Date(health.checkedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Database" value={`${health.database.responseMs}ms`} hint="Query response time" />
                  <StatCard
                    label="Server uptime"
                    value={formatUptime(health.process.uptimeSeconds)}
                    hint={health.process.pm2InstanceId !== null ? `Worker #${health.process.pm2InstanceId}` : undefined}
                  />
                  <StatCard
                    label="Memory used"
                    value={`${health.process.memoryMb.heapUsed}MB`}
                    hint={`of ${health.process.memoryMb.heapTotal}MB heap`}
                  />
                  <StatCard label="Node version" value={health.process.nodeVersion} />
                </div>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Refreshes automatically every 30s. Public, minimal version at{" "}
            <code className="text-[10.5px]">/api/health</code> for external uptime monitors.
          </p>
        </section>

        <section className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Errors (Sentry)</p>
          <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
            {!sentryConfigured ? (
              <p className="text-sm text-ink-soft">
                Not set up yet — add a <code className="text-[12px]">SENTRY_API_TOKEN</code> environment variable to
                show unresolved errors here.
              </p>
            ) : sentryError ? (
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-red-600">Couldn&apos;t reach Sentry.</p>
              </div>
            ) : !sentryIssues ? (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            ) : sentryIssues.length === 0 ? (
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink">No unresolved errors</p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                  <p className="text-sm font-semibold text-ink">
                    {sentryIssues.length} unresolved error{sentryIssues.length === 1 ? "" : "s"}
                  </p>
                  <AlertTriangle size={13} className="text-[#a8a2bd]" />
                </div>
                <div className="space-y-2">
                  {sentryIssues.map((issue) => (
                    <a
                      key={issue.id}
                      href={issue.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-[#f5f2fa] p-2.5 hover:border-[#ece5f5]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{issue.title}</p>
                        <p className="truncate text-[11px] text-ink-faint">
                          {issue.culprit ?? "—"} · last seen{" "}
                          {formatDistanceToNow(new Date(issue.lastSeen), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-pill bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-600 whitespace-nowrap">
                          {issue.count}×
                        </span>
                        <ExternalLink size={12} className="text-[#a8a2bd]" />
                      </div>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Refreshes automatically every 60s. Shows unresolved issues from the last 24h, most frequent first.
          </p>
        </section>

        <section className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Security status</p>
          <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
            {securityError ? (
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-red-600">Couldn&apos;t load security status.</p>
              </div>
            ) : !securityChecklist ? (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {securityChecklist.map((check) => (
                    <div key={check.id} className="flex items-start gap-2.5 rounded-[12px] border border-[#f5f2fa] p-2.5">
                      {check.status === "protected" ? (
                        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      ) : (
                        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-ink">{check.label}</p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t border-[#f5f2fa] pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                    Dependency vulnerabilities
                  </p>
                  {!dependencyAudit ? (
                    <p className="text-sm text-ink-soft">
                      Not scanned yet — this fills in automatically the next time a deploy runs.
                    </p>
                  ) : dependencyAudit.totals.total === 0 ? (
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      <p className="text-sm font-semibold text-ink">No known vulnerabilities</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {dependencyAudit.totals.critical > 0 && (
                          <span className="rounded-pill bg-red-100 px-2 py-0.5 text-[10.5px] font-semibold text-red-700">
                            {dependencyAudit.totals.critical} critical
                          </span>
                        )}
                        {dependencyAudit.totals.high > 0 && (
                          <span className="rounded-pill bg-red-50 px-2 py-0.5 text-[10.5px] font-semibold text-red-600">
                            {dependencyAudit.totals.high} high
                          </span>
                        )}
                        {dependencyAudit.totals.moderate > 0 && (
                          <span className="rounded-pill bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-600">
                            {dependencyAudit.totals.moderate} moderate
                          </span>
                        )}
                        {dependencyAudit.totals.low > 0 && (
                          <span className="rounded-pill bg-[#f2effa] px-2 py-0.5 text-[10.5px] font-semibold text-[#8b5cf6]">
                            {dependencyAudit.totals.low} low
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dependencyAudit.vulnerablePackages.map((pkg) => (
                          <p key={pkg.name} className="text-[12px] text-ink-soft">
                            <span className="font-medium text-ink">{pkg.name}</span> — {pkg.severity}
                            {!pkg.fixAvailable && <span className="text-ink-faint"> (no fix available yet)</span>}
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                  {dependencyAudit && (
                    <p className="mt-2 text-[11px] text-ink-faint">
                      Last scanned {formatDistanceToNow(new Date(dependencyAudit.scannedAt), { addSuffix: true })}, via{" "}
                      <code className="text-[10.5px]">npm audit</code> at deploy time.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Live security checks</p>
          <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
            {liveSecurityError ? (
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-red-600">Couldn&apos;t load live security checks.</p>
              </div>
            ) : liveSecurityStatus === undefined ? (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            ) : liveSecurityStatus === null ? (
              <p className="text-sm text-ink-soft">
                Not checked yet — run <code className="text-[11px]">node scripts/live-security-check.js</code> on the server (or wait
                for the scheduled cron run) to see live results here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {liveSecurityStatus.checks.map((check) => (
                    <div key={check.id} className="flex items-start gap-2.5 rounded-[12px] border border-[#f5f2fa] p-2.5">
                      {check.status === "pass" ? (
                        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                      ) : check.status === "warn" ? (
                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                      ) : (
                        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-ink">{check.label}</p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 border-t border-[#f5f2fa] pt-3 text-[11px] text-ink-faint">
                  Checked against <code className="text-[10.5px]">{liveSecurityStatus.baseUrl}</code>{" "}
                  {formatDistanceToNow(new Date(liveSecurityStatus.checkedAt), { addSuffix: true })}. Unlike the checklist above (which
                  reflects what&apos;s built into the code), these actually hit the live site.
                </p>
              </>
            )}
          </div>
        </section>


        <section className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Recent blog posts</p>
          <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
            {blogError ? (
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-red-600">Couldn&apos;t load blog posts.</p>
              </div>
            ) : !blogPosts ? (
              <div className="flex justify-center py-2">
                <Spinner />
              </div>
            ) : blogPosts.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing published yet.</p>
            ) : (
              <div className="space-y-2">
                {blogPosts.map((p) => (
                  <a
                    key={p.id}
                    href={`/blog/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-[#f5f2fa] p-2.5 hover:border-[#ece5f5]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Newspaper size={14} className="shrink-0 text-[#a8a2bd]" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{p.title}</p>
                        <p className="truncate text-[11px] text-ink-faint">
                          {p.category} · {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <ExternalLink size={12} className="shrink-0 text-[#a8a2bd]" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Published by the daily writing automation. Most recent 10, newest first.
          </p>
        </section>

        {!metrics ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <>
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                Growth (signups — proxy for installs until Play Console is connected)
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total signups" value={String(metrics.totalUsers)} />
                <StatCard label="New today" value={String(metrics.newUsersToday)} />
                <StatCard label="New this week" value={String(metrics.newUsersThisWeek)} />
                <StatCard label="New this month" value={String(metrics.newUsersThisMonth)} />
              </div>
              <div className="mt-3">
                <ChartCard title="Signups — last 14 days">
                  <BarChart data={metrics.dailySignups} />
                </ChartCard>
              </div>
            </section>

            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Subscriptions</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
                <div className="rounded-[16px] border border-[#f0ecf7] bg-surface p-4">
                  <div className="flex items-center gap-5">
                    <DonutChart
                      segments={[
                        { label: "Trial", value: metrics.statusCounts.trial, color: "#f59e0b" },
                        { label: "Paid", value: metrics.statusCounts.active, color: "#8b5cf6" },
                        { label: "Expired", value: metrics.statusCounts.expired, color: "#ef4444" },
                      ]}
                    />
                    <div className="flex flex-col gap-2 text-[12.5px] text-ink-soft">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Trial · {metrics.statusCounts.trial}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" /> Paid · {metrics.statusCounts.active}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Expired · {metrics.statusCounts.expired}
                      </div>
                    </div>
                  </div>
                </div>
                <StatCard
                  label="Trial → paid rate"
                  value={metrics.conversionRate === null ? "—" : pct(metrics.conversionRate)}
                  hint="Active ÷ (active + expired)"
                />
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                Real payments aren&apos;t live yet (Google Play Billing isn&apos;t wired up), so &quot;Paid&quot;
                only reflects accounts you&apos;ve manually marked active below.
              </p>
            </section>

            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Engagement</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Memories captured" value={String(metrics.totalMemories)} />
                <StatCard label="Chats started" value={String(metrics.totalChats)} />
                <StatCard label="Avg memories / user" value={metrics.avgMemoriesPerUser.toFixed(1)} />
                <StatCard
                  label="Active users"
                  value={`${metrics.activeUsers.daily} / ${metrics.activeUsers.weekly} / ${metrics.activeUsers.monthly}`}
                  hint="Daily / weekly / monthly"
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ChartCard title="Memories captured — last 14 days">
                  <BarChart data={metrics.dailyMemories} />
                </ChartCard>
                <ChartCard title="How memories are captured">
                  <div className="flex flex-col gap-2.5">
                    <ProgressRow
                      label="Voice"
                      value={metrics.memorySourceBreakdown.voice}
                      max={metrics.totalMemories}
                    />
                    <ProgressRow label="Text" value={metrics.memorySourceBreakdown.text} max={metrics.totalMemories} />
                    <ProgressRow
                      label="File upload"
                      value={metrics.memorySourceBreakdown.file}
                      max={metrics.totalMemories}
                    />
                  </div>
                </ChartCard>
                <ChartCard title="Top memory categories">
                  {metrics.topCategories.length === 0 ? (
                    <p className="text-[12px] text-ink-faint">No memories yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {metrics.topCategories.map((c) => (
                        <ProgressRow
                          key={c.category}
                          label={c.category}
                          value={c.count}
                          max={metrics.topCategories[0].count}
                        />
                      ))}
                    </div>
                  )}
                </ChartCard>
              </div>
            </section>

            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Retention</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Recorded in last 7d"
                  value={pct(metrics.recordedLast7dRate)}
                  hint="Of all signups"
                />
                <StatCard
                  label="Never recorded"
                  value={String(metrics.zeroMemoryUsers)}
                  hint="Signed up, zero memories"
                />
                <StatCard
                  label="Push registered"
                  value={String(metrics.registeredDevices)}
                  hint="Devices reachable by push"
                />
              </div>
            </section>

            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                Nudge people to record
              </p>
              <div className="rounded-[16px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-4">
                <form onSubmit={handleSendNudge} className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Headline — the bold line
                    </label>
                    <input
                      value={nudgeTitle}
                      onChange={(e) => setNudgeTitle(e.target.value)}
                      placeholder="e.g. Haven't recorded in a while?"
                      maxLength={60}
                      className="w-full rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Subline — the line underneath
                    </label>
                    <textarea
                      value={nudgeMessage}
                      onChange={(e) => setNudgeMessage(e.target.value)}
                      placeholder="e.g. Capture today's win in 60 seconds."
                      maxLength={300}
                      rows={2}
                      className="w-full resize-none rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Who gets this
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {SEGMENT_OPTIONS.map((opt) => {
                        const selected = nudgeSegment === opt.value;
                        const count = audienceCounts?.[opt.value];
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setNudgeSegment(opt.value)}
                            className={cn(
                              "rounded-[12px] border p-2.5 text-left transition-colors",
                              selected ? "border-[#a78bfa] bg-surface" : "border-[#ece5f5] bg-surface/60"
                            )}
                          >
                            <p className={cn("text-[12.5px] font-semibold", selected ? "text-[#7c3aed]" : "text-ink")}>
                              {opt.label}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-ink-faint">{opt.hint}</p>
                            <p className="mt-1 text-[11px] font-medium text-[#8a82a8]">
                              {count === undefined ? "…" : `${count} device${count === 1 ? "" : "s"}`}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={!nudgeTitle.trim() || !nudgeMessage.trim() || sendingNudge}
                    className="flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                  >
                    {sendingNudge ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : <Send size={14} />}
                    Send push notification
                  </button>
                </form>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                Sends a real notification-bar push to whichever audience you pick above ({metrics.registeredDevices}{" "}
                devices registered in total). Tapping it opens the Record page directly. Phones on an older app
                version (before notifications were built in) won&apos;t receive anything regardless of audience.
              </p>
            </section>

            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                Email campaigns
              </p>
              {!campaignSesReady && (
                <div className="mb-2 flex items-center gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-700">
                  <AlertTriangle size={14} className="shrink-0" />
                  SES isn&apos;t configured yet (missing AWS credentials) — sends will fail until that&apos;s set up.
                </div>
              )}
              {emailTemplates.length > 0 && (
                <div className="mb-2">
                  <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                    Templates — click to load into the composer below
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {emailTemplates.map((t) => (
                      <div
                        key={t.id}
                        className="group relative flex shrink-0 flex-col items-start rounded-[12px] border border-[#ece5f5] bg-surface px-3 py-2"
                      >
                        <button type="button" onClick={() => handleLoadTemplate(t)} className="text-left">
                          <span
                            className="mb-1 block h-1.5 w-8 rounded-full"
                            style={{ backgroundColor: t.accent_color ?? DEFAULT_ACCENT_COLOR }}
                          />
                          <p className="max-w-[180px] truncate text-[12px] font-semibold text-ink">{t.name}</p>
                          <p className="max-w-[180px] truncate text-[10.5px] text-ink-faint">{t.subject}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(t.id)}
                          disabled={templateActionId === t.id}
                          className="absolute right-1.5 top-1.5 text-[10px] text-ink-faint opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
                          title="Delete template"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-[16px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-4">
                <form onSubmit={handleSendCampaign} className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Subject
                    </label>
                    <input
                      value={campaignSubject}
                      onChange={(e) => {
                        setCampaignSubject(e.target.value);
                        setConfirmingSend(false);
                      }}
                      placeholder="e.g. What's new in Strivo this month"
                      maxLength={150}
                      className="w-full rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Message
                    </label>
                    <textarea
                      value={campaignBody}
                      onChange={(e) => {
                        setCampaignBody(e.target.value);
                        setConfirmingSend(false);
                      }}
                      placeholder={
                        "Hi {{firstName}},\n\nWrite your message here. **Bold** and [links](https://strivo.ai) both work — leave a blank line between paragraphs."
                      }
                      maxLength={10000}
                      rows={6}
                      className="w-full resize-none rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                    />
                    <p className="mt-1 text-[10.5px] text-ink-faint">
                      <code>{"{{firstName}}"}</code> personalizes per recipient, <code>**bold**</code> and{" "}
                      <code>[text](https://...)</code> both render. Every send gets an unsubscribe footer
                      automatically.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Who gets this
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {EMAIL_SEGMENT_OPTIONS.map((opt) => {
                        const selected = campaignSegment === opt.value;
                        const count = campaignAudienceCounts?.[opt.value];
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setCampaignSegment(opt.value);
                              setConfirmingSend(false);
                            }}
                            className={cn(
                              "rounded-[12px] border p-2.5 text-left transition-colors",
                              selected ? "border-[#a78bfa] bg-surface" : "border-[#ece5f5] bg-surface/60"
                            )}
                          >
                            <p className={cn("text-[12.5px] font-semibold", selected ? "text-[#7c3aed]" : "text-ink")}>
                              {opt.label}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-ink-faint">{opt.hint}</p>
                            <p className="mt-1 text-[11px] font-medium text-[#8a82a8]">
                              {count === undefined ? "…" : `${count} recipient${count === 1 ? "" : "s"}`}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[10.5px] text-ink-faint">
                      No real &quot;cancelled&quot; segment yet — that needs Google Play cancellation webhooks,
                      which aren&apos;t wired up. &quot;Trial ended&quot; is the closest signal available today.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 border-t border-[#ece5f5] pt-2.5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                        Banner image (optional)
                      </label>
                      <input
                        value={campaignBannerUrl}
                        onChange={(e) => {
                          setCampaignBannerUrl(e.target.value);
                          setConfirmingSend(false);
                        }}
                        placeholder="https://... image URL, shown at the top"
                        className="w-full rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                          Button text (optional)
                        </label>
                        <input
                          value={campaignButtonText}
                          onChange={(e) => {
                            setCampaignButtonText(e.target.value);
                            setConfirmingSend(false);
                          }}
                          placeholder="e.g. Open Strivo"
                          maxLength={40}
                          className="w-full rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                          Button link
                        </label>
                        <input
                          value={campaignButtonUrl}
                          onChange={(e) => {
                            setCampaignButtonUrl(e.target.value);
                            setConfirmingSend(false);
                          }}
                          placeholder="https://strivo.ai/..."
                          className="w-full rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Accent color
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {ACCENT_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setCampaignAccentColor(c);
                            setConfirmingSend(false);
                          }}
                          className={cn(
                            "h-7 w-7 rounded-full border-2 transition-transform",
                            campaignAccentColor.toLowerCase() === c ? "scale-110 border-ink" : "border-transparent"
                          )}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                      <input
                        value={campaignAccentColor}
                        onChange={(e) => {
                          setCampaignAccentColor(e.target.value);
                          setConfirmingSend(false);
                        }}
                        placeholder="#8b5cf6"
                        maxLength={7}
                        className="w-24 rounded-pill border border-[#ece5f5] bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[#ece5f5] pt-2.5">
                    <input
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="you@email.com"
                      className="w-52 rounded-pill border border-[#ece5f5] bg-surface px-3.5 py-2 text-xs text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa]"
                    />
                    <button
                      type="button"
                      onClick={handleSendTestCampaign}
                      disabled={!testEmail.trim() || !campaignSubject.trim() || !campaignBody.trim() || sendingTest}
                      className="whitespace-nowrap rounded-pill border border-[#ece5f5] bg-surface px-3.5 py-2 text-xs font-semibold text-ink-soft disabled:opacity-50"
                    >
                      {sendingTest ? "Sending…" : "Send test to this address"}
                    </button>
                    {testStatus && <p className="text-[11px] text-ink-faint">{testStatus}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEmailPreview((v) => !v)}
                      className="text-xs font-semibold text-[#8b5cf6]"
                    >
                      {showEmailPreview ? "Hide preview" : "Preview email"}
                    </button>
                    <span className="text-ink-faint">·</span>
                    {!showSaveTemplateInput ? (
                      <button
                        type="button"
                        onClick={() => setShowSaveTemplateInput(true)}
                        disabled={!campaignSubject.trim() || !campaignBody.trim()}
                        className="text-xs font-semibold text-[#8b5cf6] disabled:opacity-50"
                      >
                        Save as template
                      </button>
                    ) : (
                      <>
                        <input
                          value={newTemplateName}
                          onChange={(e) => setNewTemplateName(e.target.value)}
                          placeholder="Template name, e.g. Monthly update"
                          maxLength={60}
                          className="w-56 rounded-pill border border-[#ece5f5] bg-surface px-3.5 py-2 text-xs text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa]"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTemplate}
                          disabled={!newTemplateName.trim() || savingTemplate}
                          className="whitespace-nowrap rounded-pill border border-[#ece5f5] bg-surface px-3.5 py-2 text-xs font-semibold text-[#8b5cf6] disabled:opacity-50"
                        >
                          {savingTemplate ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSaveTemplateInput(false);
                            setNewTemplateName("");
                          }}
                          className="text-xs font-semibold text-ink-soft"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={!campaignSubject.trim() || !campaignBody.trim() || sendingCampaign}
                      className="flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      style={{
                        background: confirmingSend
                          ? "linear-gradient(135deg,#ef4444,#f97316)"
                          : "linear-gradient(135deg,#a78bfa,#60a5fa)",
                      }}
                    >
                      {sendingCampaign ? (
                        <Spinner className="h-4 w-4 border-white/40 border-t-white" />
                      ) : (
                        <Mail size={14} />
                      )}
                      {confirmingSend
                        ? `Confirm: send to ${campaignAudienceCounts?.[campaignSegment] ?? "…"} people`
                        : "Send campaign"}
                    </button>
                    {confirmingSend && (
                      <button
                        type="button"
                        onClick={() => setConfirmingSend(false)}
                        className="text-xs font-semibold text-ink-soft"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {showEmailPreview && (
                <div className="mt-3 overflow-hidden rounded-[16px] border border-[#ece5f5] bg-[#f5f3fa]">
                  <div className="border-b border-[#ece5f5] bg-surface px-4 py-2.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                      Preview — exactly what recipients will see
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{emailPreviewSubject}</p>
                  </div>
                  <div className="flex justify-center p-4">
                    <iframe
                      title="Email preview"
                      srcDoc={emailPreviewHtml}
                      sandbox=""
                      className="h-[560px] w-full max-w-[560px] rounded-[10px] border border-[#ece5f5] bg-white"
                    />
                  </div>
                </div>
              )}

              <p className="mt-2 text-[11px] text-ink-faint">
                Sends one email per recipient (never batched together), with a short delay between each, via AWS
                SES. Anyone who&apos;s unsubscribed is automatically excluded from every segment above.
              </p>
            </section>

            {recentCampaigns.length > 0 && (
              <section className="mt-8">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                  Previously sent emails
                </p>
                <div className="space-y-2">
                  {recentCampaigns.map((c) => (
                    <div key={c.id} className="rounded-[12px] border border-[#f0ecf7] bg-surface p-3">
                      <p className="text-sm font-medium text-ink">{c.subject}</p>
                      <p className="line-clamp-2 text-[12.5px] text-ink-soft">{c.body}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-pill bg-[#f2effa] px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">
                          {emailSegmentLabel(c.segment)}
                        </span>
                        <span className="text-[10.5px] text-ink-faint">
                          {c.recipient_count} recipient{c.recipient_count === 1 ? "" : "s"}
                        </span>
                        <p className="text-[10.5px] text-ink-faint">{new Date(c.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-8">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Users</p>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a29ab9]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or email…"
                    className="w-52 rounded-pill border border-[#ece5f5] bg-surface py-2 pl-8 pr-3 text-xs text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa]"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-[16px] border border-[#f0ecf7] bg-surface">
                {!users ? (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                ) : users.length === 0 ? (
                  <p className="py-10 text-center text-sm text-ink-soft">No users match that search.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#f0ecf7] text-[11px] uppercase tracking-wide text-[#a8a2bd]">
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Email</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Memories</th>
                          <th className="px-4 py-3 font-semibold">Chats</th>
                          <th className="px-4 py-3 font-semibold">App version</th>
                          <th className="px-4 py-3 font-semibold">Joined</th>
                          <th className="px-4 py-3 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id} className="border-b border-[#f5f2fa] last:border-b-0">
                            <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                              {u.firstName} {u.lastName}
                            </td>
                            <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{u.email}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "rounded-pill px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
                                  u.status === "active" && "bg-[#f2effa] text-[#8b5cf6]",
                                  u.status === "trial" && "bg-amber-50 text-amber-600",
                                  u.status === "expired" && "bg-red-50 text-red-600"
                                )}
                              >
                                {u.status === "active"
                                  ? `Paid${planSuffix(u.preferredPlan)}`
                                  : u.status === "trial"
                                    ? `Trial · ${u.daysLeft}d left${planSuffix(u.preferredPlan)}`
                                    : `Expired${planSuffix(u.preferredPlan)}`}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-ink-soft">{u.memoryCount}</td>
                            <td className="px-4 py-3 text-ink-soft">{u.chatCount}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {u.appVersion ? (
                                <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />v
                                  {u.appVersion}
                                </span>
                              ) : (
                                <span className="text-[12px] text-ink-faint">Not seen yet</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                              {new Date(u.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              {u.status === "active" ? (
                                <button
                                  onClick={() => handleSetStatus(u.id, "trial")}
                                  disabled={userActionId === u.id}
                                  className="whitespace-nowrap text-xs font-semibold text-ink-soft disabled:opacity-50"
                                >
                                  Revert to trial
                                </button>
                              ) : (
                                <div className="flex flex-col items-start gap-1">
                                  <button
                                    onClick={() => handleSetStatus(u.id, "active", "annual")}
                                    disabled={userActionId === u.id}
                                    className="whitespace-nowrap text-xs font-semibold text-[#8b5cf6] disabled:opacity-50"
                                  >
                                    Grant Plus · Yearly
                                  </button>
                                  <button
                                    onClick={() => handleSetStatus(u.id, "active", "monthly")}
                                    disabled={userActionId === u.id}
                                    className="whitespace-nowrap text-xs font-semibold text-[#8b5cf6] disabled:opacity-50"
                                  >
                                    Grant Plus · Monthly
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {recentNudges.length > 0 && (
              <section className="mt-8">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                  Previously sent
                </p>
                <div className="space-y-2">
                  {recentNudges.map((n) => (
                      <div key={n.id} className="rounded-[12px] border border-[#f0ecf7] bg-surface p-3">
                        {n.title && <p className="text-sm font-medium text-ink">{n.title}</p>}
                        <p className="text-[12.5px] text-ink-soft">{n.message}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded-pill bg-[#f2effa] px-2 py-0.5 text-[10px] font-semibold text-[#8b5cf6]">
                            {segmentLabel(n.segment)}
                          </span>
                          <p className="text-[10.5px] text-ink-faint">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
