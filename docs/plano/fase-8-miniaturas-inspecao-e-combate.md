# Fase 8 — Miniaturas Vivas, Inspeção UV na Mesa e Painel de Combate na Sessão

Planejada em 2026-11-21. Esta fase entrega duas melhorias de alto impacto para o **Quadro**, a **Coleção** e o **Modo Sessão** da Mesa:

1. **Bloco 1 (`M8.1a`–`M8.1c`) — Miniatura viva de Mapas (`Atlas`) e Pistas (`Ateliê`) + Inspeção 3D com Lanterna UV dentro da Mesa:**
   - Completa a pendência da Fase 6 (`E4a`): cartões de `lugar` (mapa do Atlas) e `pista` (documento do Ateliê) no Quadro e na Coleção passam a exibir a miniatura visual real do mapa/documento.
   - O mestre pode abrir qualquer pista do Ateliê num **Modal de Inspeção 3D com Lanterna UV** diretamente dentro do Modo Sessão, do Quadro ou da Coleção da Mesa — e projetá-la para os jogadores (no segundo monitor e na sala online) sem precisar trocar para a aba do Ateliê durante o jogo.
2. **Bloco 2 (`M8.2a`–`M8.2c`) — Painel de Combate / Iniciativa integrado ao Modo Sessão:**
   - Uma faixa tática no topo do `ModoSessao.tsx` sincronizada em tempo real com os marcadores do mapa no **Atlas** e com as fichas do **Dossiê**: ordem de iniciativa, turno e rodada atuais, avanço de turno (`◀` / `▶`), rolagem/edição de iniciativa e ajuste rápido de **PV / PD** (`−1`, `+1`, `-5`, `+3`), focando automaticamente a ficha e a câmera do combatente da vez.

Regras para o executor: as mesmas da [fase-4.md](fase-4.md) (`src/dominio` puro e testado, `npm run typecheck` e `npm test` passando, ficha marcada ✅ com `Nota:` dos desvios, um commit atômico por ficha).

---

## Resumo das Fichas

| Ficha | Onde | Resultado |
|---|---|---|
| `M8.1a` | `Atelie` + `Mesa` | O Ateliê grava a miniatura do documento em `entidade.retrato` na campanha, e a Mesa também lê o bake de `mesa-handouts-v1` como fallback |
| `M8.1b` | `Mesa` (`Quadro`) | Cartões `ItemRef` de `lugar` e `pista` no Quadro mostram a miniatura panorâmica do mapa/documento e botão rápido de inspeção |
| `M8.1c` | `Mesa` (`ModoSessao` + `Quadro`) | Modal de Inspeção 3D com Lanterna UV dentro da Mesa + botão "Mostrar aos jogadores" |
| `M8.2a` | `Atlas` (`mesa-core` + `Atlas`) | Eventos `atlas.iniciativa` e `atlas.iniciativa-acao` no contrato e atendimento no Atlas |
| `M8.2b` | `Mesa` (`dominio` + `app`) | Estado puro e sincronização de combate na Mesa (unindo iniciativa do Atlas, participantes da cena e PV/PD do Dossiê) |
| `M8.2c` | `Mesa` (`ModoSessao.tsx`) | Faixa de Combate / Iniciativa + PV rápido no topo do Modo Sessão |

---

## Bloco 1 — Miniaturas Vivas e Inspeção UV na Mesa

### M8.1a — Ateliê publica miniatura da pista na campanha e leitor de handouts na Mesa  ✅
Objetivo: toda pista criada ou arquivada pelo Ateliê tem miniatura em `entidade.retrato`, e a Mesa sabe ler os assados `normal` e `uv` do banco compartilhado `mesa-handouts-v1`.
Depende de: —.
Ler: `Atelie/src/mesa.js`, `Atelie/src/data/exchange.js` (como grava em `mesa-handouts-v1`), `Atlas/src/data/pistas.ts` (como o Atlas lê `mesa-handouts-v1`: stores `handouts` e `bakes`), `Atlas/src/app/campanha.ts` (`sincronizarMapaComCampanha`).
Arquivos: mudar `Atelie/src/mesa.js`; criar `Mesa/src/app/pistas-atelie.ts` e `Mesa/tests/unit/pistas-atelie.test.ts`.
Como:
1. Em `Atelie/src/mesa.js` (`registrarPista` e `documentoSalvo`):
   - Quando o documento salvo tiver o bake `normal` (ou `thumbnailBlob` / `normalBlob`), gerar um thumbnail WebP/PNG leve (máximo 512 px de lado, até 256 KB) e passá-lo como `retrato` em `repo.criarEntidade` e `repo.salvarEntidade`.
