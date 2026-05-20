# Documento de Requisitos — Content Suite Expansion

## Introduction

Esta especificação documenta a expansão da suíte de criação de conteúdo da plataforma MKT Digital. A expansão adiciona três novos formatos de conteúdo (Carrossel, Reels e Stories), variações de imagem coerentes com a identidade visual da marca, impulsionamento inteligente de posts (Post Boost), análise estratégica de tráfego pago com sugestão de mudanças de rota e um conjunto de ferramentas de gestão do perfil Instagram com inteligência artificial.

A plataforma já conta com criação de posts, publicação nas redes sociais, módulo de tráfego pago, geração de vídeo curto e agendamento. A expansão se apoia na infraestrutura existente: Next.js App Router, TypeScript, Prisma com SQLite, AWS Bedrock (Claude Sonnet 4.6 para texto e Stable Diffusion Ultra para imagens) e as APIs de redes sociais já integradas.

---

## Glossary

- **Plataforma**: O sistema de marketing digital em expansão (Next.js + Prisma + AWS Bedrock).
- **Content_Generator**: Componente responsável por invocar o AWS Bedrock para geração de texto e imagem.
- **Carousel_Builder**: Componente responsável por montar, validar e armazenar posts no formato carrossel.
- **Slide**: Unidade individual de um carrossel, composta por uma imagem e um texto curto (headline). Armazenado como item em JSON serializado no campo `slidesJson` do Post.
- **Reel**: Vídeo curto de 15 a 60 segundos publicado no Instagram via `media_type=REELS`.
- **Story**: Conteúdo efêmero vertical (proporção 9:16) publicado no Instagram com duração de 24 horas, via `media_type=IMAGE` e `is_stories=true`.
- **Brand_Context**: Conjunto de atributos da empresa (paleta de cores, tom de voz, setor, objetivo) extraído do modelo `Company` do Prisma e enviado obrigatoriamente a todo prompt de geração de imagem.
- **Variation_Set**: Conjunto de exatamente 3 variações de conteúdo (texto ou imagem) geradas em uma única chamada ao Stable Diffusion Ultra.
- **Boost_Advisor**: Componente de IA que analisa um post publicado ou agendado e sugere a configuração de uma campanha de impulsionamento.
- **Boost_Campaign**: Campanha de anúncio criada especificamente para impulsionar um post existente, registrada no modelo `AdCampaign` com `campaignType = "boost"`.
- **Strategic_Analyst**: Componente de IA que analisa todas as campanhas ativas e métricas dos últimos 30 dias para gerar diagnóstico e sugestões de mudança de rota.
- **Route_Change**: Uma das 3 sugestões de ajuste estratégico geradas pelo Strategic_Analyst (ex.: migração de verba, novo público, pausa de criativo).
- **Bio_Generator**: Componente de IA que gera sugestões de bio para o Instagram com base no perfil da empresa.
- **Feed_Grid**: Visualização 3×3 simulada do feed do Instagram, exibindo posts publicados e agendados/rascunhos.
- **Profile_Auditor**: Componente de IA que recebe dados do perfil atual e retorna diagnóstico com pontuação e recomendações.
- **Post_Status_Published**: Status de post com valor `"published"` no campo `status` do modelo `Post`.
- **Confirmation_Event**: Ação explícita e registrável do usuário (clique em botão de confirmação na UI) que autoriza uma operação de alto impacto, gravada como `CampaignAuditLog` com `userDecision = "approved"`.

---

## Requirements

---

### Requirement 1: Criação de Carrossel com IA

**User Story:** Como criador de conteúdo, quero gerar um post no formato carrossel com múltiplas imagens criadas pela IA, para aumentar o engajamento nas minhas publicações do Instagram.

#### Critérios de Aceite

1. WHEN o usuário seleciona o formato "Carrossel" e aciona a geração, THE Content_Generator SHALL gerar entre 3 e 10 slides, onde cada slide contém uma imagem gerada pelo Stable Diffusion Ultra e uma headline de no máximo 60 caracteres.

