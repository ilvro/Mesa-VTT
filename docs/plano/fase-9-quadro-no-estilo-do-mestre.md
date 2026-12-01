# Fase 9 — O assistente escreve no quadro no estilo do mestre

O mestre pediu ao Claude, pelo MCP, que completasse a missão "O Pântano dos Afogados" no quadro. O Claude criou 8 molduras "✦" com post-its coloridos numa fileira horizontal. O mestre escreve de outro jeito: uma **coluna vertical** lida de cima para baixo, com títulos em maiúsculas ("INTRODUÇÃO", "COMBATE"), **texto corrido** em `pt-serif` e trechos destacados com cor de fundo, e as imagens ao lado do bloco a que pertencem. As duas versões estão lado a lado no próprio quadro: a ilha "parte feita por mim" e as molduras "✦" à direita dela.

## O que o quadro real mostra (banco da Mesa, 2026-11-25)

- **Mestre:** 19 itens `texto`, todos `pt-serif`, sem `semantica` (vieram colados do Miro com `revisao.origem = 'miro'`). A cor vem das marcas TipTap `textStyle.backgroundColor` em cada trecho:
  - `rgb(255,246,182)` (amarelo claro): narração lida aos jogadores;
  - `rgb(26,26,26)` com letra branca: regras e instruções ao mestre;
  - `rgb(101,157,242)` (azul): condições como `[SE UM OU MAIS PERSONAGENS PASSAREM]`;
  - `rgb(173,240,199)` (verde): falas (`[AFOGADO] "Oisín…"`).
  Os títulos (`INTRODUÇÃO`, `COMBATE`) são itens de texto curtos, sem destaque. As duas imagens (capa e ficha da criatura) ficam ao lado da coluna. Há uma seta saindo de "INTRODUÇÃO".
- **Assistente:** 9 molduras, 121 notas `open-sans`, com o fundo pela `semantica` (paleta da campanha), em grade de 3 colunas.

## Por que o assistente não consegue imitar

1. **Leitura cega ao visual.** `quadro_secao` (`src/dominio/texto-da-secao.ts`) devolve só o texto. O formato, a fonte, o tamanho, os destaques por trecho e a geometria se perdem, embora estejam no `Item`. Os blocos internos de uma ilha ("INTRODUÇÃO" e "COMBATE" dentro de "parte feita por mim") também não aparecem: não há como apontar "abaixo de COMBATE".
2. **Escrita de um formato só.** `quadro_propor` (`src/dominio/proposta-quadro.ts`) só cria uma moldura "✦" nova com notas adesivas em grade, coloridas pelo tipo. Não sabe criar texto corrido, copiar um estilo, continuar uma coluna, criar setas nem pôr imagens.
3. **O guia impõe o estilo do assistente.** A seção "Propor ideias" de `Atlas/docs/assistente/guia/quadros.md` só prevê post-its tipados e não manda olhar o estilo existente.
4. **Sem conferência.** O assistente não vê o resultado.

## Decisões

- **Ferramenta nova `quadro_inserir`**, em vez de inflar `quadro_propor`. `quadro_propor` continua para "me dê ideias" (post-its numa moldura ✦). `quadro_inserir` serve para "monte, transcreva ou continue o material". Os motivos: o limite de 4,5 KB por ferramenta no catálogo base e duas intenções diferentes, que o guia separa com clareza.
- **O estilo se copia de itens do mestre, por `#id`**, não por nomes de estilo. O `#id` é estável entre conversas, e `quadro_estilo` sempre dá um item de exemplo para cada estilo que encontrar. O mesmo vale para os destaques por parágrafo (`como: "#id"` copia o trecho predominante daquele item).
- **Sem moldura por padrão.** Os itens entram soltos, com `revisao.origem = 'assistente'` (a fila já agrupa "Do assistente" por item, sem depender de moldura). A marca visual de "proposto" fica no próprio item.
- **`tipo` semântico é opcional e não pinta nada** quando há `estilo_como`. Ele só alimenta os recursos de jogo (leitura, segredo, teste).
- **A medição de altura do texto é injetada** (`ctx.medirTexto`, que usa `alturaNecessariaDoTexto` de `pixi/render-textos.ts`), para que `src/dominio` continue puro e testável.

Regras para o executor: as mesmas da [fase-4.md](fase-4.md). Uma ficha por vez; `src/dominio` é puro e testado; `npm run typecheck` e `npm test` passando; a ficha é marcada ✅ com `Nota:` dos desvios e limites. Ferramenta criada ou alterada → `npm run ponte:catalogo` no Atlas e commit de `scripts/ponte/catalogo-base.json` lá. **Não commite**: o Opus revisa e commita.

## Etapas

| Etapa | Fichas | Resultado |
|---|---|---|
| A — Ler o estilo | Q9a–Q9c | Estrutura visual da seção, resumo das convenções do mestre e captura de uma região como imagem |
| B — Escrever no estilo | Q9d–Q9g | `quadro_inserir`: texto e título com estilo copiado, coluna continuada, setas, imagens, marca de proposto sem moldura |
| C — Guia e aceitação | Q9h–Q9i | Guia "montar ou transcrever material" e o teste de aceitação no quadro do Pântano |

---

## Etapa A — Ler o estilo

