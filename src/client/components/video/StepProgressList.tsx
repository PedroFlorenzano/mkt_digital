"use client";

import { CheckCircle2, Loader2, Clock, AlertCircle } from "lucide-react";

const STEPS = [
  { key: "extracting_frames",   label: "Extraindo frames",      description: "Analisando seu vídeo..." },
  { key: "generating_script",   label: "Gerando script",         description: "IA criando roteiro e prompts..." },
  { key: "transforming_frames", label: "Transformando imagens",  description: "Aplicando estilo de marketing..." },
  { key: "generating_narration",label: "Gerando narração",       description: "Amazon Polly sintetizando voz..." },
  { key: "assembling",          label: "Montando vídeo",         description: "ffmpeg combinando tudo..." },
  { key: "completed",           label: "Concluído",              description: "Vídeo pronto para download!" },
];

type StepStatus = "completed" | "active" | "waiting" | "error";

const PIPELINE_ORDER = [
  "queued",
  "extracting_frames",
  "frames_extracted",
  "generating_script",
  "script_generated",
  "transforming_frames",
  "frames_transformed",
  "generating_narration",
  "narration_generated",
  "assembling",
  "completed",
  "error",
];

function getStepStatus(stepKey: string, currentStatus: string): StepStatus {
  const currentIdx = PIPELINE_ORDER.indexOf(currentStatus);
  const stepIdx = PIPELINE_ORDER.indexOf(stepKey === "extracting_frames" ? "extracting_frames"
    : stepKey === "generating_script" ? "generating_script"
    : stepKey === "transforming_frames" ? "transforming_frames"
    : stepKey === "generating_narration" ? "generating_narration"
    : stepKey === "assembling" ? "assembling"
    : "completed");

  if (currentStatus === "error") {
    const errorIdx = currentIdx;
    if (stepIdx < errorIdx) return "completed";
    if (stepIdx === errorIdx) return "error";
    return "waiting";
  }

  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "active";
  return "waiting";
}

interface StepProgressListProps {
  currentStatus: string;
  stepDurations?: Array<{ step: string; durationMs: number }>;
}

export function StepProgressList({ currentStatus, stepDurations = [] }: StepProgressListProps) {
  const durationMap = Object.fromEntries(stepDurations.map((d) => [d.step, d.durationMs]));

  return (
    <ol className="space-y-3">
      {STEPS.map((step) => {
        const status = getStepStatus(step.key, currentStatus);
        const duration = durationMap[step.key];

        return (
          <li key={step.key} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {status === "completed" && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {status === "active" && (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              )}
              {status === "waiting" && (
                <Clock className="h-5 w-5 text-gray-300" />
              )}
              {status === "error" && (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                status === "completed" ? "text-gray-900"
                  : status === "active" ? "text-blue-700"
                  : status === "error" ? "text-red-600"
                  : "text-gray-400"
              }`}>
                {step.label}
                {duration !== undefined && status === "completed" && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">
                    {(duration / 1000).toFixed(1)}s
                  </span>
                )}
              </p>
              {status === "active" && (
                <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
