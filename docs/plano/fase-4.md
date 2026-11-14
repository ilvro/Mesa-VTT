# Fase 4 — Quadro: o whiteboard da campanha

O mestre prepara tudo num whiteboard (hoje no Miro): blocos de texto para ler em voz alta, testes como `[PERCEPÇÃO 13]`, segredos, loot, falas de NPC, plantas desenhadas à mão, prints de fichas e setas ligando tudo. Esta fase traz esse quadro **para dentro da Mesa**, tão personalizável quanto o Miro. Ele também passa a **entender** o que está escrito e a se **ligar** ao resto da plataforma (fichas do Dossiê, handouts do Ateliê, mapas do Atlas, cenas do Jukebox).

As fichas foram escritas para um agente executor (**Gemini 4 Hydrogen**), uma por sessão, na ordem.

---

## Regras para o agente executor

1. **Leia antes de começar:** [`../../AGENTS.md`](../../AGENTS.md), a seção "Decisões fixas" e o "Modelo de dados" deste arquivo, e só então a ficha.
2. **Uma ficha por vez, na ordem.** Edite só os arquivos listados na ficha. Arquivos de teste novos sempre podem ser criados.
3. **Quando a ficha não bate com o código, pare e reporte:** o que a ficha pede, o que o código tem e duas saídas possíveis. Não invente arquitetura nem estique a ficha para caber.
4. **`src/dominio` é puro:** não importa UI, DOM, `app` nem IndexedDB. Toda regra (geometria, operações, marcadores, conversão do Miro) mora lá, com testes em `tests/unit/`. Os testes rodam com `node --test` direto no `.ts`: só sintaxe apagável (nada de `enum`, `namespace` nem parâmetros de propriedade em construtor).
5. **Para fechar a ficha:**
   - `npm run typecheck` e `npm test` passando em `Mesa/` (mais `npm run test:e2e` quando a ficha pedir; nas fichas do Atlas, `npm run typecheck && npm test` em `Atlas/`);
   - marcar a ficha ⬜ → ✅ e escrever uma linha `Nota:` com os desvios, se houve;
   - acrescentar uma linha no [`../../progress.md`](../../progress.md), numa seção "Fase 4 — Quadro";
   - sugerir a mensagem de commit. **Não commite.**
6. **Dependências novas:** só as que a ficha nomeia, com a **versão exata** fixada no `package.json` (sem `^`), como as que já estão lá.
7. **Interface:** CSS próprio em `src/ui/estilo.css`, com os tokens do tema (`--acento`, superfícies do tema Vigília). Nada de Tailwind. Toda ação da tela tem `data-testid`.
8. **`vendor/mesa-core/` nunca é editado à mão** (ver a ficha Q5a).

---

## Decisões fixas

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde mora | Uma tela nova da Mesa, **Quadros**, com rota `#/quadro/{id}`; os quadros pertencem a uma campanha, e uma campanha tem quantos quadros quiser | As entidades são da campanha; quadros diferentes (um por aventura ou arco) mostram as mesmas entidades sem copiar |
| Banco | IndexedDB **próprio** da Mesa: `mesa-quadros-v1`, separado de `mesa-campanha-v1` | O banco da campanha é o contrato comum; quadro, traço e imagem são dados só da Mesa. A transferência de aparelho já exporta todos os bancos |
| Desenho da tela | **DOM, não canvas/PixiJS.** Um contêiner "mundo" com `transform: translate() scale()`; cada item é um elemento posicionado em coordenadas do mundo; traços e setas são `<svg>` do tamanho da própria caixa | O conteúdo é quase todo texto rico, e no DOM ele fica nítido, selecionável e editável. Um SVG por item mantém a ordem de camadas (`z`) única para tudo |
| Texto rico | **TipTap v3** (ProseMirror), uma instância **só no item em edição**. Os outros itens são desenhados por um renderizador **puro e próprio** (`docParaHtml`), a partir do JSON do TipTap | Escrever um editor rico do zero é onde mais aparecem bugs. Instanciar centenas de editores travaria a tela |
| Desenho livre | `perfect-freehand` (MIT, sem dependências) gera o contorno, e a Mesa desenha o SVG | Traço com cara de caneta, com pouco código |
| Fontes | Todas locais (`@fontsource`), nada de Google Fonts | O app roda no desktop, sem internet garantida |
| Significado | O texto continua livre. Os **marcadores** (`[PERCEPÇÃO 13]`, `[LOOT]`, `[SINDRE]`…) são reconhecidos na hora de desenhar, e o item pode ter um **tipo semântico** (leitura, teste, segredo…) que define a cor padrão | O mestre já escreve assim. A Mesa padroniza sem obrigar a escrever diferente |
| Ligações | Um item do quadro tem Ref `mesa:mesa/item/<quadroId>/<itemId>`; o quadro tem `mesa:mesa/quadro/<id>`. Mencionar, ancorar a um lugar ou objeto etc. vira `ligacoes` no banco da campanha (`menciona`, `esta-em`) | Assim os outros aplicativos e a página da entidade enxergam essas ligações pelo contrato |
| Importar do Miro | Um **script local** (Node, com token pessoal do Miro) baixa o quadro para um arquivo; a Mesa importa esse arquivo e **tudo entra marcado para revisão**. Nenhuma entidade é criada sozinha | O mestre quer rever tudo. O vault do Obsidian **não** é fonte: está desatualizado e tem referências erradas |
| Desfazer | Histórico em memória por quadro (200 passos), com gestos contínuos agrupados num passo só, como no Atlas | Previsível |

**Fora desta fase:** colaboração em tempo real, vários aparelhos ao mesmo tempo, projeção do quadro para os jogadores e importação do Obsidian.

---

## Modelo de dados

`src/dominio/quadro.ts` (a Q1a cria este arquivo). Coordenadas em "pixels do mundo" (1 unidade = 1 px no zoom 1); `x`, `y` é o canto superior esquerdo; `rotacao` é em graus, em torno do centro.

```ts
export const VERSAO_QUADRO = 1;
export type Grade = 'nenhuma' | 'pontos' | 'linhas';

export interface Quadro {
  id: string; campanhaId: string; nome: string;
  fundo: { cor: string; grade: Grade; passo: number; encaixar: boolean };   // passo padrão 24; encaixar = snap na grade
  versao: 1; criadoEm: number; atualizadoEm: number;
}

export const TIPOS_SEMANTICOS = ['leitura', 'teste', 'segredo', 'loot', 'evento', 'fala', 'tarefa', 'rever', 'titulo'] as const;
export type TipoSemantico = (typeof TIPOS_SEMANTICOS)[number];

export type IdFonte = 'open-sans' | 'pt-serif' | 'hanken' | 'cinzel' | 'caveat' | 'jetbrains-mono';

export interface EstiloDeTexto {
  fonte: IdFonte; tamanho: number; cor: string;
  alinhamento: 'esquerda' | 'centro' | 'direita' | 'justificado';
  vertical: 'topo' | 'meio' | 'base';
}
export interface EstiloDeCaixa {
  fundo: string | null; opacidade: number;              // opacidade do fundo, 0..1
  borda: string | null; espessuraBorda: number; tracejado: 'solido' | 'tracejado' | 'pontilhado';
  raio: number; sombra: boolean; padding: number;
}

/** JSON do TipTap. Nós aceitos: doc, paragraph{textAlign}, heading{level 1..3}, bulletList, orderedList, listItem, hardBreak, text.
 *  Marcas aceitas: bold, italic, underline, strike, link{href}, textStyle{color, backgroundColor, fontFamily, fontSize}. */
export interface NoRico { type: string; attrs?: Record<string, unknown>; content?: NoRico[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }
export interface DocRico { type: 'doc'; content: NoRico[] }

export interface Revisao { tipoSugerido: TipoSemantico | null; motivos: string[]; origem: 'miro' }

interface Base {
  id: string; quadroId: string;
  x: number; y: number; largura: number; altura: number; rotacao: number;
  z: number;                       // maior = na frente; novo item = maior z + 1
  travado: boolean; soMestre: boolean;
  molduraId: string | null;        // a moldura em que o item está (calculado ao soltar)
  grupoId: string | null;
  revisao?: Revisao;               // presente = ainda não revisado (vindo da importação)
  feito?: { em: number; sessaoId: string | null };   // ✓ (Q6b)
  criadoEm: number; atualizadoEm: number;
}

export type Item =
  | Base & { tipo: 'texto'; doc: DocRico; texto: EstiloDeTexto; caixa: EstiloDeCaixa; alturaAuto: boolean; semantica: TipoSemantico | null }
  | Base & { tipo: 'forma'; forma: Forma; doc: DocRico; texto: EstiloDeTexto; caixa: EstiloDeCaixa; semantica: TipoSemantico | null }
  | Base & { tipo: 'imagem'; imagemId: string; larguraOriginal: number; alturaOriginal: number; caixa: EstiloDeCaixa }
  | Base & { tipo: 'traco'; ferramenta: 'caneta' | 'marca-texto'; pontos: [number, number, number][]; cor: string; espessura: number; opacidade: number }
  | Base & { tipo: 'seta'; de: Ponta; para: Ponta; rota: 'reta' | 'curva' | 'cotovelo'; cor: string; espessura: number;
             tracejado: 'solido' | 'tracejado' | 'pontilhado'; inicio: Cabeca; fim: Cabeca; rotulo: string }
  | Base & { tipo: 'moldura'; titulo: string; caixa: EstiloDeCaixa; aoFocar?: AoFocar }
  | Base & { tipo: 'ref'; ref: Ref; rotulo: string | null; aparencia: 'cartao' | 'icone' };

export type Forma = 'retangulo' | 'arredondado' | 'elipse' | 'losango' | 'triangulo' | 'paralelogramo' | 'hexagono' | 'estrela' | 'nuvem';
export type Ponta = { itemId: string; lado: 'auto' | 'cima' | 'baixo' | 'esquerda' | 'direita' } | { ponto: [number, number] };
export type Cabeca = 'nenhuma' | 'seta' | 'triangulo' | 'circulo' | 'losango';
export interface AoFocar { cena: Ref | null; fatos: Record<string, string | boolean> }   // Q6c
```

