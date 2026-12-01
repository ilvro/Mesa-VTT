# Colar do Miro no Quadro

O mestre seleciona itens no Miro, dá Ctrl+C e cola no Quadro da Mesa. Hoje chega só o `text/plain`, que vira um texto gigante sem estilo. O Miro também põe na área de transferência um `text/html` com os itens completos; esta frente lê esse formato e cola os itens com posição, tamanho, fonte, cores e setas.

## O formato (lido de uma cópia real, 25/11/2026)

`text/html` começa com:

```html
<meta ...><span data-meta="<--(miro-data-v1)BASE64(/miro-data-v1)-->"></span><div>…html simples…</div>
```

- O BASE64 decodifica em bytes **deslocados**: cada byte é o byte do JSON (UTF-8) somado a uma constante (59 na amostra), módulo 256. Como o JSON começa com `{`, o deslocamento é `bytes[0] - 0x7b`; não fixar 59.
- JSON: `{ isProtected, boardId, version: 2, host: 'miro.com', copierType, data: { objects: [...] } }`.
- Cada objeto: `{ type: 14, id: <índice>, initialId: '<id do item no Miro, o mesmo da API>', widgetData: { type: 'text' | 'image' | 'line' | …, json: {...} } }`.
- `json` dos itens com posição:
  - `_position.offsetPx.{x,y}`: **centro** do item, em px do Miro (origem arbitrária; só o relativo importa).
  - `scale.scale` (= `relativeScale`): escala do item. Tamanho real = `size.width|height × scale`; fonte real = `style.st × scale`.
  - `rotation.rotation` em graus; `_parent` (id da moldura ou `null`).
- `text`: `json.text` é HTML (`<p>`, `<strong>`, `<br />`, `style="color:rgb(…);background-color:rgb(…)"`), que `htmlParaDocRico` já entende. `json.style` é **string JSON** com chaves curtas: `st` tamanho, `tc` cor do texto (inteiro RGB, `16777215` = branco), `bc` fundo (`-1` = nenhum), `bo` opacidade do fundo, `ta` alinhamento (`l`/`c`/`r`/`j`), `ffn` fonte (`"PT Serif"`), `b`/`i`/`u`/`s` negrito etc. do item inteiro, `brc`/`brw` borda.
- `image`: `crop.{width,height}` (px da imagem) × `scale`; `resource.id`, `title`. **Os bytes da imagem não vêm** na área de transferência.
- `line`: `primary` e `secondary` são as pontas. `widgetIndex >= 0` aponta para o índice em `objects` e `point` é relativo à caixa do item (`{x:1,y:0.5}` = meio da direita); `widgetIndex: -1` é ponto solto, e `point` está em px do Miro no mesmo sistema de `offsetPx`. `style` (string JSON): `lc` cor, `t` espessura, `a_start`/`a_end` cabeças (0 = nenhuma), `lt` tipo de linha, `ls` estilo do traço. Sem `_position`.

Amostra real recortada (5 objetos: título, imagem, título ligado por uma seta, a seta, texto com marcador `[AFOGADO]`): `tests/unit/fixtures/area-miro-amostra.json` (já decodificada; o teste recodifica).

## C1 — Colar itens do Miro com estilo  ✅

Objetivo: Ctrl+C no Miro → Ctrl+V no Quadro traz os itens como itens da Mesa, com a mesma aparência relativa, num único passo de desfazer.
Ler: `src/dominio/miro.ts` (`converterMiro`, `PacoteMiroBruto`, `ItemMiroBruto`, `ConectorMiroBruto`), `src/dominio/html-miro.ts`, `src/ui/quadro/Quadro.tsx` (`aoColar`, `colarTextoNoQuadro`, menu "Colar" perto da linha 2255), `src/dominio/camera.ts` (`enquadrar`, `telaParaMundo`), `tests/unit/miro.test.ts`.
Arquivos: `src/dominio/area-miro.ts` (novo), `src/dominio/miro.ts` (só a opção de fonte máxima), `src/ui/quadro/Quadro.tsx`, `tests/unit/area-miro.test.ts` (novo), `docs/miro.md` (uma seção curta).
Como:
1. **`lerAreaDoMiro(html: string): AreaMiro | null`** (domínio, puro): acha `(miro-data-v1)…(/miro-data-v1)`, decodifica o base64 em bytes (`atob`), desfaz o deslocamento, `TextDecoder('utf-8')`, `JSON.parse`. Qualquer falha ou `data.objects` ausente → `null`.
2. **`areaMiroParaPacote(area, fator): PacoteMiroBruto`**: traduz para o formato da API que `converterMiro` já converte, com tudo multiplicado por `fator`:
   - `id` = `initialId`; `position` = centro × fator; `geometry` = `size × scale × fator` (imagem: `crop × scale × fator`), `rotation`.
   - texto: `data.content` = `json.text`; `style` = `{ fontSize: st×scale×fator, color: hex(tc), fillColor: bc >= 0 ? hex(bc) : undefined, fillOpacity: bo, fontFamily: ffn, textAlign: left/center/right/justify }`.
   - imagem: `data.title` = `title`.
   - linha → `connectors`: ponta com `widgetIndex >= 0` → `{ id: objects[widgetIndex].initialId, snapTo }` (`x=0` left, `x=1` right, `y=0` top, `y=1` bottom, senão sem snap); `-1` → `{ position: point × fator }`. `style`: `strokeColor` hex(lc), `strokeWidth` t, `startStrokeCap`/`endStrokeCap` = `'none'` se 0, senão `'arrow'`; `shape`: `lt === 0` straight, `lt === 1` elbowed, senão curved.
   - tipo desconhecido com `json.text` → `type: 'shape'`, `data.shape: 'rectangle'`, mesmo estilo do texto (`bc` como `fillColor`). Sem texto → ignora e conta num aviso.
   - Molduras (`frame`) e notas (`sticky`) não aparecem na amostra: se `widgetData.type` for `frame`, mapear para `frame` com `data.title` de `json.title` quando houver; não inventar mais chaves.
   - `hex(n)` = `#` + `n.toString(16).padStart(6,'0')`.