2. Em `Mesa/src/app/pistas-atelie.ts`:
   - Replicar o leitor enxuto do banco IndexedDB compartilhado `mesa-handouts-v1` (como em `Atlas/src/data/pistas.ts`):
     - `obterPistaDoAtelie(documentoId: string): Promise<{ id: string; name: string; hasUv: boolean; normal: Blob; uv: Blob | null } | null>`.
     - `miniaturaDaPista(documentoId: string): Promise<Blob | null>`: devolve o blob `normal` do banco `mesa-handouts-v1` para pistas antigas que ainda não tinham `entidade.retrato` gravado na campanha.
Testes: `obterPistaDoAtelie` com `fake-indexeddb` lê metadados e blobs `normal`/`uv` de `mesa-handouts-v1` e retorna `null` quando ausente; `registrarPista` no Ateliê salva `retrato`.
Pronto quando: pistas novas e antigas do Ateliê fornecem imagem de prévia e camada UV para a Mesa.
Commit: `(feature) publish atelie handout thumbnails and read handout bakes in mesa`
Nota: implementado `gerarMiniatura` e gravação de `retrato` em `registrarPista` (`Atelie/src/mesa.js`, com fallback de leitura do bake `normal` de `mesa-handouts-v1`), e leitor `Mesa/src/app/pistas-atelie.ts` (`idDaPistaDoAtelie`, `obterPistaDoAtelie`, `miniaturaDaPista` com cache leve por `IDBFactory` e `limparCacheDePistas`), cobertos por testes em `Atelie/tests/mesa.test.js` e `Mesa/tests/unit/pistas-atelie.test.ts`.

---

### M8.1b — Miniatura viva de Mapas e Pistas nos cartões do Quadro e da Coleção  ✅
Objetivo: cartões `ItemRef` de mapas (`lugar`) e documentos (`pista`) no Quadro (e na Leitura do Quadro) exibem a miniatura viva do mapa ou da pista no corpo do cartão.
Depende de: M8.1a.
Ler: `Mesa/src/ui/quadro/ItemRef.tsx`, `Mesa/src/ui/quadro/LeituraDoQuadro.tsx`, `Mesa/src/ui/GradeDeColecao.tsx`, `Mesa/src/ui/estilo.css`.
Arquivos: mudar `Mesa/src/ui/quadro/ItemRef.tsx`, `Mesa/src/ui/quadro/LeituraDoQuadro.tsx`, `Mesa/src/ui/GradeDeColecao.tsx`, `Mesa/src/ui/estilo.css`; testes em `Mesa/tests/e2e/quadro-cartoes.test.ts`.
Como:
1. Em `ItemRef.tsx`:
   - Quando `entidade.tipo === 'lugar' || entidade.tipo === 'pista'` (ou `item.ref.app === 'atlas' || item.ref.app === 'atelie'`):
     - Buscar o `Blob` da imagem: primeiro `entidade.retrato`; se ausente e a `ref` for `atelie/documento/<id>`, consultar `miniaturaDaPista(id)` (M8.1a) em `useEffect`.
     - Renderizar `<div class="item-ref-miniatura" data-testid={`miniatura-${item.id}`}>` com a `<img src={url} />` em destaque (proporção panorâmica `16:10` com `object-fit: cover` para mapas de `lugar`; proporção de folha com `object-fit: contain` sobre fundo escuro para `pista` do Ateliê).
     - Se a pista tiver documento no Ateliê, exibir no cartão o botão **"🔬 Inspecionar (UV)"** (`data-testid={`ref-inspecionar-${item.id}`}`), que abre o modal da `M8.1c`.
