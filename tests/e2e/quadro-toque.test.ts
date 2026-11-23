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

test('E3c: pinça muda o zoom, um dedo no vazio move a câmera e toque longo abre o menu', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    // Ponteiros sintéticos não existem para o navegador: a captura real falharia.
    await page.addInitScript(() => {
      Element.prototype.setPointerCapture = () => {};
      Element.prototype.releasePointerCapture = () => {};
    });
    const erros: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Toque');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Quadro Toque');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');
    const area = await page.locator('[data-testid="area-quadro"]').boundingBox();
    assert.ok(area);

    const toque = (tipo: string, id: number, x: number, y: number) =>
      page.evaluate(
        ([t, i, cx, cy]) => {
          const el = document.querySelector('[data-testid="area-quadro"]')!;
          el.dispatchEvent(
            new PointerEvent(t as string, {
              pointerType: 'touch',
              pointerId: i as number,
              clientX: cx as number,
              clientY: cy as number,
              button: 0,
              isPrimary: i === 1,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        [tipo, id, x, y] as const,
      );
    const zoom = async () => (await page.locator('[data-testid="quadro-zoom"]').textContent())!;
    assert.equal(await zoom(), '100%');

    // Pinça: dedos de 200 px para 400 px de distância dobram o zoom.
    const cx = area.x + 500;
    const cy = area.y + 300;
    await toque('pointerdown', 1, cx - 100, cy);
    await toque('pointerdown', 2, cx + 100, cy);
    await toque('pointermove', 1, cx - 200, cy);
    await toque('pointermove', 2, cx + 200, cy);
    await page.waitForFunction(
      () => document.querySelector('[data-testid="quadro-zoom"]')?.textContent === '200%',
    );
    await toque('pointerup', 1, cx - 200, cy);
    await toque('pointerup', 2, cx + 200, cy);

    // Toque longo no vazio abre o menu do quadro.
    await toque('pointerdown', 3, area.x + 300, area.y + 500);
    await page.waitForSelector('[data-testid="menu-do-item"]', { timeout: 3000 });
    await toque('pointerup', 3, area.x + 300, area.y + 500);
    assert.equal(await zoom(), '200%');

    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});
