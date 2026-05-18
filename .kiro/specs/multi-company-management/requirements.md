# Requirements Document

## Introduction

Esta funcionalidade transforma a plataforma de marketing digital de um modelo 1 usuário → 1 empresa para um modelo 1 usuário → N empresas (carteira de clientes). O objetivo é atender usuários do plano Agência, que gerenciam múltiplas empresas clientes a partir de um único login. Ao fazer login, o usuário vê uma lista de todas as suas empresas e seleciona qual deseja operar. Toda a sessão de trabalho (posts, agendamentos, tráfego pago, vídeos, redes sociais) ocorre no contexto da empresa selecionada. O plano/assinatura permanece no nível do usuário.

## Glossary

- **User**: Usuário autenticado na plataforma, dono da conta e da assinatura.
- **Company**: Empresa cliente gerenciada pelo usuário dentro da plataforma. Um usuário pode possuir múltiplas Companies.
- **Portfolio**: Conjunto de todas as Companies pertencentes a um User.
- **Active_Company**: A Company atualmente selecionada pelo usuário para operar. Persiste na sessão JWT.
- **Company_Selector**: Interface de tela que lista o Portfolio e permite ao usuário escolher ou criar uma Company.
- **Company_Context**: Estado de aplicação que carrega e disponibiliza os dados da Active_Company para todos os componentes da interface.
- **Session**: Sessão autenticada JWT do User, que armazena o `userId` e o `activeCompanyId`.
- **Plan**: Plano de assinatura do User (ex.: Básico, Profissional, Agência). Vinculado ao User, não à Company.
- **Onboarding**: Fluxo de configuração de dados de identidade de uma Company (nome, setor, cores, logo, tom).
- **API_Route**: Endpoint da API Next.js que processa requisições do frontend.

---

## Requirements

### Requirement 1: Modelo de dados — Usuário com múltiplas empresas

**User Story:** Como desenvolvedor, quero que o schema de dados suporte a relação 1:N entre User e Company, para que um único usuário possa gerenciar múltiplas empresas.

#### Acceptance Criteria

1. THE Platform SHALL suportar a associação de 1 ou mais Companies a um User sem limite máximo imposto pelo esquema de dados, substituindo a restrição `@unique` existente no campo `userId` do modelo Company.
2. THE Platform SHALL manter o campo `companyId` como referência obrigatória e não-nula em todos os modelos de dados existentes (Post, SocialAccount, CostLog, AdCampaign, AdPlatformCredential, AutomationRule, CampaignAuditLog, VideoJob, VideoCredit).
3. THE Platform SHALL garantir que cada Company pertença a exatamente um User via campo `userId` no modelo Company.
4. IF um User for excluído, THEN THE Platform SHALL excluir em cascata todos os registros vinculados: Companies, Posts, PostVariants, SocialAccounts, CostLogs, AdCampaigns, AdMetricSnapshots, AdPlatformCredentials, AutomationRules, RuleExecutionLogs, CampaignAuditLogs, AbTests, VideoJobs e VideoCredits, de forma atômica.
5. IF qualquer parte da exclusão em cascata falhar, THEN THE Platform SHALL reverter toda a operação e retornar erro, preservando User e todos os registros no estado anterior.
6. IF uma tentativa de criar uma Company for realizada sem um `userId` válido, THEN THE Platform SHALL rejeitar a operação com mensagem de erro explicativa.

---

### Requirement 2: Seletor de empresa na entrada

**User Story:** Como usuário do plano Agência, quero ver uma lista das minhas empresas ao fazer login, para que eu possa escolher qual empresa operar sem precisar sair e entrar novamente.

#### Acceptance Criteria

