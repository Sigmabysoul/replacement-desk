"use client";

import { useRef, useState } from "react";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import { addOfflineCommentAction } from "@/app/offline-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/field";
import type { Profile } from "@/lib/types";

const QUICK_COMMENTS = [
  "📦 Packing underway",
  "🏷️ Shipping labels received",
  "🚚 Courier arriving for pickup",
  "✅ Handed over to driver",
  "📍 Reached destination hub",
  "📞 Customer contacted for delivery",
];

export function OfflineCommentComposer({
  orderId,
  profile,
}: {
  orderId: string;
  profile: Profile;
}) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const roleLabel = profile.roles?.length
    ? profile.roles.join(" + ")
    : profile.role;

  function appendQuickComment(text: string) {
    setMessage((prev) => {
      const next = prev ? `${prev} - ${text}` : text;
      return next;
    });
    textareaRef.current?.focus();
  }

  return (
    <form action={addOfflineCommentAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <input type="hidden" name="order_id" value={orderId} />

      {/* Composer Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-full bg-indigo-600 text-xs font-black text-white">
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-bold text-slate-800">{profile.full_name}</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-600">
            {roleLabel}
          </span>
        </div>

        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
          <MessageSquare className="size-3.5" /> Order updates & comments
        </span>
      </div>

      {/* Textarea Input */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          name="message"
          required
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type an internal note, delivery milestone, or update for the team…"
          className="min-h-20 resize-y border-slate-200 text-xs focus:border-indigo-400"
        />
      </div>

      {/* Quick Comment Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <Sparkles className="size-3 text-amber-500" /> Quick replies:
        </span>
        {QUICK_COMMENTS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => appendQuickComment(chip)}
            className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Submit Controls */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[11px] text-slate-400">
          {message.length} / 1000 characters
        </span>

        <SubmitButton
          disabled={!message.trim()}
          pendingText="Posting comment…"
          className="min-h-9 px-4 text-xs font-bold"
        >
          <Send className="size-3.5" />
          POST UPDATE
        </SubmitButton>
      </div>
    </form>
  );
}

