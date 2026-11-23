# Fase 7 — Quadro legível pelo assistente

O mestre quer que o Claude o ajude a preparar a campanha a partir do quadro: ler as ideias e trabalhar em cima delas. O quadro dele, que veio do Miro, é enorme. O contexto está na **posição** das coisas (ilhas de notas coloridas sem moldura, títulos grandes soltos, colunas de texto), e há muitas imagens, inclusive handouts que são texto dentro de imagem. Mandar isso cru ao Claude custaria dezenas de milhares de tokens por região e perderia a organização espacial.

A solução é **ler em camadas**, do barato ao caro:

1. A Mesa divide o quadro em **seções**, sem gastar tokens: cada moldura é uma seção, e o que está fora de molduras é agrupado por proximidade em **ilhas**, cada uma com um título detectado.
2. O Claude vê primeiro o **mapa**: títulos, contagens, tamanho estimado em tokens, vizinhança e resumos. São poucas centenas de tokens para o quadro inteiro.
3. Ele abre só as seções que interessam, em texto compacto e paginado. Imagens vêm como `[imagem: legenda]` e só são vistas quando ele pede.
4. Na primeira leitura de uma seção, ele grava um **resumo** de duas ou três linhas, guardado com a assinatura do conteúdo. As próximas conversas já começam com os resumos no mapa, e um resumo velho aparece como desatualizado.
5. O que o Claude escreve no quadro entra numa moldura dele e na **fila de revisão**. Nada se mistura ao material do mestre sem aceite.

Regras para o executor: as mesmas da [fase-4.md](fase-4.md). Uma ficha por vez; `src/dominio` é puro e testado; `npm run typecheck` e `npm test` passando; a ficha é marcada ✅ com `Nota:` dos desvios. **Não commite**: o Opus revisa e commita.

A ponte do assistente só existe em desenvolvimento (`mesa-dev`; veja `../Atlas/scripts/ponte/LEIAME.md`). As ferramentas novas são **sob demanda**: só entram no contexto quando o Claude as carrega por `plataforma_ferramentas`.

## Etapas

| Etapa | Fichas | Resultado |
|---|---|---|
| A — Seções | L1a–L1c | O quadro dividido em seções com título, e o texto de cada seção compacto, medido em tokens |
| B — Calibrar com o quadro real | L1d | Um comando que mostra as seções de um quadro exportado, para ajustar o agrupamento com o Miro do mestre |
| C — Ferramentas na ponte | L2a–L2b | `quadro_mapa`, `quadro_secao`, `quadro_buscar`, `quadro_imagem` e o guia de uso |
| D — Resumos | L3a | Resumos e descrições de imagem gravados pelo Claude, com aviso de desatualizado |
| E — Escrever com revisão | L4a | O Claude cria notas numa moldura dele, que entram na fila de revisão |

---

## Etapa A — Seções

### L1a — Seções do quadro (puro)  ✅
Objetivo: dividir qualquer quadro em seções com título, de forma estável e rápida.
Ler: `src/dominio/molduras.ts` (`ordemDeLeitura`, `molduraQueContem`), `src/dominio/roteiro-do-quadro.ts` (`ordemDeLeituraDeItens`), `src/dominio/quadro.ts`, `src/dominio/doc-rico.ts`.
Arquivos: criar `src/dominio/secoes-do-quadro.ts` e `tests/unit/secoes-do-quadro.test.ts`.
Como:
1. `secoesDoQuadro(itens, opcoes?) → Secao[]`, com `Secao = { id, tipo: 'moldura' | 'ilha', titulo, caixa, itemIds, maeId: string | null }`.
   - **Moldura:** cada moldura é uma seção (id = id da moldura, título = título da moldura). Molduras aninhadas ficam com `maeId`.
   - **Ilha:** os itens fora de molduras (exceto setas) são agrupados por proximidade. Dois itens ficam juntos se a distância entre as caixas for menor que `vao` (padrão: 1,5 × a mediana da menor dimensão dos itens soltos, limitada a 40–400 px; tudo em `opcoes`). Use união de conjuntos com uma grade espacial (células do tamanho do `vao`), para ficar perto de O(n) em quadros com 10 mil itens. Itens soltos dentro de uma moldura pertencem à moldura, não a uma ilha.
   - **Id estável da ilha:** `ilha:<id do item-título>`, ou, sem título, do item mais acima e à esquerda. O id deve continuar o mesmo quando se acrescenta um item à ilha.
