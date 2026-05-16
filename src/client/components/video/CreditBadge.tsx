"use client";

import { Badge } from "@client/components/ui/badge";
import { Video } from "lucide-react";

interface CreditBadgeProps {
  used: number;
  total: number;
  renewalDate?: string;
}

export function CreditBadge({ used, total, renewalDate }: CreditBadgeProps) {
  const remaining = total - used;
  const isEmpty = remaining <= 0;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
      <Video className={`h-4 w-4 ${isEmpty ? "text-red-400" : "text-blue-500"}`} />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-gray-700">
          {isEmpty ? (
            <span className="text-red-500">Créditos esgotados</span>
          ) : (
            <span>{remaining} crédito{remaining !== 1 ? "s" : ""} restante{remaining !== 1 ? "s" : ""}</span>
          )}
        </span>
        {renewalDate && (
          <span className="text-xs text-gray-400">Renova em {renewalDate}</span>
        )}
      </div>
      <Badge
        className={`ml-2 text-xs ${
          isEmpty
            ? "bg-red-100 text-red-600"
            : remaining <= 2
            ? "bg-orange-100 text-orange-600"
            : "bg-blue-50 text-blue-600"
        }`}
      >
        {remaining}/{total}
      </Badge>
    </div>
  );
}
