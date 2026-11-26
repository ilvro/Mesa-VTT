import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import type { Page } from 'playwright';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

interface ItemSnapshot {
  id: string;
  tipo: string;
  x: number;
  y: number;
  largura?: number;
  altura?: number;
  larguraOriginal?: number;
  espessura?: number;
  rota?: string;
  curva?: [number, number];
  caixa?: { fundo?: string | null };
  doc?: { content?: { content?: { text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }[] }[] };
}

function textoDeSnapshot(it: ItemSnapshot): string {
  return (it.doc?.content ?? [])
    .map((p) => (p.content ?? []).map((n) => n.text ?? '').join(''))
    .join('\n');
}

async function centroNaTela(page: Page, it: ItemSnapshot): Promise<{ x: number; y: number }> {
  const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
  assert.ok(area);
  const cam = await page.evaluate(() => {
    const w = window as unknown as { __mesaQuadro?: { camera: () => { x: number; y: number; zoom: number } } };
    return w.__mesaQuadro?.camera() ?? { x: 0, y: 0, zoom: 1 };
  });
  const w = it.largura ?? 120;
  const h = it.altura ?? 60;
  return {
    x: area.x + (it.x + w / 2 - cam.x) * cam.zoom,
    y: area.y + (it.y + h / 2 - cam.y) * cam.zoom,
  };
}

async function itensDoQuadro(page: Page): Promise<ItemSnapshot[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __mesaQuadro?: { itens: () => ItemSnapshot[] } };
    return w.__mesaQuadro?.itens() ?? [];
  });
}

async function selecaoDoQuadro(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __mesaQuadro?: { selecao: () => string[] } };
    return w.__mesaQuadro?.selecao() ?? [];
  });
}

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

    await page.waitForSelector('[data-testid="canvas-quadro"]');
    const itens1 = await itensDoQuadro(page);
    assert.equal(itens1.length, 2);

    const posAntes = itens1.map((it) => ({ id: it.id, left: it.x, top: it.y }));

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

    const posDepois = (await itensDoQuadro(page)).map((it) => ({ id: it.id, left: it.x, top: it.y }));
    assert.ok(Math.abs(posDepois[0]!.left - (posAntes[0]!.left + 100)) < 2);
    assert.ok(Math.abs(posDepois[1]!.left - (posAntes[1]!.left + 100)) < 2);

    // Desfazer (Ctrl+Z)
    await page.keyboard.press('Control+z');
    const posDesfeito = (await itensDoQuadro(page)).map((it) => it.x);
    assert.deepEqual(posDesfeito, [posAntes[0]!.left, posAntes[1]!.left]);

    // Refazer (Ctrl+Y)
    await page.keyboard.press('Control+y');
    const posRefeito = (await itensDoQuadro(page)).map((it) => it.x);
    assert.deepEqual(posRefeito, [posDepois[0]!.left, posDepois[1]!.left]);

    // Aguardar gravação adiada (400ms) e recarregar
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
      return (w.__mesaQuadro?.itens().length ?? 0) === 2;
    });
    const posRecarregado = (await itensDoQuadro(page)).map((it) => it.x);
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

    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });
    const nosAntes = (await itensDoQuadro(page))[0]?.doc?.content?.[0]?.content ?? [];
    assert.ok(nosAntes.some((n) => n.text === 'Negrito' && n.marks?.some((m) => m.type === 'bold')));
    assert.ok(nosAntes.some((n) => n.text === 'Italico' && n.marks?.some((m) => m.type === 'italic')));

    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
      return (w.__mesaQuadro?.itens().length ?? 0) === 1;
    });
    const nosDepois = (await itensDoQuadro(page))[0]?.doc?.content?.[0]?.content ?? [];
    assert.ok(nosDepois.some((n) => n.text === 'Negrito' && n.marks?.some((m) => m.type === 'bold')));
    assert.ok(nosDepois.some((n) => n.text === 'Italico' && n.marks?.some((m) => m.type === 'italic')));

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

    const coresDepois = (await itensDoQuadro(page)).map((it) => it.caixa?.fundo);
    assert.deepEqual(coresDepois, ['#7aa7f0', '#7aa7f0']);

    // Desfazer volta as duas para amarelo (#f7e48c)
    await page.keyboard.press('Control+z');
    const coresDesfeitas = (await itensDoQuadro(page)).map((it) => it.caixa?.fundo);
    assert.deepEqual(coresDesfeitas, ['#f7e48c', '#f7e48c']);

    // Editar primeira nota, selecionar palavra e aplicar fundo de texto amarelo
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(area.x + 300, area.y + 250);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await page.click('[data-testid="fmt-cor-destaque-abrir"]');
    await page.click('[data-testid="fmt-cor-destaque-cor-f7e48c"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    const nosDestaque = (await itensDoQuadro(page))[0]?.doc?.content?.[0]?.content ?? [];
    assert.ok(
      nosDestaque.some((n) => n.marks?.some((m) => m.type === 'textStyle' && m.attrs?.backgroundColor)),
    );

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

    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => ItemSnapshot[] } };
      return w.__mesaQuadro?.itens().some((it) => it.tipo === 'imagem') ?? false;
    });
    const imgAntes = (await itensDoQuadro(page)).find((it) => it.tipo === 'imagem');
    assert.equal(imgAntes?.larguraOriginal, 120);

    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => ItemSnapshot[] } };
      return w.__mesaQuadro?.itens().some((it) => it.tipo === 'imagem') ?? false;
    });
    const imgDepois = (await itensDoQuadro(page)).find((it) => it.tipo === 'imagem');
    assert.equal(imgDepois?.larguraOriginal, 120);

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

    await page.click('[data-testid="abrir-criador"]');
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
    await page.click('[data-testid="molduras-miro-importar"]');

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

