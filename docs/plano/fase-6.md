# Fase 6 — Quadro: experiência

Depois da auditoria da Fase 4 (bugs e desempenho corrigidos em 20/11/2026), esta fase acrescenta o que falta para o quadro substituir o Miro no dia a dia. As etapas seguem a ordem de valor para o mestre: primeiro conviver com o Miro (que ainda está em uso), depois jogar com o quadro, depois as ideias próprias da plataforma.

Regras para o executor: as mesmas da [fase-4.md](fase-4.md) (uma ficha por vez, `src/dominio` puro e testado, `npm run typecheck` e `npm test` passando, ficha marcada ✅ com `Nota:` dos desvios). **Não commite**: o Opus revisa e commita.

## Etapas

| Etapa | Fichas | Resultado |
|---|---|---|
| A — Conviver com o Miro | E1a–E1c | Reimportar um quadro do Miro atualizando o que mudou, sem perder o que foi feito na Mesa |
| B — Trazer melhor | E2a–E2c | Importar por moldura, tags e grupos do Miro, revisão em massa |
| C — Jogar | E3a–E3c | Modo leitura (roteiro), toque, projeção para os jogadores |
| D — Plataforma | E4a–E4d | Cartões vivos dos outros apps, modelos de cena, religar `[[Nome]]`, exportar quadro |



---

## Etapa A — Conviver com o Miro

**Ideia.** Cada item importado guarda de onde veio (`origem.miro`, o id do item no Miro) e uma **assinatura** do conteúdo que veio do Miro na última sincronização. Ao reimportar:

| Miro mudou? (assinatura nova ≠ guardada) | Mesa mudou? (assinatura do item atual ≠ guardada) | Resultado |
|---|---|---|
| não | — | nada |
| sim | não | atualiza o conteúdo e a geometria, mantém o que é da Mesa |
| sim | sim | **conflito**: mantém a versão da Mesa e marca para revisão |
| sumiu do Miro | não | remove |
| sumiu do Miro | sim | mantém e marca para revisão ("saiu do Miro") |
| novo no Miro | — | cria, marcado para revisão como na importação |
| continua no Miro | apagado na Mesa | não volta (o quadro guarda em `origem.vistos` os ids do Miro da última sincronização) |

Itens criados na Mesa (sem `origem`) nunca são tocados. Na revisão da E1c, o Opus acrescentou a última linha: sem ela, o que o mestre apagasse na Mesa voltaria a cada atualização.

O que é **da Mesa** e sobrevive à atualização: `semantica`, `revisao` já resolvida, `feito`, `travado`, `soMestre`, `grupoId`, `z`, `aoFocar`, os estilos (cores, fontes, bordas) e as ligações.

### E1a — Origem e assinatura no modelo e no conversor  ✅
Nota: testes de validação e assinatura em `tests/unit/sincronia-miro.test.ts` (a E1b usará o mesmo arquivo); a origem do conversor é preenchida no fim, por mapa reverso de `mapaId`.
Objetivo: todo item importado sabe de qual item do Miro veio e qual era o conteúdo.
Ler: `src/dominio/quadro.ts` (tipos, `validarItem`, `validarQuadro`, `CHAVES_*`), `src/dominio/miro.ts` (`converterMiro`), `src/app/importar-miro.ts`, `tests/unit/miro.test.ts`.
Arquivos: `src/dominio/quadro.ts`, `src/dominio/miro.ts`, criar `src/dominio/sincronia-miro.ts`, `src/app/importar-miro.ts`, testes.
Como:
1. **Modelo** (`quadro.ts`): na base do item, `origem?: { miro: string; assinatura: string }`; no `Quadro`, `origem?: { miroBoardId: string; sincronizadoEm: number }`. Validação aceita os dois campos (opcionais, textos/números) e continua recusando campo desconhecido. `VERSAO_QUADRO` não muda (campo opcional).
2. **`sincronia-miro.ts`** (puro): `assinaturaDoMiro(item): string` = hash curto (FNV-1a 32 bits, em hex) de um JSON estável com o que vem do Miro: `tipo`, geometria arredondada a 0,5 px (`x`, `y`, `largura`, `altura`, `rotacao`) e o conteúdo do tipo (`doc` para texto e forma, mais `forma`; `titulo` da moldura; `imagemId`; `de`, `para`, `rota`, `rotulo` da seta; estilos de texto e caixa **não** entram, para o mestre poder repintar sem gerar conflito; na seta, a caixa também não entra, porque ela muda sozinha quando um item ligado se move). Ordem de chaves fixa.
3. **Conversor:** cada item e cada seta convertidos recebem `origem = { miro: <id do item ou conector no Miro>, assinatura: assinaturaDoMiro(item) }`, calculada depois de o item estar completo (posição absoluta, `molduraId`, pontas). Nova opção `idExistente?: (miroId: string) => string | undefined`: quando devolve um id, o item convertido usa esse id em vez de `novoId()` (assim pontas de setas e `molduraId` batem com os itens que já existem na Mesa).
4. **Importação:** o quadro novo grava `origem = { miroBoardId: bruto.board.id, sincronizadoEm: agora }` (só se o pacote tiver `board.id`).
Testes: validação aceita `origem` e recusa campo extra dentro dela; assinatura estável (mesmo item → mesma assinatura; mudar a cor de fundo não muda; mover 10 px muda; mudar o texto muda); conversor põe `origem` em todos os itens e setas; `idExistente` reaproveita ids e religa setas e molduras.
Commit: `board items remember their miro origin`

