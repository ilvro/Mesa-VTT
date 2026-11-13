# Mesa — plano de tarefas

Este diretório guarda o plano de evolução próprio da **Mesa** (`Projects/Mesa`), separado das fases internas do Atlas para que dois chats possam trabalhar em paralelo sem conflito.

## Como trabalhar

1. **Uma tarefa por vez**, na ordem da ficha em [`fase-2.md`](fase-2.md). Leia a ficha, os arquivos de "Ler" e o [`../../AGENTS.md`](../../AGENTS.md).
2. **Fechar a tarefa:**
   - `npm run typecheck` e `npm test` passando (e `npm run test:e2e` quando a ficha pedir);
   - marcar a ficha com ✅ (⬜ → ✅) e anotar desvios, se houve, numa linha `Nota:` dentro da ficha;
   - sugerir uma mensagem de commit curta em inglês. **Não commitar:** o usuário revisa e commita.
3. **Execução paralela com o Atlas:**
   - As tarefas `M2.1a` a `M2.3b` mexem **apenas no repositório da Mesa** e podem ser desenvolvidas **simultaneamente** com a Fase 11 do Atlas (`../Atlas/docs/plano/fase-11.md`).
   - Apenas a `M2.2b` (disparar `atlas.preparar-cena` pelo barramento) usa o evento novo que a tarefa `11.5b` do Atlas compila em `vendor/mesa-core/`.

## Fases

| Arquivo | Estado |
| --- | --- |
| [fase-2.md](fase-2.md) | Detalhado |
| [fase-3.md](fase-3.md) | Detalhado |
| [melhorias-pos-fase-14.md](melhorias-pos-fase-14.md) | Concluída |
| [fase-4.md](fase-4.md) | Detalhado — Quadro (whiteboard da campanha), etapas A a F |