2. WHEN a geração do carrossel for concluída com sucesso, THE Carousel_Builder SHALL armazenar os slides do carrossel como JSON serializado no campo `slidesJson` do modelo `Post`, compatível com SQLite (sem arrays nativos).

3. WHEN o usuário arrastar um slide para outra posição no editor de carrossel, THE Carousel_Builder SHALL salvar e exibir a nova ordem dos slides sem remover nem duplicar nenhum slide existente.

4. WHEN o usuário aciona "Publicar" em um post de carrossel no Instagram, THE Plataforma SHALL criar um container de carrossel via endpoint `POST /{profileId}/media` com `media_type=CAROUSEL_ALBUM` e `children` contendo os IDs de cada slide, seguido de chamada ao endpoint `/{profileId}/media_publish`.

5. IF o número de slides gerado pelo Content_Generator for menor que 3 ou maior que 10, THEN THE Carousel_Builder SHALL rejeitar o resultado, retornar um erro indicando o número de slides recebido e os limites válidos (mínimo 3, máximo 10), e não salvar nenhum dado.

6. THE Carousel_Builder SHALL garantir que, para qualquer carrossel válido armazenado, o número de slides satisfaz a condição `3 ≤ slides ≤ 10`.

7. IF a publicação de um carrossel no Instagram falhar na API, THEN THE Plataforma SHALL exibir a mensagem de erro retornada pela API do Instagram e manter o post com status `"draft"` no banco de dados. THE Plataforma SHALL prevent the post status from being changed to `"published"` whenever the Instagram API call fails, regardless of any intermediate processing state.

**Propriedades de Correção (para property-based testing):**

- **P1.1 — Invariante de cardinalidade:** Para qualquer conjunto de parâmetros de geração válidos, `slideCount` satisfaz `3 ≤ slideCount ≤ 10`.
- **P1.2 — Invariante de reordenação:** Para qualquer sequência de operações de reordenação aplicadas a um carrossel, o conjunto de IDs de slides após a reordenação é idêntico ao conjunto de IDs antes da reordenação (sem perdas nem duplicatas).

---

### Requirement 2: Publicação de Reels no Instagram

**User Story:** Como criador de conteúdo, quero publicar vídeos curtos no formato Reels no Instagram diretamente pela plataforma, para aproveitar o alcance orgânico desse formato.

#### Critérios de Aceite

1. WHEN o usuário seleciona o formato "Reels" e faz upload de um vídeo existente, THE Plataforma SHALL aceitar vídeos com duração entre 15 e 60 segundos e rejeitar vídeos fora desse intervalo com mensagem de erro indicando os limites permitidos (15 a 60 segundos). IF a validação de duração falhar, THE Plataforma SHALL exibir a mensagem de erro ao usuário antes de qualquer outra operação de upload ou publicação.

2. WHEN o usuário opta por usar o módulo de geração de vídeo existente na plataforma para criar o Reel, THE Content_Generator SHALL utilizar o pipeline de vídeo já implementado (extração de frames → transformação visual → narração → montagem) e garantir que o vídeo gerado tenha duração entre 15 e 60 segundos. IF o pipeline gerar um vídeo fora desse intervalo, THEN THE Content_Generator SHALL retornar um erro informando a duração gerada e os limites exigidos, sem prosseguir para publicação.

3. WHEN o usuário aciona a geração de legenda para Reels, THE Content_Generator SHALL gerar uma legenda de no máximo 2.200 caracteres e um conjunto de 5 a 30 hashtags relacionadas ao nicho e segmento do Brand_Context da empresa. IF a geração não produzir conteúdo de legenda, THEN THE Content_Generator SHALL retornar uma legenda vazia sem exibir erro.

