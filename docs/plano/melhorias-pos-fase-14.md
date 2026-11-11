# Melhorias da Mesa depois da Fase 14

Plano técnico, em etapas, para execução por um agente de código. Foi escrito em 10/11/2026 contra o código desse dia.

**Regras gerais:**
- Faça **uma ficha por vez, na ordem**, e rode as verificações de cada uma antes de passar à seguinte.
- Não commite. Ao fim de cada ficha:
  - marque o título com ✅;
  - acrescente uma "Nota:" curta com o que divergiu do plano;
  - sugira a mensagem de commit indicada.

## 0. Contexto obrigatório

- **Projetos** (pastas irmãs em `/home/ilvro/Documents/Projects`):
  - **Mesa:** o hub, em TypeScript `strict`, Preact + `@preact/signals` e CSS próprio em `src/ui/estilo.css`.
  - **Atlas:** dono do `mesa-core`, em `Atlas/mesa-core/`.
  - **Dossiê**, **Ateliê** e **Jukebox:** JavaScript.

  Leia `Mesa/AGENTS.md` e `Atlas/docs/PLATAFORMA.md` antes de começar.
- **Língua:** identificadores, comentários e textos da interface em **português**. Siga o estilo dos arquivos vizinhos: funções puras em `src/dominio/`, estado e efeitos em `src/app/`, telas em `src/ui/`.
- **Testes:** `node --test` com `fake-indexeddb`, em `tests/unit/`. Comandos da Mesa: `npm run typecheck` e `npm test`. Toda ficha termina com os dois passando.
- **Mesma origem:** todos os apps rodam na mesma origem, que é `http://127.0.0.1:5100` tanto no `mesa-dev` quanto no app de desktop (`Mesa/scripts/launch-desktop.mjs`). Por isso compartilham `localStorage` e IndexedDB. Já o **navegador e o app de desktop têm armazenamentos separados**, e esse é o problema que a Etapa 2 resolve.
- **Bancos por app:**

  | App | Onde guarda |
  | --- | --- |
  | Campanha | `mesa-campanha-v1` (`campanhas`, `entidades`, `ligacoes`, `sessoes`) |
  | Atlas | o banco do repositório de mapas, em `Atlas/src/data/repositorio.ts` |
  | Ateliê | `atelie-v1:<escopo>` (`Atelie/src/data/api.js`, linha ~66) e o banco de troca `mesa-handouts-v1` |
  | Dossiê | `ordem-ii-db`, mais chaves `ordem-ii-*` no `localStorage` |
  | Jukebox | só `localStorage` (`jukebox-scenes-v1` e outras); as músicas não são guardadas |

- **Barramento:** `src/app/barramento.ts` (`barramentoDaMesa`, `abrirNoApp`, `pedidoParaAbrir`). Pedidos entre apps têm resposta `{ ok, motivo? }`.
- **Ponte do assistente:** `src/app/ponte.ts` e `src/app/ponte-escrita.ts`. As ferramentas são montadas por funções com contexto injetável.
- **Regra de dono:** a Mesa só altera ou remove entidades e ligações que ela mesma criou (`criadaPor: 'mesa'`).

---

## Etapa 1: correções pequenas

### M1 — Textos de "app ausente" e Mesa sem campanha  ✅
**Arquivos:** `src/ui/ModoSessao.tsx` (linha ~22, componente `SemApp`), `src/ui/Aplicativos.tsx` (linha ~26) e a tela inicial sem campanha (procure onde "Nenhuma campanha" aparece em `src/ui/Cabecalho.tsx` e `src/ui/Entidades.tsx`).

**Como:**
- `SemApp`: troque "Suba tudo com “npm run mesa-dev”, na pasta do Atlas." por "Abra a Mesa pelo atalho do app de desktop, ou rode “npm run mesa-dev” na pasta do Atlas.". Faça o mesmo em `Aplicativos.tsx`.
- Sem campanha ativa, a tela de entidades mostra um bloco central (`data-testid="sem-campanha"`) com:
  - o título "Escolha ou crie uma campanha";
  - a lista das campanhas existentes como botões, que chamam `escolherCampanha` (veja `src/app/campanha.ts`);
  - um campo com o botão "Criar", que reaproveita a função de criar de `src/ui/Campanhas.tsx`.

  Reaproveite as classes CSS existentes e não crie cores.

**Nota:** Nenhuma divergência.
**Testes:** e2e não é necessário. Se houver função pura nova, teste-a.
**Commit:** `clearer empty states in mesa`

---

## Etapa 2: levar os dados de um aparelho para outro