1. WHEN o User completa a autenticação e não há `activeCompanyId` na sessão, THE Company_Selector SHALL ser exibida listando todas as Companies do Portfolio do User em ordem alfabética pelo nome.
2. IF o User possui exatamente uma Company no Portfolio e já possui `activeCompanyId` válido na sessão, THEN THE Platform SHALL redirecionar diretamente para o dashboard sem exibir o Company_Selector.
3. THE Company_Selector SHALL exibir para cada Company: nome (máximo 200 caracteres exibidos), logo da Company quando disponível ou avatar genérico quando não disponível, e setor.
4. WHEN o User seleciona uma Company no Company_Selector, THE Session SHALL armazenar o `activeCompanyId` correspondente e THE Platform SHALL redirecionar para o dashboard; IF o armazenamento do `activeCompanyId` na sessão falhar, THEN THE Platform SHALL exibir mensagem de erro e manter o User no Company_Selector sem alterar o estado da sessão.
5. IF o Portfolio do User estiver vazio, THEN THE Company_Selector SHALL exibir exclusivamente a opção de criar a primeira Company, sem listar Companies.
6. IF o carregamento do Portfolio falhar por erro técnico, THEN THE Company_Selector SHALL exibir mensagem de erro e disponibilizar ação para tentar novamente, sem redirecionar o User.

---

### Requirement 3: Persistência da empresa ativa na sessão

**User Story:** Como usuário, quero que a empresa que selecionei seja lembrada durante toda a sessão, para que eu não precise selecioná-la novamente ao navegar entre páginas.

#### Acceptance Criteria

1. WHEN o User seleciona uma Company no Company_Selector, THE Session SHALL armazenar o `activeCompanyId` no JWT.
2. WHILE o User navega entre páginas do dashboard, THE Company_Context SHALL manter o `activeCompanyId` ativo sem exigir nova seleção.
3. WHEN o User realiza logout e faz login novamente, THE Session SHALL iniciar sem `activeCompanyId`, exigindo nova seleção no Company_Selector.
4. WHEN o User acessa qualquer página do dashboard, IF o `activeCompanyId` armazenado na sessão não corresponder a uma Company cujo `userId` seja igual ao `userId` do User autenticado, THEN THE Platform SHALL redirecionar o User para o Company_Selector e limpar o `activeCompanyId` da sessão antes de exibir qualquer conteúdo da página solicitada.
5. WHEN o User acessa qualquer página do dashboard, IF o `activeCompanyId` estiver ausente da sessão, THEN THE Platform SHALL redirecionar o User para o Company_Selector antes de exibir qualquer conteúdo da página solicitada.

---

### Requirement 4: Troca de empresa durante a sessão

**User Story:** Como usuário do plano Agência, quero poder trocar de empresa sem precisar fazer logout, para que eu alterne rapidamente entre os clientes enquanto trabalho.

#### Acceptance Criteria

1. THE Sidebar SHALL exibir o nome e o logo da Active_Company em área permanentemente visível durante toda a sessão de trabalho.
2. WHEN o User clica no seletor de empresa na Sidebar, THE Company_Selector SHALL ser exibida como overlay ou página, listando todas as Companies do Portfolio; IF as Companies falharem ao carregar, THEN THE Company_Selector SHALL ser exibida com indicação do erro de carregamento.
3. WHEN o User seleciona uma Company diferente da Active_Company no Company_Selector durante a sessão, THE Session SHALL atualizar o `activeCompanyId` e THE Platform SHALL recarregar o Company_Context com os dados da nova Active_Company.
4. WHEN o User troca de empresa, THE Platform SHALL redirecionar para o dashboard da nova Active_Company.
5. IF a atualização da sessão ou o recarregamento do Company_Context falhar durante a troca, THEN THE Platform SHALL reverter a sessão e o Company_Context para o estado anterior e notificar o User com mensagem de erro.

---

### Requirement 5: Criação de nova empresa

**User Story:** Como usuário do plano Agência, quero adicionar novas empresas à minha carteira, para que eu passe a gerenciá-las na plataforma.

#### Acceptance Criteria

