# Fase 5 — Mesa mais fácil de usar

Plano escrito em 14/11/2026 contra o código desse dia. O usuário reclamou de quatro coisas:

1. não consegue editar as etiquetas de cenas, mapas e personagens que já existem;
2. o modo sessão mostra informação demais, e ele não sabe como usá-lo;
3. a interface pode melhorar;
4. quer tirar os temas "Mesa", "Ordem", "Vigília" e "Neutro".

**Decisões do usuário (14/11):**
- **Etiquetas:** afrouxar o contrato. Qualquer app pode alterar `tags` e `notas` de qualquer entidade. O nome, o retrato, as referências alheias e a remoção continuam só com o dono.
- **Temas:** tirar a escolha **só na Mesa**. A Mesa fica sempre no tema `atlas`. O `mesa-core`, o Atlas e os outros apps não mudam nessa parte.

## Regras

- Faça **uma ficha por vez, na ordem**. Leia `Mesa/AGENTS.md` antes. Na U1, leia também `Atlas/AGENTS.md`.
- Não commite. Ao fim de cada ficha:
  - rode `npm run typecheck` e `npm test` no projeto mexido;
  - marque a ficha com ✅;
  - acrescente uma `Nota:` com o que divergiu do plano;
  - sugira o commit indicado.
- Os e2e (`npm run test:e2e`) citados em cada ficha precisam ser **atualizados** para os seletores novos. Rode-os quando a ficha pedir.
- Identificadores, comentários e textos em português. `src/dominio` é puro. A UI altera dados só por funções de `src/app`.
- Use as classes e os tokens de `src/ui/estilo.css`. Não crie cores novas.

### Por que as etiquetas não editam hoje

- Em `Mesa/src/ui/Entidades.tsx` (função `Detalhe`, linha ~455), o campo `campo-tags` fica `disabled={!editavel}`, e `editavel = podeEditar(e)` é verdadeiro só quando `criadaPor === 'mesa'`.
- Mapas são criados pelo Atlas e personagens e ameaças pelo Dossiê, então lá o campo aparece travado.
- O próprio repositório recusa a gravação: `Atlas/mesa-core/src/campanha.ts`, `salvarEntidade`, linha ~221, só deixa um app alheio mexer nas próprias `refs`.
- As cenas são da Mesa e já editam, mas o campo é um texto solto "separado por vírgula" que só grava ao sair dele. Por isso parece que não funciona.
- O Atlas (`Atlas/src/app/campanha.ts`, ~85) e o Dossiê (`Dossie/src/mesa.js`, ~166–180) **já preservam** as `tags` e as `notas` que outros escrevem, porque espalham `...existente`. Afrouxar a regra não exige mudança neles.

---

## Etapa A — Etiquetas

### U1 — Contrato: qualquer app edita etiquetas e notas  ✅
**Nota:** Nenhuma divergência. (Ressalva: a comparação do retrato usa JSON, então só detecta troca de presença/ausência, não de conteúdo do Blob; já era assim.)
**Projeto:** `Atlas/` (só `mesa-core/` e a doc). Depois, copiar o `dist` para a Mesa.

**Ler:**
- `Atlas/mesa-core/src/campanha.ts`, `salvarEntidade` (linhas ~215–229);
- `Atlas/mesa-core/tests/campanha.test.ts`, os testes de "só altera as próprias referências";
- `Atlas/docs/PLATAFORMA.md`, linha ~126 (a tabela, linha "Campanha").

**Como:**
- Para uma entidade criada por outro app, a comparação `semRefsProprias` passa a ignorar também `tags` e `notas`:
  ```ts
  const fixo = (e: Entidade) => JSON.stringify({ ...e, refs: undefined, tags: undefined, notas: undefined, atualizadaEm: undefined });
  ```
  A checagem das refs alheias (`alheias`) continua igual.
- A mensagem de erro passa a ser `${app} só altera etiquetas, notas e as próprias referências de uma entidade criada por ${dono}.`
- `validarEntidade` continua valendo para as `tags` e `notas` novas (limites do contrato).
- Testes novos em `campanha.test.ts`:
  - um app alheio altera `tags` e `notas` → aceita;
  - um app alheio altera `nome` ou `retrato` → recusa;
  - um app alheio remove → recusa (já deve existir; confira).