### E1b — Plano de atualização (puro)  ✅
Nota: `tipo` diferente entre atual e novo vira conflito; `atualizadoEm` entra nas ops (antes/depois). Na revisão do Opus, os estilos (`caixa`, `texto` e, na seta, `cor`, `espessura`, `tracejado`, `inicio`, `fim`) passaram a ser campos da Mesa: a assinatura os ignora para o mestre poder repintar, e a atualização também não desfaz a pintura.
Objetivo: comparar o quadro atual com uma conversão nova e produzir um passo de desfazer com tudo o que muda.
Depende de: E1a.
Ler: `src/dominio/quadro-operacoes.ts` (`Passo`, `Operacao`), a tabela acima.
Arquivos: `src/dominio/sincronia-miro.ts`, `tests/unit/sincronia-miro.test.ts`.
Como: `planejarAtualizacaoDoMiro(atuais: ReadonlyMap<string, Item>, novos: readonly Item[], agora: number): { passo: Passo; relatorio: { novos: number; atualizados: number; removidos: number; conflitos: number; saiuDoMiro: number } }`.
- Pareia por `origem.miro`. `novos` já vem com ids reaproveitados (E1a), então o id do par é o mesmo.
- **Atualizar:** o item novo substitui o atual campo a campo numa op `alterar`, exceto os campos da Mesa (lista na "Ideia"), que ficam como estão. `origem.assinatura` passa a ser a nova. Se o item tinha `revisao` pendente, ela continua; se não tinha, não ganha.
- **Conflito e "saiu do Miro":** só uma op `alterar` com `revisao: { tipoSugerido: <o atual ou null>, motivos: ['Mudou no Miro e aqui; ficou a versão daqui'], origem: 'miro' }` (ou `'Saiu do Miro'`). No conflito, a assinatura passa a ser a nova do Miro (a partir de agora, a versão daqui conta como edição local sobre ela).
- **Remover** e **criar** em ops próprias, com `z` dos novos acima do maior `z` atual.
- O `passo` pode ter as três ops; vazio quando nada mudou.
Testes: cada linha da tabela; campos da Mesa preservados; itens sem `origem` intocados; relatório certo; `aplicar(atuais, passo)` + `inverter` volta ao estado inicial.
Commit: `added miro update plan for imported boards`

