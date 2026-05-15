import { CampaignWizard } from "@client/components/paid-traffic/wizard/CampaignWizard";

export default function NewCampaignPage() {
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Nova Campanha de Tráfego Pago</h1>
      <CampaignWizard />
    </div>
  );
}
