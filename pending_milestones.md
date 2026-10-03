# Nodus - Milestones Pendentes para o MVP

> Fonte de acompanhamento do grupo para o trabalho que ainda falta. Quando uma entrega estiver concluida, marque os itens correspondentes aqui e registre a implementacao, os testes e o commit em [`RECENT_IMPROVEMENTS.md`](RECENT_IMPROVEMENTS.md).

## Como usar este arquivo

- Este arquivo contem apenas trabalho **pendente** ou em validacao.
- `RECENT_IMPROVEMENTS.md` contem trabalho **entregue**, com contexto tecnico e evidencias.
- Ao concluir uma feature:
  1. marque seus criterios como `[x]` neste arquivo;
  2. adicione uma entrada em `RECENT_IMPROVEMENTS.md` com commit/PR, escopo e testes;
  3. mova a feature inteira para a secao **Concluido recentemente** ou remova-a deste arquivo na proxima revisao.
- Nao marcar como concluido sem teste automatizado ou evidencia manual reproduzivel.
- Itens de producao devem ser validados fora de mocks, quando aplicavel.

## Priorizacao para a banca - prazo curto (2 de outubro de 2026)

Esta secao nao remove escopo: ela define a ordem de execucao para maximizar a entrega demonstravel. O criterio vem do briefing: provar privacidade verificavel, busca privada e uma experiencia simples; e, para a apresentacao atual, tornar o papel da Solana real e auditavel. Itens marcados como **Obrigatorio agora** so contam como prontos com evidencia reproduzivel na demo. Itens **Depois da demo** permanecem no roadmap e nao devem consumir o tempo do caminho critico.

### Obrigatorio agora - caminho critico da demo

