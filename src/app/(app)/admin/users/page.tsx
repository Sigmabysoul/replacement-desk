import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { createUserAction, updateUserAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Profile, type Role } from "@/lib/types";

function getUserRoles(user: Profile): Role[] {
  if (user.roles && user.roles.length > 0) {
    return user.roles;
  }
  return user.role ? [user.role] : [];
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireProfile(["ADMIN"]);
  const notice = await searchParams;
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("*").order("created_at");
  const users = (data ?? []) as Profile[];

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-bold text-indigo-700">ADMIN</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Users & Access Control
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Invite workers and assign one or more operational roles to each team member.
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

            return (
              <Card key={user.id} className="p-4 sm:p-5">
                <form action={updateUserAction} className="grid gap-4">
                  <input type="hidden" name="id" value={user.id} />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                        <Field label="Full name" hint={user.id}>
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
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </Select>
                        </Field>
                      </div>
                    </div>

                    <div className="sm:pt-6">
                      <button
                        type="submit"
                        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 sm:w-auto"
                      >
                        SAVE USER
                      </button>
                    </div>
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
                </form>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