- `PLATAFORMA.md`, linha 126: "quem criou a entidade altera tudo; os outros só as etiquetas, as notas e as próprias referências".
- `npm run build:core` no Atlas e depois `cp -r ../Atlas/mesa-core/dist/. vendor/mesa-core/` na Mesa. **Não** copie para Dossiê, Ateliê, Jukebox nem Tabletop: eles não precisam.

**Verificar:** no Atlas, `npm run typecheck` e `npm test`. Na Mesa, `npm run typecheck` e `npm test`.
**Commit (Atlas):** `let any app edit tags and notes of shared entities`

### U2 — Mesa: liberar etiquetas e notas de qualquer entidade  ✅
**Nota:** `comRefDaMesa` (~263, `ligarRefs`) ficou com `podeEditar`: ele só atua em entidades `mesa`, e a ref da Mesa em entidade alheia já é criada pela sincronização de menções, que agora usa `podeEditarConteudo`. O botão "Abrir no {app}" usa a ref do app dono (`e.refs.find(app === criadaPor)`) e `enderecoDe`. Sem teste unitário direto de `alterarEntidade` (exige o banco); a recusa de nome vale na tela/ponte e o repositório a reforça. e2e não rodado.
**Ler:**
- `src/dominio/entidades.ts`, linha ~231 (`podeEditar`, `podeRemover`);
- `src/ui/Entidades.tsx`, a função `Detalhe`;
- `src/ui/EditorDeNota.tsx`;
- `src/app/campanha.ts`, `alterarEntidade` (~249) e a sincronização de menções (~230 e ~263);
- `src/app/ponte-escrita.ts`, linha ~214.

**Como:**
- Em `dominio/entidades.ts`, acrescente:
  ```ts
  /** Etiquetas e notas: qualquer app altera (contrato, U1). Nome, retrato e remoção: só o dono (`podeEditar`). */
  export const podeEditarConteudo = (_e: Pick<Entidade, 'criadaPor'>): boolean => true;
  ```
  Mantenha a função, mesmo que sempre devolva `true`: ela documenta a regra e deixa a tela legível.
- `Detalhe`:
  - o campo de nome continua travado para entidade alheia;
  - as etiquetas e o `EditorDeNota` usam `podeEditarConteudo`;
  - o aviso `so-leitura` passa a dizer: "O nome vem do {app}: renomeie lá. Etiquetas e notas você edita aqui." Quando houver ref com endereço (`enderecoDe`), mostre um botão "Abrir no {app}".
- `campanha.ts`:
  - `alterarEntidade` recusa `nome` em entidade alheia, com um aviso claro, e aceita `tags` e `notas`;
  - a sincronização de menções (~230) passa a usar `podeEditarConteudo`, porque as ligações `menciona` são da Mesa;
  - garanta que `comRefDaMesa` continue permitido: é ref própria.
- `ponte-escrita.ts` (~214): permita `tags` e `notas` em entidade alheia e recuse só `nome`, com a mesma frase.
- `EditorDeCena` não muda, porque as cenas são da Mesa.

**Testes:**
- unit para `alterarEntidade`, ou para a ferramenta da ponte, com uma entidade `criadaPor: 'atlas'`: tags aceitas, nome recusado;
- atualize `tests/e2e/hub.test.ts` (~50, `so-leitura`) para o texto novo e para o campo de etiquetas habilitado.

**Commit:** `allow editing tags and notes of maps and characters`

### U3 — Editor de etiquetas em chips  ✅
**Nota:** `CampoDeEtiquetas.tsx` grava a cada mudança; `adicionarTags`/`removerTag` puras em `dominio/entidades.ts`; e2e do `hub.test.ts` adaptado (não rodado).
**Ler:** `src/ui/Entidades.tsx` (`Detalhe`), `src/dominio/entidades.ts` (`lerTags`, `contarPorTag`, `semAcento`) e `src/ui/GradeDeColecao.tsx` (~220, `cartao-tags`, para o visual).

**Como:**
- Em `dominio/entidades.ts`, crie funções puras:
  - `adicionarTags(atuais, texto)`: aceita "a, b" e ignora repetidas sem acento, usando `lerTags`;
  - `removerTag(atuais, tag)`.
  Respeite os limites de `lerTags` (50 etiquetas, 40 caracteres).
