# Documento de Requisitos — Geração de Vídeos Curtos com IA

## Introduction

Este documento descreve os requisitos funcionais do módulo de **Geração de Vídeos Curtos com IA** da MKT Digital Platform. O módulo permite que usuários dos planos Profissional e Agência criem reels e vídeos curtos de marketing a partir de um vídeo bruto filmado pelo próprio negócio. A IA analisa o vídeo enviado, extrai frames representativos, transforma cada frame em imagem de marketing com Stable Diffusion Ultra (AWS Bedrock), gera narração em português com Amazon Polly e remonta tudo como vídeo final com trilha sonora e texto sobreposto via ffmpeg. O resultado é um vídeo profissional e realista, pois usa o material real do negócio como referência visual.

---

## Glossary

- **Módulo_Video**: Conjunto de funcionalidades de geração de vídeos curtos com IA dentro da MKT Digital Platform.
- **Video_Bruto**: Arquivo de vídeo original filmado pelo usuário e enviado para a plataforma (formato MP4, MOV ou WebM).
- **Extrator_Frames**: Componente baseado em ffmpeg responsável por extrair frames representativos do Video_Bruto em intervalos regulares.
- **Analisador_IA**: Componente baseado no Claude (AWS Bedrock) responsável por analisar os frames extraídos, compreender o contexto visual e gerar o script de narração, os prompts de transformação de imagem e o briefing do vídeo.
- **Transformador_Frames**: Componente que envia cada frame extraído ao Stable Diffusion Ultra (AWS Bedrock) para transformação em imagem de marketing profissional.
- **Gerador_Narracao**: Componente baseado no Amazon Polly responsável por sintetizar a narração em português a partir do script gerado pelo Analisador_IA.
- **Montador_Video**: Componente baseado em ffmpeg responsável por montar o vídeo final combinando os frames transformados, a narração gerada, o texto sobreposto e a trilha sonora.
- **Video_Final**: Arquivo de vídeo MP4 resultado do pipeline completo de geração, pronto para download e publicação em redes sociais.
- **Pipeline_Geracao**: Sequência completa de etapas de processamento: upload → extração de frames → análise de IA → transformação de frames → geração de narração → montagem de vídeo.
- **Fila_Processamento**: Serviço de fila (AWS SQS ou equivalente) que gerencia e serializa os jobs de geração de vídeo assincronamente.
- **Armazenamento_S3**: Bucket AWS S3 onde todos os arquivos intermediários e finais do pipeline são armazenados.
- **Credito_Video**: Unidade de consumo do plano de assinatura utilizada a cada geração de vídeo concluída com sucesso.
- **Plano_Profissional**: Plano de assinatura da plataforma no valor de R$997/mês, com direito a até 10 Creditos_Video por mês.
- **Plano_Agencia**: Plano de assinatura da plataforma no valor de R$1.997/mês, com direito a até 30 Creditos_Video por mês.
- **Tom_Voz**: Configuração de personalidade da empresa (ex.: profissional, descontraído, inspirador) utilizada pelo Analisador_IA ao gerar o script.
- **Texto_Sobreposto**: Legendas e chamadas para ação inseridas sobre os frames do vídeo final pelo Montador_Video.
- **Trilha_Sonora**: Áudio de fundo livre de direitos autorais combinado com a narração pelo Montador_Video.
- **Job_Video**: Registro no banco de dados que rastreia o estado e os metadados de cada geração de vídeo.

---

## Requirements

### Requirement 1: Controle de Acesso ao Módulo de Vídeo

**User Story:** Como administrador da plataforma, quero que o módulo de geração de vídeos esteja disponível apenas para assinantes dos planos Profissional e Agência, para que o recurso seja monetizado corretamente e usuários de planos inferiores sejam direcionados ao upgrade.

#### Critérios de Aceitação