### E1c — "Atualizar do Miro…" na tela  ✅
Nota: botão só na barra do quadro (não no cartão); `lerPacoteMiro` extraída em `importar-miro.ts`; `marcarSincronizadoComMiro` em `quadros.ts`. Fixtures `atualizacao-v1/v2.json`; no e2e o contador da fila mostra "faltam 3" porque as notas importadas ainda não revisadas continuam na fila.
Objetivo: o mestre baixa o `.miro.zip` de novo e atualiza o quadro já importado.
Depende de: E1b.
Ler: `src/app/importar-miro.ts`, `src/app/quadros.ts` (`executar`, `quadroAberto`, `mudarFundo` como exemplo de gravar o `Quadro`), `src/ui/quadro/Quadros.tsx` (botão de importar), `src/ui/quadro/Quadro.tsx` (barra do quadro), `src/ui/quadro/FilaDeRevisao.tsx`, `tests/e2e/quadro.test.ts`.
Arquivos: `src/app/importar-miro.ts`, `src/app/quadros.ts` (só se precisar gravar `origem.sincronizadoEm`), `src/ui/quadro/Quadro.tsx`, `src/ui/quadro/Quadros.tsx`, `src/ui/estilo.css`, `docs/miro.md`, `tests/e2e/quadro.test.ts`.
Como:
1. `atualizarQuadroDoMiro(arquivo)`: lê o zip como a importação, guarda as imagens, confere `bruto.board.id === quadroAberto.origem.miroBoardId` (senão, erro claro: "Este pacote é de outro quadro do Miro"), converte com `idExistente` a partir dos itens do quadro aberto, planeja e aplica com **um** `executar` (rótulo "Atualizar do Miro"; um Ctrl+Z desfaz tudo). Grava `origem.sincronizadoEm`.
2. **Barra do quadro:** botão "Atualizar do Miro…" (`data-testid="botao-atualizar-miro"`) só em quadros com `origem`. Abre o seletor de arquivo `.miro.zip`.
3. **Relatório:** aviso com "N novos, N atualizados, N removidos, N para revisar"; se houve revisão nova, abre a fila de revisão.
4. **Quadros importados antes desta fase** (sem `origem`): o botão não aparece. Anotar em `docs/miro.md` que é preciso importar de novo uma vez.
5. `docs/miro.md`: seção "Atualizar um quadro já importado", com a tabela de regras em linguagem simples.
Testes: e2e com duas fixtures pequenas do mesmo quadro (`tests/unit/fixtures/miro/`, escritas à mão): importar a primeira → editar uma nota na Mesa → atualizar com a segunda (uma nota mudada no Miro, uma removida, uma nova, a nota editada também mudada no Miro) → o relatório bate, o conflito aparece na fila, Ctrl+Z volta tudo.
Commit: `added update from miro for imported boards`

---

## Etapa B — Trazer melhor

### E2a — Tags e grupos do Miro  ✅
Nota: pela documentação da API v2 (lida em 20/11/2026): `GET /tags` pagina por `offset`/`limit` (até 50) e devolve `{ id, title, fillColor }`; `GET /groups` pagina por `cursor` e devolve `{ id, data: { items: [ids] } }`. Os itens **não** trazem `tagIds` na listagem (a doc não mostra o campo); o script então chama `GET /items?tag_id=` por tag e grava `tagIds` em cada item do pacote. Esse caminho não foi testado contra a API real (sem token), por isso tags e grupos são opcionais no script (falha vira aviso) e o conversor tolera `tagIds` ausente, ids numéricos ou objetos `{ id }`. Prioridade marcador > tag > cor via 5º parâmetro de `sugerirRevisaoMiro`; `grupoId` só nos itens (não nas setas importadas além dos membros do grupo).
Objetivo: o que o mestre já organizou no Miro com tags e grupos chega organizado.
Depende de: E1c.
Ler: `scripts/miro-baixar.mjs`, `src/dominio/miro.ts` (`sugerirRevisaoMiro`), `src/dominio/paleta.ts`, a documentação da API REST v2 do Miro para tags (`GET /v2/boards/{id}/tags`, e o campo `tagIds` dos itens) e grupos (`GET /v2/boards/{id}/groups`).
Arquivos: `scripts/miro-baixar.mjs`, `src/dominio/miro.ts`, `src/dominio/sincronia-miro.ts` (se a assinatura precisar ignorar algo), `docs/miro.md`, testes e fixtures.
Como:
1. **Script:** baixa tags e grupos (paginando, como itens) e grava crus em `quadro.json` (`tags`, `groups`). `--so-contar` mostra quantas tags e grupos há. Se o formato da resposta não for o esperado, grave cru e registre na `Nota:`; não adivinhe.
2. **Grupos:** cada grupo do Miro vira um `grupoId` (id novo por grupo) nos itens dele. Na atualização (E1b), `grupoId` é campo da Mesa e não muda.
3. **Tags → tipo:** tabela `TAGS_PARA_TIPO` (sem acento e minúsculo): `teste`, `pericia`, `percepcao` → teste; `segredo` → segredo; `loot`, `tesouro`, `item` → loot; `npc`, `fala`, `dialogo` → fala; `leitura`, `ler`, `narracao` → leitura; `evento` → evento; `tarefa`, `todo` → tarefa; `rever`, `revisar` → rever; `titulo` → titulo. Ordem de prioridade da sugestão: marcador no texto > tag > cor. O motivo fica em português ("tag \"Segredo\"").
4. Tags que não estão na tabela entram nos `motivos` ("tags: Lysdal, Ato 2"), para o mestre ver na fila.
Testes: fixture com tags e grupo; prioridade marcador > tag > cor; grupo vira `grupoId` comum.
Commit: `miro import brings tags and groups`

