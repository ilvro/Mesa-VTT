# Fase 2 da Mesa — Coleção Visual de Campanha, Encontros, Cenas e Cofre Local

"A campanha como uma coleção viva, pronta para web e para aplicativo desktop." Inspirada no painel de coleção do Atlas VTT: sidebar com árvore de `# Etiquetas` (Tags) e contadores, barra superior com categorias (`Cenas`, `Mapas`, `Encontros`, `Personagens`, `Ameaças`, `Pistas`, `Notas`), grade visual de cartões com miniaturas, construtor de Encontros e Cenas, e sincronização com pasta local no computador (Cofre / Vault) preparando o terreno para o aplicativo Desktop.

**Critério de pronto:** A tela principal da Mesa exibe a sidebar de Coleção + Etiquetas e a grade de cartões com miniaturas (das fichas do Dossiê e dos mapas do Atlas), permite montar Encontros e Cenas completas e ativá-las na sessão com 1 clique, e permite vincular/exportar a campanha como uma pasta de arquivos `.md` e `.json` para uso Desktop.

## Execução Paralela com o Atlas e Recomendação de Modelo

Você pode abrir um chat dedicado na pasta `Projects/Mesa` e mandar o **Gemini 3.8 Flash** implementar esta fase **ao mesmo tempo** em que outro chat implementa a `fase-11.md` no `Atlas`!

| # | Tarefa | Escopo | Modelo Sugerido | Paralelizável com o Atlas? |
| --- | --- | --- | --- | --- |
| `M2.1a` | Layout de Coleção: Sidebar retrátil com árvore de `# Etiquetas`, histórico `<`/`>` e barra de categorias | Só `Mesa` | **Gemini 3.8 Flash Medium** | ✅ 100% paralela |
| `M2.1b` | Grade visual de cartões com miniaturas (`Cards` vs `Lista`), ordenação e seções colapsáveis | Só `Mesa` | **Gemini 3.8 Flash Medium** | ✅ 100% paralela (já lê `Entidade.retrato` do contrato v1!) |
| `M2.2a` | Construtor de Encontros (`Encontros`) e Pacotes de Cena (`Cenas`) | Só `Mesa` | **Gemini 3.8 Flash Medium** | ✅ 100% paralela |
| `M2.2b` | Ação "▶ Ativar Cena / ⚔ Lançar Encontro" na Coleção e no Modo Sessão | `Mesa` | **Gemini 3.8 Flash High** | ⚠️ Usa `atlas.preparar-cena` (ou `atlas.focar` + `jukebox.tocar` se `11.5b` ainda não rodou) |
| `M2.3a` | Serializador puro de Cofre em Disco (`Entidade` ↔ Markdown `.md` com frontmatter YAML) | Só `Mesa` | **Gemini 3.8 Flash Medium** | ✅ 100% paralela |
| `M2.3b` | Sincronização de Cofre Local (`📁 Vincular pasta no computador` / Exportar Vault) para Desktop | Só `Mesa` | **Gemini 3.8 Flash High** | ✅ 100% paralela |

---

### M2.1a — Layout de Coleção: Sidebar retrátil com árvore de `# Etiquetas`, histórico `<`/`>` e barra de categorias  ⬜
Objetivo: estruturar a tela da campanha no formato de Coleção (sidebar esquerda com seletor de campanha e árvore de etiquetas com contadores; barra superior com histórico `<`/`>`, abas de categorias com contadores, busca e ordenação).
Depende de: —
Ler: `src/dominio/entidades.ts`, `src/app/campanha.ts`, `src/ui/Entidades.tsx`, `src/ui/Cabecalho.tsx`, `src/ui/estilo.css`.
Arquivos: mudar `src/dominio/entidades.ts`, `src/app/campanha.ts`, `src/ui/Entidades.tsx`, `src/ui/estilo.css`, `tests/unit/entidades.test.ts`.
Como:
1. Em `src/dominio/entidades.ts`, adicionar funções puras:
   - `export interface ContagemTag { tag: string; chave: string; contagem: number }`.
   - `export function contarPorTag(entidades: readonly Entidade[]): ContagemTag[]`: agrupa etiquetas sem diferenciar caixa/acento (`chave`), preservando a grafia mais usada (`tag`), ordenando por maior contagem e depois alfabeticamente.
   - `export type OrdemColecao = 'nome-asc' | 'nome-desc' | 'recentes'`.
   - `export function ordenarEntidades(lista: readonly Entidade[], ordem: OrdemColecao): Entidade[]`.
   - Filtro adicional por `tagAtiva: string | null` em `filtrarEntidades` (sem quebrar as chamadas existentes: quarto parâmetro opcional `tag?: string | null`).
   - Distinguir visualmente a aba **Encontros** (entidades `cena` que têm a etiqueta `encontro` ou ligações a `ameaca`).