1. WHILE o usuário autenticado possui plano Profissional ou Agência ativo, THE Módulo_Video SHALL exibir todas as funcionalidades de geração de vídeo.
2. WHILE o usuário autenticado possui qualquer plano que não seja especificamente Profissional ou Agência, THE Módulo_Video SHALL exibir a tela de bloqueio com descrição do recurso, exemplos de vídeos gerados e um botão de upgrade de plano.
3. WHEN o usuário de plano inferior tenta acessar qualquer rota do Módulo_Video diretamente pela URL, THE Módulo_Video SHALL redirecionar o usuário para a tela de upgrade de plano.
4. THE Módulo_Video SHALL verificar o plano e os Creditos_Video disponíveis do usuário a cada requisição às rotas protegidas do módulo.
5. WHILE o usuário autenticado possui zero Creditos_Video restantes no mês corrente, THE Módulo_Video SHALL exibir o saldo zerado e desabilitar o botão de nova geração, informando a data de renovação dos créditos; usuários não autenticados SHALL ser redirecionados para a tela de login antes de qualquer verificação de créditos.

---

### Requirement 2: Upload do Vídeo Bruto

**User Story:** Como proprietário de negócio, quero fazer upload de um vídeo que filmei do meu negócio para a plataforma, para que a IA possa transformá-lo em um reel profissional de marketing.

#### Critérios de Aceitação

1. THE Módulo_Video SHALL aceitar arquivos de vídeo nos formatos MP4, MOV e WebM para upload.
2. THE Módulo_Video SHALL rejeitar arquivos com tamanho superior a 500 MB, exibindo mensagem de erro com o limite antes do início do upload.
3. THE Módulo_Video SHALL rejeitar arquivos com duração superior a 10 minutos, verificando a duração antes de iniciar o processamento.
4. THE Módulo_Video SHALL rejeitar arquivos com duração inferior a 3 segundos, exibindo mensagem orientando o usuário a filmar um vídeo mais longo.
5. WHEN o usuário seleciona um arquivo válido para upload, THE Módulo_Video SHALL exibir uma barra de progresso de upload com percentual e estimativa de tempo restante.
6. WHEN o upload do Video_Bruto é concluído com sucesso, THE Módulo_Video SHALL armazenar o arquivo no Armazenamento_S3 com caminho isolado por empresa e retornar a URL temporária assinada do arquivo.
7. IF o upload falhar por interrupção de conexão em qualquer percentual de progresso, THEN THE Módulo_Video SHALL descartar imediatamente o arquivo parcial do Armazenamento_S3 e exibir ao usuário opção de tentar o upload novamente.
8. WHEN o upload é concluído com sucesso, THE Módulo_Video SHALL exibir um preview do primeiro frame do Video_Bruto e solicitar ao usuário que descreva o contexto do vídeo (ex.: "máquina nova de limpeza de pele para clínica de estética").
9. THE Módulo_Video SHALL aceitar a descrição de contexto com entre 10 e 500 caracteres, bloqueando o prosseguimento se o campo estiver fora desse intervalo.

---

### Requirement 3: Configuração da Geração de Vídeo

**User Story:** Como profissional de marketing, quero configurar o estilo, o objetivo e as preferências do vídeo antes de iniciar a geração, para que o resultado esteja alinhado com a identidade da marca e a rede social de destino.

#### Critérios de Aceitação

