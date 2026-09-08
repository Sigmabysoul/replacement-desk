import { Bot, CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";

function Setting({ label, configured }: { label: string; configured: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0"><span className="text-sm font-semibold text-slate-700">{label}</span><span className={`inline-flex items-center gap-1.5 text-sm font-bold ${configured ? "text-emerald-700" : "text-slate-500"}`}>{configured ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}{configured ? "Configured" : "Not configured"}</span></div>;
}

export default async function SettingsPage() {
  await requireProfile(["ADMIN"]);
  const bot = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return <div className="mx-auto max-w-2xl"><p className="text-sm font-bold text-indigo-700">ADMIN</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Settings</h1><p className="mt-1 text-sm text-slate-600">Integration status only. Secrets are never displayed.</p><Card className="mt-6 p-5"><div className="mb-3 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Bot className="size-5" /></span><div><h2 className="font-black text-slate-950">Telegram notifications</h2><p className="text-xs text-slate-500">Failures never block workflow actions.</p></div></div><Setting label="Telegram bot" configured={bot} /><Setting label="Esha chat" configured={Boolean(process.env.TELEGRAM_ESHA_CHAT_ID)} /><Setting label="Printing chat" configured={Boolean(process.env.TELEGRAM_PRINTING_CHAT_ID)} /><Setting label="Packing chat" configured={Boolean(process.env.TELEGRAM_PACKING_CHAT_ID)} /><Setting label="Admin chat" configured={Boolean(process.env.TELEGRAM_ADMIN_CHAT_ID)} /></Card><Card className="mt-4 flex items-start gap-3 p-5"><KeyRound className="mt-0.5 size-5 shrink-0 text-indigo-600" /><p className="text-sm leading-6 text-slate-600">Change Telegram values in the Vercel project environment. The bot token is server-only and cannot be viewed in this app.</p></Card></div>;
}