Observações:

- **Pontos relativos:** em `traco`, os `pontos` são relativos a `x`, `y`, e o terceiro número é a pressão (0..1).
- **Caixa derivada:** em `seta`, `x`, `y`, `largura` e `altura` são a caixa envolvente, recalculada sempre que uma ponta se move.
- **Cartão de entidade:** um item `ref` com `ref.app === 'mesa' && ref.tipo === 'entidade'` é desenhado como cartão da entidade (Q3c). Com qualquer outro Ref, é desenhado como cartão do aplicativo dono.

**Banco `mesa-quadros-v1`** (versão 1), aberto com `abrirBanco` do `#mesa`:

| Store | Chave | Índices | Conteúdo |
|---|---|---|---|
| `quadros` | `id` | `campanhaId` | `Quadro` |
| `itens` | `id` | `quadroId` | `Item` |
| `imagens` | `id` (SHA-256 do arquivo, em hex) | — | `{ id, blob: Blob, tipo: string, largura, altura, criadaEm }` |
| `ajustes` | `campanhaId` | — | `{ campanhaId, paleta: Record<TipoSemantico, string>, estado: EstadoDoMundo }` (Q3b, Q6a) |

---

## Ordem das etapas

| Etapa | Fichas | Resultado |
|---|---|---|
| A — Fundação | Q1a–Q1d | Criar quadro, mover e dar zoom, fundo e grade |
| B — Itens e edição | Q2a–Q2k | Tudo o que o Miro tem de essencial: texto rico, formas, imagens, setas, desenho, molduras, camadas |
| C — Significado | Q3a–Q3d | Marcadores, tipos e cores padronizados, entidades no quadro, busca |
| D — Importar do Miro | Q4a–Q4c | O quadro do Miro dentro da Mesa, com fila de revisão |
| E — Mapa e sessão | Q5a–Q5d | Objeto/região do Atlas ↔ quadro, painel Espiar, modo Seguir |
| F — Continuidade | Q6a–Q6d | Estado do mundo, ✓ que vira registro, molduras que agem, checagem antes da sessão |

---

## Etapa A — Fundação

### Q1a — Modelo do quadro, validação e operações com desfazer  ✅
Objetivo: os tipos do quadro e as operações puras (criar, alterar, remover, reordenar), com desfazer e refazer.
Depende de: —.
Ler: "Modelo de dados" acima; `src/dominio/notas.ts` (estilo do código puro); `vendor/mesa-core/refs.d.ts`.
Arquivos: criar `src/dominio/quadro.ts`, `src/dominio/quadro-operacoes.ts`, `tests/unit/quadro.test.ts`, `tests/unit/quadro-operacoes.test.ts`.
Como:
1. **Em `quadro.ts`:**
   - os tipos do modelo;
   - `validarQuadro(v): asserts v is Quadro` e `validarItem(v): asserts v is Item`. Os dois lançam `Error` com caminho (`itens[3].caixa.opacidade`) e recusam campos desconhecidos, como faz o `mesa-core`. O `doc` é validado contra a lista de nós e marcas aceitos; nó ou marca desconhecido é **removido** (não lança), para tolerar colagens;
   - as fábricas `novoQuadro(campanhaId, nome, agora, id)` e `novoTexto({ x, y, quadroId }, agora, id)`, e o mesmo para cada tipo, com padrões sensatos. Texto: Open Sans 16 px, cor `#e8efe9`, caixa transparente, `alturaAuto: true`. Nota adesiva (um `texto` com fundo): 240×240, fundo `#f7e48c`, texto `#1b1b1b`. Fundo do quadro `#101412`, grade `pontos`, passo 24;
   - `DOC_VAZIO`, `textoPuro(doc): string` (junta o texto com `\n` entre blocos) e `docDeTexto(s): DocRico`.
2. **Em `quadro-operacoes.ts`:**
   - `type Operacao = { criar: Item[] } | { alterar: { id: string; antes: Partial<Item>; depois: Partial<Item> }[] } | { remover: Item[] }`;
   - `interface Passo { rotulo: string; ops: Operacao[] }`;
   - `aplicar(itens: ReadonlyMap<string, Item>, passo): Map<string, Item>`, que é imutável e só troca os objetos alterados;
   - `inverter(passo): Passo`;
   - `class Historico { registrar(p); desfazer(): Passo | null; refazer(): Passo | null; limite = 200 }`, com `agrupar(chave)` para que passos seguidos com a mesma chave (um arrasto) virem um só;
   - os ajudantes `trazerParaFrente(ids)`, `levarParaTras(ids)`, `subirUm`, `descerUm` e `duplicar(itens, novoId, deslocamento)`. Todos devolvem `Passo`. Na duplicação, setas entre itens duplicados apontam para as cópias.
Não fazer: banco, tela, TipTap.
Testes: validação (casos bons, campo desconhecido, opacidade fora de 0..1, nó de doc desconhecido removido); `aplicar` + `inverter` voltam ao estado inicial em criar, alterar e remover; `Historico` com limite e agrupamento; z-order; `duplicar` religa as setas.
Pronto quando: os testes passam.
Commit: `added board data model and undoable operations`

### Q1b — Banco dos quadros e camada `app`  ✅
Objetivo: guardar e carregar quadros, itens e imagens, com gravação adiada e desfazer.
Depende de: Q1a.
Ler: `src/app/campanha.ts` (signals, `repositorio`, `atualizar`); `vendor/mesa-core/idb.d.ts`; `tests/unit/transferencia-app.test.ts` (uso do `fake-indexeddb`).
Arquivos: criar `src/app/banco-quadros.ts`, `src/app/quadros.ts`, `tests/unit/banco-quadros.test.ts`.
Como:
1. **`banco-quadros.ts`:**
   - `abrirBancoQuadros(idb?)` cria o banco e as stores do modelo de dados;
   - funções `listarQuadros(campanhaId)`, `salvarQuadro`, `removerQuadro(id)` (remove também os itens), `listarItens(quadroId)`, `gravarItens(salvar: Item[], remover: string[])` numa transação só, `guardarImagem(blob): Promise<{ id, largura, altura }>` (id = SHA-256 por `crypto.subtle.digest`; se já existe, não regrava) e `lerImagem(id)`;
   - `removerQuadrosDaCampanha(campanhaId)`. **Imagens órfãs não são apagadas nesta fase.**
2. **`quadros.ts`:**
   - os signals `quadros` (da campanha ativa), `quadroAberto: Quadro | null`, `itens: ReadonlyMap<string, Item>`, `selecao: ReadonlySet<string>` e `historico`;
   - `abrirQuadro(id)`, `criarQuadro(nome)`, `renomearQuadro`, `mudarFundo(parcial)`;
   - `executar(passo)`, que aplica, registra no histórico e marca como sujo; `desfazer()`; `refazer()`;
   - gravação adiada (400 ms) só dos ids sujos, descarregada em `pagehide` e `visibilitychange`;
   - na troca de campanha (observar `campanhaAtiva`), recarregar `quadros` e fechar o quadro aberto.
3. **Remover campanha:** em `src/app/campanha.ts`, na função que remove uma campanha, chamar `removerQuadrosDaCampanha`. É a única mudança nesse arquivo.
Não fazer: tela.
Testes: com `fake-indexeddb`, criar quadro → gravar itens → reabrir → mesmos itens; remover quadro remove itens; imagem igual não duplica; `removerQuadrosDaCampanha`.
Pronto quando: os testes passam e a transferência de aparelho (`bancosParaExportar`) inclui `mesa-quadros-v1`. Se não incluir, ajustar e anotar na `Nota:`.
Commit: `added board storage with debounced saving`

### Q1c — Tela Quadros, rota e manifesto  ✅
Nota: `src/app/o-que-vejo.ts` também recebeu a entrada `'quadros'` no `Record<Tela, string>` para manter o typecheck exaustivo.
Objetivo: aba "Quadros" no cabeçalho, com a lista dos quadros da campanha e o quadro aberto, ainda vazio, em tela cheia.
Depende de: Q1b.
Ler: `src/ui/App.tsx`, `src/ui/Cabecalho.tsx`, `src/app/rotas.ts`, `public/mesa.json`, `tests/e2e/hub.test.ts`, `tests/e2e/apoio.ts`.
Arquivos: criar `src/ui/quadro/Quadros.tsx` (lista) e `src/ui/quadro/Quadro.tsx` (casca do quadro); mudar `src/app/rotas.ts`, `src/ui/App.tsx`, `src/ui/Cabecalho.tsx`, `public/mesa.json` e `src/ui/estilo.css`; criar `tests/e2e/quadro.test.ts`.
Como:
1. **Rotas:** `Tela` ganha `'quadros'`. `#/quadro/{id}` abre o quadro; `#/quadro/{id}/item/{itemId}` abre o quadro e foca o item (o foco em si vem na Q1d; aqui só guardar `itemPendente`).
2. **Lista:** cartões dos quadros com nome e data; ações criar, renomear e remover (com confirmação). Sem campanha ativa, mostrar um aviso com um botão para escolher campanha.
3. **Quadro:** barra fina no topo com voltar, nome editável e zoom em %; a área do quadro ocupa o resto da tela.
4. **Manifesto:** em `mesa.json`, as `rotas` ganham `"quadro": "./#/quadro/{id}"` e `"item": "./#/quadro/{pai}/item/{filho}"`, e `oferece` ganha `"quadro"` e `"item"`.
Não fazer: câmera, itens.
Testes: e2e `quadro.test.ts`: criar campanha → aba Quadros → criar "Lysdal" → abre → voltar → aparece na lista → recarregar a página → continua lá.
Pronto quando: o e2e passa (`npm run test:e2e`).
Commit: `added boards screen and deep links`

