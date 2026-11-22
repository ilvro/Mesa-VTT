# Importar um quadro do Miro

A Mesa importa quadros do Miro a partir de um pacote `.miro.zip` gerado localmente. O token da sua conta Miro nunca é gravado no pacote nem enviado para terceiros.

## 1. Gerar um token de leitura no Miro

1. Acesse [miro.com/app/settings/user-profile/apps](https://miro.com/app/settings/user-profile/apps) e crie um aplicativo de desenvolvedor.
2. Em **Permissions**, marque a permissão **`boards:read`**.
3. Clique em **Install app and get OAuth token** e copie o token gerado.

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
