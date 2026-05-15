"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";

interface BudgetAiJustificationProps {
  campaignName: string;
  justification: string;
  dataConfidence: "sufficient" | "insufficient";
}

export function BudgetAiJustification({
  campaignName,
  justification,
  dataConfidence,
}: BudgetAiJustificationProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Ocultar" : "Ver"} justificativa da IA para ${campaignName}`}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Ocultar justificativa
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Ver justificativa da IA
            </>
          )}
        </Button>

        {dataConfidence === "insufficient" && (
          <Badge variant="warning" className="text-xs">
            Dados insuficientes
          </Badge>
        )}
      </div>

      {expanded && (
        <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600 leading-relaxed">
          {justification}
        </div>
      )}
    </div>
  );
}
