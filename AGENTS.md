# Mesa

O hub da plataforma da campanha (Atlas, Ficha, Ateliê, Jukebox, Tabletop). Contrato e decisões: `../Atlas/docs/PLATAFORMA.md` (§9 descreve a Mesa). O plano de tarefas mora em `../Atlas/docs/plano/fase-9.md` (9.1 a 9.5).

- Uma tarefa por vez, pela ficha. Não decida arquitetura fora dela; se a ficha não bate com o código, pare e reporte.
- Um commit por mudança, no usuário do git e sem coautoria (regras em `../CLAUDE.md`). Ao fim de cada tarefa: `npm run typecheck`, `npm test` e (quando a ficha pedir) `npm run test:e2e` passando, ficha marcada ✅ no Atlas, uma linha no `progress.md` do Atlas e o commit feito, em inglês curto.
- Mesma pilha do Atlas: TypeScript `strict`, Preact com signals, Vite, CSS próprio (sem Tailwind), identidade de `../Atlas/docs/INTERFACE.md`. Tema só pelo `mesa:tema` (`mesa-core`).
- `src/dominio` é puro: não importa UI, nem `app`, nem DOM. A UI lê signals de `src/app` e altera só por funções de `src/app`.
- O `mesa-core` vive em `vendor/mesa-core/` (cópia compilada e fixa). **A fonte continua no Atlas** (`Atlas/mesa-core/`, `npm run build:core`); para atualizar a cópia: `cp -r ../Atlas/mesa-core/dist/. vendor/mesa-core/`. Nunca edite o `vendor/` à mão.
- A Mesa é `app: 'mesa'` no banco da campanha: quem criou a entidade altera tudo; as entidades de outros aplicativos são só leitura aqui (a Mesa só mexeria nas próprias referências). O repositório do `mesa-core` aplica a regra e a Mesa a espelha na tela.
- A Mesa **liga**, não centraliza: não guarda dados de outro aplicativo, só `Ref`. Abrir algo de outro aplicativo é sempre pelo manifesto (`mesa.json`) dele.
- Não altere Atlas, Ficha, Ateliê, Jukebox ou Tabletop sem autorização do usuário, um projeto por vez.

## Sala (mesa online)

- Protocolo e cliente: `src/online/protocolo.ts` (tipos, `lerMensagemParaSala`/`lerMensagemDaSala`, `EVENTOS_DO_MESTRE`, quadros de blob; puro, importado também pelo Worker) e `src/online/cliente.ts` (`conectarSala`: reconexão com espera crescente, blobs em pedaços de 512 KB).

- O Worker da mesa online fica em `sala/` (Cloudflare Worker + Durable Object SQLite; plano em `../Atlas/docs/plano/mesa-online.md`). Tem `tsconfig.json` próprio (sem DOM, com `@cloudflare/workers-types`) e fora do build do Pages: o `typecheck` roda os dois.
- Rodar: `npm run sala:dev` (wrangler local); publicar: `npm run sala:deploy`. Os testes só importam a lógica pura de `sala/` (`retransmitir.ts`, `sessao.ts`, `discord.ts`, `estado.ts`, `permissoes.ts`, `mensagens.ts`, `registro.ts`); as classes `Sala` (`sala.ts`) e `Diretorio` (`diretorio.ts`) e as rotas (`index.ts`) são finas e só passam pelo `sala/tsconfig.json`. Nos testes, `tests/unit/sala/sql-teste.ts` dá o `{ exec }` com `node:sqlite` em memória; no Worker é `ctx.storage.sql`.
- Segredos nunca entram no git: em dev ficam em `sala/.dev.vars` (no `.gitignore`), em produção via `wrangler secret put`.
- Login: `POST /sala/token` troca o `code` do Discord e devolve a sessão assinada (HMAC, 12 h). O WebSocket exige `{"tipo":"ola","sessao":"..."}` como primeira mensagem e fecha com 4001 se for inválida; só conexões identificadas trocam mensagens. `DISCORD_CLIENT_ID` (público) fica em `[vars]` do `wrangler.toml`.
- Segredos (`DISCORD_CLIENT_SECRET`, `MESTRES_DISCORD_IDS`, `SEGREDO_SESSAO`): em dev, `cp sala/.dev.vars.exemplo sala/.dev.vars` e edite (o `.dev.vars` é ignorado); em produção, `npx wrangler secret put <NOME> -c sala/wrangler.toml` para cada um.
- Mestre por sala: `MESTRES_DISCORD_IDS` (ids separados por vírgula) só diz quem pode criar salas (`podeMestrar` na sessão). `POST /sala/nova` (Bearer da sessão, só `podeMestrar`) cria um id aleatório e grava `dono` e `nome` no `config` da sala; dentro dela, `papel = 'mestre'` só para o dono, e uma sala sem dono recusa a conexão (4004).
- Estado (`estado.ts`, tabelas `fichas`, `rolagens` (200 últimas), `ultimo` (último `estado` por canal), `blobs` (`temBlob`), `config`, `personagens`) e permissões (`permissoes.ts`, a tabela do protocolo do plano; todo `evento` passa por `validarEvento` da cópia em `vendor/mesa-core/`). A sala sobrescreve `envelope.autor` em todo evento que espalha. Recusa por permissão volta só ao remetente: `erro { motivo: 'permissao', recusado: <tipo> }`; mais de 60 mensagens por segundo por conexão são descartadas com um `erro { motivo: 'limite' }` por janela.
- Diretório (`Diretorio`, `idFromName('diretorio')`, migração `v2`): `POST /sala/diretorio/ligar { guildId, salaId }` (só o dono da sala), `GET /sala/diretorio/:guildId` → `{ salaId }` e `GET /sala/minhas` (salas do mestre). As rotas autenticam por `Authorization: Bearer <sessao>`.