4. WHEN o usuário aciona "Publicar" em um post de Reel no Instagram, e somente após validação das três condições — duração do vídeo entre 15 e 60 segundos, `SocialAccount.connected = true` para a plataforma Instagram e presença de URL de vídeo no campo `imageUrl` ou equivalente — THE Plataforma SHALL publicar o vídeo via endpoint `POST /{profileId}/media` com `media_type=REELS` e o campo `video_url` apontando para a URL pública do vídeo.

5. IF o upload do vídeo para Reels falhar na API do Instagram, THEN THE Plataforma SHALL exibir a mensagem de erro retornada pela API e manter o post com status `"error"` no banco de dados, sem realizar nova tentativa automática.

6. IF o usuário aciona "Publicar" para um Reel e qualquer uma das três validações do critério 4 falhar, THEN THE Plataforma SHALL exibir uma mensagem de validação indicando qual condição não foi atendida e manter o post com status `"draft"` no banco de dados, sem chamar a API do Instagram.

**Propriedades de Correção (para property-based testing):**

- **P2.1 — Invariante de duração:** Para qualquer vídeo submetido para publicação como Reel, a Plataforma rejeita o vídeo SE E SOMENTE SE a duração estiver fora do intervalo [15, 60] segundos.

---

### Requirement 3: Criação de Stories com IA

**User Story:** Como criador de conteúdo, quero gerar conteúdo no formato Stories do Instagram com a IA, para manter presença constante na plataforma com conteúdo efêmero e relevante.

#### Critérios de Aceite

1. WHEN o usuário seleciona o formato "Stories" e aciona a geração, THE Content_Generator SHALL gerar uma imagem com proporção 9:16 (vertical), com tolerância de ±1 pixel por dimensão para arredondamentos de resolução, com texto overlay gerado pela IA posicionado na região inferior da imagem (abaixo de 70% da altura total).

2. WHEN o usuário seleciona o formato "Stories" e aciona a geração, THE Content_Generator SHALL incluir no prompt enviado ao Stable Diffusion Ultra o valor do campo `objective` do modelo `Company` da empresa ativa, para alinhar o conteúdo visual ao objetivo de negócio.

3. WHEN o usuário aciona "Publicar" em um post de Story de imagem no Instagram, THE Plataforma SHALL publicar via endpoint `POST /{profileId}/media` com `media_type=IMAGE` e `is_stories=true`.

4. WHEN o usuário aciona "Publicar" em um post de Story de vídeo no Instagram, THE Plataforma SHALL publicar via endpoint `POST /{profileId}/media` com `media_type=VIDEO` e `is_stories=true`.

5. IF a publicação de um Story no Instagram falhar na API, THEN THE Plataforma SHALL exibir a mensagem de erro retornada pela API e manter o post com status `"error"` no banco de dados.

6. THE Plataforma SHALL armazenar o formato do Story com `format = "story"` no campo `format` do modelo `Post` e SHALL rejeitar qualquer agendamento com `scheduledAt` superior a 24 horas a partir do momento atual, retornando um erro de validação ao usuário.

7. IF a geração de imagem para Story retornar uma proporção diferente de 9:16 (fora da tolerância de ±1 pixel), THEN THE Content_Generator SHALL rejeitar o resultado e solicitar nova geração automaticamente até o limite de 2 tentativas. Após 2 tentativas sem sucesso, THE Content_Generator SHALL retornar um erro ao usuário indicando a falha na geração com a proporção correta.

**Propriedades de Correção (para property-based testing):**

- **P3.1 — Invariante de proporção:** Para qualquer imagem gerada para o formato Stories, a razão entre largura e altura satisfaz `width / height = 9 / 16` (com tolerância de ±1 pixel por dimensão).

---

### Requirement 4: Variações Coerentes com a Marca

**User Story:** Como gestor de marketing, quero que todas as imagens geradas pela IA respeitem obrigatoriamente a identidade visual da minha empresa, para garantir consistência de marca em todos os formatos de conteúdo.

#### Critérios de Aceite

