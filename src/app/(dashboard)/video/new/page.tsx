import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { VideoWizard } from "@client/components/video/VideoWizard";

export default function NewVideoPage() {
  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Novo Vídeo com IA</h1>
          <p className="text-sm text-gray-500 mt-1">
            Envie um vídeo do seu negócio e a IA criará um reel profissional de marketing.
          </p>
        </div>
        <VideoWizard />
      </div>
    </DashboardLayout>
  );
}
