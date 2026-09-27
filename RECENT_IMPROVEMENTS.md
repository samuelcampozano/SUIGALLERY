# Nodus - Log de Melhorias Recentes

Atualizado em 26 de setembro de 2026.

Este documento registra as melhorias integradas na branch `dev` e as entregas prontas para merge nas branches de trabalho.

## Visão geral

| Status | Entrega | Referências |
| --- | --- | --- |
| Integrado em `dev` | Uploads cifrados retomáveis | `ab0400d`, merge `440c31a` |
| Integrado em `dev` | Publisher Walrus autenticado e direto | `b91034f`, merge `86e802f` |
| Integrado em `dev` | Confiança e verificação de recibos do publisher | `048e49d`, merge `fadc63f` |
| Integrado em `dev` | Autenticação persistente e contexto por organização nos fluxos de assets | `4c5f5f3`, merge `7e849d0` |
| Pronto para merge em `dev` | CORS restrito e autenticação uniforme das rotas de organizações | branch `codex/cors-uniform-auth` |

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

## 5. CORS restrito e autenticação uniforme de organizações

Em implementação na branch `codex/cors-uniform-auth`.

- CORS deixa de aceitar qualquer origem: em produção, somente origens declaradas em `NODUS_ALLOWED_ORIGINS` podem chamar a API.
- As rotas de organizações passam pelo mesmo middleware de tenant das rotas de assets; um header `x-solana-address` não autoriza mais acesso quando há autenticação persistente.
- Listagem e consulta de organizações usam a membership da sessão PostgreSQL; alterações de membros exigem papel `owner` ou `admin` e o tenant ativo correspondente.
- Criação de organização em produção fica bloqueada até existir o fluxo administrativo de pré-provisionamento, evitando criar organização sem contexto `space/bucket/Seal`.
- O teste cobre origem autorizada, origem bloqueada e tentativa de acessar organização somente com endereço forjado.