1. THE Módulo_Video SHALL fornecer uma interface de configuração com os seguintes campos antes do início do Pipeline_Geracao: rede social de destino (Instagram Reels, TikTok, YouTube Shorts), duração desejada do vídeo (15s, 30s ou 60s), estilo visual (realista, cinematográfico ou minimalista) e chamada para ação (CTA) personalizada.
2. THE Módulo_Video SHALL pré-preencher o campo de Tom_Voz com o tom cadastrado no perfil da empresa do usuário, permitindo que o usuário altere apenas para aquela geração.
3. WHEN o usuário seleciona a rede social de destino, THE Módulo_Video SHALL ajustar automaticamente a proporção de aspecto do Video_Final: 9:16 para Instagram Reels e TikTok, 16:9 para YouTube Shorts.
4. WHEN o usuário confirma as configurações e inicia a geração, THE Módulo_Video SHALL verificar a autenticação do usuário e, em seguida, o saldo de Creditos_Video antes de criar o Job_Video; IF o usuário não estiver autenticado, THE Módulo_Video SHALL redirecionar para a tela de login; IF o saldo de Creditos_Video for zero, THEN THE Módulo_Video SHALL bloquear o início da geração e exibir mensagem de saldo insuficiente; qualquer saldo igual ou superior a 1 Credito_Video SHALL permitir o início da geração.
5. WHEN todas as configurações são confirmadas, THE Módulo_Video SHALL criar um Job_Video com status "aguardando" e enfileirar o job na Fila_Processamento antes de retornar a confirmação ao usuário.

---

### Requirement 4: Extração de Frames

**User Story:** Como sistema, preciso extrair os frames mais representativos do vídeo bruto para que a IA possa analisá-los e transformá-los em imagens de marketing.

#### Critérios de Aceitação

1. WHEN o Job_Video entra na Fila_Processamento com status "aguardando", THE Extrator_Frames SHALL baixar o Video_Bruto do Armazenamento_S3 e iniciar a extração de frames.
2. THE Extrator_Frames SHALL extrair frames em intervalos de 1 segundo para vídeos de até 60 segundos e em intervalos de 2 segundos para vídeos acima de 60 segundos, gerando no máximo 60 frames por vídeo.
3. THE Extrator_Frames SHALL armazenar cada frame extraído como arquivo JPEG com qualidade 90 no Armazenamento_S3, no caminho `videos/{jobId}/frames/frame_{index}.jpg`.
4. WHEN a extração de frames é concluída, THE Extrator_Frames SHALL atualizar o status do Job_Video para "frames extraídos" e registrar o número total de frames extraídos nos metadados do job, mesmo que o número de frames extraídos seja zero.
5. IF o Video_Bruto não puder ser lido pelo ffmpeg por formato corrompido ou incompatível após o download do Armazenamento_S3, THEN THE Extrator_Frames SHALL atualizar o status do Job_Video para "erro" com a mensagem "vídeo inválido ou corrompido", estornar o Credito_Video eventualmente reservado e notificar o usuário.
6. THE Extrator_Frames SHALL selecionar um subconjunto representativo de até 10 frames para análise pelo Analisador_IA, priorizando frames com maior variação visual em relação ao frame anterior (baseado em diferença de histograma).

---

### Requirement 5: Análise de IA e Geração de Script

**User Story:** Como usuário da plataforma, quero que a IA entenda o que está no meu vídeo e crie um script de narração e um briefing de transformação visual profissionais, para que o vídeo final seja coerente com o contexto do meu negócio.

#### Critérios de Aceitação

