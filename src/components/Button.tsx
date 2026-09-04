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
  // Defaults to "button", not the browser's native default of "submit".
  // Without this, any Button rendered inside a <form> (e.g. settings/
  // profile's "Save Changes") would behave correctly only by accident --
  // and any Button that WASN'T meant to submit anything, sitting inside a
  // form ancestor it doesn't know about, would silently trigger a full
  // page submit/reload on click instead of running its own onClick. A
  // caller that genuinely wants a submit button (like profile's Save
  // Changes) still gets it by explicitly passing type="submit" -- that
  // explicit value flows through untouched since it's destructured here,
  // not spread from ...props.
  type = "button",
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
    <button type={type} className={cn(base, variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className="border-white/40 border-t-white h-4 w-4" />}
      {children}
    </button>
  );
}