### Q1d — Câmera, fundo e grade  ✅
Objetivo: navegar como no Miro (arrastar, zoom no cursor, de 2% a 400%) sobre um fundo personalizável.
Depende de: Q1c.
Ler: `src/ui/quadro/Quadro.tsx`.
Arquivos: criar `src/dominio/camera.ts`, `tests/unit/camera.test.ts`, `src/ui/quadro/Mundo.tsx` e `src/ui/quadro/PainelDoFundo.tsx`; mudar `src/ui/quadro/Quadro.tsx` e `src/ui/estilo.css`.
Como:
1. **`camera.ts` (puro):**
   - `interface Camera { x; y; zoom }`, onde (x, y) é o ponto do mundo no canto superior esquerdo da tela;
   - `telaParaMundo`, `mundoParaTela`;
   - `zoomEm(camera, pontoTela, fator, min = 0.02, max = 4)`, que mantém fixo o ponto sob o cursor;
   - `enquadrar(caixa, tamanhoTela, margem)`, para focar um item ou ver tudo;
   - `caixaVisivel(camera, tela)`;
   - `itensVisiveis(itens, caixa, margem)`, um filtro linear por interseção de caixas (com rotação, usar a caixa envolvente).
2. **`Mundo.tsx`:** um `div` com `transform: translate(-x*zoom px, -y*zoom px) scale(zoom)` e `transform-origin: 0 0`. Ele desenha só os itens visíveis; os itens ainda são retângulos de teste, os componentes de verdade vêm na Q2a.
3. **Entradas:**
   - roda com Ctrl, ou pinça do touchpad (`wheel` com `ctrlKey`): zoom no cursor;
   - roda sem Ctrl: zoom (padrão do Miro) ou rolagem, conforme a preferência "Roda do mouse" no painel do fundo. A preferência fica no localStorage `mesa:quadro:roda`;
   - arrastar com o botão do meio, com Espaço + botão esquerdo, ou com a ferramenta Mão: mover a câmera;
   - atalhos: `Shift+1` vê tudo, `Ctrl+0` volta a 100%, `Ctrl+=` e `Ctrl+-` aproximam e afastam.
4. **Grade:** desenhada no fundo da área com `background-image` (pontos com `radial-gradient`, linhas com `linear-gradient`), deslocada e escalada pela câmera. Abaixo de 6 px de passo na tela, a grade some.
5. **Painel do fundo** (botão na barra): cor do fundo (seletor + amostras), grade nenhuma/pontos/linhas, passo e "encaixar na grade". Grava no `Quadro`.
6. **Câmera salva por quadro:** no localStorage `mesa:quadro-camera:<id>`, uma conveniência deste aparelho.
7. **Item pendente:** o `itemPendente` da rota agora enquadra o item.
Não fazer: seleção de itens.
Testes: unitários de `zoomEm` (ponto fixo sob o cursor), `enquadrar`, `itensVisiveis`, limites de zoom.
Pronto quando: dá para navegar suave num quadro com 2000 retângulos de teste. Medir com um botão temporário só em desenvolvimento, removido no fim da ficha.
Commit: `added board camera with zoom, background and grid`

---

## Etapa B — Itens e edição

### Q2a — Seleção, mover, redimensionar e girar  ✅
Objetivo: a manipulação básica de qualquer item, com desfazer.
Depende de: Q1d.
Ler: `src/dominio/quadro-operacoes.ts`, `src/app/quadros.ts`.
Arquivos: criar `src/dominio/geometria.ts`, `tests/unit/geometria.test.ts`, `src/ui/quadro/Item.tsx`, `src/ui/quadro/Selecao.tsx` e `src/ui/quadro/BarraDeFerramentas.tsx`; mudar `Mundo.tsx`, `Quadro.tsx` e `estilo.css`.
Como:
1. **`geometria.ts` (puro):**
   - `caixaDe(item)` (com rotação);
   - `contemPonto(item, p)`;
   - `itensNoRetangulo(itens, ret, modo: 'tocar' | 'conter')`;
   - `redimensionar(caixa, alca, delta, { manterProporcao, doCentro })`, com 8 alças;
   - `girar(caixa, angulo, encaixe15: boolean)`;
   - `encaixarNaGrade(v, passo)`.
2. **`Item.tsx`:** escolhe o componente pelo `tipo` e é `memo` por identidade do objeto. Nesta ficha, `texto` mostra `textoPuro(doc)` e os outros tipos mostram um retângulo provisório.
3. **Barra de ferramentas** vertical à esquerda, como no Miro: Selecionar (V), Mão (H), Texto (T), Nota adesiva (N), Forma (S), Seta (L), Caneta (P), Marca-texto, Borracha (E), Imagem, Moldura (F) e Entidade. Nesta ficha funcionam só Selecionar, Mão, Texto e Nota; o resto fica desabilitado com a dica "em breve".
4. **Seleção:**
   - clique seleciona; Shift+clique soma ou tira;
   - arrastar no vazio faz um retângulo de seleção (só os itens que **tocam**; com Alt, só os **contidos**);
   - item travado: seleciona, mas não move.
5. **Mover e redimensionar:**
   - mover com o mouse; com Shift, só na horizontal ou só na vertical;
   - setas do teclado movem 1 px, ou 10 px com Shift;
   - alças de redimensionar (Shift mantém a proporção, Alt redimensiona a partir do centro) e alça de girar (Shift encaixa de 15° em 15°);
   - com "encaixar na grade" ligado, posições e tamanhos encaixam.
6. **Teclado:** Delete/Backspace remove, `Ctrl+D` duplica, `Ctrl+A` seleciona tudo, `Esc` limpa a seleção, `Ctrl+Z` desfaz, `Ctrl+Shift+Z` e `Ctrl+Y` refazem.
7. **Um passo por gesto:** cada gesto vira **um** passo no histórico (via `agrupar`).
8. **Criar:** com a ferramenta Texto ou Nota, um clique cria o item no ponto e já entra em edição. A edição aqui é um `textarea` provisório; a Q2b troca pelo TipTap.
Não fazer: texto rico, setas.
Testes: unitários de geometria (redimensionar em cada alça, proporção, rotação e caixa envolvente, retângulo tocar/conter); e2e: criar 2 notas, selecionar com o retângulo, mover, desfazer, refazer, recarregar e conferir as posições.
Pronto quando: os testes passam.
Commit: `added selection, move, resize and rotate on boards`

### Q2b — Texto rico com TipTap e renderizador puro  ✅
Nota: o modelo `Quadro`/`Item` também recebeu atualização em `Mundo.tsx` e `Quadro.tsx` para o novo retorno `(novoDoc, novaAltura)` do `EditorRico`.
Objetivo: editar texto com formatação dentro de textos e notas, e desenhar o texto parado sem editor.
Depende de: Q2a.
Ler: a documentação da versão instalada do TipTap v3 (`@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text-style`, que inclui `Color`, `BackgroundColor`, `FontFamily` e `FontSize`, e `@tiptap/extension-text-align`).
Arquivos: `package.json` (dependências acima, versão exata); criar `src/dominio/doc-rico.ts`, `tests/unit/doc-rico.test.ts` e `src/ui/quadro/EditorRico.tsx`; mudar `Item.tsx` e `estilo.css`.
Como:
1. **`doc-rico.ts` (puro):**
   - `docParaHtml(doc, opcoes?: { decorar?: (texto: string) => string | null })` gera HTML a partir de uma lista de permissões: escapa todo o texto, aceita só as cores `#rgb`, `#rrggbb`, `rgb()` e `rgba()`, tamanhos em px de 6 a 400, fontes do catálogo e links `http(s):` e `mesa:`;
   - o gancho `decorar` fica para a Q3b;
   - `normalizarDoc(doc)` remove o que não é aceito (reaproveitar a validação da Q1a).
2. **`EditorRico.tsx`:** monta o TipTap só quando o item entra em edição (duplo clique ou Enter com o item selecionado) e desmonta ao sair (Esc ou clique fora). Ao sair, grava o `doc` num passo só. Com `alturaAuto`, mede a altura do conteúdo e grava.
3. **`Item.tsx`:** o texto parado usa `dangerouslySetInnerHTML={{ __html: docParaHtml(doc) }}`, que é seguro porque o HTML é gerado pela lista de permissões. O estilo do item (`texto`, `caixa`) vira CSS do contêiner.
4. **Atalhos de edição:** `Ctrl+B`, `Ctrl+I`, `Ctrl+U` e `Ctrl+Shift+X` (tachado).
Não fazer: barra de formatação (Q2c).
Testes: `docParaHtml` escapa `<script>` e atributos `on*`; cor inválida, fonte desconhecida e `javascript:` são descartados; listas, títulos e alinhamento saem certos.
Pronto quando: editar uma nota com negrito e itálico, sair, recarregar e ver igual.
Commit: `added rich text editing with a pure static renderer`

