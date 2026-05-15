"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Badge } from "@client/components/ui/badge";

const ELIGIBLE_PLANS = ["Profissional", "Agencia"];

interface PlanGateGuardProps {
  children: React.ReactNode;
}

interface UserPlan {
  name: string;
}

export function PlanGateGuard({ children }: PlanGateGuardProps) {
  const { data: session, status: sessionStatus } = useSession();
  const [plan, setPlan] = useState<UserPlan | null | undefined>(undefined); // undefined = loading
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!session?.user) {
      setPlan(null);
      return;
    }

    fetch("/api/user/plan")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch plan");
        return res.json() as Promise<{ plan: UserPlan | null }>;
      })
      .then((data) => setPlan(data.plan ?? null))
      .catch(() => {
        setLoadError(true);
        setPlan(null);
      });
  }, [session, sessionStatus]);

  // Loading skeleton
  if (sessionStatus === "loading" || plan === undefined) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-4 w-96 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const hasAccess = plan !== null && ELIGIBLE_PLANS.includes(plan.name) && !loadError;

  if (hasAccess) {
    return <>{children}</>;
  }

  // Upgrade gate UI
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-6">
      <Card className="w-full max-w-lg text-center shadow-md">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-xl">Recurso exclusivo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <p className="text-sm text-gray-500 leading-relaxed">
            O módulo de Tráfego Pago com IA está disponível nos planos Profissional e Agência.
            Automatize suas campanhas no Meta Ads e Google Ads com inteligência artificial.
          </p>

          <div className="flex gap-2">
            <Badge variant="purple">Profissional</Badge>
            <Badge variant="default">Agência</Badge>
          </div>

          <Button variant="default" asChild className="w-full sm:w-auto">
            <Link href="/onboarding">Fazer upgrade</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
