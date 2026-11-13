# Mesa — andamento

Atualizado em 11 de novembro de 2026.

## Melhorias pós-fase 14 (11 de novembro) — concluída

Implementações de refinamento do hub da Mesa, transferência entre aparelhos, prontidão de sessão, atividade do assistente com desfazer e busca rápida global.

- **M1 (Empty states claros na Mesa):** estados vazios informativos e acionáveis nas telas de Modo Sessão (sem sessão aberta com botão para planejar), Aplicativos (instruções de manifesto `mesa.json` e como iniciar) e Entidades (como adicionar ou importar entidades da campanha).
- **T1 (Transferência de aparelho — formato e funções puras):** formato de backup e exportação do aparelho em `.zip` usando `fflate`, serialização de dados complexos (Blob, Uint8Array, Set, Map, Date), validação de manifesto com versão, filtragem de chaves internas do localStorage (`mesa:ponte-armazenamento`).
- **T2 (Exportação e importação de IndexedDB e localStorage):** rotinas completas de dump e restauração para todos os bancos da plataforma (`mesa-campanha-v1`, `atlas-v1`, `mesa-handouts-v1`, `mesa-dossie-v1`, `jukebox-db`), modos "substituir" e "mesclar", sem criar bancos que não existiam no aparelho de origem.
- **T3 (Transferência na tela de campanhas e desktop WebKitGTK):** seção "Este aparelho" na tela de Campanhas da Mesa com botões "Exportar tudo deste aparelho" e "Importar arquivo do aparelho", diálogo de importação com escolha de modo e confirmação explícita de risco, tratamento de download no WebKitGTK (Python) com salvamento em `~/Downloads` e prevenção de colisões.
- **P1 (Jukebox atende jukebox.prontidao):** endpoint e manipulador do barramento na Jukebox para responder a prontidão de cena sonora (`{ cenaId, pronta, total, faltando }`), documentado na especificação da plataforma (`Atlas/docs/PLATAFORMA.md`) e em `mesa.json`.
- **P2 (Checagem de prontidão da sessão):** rotina de verificação de pendências para a sessão planejada (sem mapa, momento sem mapa, trilha incompleta/desconhecida, documento não entregue, participante fora do elenco), diálogo "Pronto para jogar?" acessível no Diário e selo discreto no cabeçalho do Modo Sessão com ações diretas para cada pendência.
- **A1 (Registro de efeitos e desfazer do assistente):** modelo de efeitos reversíveis (`criou-entidade`, `alterou-entidade`, `criou-ligacao`, `criou-sessao`, `alterou-sessao`, `alterou-campanha`), histórico em memória das últimas 100 chamadas de escrita na Mesa, detecção de conflitos (`atualizadaEm > chamada.quando`) e respeito à regra de dono.
- **A2 (Painel de atividade do assistente na Mesa):** painel de histórico de chamadas do assistente (tempo, resumo, quantidade de itens afetados, botão Desfazer), clique no item abre a primeira entidade na Mesa, hover destaca os cards da coleção (`.destacado-assistente`), selo clicável no cabeçalho, marca `painel-assistente-mesa` adicionada às regras de verificação do build de produção (`Atlas/scripts/ponte/verificar-build.ts`).
- **B1 (Busca rápida com Ctrl+K):** diálogo modal de busca rápida acessível globalmente via Ctrl+K / Cmd+K com suporte a navegação por setas (↑/↓), Enter para abrir no app dono ou na Mesa, Shift+Enter para abrir na Mesa forçado, pontuação priorizando começo do nome > começo de palavra > contém > tags, normalização NFD sem acentos.

### Validação

- `cd /home/ilvro/Documents/Projects/Mesa && npm run typecheck && npm test` — limpo, 166 testes unitários passando.
- `cd /home/ilvro/Documents/Projects/Atlas && npm run typecheck && npm test && npm run ponte:verificar` — limpo, 788 testes passando, builds desktop e produção verificados sem vazamento de ponte.
- `cd /home/ilvro/Documents/Projects/Jukebox && node --test` — limpo, 9 testes passando.
- `cd /home/ilvro/Documents/Projects/Mesa && npm run desktop:prep` — concluído com sucesso, todos os 6 aplicativos empacotados e redirecionador gerado em `dist-desktop/`.

## Fase 4 — Quadro

- **Q1a (Modelo do quadro e operações com desfazer):** criados `src/dominio/quadro.ts` (tipos, validação com caminho e remoção de nós/marcas desconhecidos, fábricas e helpers de `DocRico`) e `src/dominio/quadro-operacoes.ts` (`aplicar`, `inverter`, `Historico` com limite 200 e agrupamento, z-order e `duplicar`), com testes em `tests/unit/quadro.test.ts` e `tests/unit/quadro-operacoes.test.ts`.
- **Q1b (Banco dos quadros e camada `app`):** criados `src/app/banco-quadros.ts` (`mesa-quadros-v1`, deduplicação de imagens por SHA-256, remoção em cascata por quadro e campanha) e `src/app/quadros.ts` (signals, gravação adiada de 400 ms, descarga em `pagehide`/`visibilitychange`, reação à troca de campanha), integração em `src/app/campanha.ts`, e testes em `tests/unit/banco-quadros.test.ts`.
- **Q1c (Tela Quadros, rota e manifesto):** adicionada aba `Quadros`, rotas `#/quadros`, `#/quadro/{id}` e `#/quadro/{id}/item/{itemId}` em `src/app/rotas.ts`, entradas `quadro` e `item` em `public/mesa.json`, telas `src/ui/quadro/Quadros.tsx` e `src/ui/quadro/Quadro.tsx`, e teste e2e `tests/e2e/quadro.test.ts`.
- **Q1d (Câmera, fundo e grade):** criado `src/dominio/camera.ts` (`telaParaMundo`, `mundoParaTela`, `zoomEm`, `enquadrar`, `caixaVisivel`, `itensVisiveis`) com testes em `tests/unit/camera.test.ts`, `src/ui/quadro/Mundo.tsx`, `src/ui/quadro/PainelDoFundo.tsx` e navegação/atalhos/grade em `src/ui/quadro/Quadro.tsx`.