### Q2c — Barra de formatação contextual  ✅
Nota: `EditorRico`, `Item`, `Mundo` e `Quadro` propagam `editorAtivo` para a barra controlar a seleção do TipTap em tempo real.
Objetivo: a personalização de texto e caixa do Miro, numa barra flutuante sobre a seleção.
Depende de: Q2b.
Arquivos: criar `src/ui/quadro/BarraDeFormatacao.tsx` e `src/ui/quadro/SeletorDeCor.tsx`; mudar `EditorRico.tsx`, `Quadro.tsx` e `estilo.css`.
Como:
1. **Posição:** a barra aparece acima da seleção, em tamanho fixo de tela (não escala com o zoom).
2. **Com itens de texto ou forma selecionados, sem edição:** a mudança vale para o **item inteiro**:
   - fonte, tamanho (lista 10–144 e campo livre), cor do texto, negrito e itálico;
   - alinhamento horizontal e vertical;
   - fundo e opacidade, borda (cor, espessura, tracejado), raio, sombra e padding.
   - Fonte, tamanho e cor mudam o `EstiloDeTexto`, e as marcas do doc têm precedência sobre ele. Negrito e itálico do item inteiro aplicam a marca no doc todo.
3. **Em edição:** a mesma barra age **na seleção do texto**:
   - negrito, itálico, sublinhado, tachado;
   - cor do texto e **fundo do texto** (`backgroundColor`);
   - fonte, tamanho e alinhamento do parágrafo;
   - lista com marcadores ou numerada, título H1–H3 e link.
4. **`SeletorDeCor`:**
   - amostras na ordem: tipos semânticos da paleta (Q3b; antes dela, as cores padrão), a paleta do Miro (amarelo, laranja, rosa, vermelho, verde, azul, roxo, cinza, preto, branco) e as 8 últimas usadas (localStorage);
   - campo hex, botão "sem cor" e conta-gotas (`EyeDropper`, quando existir).
5. **Ações gerais da barra:** trazer para frente ou levar para trás, travar ou destravar, "só mestre", duplicar e apagar.
6. **Várias seleções misturadas:** a barra mostra só o que é comum a todas.
Não fazer: tipos semânticos (Q3b).
Testes: e2e: selecionar 2 notas → mudar o fundo das duas → desfazer volta as duas; editar → selecionar uma palavra → fundo de texto amarelo → sair → o HTML tem `background-color`.
Pronto quando: os testes passam.
Commit: `added contextual formatting toolbar for boards`

### Q2d — Fontes locais  ✅
Nota: `Item.tsx` também passou a usar `familiaCss` de `src/dominio/fontes.ts`.
Objetivo: seis fontes disponíveis offline, com nome legível no seletor.
Depende de: Q2c.
Arquivos: `package.json` (`@fontsource/open-sans`, `@fontsource/pt-serif`, `@fontsource/caveat` e `@fontsource/jetbrains-mono`, versão exata; Hanken e Cinzel já existem); criar `src/dominio/fontes.ts`; mudar `src/main.tsx` (imports dos pesos 400 e 700, mais o itálico onde existir) e `BarraDeFormatacao.tsx`.
Como:
- `fontes.ts` exporta `FONTES: Record<IdFonte, { nome: string; familia: string; categoria: 'sem-serifa' | 'serifa' | 'decorativa' | 'manuscrita' | 'mono' }>`;
- `familiaCss(id)` dá o valor de `font-family`, com uma família genérica de reserva;
- no seletor de fonte, cada nome aparece desenhado na própria fonte.
Testes: unitário: todo `IdFonte` tem entrada em `FONTES`.
Pronto quando: o app de desktop sem internet mostra as seis fontes.
Commit: `added offline fonts for boards`

### Q2e — Formas  ✅
Nota: `Quadro.tsx` e `estilo.css` também receberam suporte à criação por arrasto/clique e edição de texto dentro de formas.
Objetivo: formas com texto dentro, como no Miro.
Depende de: Q2c.
Arquivos: criar `src/dominio/formas.ts`, `tests/unit/formas.test.ts` e `src/ui/quadro/ItemForma.tsx`; mudar `Item.tsx` e `BarraDeFerramentas.tsx` (habilitar Forma, com submenu das formas).
Como:
- **`formas.ts`:** `caminhoDaForma(forma, largura, altura, raio): string`, o `d` de SVG de cada `Forma`. O contorno da caixa é o próprio SVG (fundo, borda e tracejado), e o texto rico vai por cima, centralizado na área útil;
- **área útil:** `areaUtil(forma, caixa)` dá o retângulo interno onde o texto cabe (no losango, metade da largura etc.).
- **Criar:** com a ferramenta Forma, arrastar desenha no tamanho arrastado; um clique simples cria 160×100.
Testes: `caminhoDaForma` de cada forma começa com `M` e fecha com `Z`; `areaUtil` fica dentro da caixa.
Pronto quando: as 9 formas aparecem, com texto e estilos.
Commit: `added shapes with text to boards`

### Q2f — Imagens  ✅
Nota: `src/app/quadros.ts`, `src/ui/estilo.css` e `tests/e2e/quadro.test.ts` também receberam suporte à revogação de URLs ao fechar o quadro, estilos de `.item-imagem` e teste e2e de colagem.
Objetivo: colar e arrastar imagens para o quadro, como no Miro.
Depende de: Q2a, Q1b.
Arquivos: criar `src/app/imagens-quadro.ts` e `src/ui/quadro/ItemImagem.tsx`; mudar `Quadro.tsx`, `Item.tsx` e `BarraDeFerramentas.tsx` (Imagem abre o seletor de arquivo).
Como:
1. **Entrada:** colar (`paste` com arquivo de imagem), soltar arquivo no quadro ou usar o seletor. Grava pelo `guardarImagem` e cria o item centralizado no ponto, com até 600 px de largura e a proporção original.
2. **`imagens-quadro.ts`:** cache de `URL.createObjectURL` por `imagemId`, revogado ao fechar o quadro.
3. **`ItemImagem`:** `<img loading="lazy" decoding="async" draggable={false}>`. Redimensionar mantém a proporção por padrão (Shift solta). Borda e raio vêm da `caixa`.
4. **Imagens grandes:** acima de 4096 px no lado maior, reduzir para 4096 antes de guardar (`createImageBitmap` + `OffscreenCanvas`, salvo em WebP com qualidade 0,9). Formatos aceitos: png, jpeg, webp e gif (o gif não é reduzido).
Testes: e2e: colar uma imagem (pela área de transferência do Playwright) → aparece → recarregar → continua.
Pronto quando: os testes passam.
Commit: `added pasted and dropped images on boards`

### Q2g — Setas e conectores  ✅
Nota: `src/ui/quadro/Mundo.tsx`, `src/ui/quadro/Selecao.tsx`, `src/ui/quadro/Quadro.tsx` e `src/ui/estilo.css` também receberam suporte a conectores, pontas arrastáveis e edição de rótulo.
Objetivo: setas ligadas a itens, que acompanham quando os itens se movem, com o estilo do Miro.
Depende de: Q2e.
Arquivos: criar `src/dominio/setas.ts`, `tests/unit/setas.test.ts` e `src/ui/quadro/ItemSeta.tsx`; mudar `Item.tsx`, `BarraDeFerramentas.tsx`, `BarraDeFormatacao.tsx` e `src/app/quadros.ts` (ao mover itens, recalcular as setas ligadas no mesmo passo).
Como:
1. **`setas.ts` (puro):**
   - `pontoDaPonta(ponta, itens)`: em `lado: 'auto'`, o meio do lado da caixa mais voltado para a outra ponta;
   - `caminhoDaSeta(seta, itens): { d: string; meio: [x, y]; angInicio; angFim }`: reta, curva (cúbica com tangentes saindo perpendiculares aos lados) ou cotovelo (ortogonal, no máximo 3 segmentos);
   - `caixaDaSeta`;
   - `setasLigadasA(ids, itens)`.
2. **Ferramenta Seta:**
   - arrastar de um item a outro liga os dois; soltar no vazio deixa a ponta livre;
   - passar o mouse por um item selecionado mostra 4 bolinhas nos lados; arrastar de uma bolinha cria uma seta ligada.
3. **Seta selecionada:** as pontas podem ser arrastadas para religar ou soltar; o duplo clique no meio edita o rótulo, que é texto simples com fundo da cor do quadro.
4. **Barra de formatação para setas:** cor, espessura (1–12), tracejado, rota, cabeça no início e no fim, e inverter o sentido.
5. **Apagar um item** solta as pontas ligadas a ele: a ponta vira `{ ponto }` na última posição. Isso entra no mesmo passo do histórico.
Testes: as três rotas; `lado: 'auto'` escolhe o lado certo; mover um item atualiza `caixaDaSeta`; apagar o item solta a ponta.
Pronto quando: ligar dois cartões, mover um e a seta acompanhar; desfazer volta tudo.
Commit: `added connectors that follow linked items`

### Q2h — Desenho livre: caneta, marca-texto e borracha  ✅
Nota: `src/ui/quadro/Item.tsx`, `src/ui/quadro/Mundo.tsx`, `src/ui/quadro/BarraDeFormatacao.tsx` e `src/ui/estilo.css` também receberam suporte à renderização, prévia e edição de traços.
Objetivo: rabiscar no quadro como no Miro.
Depende de: Q2a.
Arquivos: `package.json` (`perfect-freehand`, versão exata); criar `src/dominio/tracos.ts`, `tests/unit/tracos.test.ts` e `src/ui/quadro/ItemTraco.tsx`; mudar `BarraDeFerramentas.tsx` (ferramentas com um mini-painel de cor e espessura, guardado no localStorage) e `Quadro.tsx`.
Como:
1. **`tracos.ts` (puro):**
   - `simplificar(pontos, tolerancia)` (Ramer–Douglas–Peucker);
   - `normalizarTraco(pontosAbsolutos) → { x, y, largura, altura, pontos relativos }`;
   - `caminhoDoTraco(traco)`, que usa `getStroke` do perfect-freehand e devolve o `d`. A caneta tem afinamento pela pressão; o marca-texto tem ponta chata, `opacidade` 0,35 e espessura grande;
   - `tracoToca(traco, ponto, raio)`, o teste de toque da borracha.