1. WHEN o usuário aciona a geração de imagens para qualquer formato (post, carrossel, stories), THE Content_Generator SHALL incluir no prompt enviado ao Stable Diffusion Ultra o Brand_Context completo da empresa: os valores hexadecimais das cores cadastradas no campo `colors` do modelo `Company`, o tom de voz (`tone`) e o setor (`sector`).

2. WHEN o usuário aciona a geração de imagens para qualquer formato, THE Content_Generator SHALL retornar um Variation_Set com exatamente 3 variações de imagem, onde nenhuma variação é visualmente idêntica às demais e todas são geradas com o Brand_Context do critério 1.

3. WHEN o usuário aciona "Gerar mais variações", THE Content_Generator SHALL gerar exatamente 3 novas variações de imagem adicionais e acrescentá-las às variações já exibidas na sessão (da abertura até o fechamento ou reinicialização explícita do formulário de criação pelo usuário), sem remover as variações anteriores.

4. IF o perfil da empresa não tiver paleta de cores cadastrada (campo `colors` nulo ou vazio), THEN THE Content_Generator SHALL utilizar um Brand_Context parcial composto apenas pelos campos `tone` e `sector` que estiverem preenchidos, e exibir ao usuário um aviso indicando que a consistência visual é limitada sem paleta de cores definida.

5. IF o Stable Diffusion Ultra retornar erro ou não responder em até 60 segundos durante a geração de imagens, THEN THE Content_Generator SHALL exibir uma mensagem de erro ao usuário indicando a falha na geração e não salvar nenhum dado de imagem parcial. IF o Stable Diffusion Ultra retornar uma combinação de imagens bem-sucedidas e erros, THE Content_Generator SHALL discard all results including the successful images and display only the error message to the user, without saving any partial image data.

**Propriedades de Correção (para property-based testing):**

- **P4.1 — Invariante de Brand_Context no prompt:** Para qualquer chamada de geração de imagem com paleta de cores cadastrada, o prompt enviado ao Stable Diffusion Ultra contém os valores hexadecimais de todas as cores do campo `colors` da empresa.
- **P4.2 — Invariante de cardinalidade de variações:** Para qualquer Variation_Set retornado, `count(variations) = 3`.
- **P4.3 — Invariante de acumulação de variações:** Após N chamadas de "Gerar mais variações" dentro de uma mesma sessão, o conjunto exibido ao usuário contém exatamente `3 + (N × 3)` variações, sem duplicatas e sem remoção de variações anteriores.

---

### Requirement 5: Turbinação de Posts (Post Boost)

**User Story:** Como anunciante, quero solicitar o impulsionamento de um post existente com sugestão inteligente da IA, para ampliar o alcance do conteúdo de melhor desempenho sem precisar configurar manualmente uma campanha no Ads Manager.

#### Critérios de Aceite

1. WHEN o usuário seleciona um post com status `"published"` ou `"scheduled"` e aciona "Turbinar", THE Boost_Advisor SHALL analisar o conteúdo do post (texto, imagem, plataforma de destino) e retornar uma sugestão de configuração contendo: objetivo recomendado, público-alvo sugerido, orçamento diário inicial em BRL no intervalo de R$ 5,00 a R$ 300,00, e duração sugerida em dias no intervalo de 1 a 30 dias.

2. WHEN o usuário aciona "Turbinar" em um post e a empresa possui credenciais de Meta Ads ou Google Ads válidas vinculadas (`AdPlatformCredential.isValid = true`), THE Boost_Advisor SHALL utilizar o Brand_Context da empresa para personalizar o público-alvo sugerido e o objetivo recomendado, alinhando-os ao setor e objetivo de negócio cadastrados no perfil.

3. WHEN o usuário aprova a sugestão de boost e a empresa possui credenciais válidas vinculadas, THE Plataforma SHALL solicitar ao usuário uma Confirmation_Event explícita antes de criar o registro `AdCampaign` e antes de criar qualquer campanha na plataforma de anúncios.

