"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Send, X, Search, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { cn } from "@/lib/utils";
import type { AdminMetrics, AdminUserRow } from "@/lib/repo/admin";
import type { Nudge } from "@/lib/repo/nudges";

const DARK = "#26213c";

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

export default function AdminDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeNudge, setActiveNudge] = useState<Nudge | null>(null);
  const [recentNudges, setRecentNudges] = useState<Nudge[]>([]);
  const [nudgeTitle, setNudgeTitle] = useState("");
  const [nudgeMessage, setNudgeMessage] = useState("");
  const [sendingNudge, setSendingNudge] = useState(false);
  const [clearingNudge, setClearingNudge] = useState(false);
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
    setActiveNudge(data.active);
    setRecentNudges(data.recent ?? []);
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

  async function handleSendNudge(e: React.FormEvent) {
    e.preventDefault();
    if (!nudgeMessage.trim()) return;
    setSendingNudge(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nudgeTitle.trim() || undefined, message: nudgeMessage.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't send that nudge.");
        return;
      }
      setNudgeTitle("");
      setNudgeMessage("");
      await loadNudge();
    } finally {
      setSendingNudge(false);
    }
  }

  async function handleClearNudge() {
    setClearingNudge(true);
    try {
      await fetch("/api/admin/nudge", { method: "DELETE" });
      await loadNudge();
    } finally {
      setClearingNudge(false);
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
            </section>

            <section className="mt-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">Subscriptions</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="In trial" value={String(metrics.statusCounts.trial)} />
                <StatCard label="Paid (active)" value={String(metrics.statusCounts.active)} />
                <StatCard label="Trial expired" value={String(metrics.statusCounts.expired)} />
                <StatCard
                  label="Trial → paid rate"
                  value={metrics.conversionRate === null ? "—" : pct(metrics.conversionRate)}
                  hint="Active / (active + expired)"
                />
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                Real payments aren&apos;t live yet (Google Play Billing isn&apos;t wired up), so &quot;Paid&quot;
                only reflects accounts you&apos;ve manually marked active below.
              </p>
            </section>

            <section className="mt-6">
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
            </section>

            <section className="mt-8">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                Nudge people to record
              </p>
              <div className="rounded-[16px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-4">
                {activeNudge ? (
                  <div className="mb-4 flex items-start gap-3 rounded-[13px] border border-[#ece5f5] bg-surface p-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2effa] text-[#8b5cf6]">
                      <Sparkles size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8b5cf6]">
                        Live on everyone&apos;s Home right now
                      </p>
                      {activeNudge.title && <p className="mt-0.5 text-sm font-semibold text-ink">{activeNudge.title}</p>}
                      <p className="text-[12.5px] text-ink-soft">{activeNudge.message}</p>
                    </div>
                    <button
                      onClick={handleClearNudge}
                      disabled={clearingNudge}
                      aria-label="Clear nudge"
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-bg disabled:opacity-50"
                    >
                      {clearingNudge ? <Spinner className="h-3.5 w-3.5" /> : <X size={15} />}
                    </button>
                  </div>
                ) : (
                  <p className="mb-4 text-[12.5px] text-[#8a82a8]">Nothing live right now — send one below.</p>
                )}

                <form onSubmit={handleSendNudge} className="space-y-2.5">
                  <input
                    value={nudgeTitle}
                    onChange={(e) => setNudgeTitle(e.target.value)}
                    placeholder="Title (optional)"
                    maxLength={60}
                    className="w-full rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                  />
                  <textarea
                    value={nudgeMessage}
                    onChange={(e) => setNudgeMessage(e.target.value)}
                    placeholder="e.g. Haven't recorded in a while? Capture today's win in 60 seconds."
                    maxLength={300}
                    rows={2}
                    className="w-full resize-none rounded-[11px] border border-[#ece5f5] bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-[#a29ab9] outline-none focus:border-[#a78bfa] focus:ring-2 focus:ring-[#a78bfa]/20"
                  />
                  <button
                    type="submit"
                    disabled={!nudgeMessage.trim() || sendingNudge}
                    className="flex items-center gap-2 rounded-pill px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
                  >
                    {sendingNudge ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : <Send size={14} />}
                    Send to everyone&apos;s Home
                  </button>
                </form>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                This one button does both: it shows as a dismissible banner on Home, and sends a real
                notification-bar push to every phone that&apos;s registered ({metrics.registeredDevices} right now).
                Push only reaches phones running the app version with notifications built in — anyone on an older
                version will still see the in-app banner next time they open Strivo.
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

            {recentNudges.length > 1 && (
              <section className="mt-8">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#a8a2bd]">
                  Previous nudges
                </p>
                <div className="space-y-2">
                  {recentNudges
                    .filter((n) => n.id !== activeNudge?.id)
                    .map((n) => (
                      <div key={n.id} className="rounded-[12px] border border-[#f0ecf7] bg-surface p-3">
                        {n.title && <p className="text-sm font-medium text-ink">{n.title}</p>}
                        <p className="text-[12.5px] text-ink-soft">{n.message}</p>
                        <p className="mt-1 text-[10.5px] text-ink-faint">{new Date(n.created_at).toLocaleString()}</p>
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