3. **Fator de escala:** `fator = 1 / escala dominante dos textos` (a `scale` que cobre mais caracteres de texto); sem textos, a mediana das escalas; sempre finito e > 0. Assim o texto de corpo do Miro chega com o tamanho de fonte do próprio Miro (14) e o resto mantém a proporção (o título de 600 px vira ~70). Guardar o fator por `boardId` num `Map` do módulo da tela: colagens seguintes do mesmo quadro do Miro usam o mesmo fator, para as partes caberem juntas.
4. **`converterMiro`:** nova opção `fonteMaxima?: number` (padrão 128, comportamento atual). A colagem passa 400 (o limite da barra de formatação).
5. **Imagens:** sem bytes. Se o quadro aberto já tem um item `imagem` com `origem.miro === initialId`, reaproveitar o `imagemId` (via `imagensPorItemId`); senão fica o marcador `miro-img-<id>` que o conversor já usa. Contar quantas ficaram sem arquivo para o aviso.
6. **Tela (`Quadro.tsx`, `aoColar`):** antes de imagens e de `text/plain`, ler `e.clipboardData.getData('text/html')`; se `lerAreaDoMiro` devolver algo, `preventDefault` e `colarDoMiro(area)`:
   - converte com `novoId: novoIdItem`, `paleta` da campanha, `quadroId`, `fonteMaxima: 400`;
   - **remove `origem`** dos itens (colar não é sincronizar; colar duas vezes não pode criar duas "cópias" do mesmo item do Miro);
   - desloca tudo para que o centro da caixa dos itens caia no centro da tela (setas: deslocar também `de.ponto`/`para.ponto` e a caixa); `z` acima do maior `z` atual, mantendo a ordem;
   - um `executar({ rotulo: 'Colar do Miro', ops: [{ criar }] })`, seleciona os itens de topo, e se a caixa não cabe na tela, enquadra a câmera nela (`enquadrar`);
   - aviso curto (o mesmo mecanismo de aviso já usado na tela) quando houver imagens sem arquivo: "N imagens do Miro vieram sem arquivo; arraste a imagem por cima ou atualize pelo .miro.zip".
   - O "Colar" do menu de contexto: tentar `navigator.clipboard.read()` e o tipo `text/html` antes do `readText`; se falhar, segue como hoje.
7. `docs/miro.md`: seção "Copiar e colar do Miro" (o que vem, o que não vem: bytes das imagens; a escala).
Testes (`tests/unit/area-miro.test.ts`): recodificar a amostra (JSON → UTF-8 → +59 → base64, montar o `<span data-meta=…>`) e:
- `lerAreaDoMiro` devolve 5 objetos; com outro deslocamento (ex.: 17) também; HTML sem o marcador → `null`; base64 quebrado → `null`.
- `areaMiroParaPacote` + `converterMiro`: título branco, fonte `pt-serif`, negrito no doc, tamanho = 14 × 42,857 × fator; a proporção largura/altura do título e da imagem bate com a do Miro; a seta liga ao item do título com `lado: 'direita'` e a outra ponta é ponto solto; o texto `[AFOGADO]` mantém o fundo `#adf0c7` na marca e recebe sugestão de revisão; centro relativo título→imagem preservado × fator.
Verificar: `npm run typecheck` e `npm test`.
Nota: desvios e limites — `areaMiroParaPacote` não mapeia `_parent` (a moldura que contém é achada pela geometria, como já faz `converterMiro`); `ls` (estilo do traço) e `b/i/u/s` do item inteiro são ignorados; a espessura da seta (`t`) não é multiplicada pelo fator; `fatorDeEscala` e `contarIgnoradosDaArea` são exportados à parte (o pacote não carrega avisos); o fator por `boardId` vive num `Map` do módulo `Quadro.tsx` (perdido ao recarregar); a marca de fundo do texto fica como `rgb(...)`, como `htmlParaDocRico` já guarda; sem teste de tela (Quadro.tsx não tem teste unitário).
Commit: `(feature) paste miro items into the board with their styles`
