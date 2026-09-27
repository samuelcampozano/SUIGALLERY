# Nodus - Log de Melhorias Recentes

Atualizado em 27 de setembro de 2026.

Este documento registra as melhorias integradas na branch `dev` e as entregas prontas para merge nas branches de trabalho.

## Visão geral

| Status | Entrega | Referências |
| --- | --- | --- |
| Integrado em `dev` | Uploads cifrados retomáveis | `ab0400d`, merge `440c31a` |
| Integrado em `dev` | Publisher Walrus autenticado e direto | `b91034f`, merge `86e802f` |
| Integrado em `dev` | Confiança e verificação de recibos do publisher | `048e49d`, merge `fadc63f` |
| Integrado em `dev` | Autenticação persistente e contexto por organização nos fluxos de assets | `4c5f5f3`, merge `7e849d0` |
| Pronto para merge em `dev` | CORS restrito e autenticação uniforme das rotas de organizações | branch `codex/cors-uniform-auth` |
| Pronto para merge em `dev` | Catálogo persistente de assets por tenant | branch `codex/tenant-metadata-catalog` |
| Pronto para merge em `dev` | Control plane seguro para uploads e reserva de quota | `fac592b` |
| Pronto para merge em `dev` | Escala do publisher direto e persistência de payloads | `9eefc10` |
| Pronto para merge em `dev` | Streaming verificado, ranges e controles de upload | `687d440` |
| Pronto para merge em `dev` | M0 zero-custody: bloqueio de chaves brutas e fail-closed por envelopes | `5fa4a70` |
| Pronto para merge em `dev` | Provisionamento administrativo e ciclo de vida de tenants | `46d99df`, branch `codex/tenant-provisioning-admin` |
| Pronto para merge em `dev` | Convites e aceite de membros por SIWS | branch `codex/tenant-invitations` |
| Pronto para merge em `dev` | API keys por organização com escopos | `6d2f906`, branch `codex/api-keys-foundation` |
| Pronto para merge em `dev` | Idempotência pública por tenant e identidade | branch `codex/public-idempotency` |

## 16. Idempotência pública por tenant e identidade

Entregue na branch `codex/public-idempotency`, pendente de merge na `dev`.

- Requests mutáveis selecionados podem usar `Idempotency-Key`; o registro persistente vincula tenant, usuário ou API key, operação e hash do payload.
- Repetições idênticas devolvem a resposta original; reutilização da mesma chave com outro payload, ou enquanto a requisição ainda está em andamento, retorna conflito.
- Uploads, finalizações, mutações de assets, batch delete, envelopes e rotação de chaves estão cobertos; chaves e payloads brutos não são persistidos.
- A origem CORS aceita o header `Idempotency-Key`. A suíte `npm run test:idempotency` valida replay e conflito quando `DATABASE_URL` estiver disponível.

## 15. API keys por organização com escopos

Entregue na branch `codex/api-keys-foundation` pelo commit `6d2f906` (`feat: add scoped organization API keys`), pendente de merge na `dev`.

- API keys são geradas uma única vez e persistidas somente como hash SHA-256, com prefixo público para identificação operacional.
- Owner/admin cria, lista, revoga e rotaciona chaves do tenant ativo; uma API key não pode administrar outras chaves.
- O middleware de tenant aceita bearer de sessão ou API key e aplica os escopos `assets:read`, `assets:write`, `assets:delete`, `assets:share`, `search:read` e `audit:read` antes de executar a rota.
- Criação, revogação e uso carregam organização, chave e auditoria; cada chave tem limite independente de 300 requisições por minuto, além dos limites globais existentes.
- A migração `008_api_keys.sql` e a suíte `npm run test:api-keys` cobrem resolução, isolamento de tenant e invalidação após revogação.

### Validação

- `npm run test:zero-plaintext`: passou.
- `npm run test:api-keys`: adicionada; requer `DATABASE_URL` e aguarda execução contra PostgreSQL real.

## 14. Convites e aceite de membros

Entregue na branch `codex/tenant-invitations`, pendente de merge na `dev`.

- Owner/admin cria convite de uso único para um endereço Solana, com papel e expiração configuráveis; apenas o hash do token é persistido.
- O destinatário aceita o convite após assinar um desafio SIWS recente com o endereço convidado. A membership e a sessão bearer são criadas somente depois da prova criptográfica.
- Convites pendentes podem ser consultados e revogados por owner/admin. Expirados, revogados, aceitos ou vinculados a outro endereço não concedem acesso.

