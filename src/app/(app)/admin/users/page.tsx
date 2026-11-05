import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { createUserAction, deleteUserAction, updateUserAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { getProfileRoles, requireProfile } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { ROLES, type Profile, type Role } from "@/lib/types";

function getUserRoles(user: Profile): Role[] {
  return getProfileRoles(user);
}

type UserWithEmail = Profile & { email?: string | null };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const currentActor = await requireProfile(["ADMIN"]);
  const notice = await searchParams;

  let users: UserWithEmail[] = [];
  let error: unknown = null;
  try {
    const rows = await sql<UserWithEmail[]>`
      SELECT p.*, u.email
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      ORDER BY p.created_at ASC
    `;
    users = rows;
  } catch (err: unknown) {
    error = err;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600"
        >
          <ArrowLeft className="size-4" /> Back to Profile
        </Link>
      </div>

      <div>
        <p className="text-sm font-bold text-indigo-700">ADMIN</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Users & Access Control
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Invite workers, edit passwords, adjust roles, or remove accounts.
        </p>
      </div>

      <Notice>{notice.error ?? (error ? "Could not load users." : undefined)}</Notice>
      <Notice tone="success">{notice.success}</Notice>

      {/* Create User Card */}
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="size-5 text-indigo-600" />
          <h2 className="font-black text-slate-950">Create team member</h2>
        </div>

        <form action={createUserAction} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input name="full_name" required maxLength={120} placeholder="e.g. Abid Khan" />
            </Field>

            <Field label="Email">
              <Input
                name="email"
                type="email"
                required
                autoCapitalize="none"
                autoCorrect="off"
                className="lowercase"
                placeholder="abid@example.com"
              />
            </Field>
          </div>

          <Field
            label="Temporary password"
            hint="At least 6 characters. Share it securely with the user."
          >
            <PasswordInput
              id="admin-temporary-password"
              name="temporary_password"
              minLength={6}
              required
              autoComplete="new-password"
            />
          </Field>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-700">
              Assigned Roles (Select all that apply)
            </label>
            <p className="mb-2 text-xs text-slate-500">
              Users can hold multiple roles (e.g. Packer + Printing, or Customer Support + HR).
            </p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className="inline-flex cursor-pointer select-none items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-900"
                >
                  <input
                    type="checkbox"
                    name="roles"
                    value={role}
                    defaultChecked={role === "PRINTING"}
                    className="size-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{role}</span>
                </label>
              ))}
            </div>
          </div>

          <SubmitButton pendingText="Creating user…">CREATE USER</SubmitButton>
        </form>
      </Card>

      {/* Team Members List */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-slate-500" />
            <h2 className="font-black text-slate-950">Team Members ({users.length})</h2>
          </div>
        </div>

        <div className="grid gap-4">
          {users.map((user) => {
            const userRoles = getUserRoles(user);
            const isSelf = user.id === currentActor.id;

            return (
              <Card key={user.id} className="p-4 sm:p-5 grid gap-4 border border-border/80">
                {/* Header: User identity & Delete button */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white font-black text-sm">
                      {user.full_name ? user.full_name.charAt(0).toUpperCase() : "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-950 truncate text-base">
                          {user.full_name}
                        </span>
                        {isSelf && (
                          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                            You (Current Account)
                          </span>
                        )}
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            user.active
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                              : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                          }`}
                        >
                          {user.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {user.email && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                          <Mail className="size-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{user.email}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Delete User Option */}
                  {!isSelf ? (
                    <form action={deleteUserAction}>
                      <input type="hidden" name="id" value={user.id} />
                      <ConfirmButton
                        variant="danger"
                        size="default"
                        message={`Are you sure you want to delete user "${user.full_name}" (${user.email || user.id})?\n\nTheir previous orders, logs, and uploads will be safely archived under your admin account.\n\nThis cannot be undone.`}
                        pendingText="Deleting…"
                        className="min-h-9 px-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-600 hover:text-white transition shadow-none"
                      >
                        <Trash2 className="size-3.5 mr-1.5" />
                        Delete User
                      </ConfirmButton>
                    </form>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400 italic">
                      Current user
                    </span>
                  )}
                </div>

                {/* Main Settings Form (includes Edit Password) */}
                <form action={updateUserAction} className="grid gap-4">
                  <input type="hidden" name="id" value={user.id} />

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Full name">
                      <Input
                        name="full_name"
                        required
                        maxLength={120}
                        defaultValue={user.full_name}
                      />
                    </Field>

                    <Field label="Account status">
                      <Select
                        name="active"
                        defaultValue={String(user.active)}
                        aria-label={`Access for ${user.full_name}`}
                      >
                        <option value="true">Active (Can log in)</option>
                        <option value="false">Inactive (Suspended)</option>
                      </Select>
                    </Field>

                    <Field
                      label="Edit Password"
                      hint="Leave blank to keep existing"
                    >
                      <PasswordInput
                        id={`edit-password-${user.id}`}
                        name="new_password"
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="New password (min 6 chars)"
                      />
                    </Field>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldCheck className="size-4 text-indigo-600" />
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Assigned Roles
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {ROLES.map((role) => {
                        const isChecked = userRoles.includes(role);
                        return (
                          <label
                            key={role}
                            className="inline-flex cursor-pointer select-none items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-900"
                          >
                            <input
                              type="checkbox"
                              name="roles"
                              value={role}
                              defaultChecked={isChecked}
                              className="size-4 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>{role}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <SubmitButton pendingText="Saving user…">
                      SAVE USER
                    </SubmitButton>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
