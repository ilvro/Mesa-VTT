import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => {
  amb = await iniciarAmbiente();
});
after(async () => {
  await amb.encerrar();
});

test('Q1c: criar campanha, criar quadro Lysdal, voltar, recarregar e continuar na lista', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');

    // 1. Criar campanha
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Teste');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    // 2. Ir para aba Quadros
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    // 3. Criar "Lysdal" -> abre o quadro
    await page.fill('[data-testid="novo-quadro-nome"]', 'Lysdal');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="tela-quadro"]');
    assert.equal(await page.locator('[data-testid="quadro-nome"]').inputValue(), 'Lysdal');
    assert.equal(await page.locator('[data-testid="quadro-zoom"]').textContent(), '100%');

    // 4. Voltar -> aparece na lista
    await page.click('[data-testid="voltar-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');
    const cartao = page.locator('[data-testid^="cartao-quadro-"]');
    assert.equal(await cartao.count(), 1);
    assert.equal(await page.locator('[data-testid^="nome-quadro-"]').first().inputValue(), 'Lysdal');

    // 5. Recarregar a página -> continua lá
    await page.reload();
    await page.waitForSelector('[data-testid="tela-quadros"]');
    await page.locator('[data-testid^="cartao-quadro-"]').first().waitFor({ timeout: 5000 });
    assert.equal(await page.locator('[data-testid^="nome-quadro-"]').first().inputValue(), 'Lysdal');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q2a: criar 2 notas, selecionar com retângulo, mover, desfazer, refazer e recarregar', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');

    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q2a');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Q2a');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(area);

    // Nota 1
    await page.click('[data-testid="ferramenta-nota"]');
    await page.mouse.click(area.x + 250, area.y + 200);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.type('Nota 1');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    // Nota 2
    await page.click('[data-testid="ferramenta-nota"]');
    await page.mouse.click(area.x + 550, area.y + 200);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.type('Nota 2');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    const itens = page.locator('[data-testid^="item-"]');
    assert.equal(await itens.count(), 2);

    const posAntes = await itens.evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-item-id'),
        left: parseFloat((el as HTMLElement).style.left),
        top: parseFloat((el as HTMLElement).style.top),
      })),
    );

    // Selecionar as duas com retângulo de seleção
    await page.mouse.move(area.x + 200, area.y + 150);
    await page.mouse.down();
    await page.mouse.move(area.x + 850, area.y + 500, { steps: 5 });
    await page.mouse.up();

    // Arrastar a primeira nota selecionada 100px para a direita e 60px para baixo
    await page.mouse.move(area.x + 300, area.y + 250);
    await page.mouse.down();
    await page.mouse.move(area.x + 400, area.y + 310, { steps: 5 });
    await page.mouse.up();

    const posDepois = await itens.evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-item-id'),
        left: parseFloat((el as HTMLElement).style.left),
        top: parseFloat((el as HTMLElement).style.top),
      })),
    );
    assert.ok(Math.abs(posDepois[0]!.left - (posAntes[0]!.left + 100)) < 2);
    assert.ok(Math.abs(posDepois[1]!.left - (posAntes[1]!.left + 100)) < 2);

    // Desfazer (Ctrl+Z)
    await page.keyboard.press('Control+z');
    const posDesfeito = await itens.evaluateAll((els) =>
      els.map((el) => parseFloat((el as HTMLElement).style.left)),
    );
    assert.deepEqual(posDesfeito, [posAntes[0]!.left, posAntes[1]!.left]);

    // Refazer (Ctrl+Y)
    await page.keyboard.press('Control+y');
    const posRefeito = await itens.evaluateAll((els) =>
      els.map((el) => parseFloat((el as HTMLElement).style.left)),
    );
    assert.deepEqual(posRefeito, [posDepois[0]!.left, posDepois[1]!.left]);

    // Aguardar gravação adiada (400ms) e recarregar
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('[data-testid^="item-"]');
    const posRecarregado = await page.locator('[data-testid^="item-"]').evaluateAll((els) =>
      els.map((el) => parseFloat((el as HTMLElement).style.left)),
    );
    assert.deepEqual(posRecarregado.sort((a, b) => a - b), [posDepois[0]!.left, posDepois[1]!.left].sort((a, b) => a - b));

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q2b: editar uma nota com negrito e itálico, sair, recarregar e ver igual', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');

    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q2b');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Q2b');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(area);

    await page.click('[data-testid="ferramenta-nota"]');
    await page.mouse.click(area.x + 300, area.y + 220);
    await page.waitForSelector('[data-testid="editor-rico"]');

    await page.keyboard.press('Control+b');
    await page.keyboard.type('Negrito');
    await page.keyboard.press('Control+b');
    await page.keyboard.type(' e ');
    await page.keyboard.press('Control+i');
    await page.keyboard.type('Italico');
    await page.keyboard.press('Escape');

    await page.waitForSelector('[data-testid^="item-"] strong');
    assert.equal(await page.locator('[data-testid^="item-"] strong').textContent(), 'Negrito');
    assert.equal(await page.locator('[data-testid^="item-"] em').textContent(), 'Italico');

    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('[data-testid^="item-"] strong');
    assert.equal(await page.locator('[data-testid^="item-"] strong').textContent(), 'Negrito');
    assert.equal(await page.locator('[data-testid^="item-"] em').textContent(), 'Italico');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q2c: barra de formatação muda fundo de 2 notas com desfazer e destaca palavra em edição', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q2c');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Q2c');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(area);

    // Criar 2 notas
    await page.click('[data-testid="ferramenta-nota"]');
    await page.mouse.click(area.x + 250, area.y + 200);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.type('Primeira nota');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    await page.click('[data-testid="ferramenta-nota"]');
    await page.mouse.click(area.x + 550, area.y + 200);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.type('Segunda');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    // Selecionar todas (Ctrl+A) e mudar fundo das duas para azul (#7aa7f0)
    await page.keyboard.press('Control+a');
    await page.waitForSelector('[data-testid="barra-formatacao"]');
    await page.click('[data-testid="fmt-fundo-abrir"]');
    await page.click('[data-testid="fmt-fundo-cor-7aa7f0"]');

    const coresDepois = await page.locator('[data-testid^="item-"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.backgroundColor),
    );
    assert.deepEqual(coresDepois, ['rgb(122, 167, 240)', 'rgb(122, 167, 240)']);

    // Desfazer volta as duas para amarelo (#f7e48c)
    await page.keyboard.press('Control+z');
    const coresDesfeitas = await page.locator('[data-testid^="item-"]').evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).style.backgroundColor),
    );
    assert.deepEqual(coresDesfeitas, ['rgb(247, 228, 140)', 'rgb(247, 228, 140)']);

    // Editar primeira nota, selecionar palavra e aplicar fundo de texto amarelo
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(area.x + 300, area.y + 250);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await page.click('[data-testid="fmt-cor-destaque-abrir"]');
    await page.click('[data-testid="fmt-cor-destaque-cor-f7e48c"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    const html = await page.locator('[data-testid^="item-"] .doc-rico-html').first().innerHTML();
    assert.match(html, /background-color/i);

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q2f: colar uma imagem aparece no quadro e persiste ao recarregar', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q2f');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Q2f');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const c2d = canvas.getContext('2d')!;
      c2d.fillStyle = '#c45b43';
      c2d.fillRect(0, 0, 120, 80);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'teste.png', { type: 'image/png' }));
      const ev = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ev);
    });

    await page.waitForSelector('[data-testid^="item-"] img');
    const naturalWidth = await page
      .locator('[data-testid^="item-"] img')
      .evaluate((el: HTMLImageElement) => el.naturalWidth);
    assert.equal(naturalWidth, 120);

    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('[data-testid^="item-"] img');
    const naturalWidthDepois = await page
      .locator('[data-testid^="item-"] img')
      .evaluate((el: HTMLImageElement) => el.naturalWidth);
    assert.equal(naturalWidthDepois, 120);

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q3c: entidade Sindre -> [[Sindre]] no quadro -> página da Sindre lista o quadro -> clique volta ao item', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q3c');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.fill('[data-testid="nova-entidade-nome"]', 'Sindre');
    await page.click('[data-testid="criar-entidade"]');
    await page.waitForSelector('[data-testid="detalhe"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Taverna');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    await page.click('[data-testid="ferramenta-texto"]');
    const box = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + 250, box.y + 200);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.type('[data-testid="editor-rico"]', 'Falar com [[Sin');
    await page.waitForSelector('[data-testid="editor-rico-sugestoes"]');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');

    await page.waitForSelector('.quadro-ligacao');
    await page.click('.quadro-ligacao');

    await page.waitForSelector('[data-testid="detalhe"]');
    await page.waitForSelector('[data-testid="nos-quadros-lista"] button');
    const textoBacklink = await page
      .locator('[data-testid="nos-quadros-lista"] button')
      .first()
      .textContent();
    assert.ok(textoBacklink?.includes('Taverna'));

    await page.click('[data-testid="nos-quadros-lista"] button');
    await page.waitForSelector('[data-testid="area-quadro"]');
    await page.waitForSelector('.quadro-ligacao');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q4c: importar o fixture -> o quadro abre com os itens -> aceitar 2 itens na fila -> o contador faltam N diminui -> desfazer', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q4c');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    const fixtureJson = readFileSync(
      new URL('../unit/fixtures/miro/aventura-exemplo.json', import.meta.url),
      'utf8',
    );
    const zipBytes = zipSync({ 'quadro.json': strToU8(fixtureJson) });

    await page.setInputFiles('[data-testid="importar-miro-input"]', {
      name: 'castelo.miro.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipBytes),
    });

    await page.waitForSelector('[data-testid="area-quadro"]');
    await page.waitForSelector('[data-testid="painel-fila-revisao"]');

    assert.equal(
      await page.locator('[data-testid="quadro-nome"]').inputValue(),
      'Castelo de Corvos (importado)',
    );
    assert.equal(await page.locator('[data-testid="contador-revisao"]').textContent(), 'faltam 4');

    const botoesAceitar = page.locator('[data-testid^="revisao-aceitar-"]:not([data-testid^="revisao-aceitar-moldura-"])');
    assert.equal(await botoesAceitar.count(), 4);

    await botoesAceitar.first().click();
    assert.equal(await page.locator('[data-testid="contador-revisao"]').textContent(), 'faltam 3');

    await botoesAceitar.first().click();
    assert.equal(await page.locator('[data-testid="contador-revisao"]').textContent(), 'faltam 2');

    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('[data-testid="contador-revisao"]').textContent(), 'faltam 3');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q5c: âncora em um cartão -> emitir mesa.focar na janela -> o painel Espiar abre com o cartão', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q5c');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Masmorra');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    await page.click('[data-testid="ferramenta-texto"]');
    const box = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + 250, box.y + 200);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.type('[data-testid="editor-rico"]', 'Gaveta com fundo falso');
    await page.keyboard.press('Escape');

    const itemEl = page.locator('[data-testid^="item-"]').first();
    await itemEl.click({ button: 'right' });
    await page.waitForSelector('[data-testid="menu-do-item"]');
    await page.click('[data-testid="menu-ancorar-mapa"]');
    await page.fill('[data-testid="menu-ancorar-input"]', 'mesa:atlas/objeto/m1/escrivaninha');
    await page.click('[data-testid="menu-ancorar-confirmar"]');
    await page.keyboard.press('Escape');

    await page.waitForSelector('[data-testid^="pino-ancora-"]');

    await page.evaluate(() => {
      const ch = new BroadcastChannel('mesa:eventos');
      ch.postMessage({
        contrato: 1,
        app: 'atlas',
        tipo: 'mesa.focar',
        id: 'evt-q5c-1',
        em: Date.now(),
        campanhaId: null,
        dados: { ref: { app: 'atlas', tipo: 'objeto', id: 'm1/escrivaninha' } },
      });
      ch.close();
    });

    await page.waitForSelector('[data-testid="painel-espiar"]');
    const textoEspiar = await page.locator('[data-testid="painel-espiar"]').textContent();
    assert.ok(textoEspiar?.includes('Gaveta com fundo falso'));

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});