- Novo componente `src/ui/CampoDeEtiquetas.tsx`, com `data-testid="campo-etiquetas"`:
  - cada etiqueta vira um chip com ×, `data-testid="etiqueta-<chave>"`;
  - no fim fica um `input`, `data-testid="campo-tags"` (mantenha o id para os e2e):
    - Enter, vírgula ou Tab adicionam a etiqueta;
    - Backspace com o campo vazio remove a última;
    - sair do campo com texto também adiciona;
  - um `datalist` sugere as etiquetas já usadas na campanha (`contarPorTag(entidades.value)`);
  - **cada mudança grava na hora**, por `alterarEntidade(e, { tags })`; não espera o blur;
  - clicar no nome do chip filtra a coleção por ela (`tagAtiva`);
  - com `disabled`, mostra só os chips.
- Troque o campo de texto do `Detalhe` por `<CampoDeEtiquetas e={e} />` e tire "(separadas por vírgula)" do rótulo.
- CSS: reaproveite `.cartao-tag` e `.chip`. O contêiner é parecido com um `input`: borda `var(--linha)` e foco com `var(--acento)`.

**Testes:**
- unit de `adicionarTags` e `removerTag`;
- atualize `tests/e2e/hub.test.ts` (~63 e ~85) para digitar e dar Enter e para remover por ×.

**Commit:** `added chip editor for entity tags`

### U4 — Renomear e apagar uma etiqueta em toda a campanha  ⬜
**Ler:** `src/ui/Entidades.tsx`, `SidebarColecao` (a lista `tag-item`), e `src/app/campanha.ts` (`alterarEntidade`, `entidades`).

**Como:**
- Pura, em `dominio/entidades.ts`: `renomearTag(tags, chaveDe, para)`. Ela troca a etiqueta (comparando sem acento), funde se `para` já existir e, com `para` vazio, remove.
- Em `app/campanha.ts`, crie `renomearEtiquetaNaCampanha(chave, para)`. A função:
  - percorre `entidades.value`;
  - grava só as que mudam;
  - avisa ao fim: "Etiqueta renomeada em N itens." ou "removida de N itens.";
  - se a `tagAtiva` era a antiga, passa a ser a nova, ou `null`.
- Na barra lateral, cada `tag-item` ganha, no hover e no foco, um botão ✎ (`data-testid="tag-editar-<chave>"`). Ele troca o item por um `input` com o nome:
  - Enter salva;
  - Esc cancela;
  - um botão "Apagar" pede confirmação inline, como o "Remover mesmo" do `Detalhe`.
- Nada de `prompt()` nem `confirm()`.

**Testes:** unit de `renomearTag` (troca, fusão, remoção e acentos) e de `renomearEtiquetaNaCampanha`, com `fake-indexeddb`.
**Commit:** `added rename and delete for tags across the campaign`

---

## Etapa B — Temas

### U5 — Tirar a escolha de tema da Mesa  ⬜
**Ler:**
- `src/ui/Cabecalho.tsx`;
- `src/app/tema.ts`;
- `src/app/campanha.ts` (~135–137 e ~161, os `trocarTema`);
- `src/ui/Campanhas.tsx` (~288, o campo "Tema");
- `src/ui/estilo.css`, as regras `[data-tema='ordem']` (~50–70) e `[data-tema='vigilia']` (~393–396);
- `src/main.tsx`, onde `iniciarTema` é chamado.

**Como:**
- `Cabecalho.tsx`: remova o `radiogroup` de temas e os imports de `TEMAS`, `TEMAS_BASE`, `tema` e `trocarTema`.
- `Campanhas.tsx`: remova o `<label>Tema</label>` e o `<select>`. **Não** apague o campo `Campanha.tema` dos dados: ele é do contrato e outros apps podem lê-lo.
- `app/tema.ts` fica mínimo:
  - `iniciarTema()` aplica `{ id: 'atlas' }` (`TEMA_PADRAO` do `#mesa`) no `documentElement`;
  - não lê, não grava e não observa `mesa:tema`;
  - remova `trocarTema` e o signal `tema`, se nada mais os usar.
