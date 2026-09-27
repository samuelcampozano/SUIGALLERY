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

**Status:** implementacao tecnica e validacao automatizada concluidas na branch `codex/m0-zero-custody-hardening`; a auditoria independente formal continua pendente.

- [x] Desativar em producao qualquer rota legada que aceite `key`, `keyHex`, chave privada ou recovery key no request.
- [x] Garantir que a aplicacao web use somente key envelopes nos uploads simples, retomaveis e diretos.
- [x] Testar que logs, sessao de upload, PostgreSQL, headers HTTP e respostas da API nao contem chave AES em texto puro.
- [x] Validar que o fluxo de recuperacao de chave funciona apos fechar e reabrir o navegador, usando apenas o envelope cifrado.
- [x] Documentar claramente o limite de revogacao: nao e possivel apagar copias que um destinatario ja decifrou/exportou.
- [ ] Executar uma revisao de seguranca independente do fluxo ECDH, envelopes, AAD e rotacao de chaves. A revisao tecnica interna esta em [`SECURITY_REVIEW_M0.md`](SECURITY_REVIEW_M0.md); falta sign-off externo independente.

**Criterio tecnico de saida:** `test/test-m0-zero-custody.js`, uploads retomaveis, publisher direto, SDK e contrato web passaram; a revisao interna confirma que nenhuma chave bruta chega ao gateway. O encerramento formal do M0 depende somente do sign-off da revisao independente.

## M1 - Finalizar upload grande em ambiente real

**Objetivo:** provar uploads de 20 GB a 500 GB sem o gateway receber ciphertext ou precisar de disco proporcional ao arquivo.

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

**Status:** implementacao concluida na branch `codex/tenant-provisioning-admin` (`46d99df`); a execucao da suite de integracao PostgreSQL com `DATABASE_URL` real continua pendente antes de encerrar formalmente o milestone.

- [x] Criar API ou painel administrativo autenticado para provisionar organizacao, owner e membership inicial.
- [x] Automatizar a criacao/vinculo de `space`, `bucket` e politica Seal por organizacao.
- [x] Permitir alterar quota, ativar, suspender e encerrar organizacoes com auditoria.
- [x] Criar fluxo de convite e aceite de membros (pendente de execução da suíte PostgreSQL em ambiente real).
- [x] Registrar e tratar erros de provisionamento parcial, com retry seguro.
- [x] Documentar runbook de criacao, suspensao, exclusao e recuperacao de tenant.

**Criterio de saida:** pendente da suite PostgreSQL em ambiente real. Um operador ja pode provisionar uma organizacao completa por API, convidar um membro e o owner/destinatario pode entrar sem intervencao manual no banco apos a ativacao do contexto de storage.

## M3 - API comercial para desenvolvedores

**Objetivo:** transformar o SDK atual em uma API segura e utilizavel por apps de terceiros.

- [ ] Criar API keys por organizacao com nome, escopos, expiracao, revogacao e rotacao.
- [ ] Definir escopos minimos: `assets:read`, `assets:write`, `assets:delete`, `assets:share`, `search:read` e `audit:read`.
- [ ] Aplicar rate limit, quota e auditoria por API key/organizacao, nao apenas por IP.
- [ ] Adicionar idempotency keys para criacao/finalizacao de uploads e mutacoes de assets.
- [ ] Publicar especificacao OpenAPI e exemplos completos do SDK.
- [ ] Adicionar webhooks assinados para upload concluido, falha, quota alta e asset deletado.
- [ ] Criar ambiente sandbox/testnet separado do ambiente de producao.

**Criterio de saida:** uma aplicacao externa consegue autenticar-se por API key, enviar um asset, consultar o status e receber um webhook sem acesso a outro tenant.

## M4 - Busca privada e organizacao de arquivos

**Objetivo:** entregar uma cloud pesquisavel sem expor conteudo privado.

- [ ] Consolidar busca persistente por nome, tags, pastas e metadata no catalogo por tenant.
- [ ] Implementar indexacao de texto de PDF/DOCX no cliente ou por indice cifrado/blind index.
- [ ] Definir e implementar busca semantica privada para documentos e imagens.
- [ ] Garantir que a busca de um tenant nunca retorna candidatos de outro tenant.
- [ ] Adicionar filtros por tipo, data, tamanho, pasta, owner e tags.
- [ ] Criar estrategia de reindexacao para novos dispositivos sem reenviar plaintext ao servidor.
- [ ] Medir limite de escala e custo de indice por organizacao.

**Criterio de saida:** usuario encontra documento por nome/tag e por conteudo relevante, com testes de isolamento entre tenants.

## M5 - Compartilhamento e recuperacao de conta

**Objetivo:** permitir colaboracao segura sem tornar a plataforma custodiante das chaves.

- [ ] Criar UX de compartilhamento de arquivo e pasta para membros da organizacao.
- [ ] Adicionar permissao `viewer`, `contributor`, `admin` e expiracao de acesso por compartilhamento.
- [ ] Criar links compartilhaveis opcionais com expiracao, senha e revogacao.
- [ ] Exibir lista de destinatarios, permissoes e historico de compartilhamento.
- [ ] Automatizar a tarefa de rotacao/re-cifragem apos remover um membro.
- [ ] Implementar troca de dispositivo usando passkey/identidade de recovery sem exportar chave privada.
- [ ] Decidir e documentar o modelo de social recovery/guardian para casos de perda total de dispositivo.

**Criterio de saida:** owner compartilha, revoga e recupera um asset em outro dispositivo; os testes cobrem envelopes, revogacao e rotacao.

## M6 - Planos, billing e renovacao de storage

**Objetivo:** transformar quota tecnica em planos comerciais sustentaveis.

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

- [ ] Criar interface `StorageProvider` separando API/SDK da implementacao Walrus.
- [ ] Extrair `WalrusStorageProvider` da logica atual.
- [ ] Criar prototipo de segundo provider: Jackal ou S3 compatível.
- [ ] Implementar exportacao completa de assets, manifestos e metadata para migracao de provider.
- [ ] Decidir se Solana tera somente identidade/pagamentos ou tambem RBAC verificavel on-chain.
- [ ] Se RBAC on-chain for aprovado: criar, testar e implantar programa Anchor com `Organization`, `Member` e `Capability`.
- [ ] Se RBAC on-chain nao for aprovado: atualizar documentacao e manter Solana como identidade/assinatura/pagamento opcional.

**Criterio de saida:** backend de storage pode ser escolhido por organizacao sem alterar a API publica; estrategia Solana esta documentada e implementada conforme a decisao.

## M8 - Confiabilidade, compliance e operacao

**Objetivo:** operar o MVP com seguranca e capacidade de resposta a incidentes.

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
