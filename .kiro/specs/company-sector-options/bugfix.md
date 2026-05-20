# Documento de Requisitos do Bugfix

## Introdução

O combo de seleção de "Setor" no formulário de criação/edição de empresa (onboarding) apresenta uma lista incompleta de setores de negócio. Atualmente são oferecidas apenas 12 opções genéricas, deixando de fora segmentos relevantes e amplamente utilizados no mercado brasileiro — como Vendas, Jurídico, Construção Civil, Logística, entre outros. O impacto é que usuários de diversas áreas não encontram o setor adequado para sua empresa, prejudicando a qualidade das informações e a personalização da plataforma.

## Análise do Bug

### Comportamento Atual (Defeito)

1.1 QUANDO o usuário acessa o formulário de criação ou edição de empresa e interage com o campo "Setor", ENTÃO o sistema exibe apenas 12 opções de setor: Tecnologia, Saúde, Educação, Alimentação, Moda, Finanças, Imobiliário, Automotivo, Beleza, Esportes, Entretenimento e Outro.

1.2 QUANDO o usuário pertence a um segmento não listado (ex.: Vendas, Jurídico, Construção Civil, Logística, Agronegócio, Turismo, etc.), ENTÃO o sistema não oferece a opção correspondente, forçando o usuário a escolher "Outro" ou um setor incorreto.

### Comportamento Esperado (Correto)

2.1 QUANDO o usuário acessa o campo "Setor" no formulário de empresa, ENTÃO o sistema SHALL exibir uma lista abrangente de setores de negócio do mercado brasileiro, cobrindo ao menos 30 opções relevantes.

2.2 QUANDO o usuário pertence a segmentos como Vendas, Jurídico, Construção Civil, Logística, Agronegócio, Turismo, entre outros, ENTÃO o sistema SHALL oferecer a opção correspondente no combo de setores.

2.3 QUANDO o usuário seleciona qualquer setor da nova lista expandida, ENTÃO o sistema SHALL salvar e exibir corretamente o valor escolhido, sem alterações no fluxo de criação ou edição de empresa.

### Comportamento Inalterado (Prevenção de Regressão)

3.1 QUANDO o usuário seleciona um setor já existente na lista antiga (ex.: Tecnologia, Saúde, Educação, Alimentação, Moda, Finanças, Imobiliário, Automotivo, Beleza, Esportes, Entretenimento), ENTÃO o sistema SHALL CONTINUE TO aceitar e salvar o valor corretamente.

3.2 QUANDO o usuário deixa o campo "Setor" vazio ou seleciona "Selecione...", ENTÃO o sistema SHALL CONTINUE TO permitir o prosseguimento sem forçar preenchimento (campo opcional).

3.3 QUANDO o usuário conclui o formulário de empresa com qualquer setor selecionado, ENTÃO o sistema SHALL CONTINUE TO criar ou atualizar a empresa corretamente via API.

3.4 QUANDO o setor de uma empresa já cadastrada é exibido no dashboard ou em outros locais da plataforma, ENTÃO o sistema SHALL CONTINUE TO exibir o valor armazenado sem alterações.