### E2b — Importar só algumas molduras  ✅
Nota: código puro em `src/dominio/molduras-miro.ts` (`moldurasDoPacote`, `itensSoltosDoPacote`, `filtrarPacote`); diálogo em `src/ui/quadro/DialogoMolduras.tsx`. O filtro vai em `quadro.origem.molduras` (ids do Miro) e `soltos`; ausente = quadro inteiro, e marcar tudo também não grava filtro. O pacote é filtrado antes de guardar imagens e de converter, então `vistos` só tem os ids do pacote filtrado (um item que entre depois numa moldura escolhida é novo). Um item que sai de uma moldura escolhida no Miro deixa de vir e cai na regra "sumiu do Miro" (aceito). Conector fica se as duas pontas ficaram; ponta livre vale se cai numa moldura escolhida ou se `soltos` (e fora de qualquer moldura). Pacote sem molduras importa direto, sem diálogo. Com uma só moldura (sem soltos), o título dela nomeia o quadro. Fixture `tests/unit/fixtures/miro/molduras.json`.
Objetivo: dividir um quadro gigante do Miro em quadros menores da Mesa (um por aventura ou arco).
Depende de: E1c.
Ler: `src/dominio/miro.ts`, `src/app/importar-miro.ts`, `src/ui/quadro/Quadros.tsx`.
Arquivos: `src/dominio/miro.ts` (ou um arquivo novo puro), `src/dominio/quadro.ts` (`origem.molduras`), `src/dominio/sincronia-miro.ts`, `src/app/importar-miro.ts`, `src/ui/quadro/Quadros.tsx`, `src/ui/estilo.css`, testes.
Como:
1. **Puro:** `moldurasDoPacote(bruto)` lista as molduras do Miro (id, título, quantos itens) em ordem de leitura; `filtrarPacote(bruto, { molduras: string[]; soltos: boolean })` mantém as molduras escolhidas, os itens filhos delas (`parent.id`, e geometricamente contidos quando não houver `parent`), os soltos se pedido, e os conectores cujas duas pontas ficaram (ou são livres e caem dentro do que ficou).
2. **Tela:** "Importar do Miro…" abre primeiro um diálogo com a lista de molduras (caixas de marcar, busca, "marcar todas") e "itens fora de molduras". O nome do quadro novo sugere o título da moldura quando só uma for escolhida.
3. **Sincronia:** o filtro escolhido fica em `quadro.origem.molduras` (e `soltos`), e "Atualizar do Miro" aplica o mesmo filtro, para não trazer de volta o que ficou de fora.
Testes: filtro mantém filhos e conectores internos, descarta conectores que saem; o quadro guarda o filtro e a atualização o respeita.
Commit: `import chosen miro frames into a board`