2. Em `GradeDeColecao.tsx`:
   - Para cartões do tipo `pista` sem `entidade.retrato`, usar também o fallback `miniaturaDaPista(id)` para que pistas antigas mostrem a miniatura do documento na grade.
Testes: e2e em `quadro-cartoes.test.ts`: um `ItemRef` de `lugar` com `retrato` e um `ItemRef` de `pista` exibem `.item-ref-miniatura img` no quadro.
Pronto quando: arrastar um Lugar (mapa) ou Pista (documento) para o Quadro mostra a miniatura visual do mapa/documento dentro do cartão.
Commit: `(feature) live map and handout thumbnails on board cards`
Nota: estilos isolados em `Mesa/src/ui/fase-8.css` (importado em `ItemRef.tsx` e `LeituraDoQuadro.tsx`) para evitar conflito com edições paralelas em `estilo.css`; implementado `useMiniaturaDoRef` em `ItemRef.tsx` (reaproveitado em `LeituraDoQuadro.tsx`) com suporte a `entidade.retrato` e fallback assíncrono via `miniaturaDaPista`, omissão do avatar circular `Retrato` quando a miniatura grande está visível, e fallback `miniaturaDaPista` na `GradeDeColecao.tsx`. O botão "Inspecionar (UV)" fica para a `M8.1c` junto ao modal.

---

### M8.1c — Modal de Inspeção 3D com Lanterna UV dentro da Mesa e do Modo Sessão  ✅
Objetivo: inspecionar qualquer pista do Ateliê com zoom, inclinação 3D e lanterna UV diretamente num modal dentro da Mesa (no Modo Sessão, no Quadro ou na Coleção), sem precisar abrir a aba do Ateliê.
Depende de: M8.1a, M8.1b.
Ler: `Atlas/src/ui/Inspecao.tsx`, `Atlas/src/ui/VisorDeDocumento.tsx`, `Atlas/src/domain/inspecao.ts`, `Mesa/src/ui/App.tsx`, `Mesa/src/ui/ModoSessao.tsx`, `Mesa/src/ui/MenuDeContexto.tsx`.
Arquivos: criar `Mesa/src/dominio/inspecao.ts`, `Mesa/src/ui/InspecaoDePista.tsx` e `Mesa/tests/unit/inspecao.test.ts`; mudar `Mesa/src/ui/App.tsx`, `Mesa/src/ui/MenuDeContexto.tsx`, `Mesa/src/ui/quadro/ItemRef.tsx`, `Mesa/src/ui/Entidades.tsx`, `Mesa/src/ui/estilo.css`.
Como:
1. Em `Mesa/src/dominio/inspecao.ts`:
   - Funções puras de câmera do visor de documento (`VISTA_INICIAL`, `arrastar`, `zoomEm`, `paraFracao`, idênticas a `Atlas/src/domain/inspecao.ts`).
2. Em `Mesa/src/ui/InspecaoDePista.tsx`:
   - Signal global `pistaEmInspecao = signal<PistaAbertaNaMesa | null>(null)` e função `abrirInspecaoNaMesa(refOuDocumentoId: Ref | string)`.
   - Modal em tela cheia sobre a Mesa (`<InspecaoDePista />` montado em `App.tsx`) com:
     - Canvas duplo / composição 2D que desenha a imagem `normal` e, quando **"🔦 Luz UV"** está ativa (`hasUv`), revela a imagem `uv` num círculo suave com halo violeta centrado no cursor (`lanterna: { x, y }`).
     - Efeito de inclinação 3D suave ao mover o ponteiro (`--tilt-x`, `--tilt-y`), roda do mouse para zoom e arrasto para pan.
     - Botão **"Mostrar aos jogadores"**: transmite a imagem `normal`, `uv` e a posição da lanterna UV pelo canal do projetor (`BroadcastChannel('atlas:projetor:ativo')` / `atlas:projetor:remoto`) para que o projetor do segundo monitor e os jogadores na sala online vejam a pista e a lanterna UV do mestre em tempo real!
     - Botão **"Editar no Ateliê ↗"** e **`Fechar (Esc)`**.
