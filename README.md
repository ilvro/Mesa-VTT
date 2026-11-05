# Mesa

O hub da campanha: campanhas, personagens, lugares, pistas, facções e notas, com tudo o que cada coisa é em cada aplicativo (Atlas, Dossiê, Ateliê, Jukebox). Faz parte da plataforma da mesa: ver [`../Atlas/docs/PLATAFORMA.md`](../Atlas/docs/PLATAFORMA.md).

> Estado: **Fase 9 do Atlas completa na Mesa** — campanhas, entidades por tipo (busca sem acento, etiquetas, refs com “Abrir”), notas com `[[ligações]]`, inventário de aplicativos pelos manifestos, **modo sessão** (Atlas, fichas e Jukebox lado a lado) e **diário** da sessão (roteiro e registro automático).

## Usar

Requer Node.js 22.18 ou superior.

```bash
npm install
npm run dev          # http://127.0.0.1:5195/ (sozinha: sem os outros aplicativos ao lado, os links “Abrir” não aparecem)
npm run dev:mesa     # com prefixo /Mesa/, para rodar atrás do mesa-dev
npm run build        # confere os tipos e gera dist/ (funciona em qualquer caminho, inclusive /Mesa/ no GitHub Pages)
```

Para ver a Mesa ao lado de todos os aplicativos, numa origem só (como no GitHub Pages), um comando, na pasta do Atlas:

```bash
cd ../Atlas && npm run mesa-dev      # http://127.0.0.1:5100/Mesa/  (Atlas, Dossiê, Ateliê, Tabletop e Jukebox em /Atlas/, /Dossie/…)
```

A aba **Aplicativos** da Mesa mostra, pelo `mesa.json` de cada um, quem está por perto: achado, sem manifesto (no ar, mas ainda fora do contrato, como o Tabletop) ou fora do ar.

## Testes

```bash
npm run typecheck
npm test             # unitários: busca, filtros, regra de dono, notas, layout, sessão, registro, roteiro
npm run test:e2e     # Playwright: a Mesa e o Atlas de verdade, numa origem só, compartilhando a campanha
```

## Dados

Nada vai para servidor. A campanha vive no IndexedDB `mesa-campanha-v1` da origem, compartilhado com os outros aplicativos; a campanha ativa e o tema, no `localStorage` (`mesa:campanha-ativa`, `mesa:tema`). Dados são do navegador: outro computador começa vazio.

## Notas e ligações

- `[[Nome da entidade]]` liga pelo nome (sem acento nem caixa); `[[Nome|rótulo]]` troca o texto exibido; `[[mesa:app/tipo/id|rótulo]]` liga a qualquer coisa de outro aplicativo.
- Ao sair do campo, as ligações viram `ligacoes` do tipo `menciona` no banco da campanha, de `mesa:mesa/entidade/<nota>` para o destino; as que saíram do texto são apagadas.
- Só as entidades criadas pela Mesa têm as notas sincronizadas. Renomear uma entidade não reescreve notas que a citam por nome.

## Modo sessão e diário

A aba **Sessão** põe os aplicativos lado a lado, em `iframe`s da mesma origem: o **Atlas** embutido (`?embutido=1`: sem galeria, abre o mapa direto em Sessão), as **fichas** das personagens em abas e o **Jukebox**. Os divisores arrastam (ou as setas, com o divisor em foco), os painéis se escondem, o Atlas e o Jukebox encolhem para caber em vez de apertar, cada um tem tela cheia, e há presets (Padrão, Mapa grande, Mapa e fichas, Com diário, Só o mapa). O layout é lembrado neste navegador; o mapa e as fichas escolhidos, por campanha.

O painel **Diário** guarda a sessão no banco da campanha:

- **Iniciar sessão** avisa os outros aplicativos (`mesa.sessao-iniciada`) e passa a registrar, com a hora, as rolagens, os mapas abertos, as regiões em que uma peça entrou, o que foi revelado aos jogadores, os documentos do Ateliê salvos e a música que toca. Você anota por cima (`> …`).
- **Roteiro:** lista ordenada de mapas, cenas sonoras, documentos e fichas; clicar abre no aplicativo dono. A nota de cada item fica na própria sessão, no banco da campanha (`Sessao.roteiroNotas`).
- **Exportar .md** gera título, data, roteiro e registro.
