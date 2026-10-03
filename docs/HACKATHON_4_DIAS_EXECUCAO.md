# Nodus — execução para finalizar o hackathon em 3–4 dias

> Este é o plano de trabalho do time agora. Ele não é o plano da startup e não inclui billing, planos, segundo provider, SLA, Mainnet, Pix ou produto de consumidor.
>
> **Entrega final:** uma demo real em que duas pessoas usam a Nodus: Owner envia um arquivo cifrado ao Walrus Testnet; Member entra com outra carteira Solana; Owner compartilha o arquivo; Member abre; Owner revoga; a tentativa seguinte de acesso falha. A apresentação mostra as provas no Explorer.

## O que é “pronto” no hackathon

Para considerar a entrega finalizada, todos os pontos abaixo devem acontecer sem mock:

1. Um arquivo de demonstração (PDF ou imagem sem dados sensíveis) é cifrado no navegador e armazenado no **Walrus Testnet**.
2. A tela mostra o `Blob ID` e abre o link do Walruscan.
3. Duas wallets reais da **Solana Devnet** têm PDAs de `Organization`, `Member` e `Capability` criados pelo programa Anchor implantado.
4. O Member faz SIWS com sua wallet e o backend consulta os PDAs Devnet antes de liberar o acesso.
5. O Owner compartilha o asset usando o modal existente; o Member recebe um envelope e abre o arquivo.
6. O Owner revoga o compartilhamento/membership; uma nova tentativa do Member de buscar o envelope ou autenticar no tenant é negada.
7. Há vídeo de 5–7 minutos, links de Explorer e uma execução completa gravada como backup.

**Não é necessário:** upload de 20 GB, billing, recuperação social, passkeys, B2/R2, multi-provider, assinatura mensal, deploy próprio, SLA, Mainnet ou auditoria externa.

## Divisão fixa: 3 desenvolvedores

| Pessoa | Responsabilidade exclusiva | Não fazer |
| --- | --- | --- |
| Dev 1 — Solana | Programa Anchor, deploy Devnet, wallets, provisionamento, SIWS e evidências Explorer | Não mexer em layout, Walrus ou preço |
| Dev 2 — Storage e acesso | Walrus Testnet, upload/download real, tenant PostgreSQL, envelopes/share/revogação | Não criar segundo provider, billing ou upload gigante |
| Dev 3 — Produto e demo | Interface, badges Testnet/Devnet, links de prova, roteiro, vídeo e testes de fluxo | Não redesenhar o app nem criar landing nova |

## Dia 1 — fazer a infraestrutura responder

### Dev 1 — Solana Devnet

**Arquivos/comandos existentes a usar**

- `Anchor.toml`
- `programs/nodus_access/src/lib.rs`
- `scripts/provision-devnet-rbac.mjs`
- `scripts/create-demo-wallets.mjs`
- `docs/SOLANA_DEVNET_RBAC.md`
- `server/solana.js`

**Executar agora**

1. Trabalhar em WSL/Ubuntu, como exige `docs/SOLANA_DEVNET_RBAC.md`.
2. Criar uma keypair exclusiva de Devnet; nunca subir JSON de keypair, seed phrase ou `.env`.
3. Rodar `npm run solana:anchor:build`.
4. Gerar/chavear o Program ID no `Anchor.toml` e em `programs/nodus_access/src/lib.rs` se o build/deploy gerar ID diferente.
5. Rodar `npm run solana:anchor:deploy:devnet`.
6. Rodar `npm run solana:demo-wallets`; guardar apenas os endereços públicos do Owner e Member.
7. Rodar `npm run solana:devnet:provision -- ...` para `demo-org`, Member com papel `viewer` e capability `nodus:tenant-access:v1`.
8. Configurar, somente no ambiente local/de demo: `SOLANA_PROGRAM_ID`, `SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com` e `NODUS_SOLANA_RBAC_MODE=devnet`.

**Modificar código apenas se falhar**