2. **Título** (`tituloDaSecao`), na ordem:
   1. o título da moldura;
   2. um item com `semantica === 'titulo'`;
   3. um texto curto (até 80 caracteres) com cabeçalho H1/H2 ou com tamanho de fonte efetivo ≥ 1,6 × a mediana da seção (o `texto.tamanho` do item e as marcas `fontSize` do doc); entre vários, o mais acima;
   4. senão, a primeira linha do item mais acima, cortada em 60 caracteres, com "…".
3. `ligacoesEntreSecoes(secoes, itens)`: as setas cujas pontas caem em seções diferentes dão `{ de, para, rotulo }`.
4. Ilhas com um único item pequeno (um rabisco, uma seta solta) entram numa seção "Soltos" por região, para o mapa não virar milhares de linhas.
Testes: moldura com título; duas ilhas separadas por um vão; ilha que cresce mantém o id; título por fonte maior, por H1, por `titulo`; molduras aninhadas; setas entre seções; 10 mil itens em menos de 300 ms.
Nota: `Secao.tipo` ganhou o valor `'soltos'` (além de `'moldura'` e `'ilha'`); a seção "Soltos" tem id `soltos:<cx>,<cy>` (região de 4000 px). Setas ficam fora de `itemIds`; moldura filha não entra no `itemIds` da mãe (é seção própria). `tituloDaSecao` devolve `{ titulo, itemId }`. Parâmetros em `OPCOES_PADRAO_SECOES`.
Commit: `split boards into titled sections`

### L1b — Texto compacto de uma seção (puro)  ✅
Objetivo: o conteúdo de uma seção num texto curto e fiel, com o tamanho em tokens conhecido antes de enviar.
Depende de: L1a.
Ler: `src/dominio/marcadores.ts`, `src/dominio/busca-quadro.ts` (`textoBuscavel`), `src/dominio/quadro.ts` (`textoPuro`).
Arquivos: criar `src/dominio/texto-da-secao.ts` + teste; mudar `src/dominio/quadro.ts` (imagem ganha `legenda?: string`, opcional e validada) e `src/dominio/miro.ts` (a legenda vem do `data.title` da imagem no Miro, sem a extensão do arquivo).
Como:
1. `estimarTokens(texto) = ceil(caracteres / 4)`. É uma estimativa, e o nome deixa isso claro.
2. `textoDaSecao(secao, itens, { nivel: 'titulos' | 'completo', pagina, limiteTokens = 2500 }) → { texto, tokens, paginas }`:
   - os itens vêm em ordem de leitura;
   - cada item vira uma linha: `- [tipo] texto` (tipo semântico, se houver), com os marcadores preservados (`[PERCEPÇÃO 13]`); quebras de linha internas viram ` / `;
   - nível `titulos`: só a primeira linha de cada item, cortada em 80 caracteres;
   - imagem: `[imagem #<id curto>: <legenda ou "sem legenda">, LxA]`; cartão de entidade: `[entidade: Nome (tipo)]`; outros Refs: `[ref: mesa:…]`;
   - setas internas da seção, no fim: `A → B: rótulo`, com A e B pelo começo do texto do item;
   - itens só do mestre e segredos **entram** (é o mestre que pergunta), marcados `(só mestre)` e `(segredo)`;
   - estado: `✓` para feito; as condições (`se:poeira`) já aparecem dentro dos marcadores, sem sufixo repetido;
   - ids curtos: os 6 primeiros caracteres do id, sem colisão dentro da seção (aumente se colidir), para o Claude poder pedir uma imagem ou citar um item.
3. Paginação: quebra entre itens, nunca no meio de um, até `limiteTokens`; o fim diz `… página 1 de 3`.
Testes: ordem; marcadores preservados; imagem com e sem legenda; paginação respeita o limite; `titulos` é bem menor que `completo`; ids curtos sem colisão.
Nota: API `estimarTokens`, `idsCurtos`, `textoDaSecao(secao, itens, { nivel, pagina, limiteTokens, secoes?, entidades? }) → { texto, tokens, paginas, tokensTotais }` (`tokensTotais` é a soma das páginas, para o mapa). Linha de item: `- #<id curto> [✓] [tipo] texto (se: …) (só mestre) (segredo)`; imagem: `- [imagem #id: legenda, LxA]`; moldura filha: `§ <título> (seção <id>, N itens)`; cabeçalho `§ <título> (<tipo>, N itens)` repetido em cada página. `(segredo)` só aparece para o marcador `[SEGREDO]` no texto (o tipo `[segredo]` já diz o resto). Setas internas: as ligadas só a itens da seção, ou uma ligada e outra livre dentro da caixa; formato `"começo" #id → "começo" #id: rótulo`. Cartão de entidade usa a opção `entidades` (id → nome, tipo); sem ela, só o nome. Item maior que o limite sai sozinho na página com `(item longo)`. `legendaDaImagemMiro` está em `miro.ts`.
Commit: `compact text view of a board section`

