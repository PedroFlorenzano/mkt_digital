# Documento de Requisitos — Tráfego Pago com IA

## Introduction

Este documento descreve os requisitos funcionais do módulo de **Tráfego Pago com IA** da MKT Digital Platform. O módulo permite que usuários dos planos Profissional e Agência criem, gerenciem e otimizem campanhas de anúncios pagos no Meta Ads e Google Ads com auxílio de inteligência artificial (Claude via AWS Bedrock). O sistema automatiza desde a criação da estrutura de campanha até o monitoramento de performance, execução de regras automáticas e testes A/B de criativos.

---

## Glossary

- **Módulo_Tráfego_Pago**: Conjunto de funcionalidades de criação e gestão de campanhas pagas dentro da MKT Digital Platform.
- **IA_Campanha**: Componente de inteligência artificial (Claude via AWS Bedrock) responsável por gerar estruturas de campanha, análises e recomendações.
- **Meta_Ads_Connector**: Serviço interno que se comunica com a Meta Marketing API para criar e gerenciar campanhas no Facebook e Instagram.
- **Google_Ads_Connector**: Serviço interno que se comunica com a Google Ads API para criar e gerenciar campanhas de Search e Display.
- **Monitor_Performance**: Componente responsável por coletar métricas de campanhas e acionar análises periódicas da IA.
- **Motor_Regras**: Componente que avalia e executa regras automáticas definidas pelo usuário sobre campanhas ativas.
- **Gerenciador_Orcamento**: Componente responsável por calcular e recomendar distribuição de orçamento entre campanhas.
- **Testador_AB**: Componente que gerencia a criação, execução e encerramento de testes A/B de criativos.
- **Credencial_Criptografada**: Dado sensível de API (tokens, secrets, IDs) armazenado com criptografia no banco de dados, nunca em código-fonte ou variáveis de ambiente não seguras.
- **CTR**: Click-Through Rate — taxa de cliques por impressão.
- **CPC**: Custo por Clique.
- **ROAS**: Return on Ad Spend — retorno sobre o investimento em anúncios.
- **Ad_Set**: Conjunto de anúncios dentro de uma campanha Meta Ads.
- **Criativo**: Imagem, vídeo ou combinação de mídia e texto usada em um anúncio.
- **Plano_Profissional**: Plano de assinatura da plataforma no valor de R$997/mês.
- **Plano_Agencia**: Plano de assinatura da plataforma no valor de R$1.997/mês.
- **Threshold_Confirmacao**: Limite de R$500/dia acima do qual alterações de orçamento requerem confirmação explícita do usuário.
- **Variacao_Criativo**: Uma das três versões de criativo geradas automaticamente para um teste A/B.

---

## Requirements

### Requirement 1: Controle de Acesso ao Módulo

**User Story:** Como administrador da plataforma, quero que o módulo de tráfego pago esteja disponível apenas para assinantes dos planos Profissional e Agência, para que o recurso seja monetizado corretamente e usuários de planos inferiores sejam direcionados ao upgrade.

#### Critérios de Aceitação

1. WHILE o usuário autenticado possui plano Profissional ou Agência, THE Módulo_Tráfego_Pago SHALL exibir todas as funcionalidades de tráfego pago.
2. WHILE o usuário autenticado possui plano diferente de Profissional e Agência, THE Módulo_Tráfego_Pago SHALL exibir a tela de bloqueio com a descrição do recurso e um botão de upgrade de plano, garantindo que o usuário sempre visualize uma das duas experiências (funcionalidade completa ou tela de upgrade), nunca nenhuma delas.
3. WHEN o usuário de plano inferior tenta acessar qualquer rota do módulo de tráfego pago diretamente pela URL, THE Módulo_Tráfego_Pago SHALL redirecionar o usuário para a tela de upgrade de plano.
4. THE Módulo_Tráfego_Pago SHALL verificar o plano do usuário a cada requisição às rotas protegidas do módulo.

---

### Requirement 2: Conexão e Gerenciamento de Credenciais de API

**User Story:** Como usuário do plano Profissional ou Agência, quero conectar minhas contas do Meta Ads e Google Ads à plataforma de forma segura, para que o sistema possa criar e gerenciar campanhas em meu nome.

#### Critérios de Aceitação