- Se o backend não localizar as contas reais, corrigir as seeds/decodificação em `server/solana.js`, especialmente `deriveOrgPDA`, `deriveMemberPDA`, `deriveCapabilityPDA`, `decodeMemberAccount` e `decodeCapabilityAccount`.
- Se o `Program ID` estiver divergente, corrigir **todas** as referências no `Anchor.toml`, `programs/nodus_access/src/lib.rs`, `server/solana.js` e `.env` local.

**Pronto quando**

- `GET /api/solana/devnet/proof?organizationId=demo-org&address=MEMBER_ADDRESS` retorna os três PDAs e papel ativo.
- Existem links públicos do Program ID e das transações de provisionamento no Solana Explorer Devnet.

### Dev 2 — Walrus, PostgreSQL e arquivo real

**Arquivos/rotas existentes a usar**

- `server/walrus-client.js`
- `server/walrus-direct-adapter.js`
- `server/authenticated-publisher.js`
- `server/auth-tenant-store.js`
- `server/index.js`
- rotas `POST /api/assets/upload`, `POST /api/assets/uploads`, `POST /api/assets/:assetId/shares`, `DELETE /api/assets/:assetId/shares/:grantId`

**Executar agora**

1. Configurar as credenciais de Testnet exclusivamente em `.env` não versionado.
2. Subir `docker compose up -d --build`; confirmar que PostgreSQL e API respondem.
3. Fazer upload real de uma imagem/PDF entre 1 e 10 MB pelo fluxo da interface; não usar arquivo gigante.
4. Confirmar que o asset aparece no catálogo e que `Blob ID`/URL do Walruscan são recebidos pela API.
5. Testar download/descriptografia no navegador do Owner.
6. Criar/provisionar no PostgreSQL o tenant `demo-org`, Owner e Member compatíveis com as wallets Devnet; usar o provisionador existente, não insert manual recorrente.

**Modificar código apenas se falhar**

- Se o upload não chegar ao Walrus Testnet: investigar `server/walrus-direct-adapter.js` e `server/walrus-client.js`; manter o provider Testnet existente, sem criar `StorageProvider`.
- Se a sessão/tenant impedir o fluxo: corrigir o provisionamento em `server/tenant-provisioner.js` ou `server/auth-tenant-store.js`; não criar bypass inseguro fora do ambiente descartável de demo.
- Se o modal não conseguir ler/criar envelopes, corrigir as rotas em `server/index.js` nas linhas próximas a `/key-envelopes` e `/shares`.

**Pronto quando**

- Owner vê o arquivo, o Blob ID e consegue baixá-lo/descriptografá-lo após reiniciar a página.
- O gateway nunca recebe chave AES em texto puro e não existem chaves/arquivo plaintext em logs.

### Dev 3 — tela que explica a prova

**Arquivos existentes a usar**

- `public/index.html`
- `public/app.js`
- `public/style.css`

**Construir agora**

1. Adicionar ou conferir badges sempre visíveis: `Walrus Testnet — demonstração` e `Solana Devnet — RBAC verificável`.
2. No card/modal do arquivo, mostrar: nome, estado “Cifrado no dispositivo”, `Blob ID`, link Walruscan, papel da pessoa atual e link Solana Explorer quando existir `solanaProof`.
3. No modal de share já existente (`#shareModal`), manter somente **arquivo**, **Member**, papel `viewer` e botão de revogar para a demo. Pasta, expiração e opções extras podem ficar ocultas se causarem instabilidade.
4. Escrever mensagens simples:
   - sucesso: “Arquivo protegido e armazenado no Walrus Testnet.”
   - compartilhado: “Acesso cifrado concedido a [Member].”
   - revogado: “O acesso futuro foi bloqueado. Cópias já baixadas não podem ser apagadas.”
   - falha: “Esta carteira não tem acesso ativo à equipe.”
5. Não alterar a landing, idiomas extras, design system ou criar telas de preço.

**Pronto quando**

- Uma pessoa sem contexto de blockchain entende quem pode abrir o arquivo, onde verificar e o que a revogação faz.

## Dia 2 — conectar duas wallets e o compartilhamento

### Dev 1