**Objetivo:** com dois botões, "Exportar tudo deste aparelho" e "Importar", o mestre passa todo o trabalho do Firefox para o app de desktop, ou o contrário.

A transferência é **genérica**: copia todos os bancos IndexedDB e todo o `localStorage` da origem, sem conhecer o formato de cada app. Funciona porque os nomes dos bancos são iguais nos dois lados, já que a origem e os caminhos são os mesmos.

### T1 — Formato e funções puras  ✅
**Arquivos:** criar `src/dominio/transferencia.ts` e `tests/unit/transferencia.test.ts`.

**Formato:** um arquivo `.mesa`, que é um zip feito com **fflate**. Acrescente `"fflate": "0.8.3"` às `dependencies` da Mesa, com versão exata (é a mesma do Ateliê), e rode `npm install`. O zip contém:
- `manifesto.json`: `{ versao: 1, exportadoEm: number, origem: string, bancos: DescricaoDoBanco[], localStorage: Record<string,string> }`;
- `bancos/<n>/<loja>.json`: os registros de cada loja, `[{ chave, valor }]` com o valor serializado (veja abaixo);
- `blobs/<sha-ou-contador>`: o conteúdo binário de cada `Blob` ou `ArrayBuffer` encontrado nos valores.

**Tipos:**

```ts
export interface DescricaoDoIndice { nome: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }
export interface DescricaoDaLoja { nome: string; keyPath: string | string[] | null; autoIncrement: boolean; indices: DescricaoDoIndice[] }
export interface DescricaoDoBanco { nome: string; versao: number; lojas: DescricaoDaLoja[] }
```

**Serialização de valores** (pura, testável):
- `serializar(valor, guardarBinario: (b: Uint8Array, tipo: string) => string): unknown` percorre objetos e arrays. Cada `Blob`, `ArrayBuffer` ou `TypedArray` vira `{ "$binario": id, "$tipo": mime, "$classe": "Blob" | "ArrayBuffer" | "Uint8Array" | ... }`. `Date` vira `{ "$data": iso }`. `Map` e `Set` viram `{ "$map": [...] }` e `{ "$set": [...] }`.
- `desserializar(valor, lerBinario: (id: string) => Uint8Array): unknown` faz o inverso.
- Como `Blob.arrayBuffer()` é assíncrono, faça `serializar` em duas passadas:
  1. coleta os blobs, devolvendo uma lista de promessas;
  2. substitui os blobs pelos ids.

  Alternativa: torne `serializar` `async`. Escolha uma e documente.

**Filtros:**
- `bancosParaExportar(nomes: string[]): string[]` exclui os bancos internos do navegador ou do Vite, se houver, e nada mais. A lista de exclusão começa vazia e fica documentada.
- `chavesDoLocalStorage(chaves: string[]): string[]` exporta todas, exceto `mesa:ponte-armazenamento`. Essa chave identifica o armazenamento para a ponte e **não pode** ser copiada.

**Nota:** Escolhida a alternativa de `serializar` assíncrona, que consome `Blob.arrayBuffer()` diretamente e de forma segura.
**Testes:**
- ida e volta de um valor com `Blob`, `Date`, `Map`, arrays aninhados e `Uint8Array`;
- os filtros excluem `mesa:ponte-armazenamento`;
- o manifesto é validado (versão desconhecida devolve um erro claro).

**Commit:** `device transfer format`

### T2 — Exportar e importar (IndexedDB e localStorage)  ⬜
**Arquivos:** criar `src/app/transferencia.ts` e `tests/unit/transferencia-app.test.ts`, com `fake-indexeddb`.

**Exportar** (`exportarAparelho(): Promise<Blob>`):
1. Liste os bancos com `indexedDB.databases()`.
2. Para cada banco, abra-o **sem versão** (`indexedDB.open(nome)`) e leia `db.version` e `db.objectStoreNames`.
3. Para cada loja, leia `keyPath`, `autoIncrement` e os índices (`store.index(n)`: `keyPath`, `unique`, `multiEntry`).
4. Leia todos os registros com cursor (`openCursor`), guardando a chave primária e o valor. Feche o banco.
5. Inclua `localStorage` filtrado por `chavesDoLocalStorage`.
6. Monte o zip com `zipSync` do fflate. Use `level: 0` para os blobs, que já são comprimidos, e `level: 6` para os JSON.

