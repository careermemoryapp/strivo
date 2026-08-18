import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <main className="mx-auto w-full max-w-md flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
