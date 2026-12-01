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

### Q9a — Estrutura visual de uma seção (puro + `nivel: "estrutura"`)  ⬜
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
Commit: `board section structure view with styles and blocks`

### Q9b — Convenções visuais do quadro (puro + `quadro_estilo`)  ⬜
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
Commit: `board style summary tool for the assistant`

### Q9c — Ver uma região do quadro como imagem (`quadro_ver_regiao`)  ⬜  *(Opus: é render)*
Objetivo: o assistente confere visualmente o que leu e o que escreveu.
Ler: `src/ui/quadro/pixi/viewport-quadro.ts`, `render-itens.ts` (`GerenciadorItensPixi`), `cache-imagens-pixi.ts`; `quadro_imagem` em `src/app/ponte-quadros.ts` (formato de retorno).
Arquivos: criar `src/ui/quadro/pixi/captura-quadro.ts`; mudar `src/app/ponte-quadros.ts` (`ctx.capturar?(quadroId, caixa, lado)`) e o contexto da ponte.
Como: um `Application` Pixi fora da tela, com um `GerenciadorItensPixi` próprio, sincroniza os itens que tocam a caixa, espera as imagens carregarem (com prazo de 3 s) e exporta com `renderer.extract.base64` como JPEG 0,8, com lado maior ≤ `lado` (padrão 1024, máximo 1568). Depois destrói tudo. Funciona com o quadro aberto ou fechado. Argumentos: `quadro` e `secao` **ou** `itens: ["#id", …]` (a caixa envolvente + 40 px), mais `lado`. Os itens do assistente saem com a marca de proposto (Q9g) para o mestre e o assistente verem a diferença.
Testes: unitário só da escolha da caixa (por seção e por ids); conferir a imagem à mão pelo MCP no Pântano.
Commit: `assistant can view a board region as an image`

---

## Etapa B — Escrever no estilo

### Q9d — Montar itens com estilo copiado (puro)  ⬜
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
Commit: `build assistant items that copy the gm text style`

### Q9e — Posicionar em coluna e a ferramenta `quadro_inserir`  ⬜
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
Commit: `quadro_inserir continues the gm column in their style`

### Q9f — Setas e imagens em `quadro_inserir`  ⬜
Objetivo: o assistente liga blocos com setas e põe imagens ao lado do bloco, como o mestre faz.
Depende de: Q9e.
Ler: `novaSeta` e `novaImagem` em `src/dominio/quadro.ts`; `src/dominio/entidades.ts` (retrato e quem pode usá-lo); como `ContextoDeQuadros.imagem` acha o arquivo.
Arquivos: `src/dominio/insercao-quadro.ts`, `src/app/ponte-quadros.ts`, testes.
Como:
1. `setas: [{ de, para, rotulo? }]`, em que cada ponta é o índice (base 0) de um item criado nesta chamada ou o `#id` de um item existente. O estilo é copiado da seta mais comum do quadro (cor, cabeça, rota); sem nenhuma, `novaSeta` padrão. As setas também entram com `revisao` do assistente.
2. `formato: 'imagem'` com `de: "#id"` (uma imagem que já está no quadro, reaproveitando o `imagemId`) ou `de: "entidade:<nome ou id>"` (o retrato da entidade da campanha, se houver). Largura padrão: a mediana das imagens da seção (Q9b), na proporção original. `lado: 'direita' | 'esquerda'` põe a imagem ao lado do item de texto anterior, alinhada pelo topo, e ela não empurra a coluna. Sem `lado`, entra na coluna.
3. Upload de imagem nova fica **fora** (limite registrado): o assistente só reaproveita o que já existe na campanha.
Testes: seta entre um item novo e um existente; ponta inválida = erro legível; imagem à direita alinhada pelo topo; retrato de entidade sem arquivo = erro legível.
Commit: `quadro_inserir places arrows and campaign images`

### Q9g — Marca de proposto sem moldura  ⬜  *(Opus: visual)*
Objetivo: um item do assistente solto na coluna do mestre se distingue à primeira vista, sem mudar o layout.
Ler: `src/ui/quadro/Item.tsx` e `ItemMoldura.tsx` (`em-revisao-assistente`), `src/ui/quadro/pixi/render-itens.ts`, `estilo.css` (bloco `/* Propostas do assistente */`).
Como: primeiro conferir se o render Pixi atual desenha o contorno tracejado de `em-revisao-assistente` em itens de texto soltos. Se não, desenhar em `render-itens.ts` um contorno tracejado no `--acento`, por fora da caixa (sem mexer na largura ou na altura), e uma etiqueta pequena "✦" no canto superior direito, que some quando o item é aceito. A marca não sai na projeção aos jogadores (os itens em revisão já ficam fora dela). Ela sai na captura da Q9c.
Commit: `assistant items show a proposed mark without a frame`

---

## Etapa C — Guia e aceitação

### Q9h — Guia: montar ou transcrever material  ⬜
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
