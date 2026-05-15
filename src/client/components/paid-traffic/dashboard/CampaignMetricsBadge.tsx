import { Badge } from "@client/components/ui/badge";
import { cn } from "@server/lib/utils";

interface CampaignMetricsBadgeProps {
  label: string;
  value: number | null | undefined;
  type: "ctr" | "cpc" | "roas";
}

function getColorClass(type: "ctr" | "cpc" | "roas", value: number): string {
  if (type === "ctr") {
    // CTR is stored as a decimal (0.02 = 2%)
    if (value > 0.02) return "border-transparent bg-green-100 text-green-700";
    if (value >= 0.01) return "border-transparent bg-orange-100 text-orange-700";
    return "border-transparent bg-red-100 text-red-700";
  }
  if (type === "cpc") {
    if (value < 1) return "border-transparent bg-green-100 text-green-700";
    if (value <= 3) return "border-transparent bg-orange-100 text-orange-700";
    return "border-transparent bg-red-100 text-red-700";
  }
  // roas
  if (value > 3) return "border-transparent bg-green-100 text-green-700";
  if (value >= 1) return "border-transparent bg-orange-100 text-orange-700";
  return "border-transparent bg-red-100 text-red-700";
}

function formatValue(type: "ctr" | "cpc" | "roas", value: number): string {
  if (type === "ctr") return `${(value * 100).toFixed(2)}%`;
  if (type === "cpc") return `R$${value.toFixed(2)}`;
  return `${value.toFixed(2)}×`;
}

export function CampaignMetricsBadge({ label, value, type }: CampaignMetricsBadgeProps) {
  if (value === null || value === undefined) {
    return (
      <Badge className="border-transparent bg-gray-100 text-gray-500">
        {label}: Sem dados
      </Badge>
    );
  }

  return (
    <Badge className={cn("font-mono", getColorClass(type, value))}>
      {label}: {formatValue(type, value)}
    </Badge>
  );
}
