import React from "react";
import { X } from "lucide-react";
import type { PageTutorial } from "../pageTutorials";

interface PageTutorialPopupProps {
  tutorial: PageTutorial;
  onDismiss: () => void;
}

/** First-visit orientation card for a sidebar page — see src/pageTutorials.ts for content and App.tsx for the once-per-user-per-page trigger. */
export function PageTutorialPopup({ tutorial, onDismiss }: PageTutorialPopupProps) {
  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
      <div className="bg-white text-slate-800 rounded-[28px] w-[95%] max-w-[440px] shadow-2xl border border-blue-100 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 bg-gradient-to-r from-[#1F3557] to-[#315C9F] text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">{tutorial.icon}</span>
            <h2 className="text-sm font-black uppercase tracking-wider truncate">{tutorial.title}</h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-white/80 hover:text-white cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-2.5 text-xs leading-relaxed">
          {tutorial.body.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="px-5 py-2 bg-[#315C9F] hover:bg-[#1F3557] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
