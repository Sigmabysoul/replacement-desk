import { LockKeyhole, PackageCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { Card } from "@/components/ui/card";
import { getSessionProfile } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await getSessionProfile();
  if (profile?.active) redirect("/");
  const { error } = await searchParams;
  const configured = isSupabaseConfigured();
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#e0e7ff,transparent_38%),#f5f7fb] px-4 py-10"><div className="w-full max-w-md">
    <div className="mb-8 flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><PackageCheck className="size-7" /></span><div><h1 className="text-2xl font-black tracking-tight text-slate-950">Replacement Desk</h1><p className="text-sm text-slate-600">Printing, QC, packing, and dispatch</p></div></div>
    <Card className="p-5 sm:p-7"><div className="mb-6"><LockKeyhole className="mb-4 size-6 text-indigo-600" /><h2 className="text-xl font-extrabold text-slate-950">Sign in</h2><p className="mt-1 text-sm text-slate-600">Use the work account your admin created.</p></div>
      {!configured ? <Notice tone="warning">Supabase is not configured yet. Add the values from .env.example, apply the migrations, then restart the app.</Notice> : <form action={loginAction} className="grid gap-5"><Notice>{error === "inactive" ? "This account is inactive. Contact an admin." : error}</Notice><Field label="Email"><Input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></Field><Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field><SubmitButton pendingText="Signing in…">SIGN IN</SubmitButton></form>}
    </Card>
  </div></main>;
}