1. THE Módulo_Tráfego_Pago SHALL fornecer um formulário para o usuário inserir as credenciais do Meta Ads: App ID, App Secret, Access Token e Ad Account ID.
2. THE Módulo_Tráfego_Pago SHALL fornecer um formulário para o usuário inserir as credenciais do Google Ads: Developer Token, credenciais OAuth2 e Customer ID.
3. WHEN o usuário submete credenciais de API, THE Módulo_Tráfego_Pago SHALL criptografar e armazenar as credenciais no banco de dados antes de confirmar o salvamento.
4. THE Módulo_Tráfego_Pago SHALL armazenar credenciais de API exclusivamente como Credencial_Criptografada no banco de dados, nunca em código-fonte ou logs.
5. WHEN o usuário submete credenciais do Meta Ads, THE Meta_Ads_Connector SHALL realizar uma chamada de validação à Meta Marketing API e retornar o resultado ao usuário somente após a chamada ser concluída com sucesso, em até 10 segundos; IF a chamada à API falhar ou não puder ser realizada, THEN THE Meta_Ads_Connector SHALL retornar erro ao usuário sem confirmar as credenciais.
6. WHEN o usuário submete credenciais do Google Ads, THE Google_Ads_Connector SHALL validar as credenciais realizando uma chamada de teste à Google Ads API e retornar o resultado da validação ao usuário em até 10 segundos.
7. IF a validação de credenciais retornar erro da API externa, THEN THE Módulo_Tráfego_Pago SHALL exibir uma mensagem de erro descritiva indicando qual credencial está inválida, sem expor valores das credenciais.
8. WHEN o usuário solicita a remoção de uma integração, THE Módulo_Tráfego_Pago SHALL excluir permanentemente as Credenciais_Criptografadas associadas do banco de dados.

---

### Requirement 3: Criação de Campanha com IA

**User Story:** Como profissional de marketing, quero descrever meu objetivo de campanha em linguagem natural e receber uma estrutura completa de campanha gerada pela IA, para que eu possa lançar anúncios eficazes sem precisar configurar manualmente cada parâmetro.

#### Critérios de Aceitação

1. THE Módulo_Tráfego_Pago SHALL fornecer um campo de texto onde o usuário descreve o objetivo da campanha em linguagem natural (ex.: "Quero vender mais X para o público Y").
2. WHEN o usuário submete a descrição do objetivo, THE IA_Campanha SHALL gerar uma estrutura completa de campanha contendo: objetivo da campanha, segmentação de público-alvo, recomendação de orçamento diário, textos dos anúncios e briefing criativo.
3. WHEN a IA_Campanha gera a estrutura da campanha, THE IA_Campanha SHALL utilizar o perfil de marca da empresa cadastrado na plataforma (cores, tom de voz, setor, objetivo) para personalizar os textos e o briefing criativo, mesmo que o processo de geração venha a falhar por outros motivos.
4. WHEN a IA_Campanha gera a estrutura da campanha, THE Módulo_Tráfego_Pago SHALL exibir todos os campos gerados para revisão e edição pelo usuário antes da criação efetiva.
5. WHEN o usuário confirma a estrutura da campanha, THE Módulo_Tráfego_Pago SHALL permitir que o usuário selecione a plataforma de destino (Meta Ads, Google Ads ou ambas) antes de prosseguir.
6. IF a IA_Campanha não conseguir gerar a estrutura da campanha por falha no serviço AWS Bedrock, THEN THE Módulo_Tráfego_Pago SHALL interromper completamente o processo de geração, exibir uma mensagem de erro e permitir que o usuário tente novamente; nenhum método alternativo de geração SHALL ser utilizado.
7. WHEN a IA_Campanha gera textos de anúncio, THE IA_Campanha SHALL gerar ao menos 3 variações de copy para cada posicionamento de anúncio.

---

### Requirement 4: Integração com Meta Ads

**User Story:** Como anunciante, quero que a plataforma crie e gerencie campanhas no Meta Ads automaticamente a partir da estrutura gerada pela IA, para que eu não precise acessar o Gerenciador de Anúncios do Facebook manualmente.

#### Critérios de Aceitação