## 13. Provisionamento administrativo de tenants

Entregue na branch `codex/tenant-provisioning-admin` pelo commit `46d99df` (`feat: add administrative tenant provisioning`), pendente de merge na `dev`.

- O plano administrativo protegido por `NODUS_PROVISIONING_ADMIN_TOKEN` cria organização, owner e contexto de storage sem conceder esse poder a uma sessão de usuário.
- O tenant começa inativo: somente após receber IDs válidos de `space`, `bucket` e política Seal ele passa para `active` e pode emitir sessões SIWS.
- O provisionador pode receber um contexto já criado ou chamar um endpoint HTTPS interno configurado por `NODUS_TENANT_PROVISIONER_URL`; em produção, o serviço não inventa IDs de storage.
- As operações têm idempotency key, estado persistido, tentativas, erro recuperável e histórico de eventos. Retry não duplica organização nem membership do owner.
- Operadores podem suspender, reativar, ajustar quota ou encerrar logicamente um tenant. Suspensão e encerramento revogam sessões imediatamente; encerramento não apaga dados sem o fluxo explícito de crypto-shredding.
- O runbook em `docs/TENANT_PROVISIONING_RUNBOOK.md` documenta configuração, criação, retry, suspensão e recuperação de falhas parciais.

### Validação

- `npm run test:zero-plaintext`: passou.
- `npm run test:resumable-api`: passou.
- `npm run test:direct-publisher`: passou.
- `npm run test:tenant-provisioning`: adicionada; exige `DATABASE_URL` e ficou aguardando execução contra PostgreSQL real neste ambiente.

## 9. Catálogo persistente de assets por tenant

Entregue na branch `codex/tenant-metadata-catalog`, pendente de merge na `dev`.

- A migração `004_tenant_asset_catalog.sql` cria um catálogo PostgreSQL isolado por `organization_id`, sem registrar plaintext ou chaves de dados.
- Uploads comuns, retomáveis e diretos registram o asset no catálogo com proprietário, MIME type, tamanho, tags, descrição, pasta e tipo de storage.
- A listagem autenticada deixa de depender de uma varredura integral do bucket: usa paginação por cursor, máximo de 100 itens e filtro opcional de pasta.
- Pastas aninhadas podem ser criadas, renomeadas e removidas somente no tenant ativo; uma pasta com assets ou subpastas não é removida acidentalmente.
- Cada criação e atualização de metadata gera uma versão imutável; criação, atualização, exclusão e operações em pasta produzem eventos de auditoria consultáveis pelo tenant.
- Stream, atualização e exclusão verificam o catálogo do tenant antes de operar sobre o ciphertext no Walrus. Isso impede que um ID conhecido fora da organização contorne o isolamento do catálogo.

## 1. Uploads cifrados retomáveis

Integrado na `dev` pelo merge `440c31a`.

### O que mudou

- O SDK passa a selecionar automaticamente o protocolo retomável para arquivos acima de 20 MiB.
- Cada parte é cifrada no cliente com AES-256-GCM, recebe checksum SHA-256 e pode ser reenviada sem repetir as partes já confirmadas.
- O gateway oferece criação, consulta de estado, envio de partes, finalização e cancelamento de sessões de upload.
- Arquivos de até 500 GiB podem ser processados em partes de tamanho configurável, sem carregar o arquivo inteiro na memória.
- A interface mostra progresso dos uploads grandes e permite retomada da sessão.

### Componentes principais

- `server/resumable-upload.js`
- Rotas `/api/assets/uploads/*` em `server/index.js`
- `sdk/index.js` e `sdk/index.d.ts`
- Testes `test/test-resumable-upload.js` e `test/test-resumable-api.js`

### Garantias verificadas

- Retentativas idempotentes de partes já recebidas.
- Rejeição de checksum incorreto.
- Montagem com preservação da ordem e do tamanho do ciphertext.
- Remoção de sessões canceladas ou expiradas.

## 2. Publisher Walrus autenticado e direto

Integrado na `dev` pelo merge `86e802f`.

### O que mudou

- Para uploads diretos, o ciphertext sai do browser diretamente para o publisher Walrus; ele não transita pelo Express/Nodus.
- O gateway passa a ser um control plane: cria a sessão, divide o arquivo em segmentos, emite autorização temporária e persiste somente metadados e manifesto.
- Cada segmento recebe um JWT próprio, com tamanho autorizado, duração de storage, identificador de upload e índice de segmento.
- O SDK expõe `directPublisher: true`, retomada de upload direto e progresso por segmento.
- O manifesto registra os blobs Walrus ordenados para representar um único asset lógico grande.

