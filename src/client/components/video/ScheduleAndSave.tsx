"use client";

import { AlertCircle, Calendar, Loader2, Save } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Label } from "@client/components/ui/label";

interface ScheduleAndSaveProps {
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  saving: boolean;
  saveError: string;
  platforms: string[];
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export function ScheduleAndSave({
  scheduledAt,
  setScheduledAt,
  saving,
  saveError,
  platforms,
  onSave,
  onCancel,
  disabled,
}: ScheduleAndSaveProps) {
  const saveLabel = scheduledAt
    ? platforms.length > 1
      ? `Agendar em ${platforms.length} redes`
      : "Agendar post"
    : platforms.length > 1
      ? `Salvar em ${platforms.length} redes`
      : "Salvar post";

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-green-800">Agendamento e publicação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            Agendar publicação (opcional)
          </Label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-gray-400">
            Sem data: salva como rascunho. Com data: agenda automaticamente.
          </p>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="gradient"
            onClick={onSave}
            disabled={saving || disabled}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : scheduledAt ? (
              <>
                <Calendar className="h-4 w-4" />
                {saveLabel}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {saveLabel}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