1. WHEN o usuário confirma a criação de uma campanha para Meta Ads, THE Meta_Ads_Connector SHALL criar a campanha, o Ad_Set e os anúncios na conta Meta Ads do usuário via Meta Marketing API.
2. WHEN o Meta_Ads_Connector cria um Ad_Set, THE Meta_Ads_Connector SHALL configurar a segmentação de público com os parâmetros gerados pela IA: faixa etária, localização geográfica, interesses e comportamentos.
3. WHEN o Meta_Ads_Connector cria anúncios, THE Meta_Ads_Connector SHALL fazer upload das imagens geradas pela IA como criativos dos anúncios via Meta Marketing API.
4. WHEN o Meta_Ads_Connector cria um Ad_Set, THE Meta_Ads_Connector SHALL configurar o orçamento diário e a estratégia de lance conforme definidos na estrutura da campanha.
5. WHEN a Meta Marketing API retorna o ID da campanha criada, THE Meta_Ads_Connector SHALL armazenar o ID externo da campanha vinculado ao registro interno da campanha no banco de dados, mesmo que a criação da campanha esteja incompleta.
5a. IF a operação de armazenamento do ID no banco de dados falhar após a campanha ser criada com sucesso no Meta Ads, THEN THE Meta_Ads_Connector SHALL manter a campanha no Meta Ads e marcar o registro interno como falho, permitindo que o usuário tente a integração novamente.
6. IF a Meta Marketing API retornar erro durante a criação de qualquer elemento da campanha, THEN THE Meta_Ads_Connector SHALL registrar o erro com detalhes e exibir ao usuário uma mensagem descritiva indicando qual etapa falhou.
7. WHEN a criação da campanha no Meta Ads é concluída com sucesso, THE Módulo_Tráfego_Pago SHALL exibir ao usuário o link direto para a campanha no Gerenciador de Anúncios do Meta.

---

### Requirement 5: Integração com Google Ads

**User Story:** Como anunciante, quero que a plataforma crie campanhas no Google Ads automaticamente com palavras-chave e anúncios gerados pela IA, para que eu possa alcançar usuários que estão ativamente buscando meus produtos ou serviços.

#### Critérios de Aceitação

1. WHEN o usuário confirma a criação de uma campanha de Search para Google Ads, THE Google_Ads_Connector SHALL criar a campanha, o grupo de anúncios, as palavras-chave e os anúncios responsivos de pesquisa via Google Ads API.
2. WHEN a IA_Campanha gera palavras-chave para campanhas de Search, THE IA_Campanha SHALL gerar ao menos 15 palavras-chave segmentadas por intenção de busca (informacional, navegacional e transacional).
3. WHEN o usuário confirma a criação de uma campanha de Display para Google Ads, THE Google_Ads_Connector SHALL criar a campanha de Display com os criativos gerados pela IA via Google Ads API.
4. WHEN o Google_Ads_Connector cria anúncios responsivos de pesquisa, THE Google_Ads_Connector SHALL incluir ao menos 5 títulos e 3 descrições distintos gerados pela IA_Campanha.
5. WHEN a Google Ads API retorna o ID da campanha criada com sucesso, THE Google_Ads_Connector SHALL armazenar o ID externo da campanha vinculado ao registro interno no banco de dados; IF a criação da campanha retornar erro, THEN THE Google_Ads_Connector SHALL não armazenar nenhum ID.
6. IF a Google Ads API retornar erro durante a criação de qualquer elemento da campanha, THEN THE Google_Ads_Connector SHALL registrar o erro com detalhes no log interno e, somente após o registro bem-sucedido, exibir ao usuário uma mensagem descritiva indicando qual etapa falhou.
7. WHEN a criação da campanha no Google Ads é concluída com sucesso, THE Módulo_Tráfego_Pago SHALL exibir ao usuário o link direto para a campanha no Google Ads.

---

### Requirement 6: Monitoramento de Performance com IA

**User Story:** Como gestor de tráfego, quero que a IA analise automaticamente o desempenho das minhas campanhas a cada 6 horas e me forneça recomendações e relatórios em linguagem simples, para que eu possa tomar decisões rápidas sem precisar interpretar dados brutos.

#### Critérios de Aceitação

1. THE Monitor_Performance SHALL coletar métricas de todas as campanhas ativas (CTR, CPC, ROAS e conversões) a cada 6 horas via APIs do Meta Ads e Google Ads.
2. WHEN o Monitor_Performance coleta as métricas, THE IA_Campanha SHALL analisar os dados e identificar anúncios com desempenho abaixo da média do conjunto de anúncios da mesma campanha.
3. WHEN a IA_Campanha identifica anúncios com desempenho abaixo da média, THE IA_Campanha SHALL gerar uma recomendação de pausa para cada anúncio identificado, com justificativa baseada nas métricas.
4. WHEN a IA_Campanha identifica anúncios com ROAS acima de 2x a média do conjunto de anúncios, THE IA_Campanha SHALL gerar uma recomendação de aumento de orçamento para o Ad_Set correspondente, com percentual sugerido.
5. WHEN o Monitor_Performance conclui o ciclo de análise com métricas coletadas com sucesso, THE IA_Campanha SHALL gerar um relatório de performance em linguagem natural em português, contendo: valor gasto, número de conversões, custo por conversão e ROAS do período; IF a coleta de métricas falhar para o ciclo, THEN THE IA_Campanha SHALL omitir a geração do relatório para aquele ciclo.
6. WHEN um novo relatório de performance é gerado, THE Módulo_Tráfego_Pago SHALL notificar o usuário via painel da plataforma e disponibilizar o relatório na seção de campanhas.
7. THE Monitor_Performance SHALL armazenar o histórico de métricas coletadas por no mínimo 90 dias para cada campanha.
8. IF a coleta de métricas de uma campanha falhar por erro da API externa, THEN THE Monitor_Performance SHALL registrar a falha, pular a campanha afetada e prosseguir com a análise das demais campanhas do ciclo.