test('E2c: aceitar em massa um tipo -> contador diminui, Ctrl+Z volta', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha E2c');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    const fixtureJson = readFileSync(
      new URL('../unit/fixtures/miro/aventura-exemplo.json', import.meta.url),
      'utf8',
    );
    await page.setInputFiles('[data-testid="importar-miro-input"]', {
      name: 'castelo.miro.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync({ 'quadro.json': strToU8(fixtureJson) })),
    });
    await page.click('[data-testid="molduras-miro-importar"]');
    await page.waitForSelector('[data-testid="painel-fila-revisao"]');
    const contador = page.locator('[data-testid="contador-revisao"]');
    assert.equal(await contador.textContent(), 'faltam 4');

    const linhas = page.locator('[data-testid^="revisao-massa-"]:not([data-testid*="confirmar"]):not([data-testid*="cancelar"])');
    const total = await linhas.count();
    assert.ok(total >= 1);
    const alvo = linhas.first();
    const rotulo = (await alvo.textContent()) ?? '';
    const n = Number(rotulo.match(/\d+/)?.[0]);
    assert.ok(n >= 1);

    // Filtrar pelo tipo reduz a lista sem mudar o contador.
    const filtro = page.locator('[data-testid^="revisao-filtro-"]:not([data-testid="revisao-filtro-conflitos"])').first();
    await filtro.click();
    assert.equal(await page.locator('[data-testid^="revisao-item-"]').count(), n);
    await filtro.click();

    await alvo.click();
    await page.locator('[data-testid^="revisao-massa-confirmar-"]').click();
    assert.equal(await contador.textContent(), `faltam ${4 - n}`);

    await page.keyboard.press('Control+z');
    assert.equal(await contador.textContent(), 'faltam 4');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('E1c: atualizar do Miro -> relatório, conflito na fila e Ctrl+Z volta tudo', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  const zip = (nome: string) =>
    Buffer.from(
      zipSync({
        'quadro.json': strToU8(
          readFileSync(new URL(`../unit/fixtures/miro/${nome}.json`, import.meta.url), 'utf8'),
        ),
      }),
    );

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha E1c');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    await page.setInputFiles('[data-testid="importar-miro-input"]', {
      name: 'vivo-v1.miro.zip',
      mimeType: 'application/zip',
      buffer: zip('atualizacao-v1'),
    });
    await page.waitForSelector('[data-testid="area-quadro"]');
    await page.waitForSelector('[data-testid="botao-atualizar-miro"]', { state: 'attached' });
    const itensV1 = await itensDoQuadro(page);
    assert.equal(itensV1.length, 3);

    // Editar "Nota alfa" aqui (ela também muda no Miro: conflito).
    const notaAlfa = itensV1.find((it) => textoDeSnapshot(it).includes('Nota alfa'));
    assert.ok(notaAlfa);
    const ptAlfa = await centroNaTela(page, notaAlfa);
    await page.mouse.dblclick(ptAlfa.x, ptAlfa.y);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Alfa editada na Mesa');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    await page.setInputFiles('[data-testid="input-atualizar-miro"]', {
      name: 'vivo-v2.miro.zip',
      mimeType: 'application/zip',
      buffer: zip('atualizacao-v2'),
    });
    await page.locator('[data-testid="aviso"]', { hasText: 'Atualizado do Miro' }).waitFor();
    const aviso = await page.locator('[data-testid="aviso"]').last().textContent();
    assert.match(aviso ?? '', /1 novos, 1 atualizados, 1 removidos, 2 para revisar/);

    await page.waitForSelector('[data-testid="painel-fila-revisao"]');
    const textos = (await itensDoQuadro(page)).map(textoDeSnapshot);
    assert.equal(textos.length, 3);
    assert.ok(textos.some((t) => t.includes('Alfa editada na Mesa')));
    assert.ok(textos.some((t) => t.includes('Nota beta revisada')));
    assert.ok(textos.some((t) => t.includes('Nota delta')));
    assert.ok(!textos.some((t) => t.includes('Nota gama')));
    assert.equal(await page.locator('[data-testid="contador-revisao"]').textContent(), 'faltam 3');

    await page.keyboard.press('Control+z');
    const antes = (await itensDoQuadro(page)).map(textoDeSnapshot);
    assert.ok(antes.some((t) => t.includes('Nota gama')));
    assert.ok(antes.some((t) => t.includes('Nota beta') && !t.includes('revisada')));
    assert.ok(!antes.some((t) => t.includes('Nota delta')));

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

    const cartaoQ5c = (await itensDoQuadro(page))[0];
    assert.ok(cartaoQ5c);
    const ptQ5c = await centroNaTela(page, cartaoQ5c);
    await page.mouse.click(ptQ5c.x, ptQ5c.y, { button: 'right' });
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

