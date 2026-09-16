import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/serverAuth";
import { logAnalyticsEvent } from "@/lib/repo/analyticsEvents";
import { rateLimitOrResponse, requestIp } from "@/lib/rateLimit";
import { CAREER_WRAPPED_EVENTS } from "@/lib/config";

// Only Career Wrapped events are accepted for now -- see the allow-list's
// own comment in lib/config.ts. Deliberately closed rather than accepting
// an arbitrary string: this table has no per-event schema, so an open
// event_name would let a bug (or abuse) fill it with junk that's expensive
// to clean up later. Extend CAREER_WRAPPED_EVENTS when a new event is
// actually needed, same "add here, use there" discipline as
// FEATURE_FLAGS/NOTIFICATION_TYPES elsewhere in this app.
const bodySchema = z.object({
  eventName: z.enum(CAREER_WRAPPED_EVENTS),
  // Small, flat metadata only (e.g. { periodKey: "2026", template: "A" }) --
  // bounded by JSON.stringify length below rather than a strict shape, since
  // different events legitimately carry different fields.
  properties: z.record(z.string(), z.unknown()).optional(),
});

// Deliberately reachable without a signed-in session -- the public
// /cw/[shareId] Career Card landing page fires career_card_share_clicked-
// style events from visitors who may never have signed up. requireUserId()
// just returns null for them rather than gating the route; logAnalyticsEvent
// stores a null user_id in that case (see its own comment in
// lib/repo/analyticsEvents.ts).
export async function POST(req: Request) {
  const limited = rateLimitOrResponse(`analytics-event:${requestIp(req)}`, 60, 60 * 1000);
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const userId = await requireUserId();
  const properties = parsed.data.properties;
  if (properties && JSON.stringify(properties).length > 2000) {
    return NextResponse.json({ error: "properties too large" }, { status: 400 });
  }

  logAnalyticsEvent({ userId, eventName: parsed.data.eventName, properties });
  return NextResponse.json({ ok: true });
}
