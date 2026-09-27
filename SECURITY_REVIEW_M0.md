# M0 - Revisao tecnica de zero-custody

Data da revisao: 27 de setembro de 2026.

## Escopo revisado

- Upload simples multipart, upload retomavel e publisher direto.
- ECDH P-256, envelopes AES-256-GCM, AAD, identidade de dispositivo e recovery kit.
- Persistencia de sessoes, respostas HTTP, headers, logs e limpeza de assets sem envelope.
- Revogacao de membro e rotacao client-side.

## Evidencias tecnicas

| Area | Verificacao | Resultado |
| --- | --- | --- |
| Material de chave em requests | O gateway rejeita recursivamente `key`, `keyHex`, chaves privadas e recovery keys no JSON, query string, headers e campos multipart. JWKs com o membro privado `d` tambem sao recusados. | Aprovado por `test/test-m0-zero-custody.js`. |
| Chaves no control plane | Sessoes, payloads diretos, envelopes e respostas HTTP guardam somente IV, metadata e ciphertext de envelope; nenhum dado-chave AES e persistido. | Aprovado por testes de upload retomavel, publisher direto e envelopes. |
| ECDH e envelopes | O cliente gera um par ECDH P-256 efemero por envelope, deriva 256 bits e cifra a chave de dados com AES-256-GCM. O servidor recebe somente chave publica, chave publica efemera, IV e ciphertext. | Revisao de `sdk/index.js` e `server/auth-tenant-store.js`. |
| Vinculo criptografico | O AAD inclui versao, `assetId`, destinatario, tipo de destinatario e organizacao. Alterar o asset invalida a recuperacao. | Aprovado por `test/test-m0-zero-custody.js`. |
| Recuperacao | O recovery kit cifra a identidade de recovery com PBKDF2-SHA-256 (210.000 iteracoes) e AES-256-GCM. Um cliente reiniciado recupera a chave somente ao abrir o kit e desembrulhar seu envelope. | Aprovado por `test/test-m0-zero-custody.js`. |
| Falha de envelope | Em tenant autenticado, o SDK exige identidade ECDH. Se a protecao do envelope falhar, remove a chave local e pede a exclusao do ciphertext recem-criado. | Aprovado por `test/test-m0-zero-custody.js`. |
| Revogacao | Remover uma membership revoga os envelopes e cria uma tarefa de rotacao; a re-cifragem ocorre no cliente antes de destruir o asset anterior. | Coberto por `test/test-key-envelopes.js` quando `DATABASE_URL` estiver configurada. |

## Limites e riscos residuais

- Revogacao nao apaga copias que o destinatario ja decifrou, exportou ou capturou. Ela impede recuperacao futura no Nodus apos rotacao e destruicao dos envelopes/ciphertext antigos.
- O recovery kit e um segredo do usuario: uma passphrase fraca ou o vazamento do kit reduz a seguranca da recuperacao. O gateway nao deve armazenar nenhum dos dois.
- A revisao acima e tecnica e interna. O item M0 de **revisao independente** continua pendente ate uma auditoria por pessoa ou empresa sem autoria deste fluxo, com escopo e relatorio registrados.

## Comandos de reproducao

```bash
npm run test:m0-zero-custody
npm run test:web-zero-custody
npm run test:resumable
npm run test:direct-publisher
npm run test:sdk
```