### E2c — Revisão em massa  ✅
Nota: `passoDeRevisaoEmMassa(itens, ids, tipo, rotulo?)` sem o parâmetro `agora` (não há timestamp a gravar); os textos dos motivos de conflito/saída são constantes locais em `revisao.ts` (copiadas de `sincronia-miro.ts`). "Aceitar todos desta moldura" também passou a deixar conflitos e saídas de fora. Filtro por tipo e por conflitos no topo da fila; e2e em `tests/e2e/quadro.test.ts`.
Objetivo: revisar centenas de itens importados sem clicar um por um.
Depende de: E1c.
Ler: `src/ui/quadro/FilaDeRevisao.tsx` (`aplicarTipo`, `aceitarMoldura`), `src/app/quadros.ts` (`executar`).
Arquivos: criar `src/dominio/revisao.ts` + teste; mudar `FilaDeRevisao.tsx` e `estilo.css`.
Como:
1. **Puro:** `resumoDaRevisao(itens)` dá, por tipo sugerido (e "sem sugestão"), quantos itens e os ids; `passoDeRevisaoEmMassa(itens, ids, tipo | null, agora)` aplica o tipo (como o "Aceitar" faz hoje) e tira a `revisao` num único passo.
2. **Topo da fila:** uma linha por tipo sugerido, com a cor da paleta e o número: "Aceitar 42 testes", "Aceitar 17 segredos"… e "31 sem sugestão → sem tipo". Cada uma pede confirmação e é **um** Ctrl+Z.
3. **Filtro:** clicar no tipo filtra a lista abaixo para só aquele tipo (para conferir antes de aceitar em massa).
4. Conflitos e "saiu do Miro" (E1b) **não** entram no aceite em massa; aparecem num grupo próprio no topo.
Testes: resumo; passo em massa e desfazer; conflitos fora do aceite em massa.
Commit: `bulk review of imported board items`

---

## Etapa C — Jogar

### E3a — Modo leitura (roteiro do quadro)  ⬜
Objetivo: durante o jogo, ler o quadro como uma página contínua, moldura por moldura, sem caçar com zoom. É a parte "nota do Obsidian" do quadro.
Ler: `src/dominio/molduras.ts` (`ordemDeLeitura`, `filhos`), `src/ui/quadro/TextoDecorado.tsx` (`ConteudoDecorado`, `aoClicarTextoDecorado`), `src/ui/quadro/Item.tsx` (condições, feito), `src/app/foco-do-quadro.ts` (`aoFocarMoldura`, `ultimaMolduraFocada`), `src/ui/ModoSessao.tsx`.
Arquivos: criar `src/dominio/roteiro-do-quadro.ts` + teste e `src/ui/quadro/LeituraDoQuadro.tsx`; mudar `Quadro.tsx` (chave "Quadro | Ler" na barra) e `estilo.css`.
Como:
1. **Puro:** `roteiroDoQuadro(itens): { moldura: ItemMoldura | null; itens: Item[] }[]`: molduras em ordem de leitura (aninhadas logo depois da mãe, com nível), itens de cada moldura em ordem de leitura (linhas por `y` com tolerância de 1/3 da altura, depois `x`), soltos no fim. Entram texto, forma, ref e imagem; setas e traços ficam de fora.
2. **Tela:** coluna de leitura (largura confortável, ~70 caracteres), título da moldura como cabeçalho, cada item com o fundo da sua cor (paleta), chips, condições e ✓ clicável como no quadro; imagens em largura total; cartões de entidade compactos. Índice lateral com as molduras; clicar rola até ela.
3. **Ligação com o quadro:** "ver no quadro" em cada item enquadra o item no modo Quadro; ao rolar a leitura, a moldura que está no topo dispara `aoFocarMoldura` (mesma regra do `PageDown`, inclusive "Molduras agem"); no modo Seguir da sessão, a leitura rola até a moldura focada.
4. Itens `soMestre` e segredos aparecem (o mestre lê); o filtro "esconder segredos" do quadro vale aqui também.
Testes: `roteiroDoQuadro` (aninhamento, ordem dentro da moldura, soltos, setas fora); e2e: alternar para Ler, clicar numa moldura do índice, voltar ao quadro com "ver no quadro".
Commit: `added reading mode for boards`

