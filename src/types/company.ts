/** Representação resumida usada na listagem do seletor */
export interface CompanySummary {
  id: string;
  name: string;
  sector: string | null;
  logoUrl: string | null;
}

export interface SocialAccountSummary {
  platform: string;
  connected: boolean;
  profileName: string | null;
}

/** Representação completa com redes sociais */
export interface CompanyFull extends CompanySummary {
  description: string | null;
  objective: string | null;
  tone: string;
  colors: string[];
  socialAccounts: SocialAccountSummary[];
  createdAt: string; // ISO-8601
}

/** Input de criação/atualização de empresa */
export interface CompanyInput {
  name: string; // 2–200 chars
  description?: string;
  sector?: string;
  objective?: string;
  tone?: string;
  colors?: string[];
  driveUrl?: string;
}

/** Resposta do endpoint de seleção */
export interface SelectCompanyResponse {
  ok: true;
  activeCompanyId: string;
}

/** Payload do endpoint de seleção */
export interface SelectCompanyBody {
  companyId: string;
}

/** Resultado de validação de guarda de plano */
export interface PlanLimitResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number; // 1 para planos < Agência, 20 para Agência
  planName: string;
}

/** Valor exposto pelo CompanyContext */
export interface CompanyContextValue {
  /** Dados completos da empresa ativa (null durante carregamento inicial) */
  company: CompanyFull | null;
  /** true enquanto o primeiro carregamento está em andamento */
  isLoading: boolean;
  /** Mensagem de erro se o carregamento falhou */
  error: string | null;
  /** Invalida o cache e recarrega os dados da empresa ativa */
  refresh: () => Promise<void>;
}