### L1c — Mapa do quadro (puro)  ⬜
Objetivo: o índice que o Claude lê primeiro.
Depende de: L1a, L1b.
Arquivos: criar `src/dominio/mapa-do-quadro.ts` + teste.
Como: `mapaDoQuadro(quadro, itens, resumos?) → texto`, com uma linha por seção, em ordem de leitura, com recuo para filhas:
`§ <id> "<título>" — 34 itens (12 leitura, 5 teste, 3 segredo, 8 imagens) · ~1,9 mil tokens · ao lado de "<vizinha>" · → "<seção ligada por seta>"`
- vizinha: a seção mais próxima, com a direção (`acima de`, `à direita de`…);
- resumo, se houver, na linha de baixo; `(resumo desatualizado)` quando a assinatura mudou;
- cabeçalho com o nome do quadro, o total de seções, de itens e de tokens estimados, e quantas imagens não têm legenda nem descrição;
- limite de 6 mil tokens: passando disso, as seções "Soltos" e as ilhas pequenas são resumidas numa linha por região.
Testes: formato; recuo; vizinhança; corte por limite.
Commit: `board map for the assistant`

---

## Etapa B — Calibrar com o quadro real

### L1d — Comando de seções  ⬜
Objetivo: ver como a Mesa divide o quadro real do mestre antes de ligar a ponte, e ajustar o `vao` e o título.
Depende de: L1c.
Ler: `src/dominio/pacote-quadro.ts` (`lerPacote`), `scripts/miro-baixar.mjs` (estilo de script Node).
Arquivos: criar `scripts/quadro-secoes.ts`; mudar `package.json` (`"quadro:secoes": "node scripts/quadro-secoes.ts"`).
Como: `npm run quadro:secoes -- <arquivo.mesa-quadro.zip | arquivo.miro.zip> [--vao 120] [--secao <id>] [--html saida.html]`.
- Aceita o pacote exportado pela Mesa e também o `.miro.zip` (converte com `converterMiro`).
- Sem `--secao`: imprime o mapa (L1c). Com `--secao`: imprime o texto da seção (L1b).
- `--html`: um arquivo com um SVG do quadro (caixas dos itens coloridas por seção, títulos por cima), para o mestre ver de olho se as ilhas batem com o que ele entende como "uma parte".
- Nada sai da máquina; o comando não precisa de token.
Testes: unitário só do tratamento de argumentos; validação manual com o quadro do mestre (anotar na `Nota:` o `vao` que funcionou e os tropeços do título).
Commit: `command to inspect board sections`

---

## Etapa C — Ferramentas na ponte

### L2a — Ferramentas de leitura  ⬜
Objetivo: o Claude navega pelo quadro sem carregar o que não precisa.
Depende de: L1c.
Ler: `src/app/ponte-ferramentas.ts`, `src/app/ponte-escrita.ts` (padrão de contexto injetável e de erros legíveis), `src/app/ponte.ts`, `../Atlas/scripts/ponte/LEIAME.md` ("Dois níveis de ferramentas", "Catálogo base"), `../Atlas/mesa-core/src/ponte.ts` (`json`, `imagem`).
Arquivos: criar `src/app/ponte-quadros.ts` e `tests/unit/ponte-quadros.test.ts`; mudar `src/app/ponte.ts` (registrar) e `src/app/ponte-ferramentas.ts` (se o catálogo vier dele).
Como (todas só de leitura e sob demanda, cada uma com menos de 4,5 KB no catálogo):
- `quadros_listar`: os quadros da campanha, com o total de seções, de itens e de tokens estimados.
- `quadro_mapa(quadro)`: o mapa da L1c.
- `quadro_secao(quadro, secao, nivel?, pagina?)`: o texto da L1b.
- `quadro_buscar(termo, quadro?)`: as seções onde o termo aparece, com um trecho de até 120 caracteres por ocorrência e no máximo 20 ocorrências.
- `quadro_imagem(quadro, item, lado?)`: a imagem reduzida (lado máximo 768 px por padrão, 1568 no máximo, em JPEG 0,8), com a legenda em texto junto.
O contexto lê do banco na hora da chamada (como `ContextoDeSessoes`); o quadro aberto vem da memória. A busca aceita o quadro pelo nome ou pelo id.
Testes: cada ferramenta com contexto falso; erro legível para quadro ou seção inexistente; tamanho do catálogo.
Depois: no Atlas, `npm run ponte:catalogo` e commit de `scripts/ponte/catalogo-base.json` (rotina descrita no LEIAME).
Commit: `board reading tools for the assistant`

