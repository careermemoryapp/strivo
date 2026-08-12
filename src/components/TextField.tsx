import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "w-full rounded-input border border-border bg-surface px-3.5 py-3 text-ink placeholder:text-ink-faint outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-soft transition",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
TextField.displayName = "TextField";