3. Pontos de entrada para abrir o modal:
   - Botão **"🔬 Inspecionar (UV)"** nos cartões `ItemRef` de pista no Quadro (`M8.1b`) e na gaveta de detalhes de uma entidade `pista` (`Entidades.tsx`).
   - No menu de contexto de botão direito (`MenuDeContexto.tsx`) de qualquer entidade `pista` ou `ref` `atelie/documento/*`: primeira opção **"Inspecionar pista (Luz UV)"** logo acima de **"Abrir no Ateliê ↗"**.
Testes: unitários de `zoomEm`, `arrastar` e `paraFracao`; teste e2e abrindo uma pista de `mesa-handouts-v1` no modal da Mesa, ligando o botão `Luz UV` e fechando com `Esc`.
Pronto quando: no Modo Sessão ou no Quadro, clicar em "Inspecionar pista (Luz UV)" abre o documento com lanterna UV funcional sem sair da Mesa.
Commit: `(feature) 3d handout inspection modal with uv flashlight inside mesa`
Nota: estilos isolados em `Mesa/src/ui/fase-8.css` (sem tocar em `estilo.css` nem `ModoSessao.tsx`); criado `src/dominio/inspecao.ts` (puro, com `VISTA_INICIAL`, `encaixe`, `arrastar`, `zoomEm`, `paraFracao`, `paraTela`) e `src/ui/InspecaoDePista.tsx` com modal 3D, lanterna UV em canvas 2D e projeção sincronizada nos canais `atlas:projetor:ativo` e `atlas:projetor:remoto` no formato compatível com o projetor do Atlas e a ponte online (`{ tipo: 'inspecao', nome, normal, uv }`, `inspecao-estado`, `inspecao-fim`); integrado em `App.tsx`, `MenuDeContexto.tsx`, `ItemRef.tsx` e `Entidades.tsx`, com testes unitários em `tests/unit/inspecao.test.ts`.

---

## Bloco 2 — Painel de Combate / Iniciativa Integrado ao Modo Sessão

### M8.2a — Contrato `mesa-core` e sincronização de iniciativa no Atlas  ⬜
Objetivo: o Atlas publica o estado da iniciativa e dos combatentes do mapa aberto no barramento e atende comandos de iniciativa vindos da Mesa.
Depende de: —.
Ler: `Atlas/mesa-core/src/eventos.ts`, `Atlas/src/domain/iniciativa.ts`, `Atlas/src/ui/FaixaDeIniciativa.tsx`, `Atlas/src/ui/Dock.tsx` (como o Atlas inicia, avança e encerra a iniciativa), `Atlas/src/app/fichas.ts` (`ajustarRecursosDaPeca`, `recursosDaPeca`).
Arquivos: mudar `Atlas/mesa-core/src/eventos.ts`, `Atlas/docs/PLATAFORMA.md`, `Atlas/src/app/app.ts`; criar `Atlas/src/app/ponte-iniciativa.ts` e `Atlas/tests/unit/ponte-iniciativa.test.ts`; sincronizar `vendor/mesa-core/` em `Mesa`, `Dossie`, `Jukebox`, `Atelie`.
Como:
1. Em `Atlas/mesa-core/src/eventos.ts` (`CATALOGO`):
   - Fato `'atlas.iniciativa'`: `{ dono: 'atlas', especie: 'fato', obrigatorios: ['mapa', 'ativa', 'combatentes'] }`:
     - `mapa: Ref`;
     - `ativa: boolean`;
     - `rodada?: number`;
     - `atual?: number` (índice em `ordem`);
     - `ordem?: { tokenId: string; valor: number }[]`;
     - `combatentes: { tokenId: string; nome: string; jogador: boolean; estado: string; refs: Ref[]; pv?: number; pvMax?: number; pd?: number; pdMax?: number }[]`.
   - Pedido `'atlas.iniciativa-acao'`: `{ dono: 'atlas', especie: 'pedido', obrigatorios: ['acao'] }`, onde `acao` é:
     - `'estado'` (pede que o Atlas reemita `atlas.iniciativa` agora);
     - `'iniciar'` (inicia o combate com as peças do andar ativo no Atlas, ou com `entradas?: { tokenId: string; valor: number }[]`);
     - `'passo'` (`direcao: 1 | -1`, avança ou volta a vez e foca a câmera opcionalmente);
     - `'definir-valor'` (`tokenId: string, valor: number`);
     - `'focar-peca'` (`tokenId: string`, seleciona e centraliza a câmera do Atlas na peça);
     - `'ajustar-pv'` (`tokenId: string, deltaPv?: number, pv?: number, deltaPd?: number, pd?: number` — chama `ajustarRecursosDaPeca`, que atualiza `token.hp` para ameaças numeradas ou envia `ficha.ajustar-recursos` para o Dossiê!);
     - `'encerrar'` (limpa `session.initiative`).