### E3b — Projeção do quadro para os jogadores  ⬜
Objetivo: mostrar aos jogadores uma moldura (um handout, um mapa desenhado, uma pista) na TV ou no segundo monitor, sem nada do mestre.
Ler: `src/app/desktop.ts` (`abrirProjetorNoSegundoMonitor`, que já abre o projetor do Atlas no segundo monitor), `src/app/rotas.ts`, `src/app/barramento.ts`, `src/dominio/busca-quadro.ts` (`itemEhSecreto`), `src/ui/quadro/Mundo.tsx`.
Arquivos: criar `src/dominio/projecao.ts` + teste e `src/ui/quadro/ProjecaoDoQuadro.tsx`; mudar `src/app/desktop.ts` (aceitar a URL do projetor como parâmetro em vez de só a do Atlas, sem mudar o comportamento do Atlas), `src/app/rotas.ts` (rota `#/projecao/{quadroId}`), `src/ui/App.tsx`, `MenuDoItem.tsx` (moldura: "Mostrar aos jogadores"), `estilo.css`.
Como:
1. **Puro:** `itensParaJogadores(itens, molduraId)`: só os itens da moldura (com `comConteudo`), sem `soMestre`, sem `segredo`, sem itens com condição falsa, sem `revisao` pendente; marcadores de teste (`[PERCEPÇÃO 13]`) e chips do mestre **não** aparecem (o texto é desenhado sem `decorar`, e os trechos-marcador são retirados).
2. **Janela de projeção:** a rota `#/projecao/{quadroId}` desenha só a moldura escolhida, enquadrada na tela inteira, sem barra, sem seleção, fundo do quadro. Ela lê os itens do banco e escuta um canal próprio (`BroadcastChannel('mesa:projecao')`) com `{ quadroId, molduraId }` e com "atualizar" quando o mestre muda algo na moldura projetada.
3. **No quadro do mestre:** "Mostrar aos jogadores" no menu da moldura abre (ou reaproveita) a janela no segundo monitor e manda a moldura; um selo "Projetando: <moldura>" na barra, com "Parar" (tela preta).
4. Segurança: a janela de projeção nunca recebe nada fora de `itensParaJogadores`; teste isso.
Testes: `itensParaJogadores` (segredo, só mestre, condição falsa, revisão, marcadores retirados); e2e: abrir a rota de projeção de uma moldura com um segredo e conferir que ele não aparece.
Commit: `project a board frame to the players`

### E3c — Tela de toque  ⬜
Objetivo: usar o quadro num notebook com tela de toque (pinça para zoom, dois dedos para mover). Um tablet separado **não** é alvo: os dados da Mesa ficam no navegador deste computador.
Ler: `src/ui/quadro/Quadro.tsx` (`aoPressionar`, `processarMover`, roda), `src/dominio/camera.ts`.
Arquivos: `src/dominio/camera.ts` (`pinca(cameraInicial, p1a, p2a, p1b, p2b)`) + teste; `Quadro.tsx`.
Como: com `pointerType === 'touch'`, dois dedos = pinça (zoom no ponto médio) e arrasto da câmera; um dedo no vazio = mover a câmera (como no Miro em toque), um dedo num item = selecionar e mover; toque longo = menu do item. Caneta (`pen`) continua desenhando com pressão.
Testes: `pinca` mantém o ponto médio fixo.
Commit: `touch gestures on boards`

---

## Etapa D — Plataforma

### E4a — Cartões vivos  ⬜
Objetivo: o cartão de uma personagem no quadro mostra PV e PD atuais, vindos da Ficha.
Ler: `src/ui/quadro/ItemRef.tsx`, `src/app/barramento.ts`, o evento `ficha.recursos` (`{ ficha, pv, pvMax, pd, pdMax }`, em `vendor/mesa-core`).
Arquivos: criar `src/app/recursos-das-fichas.ts`; mudar `ItemRef.tsx`, `src/main.tsx` (iniciar a escuta), `estilo.css`.
Como: guardar em memória (signal) o último `ficha.recursos` por Ref de ficha, durante a sessão do app; o cartão da entidade que tem esse Ref mostra duas barras finas (PV, PD) com os números. Sem dado, nada aparece.
**Fora desta ficha:** miniatura do mapa do Atlas no cartão. Precisa de mudança no Atlas (oferecer a miniatura pelo contrato) e da autorização do mestre.
Testes: e2e simulando `ficha.recursos` no barramento e conferindo as barras.
Commit: `live hit points on character cards`

