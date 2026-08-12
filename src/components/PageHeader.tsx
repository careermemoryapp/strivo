"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="px-5 pt-6 pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {back && (
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="-ml-1 mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-bg text-ink"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <h1 className="text-xl font-semibold text-ink truncate">{title}</h1>
        </div>
        {right}
      </div>
      {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
    </div>
  );
}
