import { getDb, newId, nowIso } from "@/lib/db";

// A saved starting point for the campaign composer -- both the four
// seeded "traditional" templates (see the seed block in lib/db.ts) and
// anything the admin saves themselves via "Save as template" live here.
// Loading a template just fills in the composer fields; it has no
// relationship to email_campaigns (the send history) at all.
export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  banner_image_url: string | null;
  button_text: string | null;
  button_url: string | null;
  accent_color: string | null;
  created_at: string;
  updated_at: string;
};

export function listTemplates(): EmailTemplate[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM email_templates ORDER BY created_at ASC`).all() as EmailTemplate[];
}

export function createTemplate(input: {
  name: string;
  subject: string;
  body: string;
  bannerImageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  accentColor: string | null;
}): EmailTemplate {
  const db = getDb();
  const id = newId("template");
  const now = nowIso();
  db.prepare(
    `INSERT INTO email_templates (id, name, subject, body, banner_image_url, button_text, button_url, accent_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.subject,
    input.body,
    input.bannerImageUrl,
    input.buttonText,
    input.buttonUrl,
    input.accentColor,
    now,
    now
  );
  return {
    id,
    name: input.name,
    subject: input.subject,
    body: input.body,
    banner_image_url: input.bannerImageUrl,
    button_text: input.buttonText,
    button_url: input.buttonUrl,
    accent_color: input.accentColor,
    created_at: now,
    updated_at: now,
  };
}

// No update-in-place -- "Save as template" always creates a new row, and
// editing means delete + re-save. Keeps the composer's mental model
// simple: templates are named snapshots, not something you'd expect to
// silently drift out from under a name you're reusing.
export function deleteTemplate(id: string) {
  const db = getDb();
  db.prepare(`DELETE FROM email_templates WHERE id = ?`).run(id);
}
