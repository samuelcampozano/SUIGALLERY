# Nodus — proposta de valor, go-to-market e economia unitária

> Documento de decisão — 3 de outubro de 2026. Moeda de planejamento: BRL; os custos de protocolo são cotados em USD e convertidos pela variável `FX` (cenário-base: R$ 5,50/US$). Não é uma tabela de preços publicada nem aconselhamento jurídico.

## Decisão em uma frase

Começar como **infraestrutura privada programável para equipes de desenvolvimento brasileiras**, vendendo API/SDK, criptografia no cliente, controle de acesso e prova verificável de armazenamento; manter a experiência de “cofre privado simples” como a camada de produto, não como o primeiro mercado a conquistar.

Isso preserva a ambição de atender qualquer pessoa sem cometer o erro de disputar preço e aquisição de consumidores contra Google, Apple e Dropbox antes de haver distribuição, suporte e recuperação de conta maduros.

## Valores que orientam produto e venda

1. **O dado pertence ao cliente.** Cifragem ocorre antes do envio; Nodus não deve transformar conteúdo privado em ativo de publicidade, treinamento ou perfilamento.
2. **Privacidade que funciona sem conhecimento técnico.** O cliente escolhe pessoas, arquivos e prazo; não escolhe algoritmos, chains ou tokens.
3. **Controle verificável, sem teatro de blockchain.** Provas e explorer existem para quem precisa auditar. Para os demais, a promessa é clara e limitada: “dados cifrados, acesso controlado e trilha de auditoria”.
4. **Portabilidade e reversibilidade.** Exportar dados e manifestos, trocar backend e não aprisionar a chave são requisitos de produto.
5. **Preço honesto.** Quota, renovação, vencimento e o limite da revogação devem ser explicados antes de gerar surpresa.

## Leitura de mercado

### Brasil