### Q9a — Estrutura visual de uma seção (puro + `nivel: "estrutura"`)  ✅
Objetivo: o assistente vê, por item, o formato, o estilo e a posição, e vê os blocos internos de uma ilha.
Ler: `src/dominio/texto-da-secao.ts` (`idsCurtos`, paginação), `src/dominio/secoes-do-quadro.ts` (`infoDeTexto` e o cálculo de tamanho efetivo, `tituloDaSecao`, `razaoTitulo`), `src/dominio/quadro.ts` (`EstiloDeTexto`, `EstiloDeCaixa`, `DocRico`), `src/app/ponte-quadros.ts` (`quadro_secao`).
Arquivos: criar `src/dominio/estrutura-da-secao.ts` + `tests/unit/estrutura-da-secao.test.ts`; mudar `src/app/ponte-quadros.ts`.
Como:
1. `estruturaDaSecao(secao, itens, { pagina, limiteTokens, secoes? }) → { texto, paginas }`, com uma linha por item em ordem de leitura e coordenadas **relativas ao canto da seção**, arredondadas a 4 px:
   `- #it-dd3 texto 12,96 400×180 pt-serif 14 #1a1a1a caixa:#ffffff destaques: rgb(255,246,182) 70%, rgb(26,26,26) 30% · "Faz três dias que vocês…"`
   - formato: `texto` | `nota` (texto com fundo de caixa colorido e sem borda, como a `novaNotaAdesiva`) | `forma:<forma>` | `imagem` | `moldura` | `ref` | `seta` (setas no fim, como em `textoDaSecao`);
   - fonte e tamanho **efetivos** (os mesmos usados para detectar título: `texto.tamanho` ou o maior `fontSize` das marcas);
   - `destaques`: as cores de `backgroundColor` das marcas, com a fração de caracteres de cada uma (até 3); `negrito` e `itálico` se cobrirem mais da metade do texto; `cor` da letra se uma marca `color` cobrir mais da metade;
   - `semantica` e `revisao.origem` entre colchetes, se houver (`[leitura]`, `[do assistente]`);
   - a primeira linha do texto, cortada em 60 caracteres.
2. **Blocos internos:** dentro de uma ilha ou moldura, um item que seria título pelo critério de `tituloDaSecao` (fonte ≥ razão × mediana, H1/H2 ou `semantica === 'titulo'`) abre um bloco. Antes dele sai a linha `▸ bloco "COMBATE" (#it-420)`. Os itens seguintes na ordem de leitura pertencem ao bloco até o próximo título. Exporte `blocosDaSecao(secao, itens) → { tituloId, titulo, itemIds }[]`, que a Q9e usa.
3. Na ponte: `quadro_secao` aceita `nivel: "estrutura"`, com a mesma paginação. Atualize a descrição da ferramenta (sem passar de 4,5 KB).
Testes: coordenadas relativas; tamanho efetivo pela marca `fontSize`; destaques com frações somando ~100%; formato `nota` × `texto`; blocos a partir de títulos por fonte e por `semantica`; ilha sem título interno = um bloco só; paginação.
Nota: `estruturaDaSecao(secao, itens, { pagina, limiteTokens, secoes? }) → { texto, paginas }` e `blocosDaSecao(secao, itens) → { tituloId, titulo, itemIds }[]` em `src/dominio/estrutura-da-secao.ts`. Reaproveitados e exportados sem mudar comportamento: `infoDoTexto`, `mediana` e o novo `tituloPorFonte` (critério de título por fonte, usado também por `tituloDaSecao`) em `secoes-do-quadro.ts`; `paginarUnidades` (extraído de `textoDaSecao`) em `texto-da-secao.ts`. Desvios: `blocosDaSecao` aplica o critério a todos os itens (todo título abre bloco, não só o mais acima), `itemIds` não inclui o próprio título e itens antes do primeiro título ficam sem bloco; setas saem como `- seta #a → #b: rótulo` (ids curtos); molduras filhas saem como linha `moldura`; `nota` = `texto` com fundo de caixa e sombra, como a `novaNotaAdesiva` (na revisão: o critério "sem borda" marcava como nota os textos do Miro com caixa branca); a cor de letra só substitui `cor` se uma marca `color` cobrir mais da metade; tamanhos também arredondados a 4 px. Limite: a fração dos destaques conta caracteres, inclusive espaços.
Commit: `board section structure view with styles and blocks`

### Q9b — Convenções visuais do quadro (puro + `quadro_estilo`)  ✅
Objetivo: um resumo curto que diga ao assistente como o mestre escreve, com um item de exemplo para cada estilo.
Depende de: Q9a.
Ler: o que a Q9a criou; `src/dominio/paleta.ts`.
Arquivos: criar `src/dominio/estilo-do-quadro.ts` + teste; mudar `src/app/ponte-quadros.ts`.
Como:
1. `estiloDoQuadro(itens, secao?) → EstiloDetectado` considera só os itens **do mestre** (sem `revisao.origem === 'assistente'`):
   - **estilos de item:** agrupa os itens de texto e forma por `(formato, fonte, tamanho efetivo ±1, cor, fundo da caixa, papel)`, em que o papel é `titulo` (pelo critério da Q9a) ou `corpo`. Cada grupo traz a contagem, a largura mediana e um `exemplo: #id`;
   - **destaques:** cada cor de `backgroundColor` usada, com o total de caracteres, a cor da letra mais comum nesses trechos e um `exemplo: #id` (o item em que aquela cor é o trecho predominante). Os rótulos de uso são palpites, marcados como tais: um destaque cujos trechos têm muitos marcadores `[...]` é "condição/rótulo"; um com aspas e `[NOME]` é "fala"; o mais longo e sem marcadores é "narração?";
   - **fluxo:** `coluna` quando mais de 60% dos itens de texto da seção compartilham o x (±24 px) e ficam empilhados; senão `grade` ou `livre`. Para coluna: x, largura mediana e **espaço vertical mediano** entre itens consecutivos;
   - **imagens:** de que lado da coluna ficam (`direita` | `esquerda` | `dentro`) e a largura mediana;
   - **semântica:** a fração de itens com `semantica`. Abaixo de 20%, a saída diz: "o mestre não usa post-its tipados; não use cores por tipo".
2. `quadro_estilo(quadro, secao?)` devolve um texto curto (alvo: menos de 600 tokens), por exemplo:
   ```
   Fluxo: coluna em x=0, largura ~400, 24 px entre itens; imagens à direita (~420 px).
   Títulos: texto pt-serif 28 #ffffff, sem destaque (exemplo #it-420).
   Corpo: texto pt-serif 14 #1a1a1a, caixa #ffffff, largura ~400 (exemplo #it-6b2).
   Destaques: rgb(255,246,182) narração? (#it-dd3) · rgb(26,26,26) letra branca (#it-6b2) · rgb(101,157,242) condição/rótulo (#it-b1c) · rgb(173,240,199) fala (#it-d13).
   Semântica: 0% dos itens; o mestre não usa post-its tipados.
   ```
   Sem `secao`, usa a seção do mestre com mais itens de texto e diz qual escolheu.
