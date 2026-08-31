"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Sparkles, ArrowRight, CalendarDays } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

type Story = { memoryId: string; title: string; blurb: string; exists: boolean };
type Recap = { headline: string; weekStart: string; createdAt: string };

// Deliberately calm and short -- a weekly "here's what stood out" note, not
// a dashboard. The point (see the human-angle brainstorm this came out of)
// is giving the user a reason to open the app that isn't tied to actively
// prepping for an interview, so this reads like a note from a coach who
// noticed something, not another data screen.
export function RecapClient({ recap, stories }: { recap: Recap | null; stories: Story[] }) {
  const router = useRouter();

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="Your Week in Stories" />

      <div className="px-5 pt-5">
        {!recap ? (
          <EmptyState
            icon={<Sparkles size={22} />}
            title="No recap yet"
            description="Once you've recorded a few memories, a short weekly recap of your best stories will show up here — and land as a notification too."
            action={
              <Button onClick={() => router.push("/record")}>
                Record a memory
              </Button>
            }
          />
        ) : (
          <>
            <div className="rounded-[18px] border border-[#ece5f5] bg-gradient-to-br from-[#efeaf9] to-[#f5ecec] p-5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#8b5cf6]">
                <CalendarDays size={13} /> Week of {format(new Date(`${recap.weekStart}T00:00:00`), "MMM d")}
              </p>
              <p className="mt-2 text-[16px] font-semibold leading-snug text-[#3c3650]">{recap.headline}</p>
            </div>

            <div className="mt-5 space-y-3">
              {stories.map((s) => (
                <button
                  key={s.memoryId}
                  onClick={() => s.exists && router.push(`/memories/${s.memoryId}`)}
                  disabled={!s.exists}
                  className="w-full rounded-[14px] border border-[#f0ecf7] bg-surface p-4 text-left disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{s.title}</p>
                    {s.exists && <ArrowRight size={15} className="shrink-0 text-[#8b5cf6]" />}
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft leading-relaxed">{s.blurb}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