**Importar** (`importarAparelho(arquivo: Blob, opcoes: { substituir: boolean }): Promise<RelatorioDeImportacao>`):
1. `unzipSync` e validação do manifesto.
2. Para cada banco do manifesto:
   - Se `substituir`, chame `indexedDB.deleteDatabase(nome)` e espere o `onsuccess`. Se vier `onblocked`, devolva o erro "Feche os outros apps (Atlas, Dossiê, Ateliê, Jukebox) e tente de novo".
   - Abra o banco com **a mesma versão** do manifesto. No `onupgradeneeded`, crie as lojas e os índices exatamente como descritos. Como a versão é igual à do app, o app não roda migração ao abrir.
   - Grave os registros. Use `put(valor, chave)` quando a loja não tem `keyPath`, e `put(valor)` quando tem.
3. `localStorage`: com `substituir`, limpe as chaves que o manifesto traz e grave as do arquivo. **Nunca** apague nem sobrescreva `mesa:ponte-armazenamento`.
4. Devolva o relatório: `{ bancos: { nome, registros }[], chaves: number, avisos: string[] }`.
5. **Sem `substituir`** (mesclar): grave por cima só os registros com a mesma chave, sem apagar os outros. Isso é o padrão, para nunca perder dados. Bancos que não existem são criados com o esquema do arquivo.

**Testes** (`fake-indexeddb`):
- criar dois bancos com lojas, um índice e um blob → exportar → apagar → importar → conferir esquema, versão, registros e blob;
- o modo mesclar não apaga o registro que só existe no destino;
- `mesa:ponte-armazenamento` sobrevive à importação.

**Commit:** `export and import everything on this device`

### T3 — Interface e o app de desktop  ⬜
**Arquivos:** `src/ui/Campanhas.tsx` (perto do botão "↑ Importar Cofre", linha ~155) e `Mesa/scripts/launch-desktop.mjs`.

**Interface:**
- Uma seção "Este aparelho" com dois botões.
- **"Exportar tudo deste aparelho":** baixa `mesa-<AAAA-MM-DD>.mesa` com o mesmo mecanismo de download que `src/app/cofre.ts` (linha ~330).
- **"Importar…":** um `input type=file accept=".mesa"`. Depois de escolher o arquivo, um diálogo pergunta "Mesclar com o que já existe" (padrão) ou "Substituir tudo", e mostra o relatório.
- Antes de substituir, avise numa frase que os outros apps abertos precisam ser fechados. Depois de importar, recarregue a página (`location.reload()`) e mostre o aviso "Reabra os outros apps".
- Uma frase fixa: "As músicas da Jukebox não vão junto: carregue o preset de novo no outro aparelho."

**App de desktop (WebKitGTK):**
- **Download:** confira se o `<a download>` funciona no app. O WebKitGTK precisa de tratamento: no Python embutido no `launch-desktop.mjs`, conecte `context.connect('download-started', …)` e, no `download.connect('decide-destination', …)`, chame `download.set_destination(file://~/Downloads/<nome sugerido>)` e devolva `True`. Se o nome já existir, acrescente ` (2)`, ` (3)`…
- **Cuidado com a template string:** o Python está dentro de uma template string do JS. Não use crases nem `${`, e lembre que barras invertidas são interpretadas.
- **Upload:** o `input type=file` comum já funciona, porque o `run-file-chooser` só intercepta pedidos de pasta.

**Verificação manual** (descreva o resultado na Nota): exportar no Firefox (`npm run mesa-dev`), importar no app de desktop e conferir que a campanha, os mapas do Atlas, as fichas do Dossiê e os documentos do Ateliê aparecem.

**Commit:** `device transfer in the campaigns screen`

---

## Etapa 3: checagem antes da sessão

**Objetivo:** antes de jogar, a Mesa mostra, cena por cena da sessão planejada, o que está faltando, com um botão para resolver cada pendência.

### P1 — Jukebox responde se uma cena sonora está pronta  ⬜
**Arquivos:** `Jukebox/mesa.js`, `Jukebox/scenes.js`, `Jukebox/mesa.json` e um teste em `Jukebox/tests/` (rodado com `node --test` na pasta da Jukebox).

**Como:**
- Em `scenes.js`, exporte uma função `estadoDaCena(id)`, que devolve `{ existe, nome, total, faltando }` usando o `countMissingTracks` que já existe (leia `activateSceneById`, linha ~360).
- Em `mesa.js`, atenda o pedido novo `jukebox.prontidao` com `{ ref }`. A resposta é `{ ok: true, total, faltando, nome }`; ref de outro app ou cena inexistente devolve `{ ok: false, motivo }`.
- Acrescente `jukebox.prontidao` à lista "atende" do `mesa.json` da Jukebox.
- Descreva o pedido em `Atlas/docs/PLATAFORMA.md`, na tabela de eventos e pedidos.

**Commit (Jukebox):** `answer jukebox.prontidao for scene readiness`

