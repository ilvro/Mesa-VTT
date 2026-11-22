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

As etapas C e D são detalhadas quando a B fechar.

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

### E2a — Tags e grupos do Miro  ⬜
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

### E2b — Importar só algumas molduras  ⬜
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

### E2c — Revisão em massa  ⬜
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
