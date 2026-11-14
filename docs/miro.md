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

## 4. Importar na Mesa

1. Abra a **Mesa** na aba **Quadros**.
2. Clique em **Importar do Miro…** e selecione o arquivo `.miro.zip`.
3. O quadro será aberto com a **Fila de revisão** na lateral direita para confirmar ou ajustar os tipos sugeridos.