### Configuração necessária

```env
NODUS_PUBLISHER_URL=https://publisher.example.com
NODUS_PUBLISHER_JWT_SECRET=<segredo-com-no-minimo-32-bytes>
NODUS_PUBLISHER_TOKEN_TTL_SECONDS=600
```

### Componentes principais

- `server/authenticated-publisher.js`
- `server/direct-upload-manager.js`
- Rotas `/api/assets/direct-uploads/*` em `server/index.js`
- Teste `test/test-direct-publisher.js`

## 3. Confiança do publisher e verificação de recibos

Integrado na `dev` pelo commit `048e49d` e merge `fadc63f`.

### Problema resolvido

O fluxo inicial aceitava o `blobId` informado pelo cliente e registrava a verificação como pendente fora do ambiente de teste. Isso não comprovava que o publisher realmente recebeu o ciphertext autorizado.

### O que mudou

- O publisher deve devolver um recibo HMAC-SHA256 assinado para cada segmento concluído.
- O recibo vincula `jti`, ID do upload, índice do segmento, tamanho do ciphertext, checksum SHA-256 e `blobId` Walrus.
- O Nodus valida a assinatura, validade temporal e todos os vínculos do recibo antes de marcar o segmento como concluído.
- Um `blobId` isolado, uma resposta do publisher sem recibo ou um recibo adulterado deixam de ser aceitos.
- A finalização do asset exige que todos os segmentos tenham recibos verificados.
- A configuração de produção exige HTTPS, segredos de JWT e recibo com pelo menos 32 bytes, chaves distintas e TTL entre 30 e 600 segundos.
- A escrita atômica do estado da sessão ganhou tentativas curtas para tolerar bloqueios transitórios do OneDrive/Windows, sem abandonar o rename atômico.

### Configuração adicional

```env
# Deve ser diferente do segredo JWT em produção.
NODUS_PUBLISHER_RECEIPT_SECRET=<segredo-com-no-minimo-32-bytes>
```

### Contrato exigido do publisher

1. Validar a assinatura, expiração, tamanho e checksum do JWT antes de aceitar o upload.
2. Consumir cada `jti` uma única vez; uma segunda tentativa com o mesmo token deve ser rejeitada.
3. Retornar um recibo assinado com os campos vinculados ao segmento recebido.
4. Nunca expor os segredos de assinatura ao browser.

### Cobertura de testes

- Upload direto sem ciphertext no gateway.
- JWT distinto para cada segmento.
- Rejeição de replay do mesmo JWT no publisher.
- Rejeição de recibo adulterado pelo control plane.
- Finalização apenas após validação independente de todos os recibos.

## Validação atual

As suítes locais de segurança, API, zero-plaintext, upload retomável, publisher direto, SDK, crypto-shredding, Solana/RBAC e auditoria passaram. A verificação on-chain da Sui depende de conectividade com `graphql.mainnet.sui.io` e pode falhar quando o endpoint externo estiver indisponível.

## 4. Fundação de autenticação e contexto por organização

Entregue em 26 de setembro de 2026 na branch `codex/auth-tenant-foundation`, pelo commit `4c5f5f3` (`feat: enforce tenant context across asset flows`) e integrado à `dev` pelo merge `7e849d0`.

### Lacunas que motivam a entrega

- A sessão Solana atual é mantida em memória e expira quando o processo reinicia.
- O endereço informado por header não substitui um token persistente e verificável.
- Assets, uploads retomáveis, uploads diretos, streams e manifestos não aplicam uma autorização uniforme por organização.
- `space`, `bucket` e política Seal ainda são IDs globais no cliente Walrus, sem contexto obrigatório por tenant.

### Entregue nesta etapa

