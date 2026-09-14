import { UserPlus, Users } from "lucide-react";
import { createUserAction, updateUserAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Profile } from "@/lib/types";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireProfile(["ADMIN"]);
  const notice = await searchParams;
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("*").order("created_at");
  const users = (data ?? []) as Profile[];
  return <div className="grid gap-6"><div><p className="text-sm font-bold text-indigo-700">ADMIN</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Users</h1><p className="mt-1 text-sm text-slate-600">Invite workers and control their role and access.</p></div><Notice>{notice.error ?? (error ? "Could not load users." : undefined)}</Notice><Notice tone="success">{notice.success}</Notice>
    <Card className="p-5"><div className="mb-4 flex items-center gap-2"><UserPlus className="size-5 text-indigo-600" /><h2 className="font-black text-slate-950">Create user</h2></div><form action={createUserAction} className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><Input name="full_name" required maxLength={120} /></Field><Field label="Email"><Input name="email" type="email" required autoCapitalize="none" autoCorrect="off" className="lowercase" /></Field><Field label="Role"><Select name="role" required>{ROLES.map((role) => <option key={role}>{role}</option>)}</Select></Field><Field label="Temporary password" hint="At least 6 characters. Share it securely."><PasswordInput id="admin-temporary-password" name="temporary_password" minLength={6} required autoComplete="new-password" /></Field><SubmitButton className="sm:col-span-2" pendingText="Creating user…">CREATE USER</SubmitButton></form></Card>
    <section><div className="mb-3 flex items-center gap-2"><Users className="size-5 text-slate-500" /><h2 className="font-black text-slate-950">Team</h2></div><div className="grid gap-3">{users.map((user) => <Card key={user.id} className="p-4"><form action={updateUserAction} className="grid items-end gap-3 sm:grid-cols-[1fr_180px_160px]"><input type="hidden" name="id" value={user.id} /><div><strong className="block text-slate-950">{user.full_name}</strong><span className="text-xs text-slate-500">{user.id}</span></div><Select name="role" defaultValue={user.role} aria-label={`Role for ${user.full_name}`}>{ROLES.map((role) => <option key={role}>{role}</option>)}</Select><div className="grid grid-cols-2 gap-2"><Select name="active" defaultValue={String(user.active)} aria-label={`Access for ${user.full_name}`}><option value="true">Active</option><option value="false">Inactive</option></Select><button className="min-h-12 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">SAVE</button></div></form></Card>)}</div></section>
  </div>;
}