- `app/campanha.ts`: tire as duas chamadas a `trocarTema`, junto com o comentário "a mesa inteira o veste".
- `estilo.css`: apague as regras `[data-tema='ordem']`, `[data-tema='vigilia']`, `[data-tema='mesa']` e `[data-tema='neutro']`, que ficaram mortas. Confira com `grep -n "data-tema" src/ui/estilo.css`.
- O Atlas aberto dentro do modo sessão continua com o seletor próprio. Isso é aceito: a Mesa não segue mais a escolha dele.

**Testes:**
- remova os passos de tema em `tests/e2e/hub.test.ts` (~91 `tema-vigilia` e ~112 `campanha-tema`);
- se houver unit de `app/tema.ts`, ajuste-o.

**Commit:** `removed theme picker from mesa`

---

## Etapa C — Modo sessão

Hoje a barra do modo sessão (`src/ui/ModoSessao.tsx`, ~245–300) junta:
- os seletores de mapa e de cena;
- **6 arranjos** e **5 botões de painel**;
- o selo de prontidão, o projetor e "Layout padrão".

Para começar uma sessão, é preciso achar o painel Diário, que vem escondido. O quadro tem ainda três modos de foco sem explicação, e "Pronto para jogar?" aparece em dois lugares. A ideia é a barra contar a ordem natural: **iniciar a sessão → escolher a cena → jogar**. O resto vai para um menu.

### U6 — Barra da sessão em duas zonas  ⬜
**Ler:**
- `src/ui/ModoSessao.tsx` (a função `ModoSessao`);
- `src/ui/Diario.tsx` (`SemSessao`, `Diario`, `Roteiro`);
- `src/app/registro.ts` (`iniciarSessao`, `encerrarSessao`, `retomarGravacao`, `gravando`, `sessaoAtiva`);
- `src/dominio/layout.ts`.

**Como:**
- **Zona da esquerda**, o que está em jogo, nesta ordem:
  1. **Sessão:**
     - sem sessão ativa, um campo curto "Nome da sessão" e o botão destaque "▶ Iniciar sessão" (`data-testid="sessao-iniciar"`; o campo mantém `sessao-nome`);
     - com sessão, o nome, o selo "Gravando"/"Parada" e o botão Parar/Gravar.
  2. **Cena:** o seletor atual de cena.
  3. **Mapa:** o seletor atual de mapa.
- **Zona da direita:** o selo de prontidão (como hoje, só com sessão), "📽 Projetor" e um menu **"Painéis ▾"**, feito com `<details>` como o `escolher-fichas`. Dentro do menu:
  - os toggles de painel como linhas com checkbox (mantenha `data-testid="painel-<id>"`);
  - um separador e "Arranjos": os 6 presets como lista (mantenha `preset-<id>`);
  - por fim "Restaurar padrão" (`layout-padrao`).
- `Diario.tsx`:
  - `SemSessao` perde o formulário de iniciar. Fica a frase "Inicie a sessão na barra de cima." e a lista "Sessões anteriores";
  - no cabeçalho do `Diario`, ficam só "Exportar .md" e fechar, porque Parar/Gravar foi para a barra;
  - em `Roteiro`, remova o botão "Pronto para jogar?" e o diálogo duplicado. O selo da barra já abre a mesma checagem.
- Ao iniciar a sessão pela barra, se o Diário estiver escondido, mostre-o (`alternarPainel`). Assim a pessoa vê o registro começar.
- CSS: `.sessao-barra` com `.sessao-zona` à esquerda e à direita, separadas por `var(--linha)`. Em tela estreita, a zona da direita quebra a linha.

**Testes:** atualize `tests/e2e/fase9.test.ts` (~66), `tests/e2e/diario.test.ts` (~56, ~61 e ~151) e `tests/e2e/sessao.test.ts` (~75 e ~78). Os presets e os painéis agora ficam dentro do menu: abra-o antes de clicar. Rode `npm run test:e2e`.
**Commit:** `simplified session bar into what's in play and a panels menu`

### U7 — Foco do quadro explicado  ⬜
**Ler:** `src/app/foco-do-quadro.ts` (o que `espiar` e `seguir` fazem de fato) e `src/ui/ModoSessao.tsx` (`PainelDoQuadro`, `MODOS_FOCO`).

