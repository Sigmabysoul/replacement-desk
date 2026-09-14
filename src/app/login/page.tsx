import { LockKeyhole, PackageCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getSessionProfile();
  if (profile?.active) redirect("/");
  const { error } = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e0e7ff,transparent_40%),#f8fafc] px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        {/* App Branding */}
        <div className="mb-6 sm:mb-8 flex items-center gap-3.5">
          <span className="grid size-12 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
            <PackageCheck className="size-7" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">TBC_KART</h1>
            <p className="text-xs sm:text-sm font-medium text-slate-600">Orders, labels, printing, QC approval, and dispatch</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="p-5 sm:p-7 shadow-sm border-slate-200/80">
          <div className="mb-6">
            <LockKeyhole className="mb-3 size-6 text-indigo-600" />
            <h2 className="text-xl font-extrabold text-slate-950">Sign in</h2>
            <p className="mt-1 text-sm text-slate-600">
              Use the work account credentials provided by your administrator.
            </p>
          </div>

          {!configured ? (
            <Notice tone="warning">
              Supabase is not configured yet. Add the values from .env.example, apply the migrations, then restart the app.
            </Notice>
          ) : (
            <form action={loginAction} className="grid gap-4 sm:gap-5">
              <Notice>
                {error === "inactive" ? "This account is inactive. Contact an admin." : error}
              </Notice>

              <Field label="Email">
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                />
              </Field>

              <Field label="Password">
                <PasswordInput
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                />
              </Field>

              <SubmitButton pendingText="Signing in…" className="w-full mt-1">
                SIGN IN
              </SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