1. Fazer login real do Owner e do Member via Phantom/Solflare, em perfis de navegador separados.
2. Validar `POST /api/auth/solana/challenge` e `POST /api/auth/solana/verify` contra os PDAs Devnet.
3. Corrigir somente se necessário `server/index.js` (rotas de autenticação próximas às linhas 500–570) e `server/solana.js` para falhar fechado quando o PDA estiver ausente/revogado.

### Dev 2

1. Com Owner logado, criar envelope para Member e chamar `POST /api/assets/:assetId/shares`.
2. Com Member logado, confirmar `GET /api/assets/:assetId/key-envelopes`, download e abertura do mesmo arquivo.
3. Remover o share em `DELETE /api/assets/:assetId/shares/:grantId` e revogar/atualizar a capability Devnet pelo programa Anchor.
4. Confirmar que **nova** leitura do envelope falha; não alegar apagar cópia já aberta.

### Dev 3

1. Garantir que a UI usa a wallet correta após alternar de perfil.
2. Mostrar o link de prova retornado em `solanaProof` após compartilhar.
3. Remover temporariamente botões/flujos que não funcionam no demo, em vez de mantê-los como promessa.

**Gate ao fim do dia 2:** Owner → upload → share → Member abre → Owner revoga → Member é bloqueado. Se isso não acontecer, todo o time para itens cosméticos e corrige esse fluxo.

## Dia 3 — estabilizar, testar e preparar evidências

### Dev 1

- Rodar `npm run test:solana`, `npm run test:solana-anchor-contract`, `npm run test:solana-devnet-provisioning` e `npm run test:solana-collaboration-rbac`.
- Repetir o provisionamento em uma organização limpa se houver contas antigas/ambíguas.
- Criar `docs/HACKATHON_EVIDENCIAS.md` com somente dados públicos: Program ID, wallets públicas, PDAs, assinaturas e URLs de Explorer.

### Dev 2

- Rodar `npm run test:zero-plaintext`, `npm run test:key-envelopes`, `npm run test:asset-sharing` e `npm run test:walrus-fallback`.
- Rodar três vezes a sequência completa em ambiente limpo; registrar falhas e corrigir somente regressões do happy path.
- Verificar que `.env`, `.demo-wallets/`, `target/deploy/*.json` e arquivos de teste não serão commitados.

### Dev 3

- Fazer uma gravação de backup da demo completa.
- Escrever o roteiro em linguagem humana: problema → upload cifrado → prova Walrus → equipe Solana → compartilhamento → revogação → limite honesto.
- Criar um slide único de arquitetura, sem alegar Mainnet, SLA ou preço.

## Dia 4 — ensaio e envio

1. Rodar `npm test` antes do envio; se a suíte completa falhar por teste não relacionado, registrar a falha e rodar novamente as suítes listadas neste documento.
2. Executar a demo em dois perfis de navegador, do zero, com conexão de rede normal.
3. Abrir os links do Walruscan e Solana Explorer durante o ensaio, não apenas no final.
4. Gravar vídeo final de 5–7 minutos, com fallback local já gravado.
5. Atualizar README/página do projeto somente com o que foi demonstrado de verdade: `Testnet/Devnet`, não produção.
6. Fazer commit separado por área (`solana`, `storage`, `demo-ui`) e não subir segredos.

## Ordem de prioridade quando faltar tempo

| Prioridade | Entrega | Decisão |
| --- | --- | --- |
| P0 | Upload cifrado real ao Walrus Testnet + download | Obrigatório |
| P0 | PDAs e transações Solana Devnet reais | Obrigatório |
| P0 | Share e bloqueio após revogação | Obrigatório |
| P1 | UI clara, links Explorer, roteiro e vídeo | Fazer depois dos três P0 |
| P2 | Busca, pastas, upload retomável, idiomas, landing | Mostrar apenas se já estiver estável |
| Fora | Billing, preços, StorageProvider, B2/R2, passkey, SLA, Mainnet, 20 GB | Não tocar agora |

## Regra simples para o time

Se uma tarefa não torna **upload, prova, share, revogação ou apresentação** mais confiável até o prazo, ela não entra neste hackathon.