1. WHEN o Job_Video está com status "frames extraídos" e todos os dados de entrada estão disponíveis (frames selecionados, descrição de contexto, Tom_Voz da empresa e configurações de geração), THE Analisador_IA SHALL receber esses dados e produzir o briefing do vídeo; IF qualquer dado de entrada obrigatório estiver ausente, THEN THE Analisador_IA SHALL atualizar o status do Job_Video para "erro" e não prosseguir.
2. THE Analisador_IA SHALL gerar os seguintes artefatos em uma única chamada ao Claude (AWS Bedrock): script de narração (texto completo dividido em sentenças), prompts de transformação para cada frame (descrevendo o estilo visual e elementos de marketing a adicionar), lista de Textos_Sobrepostos (máximo de 5 legendas/CTAs com timestamp de exibição em segundos) e sugestão de Trilha_Sonora por categoria (ex.: "energético", "suave", "corporativo").
3. WHEN o Analisador_IA gera o script de narração, THE Analisador_IA SHALL garantir que o script tenha duração compatível com a duração configurada pelo usuário (15s, 30s ou 60s), com tolerância de ±5 segundos estimada pela contagem de palavras à taxa de 120 palavras por minuto para o idioma português.
4. WHEN o Analisador_IA gera os prompts de transformação de frames, THE Analisador_IA SHALL incluir no prompt de cada frame: o estilo visual escolhido, elementos da identidade visual da empresa (cores cadastradas) e o setor de atuação do negócio.
5. WHEN o Analisador_IA conclui a geração dos artefatos, THE Analisador_IA SHALL atualizar o status do Job_Video para "script gerado" e armazenar todos os artefatos como JSON no Armazenamento_S3 no caminho `videos/{jobId}/brief.json`.
6. IF a chamada ao Claude (AWS Bedrock) falhar por timeout ou erro de serviço, THEN THE Analisador_IA SHALL registrar o erro, atualizar o status do Job_Video para "erro" com a mensagem "falha na análise de IA" e notificar o usuário sem consumir Creditos_Video.
7. IF o Analisador_IA identificar que o conteúdo do vídeo não está relacionado ao contexto de negócios descrito pelo usuário (ex.: conteúdo pessoal ou inadequado), THEN THE Analisador_IA SHALL atualizar o status do Job_Video para "erro" com a mensagem "conteúdo incompatível com o contexto informado" e notificar o usuário sem consumir Creditos_Video.

---

### Requirement 6: Transformação de Frames com IA

**User Story:** Como sistema, preciso transformar cada frame extraído em uma imagem de marketing profissional usando o Stable Diffusion, para que o vídeo final tenha aparência visual de alta qualidade.

#### Critérios de Aceitação

1. WHEN o Job_Video está com status "script gerado", THE Transformador_Frames SHALL processar cada frame extraído em sequência, enviando o par (imagem do frame + prompt de transformação) ao Stable Diffusion Ultra via AWS Bedrock.
2. THE Transformador_Frames SHALL utilizar o frame original como imagem de referência (image-to-image) na chamada ao Stable Diffusion Ultra, com strength de 0.65 para preservar o conteúdo real do negócio enquanto aplica o estilo de marketing.
3. THE Transformador_Frames SHALL armazenar cada frame transformado como JPEG com qualidade 95 no Armazenamento_S3, no caminho `videos/{jobId}/transformed/frame_{index}.jpg`.
4. WHEN todos os frames forem transformados com sucesso, THE Transformador_Frames SHALL atualizar o status do Job_Video para "frames transformados" e registrar o custo de cada chamada ao Stable Diffusion nos metadados do CostLog da empresa.
5. IF a chamada ao Stable Diffusion Ultra falhar para um frame específico após 2 tentativas, THEN THE Transformador_Frames SHALL utilizar o frame original (sem transformação) no lugar do frame transformado, registrar o fallback nos metadados do Job_Video e prosseguir com os demais frames sem interromper o pipeline.
6. THE Transformador_Frames SHALL processar no máximo 30 frames por Job_Video para fins de transformação pelo Stable Diffusion (frames excedentes são interpolados pelo Montador_Video a partir dos frames transformados mais próximos).

---

### Requirement 7: Geração de Narração com Amazon Polly

**User Story:** Como usuário da plataforma, quero que o vídeo gerado tenha uma narração profissional em português, para que ele seja mais envolvente e eficaz como material de marketing.

#### Critérios de Aceitação