Testes: com um quadro montado igual ao do Pântano (pt-serif, 4 cores de destaque, coluna com imagens à direita); itens do assistente ignorados; fluxo em grade; quadro só de post-its tipados.
Nota: `estiloDoQuadro(itens, secao?) → EstiloDetectado | null` e `textoDoEstilo(e) → string` em `src/dominio/estilo-do-quadro.ts`. `EstiloDetectado` traz `fluxo`, `coluna {x, largura, espacoVertical}`, atalhos `espacoVertical` e `larguraDaColuna`, `imagens {lado, largura}`, `grupos[]` (formato, papel, fonte, tamanho, cor, fundo, contagem, larguraMediana, `exemplo` completo e `exemploCurto`), `destaques[]` (cor, caracteres, corDaLetra, exemplo, uso), `exemploTitulo`/`exemploCorpo` (e `...Curto`) e `semantica`. Ferramenta `quadro_estilo(quadro, secao?)` na ponte. Exportados sem mudar comportamento: `itensDaSecao` e `titulosEntre` (de `estrutura-da-secao.ts`). Desvios: sem `secao`, retorna `null` (texto "Não há seção…") se nenhuma seção tem texto do mestre; a `cor` do grupo é a cor base do item (`texto.cor`), não a das marcas (o branco sobre preto aparece nos destaques como `letra #ffffff`, mostrada só quando difere da cor do corpo); o título/corpo usa `titulosEntre` só com os itens do mestre; palpites de uso: `fala` (`[NOME] "…`), `condição/rótulo` (metade ou mais dos trechos com `[...]`) e `narração` (o de mais caracteres entre os sem palpite), sempre com `?`; grade = ≥4 itens, ≥2 colunas e ≥2 linhas de x/y (±24 px) e ≥60% dos itens com vizinho em ambas; coluna exige ≥2 itens e >60% no mesmo x. Limites: o espaço vertical usa a `altura` gravada do item (texto com `alturaAuto` pode estar defasado); no máximo 6 grupos de estilo no texto. Depois do teste real: os tamanhos de fonte saem com no máximo 1 casa decimal e sem `.0` (14, 45.3); o palpite de narração passa ao destaque com mais palavras da segunda pessoa por caractere (pelo menos 1 a cada 300; as falas e rótulos ficam de fora da comparação), letra clara sobre fundo escuro sem segunda pessoa vira "regras/instruções?", e o fluxo ganhou `centrado` (60% dos itens em fila única com o centro a até 60 px da mediana; a coluna tem precedência), com `eixo` (relativo e absoluto).
Commit: `board style summary tool for the assistant`

