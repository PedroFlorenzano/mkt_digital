import { PlanGateGuard } from "@client/components/paid-traffic/PlanGateGuard";

export default function PaidTrafficLayout({ children }: { children: React.ReactNode }) {
  return <PlanGateGuard>{children}</PlanGateGuard>;
}
