"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { TrendingUp, ArrowRight } from "lucide-react";
import { DarkHeader } from "@/components/DarkHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

type Narrative = { text: string; earliestDate: string; latestDate: string; createdAt: string };

// Deliberately the calmest, least "featureful" page in the app -- one
// paragraph, no chips, no actions to take. The point (see the brainstorm
// this came out of) is a genuine reflection on who the person is becoming,
// which reads better as a short, well-written note than as another
// dashboard. Violet/indigo blend distinct from both the amber praise
// styling and the plain indigo recap card, since this is meant to feel
// like the "biggest" of the human-angle surfaces.
export function GrowthClient({ narrative }: { narrative: Narrative | null }) {
  const router = useRouter();

  return (
    <div className="pb-10">
      <DarkHeader back inlineTitle="How You've Grown" />

      <div className="px-5 pt-5">
        {!narrative ? (
          <EmptyState
            icon={<TrendingUp size={22} />}
            title="Nothing to show yet"
            description="Once you've recorded enough memories over enough time, we'll compare your earlier stories to your recent ones and reflect back what's changed."
            action={<Button onClick={() => router.push("/record")}>Record a memory</Button>}
          />
        ) : (
          <>
            <div
              className="rounded-[18px] border border-[#e6e2f7] p-5"
              style={{ background: "linear-gradient(135deg,#f5f3fd,#eef0fb)" }}
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-[#7c6ff0]"
                style={{ boxShadow: "0 6px 16px rgba(124,111,240,0.18)" }}
              >
                <TrendingUp size={19} />
              </div>
              <p className="text-[16px] leading-relaxed text-[#3c3650]">{narrative.text}</p>
              <p className="mt-4 text-[11px] font-medium text-[#8a82a8]">
                Comparing {format(new Date(narrative.earliestDate), "MMM yyyy")} to{" "}
                {format(new Date(narrative.latestDate), "MMM yyyy")}
              </p>
            </div>

            <button
              onClick={() => router.push("/memories")}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#a78bfa,#60a5fa)" }}
            >
              See all your memories <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