1. THE Company_Selector SHALL disponibilizar uma ação explícita para criar uma nova Company.
2. WHEN o User aciona a criação de nova Company, THE Platform SHALL exibir o fluxo de Onboarding para preenchimento dos dados da nova Company.
3. WHEN o Onboarding é concluído com nome que satisfaz as regras de validação, THE Platform SHALL criar a Company no Portfolio do User com status ativo.
4. WHEN uma nova Company é criada, THE Platform SHALL definir esta Company como Active_Company e redirecionar o User para o dashboard.
5. WHEN o User submete o formulário de Onboarding, THE Platform SHALL validar que o nome da Company possui entre 2 e 200 caracteres; IF a validação falhar, THEN THE Platform SHALL exibir mensagem de erro e preservar os dados preenchidos no formulário.
6. IF o Portfolio do User já contiver 20 Companies, THEN THE Platform SHALL exibir mensagem informativa descrevendo o motivo e impedir a criação de nova Company.
7. IF o nome da Company não satisfizer as regras de validação no momento do submit, THEN THE Platform SHALL exibir mensagem de erro específica e preservar os dados preenchidos no Onboarding sem criar o registro.
8. IF ocorrer erro técnico durante a criação da Company, THEN THE Platform SHALL exibir mensagem de erro descritiva e preservar os dados preenchidos no Onboarding.

---

### Requirement 6: Edição e remoção de empresa

**User Story:** Como usuário, quero editar os dados de uma empresa ou removê-la da minha carteira, para que as informações estejam sempre atualizadas e eu possa encerrar clientes inativos.

#### Acceptance Criteria

1. WHEN o User acessa as configurações de uma Company, THE Onboarding SHALL ser exibido preenchido com os dados atuais da Company para edição; IF os dados atuais falharem ao carregar, THEN THE Platform SHALL exibir mensagem de erro e manter o User no contexto atual sem alterar dados da Company.
2. WHEN o User salva alterações com dados válidos no Onboarding, THE Platform SHALL atualizar os dados da Company e exibir feedback visual indicando que a atualização foi concluída com sucesso.
3. THE Platform SHALL disponibilizar uma ação de remoção de Company nas configurações da Company.
4. WHEN o User aciona a remoção de uma Company, THE Platform SHALL exibir confirmação explícita informando que todos os dados vinculados (posts, campanhas, conexões sociais, histórico) serão permanentemente excluídos, independentemente do caminho utilizado para acionar a remoção.
5. WHEN o User confirma a remoção de uma Company, THE Platform SHALL excluir atomicamente a Company e todos os seus dados associados; IF a operação de remoção falhar, THEN THE Platform SHALL notificar o User com mensagem de erro descritiva e manter a Company e todos os seus dados intactos.
6. WHEN a Company removida era a Active_Company, THE Platform SHALL redirecionar o User para o Company_Selector; WHEN a Company removida não era a Active_Company, THE Platform SHALL manter o User no contexto atual sem redirecionar.
7. IF o User salvar alterações com dados inválidos no Onboarding, THEN THE Platform SHALL exibir mensagem de erro específica e preservar os dados preenchidos no formulário sem atualizar o registro.

---

### Requirement 7: Isolamento de dados por empresa

**User Story:** Como usuário, quero que os dados de cada empresa sejam completamente separados, para que as informações de um cliente nunca apareçam misturadas com as de outro.

#### Acceptance Criteria

1. WHEN uma API_Route recebe requisição de leitura ou escrita, THE API_Route SHALL verificar que o `companyId` alvo corresponde ao `activeCompanyId` presente na sessão do User autenticado antes de prosseguir.
2. IF o `activeCompanyId` na sessão do User autenticado não corresponder a uma Company autorizada, THEN THE API_Route SHALL retornar HTTP 403 sem prosseguir com a operação.
3. WHEN uma API_Route carrega dados para exibição, THE API_Route SHALL retornar exclusivamente registros cujo `companyId` corresponda ao `activeCompanyId` da sessão do User autenticado.
4. IF uma requisição tentar acessar dados de uma Company cujo `userId` não seja igual ao `userId` do User autenticado, THEN THE API_Route SHALL retornar HTTP 403 com corpo de resposta que não indica se o recurso solicitado existe.

