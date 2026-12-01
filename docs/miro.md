# Importar um quadro do Miro

A Mesa importa quadros do Miro a partir de um pacote `.miro.zip` gerado localmente. O token da sua conta Miro nunca é gravado no pacote nem enviado para terceiros.

## 1. Gerar um token de leitura no Miro

O token não sai de "Aplicativos" (a loja de apps do Miro): ele vem de um **app de desenvolvedor** que você mesmo cria. Passos (conferidos na documentação do Miro em 25/11/2026):

1. **Time de desenvolvedor** (só na primeira vez): abra [miro.com/app/dashboard/?createDevTeam=1](https://miro.com/app/dashboard/?createDevTeam=1), aceite os termos e clique em **Create team**. É um time à parte, de testes; seus quadros não mudam de lugar.
2. **Criar o app:** clique no seu avatar → **Settings** → aba **Your apps** → **+ Create new app**. Dê um nome (ex.: "Mesa") e **deixe desmarcado** "Expire user authorization token" (com ele, o token vence em 1 hora). Clique em **Create app**.
3. **Permissão:** na página do app, em **Permissions**, marque **`boards:read`** (o manifesto chama de `board:read`).
4. **Token:** no fim da página do app, clique em **Install app and get OAuth token**, escolha o time em **Select a team** e clique em **Install & authorize**. Copie o token mostrado.

O app é instalado no time escolhido no passo 4. Para ler um quadro de outro time, instale o app também nesse time (repita o passo 4 escolhendo o outro time); se o token não tiver acesso ao quadro, a Mesa avisa "token inválido ou sem acesso ao quadro".

## 2. Contar os itens do quadro (opcional)

Para inspecionar quantos itens de cada tipo existem no quadro antes de baixar as imagens:

```bash
MIRO_TOKEN="seu_token_aqui" npm run miro:baixar -- "https://miro.com/app/board/uXjV123456=/" --so-contar
```

## 3. Baixar o pacote `.miro.zip`

```bash
MIRO_TOKEN="seu_token_aqui" npm run miro:baixar -- "https://miro.com/app/board/uXjV123456=/" --saida meu-quadro.miro.zip
```

O comando baixa a descrição do quadro, todos os itens paginados, conectores e imagens anexadas, gerando o arquivo `meu-quadro.miro.zip`.

As imagens vêm no **tamanho original** (legíveis, mesmo handouts com texto), então o pacote pode ficar grande. Se a API recusar o original de alguma imagem, o script avisa e usa a miniatura. Para um pacote pequeno, com miniaturas, acrescente `--miniaturas`. O progresso aparece como `imagens: 120/524`.

### Tags e grupos

O pacote leva junto as **tags** e os **grupos** do quadro (se o token puder lê-los; senão o script avisa e segue sem eles). Pacotes antigos continuam válidos.

- **Grupos:** os itens de um mesmo grupo do Miro ficam agrupados na Mesa. Grupos com menos de 2 itens importados são ignorados.
- **Tags viram tipo** na sugestão da fila de revisão (sem acento e sem diferenciar maiúsculas): `teste`, `pericia`, `percepcao` = teste; `segredo`; `loot`, `tesouro`, `item` = loot; `npc`, `fala`, `dialogo` = fala; `leitura`, `ler`, `narracao` = leitura; `evento`; `tarefa`, `todo` = tarefa; `rever`, `revisar` = rever; `titulo`. A prioridade é: marcador no texto, depois tag, depois cor. O motivo aparece como `tag "Segredo"`. Tags que não estão na lista aparecem nos motivos (`tags: Lysdal, Ato 2`).

## 4. Importar na Mesa

1. Abra a **Mesa** na aba **Quadros**.
2. Clique em **Importar do Miro…** e selecione o arquivo `.miro.zip`.
3. O quadro será aberto com a **Fila de revisão** na lateral direita para confirmar ou ajustar os tipos sugeridos.

## 5. Atualizar um quadro já importado

Mudou algo no Miro depois da importação? Não precisa importar de novo: baixe um pacote novo do mesmo quadro (passo 3) e, com o quadro aberto na Mesa, clique em **Atualizar do Miro…** na barra do quadro. Um único Ctrl+Z desfaz a atualização inteira.

O que acontece com cada item:

| No Miro | Aqui na Mesa | Resultado |
|---|---|---|
| não mudou | tanto faz | nada |
| mudou | você não mexeu | o item é atualizado (conteúdo e posição) |
| mudou | você também mexeu | **conflito**: fica a sua versão e o item vai para a fila de revisão |
| foi apagado | você não mexeu | o item é removido |
| foi apagado | você mexeu | o item fica e vai para a fila de revisão ("Saiu do Miro") |
| é novo | — | é criado e vai para a fila de revisão |
| continua lá | você apagou aqui | continua apagado (não volta) |

Itens que você criou na Mesa nunca são tocados. O que é da Mesa também é mantido: tipo (semântica), "feito", travado, só mestre, grupos, ordem de empilhamento, cores e fontes, e as ligações. O pacote precisa ser do mesmo quadro do Miro; se for de outro, a Mesa avisa e não muda nada.

**Importante:** quadros importados antes desta versão não sabem de qual item do Miro cada coisa veio, então o botão não aparece neles. Importe o quadro de novo uma vez; dali em diante ele pode ser atualizado.

## 6. Copiar e colar do Miro

Selecione itens no Miro, **Ctrl+C**, e no Quadro da Mesa **Ctrl+V** (ou "Colar" no menu de contexto). Chegam textos, molduras, formas e setas com posição, proporção, fonte, cores e ligações, no centro da tela e num único Ctrl+Z.

- **Imagens:** o Miro só entrega o item, não o arquivo. Com o **token do Miro** salvo (botão "Token do Miro…" na lista de quadros, ou o botão do aviso de imagens sem arquivo), a colagem baixa os arquivos direto da API (`original`, ou `preview` se falhar), até 4 em paralelo, e guarda cada um em WebP de até 2048 px; tudo isso antes de criar os itens, então continua sendo um único Ctrl+Z. O token (passo 1 deste guia) fica só no `localStorage` deste aparelho: nunca vai ao banco da campanha, a exportações nem à sala online. Sem token, ou se o download falhar (token inválido, sem rede), a imagem chega como espaço reservado e o aviso diz quantas falharam; arraste o arquivo por cima ou use o `.miro.zip`. Se o quadro aberto já tem a imagem (por `.miro.zip` ou colagem anterior), ela é reaproveitada sem baixar de novo.
- **Escala:** o Miro usa escalas enormes por item. A Mesa divide tudo pela escala do texto de corpo (a que cobre mais caracteres), então o corpo chega com a fonte do Miro e o resto mantém a proporção. O fator fica guardado por quadro do Miro enquanto o app está aberto, para colagens seguintes se encaixarem.
- Colar não sincroniza: os itens colados não guardam a origem, então "Atualizar do Miro" não os conhece e colar duas vezes não os duplica na revisão.