1. **Prova Solana Devnet real (M7):** implantar programa Anchor com contas `Organization`, `Member` e `Capability`; criar uma organizacao e dois membros por transacao assinada; consultar e exibir os PDAs, assinatura e explorer. O programa deve guardar apenas papéis, hashes/referencias ou raiz Merkle - nunca nome de arquivo, tags ou dados pessoais.
2. **SIWS conectado ao RBAC on-chain (M7):** Phantom/Solflare assina o desafio; o backend confere wallet, membership/capability da Devnet e aplica o papel efetivo ao fluxo demonstrado. O modo demo/local nao vale como evidência da banca.
3. **Happy path privado real (M0/M1):** no navegador, cifrar um arquivo, enviar ciphertext ao Walrus Testnet, recuperar/baixar e mostrar o Blob no explorer. Registrar que o gateway nao recebeu plaintext e usar somente dados consentidos.
4. **Colaboracao soberana minima (M5):** compartilhar um asset com outro membro Solana, com papel e prazo; o segundo membro abre pelo envelope; revogar o acesso e mostrar a nova leitura de envelope bloqueada. Explicar o limite de cópias já decifradas.
5. [x] **Produto apresentavel (M9):** portar a landing e o shell do app da branch `Nodus---Design-System-(-app-and-website-)` para a aplicacao real. Design system oficial (#080B0A, Nodus Blue, Guardian render 3D voxel oficial, navegação fluida com `#app` e botão "Website", 100% responsivo e i18n PT-BR/ES/EN).
6. **Roteiro e evidencia:** um runbook de demo de 5-7 minutos, ambiente Devnet/testnet separado, seed/configuracao sem segredos no repositorio e uma passada completa gravavel. A tela precisa dizer claramente `Devnet/Testnet` e nunca prometer producao ou armazenamento eterno.

### Depois da demo - manter, nao bloquear

- Cargas reais de 20/100/500 GiB, billing/Pix, renovacao de storage, segundo provider, compliance completo e operacao/SLO.
- Links publicos com senha, social recovery completo, login por e-mail/passkey, lixeira e previews avancados.
- Webhooks e expansao comercial da API: demonstrar o que ja existe apenas se sobrar tempo; nao abrir nova frente antes da prova Solana e do fluxo privado.
- Busca semantica, indexacao ampla de PDF/DOCX, painel administrativo completo e polimento adicional de console/website.

### Regra de evidencia para jurados

Nao alegar como concluido: (a) Anchor/RBAC on-chain apenas por derivar PDA em JavaScript, (b) zero-custody apenas por mock, nem (c) design como funcional quando usa dados simulados. Cada uma das quatro provas centrais deve ter transacao, URL de explorer ou teste automatizado, e um passo reproduzivel no roteiro.

## Meta do MVP

O MVP esta pronto quando uma organizacao pre-provisionada consegue, sem expor chaves ao servidor:

1. autenticar um usuario;
2. enviar, pausar, retomar e cancelar um arquivo grande;
3. reservar e consumir quota corretamente;
4. buscar/listar apenas seus proprios assets;
5. baixar e decifrar o arquivo no dispositivo;
6. compartilhar com um membro autorizado e revogar o acesso futuro;
7. usar a aplicacao web em portugues sem precisar entender blockchain.

---

## M0 - Fechar a seguranca dos fluxos de upload

**Objetivo:** garantir que o caminho de upload e download usado pelo usuario final seja realmente zero-custody.

**Classificacao:** **Obrigatorio agora para demonstracao** - nao requer nova arquitetura; requer uma prova ponta a ponta no ambiente testnet e um roteiro honesto. A auditoria externa formal fica depois da demo.

- [x] Desativar em producao qualquer rota legada que aceite `key`, `keyHex`, chave privada ou recovery key no request.
- [x] Garantir que a aplicacao web use somente key envelopes nos uploads simples, retomaveis e diretos.
- [x] Testar que logs, sessao de upload, PostgreSQL, headers HTTP e respostas da API nao contem chave AES em texto puro.
- [x] Validar que o fluxo de recuperacao de chave funciona apos fechar e reabrir o navegador, usando apenas o envelope cifrado.
- [x] Documentar claramente o limite de revogacao: nao e possivel apagar copias que um destinatario ja decifrou/exportou.
- [ ] Executar uma revisao de seguranca independente do fluxo ECDH, envelopes, AAD e rotacao de chaves. A revisao tecnica interna esta em [`SECURITY_REVIEW_M0.md`](SECURITY_REVIEW_M0.md); falta sign-off externo independente.

**Criterio tecnico de saida:** `test/test-m0-zero-custody.js`, uploads retomaveis, publisher direto, SDK e contrato web passaram; a revisao interna confirma que nenhuma chave bruta chega ao gateway. O encerramento formal do M0 depende somente do sign-off da revisao independente.

## M1 - Finalizar upload grande em ambiente real

**Objetivo:** provar uploads de 20 GB a 500 GB sem o gateway receber ciphertext ou precisar de disco proporcional ao arquivo.

**Classificacao:** o upload real de um arquivo pequeno/medio e o download sao **Obrigatorios agora** como prova de Walrus; as metas de 20/100/500 GiB e carga progressiva sao **Depois da demo**.

- [ ] Configurar um publisher Walrus autenticado real, com HTTPS, JWT e segredo de recibo separados.
- [ ] Executar teste real de upload, pausa, retomada e cancelamento para pelo menos 20 GB.
- [ ] Executar teste de carga progressivo para 100 GB e 500 GB, documentando tempo, memoria, throughput e custo.
- [ ] Confirmar que o publisher direto usa `ReadableStream` sem montar o segmento inteiro em memoria.
- [ ] Testar retry com perda de rede, timeout do publisher, refresh da pagina e expiracao de sessao.
- [ ] Confirmar limpeza de blobs orfaos no publisher depois de cancelamento, falha ou expiracao.
- [ ] Adicionar limite por organizacao e por usuario para uploads simultaneos.
- [ ] Expor progresso confiavel: bytes enviados, velocidade, tempo restante, pausa, retomada e mensagem de erro acionavel.

**Criterio de saida:** upload direto de 20 GB concluido e recuperado em ambiente real, sem ciphertext no gateway; plano de capacidade para 100/500 GB registrado.

## M2 - Provisionamento e ciclo de vida de tenants

**Objetivo:** permitir que a equipe crie e opere organizacoes sem manipulacao manual do banco.

**Classificacao:** fundacao ja implementada. Para a demo, e **Obrigatorio agora** executar PostgreSQL real somente no tenant demonstrado e provisionar os dois membros; painel completo, retries operacionais e expansao ficam **Depois da demo**.

- [x] Criar API ou painel administrativo autenticado para provisionar organizacao, owner e membership inicial.
- [x] Automatizar a criacao/vinculo de `space`, `bucket` e politica Seal por organizacao.
- [x] Permitir alterar quota, ativar, suspender e encerrar organizacoes com auditoria.
- [x] Criar fluxo de convite e aceite de membros (pendente de execução da suíte PostgreSQL em ambiente real).
- [x] Registrar e tratar erros de provisionamento parcial, com retry seguro.
- [x] Documentar runbook de criacao, suspensao, exclusao e recuperacao de tenant.

**Criterio de saida:** pendente da suite PostgreSQL em ambiente real. Um operador ja pode provisionar uma organizacao completa por API, convidar um membro e o owner/destinatario pode entrar sem intervencao manual no banco apos a ativacao do contexto de storage.

## M3 - API comercial para desenvolvedores

**Objetivo:** transformar o SDK atual em uma API segura e utilizavel por apps de terceiros.

**Classificacao:** **Depois da demo**, exceto uma chamada SDK curta (`put`, `get`, `share` ou `search`) se houver tempo para reforcar a tese de cloud programavel. Nao abrir trabalho novo de webhooks, billing ou integracao externa antes do caminho Solana.

- [x] Criar API keys por organizacao com nome, escopos, expiracao, revogacao e rotacao (aguarda teste PostgreSQL real).
- [x] Definir escopos minimos: `assets:read`, `assets:write`, `assets:delete`, `assets:share`, `search:read` e `audit:read`.
- [x] Aplicar rate limit e auditoria por API key/organizacao; a quota continua vinculada ao tenant.
- [x] Adicionar idempotency keys para criacao/finalizacao de uploads e mutacoes de assets (aguarda teste PostgreSQL real).
- [x] Publicar especificacao OpenAPI e exemplos completos do SDK (contrato em `openapi/nodus.openapi.yaml`; validacao de integracao externa pendente).
- [x] Adicionar webhooks assinados para upload concluido, falha, quota alta e asset deletado (outbox PostgreSQL, HMAC e backoff; execucao PostgreSQL real pendente).
- [x] Criar ambiente sandbox/testnet separado do ambiente de producao (bancos Render distintos, Testnet opt-in apenas no sandbox e runtime fail-closed em producao; a validacao PostgreSQL real continua pendente).

**Criterio de saida:** implementacao concluida: autenticacao por API key, escopos, idempotencia, contrato OpenAPI, webhooks assinados e sandbox/testnet isolado estao disponiveis. O encerramento formal depende da validacao das suites PostgreSQL e do fluxo externo completo no ambiente sandbox.

## M4 - Busca privada e organizacao de arquivos

**Objetivo:** entregar uma cloud pesquisavel sem expor conteudo privado.


**Classificacao:** a busca por nome/tag e filtros, ja implementados, sao **Obrigatorios agora apenas como cena curta de demo**. Busca semantica, extracao de documentos e reindexacao ampla sao **Depois da demo**.

- [x] Consolidar busca persistente por nome, tags, pastas e metadata no catalogo por tenant.
- [x] Implementar indexacao de texto de PDF/DOCX no cliente por `searchText`/`indexContent`, sem enviar texto ao servidor.
- [x] Definir e implementar busca semantica privada local para documentos e imagens.
- [x] Garantir que a busca de um tenant nunca retorna candidatos de outro tenant.
- [x] Adicionar filtros por tipo, data, tamanho, pasta, owner e tags.
- [x] Criar estrategia de reindexacao para novos dispositivos sem reenviar plaintext ao servidor.
- [x] Documentar limite de 100 assets por pagina, teto de 1 MiB de texto por asset e custo local de indice por organizacao.

**Criterio de saida:** implementacao atendida: o usuario encontra documento por nome/tag e texto localmente, com filtros e isolamento por tenant. Falta executar a integracao contra PostgreSQL real do sandbox para encerramento formal.

## M5 - Compartilhamento e recuperacao de conta

**Objetivo:** permitir colaboracao segura sem tornar a plataforma custodiante das chaves.

**Classificacao:** compartilhamento de **asset** entre dois membros, papel, expiracao e revogacao sao **Obrigatorios agora**. Pasta-snapshot pode entrar somente se estiver estavel; links publicos, recovery completo e guardian/social recovery sao **Depois da demo**.

- [x] Criar UX de compartilhamento de arquivo e pasta para membros da organizacao (pasta como snapshot dos arquivos atuais).
- [x] Adicionar permissao `viewer`, `contributor`, `admin` e expiracao de acesso por compartilhamento (aguarda execucao PostgreSQL real).
- [ ] Criar links compartilhaveis opcionais com expiracao, senha e revogacao.
- [ ] Exibir lista de destinatarios, permissoes e historico de compartilhamento.
- [ ] Automatizar a tarefa de rotacao/re-cifragem apos remover um membro.
- [ ] Implementar troca de dispositivo usando passkey/identidade de recovery sem exportar chave privada.
- [ ] Decidir e documentar o modelo de social recovery/guardian para casos de perda total de dispositivo.

**Criterio de saida:** owner compartilha, revoga e recupera um asset em outro dispositivo; os testes cobrem envelopes, revogacao e rotacao. A expiração e a revogação impedem leituras futuras de envelopes; não podem apagar uma chave ou cópia já decifrada no dispositivo do destinatário.

## M6 - Planos, billing e renovacao de storage

**Objetivo:** transformar quota tecnica em planos comerciais sustentaveis.

**Classificacao:** **Depois da demo.** Na banca, mostrar somente quotas simuladas e deixar explicito que nao ha dinheiro real.

- [ ] Definir planos iniciais: Free/BYOS, Pessoal, Pro, Equipe e Enterprise.
- [ ] Implementar medicao de uso para storage, upload, download e operacoes premium.
- [ ] Integrar checkout em BRL com cartao e Pix.
- [ ] Implementar trial, upgrade, downgrade, cancelamento e bloqueio gradual por inadimplencia.
- [ ] Criar alertas de 80%, 90% e 100% da quota.
- [ ] Implementar renovacao automatica do armazenamento Walrus e alertas de falha.
- [ ] Criar pagina de consumo, faturas e historico de pagamentos por organizacao.
- [ ] Validar margem com custos reais de Walrus/publisher antes de publicar precos.

**Criterio de saida:** uma organizacao consegue contratar plano, pagar, usar quota, receber alerta e renovar storage sem acao manual da equipe.

## M7 - Multi-backend e estrategia de Solana

**Objetivo:** evitar lock-in e definir o papel definitivo de Solana no produto.

**Classificacao:** **Obrigatorio agora, mas com escopo reduzido para Solana Devnet.** O programa Anchor, o leitor fail-closed do backend, o runbook e o provisionador de transacoes ja estao no repositorio. Isso ainda nao substitui uma implantacao: a prova para a banca so existe depois de compilar, implantar, provisionar as wallets e abrir as evidencias no Explorer.

- [x] **[Implementado; falta execucao Devnet]** Criar e testar o programa Anchor minimo com contas `Organization`, `Member` e `Capability`, sem metadados pessoais ou de assets on-chain. Inclui o provisionador `npm run solana:devnet:provision`, que cria organizacao, owner, membro e capability por transacao assinada, e o runbook `docs/SOLANA_DEVNET_RBAC.md`.
- [ ] **[Obrigatorio agora]** Compilar, sincronizar o Program ID, implantar o programa em Solana Devnet e registrar assinatura, Program ID e PDAs reais no Explorer. Depende de o Samuel executar o runbook com keypair exclusiva de Devnet.
- [x] **[Implementado; falta evidencia Devnet]** Fazer o SIWS consultar membership/capability Devnet e aplicar o menor papel entre tenant e chain no backend, com falha fechada para contas inexistentes, estrangeiras ou revogadas.
- [ ] **[Obrigatorio agora]** Conectar uma Phantom/Solflare real ao ambiente Devnet, realizar SIWS contra as contas provisionadas e exibir na interface a assinatura, o PDA e o link de Explorer do fluxo demonstrado.
- [ ] **[Obrigatorio agora]** Criar roteiro/teste de duas wallets: owner cria organizacao, convida/atribui papel, membro acessa o asset compartilhado e a revogacao impede nova recuperacao pelo Nodus.
- [ ] Criar interface `StorageProvider` separando API/SDK da implementacao Walrus.
- [ ] Extrair `WalrusStorageProvider` da logica atual.
- [ ] Criar prototipo de segundo provider: Jackal ou S3 compatível.
- [ ] Implementar exportacao completa de assets, manifestos e metadata para migracao de provider.
- [x] Decidir para a demo: Solana sera identidade e RBAC verificavel on-chain em Devnet; pagamentos ficam futuros e nao entram no caminho critico.
- [ ] **[Depois da demo]** Evoluir o programa Anchor para governanca, migracoes, limites e operacao alem do conjunto minimo demonstrado.
- [ ] Se RBAC on-chain nao for aprovado: atualizar documentacao e manter Solana como identidade/assinatura/pagamento opcional.

**Criterio de saida para a demo:** duas wallets em Devnet produzem e consultam PDAs reais de organizacao/membro/capability; o papel on-chain e aplicado ao fluxo de acesso demonstrado, sem metadados privados na chain. O criterio original de multi-backend permanece para depois da demo.

## M8 - Confiabilidade, compliance e operacao

**Objetivo:** operar o MVP com seguranca e capacidade de resposta a incidentes.

**Classificacao:** **Depois da demo**, com duas excecoes obrigatorias agora: nao usar dados de terceiros sem consentimento e manter segredos apenas no ambiente/secret manager.

- [ ] Configurar backups criptografados e teste de restauracao do PostgreSQL.
- [ ] Criar dashboards e alertas para API, banco, publisher, jobs de limpeza, quota e renovacao.
- [ ] Definir logs estruturados sem plaintext, chaves ou dados pessoais desnecessarios.
- [ ] Implementar politicas de retencao, exclusao e exportacao de dados.
- [ ] Criar termos de uso, politica de privacidade e processo de atendimento LGPD.
- [ ] Executar teste de penetracao/revisao externa antes de abrir beta publico.
- [ ] Definir SLOs, runbooks e processo de incident response.
- [ ] Criar testes de desastre: perda de instancia, falha de banco, indisponibilidade do publisher e falha parcial de rede.

**Criterio de saida:** equipe consegue restaurar ambiente, identificar falha e executar runbook sem depender de conhecimento individual.

## M9 - Experiencia final do usuario

**Objetivo:** transformar o vault tecnico em uma cloud que qualquer pessoa consegue usar.

**Classificacao:** **Obrigatorio agora em recorte de demonstracao.** A branch `Nodus---Design-System-(-app-and-website-)` fornece referencia forte de marca para landing e console, mas e prototipo isolado com mock data. Portar tokens e as telas criticas para a app existente e conectar a acoes reais; os demais itens continuam **Depois da demo**.

- [ ] Evoluir galeria para navegador completo de arquivos e pastas.
- [ ] Criar onboarding em portugues para usuario sem wallet.
- [ ] Adicionar tela de equipe, membros, compartilhamentos, plano e consumo.
- [ ] Criar lixeira, restauracao, historico de versoes e auditoria visivel.
- [ ] Melhorar preview de PDF, documentos, video e audio sem baixar o arquivo completo quando possivel.
- [ ] Validar acessibilidade, responsividade mobile e internacionalizacao PT-BR/ES/EN.
- [ ] Rodar testes de usabilidade com usuarios nao tecnicos e registrar os principais bloqueios.

**Criterio de saida:** um usuario novo cria/acessa conta, envia, busca, compartilha e recupera um arquivo sem ajuda tecnica.

---

## Concluido recentemente

As entregas abaixo nao devem voltar para a lista pendente sem uma regressao comprovada. Detalhes tecnicos e commits estao em [`RECENT_IMPROVEMENTS.md`](RECENT_IMPROVEMENTS.md).

- [x] Uploads cifrados retomaveis com checksum, retry e cancelamento.
- [x] Publisher Walrus autenticado e direto.
- [x] Verificacao de recibos e manifestos do publisher.
- [x] Streaming direto verificado, com ranges e descriptografia local.
- [x] Autenticacao persistente e isolamento de tenant.
- [x] Reservas transacionais de quota para uploads.
- [x] Envelopes de chave por tenant e identidade de dispositivo nao exportavel.
- [x] Catalogo persistente, pastas, versoes e eventos de auditoria.
- [x] Crypto-shredding e tarefas de rotacao apos revogacao de membro.
- [x] CORS restrito e autorizacao uniforme nas rotas protegidas.
- [x] Fundacao Anchor Devnet de RBAC, runbook de deploy e provisionador de transacoes para `Organization`, `Member` e `Capability` (aguarda execucao real em Devnet).
- [x] Gerador de carteiras Solana Devnet e PDAs para a banca (`scripts/create-demo-wallets.mjs`, `npm run solana:demo-wallets`).
- [x] Landing page oficial e shell do app integrados a partir do design system Nodus (`#080B0A`, tokens oficiais, Guardian 3D render e deep linking `#app`).
