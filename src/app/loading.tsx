import { LogoMark } from "@/components/Logo";

// Shown automatically by Next.js while a route segment is loading — most
// visibly right when the app cold-opens (native splash hands off to this),
// and briefly during heavier page transitions. Same light background as the
// native splash image (assets/splash.png) so the handoff from native splash
// to this feels like one continuous moment, not a jump cut.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg">
      <div className="relative flex items-center justify-center">
        <span className="absolute h-24 w-24 rounded-full bg-gradient-brand animate-splash-glow" />
        <div className="animate-splash-in">
          <LogoMark size={72} />
        </div>
      </div>

      <p
        className="mt-5 text-lg font-extrabold tracking-tight text-ink animate-fade-in-up"
        style={{ animationDelay: "0.15s" }}
      >
        Strivo
      </p>

      <div className="mt-6 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand animate-splash-dot" style={{ animationDelay: "0s" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand animate-splash-dot" style={{ animationDelay: "0.15s" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-gradient-brand animate-splash-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}
