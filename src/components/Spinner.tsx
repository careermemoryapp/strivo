import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-5 w-5 rounded-full border-2 border-brand-primary-soft border-t-brand-primary animate-spin", className)}
    />
  );
}