---

### Requirement 7: Motor de Regras Automáticas

**User Story:** Como gestor de tráfego, quero definir regras automáticas baseadas em métricas de performance para que o sistema execute ações nas campanhas sem minha intervenção manual, garantindo que o orçamento seja protegido e as oportunidades sejam aproveitadas em tempo real.

#### Critérios de Aceitação

1. THE Módulo_Tráfego_Pago SHALL fornecer uma interface para o usuário criar regras automáticas com a estrutura: condição (métrica, operador, valor) e ação (pausar anúncio, pausar Ad_Set, aumentar orçamento em percentual, substituir criativo).
2. THE Motor_Regras SHALL suportar as seguintes métricas como condição de regra: CPC, CTR, ROAS, custo total e número de conversões.
3. THE Motor_Regras SHALL suportar os seguintes operadores de comparação: maior que, menor que e igual a.
4. THE Motor_Regras SHALL suportar as seguintes ações: pausar anúncio, pausar Ad_Set, aumentar orçamento em percentual definido pelo usuário e substituir criativo.
5. WHEN o Monitor_Performance conclui a coleta de métricas, THE Motor_Regras SHALL avaliar todas as regras ativas do usuário contra as métricas coletadas.
6. WHEN uma regra é satisfeita e a ação é pausar anúncio ou pausar Ad_Set, THE Motor_Regras SHALL executar a ação via API da plataforma correspondente (Meta Ads ou Google Ads) e registrar a execução com timestamp, regra acionada e resultado somente após a chamada de API ser concluída com sucesso; IF a chamada de API falhar, THEN THE Motor_Regras SHALL registrar a falha e não considerar a ação como executada.
7. WHEN uma regra é satisfeita e a ação é aumentar orçamento, e o novo orçamento diário resultante for menor ou igual ao Threshold_Confirmacao, THE Motor_Regras SHALL executar o aumento de orçamento via API e registrar a tentativa de execução independentemente do resultado da chamada de API.
8. WHEN uma regra é satisfeita e a ação é aumentar orçamento, e o novo orçamento diário resultante for maior que o Threshold_Confirmacao, THE Motor_Regras SHALL suspender a execução da ação e notificar o usuário para confirmação explícita antes de prosseguir.
9. WHEN uma regra é satisfeita e a ação é substituir criativo, THE Motor_Regras SHALL pausar o anúncio atual e notificar o usuário para fornecer ou aprovar o novo criativo.
10. IF a execução de uma ação de regra falhar por erro da API externa, THEN THE Motor_Regras SHALL registrar a falha com detalhes e notificar o usuário sobre a ação não executada.
11. THE Módulo_Tráfego_Pago SHALL exibir um histórico de execuções de regras com: data/hora, regra acionada, campanha afetada e resultado da execução.

---

### Requirement 8: Inteligência de Orçamento

**User Story:** Como anunciante, quero que a IA recomende como distribuir meu orçamento entre as campanhas ativas com base no histórico de performance e nos objetivos da empresa, para que eu maximize o retorno sobre o investimento em mídia paga.

#### Critérios de Aceitação

