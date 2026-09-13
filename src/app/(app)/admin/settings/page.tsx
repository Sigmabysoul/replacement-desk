import { Bot, CheckCircle2, KeyRound, ShieldCheck, XCircle, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function Setting({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${configured ? "text-emerald-700" : "text-slate-500"}`}>
        {configured ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
        {configured ? "Configured" : "Not configured"}
      </span>
    </div>
  );
}

export default async function SettingsPage() {
  await requireProfile(["ADMIN"]);
  const bot = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const supabase = await createClient();
  const { data: recentNotifications } = await supabase
    .from("notifications")
    .select("id, type, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-bold text-indigo-700">ADMIN</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">System & Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Integrations, security posture, and notification audit logs.</p>
      </div>

      {/* Security & Optimization Posture */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="font-black text-slate-950">Security & Performance</h2>
            <p className="text-xs text-slate-500">Built-in protections & performance layers.</p>
          </div>
        </div>
        <Setting label="HTTP Security Headers (HSTS, NoSniff, X-Frame)" configured={true} />
        <Setting label="Binary Magic Byte File Validation" configured={true} />
        <Setting label="Client-Side Image Auto-Optimization (<1s uploads)" configured={true} />
        <Setting label="Login Brute-Force Rate Limiting" configured={true} />
        <Setting label="Progressive Web App (PWA) Mobile Install" configured={true} />
        <Setting label="Supabase WebSocket Realtime Updates" configured={true} />
      </Card>

      {/* Telegram Configuration */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <Bot className="size-5" />
          </span>
          <div>
            <h2 className="font-black text-slate-950">Telegram Notifications</h2>
            <p className="text-xs text-slate-500">Auto-retry on network blips. Failures never block workers.</p>
          </div>
        </div>
        <Setting label="Telegram Bot Token" configured={bot} />
        <Setting label="Esha Chat ID" configured={Boolean(process.env.TELEGRAM_ESHA_CHAT_ID)} />
        <Setting
          label="Logistics Chat ID"
          configured={Boolean(process.env.TELEGRAM_LOGISTICS_CHAT_ID)}
        />
        <Setting label="Printing Chat ID" configured={Boolean(process.env.TELEGRAM_PRINTING_CHAT_ID)} />
        <Setting label="Packing Chat ID" configured={Boolean(process.env.TELEGRAM_PACKING_CHAT_ID)} />
        <Setting label="Admin Chat ID" configured={Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID)} />
      </Card>

      {/* Recent Notification Deliveries */}
      {recentNotifications && recentNotifications.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Zap className="size-5" />
            </span>
            <div>
              <h2 className="font-black text-slate-950">Recent Notification Deliveries</h2>
              <p className="text-xs text-slate-500">Last dispatched automated alerts.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {recentNotifications.map((n) => (
              <div key={n.id} className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <span className="font-bold text-slate-800">{n.type}</span>
                  {n.error && <p className="mt-0.5 max-w-sm truncate text-rose-600">{n.error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-black uppercase text-[10px] ${n.status === "SENT" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                    {n.status}
                  </span>
                  <span className="text-slate-400">
                    {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="flex items-start gap-3 p-5">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-indigo-600" />
        <p className="text-sm leading-6 text-slate-600">
          Environment variables are managed by the deployment host. Service role keys and bot tokens stay server-side and are never sent to the browser.
        </p>
      </Card>
    </div>
  );
}
