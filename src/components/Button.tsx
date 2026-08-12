import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  className,
  variant = "primary",
  loading,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-input px-4 py-3 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<Variant, string> = {
    primary: "bg-gradient-brand text-white",
    secondary: "bg-brand-primary-soft text-brand-primary",
    ghost: "bg-transparent text-ink border border-border",
    danger: "bg-red-50 text-red-600 border border-red-100",
  };
  return (
    <button className={cn(base, variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className="border-white/40 border-t-white h-4 w-4" />}
      {children}
    </button>
  );
}