---

### Requirement 8: Plano e assinatura no nível do usuário

**User Story:** Como usuário do plano Agência, quero que meu plano se aplique a todas as minhas empresas, para que eu não precise pagar por cada empresa individualmente.

#### Acceptance Criteria

1. THE Platform SHALL verificar o plano e a assinatura no nível do User, não da Company, para conceder ou restringir acesso a funcionalidades.
2. THE Plan_Guard SHALL utilizar o `userId` da sessão para verificar elegibilidade ao Tráfego Pago com IA e demais features restritas por plano.
3. IF o plano do User for Agência, THEN THE Platform SHALL permitir ao User associar mais de 1 Company ao seu Portfolio.
4. IF o plano do User for inferior ao plano Agência, THEN THE Platform SHALL limitar o Portfolio a no máximo 1 Company.
5. IF o plano do User for inferior ao plano Agência, THEN THE Company_Selector SHALL não ser exibido no fluxo de login; o User SHALL ser redirecionado diretamente para o dashboard da sua única Company.
6. IF o plano do User for inferior ao plano Agência e o User tentar adicionar uma segunda Company, THEN THE Platform SHALL rejeitar a operação com mensagem informando a limitação do plano atual.

---

### Requirement 9: Compatibilidade com a sessão JWT e API routes existentes

**User Story:** Como desenvolvedor, quero que as API routes existentes resolvam o `companyId` a partir da sessão sem exigir que o frontend envie o `companyId` em cada requisição, para que a integração seja segura e consistente.

#### Acceptance Criteria

1. WHEN uma API_Route processa uma requisição, THE API_Route SHALL resolver o `activeCompanyId` exclusivamente a partir do token JWT, sem aceitar `companyId` proveniente do body, query string ou route params como fonte de autorização.
2. IF uma API_Route precisar do `companyId`, THEN THE API_Route SHALL verificar que a Company cujo `id` corresponde ao `activeCompanyId` do JWT possui `userId` igual ao `userId` do User autenticado antes de prosseguir.
3. WHEN o User seleciona ou troca de empresa, THE Platform SHALL propagar o novo `activeCompanyId` no token JWT usando o callback `jwt` do NextAuth.
4. IF o token JWT não contiver `activeCompanyId` ou contiver valor nulo ou vazio, e a API_Route operar sobre dados de Company, THEN THE API_Route SHALL retornar HTTP 401 com mensagem indicando que nenhuma empresa está selecionada.

---

### Requirement 10: Experiência de navegação com contexto visual da empresa ativa

**User Story:** Como usuário, quero que a interface sempre mostre claramente qual empresa estou operando, para que eu nunca execute ações na empresa errada.

#### Acceptance Criteria

1. THE Sidebar SHALL exibir o nome da Active_Company em área continuamente renderizada e visível ao usuário sem necessidade de rolagem ou interação adicional.
2. IF o logo da Active_Company estiver disponível e carregar com sucesso, THEN THE Sidebar SHALL exibir o logo no lugar do avatar genérico; IF o logo não estiver disponível ou falhar ao carregar, THEN THE Sidebar SHALL exibir um avatar genérico com a inicial do nome da Company.
3. THE Company_Selector SHALL indicar qual Company está atualmente ativa por meio de estado visual distinguível das demais Companies por ao menos um indicador persistente além do nome.
4. WHEN o User navega entre páginas do dashboard, THE Sidebar SHALL manter o nome e logo da Active_Company sem que esses elementos desapareçam da interface durante a transição de navegação.
5. WHEN o Company_Context está sendo carregado, THE Sidebar SHALL exibir indicador de carregamento na área do nome e logo da Active_Company até que os dados estejam disponíveis.