### Q9c — Ver uma região do quadro como imagem (`quadro_ver_regiao`)  ✅  *(Opus: é render)*
Objetivo: o assistente confere visualmente o que leu e o que escreveu.
Ler: `src/ui/quadro/pixi/viewport-quadro.ts`, `render-itens.ts` (`GerenciadorItensPixi`), `cache-imagens-pixi.ts`; `quadro_imagem` em `src/app/ponte-quadros.ts` (formato de retorno).
Arquivos: criar `src/ui/quadro/pixi/captura-quadro.ts`; mudar `src/app/ponte-quadros.ts` (`ctx.capturar?(quadroId, caixa, lado)`) e o contexto da ponte.
Como: um `Application` Pixi fora da tela, com um `GerenciadorItensPixi` próprio, sincroniza os itens que tocam a caixa, espera as imagens carregarem (com prazo de 3 s) e exporta com `renderer.extract.base64` como JPEG 0,8, com lado maior ≤ `lado` (padrão 1024, máximo 1568). Depois destrói tudo. Funciona com o quadro aberto ou fechado. Argumentos: `quadro` e `secao` **ou** `itens: ["#id", …]` (a caixa envolvente + 40 px), mais `lado`. Os itens do assistente saem com a marca de proposto (Q9g) para o mestre e o assistente verem a diferença.
Testes: unitário só da escolha da caixa (por seção e por ids); conferir a imagem à mão pelo MCP no Pântano.
Nota: puro em `src/dominio/caixa-da-captura.ts` (`caixaDaCaptura`, `escalaDaCaptura` (nunca amplia além de 2×), `itensDaRegiao`, que leva junto as setas ligadas e o item da outra ponta); render em `src/ui/quadro/pixi/captura-quadro.ts` (`capturarRegiao`, ~110 ms num quadro pequeno). O `extract` do Pixi ignora o fundo do renderer (o JPEG saía preto): o fundo do quadro vai num retângulo. `CacheImagensPixi.emCarregamento()` novo. A ferramenta aceita `secao` **ou** `itens` (até 60 #ids; o `itemPor` aceita qualquer item, não só imagem) e recusa regiões acima de 12 000 px de lado. Desvio: `src/app` não pode importar `src/ui` (teste de arquitetura), então o capturador entra por `capturadorDoQuadro` em `assistente-slot.ts`, preenchido pelo `main.tsx`. Limite: sem a grade de pontos do fundo; texto abaixo do tamanho mínimo na tela some, como no quadro.
Commit: `assistant can view a board region as an image`

---

## Etapa B — Escrever no estilo

### Q9d — Montar itens com estilo copiado (puro)  ✅
Objetivo: transformar o pedido do assistente em itens com o mesmo visual dos do mestre.
Depende de: Q9a.
Ler: `src/dominio/proposta-quadro.ts`, `src/dominio/quadro.ts` (`novaNotaAdesiva`, `docDeTexto`, validação do `DocRico`), `src/dominio/doc-rico.ts`.
Arquivos: criar `src/dominio/insercao-quadro.ts` + teste.
Como:
1. Entrada por item (limite de 40 itens e 4000 caracteres por item):
   ```ts
   type ItemPedido =
     | { formato: 'texto' | 'titulo'; texto?: string; paragrafos?: { texto: string; como?: string }[];
         estilo_como?: string; tipo?: TipoSemantico; largura?: number }
     | { formato: 'nota'; texto: string; tipo?: TipoSemantico; estilo_como?: string }
     | { formato: 'imagem'; de: string; lado?: 'direita' | 'esquerda'; largura?: number };   // Q9f
   ```
2. `estilo_como: "#id"` copia do item de referência `texto` (fonte, tamanho, cor, alinhamento), `caixa`, `alturaAuto` e a largura (se `largura` não vier). Sem `estilo_como`, `titulo` e `texto` usam o estilo de título e de corpo de `estiloDoQuadro` da seção-alvo. Se a seção não tiver nenhum, cai no padrão de `novoTexto`.
3. `paragrafos[].como: "#id"` aplica ao parágrafo inteiro as marcas do **trecho predominante** daquele item (`backgroundColor`, `color`, `bold`, `italic`, `fontSize`). `texto` simples vira um parágrafo por linha, sem marcas. Marcadores `[...]` e `[[Nome]]` passam como estão.
4. `tipo` grava `semantica`, mas **não muda cor** quando há `estilo_como` ou estilo detectado. Só `formato: 'nota'` sem estilo usa a paleta.
5. Todos os itens saem com `revisao: { origem: 'assistente', tipoSugerido: tipo ?? null, motivos: ['Proposta do assistente'] }` e `molduraId` da seção quando ela for moldura do mestre (senão `null`).
6. A altura vem de `medir(item) → number`, injetado. Saída: `{ itens, alturas }`, ainda sem posição.
Erros legíveis: `#id` inexistente ou que não é texto ("#it-954 é uma imagem; use um item de texto em estilo_como"); parágrafo vazio; limites.
Testes: cópia de estilo e largura; `como` aplica o destaque predominante; `tipo` não pinta com estilo; sem estilo usa o detectado; marcadores preservados; revisão marcada.
Nota: `montarInsercao(pedidos: ItemPedido[], { quadroId, itens, secao?, agora, novoId, medir, paleta? }) → { itens, alturas }` em `src/dominio/insercao-quadro.ts` (`alturas` é `Record<id, altura>`; a altura também fica gravada no item; x e y = 0). Exporta também `marcasPredominantes(doc)`, `ItemPedido` (com a variante `imagem`, recusada com "ainda não suportado" até a Q9f), `MAX_ITENS_POR_INSERCAO` (40) e `MAX_TEXTO_DO_ITEM` (4000). `itens` é o quadro inteiro (resolve `#id` por id exato, depois prefixo; ambíguo ou inexistente dá erro legível). Desvios: sem estilo detectado, `titulo` cai no padrão de `novoTexto` com tamanho 28 (senão não se distinguiria do corpo); `texto` e `paragrafos` são exclusivos (erro se vierem juntos); `como` em parágrafo com `\n` repete as marcas em cada linha; `formato: 'nota'` sem `estilo_como` ignora o estilo detectado (usa a paleta, 240×160, `alturaAuto` falso); `molduraId` só é preenchido se a moldura da seção não for do assistente. Limites: o limite de 4000 caracteres do item soma todos os parágrafos; `como` só olha `bold`, `italic` e `textStyle` (cor, fundo, tamanho, fonte), não sublinhado, tachado nem link; `estilo_como` aceita só item `texto` (não forma). Na revisão: texto e título têm sempre a altura medida. Copiar a altura do exemplo fazia uma narração longa estourar a caixa, e o ensaio da aceitação mostrou que nem o piso da altura copiada serve: o corpo copia o estilo do exemplo detectado (uma caixa de 150 px), e uma linha só ficava com 150 px.
Commit: `build assistant items that copy the gm text style`

### Q9e — Posicionar em coluna e a ferramenta `quadro_inserir`  ✅
Objetivo: continuar a coluna do mestre (ou abrir uma nova ao lado), num único passo de desfazer.
Depende de: Q9a (`blocosDaSecao`), Q9b (espaço vertical), Q9d.
Ler: `posicaoLivre` em `proposta-quadro.ts`, `src/dominio/camera.ts` (`caixaEnvolventeDeItem`), `quadro_propor` e `criarItens` em `src/app/ponte-quadros.ts`, `pixi/render-textos.ts` (`alturaNecessariaDoTexto`), e onde o `ContextoDeQuadros` é montado (`src/app/ponte-ferramentas.ts` e quem o chama).
Arquivos: `src/dominio/insercao-quadro.ts` (layout) + teste; `src/app/ponte-quadros.ts`; o contexto real (`medirTexto`, `moverItens`).
Como:
1. `posicionarEmColuna(alturas, larguras, itens, alvo, espaco) → { posicoes, empurrar }`, com o alvo sendo um destes:
   - `abaixo_de: "#id"`: o fim do **bloco** desse item (se ele abre um bloco, todo o bloco; senão o próprio item). x = o x do item, primeiro y = fundo + `espaco`;
   - `abaixo_de: <seção>`: o fim da coluna principal da seção;
   - `ao_lado_de: <seção>`: uma coluna nova no primeiro espaço livre à direita (o mesmo critério de `posicaoLivre`).
   Os itens são empilhados com `espaco` (o espaço vertical mediano da Q9b; 24 px se não houver). Imagens com `lado` ficam ao lado do item de texto anterior (Q9f).
2. **Espaço ocupado abaixo:** se algo do mestre estiver no caminho da coluna (por exemplo, o bloco seguinte), com `abrir_espaco: true` os itens da mesma coluna abaixo do ponto descem pela altura inserida mais o `espaco` (`empurrar: { id, dy }[]`). Sem a opção, a ferramenta recusa e diz o que está no caminho ("o bloco \"COMBATE\" começa 40 px abaixo; use abrir_espaco: true ou outro abaixo_de"). Nada se sobrepõe.
3. Ferramenta `quadro_inserir(quadro, itens, abaixo_de? | ao_lado_de?, abrir_espaco?, setas?)`: mede a altura com `ctx.medirTexto` (o `alturaNecessariaDoTexto` real), cria os itens e move os empurrados num único `executar` no quadro aberto, ou grava direto no fechado. A resposta traz `{ criados: ["#id", …], empurrados: n, caixa, desfazer }`, para o assistente chamar `quadro_ver_regiao` em seguida. Sem nenhum alvo → erro pedindo um (nunca "à direita de tudo" em silêncio).
4. Descrição curta, que diga quando usar esta ferramenta e quando usar `quadro_propor`. Rode `npm run ponte:catalogo` no Atlas.
Testes: continuar abaixo do último item; abaixo de um título = fim do bloco; recusa com obstáculo; `abrir_espaco` move só a coluna; `ao_lado_de` não sobrepõe; um passo de desfazer (teste da camada app, como o de `quadro_propor`).
Nota: `posicionarEmColuna(alturas, larguras, itens, alvo, espaco, { abrirEspaco?, secoes? }) → { posicoes, empurrar: {id, dy}[], caixa }` em `src/dominio/insercao-quadro.ts`, com `alvo` = `{ abaixoDe: Item } | { abaixoDeSecao: Secao } | { aoLadoDe: Secao }` (a ferramenta resolve `#id` e seção) e `ESPACO_VERTICAL_PADRAO` (24). Ferramenta `quadro_inserir(quadro, itens, abaixo_de? | ao_lado_de?, abrir_espaco?)` em `ponte-quadros.ts`; resposta `{ criados: ["#id6"…], empurrados, caixa, desfazer, conferir }`. `ContextoDeQuadros.criarItens` ganhou o parâmetro opcional `mover: {id, dy}[]` (criar e mover num único `executar` no quadro aberto; no fechado, `gravarItens`) e `medirTexto?(item)`, ligado a `alturaNecessariaDoTexto` pelo signal `medidorDeTexto` (`assistente-slot.ts`, preenchido em `main.tsx`; folga de 6% como na colagem do Miro); sem medidor, estimativa por caracteres. Desvios: a assinatura recebe `Item`/`Secao` em vez de ids; a coluna principal da seção é o x mais comum (±24 px) entre os textos; molduras e setas não são obstáculos; a região livre inclui `espaco` abaixo dos novos; `dy = altura inserida + espaco` preserva o vão original; `setas` ficou para a Q9f. Limites: o `abrir_espaco` só desce itens que cruzam a coluna na horizontal (imagens ao lado não descem) e recusa se algo descido bater em outro item ou se um item atravessar o ponto; a moldura da seção não cresce; item novo dentro da moldura do mestre recebe `molduraId` mas pode ficar fora da caixa dela. Testes: unitários (o passo único de desfazer conta as chamadas do contexto falso, sem e2e). Na revisão: `abrir_espaco` também desce os itens da mesma seção abaixo do ponto (as imagens ao lado dos blocos seguintes descem com o texto delas, em vez de ficarem desalinhadas). Depois do teste real: `quadro_inserir` ganhou `alinhar: "esquerda" | "centro"` (padrão `centro` quando o estilo da seção é `centrado`); no centro cada item fica com o centro no eixo (o do item de `abaixo_de`, o `eixo` do estilo ou o centro da coluna nova), e conferência de obstáculos, `abrir_espaco` e `caixa` usam as posições reais.
Commit: `quadro_inserir continues the gm column in their style`

### Q9f — Setas e imagens em `quadro_inserir`  ✅
Objetivo: o assistente liga blocos com setas e põe imagens ao lado do bloco, como o mestre faz.
Depende de: Q9e.
Ler: `novaSeta` e `novaImagem` em `src/dominio/quadro.ts`; `src/dominio/entidades.ts` (retrato e quem pode usá-lo); como `ContextoDeQuadros.imagem` acha o arquivo.
Arquivos: `src/dominio/insercao-quadro.ts`, `src/app/ponte-quadros.ts`, testes.
Como:
1. `setas: [{ de, para, rotulo? }]`, em que cada ponta é o índice (base 0) de um item criado nesta chamada ou o `#id` de um item existente. O estilo é copiado da seta mais comum do quadro (cor, cabeça, rota); sem nenhuma, `novaSeta` padrão. As setas também entram com `revisao` do assistente.
2. `formato: 'imagem'` com `de: "#id"` (uma imagem que já está no quadro, reaproveitando o `imagemId`) ou `de: "entidade:<nome ou id>"` (o retrato da entidade da campanha, se houver). Largura padrão: a mediana das imagens da seção (Q9b), na proporção original. `lado: 'direita' | 'esquerda'` põe a imagem ao lado do item de texto anterior, alinhada pelo topo, e ela não empurra a coluna. Sem `lado`, entra na coluna.
3. Upload de imagem nova fica **fora** (limite registrado): o assistente só reaproveita o que já existe na campanha.
Testes: seta entre um item novo e um existente; ponta inválida = erro legível; imagem à direita alinhada pelo topo; retrato de entidade sem arquivo = erro legível.
Nota: `quadro_inserir` ganhou `setas: [{ de, para, rotulo? }]` (ponta = índice base 0 de um item novo ou `#id` existente; até 40) e `formato: 'imagem'` com `de` (`#id` de imagem do quadro ou `entidade:<nome ou id>`), `lado?` e `largura?`. Domínio (`insercao-quadro.ts`): `montarInsercao` aceita `retratos?: Map<"entidade:…", ImagemResolvida>` e devolve também `lados`; `posicionarImagensAoLado(novos, lados, posicoes, itens, empurrar, espaco)` completa as posições (topo do item de coluna anterior que não seja imagem, 24 px dele, sem ocupar altura, erro legível se bater em algo, contando os itens descidos por `empurrar`); `montarSetas(pedidos, { quadroId, itens, novos, agora, novoId })` copia cor, espessura, tracejado, cabeças e rota da seta mais comum do mestre (padrão de `novaSeta` sem nenhuma), pontas `lado: 'auto'`, `revisao` do assistente e z acima de tudo. Ponte: `ContextoDeQuadros.retratoDaEntidade?(id)` (ligado em `ponte.ts` com `guardarImagem(retrato)`, que copia o blob para o banco de imagens do quadro por hash, sem duplicar); sem ele, `entidade:` dá "ainda não suportado". A resposta ganha `setas: ["#id"…]`; `caixa` inclui as imagens ao lado; itens e setas vão num único `criarItens` (um passo de desfazer). Desvios: largura padrão da imagem = `estiloDoQuadro(...).imagens.largura`, senão 320 (imagem de `#id` sem `largura` pode sair grande se a mediana for); imagem com `lado` ancora no item de coluna anterior que não é imagem (texto, título ou nota); imagem sem `lado` entra na coluna; ponta aceita também índice como texto numérico. Limites: upload de imagem nova fora; a seta usa `lado: 'auto'` (não escolhe o lado de saída) e não copia `curva`; a imagem ao lado não faz `abrir_espaco` descer nada e recusa se bater, em vez de procurar outro lado; `#id` de imagem não copia `legenda` nem recorte. Testes: unitários em `insercao-quadro.test.ts` e `ponte-quadros.test.ts` (seta entre novo e existente, ponta inválida, imagem à direita alinhada pelo topo, retrato de entidade e sem retrato).
Commit: `quadro_inserir places arrows and campaign images`

### Q9g — Marca de proposto sem moldura  ✅  *(Opus: visual)*
Objetivo: um item do assistente solto na coluna do mestre se distingue à primeira vista, sem mudar o layout.
Ler: `src/ui/quadro/Item.tsx` e `ItemMoldura.tsx` (`em-revisao-assistente`), `src/ui/quadro/pixi/render-itens.ts`, `estilo.css` (bloco `/* Propostas do assistente */`).
Como: primeiro conferir se o render Pixi atual desenha o contorno tracejado de `em-revisao-assistente` em itens de texto soltos. Se não, desenhar em `render-itens.ts` um contorno tracejado no `--acento`, por fora da caixa (sem mexer na largura ou na altura), e uma etiqueta pequena "✦" no canto superior direito, que some quando o item é aceito. A marca não sai na projeção aos jogadores (os itens em revisão já ficam fora dela). Ela sai na captura da Q9c.
Nota: o render do quadro é Pixi, e o contorno CSS `em-revisao-assistente` só aparecia no overlay DOM (item em edição ou referência); nos textos comuns não havia marca nenhuma. Agora `desenharMarcaDoAssistente` em `render-itens.ts` desenha o contorno tracejado no `--acento` (#a58de0) 5 px por fora e uma etiqueta com estrela no canto. Itens dentro de uma moldura que também é proposta não repetem a marca. Setas e traços ficam sem marca. Limite: a marca dos itens do Miro em revisão (contorno amarelo do CSS) continua só no overlay DOM.
Commit: `assistant items show a proposed mark without a frame`

---

## Etapa C — Guia e aceitação

### Q9h — Guia: montar ou transcrever material  ✅
Objetivo: o assistente escolhe a ferramenta certa e imita o mestre em vez de impor um estilo.
Ler: `Atlas/docs/assistente/guia/quadros.md`, `Atlas/docs/assistente/nucleo.md`.
Arquivos: `Atlas/docs/assistente/guia/quadros.md` (e o `resumo:` do topo).
Como:
1. Nova seção **"Montar, transcrever ou continuar material"**, antes de "Propor ideias":
   1. `quadro_estilo` (e `quadro_secao` com `nivel: "estrutura"` da seção-alvo) **antes** de escrever qualquer coisa;
   2. imitar o formato e o fluxo: `quadro_inserir` com `estilo_como` e `paragrafos[].como` apontando para os exemplos do mestre, e `abaixo_de` para continuar a coluna dele;
   3. se o estilo não puder ser reproduzido (por exemplo, se o mestre usa algo que `quadro_inserir` não cria), **avisar o mestre e perguntar antes** de criar qualquer coisa;
   4. ao terminar, `quadro_ver_regiao` nos itens criados, comparar com a parte do mestre e corrigir antes de responder.
2. Deixar explícito: se `quadro_estilo` diz que o mestre não usa post-its tipados, **não** use `quadro_propor` nem cores por tipo para material; `tipo` só como semântica.
3. "Propor ideias" passa a dizer que vale para sugestões soltas ("me dê ideias de…"), não para montar a missão.
4. Atualizar a lista de ferramentas no topo do guia.
Nota: feito pelo Opus no Atlas (`4c9ded0`). A seção nova ficou antes de "Propor ideias" e já cita `setas` e `formato: "imagem"` da Q9f; a ordem de leitura ganhou o `nivel: "estrutura"` como passo 6 (só para escrever). O `abrir_espaco` só deve ser usado quando o mestre pediu para inserir no meio.
Commit (Atlas): `(docs) board guide covers building material in the gm style`

### Q9i — Teste de aceitação no Pântano  ⬜  *(Opus)*
Objetivo: provar o resultado no quadro real.
Como: pela ponte (MCP), pedir "continue a missão abaixo de COMBATE no mesmo estilo", com base nas molduras ✦ já existentes. Critérios:
- a continuação fica na coluna da ilha "parte feita por mim", abaixo do último item do bloco COMBATE;
- títulos e texto corrido em `pt-serif`, com os mesmos destaques (narração em amarelo claro, regras em fundo escuro, condições em azul, falas em verde);
- nenhuma moldura "✦" e nenhum post-it;
- tudo no grupo "Do assistente" da fila; "Descartar todas" remove tudo de uma vez;
- `quadro_ver_regiao` da coluna inteira, lado a lado com a parte do mestre, sem diferença visível de estilo.
Registrar na `Nota:` o que ficou diferente e, se for limite do motor, dizer qual.
Nota (em andamento, 25/11): a missão é a do PDF do playtest; a coluna do mestre são as anotações dele até COMBATE. O teste real mostrou que o fluxo dele é **centrado num eixo** (x≈910, com pares lado a lado), não uma coluna à esquerda: `quadro_estilo` passou a detectar `centrado` e `quadro_inserir` ganhou `alinhar` (`cf33e5e`). A transcrição do PDF (p. 32–47, do "Rodada a rodada" da Cena 1 ao "O que de fato aconteceu") entrou em 3 chamadas, 53 itens, centrados no eixo do COMBATE, sem moldura e na fila do assistente; os estilos vêm por `estilo_como` dos itens do mestre (título `#it-420`, narração `#it-cb6`, regra `#it-6b2`, rótulo `#it-b1c`). Achados: (1) título longo quebra em duas linhas com a largura copiada (332 px): "A ENXURRADA" ficou com 136 px; os títulos longos seguintes receberam `largura`. Limite: o motor mede só a altura, não alarga o título para caber numa linha. (2) `quadro_ver_regiao` travava no app de desktop: o WebKit suspende o `requestAnimationFrame` com a janela escondida (`2aaba00`); falta confirmar no app depois de recarregar a aba. (3) Sem a ficha do aughisk no quadro: não há imagem dela na campanha (upload fica fora).

---

## Etapa D — Depois do teste real: legenda, trechos, 2D e imagens

O teste no Pântano (Q9i) produziu uma tira vertical de texto. O mestre organiza o Miro de outro jeito (prints de 25/11, quadros "Investigação – Delegacia", "Circo dos Psikolera", mapa do Deserto):
- **Legenda:** o quadro tem um "GUIA DE LEGENDA" à esquerda (seção própria). Cada linha é um rótulo em negrito com fundo colorido mais a descrição: `[PONTO DE INTERAÇÃO]` verde `rgb(77,255,165)`, `[NARRAÇÃO]` amarelo `rgb(255,246,182)` ("cores diversas"), `[SEGREDO]` escuro `rgb(26,26,26)` ou rosa `rgb(255,198,198)` (destaque), `[TESTE E DT]` azul `rgb(101,157,242)` (ou "condicional"), `[LOOT]` dourado `rgb(232,196,48)` (item ou documento), `[TRANSIÇÃO]` roxo `rgb(143,127,238)` (música ou cena da Jukebox, luz), `[EVENTO]` laranja `rgb(254,159,77)`, `[GANCHO]` magenta `rgb(255,25,100)`. Isso **não** está no código: `marcadores.ts` só conhece a sintaxe de texto (`[PERCEPÇÃO 13]`, `[LOOT]`…), e `PALETA_PADRAO` é a paleta da Mesa, que não é a do mestre. A importação do Miro não lê cores.
- **Trechos, não itens:** cada linha mistura papéis: `[TECNOLOGIA] [10]` em azul seguido do resultado em texto simples; `[LOOT] MUNIÇÃO DE PISTOLA`; uma frase de segredo destacada no meio da narração.
- **2D:** cada cena é um título com faixa colorida e, ao redor, os pontos de interação como **cartões** (imagem em cima, rótulo verde, linhas curtas), espalhados como na sala; fichas de NPC com a arte ao lado; mapas com caixas e linhas.
- **Imagens:** o PDF tem o mapa da ilhota, a arte das páginas e as ilustrações das criaturas (extraíveis com `pdfimages`; a ficha do Aughisk se recorta da página 45 com `pdftoppm`). A pasta de extras tem um handout por ponto de interesse (`HANDOUT ARBUSTO.jpg`…), tokens e mapas. O assistente não tinha como trazer nada disso: a Q9f deixou o upload de fora.

Fonte do teste: `~/Documents/RPG - Conteúdo/RPG - Conteúdo/Arquivos Secretos/Arquivos-Secretos-10/` (`O Pântano dos Afogados.pdf`, `A Caverna de Cruachan.pdf` e a pasta `Ordem-2-Playtest-Beta-Missão-1-Extras/` com Handouts, Tokens, Mapas e Músicas).

| Etapa | Fichas | Resultado |
|---|---|---|
| D — Estilo do mestre de verdade | Q9j–Q9p | Legenda lida do quadro, escrita por papel e por trecho, linhas e cartões, imagens de PDF e pastas locais, guia de transcrição e a aceitação refeita |

### Q9j — Legenda do quadro (puro + `quadro_estilo`)  ⬜
Objetivo: os papéis e as cores vêm da legenda do mestre, não de palpite.
Ler: `src/dominio/estilo-do-quadro.ts`, `src/dominio/estrutura-da-secao.ts` (`estiloDoDoc`, `marcasPredominantes` em `insercao-quadro.ts`), `src/dominio/marcadores.ts`, `src/dominio/secoes-do-quadro.ts`.
Arquivos: criar `src/dominio/legenda-do-quadro.ts` + teste; mudar `estilo-do-quadro.ts` e `ponte-quadros.ts`.
Como:
1. `legendaDoQuadro(itens) → Legenda | null`: acha a seção cujo título contém "LEGENDA" (sem acento/caixa). Cada linha dela com um rótulo entre colchetes destacado vira uma entrada `{ papel, rotulo, descricao, marcas, exemplo: #id }`: `marcas` são as do trecho do rótulo (fundo, letra, negrito). `papel` normalizado por nome: `ponto` (PONTO DE INTERAÇÃO), `narracao`, `segredo` (duas variantes: a primeira é `segredo`, a "(destaque)" é `segredo-destaque`), `teste` (TESTE E DT), `loot`, `transicao`, `evento`, `gancho`; rótulo desconhecido vira papel com o próprio nome em minúsculas. Itens de texto com várias linhas valem linha a linha.
2. `quadro_estilo` passa a mostrar a legenda no lugar dos palpites ("Legenda do mestre (GUIA DE LEGENDA): narração = fundo rgb(255,246,182) (…); teste = …"), com `#id` de exemplo. Sem legenda, mantém os palpites e diz "sem legenda no quadro; pergunte ao mestre o que cada cor significa antes de escrever".
3. A legenda sai de `estiloDoQuadro` como campo, para a Q9k.
Testes: a legenda real acima (10 itens, um rótulo por item, a descrição em texto simples depois); duas variantes de segredo; quadro sem legenda; rótulo desconhecido.
Commit: `board legend drives roles and colors`

### Q9k — Escrever por papel e por trecho (`quadro_inserir`)  ⬜
Objetivo: o assistente escreve como o mestre: linhas com trechos de papéis diferentes, cores da legenda.
Depende de: Q9j.
Ler: `src/dominio/insercao-quadro.ts` (`montarInsercao`, `marcasPredominantes`), a validação de doc em `quadro.ts`.
Como:
1. Parágrafo aceita `trechos: [{ texto, papel? , como? }]` além de `texto`/`como`. `papel` aplica as marcas do rótulo da legenda (fundo, letra, negrito). Exemplo: `{ trechos: [{ papel: "teste", texto: "[APTIDÃO (GUERRA) / OFÍCIO] [8]" }, { texto: " A balista é antiga, mas parece funcional." }] }`.
2. Parágrafo e item aceitam `papel` direto (o parágrafo inteiro com as marcas do papel).
3. `formato: "rotulo"`: item curto só com o trecho do papel (o `[ARBUSTO]` verde do ponto de interação), largura medida pelo texto (Q9n).
4. Sem legenda, `papel` dá erro legível ("o quadro não tem legenda; use como/estilo_como ou pergunte ao mestre").
Testes: trechos mistos numa linha; papel no parágrafo; rótulo; doc válido; sem legenda.
Commit: `assistant writes mixed role runs from the board legend`

### Q9l — Linhas e cartões (`quadro_inserir` em 2D)  ⬜
Objetivo: o que é paralelo na fonte fica lado a lado; pontos de interesse viram cartões.
Depende de: Q9e (eixo, `alinhar`), Q9f (imagens), Q9k.
Ler: `posicionarEmColuna`, `posicionarImagensAoLado` em `insercao-quadro.ts`.
Como:
1. `itens` aceita, além de itens, **grupos**: `{ linha: [celula, …], espaco? }` e `{ grade: [celula, …], colunas, espaco? }`. Uma `celula` é uma lista de itens empilhados (um cartão: imagem em cima, rótulo, linhas). Larguras: a de cada item, ou `largura_da_celula` do grupo.
2. A linha (ou cada fileira da grade) fica centrada no eixo (ou alinhada à esquerda, conforme `alinhar`), com as células alinhadas pelo topo; a altura do grupo é a da célula mais alta. A coluna continua abaixo do grupo.
3. Obstáculos, `abrir_espaco` e `caixa` consideram a largura total do grupo.
4. Limite por chamada: 40 itens no total, contando os de dentro dos grupos.
Testes: três regras lado a lado centradas; grade 3×2 de cartões com imagem; altura do grupo pela célula mais alta; obstáculo ao lado.
Commit: `quadro_inserir lays out rows and card grids`

### Q9m — Imagens de PDF e pastas locais  ⬜
Objetivo: o assistente traz o mapa, a arte, as fichas e os handouts do material de origem.
Ler: `Atlas/scripts/ponte/mcp.ts` e `servidor.ts` (onde a ponte roda em Node, com acesso a disco), `Mesa/scripts/launch-desktop.mjs` (quem hospeda `/__ponte` no app de desktop), `src/app/imagens-quadro.ts`, `banco-quadros.ts` (`guardarImagem`), o `retratoDaEntidade` da Q9f.
Como:
1. Ferramenta local do servidor MCP (Node) `arquivo_imagens(caminho)`: numa **pasta**, lista as imagens (nome, tamanho em px); num **PDF**, lista as imagens embutidas por página com `pdfimages -list` (descartando máscaras `smask`, imagens menores que 300 px e as que se repetem em muitas páginas, que são fundos de página), com o id `pdf:<caminho>#p=<pagina>&i=<num>`. Opcional `ver: id` devolve a miniatura (lado ≤ 768) para o assistente escolher.
2. `de` em `formato: "imagem"` aceita `arquivo:<caminho>`, `pdf:<caminho>#p=&i=` e `pdf:<caminho>#p=<pagina>&recorte=x,y,l,a` (frações da página, renderizada com `pdftoppm -r 150`; para fichas e tabelas). O servidor Node lê, converte em PNG/JPEG e entrega os bytes à aba (pela mensagem da ponte, ou por um endereço temporário do host da ponte, o que for mais simples); a aba guarda com `guardarImagem` (hash = id, sem duplicar).
3. Segurança: só caminhos dentro de raízes permitidas (padrão `~/Documents`, configurável por variável de ambiente), sem seguir links para fora delas. Erro legível fora disso. Só na ponte de desenvolvimento, como todo o resto.
4. Atualizar o catálogo base (ferramenta local nova + o esquema de `quadro_inserir`).
Testes: listagem de pasta; filtro de fundos repetidos e máscaras com uma saída de `pdfimages -list` gravada; recorte em frações; caminho fora da raiz recusado.
Commit (Atlas e Mesa): `assistant brings images from local pdfs and folders`

### Q9n — Título e rótulo que cabem numa linha  ⬜
Objetivo: "A ENXURRADA" não quebra em duas linhas.
Como: o contexto ganha `medirLarguraDoTexto` (pela mesma régua de `render-textos.ts`, entrando pelo `assistente-slot.ts`). `titulo` e `rotulo` sem `largura` explícita ficam com a largura do texto numa linha (mais o padding), com o máximo de 1,5 × a largura da coluna; acima disso, quebram.
Commit: `titles and labels fit on one line`

### Q9o — Guia: transcrever uma fonte  ⬜  *(Opus)*
Arquivo: `Atlas/docs/assistente/guia/quadros.md`.
Como: seção "Transcrever um material (PDF, extras)": (1) ler a **legenda** do quadro e as prints do mestre como referência de layout; (2) mapear a estrutura da fonte: caixa de narração → narração; tabela de perícias → uma linha por teste com o trecho `teste` (`[PERÍCIA] [DT]`) e o resultado em texto; itens/loot → `loot`; ponto de interesse → cartão (handout ou recorte em cima, rótulo `ponto`, linhas); boxes paralelos (regras da perseguição, fôlego, ações) → `linha`; criatura/NPC → ficha (recorte da página) ao lado do bloco; mapa → imagem com os cartões em volta; tabela-resumo de rodadas → linha por rodada; (3) procurar imagens na fonte e nos extras (`arquivo_imagens`) antes de escrever; (4) **antes de inserir, listar ao mestre o que não dá para reproduzir e perguntar**; (5) conferir com `quadro_ver_regiao` cena a cena, não só no fim.
Commit (Atlas): `board guide for transcribing source material`

### Q9p — Aceitação refeita no Pântano  ⬜  *(Opus)*
Como: descartar a transcrição da Q9i pela fila ("Descartar todas"), e refazer a partir da Cena 1 / Concluindo a cena, com a legenda, trechos, cartões dos pontos de interesse em volta do mapa da ilhota, handouts dos extras, ficha do Aughisk recortada, regras da perseguição em linha. Conferir cena a cena com `quadro_ver_regiao`. Depois, a mesma coisa com "A Caverna de Cruachan".