test('Q5d: modo sessão com painel Quadro e os três modos (Desligado, Espiar e Seguir)', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q5d');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro da Taverna');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    await page.click('[data-testid="ferramenta-texto"]');
    const box = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + 300, box.y + 250);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.type('[data-testid="editor-rico"]', 'Segredo do balcão');
    await page.keyboard.press('Escape');

    const cartaoQ5d = (await itensDoQuadro(page))[0];
    assert.ok(cartaoQ5d);
    const ptQ5d = await centroNaTela(page, cartaoQ5d);
    await page.mouse.click(ptQ5d.x, ptQ5d.y, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-do-item"]');
    await page.click('[data-testid="menu-ancorar-mapa"]');
    await page.fill('[data-testid="menu-ancorar-input"]', 'mesa:atlas/objeto/m1/balcao');
    await page.click('[data-testid="menu-ancorar-confirmar"]');
    await page.keyboard.press('Escape');

    // Abre o modo sessão e ativa o preset Com quadro
    await page.click('[data-testid="aba-sessao"]');
    await page.waitForSelector('[data-testid="tela-sessao"]');
    await page.click('[data-testid="abrir-menu-paineis"]'); await page.click('[data-testid="preset-com-quadro"]');
    await page.waitForSelector('[data-testid="painel-corpo-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    // Desseleciona o cartão clicando em área vazia
    const boxSessao = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(boxSessao);
    await page.mouse.click(boxSessao.x + 20, boxSessao.y + 20);
    assert.equal(await page.locator('[data-testid="caixa-selecao"]').count(), 0);

    // 1. Modo Desligado: evento do Atlas não abre o painel Espiar
    await page.selectOption('[data-testid="sessao-modo-foco"]', 'desligado');
    await page.evaluate(() => {
      const ch = new BroadcastChannel('mesa:eventos');
      ch.postMessage({
        contrato: 1,
        app: 'atlas',
        tipo: 'atlas.inspecionado',
        id: 'evt-q5d-1',
        em: Date.now(),
        campanhaId: null,
        dados: {
          mapa: { app: 'atlas', tipo: 'mapa', id: 'm1' },
          alvo: { app: 'atlas', tipo: 'objeto', id: 'm1/balcao' },
        },
      });
      ch.close();
    });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid="painel-espiar"]').count(), 0);

    // 2. Modo Espiar: objeto sem âncora não faz nada; objeto ancorado abre o painel Espiar
    await page.selectOption('[data-testid="sessao-modo-foco"]', 'espiar');
    await page.evaluate(() => {
      const ch = new BroadcastChannel('mesa:eventos');
      ch.postMessage({
        contrato: 1,
        app: 'atlas',
        tipo: 'atlas.inspecionado',
        id: 'evt-q5d-2',
        em: Date.now(),
        campanhaId: null,
        dados: {
          mapa: { app: 'atlas', tipo: 'mapa', id: 'm1' },
          alvo: { app: 'atlas', tipo: 'objeto', id: 'm1/vazio' },
        },
      });
      ch.close();
    });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-testid="painel-espiar"]').count(), 0);

    await page.evaluate(() => {
      const ch = new BroadcastChannel('mesa:eventos');
      ch.postMessage({
        contrato: 1,
        app: 'atlas',
        tipo: 'atlas.inspecionado',
        id: 'evt-q5d-3',
        em: Date.now(),
        campanhaId: null,
        dados: {
          mapa: { app: 'atlas', tipo: 'mapa', id: 'm1' },
          alvo: { app: 'atlas', tipo: 'objeto', id: 'm1/balcao' },
        },
      });
      ch.close();
    });
    await page.waitForSelector('[data-testid="painel-espiar"]');
    assert.ok((await page.locator('[data-testid="painel-espiar"]').textContent())?.includes('Segredo do balcão'));
    await page.click('[data-testid="espiar-fechar"]');

    // 3. Modo Seguir: enquadra e seleciona o cartão ancorado
    await page.selectOption('[data-testid="sessao-modo-foco"]', 'seguir');
    await page.evaluate(() => {
      const ch = new BroadcastChannel('mesa:eventos');
      ch.postMessage({
        contrato: 1,
        app: 'atlas',
        tipo: 'atlas.inspecionado',
        id: 'evt-q5d-4',
        em: Date.now(),
        campanhaId: null,
        dados: {
          mapa: { app: 'atlas', tipo: 'mapa', id: 'm1' },
          alvo: { app: 'atlas', tipo: 'objeto', id: 'm1/balcao' },
        },
      });
      ch.close();
    });
    await page.waitForSelector('[data-testid="caixa-selecao"]');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('Q5e: no modo sessão os atalhos do quadro só valem depois de clicar nele', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Q5e');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Q5e');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    await page.click('[data-testid="ferramenta-nota"]');
    const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(area);
    await page.mouse.click(area.x + 120, area.y + 120);
    await page.waitForSelector('[data-testid="editor-rico"]');
    await page.keyboard.type('Nota Q5e');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });

    await page.click('[data-testid="aba-sessao"]');
    await page.waitForSelector('[data-testid="tela-sessao"]');
    await page.click('[data-testid="abrir-menu-paineis"]');
    await page.click('[data-testid="preset-com-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');
    const secao = page.locator('[data-testid="tela-quadro"]');
    assert.equal(await secao.getAttribute('data-ativo'), 'false', 'começa inativo na sessão');
    const itensQ5e = await itensDoQuadro(page);
    const antes = itensQ5e.length;
    assert.ok(antes >= 1);
    const ptQ5e = await centroNaTela(page, itensQ5e[0]!);

    // Clica no item (ativa e seleciona), depois num botão de outro painel: Delete não apaga.
    await page.mouse.click(ptQ5e.x, ptQ5e.y);
    assert.equal(await secao.getAttribute('data-ativo'), 'true');
    await page.click('[data-testid="abrir-menu-paineis"]');
    assert.equal(await secao.getAttribute('data-ativo'), 'false');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    assert.equal((await itensDoQuadro(page)).length, antes, 'Delete fora do quadro não apaga');

    // Clica no quadro de novo: Delete apaga.
    await page.mouse.click(ptQ5e.x, ptQ5e.y);
    await page.keyboard.press('Delete');
    await page.waitForFunction((n) => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
      return (w.__mesaQuadro?.itens().length ?? 0) < n;
    }, antes);
  } finally {
    await ctx.close();
  }
});