2. **Desenhar:** um traço por gesto (`pointerdown` → `pointerup`), usando `pointerEvent.pressure` (0,5 quando o dispositivo não informa). Enquanto desenha, mostra a prévia num SVG por cima; ao soltar, cria o item.
3. **Borracha:** apaga **traços inteiros** que ela toca, como no Miro, num passo só por gesto. Só age em traços.
4. **Traço selecionado:** move, redimensiona escalando os pontos e muda cor e espessura.
Testes: `normalizarTraco` (caixa e relativos), `simplificar` reduz pontos e mantém as pontas, `tracoToca`.
Pronto quando: desenhar uma trilha à mão, apagar parte com a borracha, desfazer.
Commit: `added freehand pen, highlighter and eraser to boards`

### Q2i — Molduras (seções) e navegador  ✅
Nota: `src/ui/quadro/Item.tsx`, `src/ui/quadro/Mundo.tsx` e `src/ui/estilo.css` também receberam suporte à ordenação de molduras no fundo e edição de título.
Objetivo: seções nomeadas que agrupam itens, como os frames do Miro, e um painel para pular entre elas.
Depende de: Q2a.
Arquivos: criar `src/dominio/molduras.ts`, `tests/unit/molduras.test.ts`, `src/ui/quadro/ItemMoldura.tsx` e `src/ui/quadro/Navegador.tsx`; mudar `src/app/quadros.ts` (calcular `molduraId` ao soltar; mover a moldura move os filhos), `BarraDeFerramentas.tsx` e `Quadro.tsx`.
Como:
1. **`molduras.ts` (puro):**
   - `molduraQueContem(item, molduras)`: a menor moldura que contém o **centro** do item;
   - `filhos(molduraId, itens)`;
   - `ordemDeLeitura(molduras)`: de cima para baixo e da esquerda para a direita, com tolerância de linha de 1/3 da altura.
2. **Moldura:** sempre desenhada atrás dos itens. O título fica acima da borda, em **tamanho fixo de tela** (legível mesmo a 3%, como no Miro); duplo clique no título edita.
3. **Navegador** (painel recolhível à direita): lista as molduras em `ordemDeLeitura`, com busca. Clicar enquadra a moldura. Teclas `PageDown` e `PageUp` vão para a próxima e a anterior.
4. **Ref da moldura:** "Copiar link" no menu da moldura copia `mesa:mesa/item/<quadroId>/<id>`.
Testes: `molduraQueContem` com molduras aninhadas; `ordemDeLeitura`.
Pronto quando: criar 3 molduras com itens, mover uma e os filhos irem junto, pular entre elas pelo navegador.
Commit: `added frames and a frame navigator to boards`

### Q2j — Organização: alinhar, agrupar, guias, área de transferência e menu  ✅
Nota: `src/ui/quadro/Mundo.tsx` e `src/ui/estilo.css` também receberam renderização de linhas guia e estilos do menu de contexto.
Objetivo: o acabamento de organização que faz o quadro parecer o Miro.
Depende de: Q2g, Q2i.
Arquivos: criar `src/dominio/alinhamento.ts`, `tests/unit/alinhamento.test.ts`, `src/dominio/area-de-transferencia.ts`, `tests/unit/area-de-transferencia.test.ts` e `src/ui/quadro/MenuDoItem.tsx`; mudar `Quadro.tsx`, `src/app/quadros.ts` e `BarraDeFormatacao.tsx`.
Como:
1. **`alinhamento.ts`:**
   - `alinhar(itens, 'esquerda' | 'centro-h' | 'direita' | 'topo' | 'centro-v' | 'base')`;
   - `distribuir(itens, 'h' | 'v')`;
   - `guias(movendo: Caixa, outros: Caixa[], tolerancia)`, que devolve o ajuste e as linhas de guia (bordas e centros alinhados), desenhadas enquanto se arrasta. Alt desliga as guias.
2. **Grupos:** `Ctrl+G` agrupa e `Ctrl+Shift+G` desagrupa (`grupoId`). Um clique seleciona o grupo; um duplo clique entra no grupo.
3. **`area-de-transferencia.ts`:**
   - `copiar(itens): string`, com prefixo `mesa-quadro:1:` + JSON;
   - `colar(texto, novoId, destino): Item[] | null`, com ids novos, setas religadas, deslocamento e imagens referenciadas pelo id.
   - **Ao colar texto do sistema:**
     - prefixo `mesa-quadro:` → itens;
     - texto que é um Ref (`mesa:…`) → item `ref` (Q3c; até lá, um texto com o link);
     - qualquer outro texto → item `texto`.
   - Os atalhos `Ctrl+C`, `Ctrl+X` e `Ctrl+V` funcionam entre quadros e entre abas.
4. **Menu do item** (botão direito): copiar, colar, duplicar, frente/trás, travar, agrupar, alinhar, "só mestre", copiar link e apagar.
Testes: alinhar e distribuir; guias encontram bordas e centros; copiar → colar dá ids novos e mantém setas e grupo.
Pronto quando: os testes passam.
Commit: `added align, group, guides and clipboard to boards`

### Q2k — Minimapa, nível de detalhe e desempenho  ✅
Nota: no teste e2e com 3000 itens (`tests/e2e/quadro-desempenho.test.ts`), o tempo por quadro ao ver tudo e dar zoom 10 vezes ficou em `max=30.9ms`, `media=16.3ms` (30 quadros medidos), abaixo do limite de 50 ms; `ItemForma.tsx` e `Quadro.tsx` também receberam loteamento via `requestAnimationFrame` e camada canvas de LOD quando há mais de 200 itens visíveis abaixo de 25% de zoom.
Objetivo: um quadro do tamanho dos do Miro (milhares de itens) continua fluido.
Depende de: Q2i.
Arquivos: criar `src/ui/quadro/Minimapa.tsx` e `tests/e2e/quadro-desempenho.test.ts`; mudar `Mundo.tsx`, `Item.tsx` e `estilo.css`.
Como:
1. **Nível de detalhe:** abaixo de 25% de zoom, `texto` e `forma` desenham só a caixa com o fundo e linhas cinza no lugar do texto (sem HTML rico). Imagens usam `content-visibility`. Os títulos das molduras continuam legíveis.
2. **Minimapa** (canto inferior direito, recolhível): um `<canvas>` 2D com as caixas coloridas dos itens e o retângulo da câmera. Clicar ou arrastar move a câmera. Redesenha com no máximo 4 quadros por segundo.
3. **Atualização em lote:** ao mover muitos itens, atualizar o signal uma vez por quadro de animação (`requestAnimationFrame`).
Testes: e2e com um quadro gerado de 3000 itens (textos com 200 caracteres, 30 imagens pequenas, 200 setas): ver tudo, aproximar e afastar 10 vezes; nenhum quadro passa de 50 ms (medir com `performance.now` na página). Anotar os números na `Nota:`.
Pronto quando: o e2e passa.
Commit: `added minimap and level of detail for large boards`

---

## Etapa C — Significado

### Q3a — Marcadores  ✅
Objetivo: reconhecer no texto a sintaxe que o mestre já usa.
Depende de: Q1a.
Ler: `src/dominio/notas.ts` (`analisarNota`, que o parser deve **reaproveitar** para `[[ligações]]`).
Arquivos: criar `src/dominio/marcadores.ts` e `tests/unit/marcadores.test.ts`.
Como: `analisarMarcadores(texto): Trecho[]` devolve texto, `ligacao` (de `notas.ts`) e `marcador`. Os marcadores são colchetes simples:

| Escrito | Vira |
|---|---|
| `[PERCEPÇÃO 13]`, `[INVESTIGAÇÃO/SOBREVIVÊNCIA 13]`, `[APTIDÃO - ATUALIDADES 8]`, `[INTUIÇÃO 6 - se quiserem arrombar]`, `[PERCEPÇÃO 15 (só antes de limparem)]`, `[ARROMBAR DT 7, PA 10]` | `{ tipo: 'teste', pericias: string[], dificuldade: number, nota?: string, condicao?: string }`. Regra: uma ou mais palavras em maiúsculas (perícias separadas por `/`, `-` ou `,`), seguidas de um número (com `DT` opcional); o resto vira `nota` |
| `... se:poeira]`, `se:!poeira`, `se:chave=Naira` no fim de qualquer marcador | `condicao` (usada na Q6a) |
| `[LOOT]`, `[LOOT] HANDOUT 07` | `{ tipo: 'loot' }`; o texto que segue na linha é o rótulo |
| `[EVENTO]`, `[TAREFA]`, `Tarefa:` no início da linha, `[REVER]` | `evento`, `tarefa` e `rever` |
| `[MÚSICA Bar – Festa]` | `{ tipo: 'musica', nome }` |
| `[DATA 1858]`, `[DATA 1785-04]` | `{ tipo: 'data', valor }` |
| `[SEGREDO]` | `segredo` |
| `[SINDRE]`, `[KARL PARA OLE]`, `[TEODOR]` (maiúsculas, sem número, que não é palavra reservada) | `{ tipo: 'fala', quem: string, para?: string }` |
| `[DESAFIO DE ACESSO - CADEADO]` e outros em maiúsculas sem número | `{ tipo: 'rotulo', texto }`; só vira `fala` quando o nome existe como entidade (resolvido na Q3c) |

