# Nodus Private Data Layer — plano de execução, custo e go-to-market

> Documento de decisão. Atualizado em 03 de outubro de 2026. Valores em BRL são hipóteses de teste; só viram preço publicado após medição em Mainnet e piloto pago.

## Decisão

A Nodus deixa de se apresentar como “Drive Web3” ou hospedagem genérica. O produto de entrada passa a ser **a camada privada de arquivos para apps e equipes**: SDK/API, cifragem no dispositivo, políticas de acesso de organização, catálogo de metadados mínimos, auditoria e uma opção de armazenamento verificável.

O primeiro comprador não é o consumidor final e tampouco quem procura o GB mais barato. É a equipe de 3–20 pessoas que constrói SaaS, ferramenta de IA, portal de documentos ou produto Web3 e não quer criar do zero a parte mais sensível: upload privado, gestão de chaves, compartilhamento e controle de acesso.

```text
Aplicação do cliente
        │ SDK Nodus: cifra no dispositivo + envelopes
        ▼
Nodus Private Data Layer
  ├─ autenticação / organização / API keys / auditoria
  ├─ quotas, custo e renovação
  └─ StorageProvider escolhido pelo cliente
        ├─ backend privado econômico (padrão)
        ├─ Walrus Verify (prova/renovação, premium)
        └─ BYOS (cliente paga seu provider e tokens)
```

## O que vender primeiro

### ICP inicial e trabalho que ele contrata

| Prioridade | Cliente | Trabalho a ser feito | Oferta Nodus |
| --- | --- | --- | --- |
| 1 | SaaS B2B, software houses e agências brasileiras | Guardar e compartilhar documentos/mídia sensíveis dentro do próprio app sem desenhar criptografia e ACL | `Private Data SDK` + workspace + suporte de integração |
| 2 | Founders e equipes Web3 em hackathons/aceleradoras | Criar um produto com dados privados, assinatura/roles e storage verificável | `Verified Access` + Walrus como add-on explícito |
| 3 | Consultorias, jurídico, RH e equipes criativas | Cofre colaborativo com convite, expiração e auditoria | Piloto assistido, somente após recovery e operação madura |
| Depois | Consumidor individual | Backup/sync pessoal | Produto diferente: exige preço baixo, recovery, suporte e retenção próprios |

**Mensagem de venda:** “Adicione arquivos privados ao seu produto em dias, não meses. A Nodus cifra no dispositivo, controla acesso por equipe e mostra o custo antes de você armazenar.”

Não prometer “compliance LGPD”, “zero knowledge” absoluto, durabilidade eterna ou SLA de cloud nesta fase. Criptografia não substitui contrato, governança de metadados, atendimento a direitos do titular ou operação de incidentes.

## Modelo de custo e preço

### Princípio comercial

Não revender TB de Walrus como se fosse iCloud. O preço precisa separar claramente:

1. **Plataforma:** SDK, API, tenant, RBAC, eventos, auditoria e suporte;
2. **Uso do provider:** armazenamento, operações, tráfego e renovação;
3. **Garantia verificável:** Walrus é add-on, não custo escondido.

### Custo unitário que muda a decisão