2. Em `src/app/campanha.ts`, adicionar os signals `tagAtiva = signal<string | null>(null)`, `ordem = signal<OrdemColecao>('nome-asc')`, `sidebarAberta = signal<boolean>(true)` e histórico simples de seleção (`voltarSelecao()`, `avancarSelecao()`, `podeVoltar`, `podeAvancar`).
3. Em `src/ui/Entidades.tsx` e `src/ui/estilo.css`:
   - Criar a **Sidebar Esquerda de Coleção (`aside.colecao-sidebar`)**: seletor da campanha (`📁`), árvore de **Etiquetas (`Tags`)** com busca local de tag e itens clicáveis `# etiqueta (N)` (`data-testid="tag-filtro-<chave>"`), e rodapé `⚙ Gerenciar Campanha`.
   - Criar a **Barra Superior da Coleção (`header.colecao-barra`)**: botão de alternar sidebar, setas `<` e `>`, abas de categorias com contadores (`Tudo`, `Cenas`, `Mapas`/`Lugares`, `Encontros`, `Personagens`, `Ameaças`, `Pistas`, `Facções`, `Notas` — mantendo os `data-testid="tipo-<t>"` e `data-testid="tipo-todos"`!), campo `busca` (`data-testid="busca"`), seletor de ordenação e botão `+` para abrir/focar o criador rápido de entidade.
Não fazer: remover nenhum `data-testid` existente (`tela-entidades`, `novo-tipo`, `nova-entidade-nome`, `criar-entidade`, `busca`, `tipo-todos`, `tipo-lugar`, etc.).
Testes: unitários em `tests/unit/entidades.test.ts` para `contarPorTag`, filtro combinado com `tag` e `ordenarEntidades`.
Pronto quando: a tela de campanha mostra a sidebar de etiquetas com contadores e a barra de categorias no topo, filtrando por categoria + etiqueta + busca.
Commit: feat(mesa): add Collection sidebar with tag tree, navigation history and category bar

### M2.1b — Grade visual de cartões com miniaturas (`Cards` vs `Lista`), ordenação e seções colapsáveis  ⬜
Objetivo: exibir as entidades da campanha numa grade visual de cartões com miniaturas (`e.retrato` ou arte SVG por tipo), agrupadas em seções colapsáveis, com alternância entre Grade e Lista e gaveta lateral de detalhes.
Depende de: M2.1a
Ler: `src/ui/Entidades.tsx`, `src/dominio/entidades.ts`, `src/ui/estilo.css`.
Arquivos: criar `src/ui/GradeDeColecao.tsx`; mudar `src/ui/Entidades.tsx`, `src/ui/estilo.css`, `tests/unit/entidades.test.ts`.
Como:
1. Criar `src/ui/GradeDeColecao.tsx`:
   - Signal `modoExibicao = signal<'grade' | 'lista'>('grade')` com botão de alternância na barra superior (`data-testid="modo-grade"` e `data-testid="modo-lista"`).
   - Gerenciar URLs de `Blob` (`URL.createObjectURL(e.retrato)`) com limpeza automática em `useEffect` para não vazar memória.
   - Quando `e.retrato` não existir, renderizar um fundo ilustrado em SVG temático por `e.tipo` (`lugar` → malha cartográfica, `cena` → claquete/bússola, `personagem` → silhueta, `ameaca` → insígnia de perigo, `pista` → documento lacrado, `nota` → folha timbrada).
   - Agrupar os cartões em seções colapsáveis (`▾ Cenas 4`, `▾ Mapas 8`, `▾ Personagens 5`…) quando o filtro `Tudo` estiver ativo, ou mostrar a grade direta da categoria filtrada.
   - Cada cartão mantém `data-testid="entidade-<id>"` e `data-tipo={e.tipo}` para que todos os testes unitários e e2e existentes continuem funcionando sem mudar uma linha!
   - Clicar no cartão abre o painel `<Detalhe e={sel} />` à direita; botão rápido `"Abrir ↗"` no canto do cartão abre direto no aplicativo dono (Atlas, Dossiê, Ateliê).
Não fazer: alterar o banco IndexedDB.
Testes: verificar que todos os testes existentes e o novo teste de agrupamento/alternância Grade vs Lista passam.
Pronto quando: a coleção exibe os cartões quadrados com miniaturas (como na referência do Atlas VTT) e abre a gaveta de detalhes ao clicar.
Commit: feat(mesa): add visual thumbnail card grid and collapsible sections to campaign collection

