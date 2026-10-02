# M5 — Demonstração de colaboração soberana com Solana

## Objetivo da banca

Demonstrar que duas wallets pertencentes à mesma organização recebem e perdem
acesso a um asset cifrado sem o Nodus se tornar custodiante da chave. A cadeia
confirma o papel ativo; o envelope ECDH entrega a chave apenas ao dispositivo do
destinatário; o PostgreSQL guarda apenas o envelope cifrado e o grant.

## Pré-requisitos

1. O programa `nodus_access` está implantado em Devnet e `NODUS_SOLANA_RBAC_MODE=devnet` está configurado.
2. Owner e membro foram provisionados com `npm run solana:devnet:provision`.
3. Ambos concluíram SIWS com Phantom ou Solflare e têm uma identidade de
   criptografia registrada no Nodus.
4. O asset foi cifrado no navegador e o owner ainda consegue recuperar sua chave
   local para criar o envelope do destinatário.

## Roteiro de evidência

1. No Explorer Devnet, mostre Program ID e PDAs `Organization`, `Member` e
   `Capability` das duas wallets.
2. Como owner/contributor, selecione o asset, o membro da organização, papel
   `viewer` e uma expiração curta. O navegador cifra um envelope ECDH para a
   chave pública do membro; a chave de dados nunca é enviada em texto puro.
3. Como membro, abra o asset. A API entrega apenas o envelope que pertence a
   essa wallet e o navegador o decifra localmente.
4. Como owner/contributor, revogue o grant na lista de compartilhamentos.
5. Atualize a sessão do membro e tente recuperar o envelope novamente. A leitura
   deve falhar; o backend também falha fechado se a membership/capability Devnet
   estiver ausente, revogada ou tiver papel insuficiente.

## Papel, prazo e revogação

- O papel solicitado no compartilhamento não pode exceder o papel ativo do
  destinatário na Devnet.
- Só `owner`, `admin` e `contributor` podem iniciar compartilhamento; em Devnet,
  a API também confere esse papel on-chain para cada operação sensível.
- A expiração bloqueia leituras futuras de envelopes depois do horário definido.
- A revogação bloqueia leituras futuras de envelopes. Não apaga cópias do
  ciphertext, da chave ou do arquivo que já tenham sido decifradas/exportadas no
  dispositivo do destinatário. Para revogação forte de conteúdo futuro, re-cifre
  o asset para os membros ativos.

## Evidências a guardar

- duas assinaturas/transações Devnet de provisionamento;
- Program ID, PDAs e URLs do Explorer;
- grant criado com papel e prazo;
- leitura do envelope pelo membro antes da revogação;
- resposta bloqueada após a revogação.