- Migração PostgreSQL para usuários, sessões revogáveis, organizações, memberships e contextos de storage pré-provisionados.
- Token aleatório de 256 bits, armazenado somente como hash SHA-256, com expiração persistida; o token é devolvido após a verificação SIWS para a organização selecionada.
- Middleware único de tenant nas rotas de assets, upload, upload retomável, upload direto, segmentos, finalização, manifestos, metadados e remoções. Em produção, a ausência de `DATABASE_URL` bloqueia essas rotas.
- Cada sessão retomável e cada sessão de publisher direto registra `organizationId`; todas as leituras, partes, autorizações, recibos, finalização e cancelamentos confirmam a organização ativa.
- O adaptador Walrus recebe `bucketId` e política Seal do contexto por operação. Listagem, stream, atualização e remoção deixam de usar o bucket global quando a sessão autenticada existe.
- Cache de stream passa a ser indexado por organização e asset, evitando colisão entre buckets distintos.
- SDK recebe e reutiliza `accessToken` em memória após `verifySolanaAuth(..., organizationId)`.
- Docker Compose sobe PostgreSQL e aplica a migração na criação inicial do volume; o serviço Nodus espera a verificação de saúde do banco.
- Compose exige `POSTGRES_PASSWORD` e `DATABASE_URL` no `.env` não versionado; nenhuma senha de banco fica no repositório.
- Teste de isolamento confirma que uma organização não lê, autoriza ou cancela a sessão de upload da outra.

### Validação da entrega

- `npm run test:resumable`: passou integralmente.
- `npm run test:direct-publisher`: passou integralmente.
- `npm run test:sdk`: passou integralmente.
- `node test/test-tenant-upload-context.js`: passou integralmente.
- A suíte completa teve somente a falha da verificação on-chain remota por indisponibilidade de conexão com a Sui Mainnet; não indica regressão local.

### Dependência operacional

Antes de habilitar produção, um operador deve provisionar cada organização, seu contexto `space/bucket/Seal` e suas memberships no PostgreSQL. O login não cria memberships automaticamente, pois isso permitiria escalada de acesso.

## Próxima entrega recomendada

Adicionar a interface ou API administrativa autenticada para o provisionamento de organizações e memberships, seguida de quotas/auditoria por tenant. A verificação do publisher já protege a integridade do blob; o próximo passo é operacionalizar o ciclo de vida do tenant sem conceder privilégios pelo cliente.

## 6. Diretório de envelopes com tenant persistente

Entregue na branch `codex/tenant-key-envelopes`, pendente de merge na `dev`.

- As rotas de identidades e envelopes agora exigem `requireTenant` e uma sessão bearer persistida; `x-solana-address` não é aceito como autorização para esses fluxos.
- As identidades públicas, o proprietário do envelope e cada ciphertext passam a ser persistidos no PostgreSQL. `organization_id` compõe as chaves e filtros de escrita, leitura, remoção e revogação por membership.
- Um mesmo `assetId` pode existir em organizações diferentes sem compartilhar envelopes. A leitura retorna somente ciphertexts destinados ao `user_id` da sessão e à organização ativa.
- A API confere que destinatários pertencem à organização ativa; o SDK usa obrigatoriamente o tenant autenticado, inclui o ID da organização no AAD criptográfico e rejeita destinatários fora da membership.
- O login não cria mais organização, contexto de storage nem membership implícitos. Essas relações precisam ser pré-provisionadas por um operador.
- A migração `002_tenant_key_envelopes.sql` é aplicada tanto no Docker Compose quanto na inicialização do serviço. O blueprint Render exige configurar `NODUS_ALLOWED_ORIGINS` por ambiente.
- A suíte de envelopes agora é integração PostgreSQL: cobre bearer obrigatório, isolamento entre duas organizações, recuperação por destinatário e rejeição de key material bruto. Ela é executada quando `DATABASE_URL` estiver disponível.

## 7. Interface web zero-custody autenticada

Entregue na branch `codex/web-zero-custody-auth`, pendente de merge na `dev`.

- A interface usa o bearer token da sessão SIWS e a organização ativa em uploads, listagem, stream, edição e remoção. O bearer fica somente no `sessionStorage`, não no `localStorage` persistente.
- A identidade ECDH do dispositivo é registrada somente pela chave pública; sua chave privada é um `CryptoKey` não exportável no IndexedDB, sem uso de `localStorage`.
- Após cada upload, a interface grava um envelope ECDH/AES-GCM para o próprio usuário. Ao retornar à aplicação, recupera a chave de dados por esse envelope antes de decifrar o ciphertext no browser.
- O backend rejeita `key`, `keyHex`, chaves privadas e chaves de recuperação também nos fluxos resumível e de publisher direto, impedindo persistência acidental de material secreto.

## 8. Crypto-shredding e rotação forte por tenant

Entregue na branch `codex/crypto-shredding-hardening`, pendente de merge na `dev`.

