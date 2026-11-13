import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
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
    await page.locator('[data-testid^="editor-texto-"]').fill('Nota 1');
    await page.keyboard.press('Escape');

    // Nota 2
    await page.click('[data-testid="ferramenta-nota"]');
    await page.mouse.click(area.x + 550, area.y + 200);
    await page.locator('[data-testid^="editor-texto-"]').fill('Nota 2');
    await page.keyboard.press('Escape');

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