### P2 — Checagem na Mesa  ⬜
**Arquivos:** criar `src/dominio/prontidao.ts`, `src/app/prontidao.ts`, `tests/unit/prontidao.test.ts`; mudar `src/ui/Diario.tsx` ou a tela da sessão planejada (ache onde o roteiro da sessão é mostrado) e `src/ui/ModoSessao.tsx`.

**Domínio (puro):**

```ts
export type Pendencia =
  | { tipo: 'sem-mapa'; cenaId: string }
  | { tipo: 'momento-sem-mapa'; cenaId: string }
  | { tipo: 'trilha-incompleta'; cenaId: string; faltando: number; total: number }
  | { tipo: 'trilha-desconhecida'; cenaId: string }          // a Jukebox não respondeu
  | { tipo: 'documento-nao-entregue'; cenaId: string; entidadeId: string; nome: string }
  | { tipo: 'fora-do-elenco'; cenaId: string; entidadeId: string; nome: string };

export interface FatosDaCampanha {
  documentosEntregues: ReadonlySet<string>;          // ids do banco mesa-handouts-v1
  trilhas: ReadonlyMap<string, { total: number; faltando: number } | null>;   // por id da cena sonora; null = sem resposta
  elenco: readonly string[] | undefined;             // Campanha.elenco (undefined = elenco não definido)
}
export function pendenciasDaCena(pacote: PacoteDeCena, fatos: FatosDaCampanha): Pendencia[]
export function pendenciasDaSessao(pacotes: PacoteDeCena[], fatos: FatosDaCampanha): Pendencia[]
```

Use `PacoteDeCena` de `src/dominio/cenas.ts`.
- "Fora do elenco" vale só para participantes `personagem` e só quando `elenco !== undefined`.
- Ameaças nunca geram pendência.

**App:**
- `carregarFatos(campanha, pacotes)`:
  - lê os ids do banco `mesa-handouts-v1` (store `handouts`), **só se o banco já existe**: copie o padrão de `abrir()` em `Atlas/src/data/pistas.ts`, que checa `indexedDB.databases()` antes de abrir, para não criar o banco do Ateliê;
  - pede `jukebox.prontidao` para cada trilha pelo `barramentoDaMesa()`, com timeout de 1,5 s (sem resposta vira `null`);
  - lê o `elenco` da campanha.
- As cenas da sessão são as entradas do roteiro cuja entidade é do tipo `cena`.

**Interface:**
- Um botão "Pronto para jogar?" na sessão planejada (`data-testid="checar-sessao"`). Ele mostra a lista de pendências agrupada por cena, ou "Tudo pronto". Cada pendência tem uma ação:

  | Pendência | Ação |
  | --- | --- |
  | sem mapa | abrir a cena no editor de cena |
  | trilha incompleta ou desconhecida | "Abrir a Jukebox" (`abrirNoApp` com o ref da trilha) |
  | documento não entregue | "Abrir no Ateliê" (`abrirNoApp`) |
  | fora do elenco | "Pôr no elenco" (a função de elenco que já existe na Mesa) |

- No Modo Sessão, um selo discreto no cabeçalho com o número de pendências da sessão ativa, que abre a mesma lista.

**Testes:** cada tipo de pendência; cena sem nada não gera erro; ameaça não gera "fora do elenco"; com elenco `undefined`, nada de "fora do elenco".

**Commit:** `session readiness check`

---

## Etapa 4: atividade do assistente na Mesa

**Objetivo:** como no Atlas (`Atlas/src/app/atividade-do-assistente.ts` e `Atlas/src/ui/PainelDoAssistente.tsx`, leia os dois), a Mesa mostra o que o assistente fez e permite desfazer cada chamada.

### A1 — Registro de efeitos e desfazer  ⬜
**Arquivos:** criar `src/dominio/efeitos.ts`, `src/app/atividade-do-assistente.ts`, `tests/unit/atividade-do-assistente.test.ts`; mudar `src/app/ponte-escrita.ts` e `src/app/ponte.ts`.

**Modelo:**

```ts
export type Efeito =
  | { tipo: 'criou-entidade'; id: string }
  | { tipo: 'alterou-entidade'; antes: Entidade }        // a versão anterior inteira
  | { tipo: 'criou-ligacao'; id: string }
  | { tipo: 'criou-sessao'; id: string }
  | { tipo: 'alterou-sessao'; antes: Sessao }
  | { tipo: 'alterou-campanha'; antes: Campanha };      // p.ex. o elenco
export interface Chamada { id: string; ferramenta: string; quando: number; resumo: string; efeitos: Efeito[]; desfeita: boolean }
```

