# Mesa

O hub da campanha: campanhas, personagens, lugares, pistas, facções e notas, com tudo o que cada coisa é em cada aplicativo (Atlas, Ficha, Ateliê, Jukebox). Faz parte da plataforma da mesa: ver [`../Atlas/docs/PLATAFORMA.md`](../Atlas/docs/PLATAFORMA.md).

> Estado: **9.1a** — campanhas (criar, renomear, sistema, tema, apagar) e entidades por tipo (busca sem acento, criar, nome, etiquetas e notas, refs com link “Abrir”). Notas com `[[ligações]]` (9.1b), inventário de aplicativos (9.1c) e modo sessão (9.5) vêm depois.

## Usar

Requer Node.js 22.18 ou superior.

```bash
npm install
npm run dev          # http://127.0.0.1:5195/ (sozinha: sem os outros aplicativos ao lado, os links “Abrir” não aparecem)
npm run dev:mesa     # com prefixo /Mesa/, para rodar atrás do mesa-dev
npm run build        # confere os tipos e gera dist/ (funciona em qualquer caminho, inclusive /Mesa/ no GitHub Pages)
```

Para ver a Mesa ao lado do Atlas, numa origem só (como no GitHub Pages), em três terminais:

```bash
cd ../Atlas && npm run dev:mesa            # :5190, sob /Atlas/
cd ../Mesa  && npm run dev:mesa            # :5195, sob /Mesa/
cd ../Atlas && node scripts/mesa-dev.ts Atlas=5190 Mesa=5195   # http://127.0.0.1:5100/Mesa/ e /Atlas/
```

(`npm run mesa-dev` subindo todos os projetos com um comando é a tarefa 9.1c.)

## Testes

```bash
npm run typecheck
npm test             # unitários: busca, filtros, regra de dono, etiquetas
npm run test:e2e     # Playwright: a Mesa e o Atlas de verdade, numa origem só, compartilhando a campanha
```

## Dados

Nada vai para servidor. A campanha vive no IndexedDB `mesa-campanha-v1` da origem, compartilhado com os outros aplicativos; a campanha ativa e o tema, no `localStorage` (`mesa:campanha-ativa`, `mesa:tema`). Dados são do navegador: outro computador começa vazio.
