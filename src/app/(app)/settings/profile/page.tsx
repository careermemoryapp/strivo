"use client";

import { useEffect, useState } from "react";
import { DarkHeader } from "@/components/DarkHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { format } from "date-fns";
import { dialCodeForCountry } from "@/lib/dialCodes";

type ProfileUser = {
  firstName: string;
  lastName: string;
  email: string;
  created_at: string;
  // Null if never added (see phone_number's comment on the User type in
  // repo/users.ts) -- the Home banner (PhoneNumberBanner.tsx) is the other
  // place this gets set; this page is where it gets CHANGED.
  phoneNumber: string | null;
  // 2-letter country already on file (see maybeSetUserCountry) -- used the
  // same way PhoneNumberBanner uses it, to pre-fill a dial code for anyone
  // who hasn't added a number yet rather than making them look it up.
  country: string | null;
};

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        const u: ProfileUser = {
          firstName: data.user.first_name,
          lastName: data.user.last_name,
          email: data.user.email,
          created_at: data.user.created_at,
          phoneNumber: data.user.phone_number,
          country: data.user.country,
        };
        setUser(u);
        setFirstName(u.firstName);
        setLastName(u.lastName);
        const detected = dialCodeForCountry(u.country);
        setPhone(u.phoneNumber ?? (detected ? `${detected.dialCode} ` : ""));
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

      // Only hit the phone endpoint (and re-stamp consent -- see
      // phone_consent_at's comment on the User type) when the number
      // actually changed. Saving name edits shouldn't silently refresh
      // consent for a phone number nobody touched this time.
      const digitsOnly = phone.replace(/[^\d]/g, "");
      const candidate = digitsOnly ? `+${digitsOnly}` : "";
      if (candidate && candidate !== user?.phoneNumber) {
        const phoneRes = await fetch("/api/user/phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: candidate }),
        });
        const phoneJson = await phoneRes.json().catch(() => null);
        if (!phoneRes.ok) {
          setError(phoneJson?.error || "Couldn't save your WhatsApp number.");
          setSaving(false);
          return;
        }
        setUser((u) => (u ? { ...u, phoneNumber: candidate } : u));
      }

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
              <div>
                <TextField
                  label="WhatsApp number"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
                <p className="mt-1.5 text-xs text-ink-faint">
                  We&apos;ll only message you about your own Strivo activity.
                </p>
              </div>
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