**Como:**
- Troque os três chips por um `<select>` (`data-testid="sessao-modo-foco"`) com rótulos que dizem o efeito. Confirme cada frase no código antes de escrever:
  - "Quadro parado" (desligado);
  - "Mostrar o que está no mapa" (espiar);
  - "Acompanhar o mapa" (seguir).
- Cada `option` leva um `title` com uma frase de explicação.
- O padrão continua `espiar`.

**Testes:** atualize `tests/e2e/quadro.test.ts` (~586, ~607 e ~648) para `selectOption`.
**Commit:** `clearer board focus modes in session`

### U8 — Guia "Como usar" no modo sessão  ⬜
**Ler:** `src/ui/ModoSessao.tsx`, `src/app/sessao.ts` (`ativarCena`, `mapaAtual`) e `src/app/desktop.ts` (`abrirProjetorNoSegundoMonitor`).

**Como:**
- Pura, em `dominio/sessao.ts`:
  ```ts
  export interface PassoDoGuia { id: 'sessao' | 'cena' | 'projetor'; titulo: string; dica: string; feito: boolean }
  export function passosDoGuia(estado: { temSessao: boolean; cenaAtivada: boolean; projetorAberto: boolean }): PassoDoGuia[]
  ```
  Os textos dos passos:
  - **1. Inicie a sessão:** "O diário passa a registrar rolagens, mapas e músicas.";
  - **2. Ative uma cena:** "Abre o mapa, a música e os participantes da cena de uma vez.";
  - **3. Abra o projetor:** "Mostra o mapa aos jogadores na TV ou no segundo monitor."
- Em `app/sessao.ts`, crie os signals `cenaAtivadaNestaVisita` e `projetorAberto`, marcados em `ativarCena` e no clique do projetor. São só da tela; não persistem.
- Logo abaixo da barra, mostre uma faixa fina (`data-testid="guia-sessao"`) com os três passos numerados. Os feitos ganham ✓ e ficam esmaecidos. A faixa tem um botão "Entendi" que a esconde e grava `mesa:guia-sessao-visto` no `localStorage`, com try/catch.
- A faixa some sozinha quando os três passos estão feitos.
- Na zona da direita da barra, um botão "?" (`data-testid="guia-sessao-abrir"`) volta a mostrá-la.

**Testes:** unit de `passosDoGuia`; um passo e2e opcional que dispensa o guia.
**Commit:** `added how-to guide strip in session mode`

---

## Etapa D — Interface geral

### U9 — Barra da coleção mais enxuta  ⬜
**Ler:** `src/ui/Entidades.tsx` (`BarraSuperior`, `CATEGORIAS_PADRAO`, o formulário `nova-entidade`).

**Como:**
- **Categorias:**
  - mostre só as com contagem > 0, além de "Tudo" e da categoria ativa, para não sumir com o filtro ligado;
  - "Efeitos" e "Sessões" passam a seguir a mesma regra, sem tratamento à parte;
  - "Só o elenco" aparece só quando o filtro é Personagens.
- **Criar:**
  - o botão "+ Nova" abre um pequeno popover na própria barra, com tipo, nome e Criar, usando a mesma função `criar`;
  - o formulário duplicado no topo da `coluna-lista` sai;
  - mantenha os `data-testid` `novo-tipo`, `nova-entidade-nome` e `criar-entidade` dentro do popover;
  - atualize o botão "Criar uma entidade" da `Visao` para abrir o popover.
- **Cofre** (os botões 📁, ↓ e ↑ na barra lateral): troque os ícones soltos por um menu "Cofre ▾" com três linhas de texto: "Vincular pasta…" (ou "Desvincular …"), "Exportar .json" e "Importar .json". Mantenha os `data-testid`.

**Testes:** e2e de criação em `tests/e2e/hub.test.ts`: abra o popover antes de preencher.
**Commit:** `tidied collection bar and creation popover`

---

## Fora deste plano

- Uma revisão visual mais funda (espaçamentos, tipografia, cartões) fica para depois de o usuário usar a Fase 5 e apontar as telas que mais incomodam.
- O Atlas continua com seu seletor de temas, por decisão do usuário.
