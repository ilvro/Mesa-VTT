# Fase 3 — Busca de Personagens no Modo Sessão e Atalho Nativo na Barra de Tarefas

Esta fase cobre os refinamentos do aplicativo **Mesa VTT** para execução por subagentes (**Gemini 3.8 Flash Medium/High**).

---

## Regras para o Agente Executor (Gemini 3.8 Flash)

1. **Escopo estrito por cartão:** edite apenas os arquivos listados no cartão.
2. **Qualidade antes do commit:** rode sempre `npm run typecheck` e `npm test` em `Mesa/`.
3. **Estilo de commits:** mensagens curtas em inglês minúsculo (ex.: `added character search bar in session mode and desktop shortcut installer`).

---

## Cartão `M3.1a` — Barra de Pesquisa de Personagens no Modo Sessão (`Mesa`)

- **Objetivo:** Adicionar uma barra de pesquisa por nome para filtrar personagens rapidamente dentro do `PainelDasFichas` no Modo Sessão (`Mesa/src/ui/ModoSessao.tsx`).
- **Arquivos a modificar:**
  - `Mesa/src/ui/ModoSessao.tsx`
  - `Mesa/src/ui/estilo.css`
- **Especificação técnica:**
  1. Em `Mesa/src/ui/ModoSessao.tsx`:
     - Crie um signal `const buscaPersonagemSessao = signal('');`.
     - Dentro de `PainelDasFichas`:
       - Adicione um `<input type="search" class="sessao-busca-personagens" data-testid="sessao-busca-personagens" placeholder="Buscar personagem…" value={buscaPersonagemSessao.value} onInput={e => { buscaPersonagemSessao.value = (e.target as HTMLInputElement).value; }} />` na faixa `.sessao-abas` (e também dentro do menu `<details class="escolher-fichas">` quando houver muitos personagens).
       - Filtre os personagens exibidos nas abas (`.sessao-abas`) e no menu `Personagens…` (`escolher-fichas-lista`) usando normalização sem acento (`semAcento(p.nome).includes(semAcento(buscaPersonagemSessao.value.trim()))`), mantendo sempre visível a ficha atualmente ativa (`atual`) mesmo que não case com o filtro.
  2. Em `Mesa/src/ui/estilo.css`:
     - Estilize `.sessao-busca-personagens` de forma compacta (`height: 26px; font-size: 12px; padding: 2px 8px; max-width: 160px; border-radius: 5px;`) para se integrar harmoniosamente à barra `.sessao-abas`.
- **Verificação:** `npm run typecheck && npm test` em `Mesa/`.

---

## Cartão `M3.2a` — Script de Instalação de Atalho Nativo no Sistema / Barra de Tarefas (`desktop:install`)

- **Objetivo:** Criar um script automatizado `npm run desktop:install` em `Mesa/` que registra o aplicativo desktop Tauri (**Mesa VTT**) no menu de aplicativos do Linux (`~/.local/share/applications/mesa-vtt.desktop` + ícone em `~/.local/share/icons/hicolor/128x128/apps/mesa-vtt.png`), permitindo que o usuário procure por **"Mesa VTT"** no menu do sistema e clique em **"Fixar na barra de tarefas / Adicionar aos favoritos"** como um programa nativo.
- **Arquivos a criar/modificar:**
  - `Mesa/scripts/install-desktop.mjs` (novo)
  - `Mesa/package.json`
- **Especificação técnica:**
  1. Crie `Mesa/scripts/install-desktop.mjs`:
     - Verifica se o binário release (`Mesa/src-tauri/target/release/mesa-vtt`) existe; se não existir (ou se `--build` for passado), orienta ou executa o build release (`npm run desktop:build`) ou usa o binário compilado.
     - Copia `Mesa/src-tauri/icons/128x128.png` para `~/.local/share/icons/hicolor/128x128/apps/mesa-vtt.png`.
     - Gera `~/.local/share/applications/mesa-vtt.desktop` com permissão `0o755`:
       ```ini
       [Desktop Entry]
       Version=1.0
       Type=Application
       Name=Mesa VTT
       Comment=Plataforma integrada de RPG de mesa (Mesa, Atlas, Dossiê, Ateliê, Jukebox, Tabletop)
       Exec=/home/ilvro/Documents/Projects/Mesa/src-tauri/target/release/mesa-vtt
       Icon=mesa-vtt
       Terminal=false
       Categories=Game;RolePlaying;
       StartupWMClass=mesa-vtt
       ```
     - Roda `update-desktop-database ~/.local/share/applications` (se disponível no sistema) e imprime instruções claras no terminal.
  2. Em `Mesa/package.json`:
     - Adicione `"desktop:install": "node scripts/install-desktop.mjs"` em `"scripts"`.
- **Verificação:** `npm run typecheck && npm test` em `Mesa/`.