Casos de borda: colchete com quebra de linha não é marcador; `[1]` e `[x]` são texto comum; `[[...]]` continua sendo ligação. Acentos e cedilha contam como maiúsculas.
Testes: uma tabela com **todos os exemplos acima**, tirados dos quadros reais do mestre, mais os casos de borda.
Pronto quando: os testes passam.
Commit: `added marker parser for board text`

### Q3b — Tipos semânticos, paleta e chips  ✅
Objetivo: padronizar cores. Cada tipo tem uma cor da campanha, e os marcadores aparecem como chips.
Depende de: Q3a, Q2c.
Arquivos: criar `src/dominio/paleta.ts`, `tests/unit/paleta.test.ts` e `src/ui/quadro/PainelDaPaleta.tsx`; mudar `src/app/banco-quadros.ts` (store `ajustes`), `src/app/quadros.ts`, `src/dominio/doc-rico.ts` (gancho `decorar`), `Item.tsx`, `BarraDeFormatacao.tsx` e `estilo.css`.
Como:
1. **`PALETA_PADRAO`**, tirada dos quadros do mestre:

   | Tipo | Cor |
   |---|---|
   | leitura | `#f7e48c` (amarelo) |
   | teste | `#7aa7f0` (azul) |
   | segredo | `#f2a7b8` (rosa) |
   | loot | `#f0a35e` (laranja) |
   | evento | `#f0a35e` (laranja) |
   | fala | `#8fe3b0` (verde) |
   | tarefa | `#f0a35e` (laranja) |
   | rever | `#ffd84d` (amarelo forte) |
   | titulo | `#5fe3a1` (verde) |

   Cada tipo tem também `corDoTexto` calculada por contraste (preto ou branco, por luminância).
2. **`paleta.ts`:** `tipoMaisProximo(cor, paleta, limite)` é usado pela importação (Q4b).
3. **Tipo do item:** a barra de formatação ganha o seletor "Tipo" (nenhum + os 9). Escolher um tipo aplica o fundo da paleta e grava `semantica`. Mudar a cor da paleta muda todos os itens daquele tipo **que não tiveram o fundo trocado à mão**: guardar `caixa.fundo = null` + `semantica`, e o fundo efetivo vem da paleta.
4. **Chips:** `decorar` envolve cada marcador num `<span class="chip-marcador chip-<tipo>">`. Teste mostra a dificuldade em destaque; condição aparece em itálico.
5. **Painel da paleta** (botão na barra do quadro): editar a cor de cada tipo, por campanha, gravado em `ajustes`.
Testes: contraste; `tipoMaisProximo`; `docParaHtml` com `decorar` gera chips sem quebrar o escape.
Pronto quando: mudar a cor de "teste" na paleta muda todos os cartões de teste.
Commit: `added semantic block types and campaign palette`

### Q3c — Entidades e ligações no quadro  ✅
Objetivo: NPCs, lugares e criaturas da campanha aparecem no quadro como cartões vivos, e as menções viram ligações.
Depende de: Q3b, Q2j.
Ler: `src/dominio/notas.ts` (`resolver`, `refsMencionados`, `autocompletarEm`, `sugerirEntidades`), `src/ui/EditorDeNota.tsx`, `src/ui/Entidades.tsx` (página da entidade), `src/app/barramento.ts` (`abrirNoApp`).
Arquivos: criar `src/ui/quadro/ItemRef.tsx` e `src/app/ligacoes-quadro.ts`; mudar `EditorRico.tsx`, `Item.tsx`, `BarraDeFerramentas.tsx` (ferramenta Entidade: busca e coloca o cartão) e `src/ui/Entidades.tsx` (seção "Nos quadros").
Como:
1. **`ItemRef`:**
   - com uma entidade: retrato (se houver), nome, tipo, tags e o começo das `notas` com `[[ligações]]` e marcadores desenhados;
   - "Abrir" vai para a página da entidade; "Abrir no app" usa `abrirNoApp(ref)` com o primeiro Ref do app dono (por exemplo, a ficha no Dossiê);
   - com Ref de outro app: ícone do app, nome (a entidade que tem esse Ref, ou o próprio Ref) e "Abrir no app".
2. **No `EditorRico`:** digitar `[[` abre o autocompletar de entidades (reaproveitar `autocompletarEm` e `sugerirEntidades`). No texto parado, a ligação vira um link clicável que abre a entidade.
3. **`ligacoes-quadro.ts`:** ao sair da edição de um item, sincronizar as `ligacoes` do tipo `menciona` com `de = mesa:mesa/item/<quadroId>/<itemId>` (criar as novas, remover as que sumiram), pelo `repositorio`. Fazer o mesmo para os itens `ref` (`menciona` → o Ref). Ao apagar um item, remover as ligações dele.
4. **Falas:** `[SINDRE]` vira `fala` quando o nome resolve para entidade (`entidadePorNome`); clicar no chip abre a entidade.
5. **Página da entidade:** ganha a seção "Nos quadros", com as ligações cujo `para` é a entidade (ou um Ref dela) e cujo `de` é um item de quadro. Cada linha mostra o quadro e a moldura, e o clique leva a `#/quadro/<id>/item/<itemId>`.
Não fazer: criar entidades automaticamente.
Testes: unitário da diferença de ligações (puro: `diferencaDeLigacoes(antes, depois)` em `src/dominio/`); e2e: entidade "Sindre" → no quadro, escrever `[[Sindre]]` → a página da Sindre lista o quadro → o clique volta ao item.
Pronto quando: os testes passam.
Commit: `added entity cards and backlinks between boards and entities`

### Q3d — Busca e filtros no quadro  ✅
Objetivo: achar coisas num quadro enorme e ver um tipo por vez.
Depende de: Q3c.
Arquivos: criar `src/dominio/busca-quadro.ts`, `tests/unit/busca-quadro.test.ts` e `src/ui/quadro/BuscaNoQuadro.tsx`; mudar `Quadro.tsx` e `Mundo.tsx`.
Como:
- **Busca** (`Ctrl+F`): texto sem acento em textos, formas, títulos de moldura e rótulos de seta. Resultados em lista; Enter e Shift+Enter percorrem e enquadram o resultado.
- **Filtros** (chips na barra): mostrar só itens dos tipos marcados, com os outros a 15% de opacidade. Um atalho "esconder segredos" deixa `segredo` e `soMestre` invisíveis.
- **Busca global:** a `BuscaRapida` (`Ctrl+K`) passa a incluir quadros e molduras pelo nome.
Testes: unitário da busca (acentos, ordem de leitura).
Pronto quando: os testes passam.
Commit: `added search and type filters to boards`

---

## Etapa D — Importar do Miro, com revisão

### Q4a — Script que baixa um quadro do Miro  ✅
Objetivo: tirar um quadro do Miro para um arquivo local, sem credenciais dentro do app.
Depende de: —. Pode ser feita a qualquer momento.
Ler: a documentação da API REST v2 do Miro (`GET /v2/boards/{id}`, `GET /v2/boards/{id}/items` com `cursor`, `GET /v2/boards/{id}/connectors`, e os recursos de imagem).
Arquivos: criar `scripts/miro-baixar.mjs` e `docs/miro.md` (como gerar o token: criar um app em developers.miro.com com `boards:read`, instalar no time e copiar o token); mudar `package.json` (`"miro:baixar": "node scripts/miro-baixar.mjs"`) e `.gitignore` (`*.miro.zip`).
Como:
1. **Uso:** `MIRO_TOKEN=... npm run miro:baixar -- <url-ou-id-do-quadro> [--saida arquivo] [--so-contar]`. O id sai da URL (`/app/board/<id>/`).
2. **Download:**
   - pagina todos os itens e conectores (limite 50 por página), com nova tentativa e espera em respostas 429 ou 5xx;
   - para itens `image`, baixa o binário pelo `data.imageUrl` com o token; a resposta traz a URL final, e o script segue até o arquivo;
   - gera um zip com `fflate`: `quadro.json` (`{ formato: 'miro-bruto', versao: 1, baixadoEm, board, items, connectors }`, tudo cru) + `imagens/<itemId>.<ext>`.
3. **`--so-contar`:** imprime quantos itens há por `type` e termina. É a sondagem: rodar num quadro real e anotar na `Nota:` os tipos que vieram. **Desenhos à mão podem não vir pela API.** Se não vierem, registrar isso e seguir; o mestre decide depois (exportar o quadro como imagem e colar no lugar, por exemplo).
4. **Token:** nunca vai para log, arquivo ou mensagem de erro.
Testes: unitário só da extração do id da URL (puro, exportado do script). Validação manual em um quadro real (o mestre roda).
Pronto quando: o script gera o `.miro.zip` de um quadro real.
Commit: `added script to download a miro board for import`