4. WHEN o usuário confirma a criação do boost (Confirmation_Event registrado como `CampaignAuditLog` com `userDecision = "approved"`), THE Plataforma SHALL criar o registro `AdCampaign` com `campaignType = "boost"` e `boostConfirmedAt` preenchido, e em seguida acionar a criação da campanha na plataforma de anúncios correspondente, registrando o resultado no campo `externalCampaignId`. IF the Confirmation_Event fails to register due to a technical issue after the user has already confirmed, THE Plataforma SHALL block campaign creation until the Confirmation_Event is successfully registered and SHALL not proceed with any AdCampaign creation or ad platform API calls until registration succeeds.

5. IF o usuário não possuir credenciais de anúncios válidas vinculadas, THEN THE Boost_Advisor SHALL gerar um briefing de boost em texto formatado (objetivo, público, orçamento, duração) para que o usuário configure manualmente no Ads Manager externo, sem criar nenhum registro `AdCampaign`.

6. THE Plataforma SHALL garantir que nenhuma campanha de Boost_Campaign seja criada na plataforma de anúncios sem que exista um `CampaignAuditLog` com `userDecision = "approved"` referenciando aquela campanha.

7. IF a API da plataforma de anúncios retornar erro após o usuário confirmar o boost, THEN THE Plataforma SHALL registrar o erro no campo `metadata` do `CampaignAuditLog` existente e não preencher o campo `externalCampaignId` do `AdCampaign`, sem excluir o log de aprovação previamente registrado.

8. IF o Boost_Advisor falhar ao analisar o post (erro do AWS Bedrock ou timeout), THEN THE Plataforma SHALL exibir uma mensagem de erro ao usuário e não criar nenhum registro `AdCampaign` nem `CampaignAuditLog`.

**Propriedades de Correção (para property-based testing):**

- **P5.1 — Safety property — sem campanha sem confirmação:** Para qualquer post e qualquer estado de credenciais, a criação de um registro `AdCampaign` com `campaignType = "boost"` NUNCA ocorre sem a existência prévia de um `CampaignAuditLog` correspondente com `userDecision = "approved"`.

---

### Requirement 6: Análise Estratégica de Tráfego Pago

**User Story:** Como gestor de performance, quero obter um diagnóstico estratégico das minhas campanhas de anúncios com sugestões concretas de ajuste, para tomar decisões baseadas em dados sem precisar analisar manualmente cada campanha.

#### Critérios de Aceite

1. WHEN o usuário acessa a tela de "Análise Estratégica" no módulo de tráfego pago, THE Strategic_Analyst SHALL analisar todas as campanhas com status `"active"` da empresa que possuam ao menos 7 dias de snapshots de métricas disponíveis nos últimos 30 dias (ROAS, CTR, CPC, conversões) para gerar o diagnóstico.

2. WHEN o usuário aciona a geração do diagnóstico, THE Strategic_Analyst SHALL retornar um diagnóstico estruturado contendo: (a) lista de pontos fortes das campanhas (critério: ROAS > 2× a média do portfólio ou CTR > 3%), (b) lista de alertas para campanhas problemáticas com critério explícito que motivou o alerta (critério de alerta: CTR < 1%, ROAS < 1,5 ou CPC > 2× o benchmark do portfólio), e (c) exatamente 3 Route_Changes com título, descrição da ação e impacto esperado.

3. WHEN o usuário aprova uma Route_Change cujo tipo seja ajuste de orçamento, pausa de campanha ou criação de novo público, THE Plataforma SHALL solicitar ao usuário uma Confirmation_Event explícita antes de executar qualquer alteração nas plataformas de anúncios externas.