- A base já paga por nuvem: 49% das empresas com Internet declararam pagar por armazenamento de arquivos ou banco de dados em nuvem em 2024; 22% pagavam plataforma hospedada para desenvolver, testar ou implantar aplicações. Isto valida a dor, mas também mostra que a entrada por ferramentas de desenvolvimento é um recorte mais específico do que “toda empresa”. [TIC Empresas 2024 — Cetic.br](https://cetic.br/media/docs/publicacoes/2/20250512122204/tic_empresas_2024_livro_eletronico.pdf)
- O mercado está expandindo: a Brasscom reporta crescimento de 35,5% em nuvem no mercado interno de TIC em 2025. Crescimento não é, por si só, uma razão para comprar Nodus; ele torna o custo, o controle e a conformidade da nuvem um problema mais frequente. [Relatório Setorial Brasscom 2025](https://brasscom.org.br/wp-content/uploads/2026/05/BRI2-2026-001-Relatorio-Setorial-2025-versao-resumida-v5-SITE-2.pdf)
- LGPD precisa entrar na venda como disciplina operacional, não como selo automático. A ANPD regula transferências internacionais pela Resolução 19/2024; criptografar conteúdo reduz exposição, mas não elimina obrigações sobre metadados, controlador/operador, direitos do titular, contratos e transparência. [ANPD — transferência internacional de dados](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)

### Mundo e protocolo

- O movimento global para cloud continua forte: Brasil e México responderam juntos por cerca de um terço das importações de cloud/data storage dos EUA pelos países em desenvolvimento no recorte 2019–2023. É sinal de demanda regional, não uma estimativa de TAM da Nodus. [Banco Mundial — Digital Progress and Trends 2025](https://ppp.worldbank.org/sites/default/files/2026-01/Digital%20Progress%20and%20Trends%20Report%202025%2C%20Strengthening%20AI%20Foundations.pdf)
- Walrus é apropriado quando verificabilidade, disponibilidade distribuída e custo de arquivos grandes superam a necessidade de competir em armazenamento bruto. Seu preço publicado é US$ 0,023 por GB codificado/mês, mas o tamanho faturável é aproximadamente `4,5 × arquivo original + 64 MB por blob`. Para objetos pequenos sem empacotamento, isto muda completamente a economia. [Walrus — Storage Costs](https://docs.wal.app/docs/system-overview/storage-costs)

## Público-alvo e sequenciamento

| Prioridade | ICP e trabalho a executar | Por que agora | Oferta inicial |
| --- | --- | --- | --- |
| 1 | Equipes brasileiras de 3–20 devs que guardam documentos, mídia, artefatos de IA ou dados de clientes e querem entregar privacidade no próprio produto | Integram API, entendem uma versão beta e valorizam SDK/auditoria; custo de aquisição é mais baixo por comunidade e integração | API/SDK, projeto sandbox, gestão de chaves/roles, suporte de implantação |
| 2 | Software houses e agências que criam produtos para múltiplos clientes | Uma venda pode criar vários workspaces e casos de uso repetidos | plano parceiro, organizações multi-tenant, billing por projeto |
| 3 | Pequenas equipes não técnicas com arquivos sensíveis (jurídico, criativo, consultorias) | Testam a promessa humana, mas exigem convite por e-mail, recuperação e suporte antes da escala | “Cofre da equipe” com onboarding assistido |
| Depois | Consumidor individual / fotos pessoais | Mercado amplo, mas ticket baixo, alta expectativa de recuperação e concorrência pesada | aplicativo pessoal, apenas após validação de retenção e suporte |

**Posicionamento recomendado:** “A camada privada de arquivos do seu produto. Cifre no dispositivo, controle acesso por equipe e mantenha uma prova verificável — sem construir a infraestrutura de storage.”

Evitar como mensagem principal: “Drive descentralizado”, “Web3 storage”, preço de token ou “armazenamento eterno”. Walrus é por prazo/epochs e precisa de renovação; Mainnet usa epochs de duas semanas e um blob expira se não for renovado. [Walrus — Storage, Epochs and Renewal](https://docs.wal.app/docs/console/storage-epochs)

## O que realmente gera custo

### 1. Armazenamento Walrus (custo dominante)

Para `S` GB de arquivo original e `N` blobs, uma estimativa conservadora de recorrência é:

```text
GB faturáveis = 4,5 × S + 0,064 × N
WAL mensal (US$) ≈ 0,023 × GB faturáveis
BRL mensal ≈ WAL mensal (US$) × FX
```

O valor em WAL muda com o token, mas a documentação declara alvo em USD. Há ainda **write fee em WAL** por blob e deve-se coletar o valor vigente de `walrus info` antes de publicar qualquer preço. [Walrus — Network Reference](https://docs.wal.app/docs/network-reference)

Exemplos, sem write fee e com `FX=5,50`:

| Caso | Custo Walrus/mês estimado |
| --- | ---: |
| 1 GB em 1 blob | US$ 0,105 / R$ 0,58 |
| 20 GB em arquivos grandes/empacotados | US$ 2,07 / R$ 11,39 |
| 100 GB em arquivos grandes/empacotados | US$ 10,35 / R$ 56,93 |
| 500 GB em arquivos grandes/empacotados | US$ 51,75 / R$ 284,63 |

**Risco crítico:** 600 arquivos de 10 KiB, separados, carregam aproximadamente 38,4 GB de overhead e custam perto de US$ 0,88/mês apesar de terem só 6 MB úteis. Quilt agrupa pequenos objetos e amortiza os 64 MB; a documentação mostra economia medida de 409× nesse caso. Logo, empacotar objetos pequenos, juntar segmentos e cobrar por “objetos ativos” são requisitos de margem, não otimização opcional. [Walrus — Quilt](https://docs.wal.app/docs/system-overview/quilt)

### 2. Sui/WAL (necessário para armazenar)

Walrus não roda em Solana: Mainnet Walrus opera com Sui Mainnet. Um store pode envolver reserva de espaço, registro e certificação do blob — até três transações Sui — e extensões também consomem gas. Há depósito de objetos Sui, em grande parte recuperável quando o objeto é queimado; não trate esse reembolso como receita. Faça batch de blobs/PTBs e compre recursos de storage em volume para reduzir gas unitário. [Walrus — Storage Costs](https://docs.wal.app/docs/system-overview/storage-costs)

### 3. Solana (identidade e RBAC no desenho atual)

No repositório, Solana é SIWS e RBAC on-chain; **não guarda o arquivo e não paga Walrus**. Cobrar uma taxa de armazenamento “para Solana” seria tecnicamente incorreto. Seus custos são:

- transação para criar/alterar organização, membro ou capability;
- custo único de rent-exempt reserve ao abrir contas do programa (recuperável ao fechá-las conforme o tipo de conta);
- RPC/infraestrutura de indexação e eventual priority fee em congestionamento.

A taxa base é 5.000 lamports por assinatura (`0,000005 SOL`); priority fee é opcional e depende do limite de compute solicitado e do preço em micro-lamports. A cobrança ocorre mesmo se a transação falhar. O preço em BRL precisa ser cotado no momento da operação; mantenha uma carteira operacional pequena e uma reserva de falhas, não uma tabela estática em SOL. [Solana — Fee Structure](https://solana.com/docs/core/fees/fee-structure)

### 4. Custos operacionais que não podem ficar escondidos

- Control plane: API, PostgreSQL, filas, jobs de renovação, backups, observabilidade, logs sem plaintext e suporte. Como referência mínima, Render cita cerca de US$ 13/mês para um web service Starter sempre ligado + Postgres Basic-256MB, antes de banda/crescimento; produção precisa de redundância e não deve usar isso como orçamento final. [Render — small-business hosting](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)
- Publisher/relay e banda: upload direto evita transportar ciphertext pelo gateway, mas relay, egress de preview/download, CDN e limites antiabuso continuam tendo custo.
- Pagamentos: Pix/cartão, antifraude, impostos, chargeback, câmbio e inadimplência.
- Pessoas: suporte de recuperação, resposta a incidente, jurídico/LGPD, revisão de segurança e vendas. Não estão incluídos no “custo por GB”, mas decidem o break-even real.

## Arquitetura comercial e preço sugerido para teste

> **Revisão de 3 de outubro de 2026:** a primeira proposta de planos gerenciados por quota Walrus (Builder R$ 99 / 20 GB, Team R$ 399 / 100 GB) era defensável como teto de margem, mas era cara e colocava Nodus na comparação errada com iCloud/Google One. Abaixo está a proposta substituta, baseada em benchmark público de preços.

### O que concorrentes cobram — e o que isso prova

Não há base pública confiável para o **custo interno** de Apple, Google ou Dropbox. É incorreto inferir margem a partir do preço de assinatura: eles podem diluir custo em escala, hardware próprio e outras receitas. O benchmark abaixo usa preços publicados e custo de infraestrutura publicado; ele serve para definir o limite de preço que o cliente perceberá, não para afirmar a margem dos concorrentes.

| Categoria / fornecedor | Preço ou custo publicado | Leitura para Nodus |
| --- | ---: | --- |
| iCloud+ Brasil | R$ 5,90 / 50 GB; R$ 19,90 / 200 GB; R$ 66,90 / 2 TB | É a âncora mental do consumidor Apple, inclui backup e compartilhamento familiar. [Apple](https://www.apple.com/br/icloud/) |
| Google One Brasil | R$ 9,99 / 100 GB; R$ 49,99 / 2 TB | É outra âncora de preço para consumo; o preço pode variar por canal e é subsídio/ecossistema, não custo de objeto. [Google One — App Store Brasil](https://apps.apple.com/br/app/google-one/id1451784328?platform=mac) |
| Dropbox Plus | US$ 9,99 / 2 TB; 2 GB grátis | O usuário também compara sincronização, recuperação e experiência, não só GB. [Dropbox](https://www.dropbox.com/pt_BR/buy) |
| Backblaze B2 (infra) | US$ 6,95 / TB/mês, egress grátis até 3× o storage médio | Referência de object storage barato para dados privados cifrados; ainda há dependência de região, operação e suporte. [Backblaze](https://www.backblaze.com/cloud-storage/pricing) |
| Cloudflare R2 (infra) | US$ 0,015 / GB-mês; 10 GB grátis; egress grátis | Referência para cargas que fazem muito download; há cobrança por operação. [Cloudflare](https://developers.cloudflare.com/r2/pricing/) |
| Walrus (infra verificável) | US$ 0,023 / GB **codificado**/mês | Com `4,5×` de codificação, custa cerca de US$ 0,1035 por GB original/mês, antes de write fee e gas. [Walrus](https://docs.wal.app/docs/system-overview/storage-costs) |

Com `FX=R$ 5,50`, o custo recorrente bruto por GB original é aproximadamente R$ 0,038 em B2, R$ 0,083 em R2 e R$ 0,569 em Walrus (arquivo grande/empacotado). Portanto Walrus é cerca de **7× R2** e **15× B2** antes de operação. Em 2 TB, a estimativa Walrus é R$ 1.139/mês, enquanto iCloud+ anuncia R$ 66,90. Nodus não deve prometer 2 TB em Walrus a preço de nuvem de consumo.

### Modelo substituto: escolha de garantia, não cadeia escondida

1. **Nodus Private** — arquivos cifrados no dispositivo, control plane Nodus e backend de objeto econômico. É o caminho para pessoas e equipes que querem privacidade e preço compreensível.
2. **Nodus Verify** — Walrus + prova verificável/renovação. É premium, voltado a devs e dados cujo atributo verificável justifica o custo. Nunca embutir esse custo silenciosamente no plano pessoal.
3. **BYOS** — o desenvolvedor conecta/funde seu próprio backend ou créditos WAL/SUI. Nodus cobra a plataforma, não revende armazenamento com risco cambial.

Isso exige cumprir o roadmap de `StorageProvider`: a mesma API e a mesma cifragem no cliente devem aceitar backend privado econômico e Walrus. Enquanto isso não existir, Nodus deve vender somente Sandbox/BYOS, design partners ou a modalidade Verify com custo explicitamente variável.

### Preço de teste menor e mais honesto

| Produto | Preço/mês proposto | Inclui | Limite econômico e observação |
| --- | ---: | --- | --- |
| Sandbox dev | R$ 0 | SDK, testnet, 1 projeto temporário | sem Mainnet patrocinada; limites antiabuso |
| Private 50 | R$ 9,90 | 50 GB em backend econômico | custo B2 estimado ~R$ 1,91/usuário/mês; adequado apenas com automação e suporte muito leve |
| Private 200 | R$ 19,90 | 200 GB em backend econômico | custo B2 estimado ~R$ 7,65; preço compete por clareza/privacidade, não por menor preço |
| Private 500 | R$ 39,90 | 500 GB em backend econômico | custo B2 estimado ~R$ 19,11; medir egress e tickets antes de escalar |
| Dev Platform / BYOS | R$ 29 por projeto | SDK, API, RBAC, auditoria e 1 GB de metadados/controle | dados e tokens pertencem ao cliente; não há risco de quota Walrus para Nodus |
| Verify | R$ 29 por projeto + R$ 0,79/GB lógico/mês | renovação e prova Walrus | custo-base Walrus ~R$ 0,57/GB; preço preserva buffer para write fee, gas e falhas |

Esses preços são hipóteses de landing page, não compromisso comercial. `Private 50` e `Private 200` só podem ser ofertados após confirmar: localização/regime de dados, egress real, criptografia de ponta a ponta, backup, recuperação e margem medida. Não anunciar “zero knowledge” se algum fluxo de recuperação entregar poder de decifrar à Nodus.

### Novo orçamento baixo: separar o que é fixo do que é variável

O modelo anterior misturava reservas vagas de suporte/control plane. Para o teste inicial, usar este piso explícito — sem salários e sem CAC:

| Item mensal | Cenário de validação | Base |
| --- | ---: | --- |
| API + PostgreSQL sempre ligados | R$ 72 | US$ 13/mês, referência Render, `FX=5,50` |
| Domínio, e-mail transacional, logs/erros, backup, pequenos RPCs | R$ 228 | **teto interno de R$ 228**, substituir por faturas |
| Total fixo de validação | **R$ 300/mês** | não inclui pró-labore, jurídico, segurança, marketing ou alta disponibilidade |

Custos variáveis por cliente no cenário Private usam: `storage B2 + 4% pagamento + R$ 0,50 de metadados/operação`. Assim, em quota cheia: Private 50 gera cerca de R$ 7,09 de contribuição; Private 200, R$ 10,95; Private 500, R$ 18,69. Isto revela o problema real: planos de consumo podem ter preço baixo, mas não financiam atendimento humano nem desenvolvimento. Eles são uma camada de aquisição/retenção, não a fonte inicial de sustentabilidade.

Para Verify: em 20 GB lógicos, receita é R$ 44,80, custo-base de storage é R$ 11,39 e a contribuição antes de gas/write fee/pagamento é R$ 33,41. O cliente paga o que realmente quer — prova e permanência verificável — sem que a Nodus finja que isso custa como um drive comum.

## Break-even: cenários auditáveis

### Premissas mensais revisadas — substituir após a medição

| Produto / uso | Receita | Storage no limite | Pagamento (4%) + operação | Margem de contribuição |
| --- | ---: | ---: | ---: | ---: |
| Private 50 | R$ 9,90 | R$ 1,91 | R$ 0,90 | **R$ 7,09** |
| Private 200 | R$ 19,90 | R$ 7,65 | R$ 1,30 | **R$ 10,95** |
| Private 500 | R$ 39,90 | R$ 19,11 | R$ 2,10 | **R$ 18,69** |
| Dev Platform / BYOS | R$ 29,00 | R$ 0,00 | R$ 1,66 | **R$ 27,34** |
| Verify, 20 GB | R$ 44,80 | R$ 11,39 | R$ 2,29 + gas/write fee a medir | **R$ 31,12 menos gas/write fee** |

Estes são cenários de **quota cheia** e `FX=5,50`. Private usa B2 como hipótese de backend; Verify usa a fórmula oficial de Walrus. Salários, pró-labore, aquisição de cliente, jurídico, segurança e impostos sobre receita ficam no custo fixo.

Fórmula: `clientes de equilíbrio = custo fixo mensal / margem de contribuição média`.

- Piso técnico de validação de R$ 300/mês: 43 Private 50, 28 Private 200, 17 Private 500, 11 projetos BYOS, ou 10 projetos Verify de 20 GB (antes de gas/write fee).
- Operação com R$ 3.000/mês de fixo: os mesmos números multiplicados por dez. Isto deixa explícito por que BYOS/Verify e venda B2B devem financiar o produto, enquanto o plano pessoal prova retenção.

O número não é uma previsão; é o indicador que torna a conversa testável. Antes de vender, definir: custo fixo aprovado, margem mínima alvo por produto (Private ≥45% em quota cheia; BYOS/Verify ≥65% antes de CAC), limite de arquivos sem Quilt, renovação de epochs e política de câmbio.

## Produto humano: “seguro por padrão, compreensível por escolha”

1. **Três portas, uma infraestrutura:** “Guardar meus arquivos”, “Trabalhar com minha equipe”, “Construir com a API”. Cada uma mostra apenas as ações e termos daquele trabalho.
2. **Conta antes de wallet:** e-mail + passkey como começo; wallet é uma forma avançada de prova/assinatura, explicada no momento em que traz benefício. Recuperação deve deixar explícito o trade-off: se ninguém além do usuário possui a chave, Nodus não pode restaurar magicamente o conteúdo.
3. **Linguagem de resultado:** “Arquivo protegido”, “Permitir acesso à Ana até 30 de novembro”, “Renovação agendada”. “Blob”, “epoch”, “PDA”, “WAL” e “SUI” ficam em “Detalhes técnicos”.
4. **Privacidade sem absolutismo:** dizer “o arquivo é cifrado no seu dispositivo antes do envio”; não dizer “impossível de perder”, “anonimato total” ou “revogação apaga cópias”. Explicar que revogar bloqueia acesso futuro pelo Nodus, não uma cópia já decifrada.
5. **Confiança visível:** tela “Como seus dados são protegidos?” com localização/arquitetura, status de renovação, exportar dados, atividade e canal humano. Manter metadados pessoais fora de Solana e documentação clara de transferências internacionais.
6. **Acesso inclusivo:** PT-BR como padrão, contrastes e foco de teclado, estados vazios úteis, upload com pausa/retomada, métricas em linguagem cotidiana e suporte que não peça seed phrase.

## Plano de validação em 90 dias

1. **Semanas 1–2 — medição real:** executar 1 GB, 20 GB, 100 GB e conjunto de pequenos objetos em Mainnet controlada; registrar `walrus info`, dry-runs, WAL/SUI gastos, número de blobs, gas, bytes e tempo. Rodar as operações Solana de org/membro/capability e registrar SOL/rent/RPC. Não usar estimativa como fatura.
2. **Semanas 2–4 — 15 entrevistas:** 10 devs/squads e 5 software houses no Brasil. Testar dor, dados que não podem expor, orçamento, entendimento de recuperação e disposição para BYOS vs gerenciado. Não perguntar apenas “você usaria?”.
3. **Semanas 4–8 — 5 design partners pagos ou com carta de intenção:** entregar sandbox, SDK e uma integração real. Medir tempo até primeiro upload, sucesso de recuperação, custo efetivo/GB, retenção semanal e tickets de suporte.
4. **Semanas 8–12 — gate de preço:** publicar Private somente se a margem bruta medida ficar ≥45% em quota cheia, e BYOS/Verify somente se ficar ≥65%; nenhum fluxo de pequeno objeto pode ficar fora do limite e ao menos 3 parceiros devem integrar ou pagar. Caso contrário, mudar o empacotamento, quota ou modelo BYOS antes de ampliar aquisição.

## Métricas que importam

- ativação: primeiro upload cifrado e recuperado em até 15 minutos;
- valor: ativos recuperados/compartilhados por workspace ativo;
- economia: custo Walrus + Sui + Solana + relay por GB lógico, por blob e por tenant;
- margem: receita líquida menos custo variável, por plano e coorte;
- confiança: taxa de conclusão de backup/recovery, falhas de renovação e tickets por 100 contas;
- negócio: conversão Sandbox → pago, retenção em 30/90 dias, CAC payback e expansão por workspace.

## Lacunas e decisões pendentes

- [ ] Rodar a medição Mainnet para obter write fee, SUI gas e custo do publisher atuais.
- [ ] Definir quem assina/paga operações Sui/WAL e Solana; proteger a carteira contra uploads abertos e abuso.
- [ ] Definir conta, recovery e suporte de recuperação antes de abrir ao público não técnico.
- [ ] Validar, com advogado/DPO, papéis LGPD, metadados, retenção, suboperadores e transferências internacionais.
- [ ] Decidir se o consumidor verá quota em GB lógico, GB faturável ou ambos; a recomendação é mostrar GB lógico e explicar o limite comercial de forma simples.
- [ ] Fazer a camada `StorageProvider` prometida no roadmap antes de afirmar portabilidade entre provedores.