### M2.2a — Construtor de Encontros (`Encontros`) e Pacotes de Cena (`Cenas`)  ⬜
Objetivo: permitir que o mestre monte uma Cena completa (Mapa + Clima + Música do Jukebox + Pistas) ou um Encontro (lista de Ameaças e Personagens participantes) diretamente no painel de detalhe da entidade na Mesa.
Depende de: M2.1b
Ler: `src/ui/Entidades.tsx` (`Detalhe`), `src/app/campanha.ts`, `vendor/mesa-core/index.d.ts` (`ligar`, `listarLigacoes`, `removerLigacao`, `TipoLigacao`).
Arquivos: criar `src/dominio/cenas.ts`, `src/ui/EditorDeCena.tsx`, `tests/unit/cenas.test.ts`; mudar `src/app/campanha.ts`, `src/ui/Entidades.tsx`, `src/ui/estilo.css`.
Como:
1. Em `src/dominio/cenas.ts`, criar funções puras que leem e organizam o pacote de uma entidade `cena` a partir das `ligacoes` do banco da campanha e dos `refs` das outras entidades:
   - **Lugar/Mapa da cena:** ligação `esta-em` da cena para o `Ref` `mesa:atlas/mapa/<id>` (ou cômodo `mesa:atlas/comodo/<mapa>/<comodo>`).
   - **Trilha sonora da cena:** ligação `toca-em` da cena para `mesa:jukebox/cena-sonora/<id>`.
   - **Participantes do Encontro (Ameaças e Personagens):** ligações `aparece-em` de `mesa:ficha/ficha/<id>` para a cena.
   - **Pistas reveladas na cena:** ligações `revela` da cena para `mesa:atelie/documento/<id>`.
2. Criar `src/ui/EditorDeCena.tsx` e exibi-lo dentro de `<Detalhe>` sempre que `e.tipo === 'cena'`:
   - Seletores práticos para vincular/desvincular o **Mapa do Atlas**, a **Cena Sonora do Jukebox**, **Ameaças/Personagens** da campanha (com retratos e badge de ameaça vs jogador) e **Pistas do Ateliê**, gravando tudo como `ligacoes` oficiais no repositório da campanha!
   - Botão rápido `"Marcar como Encontro de Combate"` (adiciona/remove a etiqueta `encontro`, fazendo a cena aparecer também na aba `Encontros`!).
Não fazer: disparar o evento de preparação pro Atlas ainda (fica na M2.2b).
Testes: unitários em `tests/unit/cenas.test.ts` montando e lendo o pacote de uma cena/encontro a partir das ligações.
Pronto quando: selecionar uma Cena ou Encontro na Mesa permite vincular visualmente o mapa, a música, os monstros do encontro e as pistas.
Commit: feat(mesa): add visual Scene and Encounter builder using campaign links

### M2.2b — Ação "▶ Ativar Cena / ⚔ Lançar Encontro" na Coleção e no Modo Sessão  ⬜
Objetivo: adicionar o botão de 1 clique que ativa uma Cena ou Encontro, abrindo o mapa no Atlas, tocando a trilha no Jukebox e registrando no Diário da Sessão.
Depende de: M2.2a
Ler: `src/ui/EditorDeCena.tsx`, `src/ui/ModoSessao.tsx`, `src/ui/Diario.tsx`, `src/app/barramento.ts`, `src/app/registro.ts`.
Arquivos: mudar `src/ui/EditorDeCena.tsx`, `src/ui/ModoSessao.tsx`, `src/app/sessao.ts`, `tests/unit/cenas.test.ts`.
Como:
1. Em `src/ui/EditorDeCena.tsx` (e nos cartões de Cena/Encontro da `GradeDeColecao.tsx`), adicionar o botão de destaque **"▶ Ativar Cena"** (`data-testid="ativar-cena"`):
   - Se o catálogo do `vendor/mesa-core` já tiver `'atlas.preparar-cena'` (da tarefa `11.5b` do Atlas), envia `pedir('atlas.preparar-cena', { mapa, comodo, fichas })`; caso contrário (se a `11.5b` ainda não tiver sido rodada no Atlas), envia `pedir('atlas.focar', { ref: comodo ?? mapa })` como fallback seguro!
   - Se houver cena sonora vinculada, envia `pedir('jukebox.tocar', { ref: cenaSonora })`.
   - Atualiza `mudarEscolhas({ mapaId })` do `ModoSessao` para que o painel do Atlas na Mesa já aponte para o mapa da cena!