1. WHEN o Job_Video está com status "frames transformados", THE Gerador_Narracao SHALL enviar o script de narração gerado pelo Analisador_IA ao Amazon Polly para síntese de voz em português brasileiro (pt-BR).
2. THE Gerador_Narracao SHALL utilizar a voz "Camila" (feminina, pt-BR) como padrão, com opção de selecionar a voz "Ricardo" (masculino, pt-BR) nas configurações do job.
3. THE Gerador_Narracao SHALL solicitar ao Amazon Polly a geração do arquivo de áudio no formato MP3 com frequência de amostragem de 22050 Hz.
4. WHEN o Amazon Polly retorna o arquivo de áudio com sucesso e o armazenamento do arquivo MP3 no Armazenamento_S3 é concluído, THE Gerador_Narracao SHALL atualizar o status do Job_Video para "narração gerada"; IF o armazenamento no S3 falhar após o Polly retornar sucesso, THEN THE Gerador_Narracao SHALL não atualizar o status e registrar a falha de armazenamento para retry.
5. IF a chamada ao Amazon Polly falhar, THEN THE Gerador_Narracao SHALL registrar o erro, atualizar o status do Job_Video para "erro" com a mensagem "falha na geração de narração" e notificar o usuário sem consumir Creditos_Video.
6. THE Gerador_Narracao SHALL registrar o custo da síntese de voz (em número de caracteres processados pelo Polly) nos metadados do CostLog da empresa após a conclusão bem-sucedida.

---

### Requirement 8: Montagem do Vídeo Final

**User Story:** Como usuário da plataforma, quero receber um vídeo final montado com as imagens transformadas, a narração gerada, texto sobreposto e trilha sonora, para que eu tenha um reel pronto para publicar nas redes sociais.

#### Critérios de Aceitação

1. WHEN o Job_Video está com status "narração gerada", THE Montador_Video SHALL iniciar a montagem do Video_Final combinando: frames transformados (na sequência original), narração MP3 gerada, Textos_Sobrepostos com timestamps e Trilha_Sonora selecionada.
2. THE Montador_Video SHALL montar o Video_Final com codec de vídeo H.264, codec de áudio AAC, bitrate de vídeo de 4 Mbps e resolução correspondente à proporção configurada: 1080x1920 (9:16) ou 1920x1080 (16:9).
3. THE Montador_Video SHALL combinar a Trilha_Sonora com a narração gerada, aplicando a trilha com volume reduzido a 20% do volume da narração para não sobrepor a fala.
4. THE Montador_Video SHALL renderizar os Textos_Sobrepostos com fonte sem serifa, tamanho mínimo de 28pt, cor branca com sombra escura para garantir legibilidade em diferentes fundos.
5. WHEN a montagem é concluída com sucesso e o Video_Final é armazenado com sucesso no Armazenamento_S3, THE Montador_Video SHALL atualizar o status do Job_Video para "concluído"; IF o armazenamento no S3 falhar após a montagem bem-sucedida, THEN THE Montador_Video SHALL não atualizar o status para "concluído" e registrar a falha para retry de armazenamento.
6. WHEN o status do Job_Video é atualizado para "concluído", THE Módulo_Video SHALL deduzir 1 Credito_Video do saldo mensal do usuário e registrar o consumo nos metadados do CostLog da empresa.
7. IF a montagem via ffmpeg falhar por erro de processamento, THEN THE Montador_Video SHALL atualizar o status do Job_Video para "erro" com a mensagem "falha na montagem do vídeo" e notificar o usuário sem deduzir Creditos_Video.
8. THE Montador_Video SHALL garantir que o Video_Final tenha duração dentro do intervalo da duração configurada pelo usuário ±5 segundos; IF a duração calculada exceder esse intervalo, THE Montador_Video SHALL ajustar a velocidade de exibição dos frames para adequar o vídeo à duração alvo antes de renderizar.

---

### Requirement 9: Acompanhamento de Progresso em Tempo Real

**User Story:** Como usuário da plataforma, quero acompanhar o progresso da geração do vídeo em tempo real, para que eu saiba em qual etapa o processamento está e quando o resultado estará disponível.

#### Critérios de Aceitação