- Delete individual e em lote removem o ciphertext do bucket, descartam o cache local e apagam os envelopes persistidos daquele asset e organização.
- Ao remover uma membership, os envelopes do membro são revogados imediatamente e cada asset afetado recebe uma tarefa de rotação pendente no PostgreSQL.
- Rotação forte é client-side: o SDK decifra o asset localmente, gera nova chave de dados, recriptografa e envia um asset substituto com envelopes para todos os membros ativos. Somente depois o gateway destrói o asset e os envelopes antigos.
- O serviço nunca recebe a chave de dados nem plaintext durante a rotação. A conclusão da rotação recusa um substituto que não tenha envelope para cada membro ativo.
- Limite documentado: a revogação não apaga cópias que um destinatário já decifrou ou exportou; ela bloqueia novos acessos pelo Nodus e torna o ciphertext anterior irrecuperável no serviço após a rotação.
- A suíte PostgreSQL cobre revogação de sessão/envelope após remover membro, criação da tarefa de rotação e limpeza de envelopes no batch delete.

## 5. CORS restrito e autenticação uniforme de organizações

Em implementação na branch `codex/cors-uniform-auth`.

- CORS deixa de aceitar qualquer origem: em produção, somente origens declaradas em `NODUS_ALLOWED_ORIGINS` podem chamar a API.
- As rotas de organizações passam pelo mesmo middleware de tenant das rotas de assets; um header `x-solana-address` não autoriza mais acesso quando há autenticação persistente.
- Listagem e consulta de organizações usam a membership da sessão PostgreSQL; alterações de membros exigem papel `owner` ou `admin` e o tenant ativo correspondente.
- Criação de organização em produção fica bloqueada até existir o fluxo administrativo de pré-provisionamento, evitando criar organização sem contexto `space/bucket/Seal`.
- O teste cobre origem autorizada, origem bloqueada e tentativa de acessar organização somente com endereço forjado.

## 10. Control plane seguro para uploads e reserva de quota

Entregue na branch `codex/upload-auth-foundation` pelo commit `fac592b` (`feat: secure upload sessions and quota reservations`), pendente de merge na `dev`.

- A migração `004_upload_control_plane.sql` passa a registrar cada sessão de upload com `userId`, `organizationId`, `assetId`, estado e reserva de quota; a sessão não é mais um objeto anônimo do gateway.
- Criação, consulta, envio de parte ou segmento, finalização, cancelamento, manifesto e download passam pelo contexto autenticado do tenant. Uma organização ou usuário diferente não consegue inspecionar, autorizar ou abortar uma sessão conhecida.
- RBAC é aplicado no upload: `owner`, `admin` e `contributor` podem enviar; `viewer` mantém acesso somente de leitura.
- Antes do primeiro chunk, a quota da organização é reservada de forma transacional. Ela é consolidada como uso somente após a finalização e é liberada em cancelamentos, expiração ou falha do provider.
- O gateway rejeita material de chave bruto (`key`, `keyHex`, chaves privadas e chaves de recuperação) também no estado de upload, nos corpos HTTP e nos payloads persistidos. A chave de dados permanece no cliente e é recuperada somente por envelopes cifrados.
- Sessões, quotas e eventos de upload ganham persistência no PostgreSQL; a política de CORS permanece restrita às origens declaradas em `NODUS_ALLOWED_ORIGINS`.

### Garantias verificadas

- Isolamento entre organizações e usuários para sessões retomáveis e diretas.
- Acesso administrativo permitido somente dentro da organização ativa.
- Rejeição de tentativa de persistir chave AES bruta em sessões.
- Reserva de quota antes do envio e liberação segura quando o upload não é concluído.

## 11. Upload direto escalável, streaming verificado e recuperação segura

Entregue na branch `codex/upload-auth-foundation` pelos commits `9eefc10` (`feat: scale direct publisher uploads`) e `687d440` (`feat: add verified direct streaming controls`), pendente de merge na `dev`.

### Escala e ciclo de vida do publisher

- Arquivos grandes usam o publisher direto como padrão: o browser envia ciphertext ao Walrus sem fazer o gateway armazenar localmente segmentos de até 1 GiB ou arquivos de até 500 GiB.
- O SDK cifra e publica segmentos usando `ReadableStream`, sem bufferizar o ciphertext completo do segmento na memória. O envio trabalha com concorrência controlada de 1 a 5 segmentos e retentativas com backoff exponencial.
- O estado canônico das sessões e dos manifestos diretos é persistido no PostgreSQL pela migração `005_upload_payloads.sql`, em vez de arquivos locais do processo.
- Finalização é idempotente: uma nova chamada de `complete` para a mesma sessão finalizada retorna o mesmo asset lógico.
- Blobs publicados por uma sessão abortada ou expirada recebem tombstones de órfão. A limpeza no servidor tenta apagá-los no publisher e mantém o registro até a confirmação, tornando a recuperação observável e repetível.