### Q4b — Conversor Miro → Quadro (puro)  ✅
Objetivo: transformar o arquivo cru em itens do quadro, sugerindo o tipo de cada um.
Depende de: Q4a, Q3b, Q2g, Q2i.
Arquivos: criar `src/dominio/miro.ts`, `src/dominio/html-miro.ts` e `tests/unit/miro.test.ts` (com fixtures pequenas em `tests/unit/fixtures/miro/`, escritas à mão no formato da API e **sem dados reais do mestre**).
Como:
1. **`html-miro.ts`:** um tokenizador **tolerante** do subconjunto de HTML que o Miro usa (`p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `a[href]`, `ul`, `ol`, `li` e `span[style]` com `color`, `background-color`, `font-size`, `font-family`) → `DocRico`. Entidades HTML (`&amp;`, `&nbsp;`, `&#...;`) são decodificadas; tags desconhecidas são ignoradas, mas o texto delas fica. Não usar `DOMParser` (o código é puro e roda no Node).
2. **`miro.ts`:** `converterMiro(bruto, { quadroId, agora, novoId, paleta }) → { itens: Item[]; imagens: { itemId, arquivo }[]; relatorio: { porTipo, ignorados: { tipo, quantos }[] } }`:
   - **posição:** o Miro usa o centro e posições relativas à moldura-pai (`parent`). Converter para canto superior esquerdo absoluto;
   - **`text`:** cor, tamanho, fonte, `fillColor` (fundo), alinhamento. A altura vem estimada por linhas, com `alturaAuto`;
   - **`sticky_note`:** cores nomeadas do Miro → hex (tabela `CORES_DE_NOTA_DO_MIRO`);
   - **`shape`:** `data.shape` → `Forma` (o que não tiver equivalente vira `retangulo`), com fundo, borda, espessura e tracejado;
   - **`frame`:** vira `moldura`;
   - **`image`:** vira `imagem`, com o arquivo do zip;
   - **`card`, `app_card`:** viram `texto` com título em negrito + descrição;
   - **`document`, `embed`:** viram `texto` com o link;
   - **`connector`:** vira `seta` (`straight`/`curved`/`elbowed` → `reta`/`curva`/`cotovelo`; `stroke*` → estilo; caps → cabeças; `captions` → rótulo; pontas ligadas pelos ids convertidos);
   - **fontes do Miro** → `IdFonte` (serifadas → `pt-serif`; mono → `jetbrains-mono`; manuscritas como `caveat` e `permanent_marker` → `caveat`; o resto → `open-sans`);
   - **revisão:** **todo** item ganha `revisao`. O `tipoSugerido` vem, nesta ordem:
     1. de marcadores no texto (`[PERCEPÇÃO 13]` → teste);
     2. da cor de fundo dominante (o fundo de texto que cobre mais caracteres, ou o fundo do item) por `tipoMaisProximo` na paleta;
     3. senão, `null`.
     Os `motivos` explicam em português ("fundo azul, perto de 'teste'").
Testes: fixtures de cada tipo; posições relativas à moldura; conector ligado; HTML com spans aninhados e entidades; sugestão por marcador vence a sugestão por cor.
Pronto quando: os testes passam.
Commit: `added miro board converter with type suggestions`

### Q4c — Importar na Mesa e fila de revisão  ✅
Objetivo: abrir o `.miro.zip` como um quadro novo e rever item por item.
Depende de: Q4b.
Arquivos: criar `src/app/importar-miro.ts` e `src/ui/quadro/FilaDeRevisao.tsx`; mudar `src/ui/quadro/Quadros.tsx` (botão "Importar do Miro…") e `Quadro.tsx`.
Como:
1. **Importar:** ler o zip (`fflate`), guardar as imagens (`guardarImagem`), converter e gravar um quadro novo, "<nome do Miro> (importado)". Mostrar o relatório: quantos itens por tipo e o que foi ignorado.
2. **Fila de revisão** (painel à direita, aberto sozinho enquanto houver `revisao` no quadro):
   - lista em `ordemDeLeitura`, por moldura, com o contador "faltam N";
   - cada linha mostra o começo do texto, o tipo sugerido e os motivos;
   - ações: **Aceitar** (aplica o tipo e tira `revisao`), **Outro tipo…**, **Sem tipo**, **Ligar a entidade…** (cria um item `ref` ao lado, ou troca uma imagem pelo cartão da entidade; útil para os prints de fichas) e **Pular**;
   - clicar enquadra o item;
   - "Aceitar todos desta moldura" pede confirmação;
   - itens com `revisao` têm um contorno tracejado discreto no quadro.
3. **Desfazer:** cada ação de revisão é um passo do histórico.
Testes: e2e: importar uma fixture → quadro aparece → aceitar 2 → "faltam" diminui → desfazer.
Pronto quando: os testes passam e um quadro real do mestre importa sem erro (validação manual: o mestre roda).
Commit: `added miro import with a review queue`

---

## Etapa E — Mapa e sessão

> As fichas Q5a e Q5b mudam o **mesa-core** e o **Atlas**. O mestre autorizou essas mudanças ao aprovar este plano. Faça cada uma no seu projeto, uma por vez.

### Q5a — Eventos novos no contrato (`mesa-core`)  ✅
Objetivo: o Atlas pode avisar "o mestre está olhando este objeto" e pedir à Mesa "mostre isto no quadro".
Depende de: —.
Ler: `Atlas/mesa-core/src/eventos.ts`, `Atlas/mesa-core/tests/eventos.test.ts`, `Atlas/docs/PLATAFORMA.md` §5, §9 e §10.
Arquivos: mudar `Atlas/mesa-core/src/eventos.ts`, `Atlas/mesa-core/tests/eventos.test.ts` e `Atlas/docs/PLATAFORMA.md`; depois, `npm run build:core` no Atlas e copiar para `Mesa/vendor/mesa-core/` (`cp -r ../Atlas/mesa-core/dist/. vendor/mesa-core/`).
Como:
1. **No catálogo:**
   - `'atlas.inspecionado': { natureza: 'fato', dono: 'atlas', validar: todos(ref('mapa'), ref('alvo')) }`, onde o alvo é um objeto, região ou cômodo;
   - `'mesa.focar': { natureza: 'pedido', dono: 'mesa', validar: ref('ref') }`.
2. **No PLATAFORMA.md:**
   - §5: os dois eventos;
   - §3: os tipos `objeto` (`<mapa>/<prop>`), `regiao` (`<mapa>/<regiao>`), `quadro` e `item` (`<quadro>/<item>`);
   - §9: o Quadro;
   - §10: trocar o parágrafo do Miro por "importação por script local, ver `Mesa/docs/miro.md`".
Testes: os dois eventos são válidos e inválidos nos casos certos (no Atlas: `npm test`).
Pronto quando: os testes do Atlas e da Mesa passam com o vendor atualizado.
Commit: `added inspect and board focus events to the platform contract`

### Q5b — Atlas: Refs de objeto e região, e "Ver no quadro"  ✅
Objetivo: no Atlas, o mestre clica num objeto ou numa região e vê no quadro tudo o que está ligado a ele.
Depende de: Q5a.
Ler:
- `Atlas/src/app/app.ts` (perto da linha 79: atende `atlas.focar`);
- `Atlas/src/app/regioes.ts` (perto da linha 78: formato do Ref de região);
- `Atlas/src/ui/MenuRadial.tsx` (menu de contexto);
- `Atlas/src/domain/mapa.ts` (`Objeto`, `Regiao`);
- `Atlas/public/mesa.json`.
Arquivos: mudar esses arquivos e os testes correspondentes no Atlas.
Como:
1. **Manifesto do Atlas:** `oferece` ganha `objeto` e `regiao`; `rotas` ganha `"objeto": "./#/mapa/{pai}/objeto/{filho}"` e `"regiao": "./#/mapa/{pai}/regiao/{filho}"`; `emite` ganha `atlas.inspecionado`.
2. **`atlas.focar`:** passa a aceitar `objeto` e `regiao`: abre o mapa, centraliza e seleciona. **Se o Atlas não tiver uma função de selecionar por id fácil de chamar, pare e reporte.**
3. **"Ver no quadro":** no menu de contexto de objeto, região, cômodo e abertura (editor e sessão), a ação **Ver no quadro**:
   - emite `atlas.inspecionado { mapa, alvo }`;
   - faz `pedir('mesa.focar', { ref: alvo })`;
   - se não houver resposta, avisa "A Mesa não está aberta".
4. **"Copiar referência":** copia `mesa:atlas/objeto/<mapa>/<id>`, que pode ser colada no quadro (Q2j).
5. **Interagir na sessão:** quando o mestre interage com um interagível na sessão (`momentos` → `interagir`), emitir também `atlas.inspecionado`. É só um fato; não abre nada.
Testes: unitários do Atlas para o Ref de objeto e região e para o atendimento de `atlas.focar`; `npm run typecheck && npm test` em `Atlas/`.
Pronto quando: os testes do Atlas passam.
Commit: `added object and region refs and board inspect to atlas`

### Q5c — Mesa: ancorar, atender `mesa.focar` e painel Espiar  ✅
Objetivo: ligar itens do quadro a lugares e objetos, e ver o que está ligado sem perder a visão do quadro.
Depende de: Q5a, Q3c.
Ler: `src/app/barramento.ts`, `src/app/ligacoes-quadro.ts`.
Arquivos: criar `src/app/foco-do-quadro.ts`, `src/dominio/ancoras.ts`, `tests/unit/ancoras.test.ts` e `src/ui/quadro/PainelEspiar.tsx`; mudar `src/main.tsx` (iniciar o atendimento), `Quadro.tsx`, `MenuDoItem.tsx` e `public/mesa.json` (`atende: ["mesa.focar"]`, `emite` sem mudança).
Como:
1. **Âncora:** no menu do item, **Ancorar a…** abre uma busca de entidades (lugar, pista, ameaça…). Ancorar cria a ligação `esta-em` de `item` → Ref escolhido. Colar um Ref do Atlas com itens selecionados oferece "Ancorar a seleção a este objeto". Um item ancorado mostra um selo pequeno com o nome do lugar ou objeto, e o clique no selo usa `abrirNoApp`.
2. **`ancoras.ts` (puro):** `itensLigadosA(ref, ligacoes, entidades)` devolve os itens de quadro ancorados ou que mencionam:
   - o próprio Ref;
   - a entidade que contém esse Ref nos `refs`;
   - e, para objeto ou região, também o **cômodo** ou o **mapa** que os contém, numa lista separada ("no mesmo lugar"). Isso exige que o Ref carregue o mapa: `<mapa>/<id>` → o mapa.
3. **Atender `mesa.focar { ref }`:**
   - se o Ref é `mesa/item` ou `mesa/quadro`: abre o quadro e enquadra;
   - senão: abre o **painel Espiar** com `itensLigadosA(ref)`. Cada item aparece como miniatura (o mesmo `Item` em escala), com o botão "Ir para" (enquadra) e "Fixar" (o painel não fecha sozinho);
   - nada ligado: o painel diz "Nada ligado a <nome>" e oferece **Ancorar a seleção atual** quando há itens selecionados;
   - a resposta ao pedido é `{ ok: true }`.
4. **Fora do quadro:** se a Mesa está em outra tela, guardar o pedido e mostrar um aviso clicável "Atlas: ver <nome> no quadro".
Testes: `itensLigadosA` (direto, por entidade, por mapa); e2e com o barramento: um pedido `mesa.focar` com o Ref de um objeto ancorado abre o Espiar com o item.
Pronto quando: os testes passam.
Commit: `added anchors and peek panel for map objects on boards`

### Q5d — Quadro no modo sessão: Espiar e Seguir  ⬜
Objetivo: durante o jogo, o quadro fica ao lado do mapa e acompanha o grupo, se o mestre quiser.
Depende de: Q5c, Q5b.
Ler: `src/dominio/layout.ts`, `src/ui/ModoSessao.tsx`, `src/app/sessao.ts`.
Arquivos: mudar `src/dominio/layout.ts` (`PAINEIS` ganha `'quadro'`; os presets ganham o quadro, escondido no `padrao` e visível num preset novo `'com-quadro'`; um layout salvo sem `'quadro'` é normalizado ao ler), `tests/unit/layout.test.ts`, `src/ui/ModoSessao.tsx` e `src/app/foco-do-quadro.ts`.
Como:
1. **Painel "Quadro" no modo sessão:** é o componente `Quadro` de verdade, não um iframe. No topo do painel, um seletor de quadro (o último usado na campanha) e a chave **Espiar | Seguir**.
2. **Espiar (padrão):**
   - `atlas.inspecionado` e `atlas.regiao-entrou` **não movem** o quadro;
   - um selo "3 itens em <lugar>" aparece no painel e, ao clicar, abre o Espiar.
3. **Seguir:** os mesmos eventos enquadram o primeiro item ligado (de preferência a moldura) com uma animação curta e um destaque de 2 s.
4. **Pedido direto:** `mesa.focar` vindo do mestre (Q5b) sempre abre o Espiar, mesmo no modo Seguir.
Testes: unitário do layout com `'quadro'` (normalização do salvo antigo, presets); e2e: modo sessão com o preset `com-quadro`, fato `atlas.regiao-entrou` simulado no barramento → no Seguir, o quadro enquadra o item; no Espiar, só aparece o selo.
Pronto quando: os testes passam (`npm run test:e2e`).
Commit: `added board panel with peek and follow to session mode`

---

## Etapa F — Continuidade

### Q6a — Estado do mundo e condições  ✅
Objetivo: fatos da campanha (`chave do sótão: Naira`, `poeira: limpa`) que acendem ou apagam cartões.
Depende de: Q3a, Q3b.
Arquivos: criar `src/dominio/estado-do-mundo.ts`, `tests/unit/estado-do-mundo.test.ts` e `src/ui/quadro/PainelDoEstado.tsx`; mudar `src/app/banco-quadros.ts` (`ajustes.estado`), `src/app/quadros.ts` e `Item.tsx`.
Como:
1. **`estado-do-mundo.ts`:**
   - `type EstadoDoMundo = { fatos: Record<string, string | boolean>; historico: { chave, de, para, em, sessaoId }[] }`;
   - `avaliarCondicao('poeira' | '!poeira' | 'chave=Naira', estado): boolean`, onde fato ausente vale `false`;
   - `condicoesDoItem(item)`, tiradas dos marcadores com `condicao`.
2. **Painel do estado** (botão na barra): lista os fatos com edição rápida (liga/desliga e texto). Cada mudança entra no `historico` com a sessão ativa.
3. **Condições no quadro:** um item com condição falsa fica a 35% de opacidade, com o selo "se: poeira". Um marcador com condição falsa fica riscado.
4. **Atalho:** clicar no texto `se:poeira` de um chip alterna o fato.
Testes: `avaliarCondicao` em todos os formatos; `condicoesDoItem`.
Pronto quando: os testes passam.
Commit: `added world state and conditional board cards`

### Q6b — ✓ feito: testes, loot e segredos vão para o registro  ✅
Objetivo: marcar no quadro o que aconteceu e ter isso no diário sem reescrever.
Depende de: Q6a.
Ler: `src/app/registro.ts` e `src/dominio/registro.ts` (`acrescentar`).
Arquivos: mudar `Item.tsx`, `MenuDoItem.tsx`, `src/app/quadros.ts`, `src/dominio/registro.ts` (um formato de linha "do quadro") e `tests/unit/registro.test.ts`; criar `src/ui/quadro/PainelDeSegredos.tsx`.
Como:
1. **Marcar feito:** em sessão, um clique no canto do item (ou a tecla `X` com o item selecionado) marca `feito`. Isso:
   - desenha um ✓ como os que o mestre faz à mão;
   - acrescenta uma linha no registro da sessão ativa: "✓ Teste de Percepção 13 — <moldura>", "Loot entregue: HANDOUT 07", "Segredo revelado: <começo do texto>".
   - Desmarcar remove a marca, mas **não** apaga a linha do registro, que é histórico.
2. **Painel de segredos:** lista os itens `segredo` (e os ligados a cada entidade) como revelados ou não, com a sessão em que foram revelados. É a resposta para "o que o Teodor ainda esconde?".
Testes: o formato da linha do registro e a não repetição (reaproveitar `ehRepeticao`).
Pronto quando: os testes passam.
Commit: `added done marks that feed the session log`

### Q6c — Molduras que agem  ✅
Objetivo: uma moldura "Casa" ou "Subida da trilha" funciona como uma região do Atlas, mas no quadro.
Depende de: Q6a, Q5d.
Arquivos: mudar `ItemMoldura.tsx`, `MenuDoItem.tsx` (o editor de "Ao entrar"), `src/app/foco-do-quadro.ts` e `src/app/quadros.ts`; criar `tests/unit/ao-focar.test.ts` (com a regra pura em `src/dominio/molduras.ts`).
Como:
1. **"Ao entrar":** cada moldura tem uma seção "Ao entrar" com uma cena sonora (busca nas entidades `cena` e nos efeitos do Jukebox) e fatos a ligar.
2. **Quando dispara:** em sessão, quando o mestre vai a uma moldura pelo navegador, pelo `PageDown` ou pelo Seguir, a Mesa:
   - pede `jukebox.tocar` com a cena;
   - aplica os fatos;
   - mostra um aviso com **desfazer**.
3. **Chave na barra:** "Molduras agem: sim | perguntar | não", com padrão **perguntar**.
4. **Regra pura:** `deveDisparar(anterior, atual, modo)` não repete a mesma moldura e ignora a moldura-mãe quando se entra numa filha.
Testes: `deveDisparar`.
Pronto quando: os testes passam.
Commit: `added frame actions for music and world state`

### Q6d — Checagem antes da sessão e linha do tempo  ✅
Objetivo: a Mesa avisa o que falta preparar no quadro e organiza as datas do lore.
Depende de: Q6a.
Ler: `src/dominio/prontidao.ts`, `src/app/prontidao.ts` e `src/ui/DialogoChecagemSessao.tsx`.
Arquivos: mudar `src/dominio/prontidao.ts`, `tests/unit/prontidao.test.ts` e `src/ui/DialogoChecagemSessao.tsx`; criar `src/ui/quadro/LinhaDoTempo.tsx` e `src/dominio/linha-do-tempo.ts` (puro, com testes).
Como:
1. **Novas pendências da checagem:** valem para os quadros e molduras que estão no roteiro da sessão. O roteiro já aceita Refs, e "Adicionar ao roteiro" entra no menu da moldura.
   - `[REVER]` em aberto;
   - itens ainda com `revisao`;
   - `[[ligações]]` sem destino;
   - `fala` de nome que não existe como entidade;
   - loot com `HANDOUT` sem item `ref` do Ateliê na mesma moldura.
2. **Linha do tempo:** junta os `[DATA ...]` de todos os quadros da campanha, ordenados, cada um com o trecho e o link para o item. Abre num painel do quadro.
Testes: as novas pendências (fixtures puras); ordenação das datas (ano, ano-mês, ano-mês-dia).
Pronto quando: os testes passam.
Commit: `added board checks to session readiness and a lore timeline`

---

## Depois desta fase (não fazer agora)

- Projeção do quadro para os jogadores (modo apresentação, sem `soMestre`, sem `segredo`).
- Comentários e versões de um quadro.
- Mostrar a nota da seção dentro do Atlas, ao passar o mouse numa região.
- Assistente: revisar a importação, sugerir ligações e achar contradições de datas e idades (pela ponte, só em desenvolvimento).