1. WHEN o Job_Video é criado, THE Módulo_Video SHALL exibir uma tela de acompanhamento com o progresso do Pipeline_Geracao dividido nas etapas: Upload, Extração de Frames, Análise de IA, Transformação Visual, Narração e Montagem Final.
2. THE Módulo_Video SHALL atualizar o progresso exibido ao usuário a cada mudança de status do Job_Video, com latência máxima de 5 segundos entre a atualização no banco de dados e a atualização na interface.
3. WHEN uma etapa do pipeline é concluída, THE Módulo_Video SHALL exibir a etapa como concluída com ícone de sucesso e o tempo que levou para ser executada.
4. WHEN o Job_Video atinge o status "concluído" e o arquivo do Video_Final está verificado como disponível para reprodução no Armazenamento_S3, THE Módulo_Video SHALL exibir o Video_Final em um player de vídeo embutido na interface, sem necessidade de download prévio.
5. WHEN o Job_Video atinge o status "erro" em qualquer etapa, THE Módulo_Video SHALL exibir a etapa que falhou com ícone de erro, a mensagem de erro descritiva e um botão para o usuário tentar novamente.
6. THE Módulo_Video SHALL exibir uma estimativa de tempo restante para a conclusão do Job_Video, calculada com base no número de frames a processar e no tempo médio das últimas 10 gerações da plataforma.

---

### Requirement 10: Visualização, Download e Compartilhamento do Resultado

**User Story:** Como usuário da plataforma, quero visualizar, baixar e compartilhar o vídeo gerado, para que eu possa publicá-lo nas redes sociais do meu negócio diretamente.

#### Critérios de Aceitação

1. WHEN o Job_Video atinge o status "concluído", THE Módulo_Video SHALL disponibilizar o Video_Final em um player de vídeo responsivo com controles de play, pause, volume e tela cheia.
2. THE Módulo_Video SHALL gerar uma URL de download assinada temporária (com validade de 24 horas) para o Video_Final armazenado no Armazenamento_S3, disponibilizando-a exclusivamente ao usuário autenticado que possui o Job_Video.
3. THE Módulo_Video SHALL disponibilizar um botão de download que inicia o download direto do Video_Final no dispositivo do usuário via URL assinada.
4. THE Módulo_Video SHALL exibir os metadados do Video_Final gerado: duração, resolução, tamanho do arquivo, data de geração e Creditos_Video consumidos.
5. WHEN o usuário solicita nova geração a partir do mesmo Video_Bruto, THE Módulo_Video SHALL reutilizar os frames já extraídos e armazenados no Armazenamento_S3, pulando a etapa de extração se os frames ainda estiverem disponíveis.
6. THE Módulo_Video SHALL manter o Video_Final disponível para download no Armazenamento_S3 por no mínimo 30 dias após a conclusão; após esse período, o arquivo poderá ser removido por política de retenção, notificando o usuário 3 dias antes via painel da plataforma.
7. IF a URL assinada de download expirar, THEN THE Módulo_Video SHALL gerar uma nova URL assinada com validade renovada de 24 horas ao usuário autenticado que acessa o Job_Video.

---

### Requirement 11: Histórico de Vídeos Gerados

**User Story:** Como usuário da plataforma, quero ver um histórico de todos os vídeos que já gerei, para que eu possa gerenciar minha biblioteca de conteúdo e acessar gerações anteriores.

#### Critérios de Aceitação

1. THE Módulo_Video SHALL exibir uma galeria paginada com todos os Job_Video da empresa, ordenados da geração mais recente para a mais antiga, com 12 itens por página.
2. WHEN o usuário acessa a galeria de histórico, THE Módulo_Video SHALL exibir para cada Job_Video: thumbnail do primeiro frame transformado, status atual, data de geração, duração configurada, rede social de destino e Creditos_Video consumidos.
3. THE Módulo_Video SHALL disponibilizar um filtro de histórico por status (concluído, em processamento, erro) e por período de data.
4. WHEN o usuário clica em um Job_Video com status "concluído" na galeria, THE Módulo_Video SHALL exibir o player de vídeo com o Video_Final e a opção de download; a opção de nova geração com mesmas configurações SHALL ser exibida somente quando o recurso de regeração estiver disponível para o usuário.
5. WHEN o usuário solicita a exclusão de um Job_Video e confirma a ação no diálogo de confirmação, THE Módulo_Video SHALL remover permanentemente o Job_Video do banco de dados e os arquivos associados do Armazenamento_S3 (Video_Bruto, frames, narração e Video_Final).

