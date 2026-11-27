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

test('E4b: salvar uma moldura com duas notas como modelo e carimbar em outro ponto', async () => {
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
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Modelos');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Modelos');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');
    const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(area);

    // Moldura arrastada e duas notas dentro dela.
    await page.click('[data-testid="ferramenta-moldura"]');
    await page.mouse.move(area.x + 100, area.y + 100);
    await page.mouse.down();
    await page.mouse.move(area.x + 600, area.y + 400, { steps: 5 });
    await page.mouse.up();
    for (const [dx, texto] of [[160, 'Leitura'], [420, 'Segredo']] as const) {
      await page.click('[data-testid="ferramenta-nota"]');
      await page.mouse.click(area.x + dx, area.y + 220);
      await page.waitForSelector('[data-testid="editor-rico"]');
      await page.keyboard.type(texto);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });
    }
    const contarItens = () =>
      page.evaluate(() => {
        const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
        return w.__mesaQuadro?.itens().length ?? 0;
      });
    assert.equal(await contarItens(), 3);

    // Salvar como modelo (esta campanha).
    await page.keyboard.press('Control+a');
    await page.mouse.click(area.x + 100, area.y + 100, { button: 'right' });
    await page.waitForSelector('[data-testid="menu-do-item"]');
    await page.click('[data-testid="menu-salvar-modelo"]');
    await page.fill('[data-testid="modelo-nome"]', 'Cena padrão');
    await page.click('[data-testid="modelo-salvar"]');
    await page.waitForSelector('[data-testid="menu-do-item"]', { state: 'detached' });

    // Ferramenta Modelo: escolher e carimbar noutro ponto.
    await page.click('[data-testid="ferramenta-modelo"]');
    await page.waitForSelector('[data-testid="painel-modelos"]');
    await page.locator('[data-testid^="modelo-escolher-"]').first().click();
    await page.mouse.click(area.x + 900, area.y + 450);
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
      return (w.__mesaQuadro?.itens().length ?? 0) === 6;
    });
    assert.equal(await contarItens(), 6);

    // Um Ctrl+Z desfaz o carimbo inteiro.
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
      return (w.__mesaQuadro?.itens().length ?? 0) === 3;
    });

    // Carimbar de novo e conferir que o modelo sobrevive a recarregar a página.
    await page.mouse.click(area.x + 900, area.y + 450);
    await page.waitForFunction(() => {
      const w = window as unknown as { __mesaQuadro?: { itens: () => unknown[] } };
      return (w.__mesaQuadro?.itens().length ?? 0) === 6;
    });
    await page.reload();
    await page.waitForSelector('[data-testid="area-quadro"]');
    await page.click('[data-testid="ferramenta-modelo"]');
    assert.equal(await page.locator('[data-testid^="modelo-escolher-"]').count(), 1);

    // Renomear e apagar com confirmação inline.
    const escolher = page.locator('[data-testid^="modelo-escolher-"]').first();
    const id = ((await escolher.getAttribute('data-testid')) ?? '').replace('modelo-escolher-', '');
    await page.click(`[data-testid="modelo-renomear-${id}"]`);
    await page.fill(`[data-testid="modelo-renomear-input-${id}"]`, 'Cena renomeada');
    await page.click(`[data-testid="modelo-renomear-ok-${id}"]`);
    await page.waitForFunction(
      (t) => document.querySelector(`[data-testid="${t}"]`)?.textContent?.includes('Cena renomeada'),
      `modelo-escolher-${id}`,
    );
    await page.click(`[data-testid="modelo-apagar-${id}"]`);
    await page.click(`[data-testid="modelo-apagar-confirmar-${id}"]`);
    await page.waitForSelector('[data-testid="modelos-vazio"]');

    // O WebSocket da ponte de desenvolvimento (Vite) pode falhar no proxy de teste: não é do quadro.
    assert.deepEqual(erros.filter((e) => !e.includes('__ponte')), []);
  } finally {
    await ctx.close();
  }
});