2. Em `Atlas/src/app/ponte-iniciativa.ts`:
   - Observar mudanças em `sessao.value?.doc.value` (`tokens`, `session.initiative`) e `recursosDasFichas.value`, emitindo `atlas.iniciativa` no barramento.
   - Atender `atlas.iniciativa-acao` executando os comandos correspondentes na `store` do mapa aberto.
3. Compilar `npm run build:core` e sincronizar `vendor/mesa-core/` nos 4 repositórios.
Testes: `ponte-iniciativa.test.ts`: iniciar combate, avançar turno, definir valor, ajustar PV de peça com HP próprio e de peça ligada a ficha, e encerrar combate pelo barramento.
Pronto quando: o Atlas publica `atlas.iniciativa` e responde a todos os comandos de `atlas.iniciativa-acao`.
Commit: `(feature) sync atlas combat initiative and token hp over the event bus`

---

### M8.2b — Domínio e estado de combate na Mesa  ⬜
Objetivo: a Mesa mantém o estado reativo do combate combinando os dados do Atlas, os participantes da cena ativa e os recursos das fichas do Dossiê.
Depende de: M8.2a.
Ler: `Mesa/src/app/recursos-das-fichas.ts`, `Mesa/src/app/sessao.ts`, `Mesa/src/dominio/cenas.ts`, `Mesa/src/app/barramento.ts`.
Arquivos: criar `Mesa/src/dominio/combate.ts`, `Mesa/src/app/combate.ts` e `Mesa/tests/unit/combate.test.ts`.
Como:
1. Em `Mesa/src/dominio/combate.ts` (puro):
   - `CombatenteDaSessao = { tokenId: string; nome: string; jogador: boolean; valorIniciativa: number | null; ehVez: boolean; estado: string; entidadeId: string | null; fichaId: string | null; refFicha: Ref | null; retrato?: Blob; pv: number | null; pvMax: number | null; pd: number | null; pdMax: number | null; critico: boolean }`.
   - `montarEstadoDeCombate(eventoAtlas, entidades, recursosFichas): { ativa: boolean; rodada: number; combatentes: CombatenteDaSessao[]; daVez: CombatenteDaSessao | null }`:
     - Se `ativa` for `true`, ordena os combatentes conforme `ordem` do Atlas, resolve a entidade da campanha e o `retrato` por `refs`, e combina `pv`/`pd` priorizando `recursosFichas` (para personagens/fichas do Dossiê) ou o `pv`/`pvMax` local do token vindo do Atlas (para ameaças instanciadas 1, 2, 3).
     - Se `ativa` for `false`, ainda lista os tokens presentes no mapa (para o botão `"⚔ Iniciar Combate"` mostrar quantos combatentes estão no mapa).
   - `interpretarEntradaPv(texto: string, atual: number, max: number): { delta?: number; absoluto?: number } | null`: aceita `"-5"`, `"+4"` ou `"18"`.
