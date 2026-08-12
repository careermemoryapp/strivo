import { initials } from "@/lib/utils";

export function Avatar({
  firstName,
  lastName,
  size = 40,
}: {
  firstName?: string | null;
  lastName?: string | null;
  size?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-brand-primary-soft text-brand-primary font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(firstName, lastName)}
    </div>
  );
}
