# Nodus - Log de Melhorias Recentes

Atualizado em 26 de setembro de 2026.

Este documento registra as melhorias recentes que compõem a branch `dev` e as próximas fundações em preparação.

## Visão geral

| Status | Entrega | Referências |
| --- | --- | --- |
| Integrado em `dev` | Uploads cifrados retomáveis | `ab0400d`, merge `440c31a` |
| Integrado em `dev` | Publisher Walrus autenticado e direto | `b91034f`, merge `86e802f` |
| Integrado em `dev` | Confiança e verificação de recibos do publisher | `048e49d`, merge `fadc63f` |
| Planejado - sem código | Autenticação persistente e isolamento por organização | branch `codex/auth-tenant-foundation`, criada em 26/09/2026 |

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

Planejada em 26 de setembro de 2026 na branch `codex/auth-tenant-foundation`. Esta seção é um registro de escopo; **nenhuma implementação foi feita ainda**.

### Lacunas que motivam a entrega

- A sessão Solana atual é mantida em memória e expira quando o processo reinicia.
- O endereço informado por header não substitui um token persistente e verificável.
- Assets, uploads retomáveis, uploads diretos, streams e manifestos não aplicam uma autorização uniforme por organização.
- `space`, `bucket` e política Seal ainda são IDs globais no cliente Walrus, sem contexto obrigatório por tenant.

### Escopo aprovado para a próxima implementação

- PostgreSQL para usuários, sessões, organizações, memberships, contextos de storage e auditoria.
- Contextos pré-provisionados por organização: `spaceId`, `bucketId`, `sealPolicyId` e quota.
- Tokens de acesso assinados, expiração, revogação persistida e middleware de autenticação.
- Resolução obrigatória de `AuthContext` e `TenantContext` antes de acessar assets ou uploads.
- Adaptação do cliente Walrus para receber o contexto do tenant por operação, sem fallback global no modo de produção.

## Próxima entrega recomendada

Implementar autenticação e isolamento por organização nas rotas de assets e de uploads diretos. A verificação do publisher protege a integridade do blob, mas a autorização por usuário/tenant ainda deve ser aplicada antes de liberar sessões e manifestos.