2. Em `Mesa/src/app/combate.ts`:
   - Signal `estadoDoCombate` alimentado por `ouvirEvento('atlas.iniciativa', ...)` e atualizado quando `entidades` ou `recursosDasFichas` mudam.
   - Ao entrar no `ModoSessao`, pede `pedirNoBarramento('atlas.iniciativa-acao', { acao: 'estado' })`.
   - Funções de ação: `iniciarCombateNaSessao()`, `avancarTurno(1 | -1)`, `definirIniciativa(tokenId, valor)`, `ajustarPvCombatente(combatente, ajuste)`, `focarCombatente(combatente)` (foca a peça no Atlas e, se tiver `fichaId`, seleciona ou abre a aba dessa ficha em `PainelDasFichas`!).
Testes: `montarEstadoDeCombate` com PJs e ameaças numeradas, priorização de recursos e `interpretarEntradaPv`.
Pronto quando: `npm run typecheck` e `npm test` passam na Mesa.
Commit: `(feature) combat state domain and reactive synchronization in mesa`

---

### M8.2c — Faixa de Combate / Iniciativa + PV rápido no `ModoSessao.tsx`  ⬜
Objetivo: o Modo Sessão exibe uma faixa tática de iniciativa e PV rápido no topo, sincronizada com o Atlas e o Dossiê.
Depende de: M8.2b.
Ler: `Mesa/src/ui/ModoSessao.tsx`, `Mesa/src/app/combate.ts`, `Mesa/src/ui/estilo.css`.
Arquivos: criar `Mesa/src/ui/FaixaDeCombateSessao.tsx`; mudar `Mesa/src/ui/ModoSessao.tsx`, `Mesa/src/ui/estilo.css`; teste e2e em `Mesa/tests/e2e/sessao-combate.test.ts`.
Como:
1. Criar `Mesa/src/ui/FaixaDeCombateSessao.tsx`:
   - Quando não há combate ativo (`!combate.ativa`):
     - Mostra um botão compacto na barra da sessão (ou faixa recolhida): **`⚔ Iniciar combate`** (habilitado quando há peças no mapa do Atlas ou quando a cena ativa é um encontro `ehEncontro(cena)`).
   - Quando o combate está ativo (`combate.ativa`):
     - Exibe a faixa horizontal `.sessao-faixa-combate` logo abaixo de `.sessao-barra`:
       - **Controles de turno à esquerda:** selo **`Rodada N`**, botão **`◀`** (`data-testid="combate-turno-anterior"`), botão destaque **`Próximo turno ▶`** (`data-testid="combate-proximo-turno"`) e botão **`✕ Encerrar`** (`data-testid="combate-encerrar"`).
       - **Cartões compactos dos combatentes em fila (`role="list"`):**
         - O combatente da vez (`c.ehVez`) ganha borda dourada/destaque pulsante (`data-atual="true"`).
         - Retrato circular (ou inicial), nome, input numérico compacto de **Iniciativa** (`c.valorIniciativa`).
         - **Controle rápido de PV** (e PD em barra fina): botões **`−`** e **`+`** (`Shift+clique` ajusta `±5`) e clique no número `PV 18/20` abre input rápido inline para digitar `-7` ou `+4`.
         - Clicar no nome/retrato do combatente chama `focarCombatente(c)`: centraliza a câmera do Atlas na peça dele e troca a aba ativa do painel `Fichas` para a ficha dele!
       - Opção **"Seguir turno nas fichas"** (checkbox/pílula ligada por padrão): ao clicar em **`Próximo turno ▶`**, se o novo combatente da vez tiver ficha aberta nas abas do `ModoSessao`, o painel `Fichas` muda automaticamente para a aba dele!
Testes: e2e em `sessao-combate.test.ts`: simular `atlas.iniciativa` no barramento com 2 combatentes → a faixa aparece no Modo Sessão com a Rodada 1, o combatente da vez destacado e as barras de PV; clicar em `+`/`−` no PV ou em `Próximo turno ▶` envia `atlas.iniciativa-acao` e atualiza a faixa.
Pronto quando: durante o Modo Sessão, o mestre controla iniciativa, turnos e PV de PJs e ameaças numa faixa única sincronizada com o Atlas e o Dossiê.
Commit: `(feature) integrated combat initiative and quick hp bar in session mode`