4. WHEN o usuário confirma a execução de uma Route_Change (Confirmation_Event registrado como `CampaignAuditLog` com `userDecision = "approved"`), THE Plataforma SHALL aplicar automaticamente as alterações na plataforma de anúncios correspondente e registrar cada ação executada como `CampaignAuditLog` com `source = "strategic_analyst"`. IF o `userDecision` registrado for diferente de `"approved"`, THEN THE Plataforma SHALL bloquear a execução da Route_Change e não aplicar nenhuma alteração nas plataformas de anúncios externas.

5. IF não houver campanhas com status `"active"` para a empresa, OU se nenhuma campanha ativa possuir ao menos 7 dias de dados nos últimos 30 dias, THEN THE Strategic_Analyst SHALL retornar uma mensagem informativa indicando a ausência ou insuficiência de dados, sem gerar diagnóstico parcial.

6. IF alguma ação de Route_Change falhar na API da plataforma de anúncios, THEN THE Plataforma SHALL registrar o erro no campo `metadata` do `CampaignAuditLog` correspondente, manter o estado anterior da campanha e notificar o usuário sobre a falha de execução.

7. WHEN o usuário aprova uma Route_Change cujo tipo não seja ajuste de orçamento, pausa de campanha nem criação de público (ex.: sugestão de texto, recomendação editorial), THE Plataforma SHALL executar a ação imediatamente sem solicitar Confirmation_Event. THE Plataforma SHALL actively prevent any Confirmation_Event from being triggered for these Route_Change types, ensuring they are never routed through the confirmation flow.

8. WHEN o usuário rejeita uma Route_Change sugerida pelo Strategic_Analyst, THE Plataforma SHALL registrar a rejeição como `CampaignAuditLog` com `userDecision = "rejected"` e não executar nenhuma alteração nas plataformas de anúncios externas.

9. IF o AWS Bedrock retornar erro ou não responder durante a geração do diagnóstico, THEN THE Plataforma SHALL exibir uma mensagem de erro ao usuário e não salvar nenhum diagnóstico parcial.

**Propriedades de Correção (para property-based testing):**

- **P6.1 — Invariante de cardinalidade de Route_Changes:** Para qualquer conjunto de campanhas ativas com dados suficientes (≥ 7 dias), o diagnóstico retornado pelo Strategic_Analyst contém exatamente 3 Route_Changes.

---

### Requirement 7: Sugestão de Bio para Instagram com IA

**User Story:** Como dono de negócio, quero receber sugestões de bio para o meu perfil no Instagram geradas pela IA com base no perfil da minha empresa, para otimizar minha apresentação na rede social sem precisar contratar um redator.

#### Critérios de Aceite

1. WHEN o usuário aciona "Sugerir Bio" no módulo de gestão do perfil Instagram, THE Bio_Generator SHALL gerar exatamente 3 sugestões de bio, cada uma contendo: texto principal, ao menos 1 emoji e uma chamada para ação, alinhadas ao setor, objetivo e tom de voz da empresa. Componentes como emojis ou chamadas para ação podem se repetir entre as 3 sugestões, desde que cada sugestão contenha todos os elementos exigidos.

2. THE Bio_Generator SHALL garantir que cada sugestão gerada tenha no máximo 150 caracteres (incluindo espaços, emojis e pontuação), respeitando o limite da plataforma Instagram.

3. WHEN o módulo de sugestão de bio for exibido ao usuário, THE Plataforma SHALL exibir um aviso explícito informando que a edição da bio no Instagram não pode ser realizada programaticamente pela plataforma devido a limitações da Instagram Graph API, e que o usuário deve copiar e colar a sugestão manualmente no aplicativo do Instagram.

4. IF o perfil da empresa estiver incompleto (campos `name`, `sector` ou `objective` ausentes ou vazios), THEN THE Bio_Generator SHALL retornar uma mensagem de validação indicando quais campos estão faltando, sem invocar o AWS Bedrock.

