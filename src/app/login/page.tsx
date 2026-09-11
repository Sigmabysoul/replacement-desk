import { LockKeyhole, PackageCheck, Sparkles, UserCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { demoLoginAction, loginAction } from "@/app/actions";
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
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Replacement Desk</h1>
            <p className="text-xs sm:text-sm font-medium text-slate-600">Printing, QC, packing, and dispatch</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="p-5 sm:p-7 shadow-sm border-slate-200/80">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <LockKeyhole className="size-6 text-indigo-600" />
              {!configured && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                  <Sparkles className="size-3.5" />
                  Demo Mode Ready
                </span>
              )}
            </div>
            <h2 className="mt-3 text-xl font-extrabold text-slate-950">Sign in</h2>
            <p className="mt-1 text-sm text-slate-600">
              {configured
                ? "Use the work account credentials provided by your administrator."
                : "Sign in with your email or pick a role to test the workflow."}
            </p>
          </div>

          <form action={loginAction} className="grid gap-4 sm:gap-5">
            <Notice>
              {error === "inactive" ? "This account is inactive. Contact an admin." : error}
            </Notice>

            <Field label="Email" hint={!configured ? "Any email works in demo mode (e.g. admin@company.com)" : undefined}>
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

          {/* Quick Demo Role Selector (Allows immediate testing of all 4 operational workflows) */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <UserCheck className="size-3.5 text-slate-400" />
              Quick demo roles
            </p>
            <div className="grid grid-cols-2 gap-2">
              <form action={demoLoginAction}>
                <input type="hidden" name="role" value="ADMIN" />
                <button
                  type="submit"
                  className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition group"
                >
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">Admin</p>
                  <p className="text-[11px] text-slate-500">Full operations</p>
                </button>
              </form>

              <form action={demoLoginAction}>
                <input type="hidden" name="role" value="ESHA" />
                <button
                  type="submit"
                  className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition group"
                >
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">Esha (Ops)</p>
                  <p className="text-[11px] text-slate-500">Create & QC Review</p>
                </button>
              </form>

              <form action={demoLoginAction}>
                <input type="hidden" name="role" value="PRINTING" />
                <button
                  type="submit"
                  className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition group"
                >
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">Printing</p>
                  <p className="text-[11px] text-slate-500">Thermal label print</p>
                </button>
              </form>

              <form action={demoLoginAction}>
                <input type="hidden" name="role" value="PACKING" />
                <button
                  type="submit"
                  className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition group"
                >
                  <p className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">Packing</p>
                  <p className="text-[11px] text-slate-500">QC photos & pack</p>
                </button>
              </form>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
