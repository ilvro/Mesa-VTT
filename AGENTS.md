# Mesa

O hub da plataforma da campanha (Atlas, Ficha, Ateliê, Jukebox, Tabletop). Contrato e decisões: `../Atlas/docs/PLATAFORMA.md` (§9 descreve a Mesa). O plano de tarefas mora em `../Atlas/docs/plano/fase-9.md` (9.1 a 9.5).

- Uma tarefa por vez, pela ficha. Não decida arquitetura fora dela; se a ficha não bate com o código, pare e reporte.
- Não commite. Ao fim de cada tarefa: `npm run typecheck`, `npm test` e (quando a ficha pedir) `npm run test:e2e` passando, ficha marcada ✅ no Atlas, uma linha no `progress.md` do Atlas e uma sugestão de commit curta em inglês.
- Mesma pilha do Atlas: TypeScript `strict`, Preact com signals, Vite, CSS próprio (sem Tailwind), identidade de `../Atlas/docs/INTERFACE.md`. Tema só pelo `mesa:tema` (`mesa-core`).
- `src/dominio` é puro: não importa UI, nem `app`, nem DOM. A UI lê signals de `src/app` e altera só por funções de `src/app`.
- O `mesa-core` vive em `vendor/mesa-core/` (cópia compilada e fixa). **A fonte continua no Atlas** (`Atlas/mesa-core/`, `npm run build:core`); para atualizar a cópia: `cp -r ../Atlas/mesa-core/dist/. vendor/mesa-core/`. Nunca edite o `vendor/` à mão.
- A Mesa é `app: 'mesa'` no banco da campanha: quem criou a entidade altera tudo; as entidades de outros aplicativos são só leitura aqui (a Mesa só mexeria nas próprias referências). O repositório do `mesa-core` aplica a regra e a Mesa a espelha na tela.
- A Mesa **liga**, não centraliza: não guarda dados de outro aplicativo, só `Ref`. Abrir algo de outro aplicativo é sempre pelo manifesto (`mesa.json`) dele.
- Não altere Atlas, Ficha, Ateliê, Jukebox ou Tabletop sem autorização do usuário, um projeto por vez.
