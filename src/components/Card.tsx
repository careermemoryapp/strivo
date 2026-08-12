import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface rounded-card border border-border p-4", className)}
      style={{ boxShadow: "var(--shadow-card)" }}
      {...props}
    />
  );
}
