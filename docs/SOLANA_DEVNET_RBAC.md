# Solana Devnet RBAC proof

This is the minimum on-chain proof for the Nodus demo. It is not a billing or asset registry. The program stores only:

- SHA-256 of a normalized organization ID;
- authority and member public keys;
- role (`viewer`, `contributor`, `admin`, `owner`);
- SHA-256 of the fixed `nodus:tenant-access:v1` capability label;
- active/revoked state and timestamps.

It never stores asset IDs, file names, tags, plaintext, encryption keys, emails, or other personal metadata.

## Runbook de implantação Devnet (Samuel)

> **Objetivo:** publicar o programa `nodus_access` em Solana Devnet e habilitar a
> prova pública de RBAC para a demonstração. Devnet usa SOL de teste; este processo
> não deve ser executado com carteira, chaves, RPC ou variáveis de produção.

### 1. Pré-requisitos e local de execução

Execute este runbook em Ubuntu/WSL. No Windows, a instalação oficial do Solana é
via WSL. Use o checkout `solana-anchor-devnet` enquanto o arquivo legado `Nodus
Handoff.` existir no repositório: o ponto no fim do nome não é compatível com um
checkout comum no NTFS.

```bash
cd "/mnt/c/Users/giova/OneDrive/Documentos/ChatGPT/Nodus - Colosseum/solana-anchor-devnet"

# Instala Rust, Solana CLI e Anchor pelo instalador oficial.
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
exec "$SHELL" -l

# Este programa usa Anchor 0.30.1. AVM mantém a versão do CLI alinhada.
cargo install --git https://github.com/otter-sec/anchor avm --force
avm install 0.30.1
avm use 0.30.1

rustc --version
solana --version
anchor --version
```

Os três comandos de versão devem responder sem erro. Se não responderem, pare aqui
e corrija o `PATH`/a instalação antes de criar qualquer carteira.

### 2. Criar e financiar uma carteira exclusiva de Devnet

Crie uma keypair nova somente para este deploy. A seed phrase e o arquivo JSON são
segredos: não envie por chat, não coloque em `.env` e não faça commit.

```bash
solana config set --url https://api.devnet.solana.com
mkdir -p ~/.config/solana
solana-keygen new --outfile ~/.config/solana/nodus-devnet-deployer.json
solana config set --keypair ~/.config/solana/nodus-devnet-deployer.json

solana address
solana airdrop 2
solana balance
```

O saldo deve ser maior que zero e a URL retornada por `solana config get` deve ser
`https://api.devnet.solana.com`. Se o airdrop falhar por limite público, tente mais
tarde; não substitua por fundos reais.

### 3. Gerar o Program ID definitivo e sincronizar o repositório

O Program ID não pode ser inventado: ele é derivado da keypair do programa. Gere-a
uma única vez e preserve `target/deploy/nodus_access-keypair.json` em armazenamento
seguro e privado; perdê-la impede atualizações futuras daquele programa.

```bash
mkdir -p target/deploy
solana-keygen new --no-bip39-passphrase \
  --outfile target/deploy/nodus_access-keypair.json

anchor keys list
anchor keys sync
anchor build
```

Confirme que o ID mostrado para `nodus_access` é o mesmo nestes dois locais antes
de prosseguir:

```text
Anchor.toml                              [programs.devnet].nodus_access
programs/nodus_access/src/lib.rs         declare_id!("...")
```

Se o `anchor keys sync` alterou arquivos, faça uma revisão e um commit separado
somente com o Program ID público. Nunca inclua `target/deploy/*-keypair.json`.

### 4. Compilar e implantar

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Guarde a assinatura retornada pelo deploy e valide o programa:

```bash
solana program show SEU_PROGRAM_ID
```

No Explorer, use sempre a rede Devnet:

```text
https://explorer.solana.com/address/SEU_PROGRAM_ID?cluster=devnet
https://explorer.solana.com/tx/SUA_ASSINATURA?cluster=devnet
```

### 5. Habilitar o backend apenas no ambiente Devnet

Configure as variáveis no secret manager ou no `.env` local que **não** é enviado
ao Git. O `SOLANA_PROGRAM_ID` deve ser exatamente o ID verificado no passo anterior.

```bash
SOLANA_PROGRAM_ID=SEU_PROGRAM_ID
SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com
NODUS_SOLANA_RBAC_MODE=devnet
```

Reinicie o backend e confirme que a configuração de produção continua com
`NODUS_SOLANA_RBAC_MODE` diferente de `devnet`. Nunca reutilize uma sessão ou API
key de sandbox/Devnet em produção.

### 6. Provisionar a demonstração e coletar evidências

Antes da banca, o owner deve enviar transações para:

1. `initialize_organization` com o hash SHA-256 do ID normalizado da organização;
2. `upsert_member` para a carteira do participante;
3. `set_capability` para a capability fixa `nodus:tenant-access:v1`.

O repositório fornece o provisionador Devnet para assinar essas operações com a
carteira do owner. Informe somente o Program ID público, a carteira do owner e a
carteira pública do membro; o script não aceita RPC de produção nem lê arquivos,
chaves ou metadados de assets.

```bash
npm run solana:devnet:provision -- \
  --organization demo-org \
  --member CARTEIRA_PUBLICA_DO_MEMBRO \
  --role viewer \
  --program-id SEU_PROGRAM_ID \
  --wallet ~/.config/solana/nodus-devnet-deployer.json
```

O resultado JSON inclui a assinatura e o link Devnet do Explorer. Execute o mesmo
com `--role contributor` ou `--role admin` quando necessário. Sem as contas
on-chain, o endpoint do backend falha fechado com `403`, que é o comportamento
correto.

Guarde para a apresentação: Program ID, assinaturas das três transações, endereço
do owner, endereço do membro e os PDAs de organização/membro/capability. Esses
dados são públicos; não inclua seed phrase, keypair, chaves de criptografia ou
metadados de assets.

## Demo sequence

1. Owner wallet initializes `Organization` from the SHA-256 organization ID.
2. Owner assigns the second wallet a `Member` role and creates its tenant-access `Capability`.
3. Capture the transaction signatures and open the program, organization, member and capability PDAs in Solana Explorer on Devnet.
4. The second wallet completes SIWS. `POST /api/auth/solana/verify` returns `solanaProof` only after the API reads active Devnet accounts.
5. Share an encrypted asset to that member, then revoke its member/capability. A later SIWS verification and envelope read must fail.

## Verification endpoint

With Devnet mode enabled, inspect the public proof without exposing private metadata:

```bash
curl "http://localhost:3000/api/solana/devnet/proof?organizationId=demo-org&address=MEMBER_WALLET"
```

The result includes only PDA addresses, effective role, program ID and RPC URL. A missing, foreign or revoked account returns `403`.

## Limits

The program intentionally does not replace PostgreSQL tenant context or client-side encryption. During the demo the backend requires the PostgreSQL role not to exceed the Devnet role. A recipient who already decrypted an asset may retain a local copy; revocation prevents later Nodus envelope recovery and must be paired with re-encryption for strong revocation.