5. IF o AWS Bedrock retornar erro ou não responder em até 30 segundos durante a geração das sugestões de bio, THEN THE Bio_Generator SHALL retornar uma mensagem de erro ao usuário indicando a falha temporária no serviço, sem salvar nenhum dado parcial de bio. IF o AWS Bedrock processar parcialmente algumas sugestões antes de falhar, THE Bio_Generator SHALL discard all partial results and present only the error message to the user. THE Plataforma SHALL allow any non-bio data (e.g., profile field updates) that was successfully processed and saved before the AWS Bedrock failure to remain persisted and SHALL not roll it back as part of the bio generation error handling.

**Propriedades de Correção (para property-based testing):**

- **P7.1 — Invariante de comprimento:** Para qualquer perfil de empresa válido, todas as sugestões de bio retornadas pelo Bio_Generator satisfazem `len(bio) ≤ 150` caracteres.
- **P7.2 — Invariante de cardinalidade:** Para qualquer perfil de empresa válido, o Bio_Generator retorna exatamente 3 sugestões de bio.

---

### Requirement 8: Grid de Planejamento do Feed Instagram

**User Story:** Como criador de conteúdo, quero visualizar uma prévia 3×3 do meu feed do Instagram com os posts agendados e rascunhos, para planejar a estética do feed antes de publicar.

#### Critérios de Aceite

1. WHEN o usuário acessa a tela de "Grid de Feed", THE Feed_Grid SHALL exibir uma visualização 3×3 contendo os posts com `Post_Status_Published` ordenados por `publishedAt` decrescente nas posições já fixadas, e os posts com status `"scheduled"` ou `"draft"` ordenados por `scheduledAt` ascendente (posts sem `scheduledAt` por `createdAt` ascendente) nas posições subsequentes, exibindo apenas posts com `platform = "instagram"`.

2. WHEN o usuário arrasta um post com status `"scheduled"` ou `"draft"` para outra posição no grid, THE Feed_Grid SHALL salvar e persistir entre sessões a nova ordem de exibição dos posts futuros, sem alterar a ordem relativa entre posts com `Post_Status_Published`.

3. THE Feed_Grid SHALL garantir que posts com `Post_Status_Published` nunca tenham sua posição relativa alterada por nenhuma operação de reordenação do usuário.

4. THE Feed_Grid SHALL exibir apenas posts do Instagram (campo `platform = "instagram"` no modelo `Post`) na visualização de grid.

5. IF o usuário não tiver nenhum post com status `"published"`, `"scheduled"` ou `"draft"` para o Instagram, THEN THE Feed_Grid SHALL exibir um estado vazio com instrução orientando o usuário a criar o primeiro post. IF o usuário não tiver nenhum post de qualquer status para o Instagram, THEN THE Feed_Grid SHALL hide the grid entirely and display a distinct onboarding message prompting the user to create their first post, differentiating this state from the empty-filter state.

6. WHEN o usuário tenta arrastar um post com `Post_Status_Published` para outra posição no grid, THE Feed_Grid SHALL bloquear a operação de arraste e não alterar a posição do post publicado.

**Propriedades de Correção (para property-based testing):**

- **P8.1 — Invariante de imutabilidade de posts publicados:** Para qualquer sequência de operações de reordenação realizadas pelo usuário no Feed_Grid, a ordem relativa entre posts com `Post_Status_Published` permanece inalterada.

---

### Requirement 9: Auditoria de Perfil Instagram com IA

**User Story:** Como gestor de marketing, quero receber uma avaliação detalhada do meu perfil no Instagram com pontuação e recomendações práticas, para identificar oportunidades de melhoria alinhadas aos objetivos da minha empresa.

#### Critérios de Aceite

1. WHEN o usuário fornece os dados do perfil atual (bio atual, quantidade de seguidores, taxa de engajamento no formato 0,00%–100,00% e nicho) e aciona "Auditar Perfil", THE Profile_Auditor SHALL retornar um diagnóstico estruturado contendo: pontuação geral de 0 a 100, avaliação de cada componente auditado (bio, consistência visual, frequência de postagem, engajamento) e lista com no mínimo 3 recomendações específicas.