### L2b — Guia de uso para o Claude  ⬜
Objetivo: o Claude saber ler o quadro do jeito barato.
Depende de: L2a.
Arquivos: `../Atlas/docs/assistente/guia/quadros.md` (novo) e a linha dele no índice do guia (veja como `ferramentas-mesa.md` entra).
Como: ensinar a ordem (mapa → busca → seção em `titulos` → seção `completo` → imagem só se precisar), a gravar o resumo depois de ler uma seção (L3a), a citar itens pelo id curto, a não pedir todas as imagens, e a vocabulário do mestre (marcadores, tipos semânticos, `[[ligações]]`).
Commit no Atlas: `guide for reading mesa boards`

---

## Etapa D — Resumos

### L3a — Resumos e descrições guardados  ⬜
Objetivo: cada seção é lida a fundo uma vez só, e as imagens importantes ganham uma descrição em texto.
Depende de: L2a.
Ler: `src/app/banco-quadros.ts` (versão 2, stores), `src/dominio/sincronia-miro.ts` (`assinaturaDoMiro`, o mesmo hash).
Arquivos: `src/app/banco-quadros.ts` (versão 3, store `resumos` com chave `[quadroId, alvo]`, em que `alvo` é o id da seção ou `item:<id>`, e `{ texto, assinatura, autor: 'assistente' | 'mestre', em }`); `src/dominio/secoes-do-quadro.ts` (`assinaturaDaSecao`: hash dos ids e textos dos itens da seção); `src/app/ponte-quadros.ts`; `src/ui/quadro/Navegador.tsx` (resumo embaixo do título, editável pelo mestre); testes.
Como:
- `quadro_resumir(quadro, secao, texto)`: grava o resumo (até 400 caracteres) com a assinatura atual.
- `quadro_descrever_imagem(quadro, item, texto)`: grava a descrição de uma imagem (até 600 caracteres). Ela passa a aparecer no lugar da legenda no texto da seção.
- O mapa mostra os resumos e marca `(resumo desatualizado)` quando a assinatura mudou.
- O mestre vê e corrige os resumos no navegador de molduras; um resumo editado pelo mestre fica `autor: 'mestre'` e o Claude é avisado no mapa de que ele não deve ser trocado sem pedir.
- Exportar o quadro (E4d) leva os resumos junto.
Testes: banco v2 → v3 sem perda; assinatura muda quando o texto muda e não muda quando só a posição muda; ferramentas.
Commit: `assistant summaries for board sections`

---

## Etapa E — Escrever com revisão

### L4a — O Claude cria notas no quadro  ⬜
Objetivo: o Claude propõe ideias dentro do quadro, sem misturar com o material do mestre.
Depende de: L2a.
Ler: `src/dominio/quadro.ts` (`revisao`), `src/ui/quadro/FilaDeRevisao.tsx`, `src/dominio/revisao.ts`, `src/app/ponte-escrita.ts`.
Arquivos: `src/dominio/quadro.ts` (`revisao.origem` aceita `'assistente'`), `src/app/ponte-quadros.ts`, `FilaDeRevisao.tsx` (grupo "Do assistente"), testes.
Como: `quadro_propor(quadro, perto?: secao, titulo, notas: { texto, tipo? }[])` cria uma moldura "✦ <título>" ao lado da seção indicada (no primeiro espaço livre à direita ou abaixo) com as notas dentro, todas com `revisao: { origem: 'assistente', … }`, num único passo de desfazer. O mestre aceita, edita ou apaga pela fila. No máximo 30 notas por chamada.
Testes: posição livre (não sobrepõe nada); revisão marcada; desfazer.
Commit: `assistant proposes notes on boards for review`