Não fazer: quebrar caso o Atlas ou o Jukebox estejam fechados (usar `pedirNoBarramento` que já avisa com toast amigável).
Testes: unitário verificando os pedidos emitidos ao ativar uma cena com mapa, música e participantes.
Pronto quando: clicar em "▶ Ativar Cena" na Mesa comanda o Atlas e o Jukebox e já seleciona o mapa no Modo Sessão.
Commit: feat(mesa): add 1-click Scene & Encounter activation across Atlas and Jukebox

### M2.3a — Serializador puro de Cofre em Disco (`Entidade` ↔ Markdown `.md` com frontmatter YAML)  ⬜
Objetivo: permitir exportar e importar toda a campanha como uma pasta de arquivos Markdown (`.md` com frontmatter YAML e `[[ligações]]`, compatível com Obsidian e com o futuro app Desktop).
Depende de: —
Ler: `src/dominio/notas.ts`, `src/dominio/entidades.ts`, `vendor/mesa-core/index.d.ts`.
Arquivos: criar `src/dominio/cofre.ts`, `tests/unit/cofre.test.ts`.
Como:
1. Em `src/dominio/cofre.ts`, implementar funções 100% puras (sem DOM nem IndexedDB):
   - `export function entidadeParaMarkdown(e: Entidade): { caminho: string; conteudo: string }`:
     - Gera `entidades/<tipo>/<slug>-<idCurto>.md` com cabeçalho YAML (`id`, `tipo`, `nome`, `tags`, `refs` formatados como `mesa:app/tipo/id`, `criadaPor`, `atualizadaEm`) seguido pelas `notas` em Markdown com `[[ligações]]`.
   - `export function markdownParaEntidade(conteudo: string, campanhaId: string): Entidade | null`:
     - Faz o caminho inverso, reconstruindo a `Entidade` com validação.
   - `export function manifestoDoCofre(campanha: Campanha, ligacoes: readonly Ligacao[], sessoes: readonly Sessao[]): string` (`campanha.json`).
Não fazer: tocar em APIs de navegador nesta tarefa (apenas lógica pura e testada).
Testes: unitários de ida e volta (`entidadeParaMarkdown` → `markdownParaEntidade`) com tags, acentos, quebras de linha e múltiplas `refs`.
Pronto quando: qualquer campanha e suas entidades convertem para `.md` + `campanha.json` e voltam sem perda de dados.
Commit: feat(mesa): add pure Vault Markdown/YAML serializer for desktop and Obsidian compatibility

### M2.3b — Sincronização de Cofre Local (`📁 Vincular pasta no computador`) para Desktop e Web  ⬜
Objetivo: adicionar na sidebar de Coleção da Mesa a opção de vincular uma pasta real no computador (via File System Access API / Desktop bridge) ou baixar/importar o Cofre da campanha.
Depende de: M2.1a, M2.3a
Ler: `src/dominio/cofre.ts`, `src/app/campanha.ts`, `src/ui/Entidades.tsx`.
Arquivos: criar `src/app/cofre.ts`; mudar `src/ui/Entidades.tsx`, `src/ui/Campanhas.tsx`, `tests/unit/cofre.test.ts`.
Como:
1. Em `src/app/cofre.ts`, implementar o adaptador de pasta:
   - Se `window.showDirectoryPicker` existir (Chromium / Edge / Tauri / Electron), o botão **`📁 Vincular Pasta Local (Cofre)`** na sidebar da Coleção pede permissão para uma pasta e grava `campanha.json`, `entidades/<tipo>/*.md` e `retratos/*.webp`, mantendo um espelhamento automático (debounce de 800 ms) sempre que `entidades` ou `sessoes` mudarem!
   - Em qualquer navegador, oferecer também **`⬇ Exportar Cofre (.json/.md)`** e **`⬆ Importar Cofre`** nos botões de topo da sidebar (como os ícones `↓` `↑` ao lado de *"Collection"* na Imagem 4).
Não fazer: substituir o IndexedDB (o IndexedDB continua sendo o motor primário em memória/navegador para velocidade e funcionamento no GitHub Pages).
Testes: unitários do sincronizador usando um driver de diretório em memória (`Map<string, string | Blob>`).
Pronto quando: o mestre pode vincular uma pasta do computador à campanha na sidebar da Mesa e ver suas notas `.md`, retratos e dados da campanha salvos como arquivos reais no disco.
Commit: feat(mesa): add local Vault folder sync and export/import in Collection sidebar