**Coleta:**
- Os contextos de `ponte-escrita.ts` ganham um parâmetro opcional `registrar?: (e: Efeito) => void`. Cada operação de escrita chama `registrar` **depois** de dar certo; para alterações, lê o "antes" do repositório antes de escrever.
- `ponte.ts` embrulha o `executar` de cada ferramenta de escrita: abre uma `Chamada`, passa o `registrar` dela e, no fim, guarda a chamada se ela teve efeitos.
- As ferramentas de leitura não são registradas.

**Desfazer** (`desfazerChamada(id)`): aplica o inverso dos efeitos em ordem reversa.

| Efeito | Inverso |
| --- | --- |
| criou-entidade | `removerEntidade` |
| criou-ligacao | `removerLigacao` |
| criou-sessao | `removerSessao` |
| alterou-entidade / alterou-sessao / alterou-campanha | salvar o `antes` |

- **Conflito:** se o item mudou depois da chamada, porque o `atualizadaEm` atual é maior que o do momento do registro, não desfaça esse item. O resultado lista "não desfeito: X mudou depois".
- **Regra de dono:** a Mesa só remove o que ela criou. Os efeitos registrados pela ponte da Mesa são sempre da Mesa.
- Depois de desfazer, recarregue os signals da tela (`atualizar()` e `carregarSessoes()`).

**Histórico:** as últimas 100 chamadas ficam em memória (signal) e se perdem ao recarregar. Isso é aceitável e deve ser documentado.

**Testes:** criar uma entidade e desfazer a remove; alterar uma sessão e desfazer restaura o "antes"; um item que mudou depois não é desfeito e aparece no relatório.

**Commit:** `undo for assistant changes in mesa`

### A2 — Painel de atividade  ⬜
**Arquivos:** criar `src/ui/PainelDoAssistente.tsx`; mudar `src/ui/SeloDoAssistente.tsx` (o clique no selo abre o painel).

**Como:**
- Copie o desenho do painel do Atlas. A lista mostra, da chamada mais nova para a mais antiga, a hora, o resumo e o botão "Desfazer" (desabilitado se a chamada já foi desfeita).
- Ao passar o mouse sobre uma chamada, destaque na coleção as entidades afetadas (uma classe CSS no card). Ao clicar, abra a primeira entidade afetada (`abrirEntidade`).
- O CSS vai num `<style>` dentro do componente, como no selo, porque tudo isso só existe com a ponte.
- Acrescente a marca `painel-assistente-mesa` às MARCAS de `Atlas/scripts/ponte/verificar-build.ts`. O build padrão não pode contê-la.

**Commit:** `assistant activity panel in mesa`

---

## Etapa 5: busca rápida

### B1 — Ctrl+K  ⬜
**Arquivos:** criar `src/dominio/busca.ts`, `src/ui/BuscaRapida.tsx`, `tests/unit/busca.test.ts`; mudar `src/ui/App.tsx` (montar o componente e o atalho).

**Domínio:**
- `buscar(termo, itens, limite = 12)`: normaliza com NFD e sem acentos, em minúsculas.
- Pontuação: começo do nome > começo de uma palavra > contém. Tags contam com peso menor.
- Os itens são `{ id, nome, tipo, tags, ref?, origem: 'entidade' | 'sessao' }`.

**Interface:**
- Ctrl+K (e Cmd+K) abre um diálogo modal com um campo e a lista; ↑/↓ navegam, Enter abre, Esc fecha.
- **Ao abrir um item:**
  - entidade com ref de outro app (mapa, ficha, documento, cena sonora): `abrirNoApp(ref)`;
  - entidade da Mesa: `abrirEntidade(id)` e a tela `entidades`;
  - sessão: a tela da sessão.
- Shift+Enter abre a entidade na Mesa mesmo quando ela tem ref de outro app.
- Os itens vêm das entidades e sessões da campanha ativa, lidos do repositório quando o diálogo abre.
- Acessibilidade: `role="dialog"`, `aria-modal`, o foco vai para o campo e volta ao fechar.

**Testes:** pontuação e ordem; acentos; limite.

**Commit:** `quick search with ctrl+k`

---

## Verificação final (depois de todas as etapas)

```bash
cd /home/ilvro/Documents/Projects/Mesa && npm run typecheck && npm test
cd /home/ilvro/Documents/Projects/Atlas && npm run typecheck && npm test && npm run ponte:verificar
cd /home/ilvro/Documents/Projects/Jukebox && node --test
cd /home/ilvro/Documents/Projects/Mesa && npm run desktop:prep
```

Atualize `Mesa/progress.md` (se não existir, crie no estilo do `Atlas/progress.md`) com uma linha por ficha.