---

### Requirement 12: Controle de Custos e Registro de Uso

**User Story:** Como administrador da plataforma, quero que todos os custos de infraestrutura gerados pelo pipeline de vídeo sejam registrados por empresa, para que eu possa monitorar a rentabilidade do módulo e cobrar os usuários corretamente.

#### Critérios de Aceitação

1. THE Módulo_Video SHALL registrar um CostLog separado para cada chamada de serviço AWS durante o Pipeline_Geracao: chamadas ao Claude (Analisador_IA), chamadas ao Stable Diffusion Ultra (Transformador_Frames) e caracteres sintetizados pelo Amazon Polly (Gerador_Narracao).
2. WHEN um Job_Video é concluído, THE Módulo_Video SHALL registrar um CostLog consolidado do job com o custo total em USD, o número de frames transformados, o número de caracteres sintetizados pelo Polly e a duração total do vídeo gerado.
3. THE Módulo_Video SHALL exibir na seção de custos da plataforma o consumo de Creditos_Video por mês e os custos de infraestrutura AWS associados às gerações de vídeo, separados dos custos de imagem e texto.
4. IF o custo estimado de um único Job_Video exceder USD 2,00 durante o Pipeline_Geracao, THEN THE Módulo_Video SHALL tentar suspender o job e notificar o administrador da plataforma; IF a suspensão falhar mas a notificação for enviada com sucesso, THE Módulo_Video SHALL permitir que o job continue executando e registrar o evento de falha de suspensão; IF a estimativa de custo falhar ou retornar zero, THE Módulo_Video SHALL permitir que o job prossiga sem verificação de custo, registrando os custos reais ao final.
5. THE Módulo_Video SHALL acumular e exibir o total de Creditos_Video consumidos no mês corrente por empresa, com o saldo restante até a renovação do ciclo de cobrança.

---

### Requirement 13: Parser e Serialização de Artefatos do Pipeline

**User Story:** Como sistema, preciso serializar e desserializar os artefatos JSON do pipeline de forma confiável, para que os metadados do Job_Video sejam preservados e recuperáveis em qualquer etapa do processamento.

#### Critérios de Aceitação

1. THE Módulo_Video SHALL serializar os artefatos do pipeline (brief.json) em um formato JSON canônico com os campos: `jobId`, `script` (array de sentenças), `framePrompts` (array de objetos com `frameIndex` e `prompt`), `overlayTexts` (array de objetos com `text` e `startSeconds`) e `musicCategory`.
2. WHEN um artefato JSON de pipeline é lido do Armazenamento_S3, THE Módulo_Video SHALL validar a presença e o tipo de todos os campos obrigatórios do esquema antes de iniciar a etapa subsequente do pipeline.
3. IF um artefato JSON de pipeline estiver malformado ou com campos obrigatórios ausentes ou de tipo incorreto ao ser lido do Armazenamento_S3, THEN THE Módulo_Video SHALL permitir que a etapa atual do pipeline seja concluída antes de atualizar o status do Job_Video para "erro" com a mensagem "artefato de pipeline corrompido", evitando deixar o pipeline em estado inconsistente.
4. PARA TODO artefato de pipeline válido, THE Módulo_Video SHALL garantir que serializar e depois desserializar o artefato produza um objeto equivalente ao original (propriedade de round-trip): `deserialize(serialize(artefato)) == artefato`.
5. THE Módulo_Video SHALL validar que o campo `overlayTexts` não contém timestamps negativos e que os timestamps estão em ordem crescente; IF a validação falhar, THEN THE Módulo_Video SHALL rejeitar o artefato e atualizar o Job_Video para "erro".