1. THE Gerenciador_Orcamento SHALL calcular recomendações de distribuição de orçamento para todas as campanhas ativas do usuário com base no histórico de ROAS dos últimos 30 dias.
2. WHEN o usuário acessa a seção de inteligência de orçamento, THE Gerenciador_Orcamento SHALL exibir a distribuição atual de orçamento e a distribuição recomendada pela IA lado a lado.
3. WHEN o Gerenciador_Orcamento gera recomendações, THE IA_Campanha SHALL incluir uma justificativa em linguagem natural para cada redistribuição sugerida, referenciando as métricas de performance que embasam a recomendação.
4. WHEN o usuário aprova uma recomendação de redistribuição de orçamento e o novo orçamento diário de qualquer campanha afetada for menor ou igual ao Threshold_Confirmacao, THE Gerenciador_Orcamento SHALL aplicar as alterações via APIs correspondentes.
5. WHEN o usuário aprova uma recomendação de redistribuição de orçamento e o novo orçamento diário de qualquer campanha afetada for maior que o Threshold_Confirmacao, THE Gerenciador_Orcamento SHALL exibir um resumo das alterações com os valores envolvidos e solicitar confirmação explícita do usuário antes de aplicar.
6. IF o histórico de performance de uma campanha for inferior a 7 dias, THEN THE Gerenciador_Orcamento SHALL apresentar a campanha com status "dados insuficientes" e permitir que recomendações sejam geradas, marcando-as claramente como não confiáveis devido ao histórico reduzido; campanhas com exatamente 7 dias de histórico SHALL ser consideradas com dados suficientes para recomendações confiáveis.

---

### Requirement 9: Teste A/B Automático de Criativos

**User Story:** Como profissional de marketing, quero que o sistema gere automaticamente variações dos meus criativos, execute testes A/B e encerre o teste promovendo o vencedor, para que eu melhore continuamente a performance dos anúncios sem esforço manual.

#### Critérios de Aceitação

1. WHEN o usuário cria um anúncio com criativo gerado pela IA, THE Testador_AB SHALL gerar automaticamente 3 Variações_Criativo distintas para o anúncio, variando elementos visuais e textuais.
2. WHEN as 3 Variações_Criativo são geradas, THE Testador_AB SHALL criar 3 anúncios separados na plataforma de destino (Meta Ads ou Google Ads), cada um com uma Variação_Criativo, dentro do mesmo Ad_Set ou grupo de anúncios.
3. WHILE um teste A/B está ativo, THE Testador_AB SHALL distribuir o orçamento do Ad_Set igualmente entre as 3 Variações_Criativo.
4. WHEN 48 horas se passam desde o início de um teste A/B ativo, THE Testador_AB SHALL identificar a Variação_Criativo com maior CTR entre as 3 variações como vencedora.
5. WHEN o Testador_AB identifica a Variação_Criativo vencedora, THE Testador_AB SHALL pausar os 2 anúncios perdedores via API da plataforma correspondente.
6. WHEN o Testador_AB identifica a Variação_Criativo vencedora, THE Testador_AB SHALL manter o anúncio vencedor ativo e registrar o resultado do teste com as métricas comparativas das 3 variações.
7. WHEN um teste A/B é encerrado, THE Módulo_Tráfego_Pago SHALL notificar o usuário com um resumo do resultado: variação vencedora, CTR de cada variação e ação executada.
8. WHILE um teste A/B está ativo e após 48 horas terem decorrido desde o início, THE Testador_AB SHALL verificar continuamente se todas as Variações_Criativo atingiram ao menos 100 impressões; IF qualquer variação não tiver atingido 100 impressões, THEN THE Testador_AB SHALL estender o período do teste em incrementos de 24 horas até que todas as variações atinjam 100 impressões ou o período total atinja 7 dias.
9. IF o período total do teste A/B atingir 7 dias sem que todas as variações alcancem 100 impressões, THEN THE Testador_AB SHALL encerrar o teste, selecionar a variação com maior CTR disponível como vencedora e notificar o usuário sobre o encerramento antecipado com justificativa.

---

### Requirement 10: Auditoria e Rastreabilidade

**User Story:** Como usuário da plataforma, quero que todas as ações automáticas executadas pelo sistema nas minhas campanhas sejam registradas com detalhes, para que eu possa auditar o histórico e entender o que foi feito em meu nome.

#### Critérios de Aceitação

1. THE Módulo_Tráfego_Pago SHALL registrar um log de auditoria para cada ação executada automaticamente, contendo: timestamp, tipo de ação, campanha afetada, valores anteriores, valores novos e origem da ação (Motor_Regras, Testador_AB, Gerenciador_Orcamento ou Monitor_Performance).
2. THE Módulo_Tráfego_Pago SHALL disponibilizar o histórico de auditoria ao usuário em uma interface filtrável por campanha, tipo de ação e período de data.
3. THE Módulo_Tráfego_Pago SHALL reter os registros de auditoria por no mínimo 12 meses.
4. WHEN uma ação automática requer confirmação do usuário por exceder o Threshold_Confirmacao, THE Módulo_Tráfego_Pago SHALL registrar no log de auditoria tanto a solicitação de confirmação quanto a decisão do usuário (aprovado ou rejeitado) com timestamp; ações que não requerem confirmação SHALL ter apenas a execução registrada, sem registro de decisão do usuário.
