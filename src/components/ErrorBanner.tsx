import { AlertCircle } from "lucide-react";

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-card border border-red-100 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 font-medium underline underline-offset-2">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
