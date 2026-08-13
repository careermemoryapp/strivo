import { Brain, ShieldCheck, Sparkles, Target } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { LogoMark } from "@/components/Logo";
import { APP_NAME } from "@/lib/config";

const VALUES = [
  {
    icon: Brain,
    title: "Grounded in your own experience",
    desc: "Strivo never invents accomplishments. Every answer is built from memories you actually captured.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    desc: "Your memories belong to you alone — not used to train anything, not shared, not sold.",
  },
  {
    icon: Sparkles,
    title: "Always ready to capture",
    desc: "Speak it, type it, or upload a document the moment something worth remembering happens.",
  },
  {
    icon: Target,
    title: "Built for real career moments",
    desc: "Interviews, resumes, performance reviews, leadership stories — the moments where evidence matters most.",
  },
];

export default function AboutStrivoPage() {
  return (
    <div>
      <PageHeader title={`About ${APP_NAME}`} back />

      <div className="px-5 space-y-5 pb-8">
        <div className="flex flex-col items-center text-center py-2">
          <LogoMark size={48} />
          <h1 className="mt-3 text-xl font-bold text-ink">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-ink-soft max-w-xs">
            Your personal AI, built from your own experiences.
          </p>
        </div>

        <Card>
          <h2 className="font-semibold text-ink">Our vision</h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed">
            Nobody should have to start from a blank page when it&apos;s time to advocate for
            themselves. We believe everyone&apos;s accomplishments, lessons, and moments of growth
            are worth remembering — and worth having on hand the moment they matter.
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">Our mission</h2>
          <p className="mt-2 text-sm text-ink-soft leading-relaxed">
            Strivo gives you a private, AI-powered memory of your own career. Instead of
            scrambling to remember your best work before an interview or performance review, you
            capture it as it happens — and let your AI recall it, connect it, and help you tell
            the story when it counts.
          </p>
        </Card>

        <div>
          <h2 className="mb-2 px-1 font-semibold text-ink">What Strivo brings you</h2>
          <div className="space-y-2.5">
            {VALUES.map((v) => (
              <Card key={v.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary">
                  <v.icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{v.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">{v.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
