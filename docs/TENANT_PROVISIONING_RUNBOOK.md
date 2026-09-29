# Runbook: provisionamento de tenant

## Objetivo

Criar, ativar, suspender, retomar ou encerrar um tenant sem editar o PostgreSQL manualmente. O plano administrativo nunca recebe chaves de dados dos arquivos.

## Configuracao obrigatoria

Defina no ambiente do gateway:

```env
DATABASE_URL=postgres://...
NODUS_PROVISIONING_ADMIN_TOKEN=<segredo-aleatorio-com-32-ou-mais-bytes>
# Opcional quando o operador ja possui os IDs de storage:
# nenhum outro valor e necessario
# Obrigatorio para criacao gerenciada de space/bucket/policy:
NODUS_TENANT_PROVISIONER_URL=https://internal-provisioner.example.com/tenants
NODUS_TENANT_PROVISIONER_TOKEN=<segredo-do-provisionador>
```

O endpoint do provisionador deve aceitar `POST`, respeitar `Idempotency-Key` e devolver somente:

```json
{ "spaceId": "...", "bucketId": "...", "sealPolicyId": "..." }
```

Em producao ele precisa usar HTTPS. Nunca use IDs ficticios: enquanto o contexto estiver pendente, o tenant permanece inativo e nao consegue emitir sessao.

## Criar um tenant

Use um `Idempotency-Key` guardado no ticket operacional. A repeticao do mesmo pedido devolve a mesma operacao, sem criar outro owner ou tenant.

```bash
curl -X POST https://api.example.com/api/admin/tenants \
  -H "Authorization: Bearer $NODUS_PROVISIONING_ADMIN_TOKEN" \
  -H "Idempotency-Key: tenant-acme-2026-001" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId":"acme",
    "name":"Acme Ltda",
    "ownerAddress":"SOLANA_PUBLIC_ADDRESS",
    "quotaBytes":21474836480,
    "storage":{"spaceId":"SPACE","bucketId":"BUCKET","sealPolicyId":"SEAL_POLICY"}
  }'
```

Omita `storage` somente quando `NODUS_TENANT_PROVISIONER_URL` estiver configurado. O owner recebe membership `owner`; a primeira sessao SIWS so funciona depois de resposta `status: active`.

## Inspecionar, retry e ciclo de vida

```bash
# listar operacoes, inclusive falhas
curl -H "Authorization: Bearer $NODUS_PROVISIONING_ADMIN_TOKEN" https://api.example.com/api/admin/tenants

# consultar eventos de uma operacao
curl -H "Authorization: Bearer $NODUS_PROVISIONING_ADMIN_TOKEN" https://api.example.com/api/admin/tenants/OPERATION_ID

# repetir uma falha com o mesmo contexto ou novo contexto validado
curl -X POST -H "Authorization: Bearer $NODUS_PROVISIONING_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"storage":{"spaceId":"SPACE","bucketId":"BUCKET","sealPolicyId":"SEAL_POLICY"}}' \
  https://api.example.com/api/admin/tenants/OPERATION_ID/retry

# suspender: revoga todas as sessoes e bloqueia o contexto de storage
curl -X PATCH -H "Authorization: Bearer $NODUS_PROVISIONING_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"suspended"}' https://api.example.com/api/admin/tenants/OPERATION_ID
```

`active` reativa o contexto; o usuario deve autenticar novamente. `closed` tambem revoga sessoes, mas **nao apaga ciphertext, envelopes ou dados**. Exclusao definitiva exige o procedimento de crypto-shredding, backup e aprovacao de retencao/LGPD.

## Convites e aceite de membros

Um owner ou admin autenticado cria o convite em `POST /api/orgs/:orgId/invitations`, com `recipientAddress`, papel `viewer`, `contributor` ou `admin` e `ttlSeconds`. A resposta traz `acceptanceToken` uma unica vez; entregue-o por canal seguro e nao o registre em logs.

O destinatario solicita o desafio normal em `/api/auth/solana/challenge`, assina a mensagem com o endereco convidado e envia `token`, `address`, `signature` e `message` a `POST /api/org-invitations/accept`. O token e consumido somente apos a assinatura valida; a resposta traz o bearer token da nova membership. Owner/admin pode consultar e revogar convites pendentes em `/api/orgs/:orgId/invitations`.

## Recuperacao de falha parcial

1. Consulte os eventos da operacao e o log do provisionador.
2. Se os recursos externos existem, execute `retry` enviando exatamente os IDs retornados.
3. Se nao existem, corrija o provisionador e execute `retry` sem `storage`.
4. Nao remova manualmente `organizations`, `memberships` ou a operacao: o retry preserva o owner e evita duplicidade.
5. Depois de `active`, execute login SIWS do owner e um upload pequeno em ambiente de teste antes de liberar usuarios.

## Auditoria e rotacao

Registre o ID da operacao no ticket de mudanca. Rotacione `NODUS_PROVISIONING_ADMIN_TOKEN` e `NODUS_TENANT_PROVISIONER_TOKEN` em um gerenciador de segredos; nunca os coloque em commits, arquivos `.env` versionados ou requests de frontend.