### Download, integridade e retomada

- O manifesto direto contém hashes SHA-256 determinísticos do próprio manifesto e de cada chunk AES-GCM. O SDK valida o manifesto e cada chunk de ciphertext antes da descriptografia no browser.
- `nodus.stream(assetId, { range })` entrega streaming direto do publisher, descriptografa somente os chunks necessários no cliente e aceita intervalos plaintext no formato `bytes=início-fim`, viabilizando download retomável e seek de vídeo.
- Referências seguras de uploads em andamento podem ser salvas no browser para descoberta após reabrir a aplicação. Elas contêm apenas identificadores de sessão e contexto, nunca a chave de dados.
- A recuperação da chave depende do envelope do dono ou do envelope de recuperação cifrado; o gateway continua incapaz de desembrulhar a chave AES.

### Experiência e auditoria

- `NodusUploadControl` permite pausar, retomar e cancelar uploads diretos ou retomáveis sem expor material de chave. O cancelamento aciona a limpeza da sessão e libera a quota reservada.
- Progresso do SDK passa a informar bytes enviados, velocidade, bytes restantes e estimativa de término; erros de quota, rede, sessão expirada, cancelamento e indisponibilidade do publisher recebem mensagens orientadas ao usuário.
- O compartilhamento de envelopes de chave registra o evento de auditoria `asset.shared`, incluindo a quantidade de destinatários, sem guardar o conteúdo ou a chave do arquivo.

### Cobertura adicionada

- Fluxo direto sem ciphertext no gateway, concorrência e recibos autenticados do publisher.
- Persistência e recuperação de sessão direta pelo estado canônico do banco.
- Hash do manifesto, hash por chunk e descriptografia de intervalos plaintext.
- Pausa, retomada, cancelamento e comprovação de que referências de recuperação não contêm chave bruta.

## 12. M0 - Zero-custody reforçado nos limites de upload

Entregue na branch `codex/m0-zero-custody-hardening` pelo commit `5fa4a70` (`feat: harden M0 zero-custody upload boundaries`), pendente de merge na `dev`.

- Um middleware comum bloqueia `key`, `keyHex`, chaves privadas e recovery keys em JSON, estruturas aninhadas, query strings e headers HTTP antes que atinjam os handlers legados. Campos multipart recebem a mesma validação após o parsing do Multer.
- JWKs públicos P-256 continuam aceitos para identidade ECDH, mas qualquer JWK com o membro privado `d` é rejeitado pelo gateway.
- O SDK agora exige uma identidade de dispositivo para qualquer upload de tenant autenticado. Se o envelope do dono/membros não puder ser persistido, a chave local é removida e o SDK pede a exclusão do ciphertext recém-criado, evitando assets irrecuperáveis sem envelope.
- O novo teste M0 usa um canário de chave para confirmar que uploads simples, retomáveis e diretos, além de headers e query strings, retornam erro sem ecoar o valor em headers, respostas ou logs.
- A recuperação foi validada simulando a reabertura do cliente: o recovery kit cifrado abre a identidade de recovery e desembrulha o envelope correspondente; uma troca do `assetId` no AAD invalida a operação.
- O README passou a declarar explicitamente o limite de revogação: cópias já decifradas, exportadas ou capturadas pelo destinatário não podem ser apagadas remotamente.
- [`SECURITY_REVIEW_M0.md`](SECURITY_REVIEW_M0.md) registra a revisão técnica de ECDH, envelopes, AAD, recovery e rotação. Uma auditoria externa independente ainda é necessária para o sign-off formal do M0.

### Validação

- `npm run test:m0-zero-custody`
- `npm run test:web-zero-custody`
- `npm run test:resumable`
- `npm run test:direct-publisher`
- `npm run test:sdk`
- `npm test`: todas as suítes locais passaram; a consulta live à Sui Mainnet depende do endpoint GraphQL externo e falhou por conectividade. A integração PostgreSQL de envelopes exige `DATABASE_URL` e ficou ignorada neste ambiente.
