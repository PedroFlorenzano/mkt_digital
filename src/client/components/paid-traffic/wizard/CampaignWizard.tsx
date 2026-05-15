"use client";

import { useState } from "react";
import { cn } from "@server/lib/utils";
import { StepDescribeGoal } from "./StepDescribeGoal";
import { StepReviewAiDraft } from "./StepReviewAiDraft";
import { StepSelectPlatform } from "./StepSelectPlatform";
import type { CampaignDraft } from "@server/services/campaign.service";

const STEPS = [
  { number: 1, label: "Descrever objetivo" },
  { number: 2, label: "Revisar rascunho" },
  { number: 3, label: "Selecionar plataformas" },
] as const;

export function CampaignWizard() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<CampaignDraft | null>(null);

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <nav aria-label="Etapas do wizard">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, idx) => {
            const isCompleted = currentStep > step.number;
            const isActive = currentStep === step.number;
            return (
              <li key={step.number} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all",
                      isCompleted
                        ? "bg-blue-600 text-white"
                        : isActive
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "bg-gray-100 text-gray-400"
                    )}
                    aria-current={isActive ? "step" : undefined}
                  >
                    {isCompleted ? (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={cn(
                      "hidden sm:inline text-sm font-medium",
                      isActive ? "text-gray-900" : "text-gray-400"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-px flex-1 min-w-[24px] transition-all",
                      isCompleted ? "bg-blue-600" : "bg-gray-200"
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step content */}
      {currentStep === 1 && (
        <StepDescribeGoal
          onDraftGenerated={(d) => {
            setDraft(d);
            setCurrentStep(2);
          }}
        />
      )}

      {currentStep === 2 && draft && (
        <StepReviewAiDraft
          draft={draft}
          onContinue={(d) => {
            setDraft(d);
            setCurrentStep(3);
          }}
          onBack={() => setCurrentStep(1)}
        />
      )}

      {currentStep === 3 && draft && (
        <StepSelectPlatform
          draft={draft}
          onBack={() => setCurrentStep(2)}
        />
      )}
    </div>
  );
}
