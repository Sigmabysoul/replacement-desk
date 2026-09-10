import { AppHeader } from "@/components/layout/app-header";
import { Navigation } from "@/components/layout/navigation";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { RealtimeListener } from "@/components/realtime/realtime-listener";
import { requireProfile } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  return (
    <ThemeProvider>
      <div className="min-h-screen">
        <RealtimeListener />
        <Navigation role={profile.role} />
        <div className="lg:pl-64">
          <AppHeader profile={profile} />
          <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-10 lg:pt-8">
            {children}
          </main>
        </div>
      </div>
    </ThemeProvider>
  );
}
