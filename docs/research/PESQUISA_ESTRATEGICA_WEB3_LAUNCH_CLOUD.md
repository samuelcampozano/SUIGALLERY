# Nodus Web3 Launch Cloud — pesquisa estratégica

*Atualizado em 3 de outubro de 2026. Fontes: páginas oficiais de preço, documentação de produto e fontes institucionais. Confiança: alta para preços/funcionalidades publicados; média para disposição a pagar e TAM, que precisam ser validados com clientes brasileiros.*

## Resumo executivo

A melhor leitura da ambição da Nodus não é “um Dropbox privado barato” nem “um Walrus reseller”. É uma **Web3 Launch Cloud brasileira**: a base privada de dados e permissões que permite a uma pessoa ou pequena empresa começar em uma experiência simples e, quando seu produto precisar, ativar identidade, assinatura, colaboração verificável, pagamentos e integrações on-chain.

O benchmark sustenta que pequenos builders pagam por **remoção de complexidade**, não por storage: Vercel cobra US$20/mês pelo Pro; Helius cobra US$49/mês para um pequeno projeto Solana; thirdweb começa em US$99/mês para times/startups. [Vercel](https://vercel.com/pricing), [Helius](https://www.helius.dev/pricing), [thirdweb](https://thirdweb.com/pricing) A Nodus pode ter um plano Builder pago sem ser “cara” se entregar um caminho realmente menor entre ideia, primeiro usuário e app com dados privados.

Mas não deve se descrever hoje como uma Hostinger completa: Hostinger inclui domínio, e-mail, SSL, backups, deploy, banco e suporte em um bundle; a Nodus hoje tem storage, cifragem no cliente, catálogo, sharing, SIWS e RBAC. A tese precisa ser executada por etapas, começando por uma fatia nítida: **“dados privados e acesso de equipe para aplicações que querem evoluir para Web3”**.

## 1. O que cada referência de mercado realmente vende

| Grupo | Empresa | Modelo que o cliente compra | Preço público relevante | Implicação |
| --- | --- | --- | --- | --- |
| Hospedagem SMB | Hostinger | pacote pronto: domínio, e-mail, SSL, backups, deploy, suporte e recursos de site | promo de R$5,99/mês para 10 GB; Cloud Startup R$39,99/mês/100 GB; o preço promocional exige período longo e há preço de renovação | O valor é “coloque meu projeto no ar”, não GB. Nodus deve copiar o empacotamento e onboarding, não a falsa equivalência de custo. [Hostinger](https://www.hostinger.com/br/precos) |
| Plataforma web | Vercel | deploy, CI/CD, CDN, segurança, colaboração e limites claros | Hobby grátis; Pro US$20/mês com crédito de uso | Freemium para aprender, plano previsível para trabalho profissional, usage para escala. [Vercel](https://vercel.com/pricing) |
| App cloud | Render | serviço/banco gerenciados e escala por compute | Hobby grátis + compute; Pro US$25/mês + compute | Separar “assento/workspace” de recursos evita que storage subsidie operação indefinidamente. [Render](https://render.com/pricing) |
| Infra Web3 multi-chain | Alchemy | RPC, webhooks, APIs e dashboard | Free até 100M CU/mês; PAYG desde US$5 / US$0,40 por 1M CU, conforme a página | O padrão é onboarding gratuito e cobrança por unidade de consumo, com limite de gasto configurável. [Alchemy](https://www.alchemy.com/alchemy.com/pricing) |
| Full-stack Web3 | thirdweb | SDKs, wallet in-app, contratos, account abstraction, RPC/IPFS e suporte | Growth US$99/mês, Scale US$499, Pro desde US$1.499 | A referência mais próxima de “plataforma para construir Web3”; competir frontalmente exigiria uma superfície muito maior. [thirdweb](https://thirdweb.com/pricing) |
| Infra Solana | Helius | RPC, indexação, webhooks, transação e suporte especializado | Free 1M créditos; Developer US$49/mês; Business US$499/mês | Foco profundo numa chain e suporte podem justificar ARPA alto. Nodus não deve construir RPC próprio no MVP; deve integrar um parceiro. [Helius](https://www.helius.dev/pricing) |
| Storage Web3 | Walrus Console | arquivos Walrus, login social, chave/API e renovação | beta fechada, sem cobrança; 5 GB, 5 pastas, upload até 100 MiB | Já existe uma porta de entrada Walrus. Nodus só ganha se resolver colaboração, privacidade, experiência de equipe e caso de uso de app melhor que o Console. [Walrus Console FAQ](https://docs.wal.app/docs/console/faq) |

### Leitura comparativa

1. **Hostinger simplifica uma pilha conhecida.** A pessoa entra para publicar algo, recebe defaults, suporte, domínio e backups. O preço baixo costuma ter compromisso longo e upsell; não é uma métrica de custo de um produto Web3.
2. **Vercel, Render, Alchemy e Helius ensinam antes de cobrar.** Free/testnet não é caridade: reduz atrito e dá ao time um funil para uso profissional/produção.
3. **thirdweb prova que uma plataforma Web3 pode vender a US$99+**, desde que substitua várias decisões difíceis: wallet, contratos, abstração de conta, RPC, IPFS, SDKs e suporte.
4. **Walrus Console cria concorrência direta apenas para “guardar um arquivo em Walrus”.** Ainda está em beta, tem limites e não oferece time compartilhado na fase atual; isso abre espaço para Nodus, mas também significa que não se deve depender de uma lacuna permanente.

## 2. Onde a Nodus pode vencer — e onde não deve competir

### Não é um diferencial suficiente

- “Usamos Walrus” — o próprio Walrus Console permite login Google/Apple, provisiona wallet e financia/renova o fluxo durante a beta. [Walrus Console](https://docs.wal.app/docs/console/faq)
- “Temos storage descentralizado” — IPFS, Storj, Filebase e outros já são escolhas conhecidas de storage. O comprador de infra compara compatibilidade, preço, egress, SLA e SDK.
- “Temos uma wallet” — thirdweb, Alchemy e ferramentas de chain já oferecem primitives de wallet/autenticação.
- “Somos mais baratos que cloud comum” — para arquivos em Walrus, a codificação de ~4,5× torna esta afirmação vulnerável. [Walrus Storage Costs](https://docs.wal.app/docs/system-overview/storage-costs)

### Diferencial que vale perseguir

**A transição segura de Web2 privado → produto Web3, em português e com defaults corretos.**

Um founder poderia começar com e-mail/passkey, upload cifrado, permissões de time e SDK; só depois adicionaria SIWS, roles verificáveis, pagamentos/assinaturas e evidência on-chain. O usuário final nunca precisa ver WAL, SUI, epoch ou seed phrase. A documentação do Walrus confirma que se pode patrocinar uploads e manter o usuário sem wallet; o trade-off é que a Nodus opera a carteira que paga e assina. [Walrus — sponsored and walletless uploads](https://docs.wal.app/docs/sponsored-uploads)

Isso conecta exatamente a capacidade atual da Nodus — cifragem no cliente, envelopes, catálogo por tenant, API keys, colaboração, Solana RBAC — a uma dor vendável: **“adicione arquivos privados e compartilhamento confiável ao seu SaaS sem virar custodiante de chaves.”**

## 3. Segmentos prioritários e jobs-to-be-done

| Segmento | Primeiro job | Dor atual | Por que Web3 entra depois | Oferta Nodus de entrada |
| --- | --- | --- | --- | --- |
| Dev/founder de SaaS B2B (3–20 pessoas) | entregar upload, documentos, mídia e acesso de equipe sem construir segurança de storage | S3/R2 resolve objeto, mas não entrega fluxo de chave, compartilhamento, auditoria e UX privada | pode usar assinatura, auditoria verificável ou identidade on-chain quando há tração | **Private Files Kit**: SDK, templates, RBAC, vault e setup guiado |
| Software house/agência | lançar vários produtos para clientes com o mesmo padrão de segurança | reinventa auth, assets e permissão a cada projeto | carteira/roles podem ser ativados somente no cliente que precisa | **Studio Kit**: projetos, organizações, ambientes e templates reutilizáveis |
| Founder Web3/hackathon | construir demo e depois produção sem montar toda a infra | RPC, IPFS, wallet, contratos e pagamentos são peças soltas | Web3 é requisito desde o início, mas precisa de starter kit e crédito | **Web3 Launch Kit**: storage privado, SIWS, roles, exemplo de app e parceiros de RPC |
| Consumidor/prosumer | guardar e compartilhar arquivos sem expor conteúdo | não quer aprender crypto nem pagar uma nuvem “Web3” | pode se beneficiar de prova/portabilidade sem operar tokens | **Nodus Vault**: produto separado, convite, recovery e suporte; não é canal de aquisição de dev no início |

**Decisão de foco:** vender primeiro aos dois segmentos de builders (SaaS B2B e Web3/hackathon), pois eles podem instalar Nodus dentro de seus produtos e trazem usuários finais. O Vault para consumidor continua como laboratório de confiança e marca, não como tese de receita que sustenta a empresa no ano um.

## 4. A “escada” de produto: a ponte para Web3 sem impor Web3

```text
1. Private Files Kit
   e-mail/passkey · cifragem no cliente · assets · sharing · API key
                         ↓ ativação opcional
2. Verified Access Kit
   SIWS · organizações/roles · audit trail · prova de permissão
                         ↓ ativação opcional
3. Web3 Launch Kit
   templates · sandbox/devnet · parceiro RPC · webhooks · billing/credits
                         ↓ quando houver escala
4. Cloud de produção
   ambientes · observabilidade · SLA · multi-provider · suporte humano
```

Regra de design: cada degrau precisa produzir valor sozinho. Um SaaS pode parar no primeiro e continuar um produto útil. Ninguém deve ser obrigado a criar wallet para subir arquivo. Esta abordagem é coerente com a própria documentação Sui, que apresenta zkLogin como forma de usar login Web2 sem seed phrase, e com o padrão de uploads walletless de Walrus. [Sui Docs](https://docs.sui.io/), [Walrus sponsored uploads](https://docs.wal.app/docs/sponsored-uploads)

## 5. Estrutura de oferta e preço para a tese Hostinger-Web3

O preço deve seguir o que o builder entende: **projeto + pacote + uso**, não “quota de GB Walrus escondida”. Proposta para entrevista/pré-venda, em BRL e mensal, sem contrato promocional:

| Plano | Hipótese de preço | Para quem | Entrega que precisa existir | Uso variável |
| --- | ---: | --- | --- | --- |
| Sandbox | R$0 | aprender, hackathon, devnet | 1 projeto, template, testnet, docs PT-BR e limites rígidos | sem Mainnet patrocinada |
| Builder | R$49/projeto | dev/founder iniciando produto | Private Files Kit, API key, ambiente sandbox/produção inicial, alertas de custo | storage econômico e serviços de chain cobrados por uso ou BYOS |
| Studio | R$149/workspace | agência ou pequeno squad | 3 projetos, membros/roles, logs, templates e suporte assíncrono | pacote de uso + excedente claro |
| Launch Partner | R$499+ | startup com aplicação em produção | onboarding, arquitetura, SLA inicial, integração de parceiro RPC e revisão de custo | contrato/uso sob medida |

Esses níveis se posicionam abaixo de thirdweb Growth (US$99), próximos de um developer plan Solana internacional (Helius US$49) e acima de hospedagem compartilhada porque incluem uma camada de segurança/programabilidade, não simplesmente CPU/SSD. O preço só é sustentável se Builder for self-serve e não patrocinar armazenamento Walrus sem limite.

### Modelo de cobrança recomendado

- **Assinatura da plataforma** para projeto, equipe, DX e suporte.
- **Créditos de uso com teto aprovado** para storage gerenciado, operações e serviços de parceiro; mostrar projeção antes de exceder.
- **BYOS/BYOWallet** para times que já têm R2/S3/WAL/SUI ou contrato de RPC: reduz risco de caixa e acelera a adoção.
- **Verify/Walrus como add-on**, com custo por GB lógico, write fee/gas visíveis e renovação configurável. Nunca esconder a expiração por epochs.
- **Créditos para hackathon e parceiros**, com validade e orçamento máximo. O ecossistema Solana tem escala de builders e hackathons; a fundação informa 48 mil desenvolvedores, 3 mil projetos lançados e US$600 milhões em financiamento atribuídos ao programa. Isso justifica distribuição por comunidade, não prova vendas no Brasil. [Solana Hackathons](https://solana.com/pt/hackathon)

## 6. O que construir, em ordem — e o que integrar

| Horizonte | Construir na Nodus | Integrar/ter parceria | Não fazer ainda |
| --- | --- | --- | --- |
| 0–90 dias | SDK estável, template inicial, organização/roles, cifragem, onboarding e painel de consumo | Helius/QuickNode para RPC, provedor de pagamentos Pix/cartão, R2/S3 e Walrus | RPC próprio, node validator, banco de dados generalista, deploy de qualquer framework |
| 3–6 meses | `StorageProvider`, projeto/ambiente, CLI, logs de auditoria, créditos e migração/export | templates com wallets, indexadores e deploy | competir com Vercel/Render em compute e CI/CD |
| 6–12 meses | marketplace de templates, parceiro/agência, compliance e SLA por camada | rede de consultores e comunidades brasileiras | prometer “all-in-one Web3 cloud” antes de retenção mensurada |

O parceiro de RPC é particularmente importante: Helius já oferece free tier de 1M créditos e plano Developer de US$49 com RPC, webhooks e recursos Solana; consumir esse serviço é mais rápido e menos arriscado que tentar replicá-lo. [Helius](https://www.helius.dev/pricing) QuickNode e Alchemy também já adotam medição por créditos/compute, o que reforça o modelo de uso com spend caps, não planos ilimitados. [QuickNode API Credits](https://www.quicknode.com/api-credits), [Alchemy](https://www.alchemy.com/alchemy.com/pricing)

## 7. Go-to-market Brasil

1. **Distribuição antes de mídia paga:** Superteam Brazil, hackathons, comunidades de React/Node/Solana, software houses e faculdades. A Superteam Brazil se apresenta como hub oficial da comunidade Solana no país, conectando builders, founders e investidores. [Superteam Brazil](https://www.superteam.com.br/en)
2. **Oferta de prova, não desconto sem fim:** “publique um Private Files Kit em 30 minutos”, com template de SaaS, vídeo PT-BR e crédito devnet. A métrica é primeiro asset cifrado + primeiro compartilhamento + primeira chamada SDK, não cadastro.
3. **Design partners em duas trilhas:** cinco SaaS B2B com dados privados e cinco founders Web3. Cobrar um valor simbólico ou obter LOI; crédito grátis sozinho não valida vontade de pagar.
4. **Canal agência:** entregar um template white-label, arquitetura e programa de parceiros. A agência compra velocidade e repetibilidade; não compra “blockchain” por si só.
5. **Consumidor somente com convite:** recrutar 20–30 pessoas para teste de onboarding/recovery. Sucesso é concluir upload, compartilhar e recuperar sem ajuda, não GB consumido.

## 8. Como provar disposição a pagar

Não existe dado público que responda “quantos brasileiros pagarão pela Nodus”. A pergunta deve virar experimento:

| Hipótese | Sinal mínimo em 60 dias | Decisão se falhar |
| --- | --- | --- |
| Devs pagam R$49 para evitar criar camada privada/roles | 3 de 10 design partners pagam ou assinam LOI com valor | reduzir escopo ao SDK/BYOS ou mudar ICP, não baixar preço automaticamente |
| Agências pagam R$149 por workspace | 2 agências implantam template em cliente real | transformar em serviço/parceria antes de produto de massa |
| Verify tem valor próprio | 2 clientes escolhem add-on e compreendem expiração/custo | manter Walrus como opção avançada, não proposta central |
| Consumidor entende a promessa sem wallet | 80% conclui fluxo assistido em teste de usabilidade | corrigir recovery/onboarding antes de abrir planos públicos |

## 9. Riscos que precisam constar do plano de negócio

- **Escopo excessivo:** “Hostinger + Vercel + Alchemy + thirdweb” não é MVP. A cunha é files privados + access + template, não compute generalista.
- **Dependência de protocolo:** Walrus Console ainda é beta fechada; suas regras, limites e eventual preço podem mudar. [Walrus Console FAQ](https://docs.wal.app/docs/console/faq)
- **Custo e patrocínio:** em uploads walletless patrocinados, a carteira da Nodus paga WAL e SUI; upload aberto sem rate limit é risco financeiro. [Walrus sponsored uploads](https://docs.wal.app/docs/sponsored-uploads)
- **Promessa de privacidade:** login sem wallet melhora conversão, mas recovery, metadados e suporte precisam ser descritos com precisão.
- **Brasil/LGPD:** o produto precisa de contratos, política de dados, DPA, mapeamento de suboperadores e mecanismo para transferências internacionais; cifragem não zera essas obrigações. [ANPD](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)

## Decisões recomendadas agora

1. Adotar oficialmente a narrativa **“Nodus Web3 Launch Cloud”**, com a frase operacional: “Comece com dados privados. Ative Web3 quando seu produto precisar.”
2. Tornar **Builder R$49/projeto** e **Studio R$149/workspace** hipóteses de entrevista, não preços já publicados.
3. Priorizar `StorageProvider`, template SaaS e dashboard de custo; sem eles a promessa de bridge é só marketing.
4. Integrar RPC e deploy em vez de tentar construí-los; a Nodus é dona da camada de dados privados, acesso e experiência.
5. Convidar dez design partners e decidir por receita/uso em 60 dias se a tese é SaaS B2B, Web3 founder ou agência.

## Metodologia

Foram pesquisadas páginas oficiais de preços e documentação de Hostinger, Vercel, Render, Alchemy, thirdweb, Helius, QuickNode, Walrus, Sui, Solana, Superteam Brazil, Apple/Google/Dropbox, Cloudflare e Backblaze. Foram lidas em profundidade as páginas de Hostinger, thirdweb, Walrus Console, uploads patrocinados Walrus, Helius e Solana hackathons. Preços são um retrato de 3 de outubro de 2026 e devem ser revalidados antes de publicação.
