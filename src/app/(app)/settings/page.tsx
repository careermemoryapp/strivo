"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  User, CreditCard, Download, Bell, Shield, Palette, HelpCircle, Info, LogOut, Trash2, ChevronRight, X, FileText,
  Sparkles, CheckCircle2,
} from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { APP_NAME } from "@/lib/config";

function Row({
  icon,
  label,
  onClick,
  danger,
  comingSoon,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50 active:opacity-60 transition-opacity"
    >
      <span className={danger ? "text-red-600" : "text-[#8b5cf6]"}>{icon}</span>
      <span className={`flex-1 text-sm font-medium ${danger ? "text-red-600" : "text-ink"}`}>{label}</span>
      {comingSoon ? (
        <span className="text-xs text-ink-faint">Coming soon</span>
      ) : (
        <ChevronRight size={16} className="text-[#cec7dd]" />
      )}
    </button>
  );
}

type ProfileSummary = { firstName: string; lastName: string; email: string; createdAt: string };

export default function SettingsPage() {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSending, setExportSending] = useState(false);
  const [exportSent, setExportSent] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.user) return;
        setProfile({
          firstName: data.user.first_name,
          lastName: data.user.last_name,
          email: data.user.email,
          createdAt: data.user.created_at,
        });
      })
      .catch(() => {});
  }, []);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await fetch("/api/user/delete", { method: "POST" });
      await signOut({ callbackUrl: "/login" });
    } finally {
      setDeleting(false);
    }
  }

  // Deliberately routes through the existing support-message pipe
  // (/api/support -- same one Help & Support uses) rather than an instant
  // self-serve download. This is what fulfills the "receive your data in a
  // portable format" promise in the Privacy Policy (GDPR Art. 20 /
  // CCPA portability) without handing every user a one-click button to walk
  // their whole memory history to a competing app -- see the founder-side
  // /api/admin/users/[id]/export route, which is what actually produces the
  // file once a request like this comes in.
  async function handleRequestExport() {
    setExportSending(true);
    setExportError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Data export request",
          message:
            "I'd like a copy of my Strivo data (memories, chats, and profile info) in a portable format, per the Privacy Policy.",
        }),
      });
      if (!res.ok) throw new Error();
      setExportSent(true);
    } catch {
      setExportError("Couldn't send your request. Please try again.");
    } finally {
      setExportSending(false);
    }
  }

  return (
    <div className="pb-8">
      <DarkHeader back inlineTitle="Settings" right={<NotificationBell />}>
        {profile && (
          <div className="relative mt-4 flex items-center gap-3.5 rounded-[14px] border border-white/10 bg-white/8 p-3.5">
            <Avatar firstName={profile.firstName} lastName={profile.lastName} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white truncate">
                {profile.firstName} {profile.lastName}
              </p>
              <p className="text-xs text-white/55 truncate">{profile.email}</p>
              <p className="mt-0.5 text-[11px] text-white/40">
                Member since {format(new Date(profile.createdAt), "MMMM yyyy")}
              </p>
            </div>
          </div>
        )}
      </DarkHeader>

      <div className="px-5 pt-5 space-y-6">
        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">Account</h3>
          <div className="rounded-[14px] bg-surface border border-[#f0ecf7] divide-y divide-[#f0ecf7] overflow-hidden">
            <Row icon={<User size={18} />} label="Profile" onClick={() => router.push("/settings/profile")} />
            <Row icon={<CreditCard size={18} />} label="Subscription" onClick={() => router.push("/settings/subscription")} />
            <Row icon={<Download size={18} />} label="Export Data" onClick={() => setExportOpen(true)} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">Preferences</h3>
          <div className="rounded-[14px] bg-surface border border-[#f0ecf7] divide-y divide-[#f0ecf7] overflow-hidden">
            <Row icon={<Bell size={18} />} label="Notifications" onClick={() => router.push("/settings/notifications")} />
            <Row icon={<Palette size={18} />} label="Appearance" comingSoon />
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">Discover</h3>
          <div className="rounded-[14px] bg-surface border border-[#f0ecf7] divide-y divide-[#f0ecf7] overflow-hidden">
            <Row icon={<Sparkles size={18} />} label="Features" onClick={() => router.push("/settings/features")} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[#a8a2bd]">Support</h3>
          <div className="rounded-[14px] bg-surface border border-[#f0ecf7] divide-y divide-[#f0ecf7] overflow-hidden">
            <Row icon={<HelpCircle size={18} />} label="Help & Support" onClick={() => router.push("/settings/help")} />
            <Row icon={<Info size={18} />} label={`About ${APP_NAME}`} onClick={() => router.push("/settings/about")} />
            <Row icon={<FileText size={18} />} label="Terms & Conditions" onClick={() => window.open("/terms", "_blank")} />
            <Row icon={<Shield size={18} />} label="Privacy Policy" onClick={() => window.open("/privacy", "_blank")} />
          </div>
        </div>

        <div>
          <div className="rounded-[14px] bg-surface border border-[#f0ecf7] divide-y divide-[#f0ecf7] overflow-hidden">
            <Row icon={<LogOut size={18} />} label="Log Out" onClick={() => signOut({ callbackUrl: "/login" })} />
            <Row icon={<Trash2 size={18} />} label="Delete Account" danger onClick={() => setConfirmDelete(true)} />
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setConfirmDelete(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-ink">Delete account?</h3>
              <button onClick={() => setConfirmDelete(false)} aria-label="Close"><X size={18} className="text-ink-soft" /></button>
            </div>
            <p className="text-sm text-ink-soft">
              This permanently deletes your account, all memories, and all chat history. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" className="flex-1" onClick={handleDeleteAccount} loading={deleting}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => {
            setExportOpen(false);
            // Reset only after the close animation-less unmount -- next open
            // should start fresh rather than showing a stale "sent" state
            // from a previous request earlier in the session.
            setExportSent(false);
            setExportError(null);
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-surface p-5">
            {exportSent ? (
              <div className="flex flex-col items-center py-2 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                  <CheckCircle2 size={24} />
                </div>
                <p className="font-semibold text-ink">Request sent</p>
                <p className="mt-1 text-sm text-ink-soft">
                  We&apos;ll email a copy of your data to your account email address soon.
                </p>
                <Button variant="secondary" className="mt-5 w-full" onClick={() => setExportOpen(false)}>
                  Done
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-ink">Export your data</h3>
                  <button onClick={() => setExportOpen(false)} aria-label="Close">
                    <X size={18} className="text-ink-soft" />
                  </button>
                </div>
                <p className="text-sm text-ink-soft">
                  We&apos;ll send a copy of everything Strivo has stored for you — your memories, chats, and profile
                  info — to your account email, in a portable format. This isn&apos;t instant; we&apos;ll follow up
                  by email.
                </p>
                {exportError && (
                  <p className="mt-2 text-sm text-red-600">{exportError}</p>
                )}
                <div className="mt-5 flex gap-3">
                  <Button variant="ghost" className="flex-1" onClick={() => setExportOpen(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={handleRequestExport} loading={exportSending}>
                    Request my data
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