2. THE Profile_Auditor SHALL alinhar todas as recomendações ao objetivo de negócio cadastrado no perfil da empresa (campo `objective` do modelo `Company`).

3. THE Profile_Auditor SHALL garantir que a pontuação geral retornada seja um número inteiro no intervalo fechado [0, 100].

4. IF algum campo obrigatório para auditoria (bio atual, quantidade de seguidores, taxa de engajamento ou nicho) não for fornecido pelo usuário, THEN THE Profile_Auditor SHALL retornar uma mensagem de validação indicando quais campos estão faltando, sem invocar o AWS Bedrock. THE Profile_Auditor SHALL also validate that each provided field contains meaningful and specific information — fields containing generic values (e.g., "business" for sector or "make money" for objective) SHALL be rejected with a validation message indicating that more specific information is required.

5. WHEN todos os campos obrigatórios para auditoria (bio atual, quantidade de seguidores, taxa de engajamento e nicho) forem fornecidos pelo usuário e o usuário acionar "Auditar Perfil", THE Profile_Auditor SHALL invocar o AWS Bedrock para gerar o diagnóstico estruturado com pontuação e recomendações.

6. IF o AWS Bedrock retornar erro ou não responder durante a geração do diagnóstico, THEN THE Profile_Auditor SHALL exibir uma mensagem de erro ao usuário indicando a falha temporária no serviço e não salvar nenhum diagnóstico parcial.

**Propriedades de Correção (para property-based testing):**

- **P9.1 — Invariante de faixa de pontuação:** Para qualquer conjunto de dados de perfil válidos fornecidos pelo usuário, a pontuação retornada pelo Profile_Auditor satisfaz `0 ≤ score ≤ 100` e é um número inteiro.

---

### Requirement 10: Compatibilidade com o Banco de Dados SQLite Existente

**User Story:** Como desenvolvedor, quero que todos os novos dados introduzidos pela expansão sejam armazenados de forma compatível com o SQLite via Prisma, para evitar migrações de banco de dados disruptivas.

#### Critérios de Aceite

1. THE Plataforma SHALL armazenar listas e estruturas compostas (slides de carrossel, variações de imagem, hashtags de Reels, configurações de boost) exclusivamente como JSON serializado em campos `String` do modelo Prisma, sem utilizar campos do tipo array nativo (não suportado pelo SQLite).

2. THE Plataforma SHALL adicionar um campo `format` do tipo `String?` (opcional, com valor padrão `"post"`) ao modelo `Post` para discriminar o tipo de conteúdo: `"post"` (compatível com posts existentes), `"carousel"`, `"reel"` ou `"story"`.

3. THE Plataforma SHALL adicionar os seguintes campos opcionais ao modelo `Post` para suporte aos novos formatos, todos com valor padrão nulo para garantir compatibilidade retroativa com posts existentes:
   - `slidesJson` (`String?`): JSON serializado dos slides do carrossel.
   - `boostSuggestionJson` (`String?`): JSON serializado da sugestão de boost gerada pelo Boost_Advisor.
   - `boostCampaignId` (`String?`): ID do `AdCampaign` criado via boost, quando aplicável.

4. THE Plataforma SHALL adicionar os seguintes campos opcionais ao modelo `AdCampaign` para suporte ao boost:
   - `sourcePostId` (`String?`): ID do `Post` que originou o boost.
   - `boostConfirmedAt` (`DateTime?`): timestamp da Confirmation_Event do usuário.

5. WHEN uma migração Prisma for gerada para os novos campos, THE Plataforma SHALL garantir que todos os novos campos sejam opcionais (`?`) e que a migração seja executável sem perda de dados existentes. IF existing posts have data in columns that conflict with the new schema constraints, THE Plataforma SHALL fail the migration completely and require manual intervention to resolve the conflicts before proceeding — no partial migration or backup-table strategies shall be used.
