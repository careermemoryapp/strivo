"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  User, CreditCard, Download, Bell, Shield, Palette, HelpCircle, Info, LogOut, Trash2, ChevronRight, X,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
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
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
    >
      <span className={danger ? "text-red-600" : "text-ink-soft"}>{icon}</span>
      <span className={`flex-1 text-sm font-medium ${danger ? "text-red-600" : "text-ink"}`}>{label}</span>
      {comingSoon ? (
        <span className="text-xs text-ink-faint">Coming soon</span>
      ) : (
        <ChevronRight size={16} className="text-ink-faint" />
      )}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await fetch("/api/user/delete", { method: "POST" });
      await signOut({ callbackUrl: "/login" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" back />

      <div className="px-5 space-y-6 pb-8">
        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Account</h3>
          <Card className="p-0 divide-y divide-border overflow-hidden">
            <Row icon={<User size={18} />} label="Profile" onClick={() => router.push("/settings/profile")} />
            <Row icon={<CreditCard size={18} />} label="Subscription" onClick={() => router.push("/settings/subscription")} />
            <Row icon={<Download size={18} />} label="Export Data" comingSoon />
          </Card>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Preferences</h3>
          <Card className="p-0 divide-y divide-border overflow-hidden">
            <Row icon={<Bell size={18} />} label="Notifications" comingSoon />
            <Row icon={<Shield size={18} />} label="Privacy" comingSoon />
            <Row icon={<Palette size={18} />} label="Appearance" comingSoon />
          </Card>
        </div>

        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">Support</h3>
          <Card className="p-0 divide-y divide-border overflow-hidden">
            <Row icon={<HelpCircle size={18} />} label="Help & Support" comingSoon />
            <Row icon={<Info size={18} />} label={`About ${APP_NAME}`} comingSoon />
          </Card>
        </div>

        <div>
          <Card className="p-0 divide-y divide-border overflow-hidden">
            <Row icon={<LogOut size={18} />} label="Log Out" onClick={() => signOut({ callbackUrl: "/login" })} />
            <Row icon={<Trash2 size={18} />} label="Delete Account" danger onClick={() => setConfirmDelete(true)} />
          </Card>
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
    </div>
  );
}
