# M3: sandbox/testnet para a API publica

O sandbox e um ambiente descartavel para integradores testarem API keys, idempotencia, webhooks e o SDK sem compartilhar dados, credenciais ou blobs com producao.

## Isolamento obrigatorio

- Defina `NODUS_DEPLOYMENT_ENV=sandbox` no sandbox e `NODUS_DEPLOYMENT_ENV=production` em producao. Este valor nao e substituto de `NODE_ENV`: ambos podem usar os mesmos headers e controles HTTP de producao.
- O adaptador publico do Walrus Testnet exige `WALRUS_DIRECT_TESTNET_ENABLED=true` e fica desativado a forca em producao.
- Em producao, uma falha no Console/Walrus retorna erro; a aplicacao nao simula um upload, nao grava em `temp_storage` e nao consulta o aggregator de testnet como fallback.
- Cada ambiente usa seu proprio PostgreSQL. No Render, `nodus-dev` usa `nodus-sandbox-db` e `nodus-prod` usa `nodus-prod-db`. Nunca reutilize `DATABASE_URL`, chaves de API, segredos de webhook ou tokens administrativos entre os dois.

## Configuracao local do sandbox

Copie `.env.example` para `.env`, mantenha `NODUS_DEPLOYMENT_ENV=sandbox` e configure origens, banco e credenciais de teste. O Docker Compose ja seleciona sandbox e habilita o adaptador testnet explicitamente.

Use IDs de organizacao com o prefixo `sandbox-` e gere API keys de integracao exclusivas para esse ambiente. Webhooks devem apontar para um receptor de teste; os segredos `whsec_…` nao podem ser promovidos para producao.

## Validacao antes de liberar integradores

1. Suba um PostgreSQL vazio do sandbox e execute `npm run test:api-keys`, `npm run test:idempotency` e `npm run test:webhooks` com `DATABASE_URL` configurada.
2. Execute `npm run test:walrus-fallback`; os testes de rede sao ignorados quando o endpoint publico estiver indisponivel, mas a protecao que desabilita testnet em producao e sempre verificada.
3. Teste no sandbox o fluxo externo: criar API key limitada, criar upload com `Idempotency-Key`, receber webhook e revogar a chave.
