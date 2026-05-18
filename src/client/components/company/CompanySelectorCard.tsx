"use client";

import * as React from "react";
import { cn } from "@server/lib/utils";
import type { CompanySummary } from "@/types/company";

// ─── Check icon (inline SVG — no extra dependency) ───────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0
           011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ─── Deterministic avatar color from company name ────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
] as const;

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-blue-500";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CompanySelectorCardProps {
  company: CompanySummary;
  /** When true, renders with an active indicator (blue border + checkmark). */
  isActive: boolean;
  /** When true, renders a skeleton placeholder and disables interaction. */
  isLoading?: boolean;
  onClick: () => void;
}

// ─── Skeleton state ───────────────────────────────────────────────────────────

function CompanySelectorCardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando empresa…"
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
    >
      {/* Avatar skeleton */}
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-gray-200" />
      {/* Text skeletons */}
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Card that represents a single company in the company-selector UI.
 *
 * - Shows the company logo when `logoUrl` is set; otherwise a colored avatar
 *   with the first letter of the company name.
 * - Shows the company name (capped at 200 chars) and its sector
 *   (or "Sem setor" when null).
 * - When `isActive` is true, renders a blue border + checkmark to indicate the
 *   currently selected company.
 * - When `isLoading` is true, renders an animated skeleton placeholder.
 */
export function CompanySelectorCard({
  company,
  isActive,
  isLoading = false,
  onClick,
}: CompanySelectorCardProps) {
  if (isLoading) {
    return <CompanySelectorCardSkeleton />;
  }

  // Enforce max-200-char display (data layer may allow more)
  const displayName = company.name.slice(0, 200);
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(company.name);

  return (
    <button
      type="button"
      // Use role="option" when this card is rendered inside a listbox; callers
      // should wrap the list with role="listbox" and aria-label.
      role="option"
      aria-selected={isActive}
      aria-label={`${displayName}${isActive ? " — empresa ativa" : ""}`}
      onClick={onClick}
      className={cn(
        // Base
        "relative flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left",
        // Focus ring
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        // Hover
        "hover:shadow-md",
        // Active state
        isActive
          ? "border-blue-500 shadow-sm ring-1 ring-blue-500/20"
          : "border-gray-100 shadow-sm hover:border-gray-200"
      )}
    >
      {/* ── Logo or colored avatar ── */}
      <div className="shrink-0">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={`Logo de ${displayName}`}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full",
              "text-lg font-bold text-white",
              avatarColor
            )}
            aria-hidden="true"
          >
            {avatarLetter}
          </div>
        )}
      </div>

      {/* ── Company name + sector ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-gray-900">
          {displayName}
        </span>
        <span className="mt-0.5 truncate text-xs text-gray-500">
          {company.sector ?? "Sem setor"}
        </span>
      </div>

      {/* ── Active checkmark ── */}
      {isActive && (
        <div aria-hidden="true" className="ml-2 shrink-0 text-blue-500">
          <CheckIcon className="h-5 w-5" />
        </div>
      )}
    </button>
  );
}
