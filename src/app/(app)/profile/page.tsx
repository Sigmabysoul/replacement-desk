import { ShieldCheck, UserRound } from "lucide-react";
import { updatePasswordAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireProfile();
  const notice = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-bold text-indigo-700">ACCOUNT</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Profile</h1>
      <div className="mt-5 grid gap-3">
        <Notice>{notice.error}</Notice>
        <Notice tone="success">{notice.success}</Notice>
      </div>
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center gap-4 border-b border-slate-100 bg-indigo-50 p-5">
          <span className="grid size-14 place-items-center rounded-2xl bg-indigo-600 text-white">
            <UserRound className="size-7" />
          </span>
          <div>
            <h2 className="text-xl font-black text-slate-950">{profile.full_name}</h2>
            <p className="text-sm font-semibold text-indigo-700">{profile.role}</p>
          </div>
        </div>
        <dl className="grid gap-5 p-5">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Access</dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold text-slate-800">
              <ShieldCheck className="size-4 text-emerald-600" />
              {profile.active ? "Active account" : "Inactive account"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Member since</dt>
            <dd className="mt-1 font-semibold text-slate-800">{formatDate(profile.created_at, false)}</dd>
          </div>
        </dl>
      </Card>
      <Card className="mt-4 p-5">
        <h2 className="font-black text-slate-950">Change password</h2>
        <form action={updatePasswordAction} className="mt-4 grid gap-4">
          <Field label="New password">
            <PasswordInput id="profile-new-password" name="password" minLength={6} required autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput id="profile-confirm-password" name="confirm_password" minLength={6} required autoComplete="new-password" />
          </Field>
          <SubmitButton pendingText="Updating…">UPDATE PASSWORD</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
