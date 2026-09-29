# Busca privada e organização (M4)

O catálogo PostgreSQL guarda somente metadados de controle já escolhidos pelo tenant — nome, MIME type, tags, pasta, tamanho, proprietário e datas. A API aplica `organization_id` em toda consulta e aceita filtros `type`, `tag`, `folderId`, `owner`, `createdAfter`, `createdBefore`, `minSize`, `maxSize` e `q`. Use `q` somente quando a aplicação aceitar buscar metadados no servidor.

`client.search()` não envia o texto consultado ao gateway. Ele pesquisa o índice local de nome, tags, descrição e conteúdo já extraído no dispositivo. Com `semantic: true`, aplica expansão de sinônimos local para categorias comuns. Não há modelo, embedding ou plaintext de documento no servidor.

Para PDF/DOCX, extraia texto no browser com o parser adotado pela aplicação e passe-o como `searchText` em `client.put()`, ou chame `client.searchIndex.indexContent(assetId, text)`. Esse texto não participa do request de upload nem é persistido pelo Nodus.

Em um novo dispositivo, use `client.rebuildPrivateSearchIndex({ includeContent: true })`. O SDK pagina o catálogo do tenant, recupera apenas ciphertext autorizado, decifra localmente pelos envelopes e recompõe o índice sem reenviar plaintext.

## Limites e custo por organização

O catálogo retorna no máximo 100 assets por página. O índice limita texto extraído automaticamente a 1 MiB por asset; parsers de PDF/DOCX devem aplicar o mesmo teto antes de fornecer `searchText`. A reconstrução de metadados é `O(n)` no número de assets; com `includeContent`, o custo adicional é o download e a decifragem local de cada ciphertext autorizado. Assim, o controle de escala é por dispositivo e tenant, sem custo de embedding, índice de plaintext ou consulta de conteúdo no servidor.
