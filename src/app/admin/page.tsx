"use client";

import { useEffect, useState, useCallback, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Send, Search } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import type { AdminMetrics, AdminUserRow } from "@/lib/repo/admin";
import type { Nudge } from "@/lib/repo/nudges";
import type { NudgeSegment } from "@/lib/repo/pushTokens";

const DARK = "#26213c";

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
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

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

  const loadNudge = useCallback(async () => {
    const res = await fetch("/api/admin/nudge");
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) return;
    const data = await res.json();
    setRecentNudges(data.recent ?? []);
    setAudienceCounts(data.audienceCounts ?? null);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial auth-gated fetch on mount, not a render loop
    Promise.all([loadMetrics(), loadNudge(), loadUsers("")]).finally(() => setCheckedAuth(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

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

  async function handleSetStatus(userId: string, status: "trial" | "active") {
    setUserActionId(userId);
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await Promise.all([loadUsers(search), loadMetrics()]);
    } finally {
      setUserActionId(null);
    }
  }

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
                                {u.status === "active" ? "Paid" : u.status === "trial" ? `Trial · ${u.daysLeft}d left` : "Expired"}
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
                                <button
                                  onClick={() => handleSetStatus(u.id, "active")}
                                  disabled={userActionId === u.id}
                                  className="whitespace-nowrap text-xs font-semibold text-[#8b5cf6] disabled:opacity-50"
                                >
                                  Grant Strivo Plus
                                </button>
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