### E4b — Modelos de cena  ⬜
Objetivo: guardar uma seleção (por exemplo, a moldura padrão com leitura, testes, segredo e loot) e carimbá-la com um clique.
Ler: `src/dominio/area-de-transferencia.ts` (`copiar`, `colar`), `src/app/banco-quadros.ts` (versão do banco e stores), `src/ui/quadro/BarraDeFerramentas.tsx`, `MenuDoItem.tsx`.
Arquivos: `src/app/banco-quadros.ts` (versão 2, store `modelos` com `{ id, nome, campanhaId | null, conteudo: string, criadoEm }`; a migração só cria a store), `src/app/modelos.ts`, `MenuDoItem.tsx` ("Salvar como modelo…"), `BarraDeFerramentas.tsx` (ferramenta Modelo, com a lista; clicar no quadro carimba no ponto), `estilo.css`, testes.
Como: o conteúdo é o texto de `copiar(comConteudo(seleção))`; carimbar é `colar` no ponto clicado. Modelos são da campanha ou "de todas as campanhas" (escolha ao salvar). Renomear e apagar na lista.
Testes: banco com `fake-indexeddb` (abrir v1 existente e migrar para v2 sem perder nada); e2e salvar e carimbar.
Commit: `scene templates for boards`

### E4c — Religar `[[Nome]]` quando a entidade nasce  ✅
Nota: `itensQueCitam` cobre também falas `[SINDRE]` e rótulos (como `refsDoItem`); `nomesNovos`/`chavesDeNomes` puros no mesmo arquivo; a observação (`iniciarReligacaoDeNomes`, chamada em `main.tsx`) guarda os nomes por campanha e só adiciona ligações (não remove); `Entidade` não tem apelidos, só `nome` conta.
Objetivo: um `[[Teodor]]` escrito antes de existir a entidade vira ligação sozinho quando ela é criada (hoje só ao editar o item de novo).
Ler: `src/app/ligacoes-quadro.ts` (`sincronizarLigacoesDoItem`, `refsDoItem`), `src/dominio/prontidao.ts` (como acha `[[ligações]]` sem destino), `src/app/campanha.ts` (`entidades`).
Arquivos: `src/dominio/ligacoes-quadro.ts` (`itensQueCitam(nomes, itens)`, puro) + teste; `src/app/ligacoes-quadro.ts` (observar as entidades novas e resincronizar, em segundo plano, os itens de todos os quadros da campanha que citam o nome).
Como: ao mudar `entidades`, comparar com o conjunto anterior de nomes (e apelidos, se houver); para os nomes novos, ler os itens dos quadros (o aberto da memória) e chamar a sincronização só nos que citam. Sem nomes novos, nada é lido.
Testes: puro de `itensQueCitam` (acento e caixa ignorados, como na resolução de ligações).
Commit: `board links follow newly created entities`

### E4d — Exportar e importar um quadro  ⬜
Objetivo: guardar uma cópia de um quadro (ou mandar para outra campanha ou outro computador) num arquivo só.
Ler: `src/app/banco-quadros.ts`, `src/app/importar-miro.ts` (leitura de zip com `fflate`), `src/dominio/area-de-transferencia.ts` (ids novos e religação).
Arquivos: criar `src/dominio/pacote-quadro.ts` + teste e `src/app/exportar-quadro.ts`; mudar `Quadros.tsx` (menu do cartão: "Exportar…"; botão "Importar quadro…"), `estilo.css`.
Como: `.mesa-quadro.zip` com `quadro.json` (`{ formato: 'mesa-quadro', versao: 1, quadro, itens }`) e `imagens/<id>`. Importar cria um quadro novo na campanha ativa com ids novos (setas, molduras e grupos religados), revalidando cada item; `origem` do Miro é mantida (o quadro continua atualizável). As ligações com entidades não vão no pacote: são recriadas pela sincronização se os nomes existirem.
Testes: exportar → importar dá o mesmo quadro com ids novos; pacote inválido é recusado com mensagem clara.
Commit: `export and import a board as a file`
