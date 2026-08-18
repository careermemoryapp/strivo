"use client";

import { useEffect, useState } from "react";
import { DarkHeader } from "@/components/DarkHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { format } from "date-fns";

type ProfileUser = { firstName: string; lastName: string; email: string; created_at: string };

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        const u = {
          firstName: data.user.first_name,
          lastName: data.user.last_name,
          email: data.user.email,
          created_at: data.user.created_at,
        };
        setUser(u);
        setFirstName(u.firstName);
        setLastName(u.lastName);
      })
      .catch(() => setError("Couldn't load your profile."));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
    } catch {
      setError("Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!user && !error) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="pb-8">
      <DarkHeader back inlineTitle="Profile" />
      <div className="px-5 pt-5">
        {error && <ErrorBanner message={error} />}
        {user && (
          <>
            <div className="flex flex-col items-center py-4">
              <Avatar firstName={firstName} lastName={lastName} size={72} />
              <p className="mt-3 text-sm text-ink-soft">{user.email}</p>
              <p className="mt-0.5 text-xs text-ink-faint">
                Member since {format(new Date(user.created_at), "MMMM d, yyyy")}
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <TextField label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <TextField label="Email" value={user.email} disabled />
              {saved && <p className="text-sm text-green-600">Profile updated.</p>}
              <Button type="submit" className="w-full" loading={saving}>
                Save Changes
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