test('E2b: importar só uma moldura do Miro e atualizar respeitando o filtro', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  const pacote = Buffer.from(
    zipSync({
      'quadro.json': strToU8(
        readFileSync(new URL('../unit/fixtures/miro/molduras.json', import.meta.url), 'utf8'),
      ),
    }),
  );

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha E2b');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    await page.setInputFiles('[data-testid="importar-miro-input"]', {
      name: 'grande.miro.zip',
      mimeType: 'application/zip',
      buffer: pacote,
    });
    await page.waitForSelector('[data-testid="dialogo-molduras-miro"]');
    assert.equal(await page.locator('[data-testid^="moldura-miro-contagem-"]').count(), 2);
    assert.match((await page.locator('[data-testid="moldura-miro-contagem-f-a"]').textContent()) ?? '', /2 itens/);

    // Busca filtra a lista.
    await page.fill('[data-testid="molduras-miro-busca"]', 'Ato 2');
    assert.equal(await page.locator('[data-testid^="moldura-miro-linha-"]').count(), 1);
    await page.fill('[data-testid="molduras-miro-busca"]', '');

    // Desmarca tudo e marca só o Ato 1.
    await page.uncheck('[data-testid="molduras-miro-todas"]');
    assert.equal(await page.locator('[data-testid="molduras-miro-importar"]').isDisabled(), true);
    await page.check('[data-testid="moldura-miro-f-a"]');
    await page.click('[data-testid="molduras-miro-importar"]');

    await page.waitForSelector('[data-testid="area-quadro"]');
    assert.equal(await page.locator('[data-testid="quadro-nome"]').inputValue(), 'Ato 1 (importado)');
    const extrairTextos = (lista: ItemSnapshot[]) =>
      lista.flatMap((it) => (it.doc?.content ?? []).flatMap((b) => (b.content ?? []).map((n) => n.text ?? '')));
    const textos = extrairTextos(await itensDoQuadro(page));
    assert.ok(textos.some((t) => t.includes('Nota a1')));
    assert.ok(textos.some((t) => t.includes('Nota a2')));
    assert.ok(!textos.some((t) => t.includes('Nota b1') || t.includes('solta')));

    // Atualizar com o mesmo pacote: o filtro vale, nada volta nem some.
    await page.setInputFiles('[data-testid="input-atualizar-miro"]', {
      name: 'grande.miro.zip',
      mimeType: 'application/zip',
      buffer: pacote,
    });
    await page.locator('[data-testid="aviso"]', { hasText: 'Nada mudou no Miro' }).waitFor();
    const depois = extrairTextos(await itensDoQuadro(page));
    assert.ok(!depois.some((t) => t.includes('Nota b1')));

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('E3a: alternar para Ler, clicar numa moldura do índice e voltar ao quadro com "ver no quadro"', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  const pacote = Buffer.from(
    zipSync({
      'quadro.json': strToU8(
        readFileSync(new URL('../unit/fixtures/miro/molduras.json', import.meta.url), 'utf8'),
      ),
    }),
  );

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha E3a');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');
    await page.setInputFiles('[data-testid="importar-miro-input"]', {
      name: 'grande.miro.zip',
      mimeType: 'application/zip',
      buffer: pacote,
    });
    await page.waitForSelector('[data-testid="dialogo-molduras-miro"]');
    await page.click('[data-testid="molduras-miro-importar"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    // Quadro -> Ler: a página contínua com as duas molduras e o índice.
    assert.equal(await page.locator('[data-testid="leitura-quadro"]').count(), 0);
    await page.click('[data-testid="modo-ler"]');
    await page.waitForSelector('[data-testid="leitura-quadro"]');
    assert.equal(await page.locator('[data-testid="area-quadro"]').isVisible(), false);
    assert.equal(await page.locator('[data-testid="barra-quadro"]').isVisible(), true);
    const titulos = await page.locator('.leitura-titulo').allTextContents();
    assert.deepEqual(titulos.slice(0, 2), ['Ato 1', 'Ato 2']);
    assert.equal(await page.locator('[data-testid^="leitura-indice-"]').count(), 2);
    const textoLeitura = (await page.locator('[data-testid="leitura-rolagem"]').textContent()) ?? '';
    assert.ok(textoLeitura.includes('Nota a1'));
    assert.ok(textoLeitura.includes('Nota b1'));

    // Índice: clicar na segunda moldura rola até ela.
    await page.locator('[data-testid^="leitura-indice-"]').nth(1).click();
    await page.waitForFunction(() => {
      const h = document.querySelectorAll('.leitura-titulo')[1];
      const c = document.querySelector('[data-testid="leitura-rolagem"]');
      if (!h || !c) return false;
      return Math.abs(h.getBoundingClientRect().top - c.getBoundingClientRect().top) < 80;
    });
    await page.waitForFunction(() =>
      document.querySelectorAll('[data-testid^="leitura-indice-"]')[1]?.classList.contains('ativo'),
    );

    // "ver no quadro" volta ao modo Quadro com o item selecionado.
    const itemB1 = page.locator('[data-testid^="leitura-item-"]', { hasText: 'Nota b1' }).first();
    await itemB1.hover();
    await itemB1.locator('[data-testid^="ver-no-quadro-"]').click();
    await page.waitForSelector('[data-testid="area-quadro"]');
    assert.equal(await page.locator('[data-testid="leitura-quadro"]').count(), 0);
    await page.waitForSelector('[data-testid="caixa-selecao"]');
    const selE3a = await selecaoDoQuadro(page);
    const itemSelecionado = (await itensDoQuadro(page)).find((it) => it.id === selE3a[0]);
    const txtSel = (itemSelecionado?.doc?.content ?? [])
      .flatMap((b) => (b.content ?? []).map((n) => n.text ?? ''))
      .join(' ');
    assert.ok(txtSel.includes('Nota b1'));

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('importação do Miro lê em pedaços e reduz imagem > 2048 px para WebP', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Miro WebP');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');

    const pngBytes = new Uint8Array(
      await page.evaluate(async () => {
        const c = new OffscreenCanvas(3000, 1500);
        const cx = c.getContext('2d')!;
        cx.fillStyle = '#336699';
        cx.fillRect(0, 0, 3000, 1500);
        const blob = await c.convertToBlob({ type: 'image/png' });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }),
    );

    const pacoteMiro = {
      formato: 'miro-bruto',
      versao: 1,
      baixadoEm: Date.now(),
      board: { id: 'b-webp', name: 'Handouts Grandes' },
      items: [
        {
          id: 'img-1',
          type: 'image',
          arquivoLocal: 'imagens/img-1.png',
          position: { x: 0, y: 0 },
          geometry: { width: 3000, height: 1500 },
        },
      ],
      connectors: [],
    };
    const zipBytes = zipSync({
      'imagens/img-1.png': [pngBytes, { level: 0 }],
      'quadro.json': strToU8(JSON.stringify(pacoteMiro)),
    });

    await page.setInputFiles('[data-testid="importar-miro-input"]', {
      name: 'handouts.miro.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipBytes),
    });
    await page.waitForSelector('[data-testid="area-quadro"]');

    const salva = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('mesa-quadros-v1');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise<{ tipo: string; largura: number; altura: number }[]>((resolve, reject) => {
        const tx = db.transaction(['imagens'], 'readonly');
        const req = tx.objectStore('imagens').getAll();
        req.onsuccess = () => {
          resolve(
            (req.result as { tipo: string; largura: number; altura: number }[]).map((r) => ({
              tipo: r.tipo,
              largura: r.largura,
              altura: r.altura,
            })),
          );
        };
        req.onerror = () => reject(req.error);
      });
    });

    assert.equal(salva.length, 1);
    assert.equal(salva[0]!.tipo, 'image/webp');
    assert.equal(salva[0]!.largura, 2048);
    assert.equal(salva[0]!.altura, 1024);
    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('QW1: arrastar com o botão direito move o quadro e clique direito parado abre o menu', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha QW1');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Pan Direito');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const antes = await page.locator('[data-testid="mundo-quadro"]').getAttribute('style');

    await page.mouse.move(600, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(450, 300, { steps: 5 });
    await page.mouse.up({ button: 'right' });

    const depois = await page.locator('[data-testid="mundo-quadro"]').getAttribute('style');
    assert.notEqual(depois, antes);
    assert.equal(await page.locator('[data-testid="menu-do-item"]').count(), 0);

    // Clique direito parado continua abrindo o menu de contexto.
    await page.mouse.click(600, 400, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-do-item"]');
    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('QW3: curvar seta arrastando o meio e ajustar espessura acima de 12 px', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

  try {
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha QW3');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.waitForSelector('[data-testid="tela-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Linhas Curvas');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const area = (await page.locator('[data-testid="area-quadro"]').boundingBox())!;

    // Desenha uma seta livre no centro da área do quadro.
    await page.click('[data-testid="ferramenta-seta"]');
    await page.mouse.move(area.x + 250, area.y + 250);
    await page.mouse.down();
    await page.mouse.move(area.x + 550, area.y + 250, { steps: 5 });
    await page.mouse.up();

    // Seleciona a seta criada (ao soltar, já volta para selecionar).
    await page.waitForSelector('[data-testid="fmt-seta-espessura"]');
    await page.fill('[data-testid="fmt-seta-espessura"]', '24');
    await page.locator('[data-testid="fmt-seta-espessura"]').press('Enter');

    const setaAntes = (await itensDoQuadro(page)).find((it) => it.tipo === 'seta');
    assert.equal(setaAntes?.espessura, 24);

    // Arrasta a alça de curva para baixo.
    const alca = page.locator('[data-testid="alca-curva-seta"]');
    await alca.waitFor();
    const box = (await alca.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 80, { steps: 5 });
    await page.mouse.up();

    const setaDepois = (await itensDoQuadro(page)).find((it) => it.tipo === 'seta');
    assert.equal(setaDepois?.rota, 'curva');
    assert.ok(Array.isArray(setaDepois?.curva) && setaDepois!.curva.length === 2);

    // Aguarda gravação adiada (400ms), recarrega e confirma persistência.
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => ItemSnapshot[] } };
      return w.__mesaQuadro?.itens().some((it) => it.tipo === 'seta') ?? false;
    });
    const setaPersistida = (await itensDoQuadro(page)).find((it) => it.tipo === 'seta');
    assert.equal(setaPersistida?.espessura, 24);
    assert.equal(setaPersistida?.rota, 'curva');
    assert.ok(Array.isArray(setaPersistida?.curva) && setaPersistida!.curva.length === 2);
    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});