Para um arquivo grande ou objetos empacotados, o custo publicado do Walrus equivale aproximadamente a `US$ 0,023 × (4,5 × GB lógico + 0,064 × blobs)` por mês. Com câmbio de planejamento de R$ 5,50, isso dá cerca de **R$ 0,569 por GB lógico/mês**, antes de write fee em WAL, gas Sui, pagamento e suporte. Objetos pequenos isolados destroem a margem pelo overhead de 64 MB por blob; Quilt/empacotamento é obrigatório antes de qualquer plano por GB. [Walrus storage costs](https://docs.wal.app/docs/system-overview/storage-costs) · [Quilt](https://docs.wal.app/docs/system-overview/quilt)

Como comparação de infraestrutura, Backblaze B2 publica US$ 6,95/TB/mês e Cloudflare R2 US$ 0,015/GB-mês; eles não fornecem a mesma prova verificável do Walrus, mas definem a alternativa econômica do cliente. [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) · [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/)

| Modalidade | Receita proposta | Custo variável a controlar | Regra de margem |
| --- | ---: | ---: | --- |
| Sandbox | R$ 0 | Testnet e limite antiabuso | Nenhuma garantia; aquisição de desenvolvedor |
| Builder BYOS | R$ 99/projeto/mês | pagamento (~4%), control plane e suporte leve | meta ≥ 65% de margem de contribuição |
| Design Partner | R$ 499/workspace/mês | suporte de integração, control plane, provider do cliente | meta ≥ 70%; 3 projetos e até 10 usuários incluídos |
| Walrus Verify | R$ 2,00/GB lógico/mês + write/gas repassados a custo + 15% | R$ 0,569/GB lógico/mês como piso de storage; blobs, Sui e renovação | não subsidiar WAL/SUI; meta ≥ 60% após custos variáveis medidos |
| Private Managed | só após `StorageProvider` e piloto | B2/R2, egress, backup, suporte, pagamento | preço por workspace + uso; não lançar como plano pessoal barato |

**Por que R$ 2,00/GB Verify?** Sobre o piso de R$ 0,569, restam R$ 1,431/GB antes de write fee, gas, taxa de pagamento e suporte. R$ 0,79/GB, hipótese anterior, não preserva margem suficiente para esses custos. O write/gas deve aparecer como linha separada na fatura até haver medição para embuti-lo com segurança.

### Break-even que vale acompanhar

O cenário de validação técnica de R$ 300/mês não representa uma empresa. Para um beta assistido, aprovar um orçamento fixo explícito — por exemplo R$ 3.000/mês **sem salários nem CAC** — e medir a contribuição real por cliente.

No exemplo conservador, um Design Partner de R$ 499 com R$ 20 de pagamento, R$ 30 de suporte alocado e R$ 10 de control plane gera R$ 439 de contribuição. O ponto de equilíbrio de R$ 3.000 exige **7 parceiros**. Um Builder BYOS de R$ 99, com R$ 15 de custo variável, gera R$ 84: exigiria **36 projetos**. Portanto:

- design partners financiam aprendizado e suporte;
- BYOS escala depois que o onboarding é autosserviço;
- consumidor não financia o começo;
- Verify só escala com ledger de custo e limites de blob.

## Go-to-market: 90 dias

### Oferta de piloto

Vender 5 vagas de **Design Partner**, não um plano genérico:

- R$ 499/mês, cancelável mensalmente, por três meses;
- um caso de uso definido (documentos de cliente, mídia privada, artefatos de IA ou portal de parceiros);
- implantação acompanhada, canal de suporte e revisão quinzenal;
- cliente usa seu provider/conta quando possível; Walrus só para caso que realmente precisa de prova verificável;
- contrapartida: telemetria operacional sem plaintext, entrevista de onboarding e autorização para estudo de caso apenas se aprovada por escrito.

**Critério de venda:** o prospect deve já ter um fluxo de arquivos no produto ou uma entrega prevista nos próximos 60 dias. Não aceitar pilotos baseados só em curiosidade por blockchain.

### Canais e cadência

| Semanas | Ação | Métrica de decisão |
| --- | --- | --- |
| 1–2 | Lista de 40 leads: 20 software houses/SaaS, 10 comunidades Solana/Superteam, 10 times de IA/portais B2B | 15 conversas agendadas |
| 3–4 | Demo de 20 minutos usando o template “portal privado” e diagnóstico de arquitetura | 8 dores qualificadas; 5 propostas de piloto |
| 5–8 | Onboard os 3 primeiros parceiros; acompanhar integração e custo por fluxo | 3 integrações chegam a upload + share em sandbox |
| 9–12 | Converter para pago, publicar um template e repetir aquisição por parceiros/agências | 3 pagantes ou LOIs; ≥ 60% ativam em até 14 dias |

Os precedentes do Colosseum ajudam a posicionar, não a vender por si. [Chakra Drive](https://colosseum.com/projects/explore/chakra-drive) valida interesse por storage E2E; [Solana Seal](https://colosseum.com/projects/explore/solana-seal-unleashing-the-power-of-walrus.xyz-and-seal-on-solana) mostra que Walrus + Seal + Solana já existe como demo; [TAPEDRIVE](https://colosseum.com/projects/explore/tapedrive) mostra a importância de economia legível para desenvolvedores. A Nodus precisa vencer em integração, operação e UX de equipe.

## Milestones urgentes — bloquear venda se não existirem

### U0 — definir o produto vendável e instrumentar custo (semana 1)

- [ ] Fixar um único golden path: **portal B2B com upload, compartilhamento por equipe, revogação e download**.
- [ ] Criar ledger por organização e asset: GB lógico, GB faturável, blobs, provider, write fee, gas Sui, transações Solana, bytes de download, custo BRL e status de renovação.
- [ ] Executar matriz real em Mainnet controlada: 1 GB, 20 GB, 100 GB e 1.000 objetos pequenos empacotados; registrar recibos e custo, sem dados sensíveis.
- [ ] Definir limites de produto: tamanho mínimo para objeto isolado, política Quilt, máximo de blobs/upload, câmbio usado e budget de WAL/SUI por tenant.

**Saída:** uma tabela reproduzível de custo por operação; sem ela, nenhum preço Verify é publicável.

### U1 — desacoplar o storage (semanas 1–3)

- [ ] Criar a interface `StorageProvider` no SDK/control plane, sem quebrar a API atual.
- [ ] Extrair `WalrusStorageProvider` da lógica de upload existente.
- [ ] Implementar um provider S3-compatível/B2 ou R2 para o modo Private Managed; BYOS deve funcionar antes da cobrança autosserviço.
- [ ] Exportar manifestos, ciphertext e metadados de catálogo por organização.
- [ ] Testar a mesma operação `put/get/share/delete` contra os dois providers.

**Saída:** a Nodus vende a camada de privacidade, e não fica presa a uma única economia de storage.

### U2 — transformar a API existente em integração comprável (semanas 2–4)

- [ ] Validar PostgreSQL real no sandbox para tenants, reservas, API keys, idempotência e webhooks já implementados.
- [ ] Publicar quickstart de até 15 minutos e template funcional “portal privado” em Next.js/React.
- [ ] Criar chave de projeto, ambientes `sandbox`/`production` e rotação/revogação visível.
- [ ] Expor logs de auditoria e erros acionáveis sem conteúdo de arquivo ou chaves.
- [ ] Rodar a integração do template com uma equipe externa antes de chamar de beta.

**Saída:** um dev externo faz upload, compartilha e revoga sem intervenção no banco ou chamada direta ao time.

### U3 — operar o beta sem inventar SLA (semanas 3–6)

- [ ] Backup criptografado do PostgreSQL e teste de restauração documentado.
- [ ] Alertas de API, banco, publisher, falha de renovação, quota e custo anômalo.
- [ ] Job idempotente de renovação Walrus com alertas e orçamento máximo por tenant.
- [ ] Política de incidentes, exportação e privacidade/LGPD mínima para piloto.
- [ ] Página de status interna e runbook de suporte; nenhum SLA público até 60–90 dias de métricas.

**Saída:** a equipe consegue restaurar metadados, detectar uma expiração e explicar ao parceiro o que aconteceu.

### U4 — experiência humana de equipe (semanas 4–6)

- [ ] Onboarding por e-mail/passkey; wallet/SIWS fica como opção avançada para a prova verificável.
- [ ] Tela de membros, convite, papel, expiração, revogação e aviso honesto sobre cópias já decifradas.
- [ ] Tela de uso com “GB do seu produto”, provider, custo estimado e data de renovação; termos técnicos em detalhes.
- [ ] Exportação e recuperação com trade-offs explicados; nunca pedir seed phrase ao usuário.

**Saída:** uma pessoa não cripto consegue convidar alguém e entender o estado de proteção do arquivo.

### U5 — fechar o primeiro loop comercial (semanas 6–12)

- [ ] Fazer 15 entrevistas e registrar alternativa atual, dado crítico, orçamento e objeção.
- [ ] Converter 3 design partners pagos ou LOIs com caso de uso e métrica de sucesso definida.
- [ ] Medir tempo até o primeiro upload, primeiro compartilhamento, custo por GB/blob e ticket de suporte.
- [ ] Fazer revisão de preço após 30 dias; manter margem de contribuição alvo antes de ampliar aquisição.

**Saída:** prova de disposição a pagar por plataforma, não apenas elogio ao conceito.

## Itens importantes, mas opcionais agora

| Não iniciar antes de U0–U5 | Motivo |
| --- | --- |
| Plano pessoal barato e app de fotos | Concorre com iCloud/Google em preço, sync e suporte antes de haver distribuição/margem |
| Deploy/hosting, RPC próprio, indexador próprio ou “Hostinger Web3” completo | Aumenta escopo e enfrenta Vercel, Render, Helius e thirdweb fora da vantagem da Nodus |
| Checkout Pix/cartão autosserviço | Parceiros podem ser faturados manualmente enquanto preço e custo são incertos |
| Social recovery sofisticado, links públicos e marketplace | Exigem threat model, UX e suporte; não validam a primeira compra B2B |
| SLA contratual, multi-região e enterprise compliance | Dependem de métricas, backup/DR, suporte e contrato; não são claim de beta |
| Mainnet Solana para todo RBAC | A prova Devnet é urgente para a demo atual; Mainnet só deve entrar quando o cliente realmente exigir verificabilidade on-chain |
| Segundo/terceiro provider além do primeiro S3-compatível | A portabilidade inicial é suficiente para testar; multiplicar providers cedo vira custo operacional |

## Sequência de decisão

1. **Até o fim da semana 1:** aprovar o golden path, o ledger de custo e a lista de 40 leads.
2. **Até a semana 4:** escolher o primeiro provider econômico e demonstrar o template com uma equipe externa.
3. **Até a semana 6:** operar três pilotos com backup, alertas e renovação observável.
4. **Até a semana 12:** escalar somente se houver três parceiros pagos/LOIs, ativação em até 14 dias e margem medida que cobre o orçamento aprovado.

Se um gate falhar, reduzir escopo ou migrar para BYOS; não compensar incerteza técnica com desconto ou com promessa de “cloud completa”.

## Documentos de apoio neste diretório

- [Economia unitária e benchmark](GO_TO_MARKET_E_UNIT_ECONOMICS.md)
- [Estratégia Web3 Launch Cloud](PESQUISA_ESTRATEGICA_WEB3_LAUNCH_CLOUD.md)
- [Concorrentes globais, SLA e análise Colosseum](PESQUISA_GLOBAL_SLA_E_POTENCIAL_NODUS.md)
