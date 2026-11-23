import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

const CAMINHO = '/Mesa/src/app/campanha.ts';
let amb: Ambiente;
before(async () => {
  amb = await iniciarAmbiente();
});
after(async () => {
  await amb.encerrar();
});

test('E4a: ficha.recursos no barramento mostra PV e PD no cartão da personagem', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Cartoes');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="abrir-criador"]');
    await page.fill('[data-testid="nova-entidade-nome"]', 'Sindre');
    await page.click('[data-testid="criar-entidade"]');
    await page.waitForSelector('[data-testid="detalhe"]');

    // Dá à entidade um Ref de ficha (o Dossiê faria isso ao publicá-la).
    const ficha = { app: 'ficha', tipo: 'ficha', id: 'sindre-1' };
    await page.evaluate(async ({ f, caminho }) => {
      const c = await import(/* @vite-ignore */ caminho);
      const e = c.entidades.value.find((x: { nome: string }) => x.nome === 'Sindre')!;
      await c.obterRepositorio().salvarEntidade({ ...e, refs: [...e.refs, f] });
      await c.atualizar();
    }, { f: ficha, caminho: CAMINHO });

    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Mesa');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');
    const box = (await page.locator('[data-testid="area-quadro"]').boundingBox())!;
    await page.click('[data-testid="ferramenta-entidade"]');
    await page.mouse.click(box.x + 300, box.y + 250);
    const colocar = page.locator('[data-testid^="colocar-entidade-"]').first();
    await colocar.waitFor({ timeout: 5000 });
    await colocar.click();
    const cartao = page.locator('.item-ref').first();
    await cartao.waitFor();
    assert.equal(await page.locator('.item-ref-recursos').count(), 0, 'sem dado, sem barras');

    const publicar = (campanhaId: string | null, pv: number) =>
      page.evaluate(
        ({ f, campanhaId, pv }) => {
          const c = new BroadcastChannel('mesa:eventos');
          c.postMessage({ contrato: 1, tipo: 'ficha.recursos', app: 'ficha', campanhaId, em: Date.now(), id: crypto.randomUUID(), dados: { ficha: f, pv, pvMax: 10, pd: 2, pdMax: 4 } });
          c.close();
        },
        { f: ficha, campanhaId, pv },
      );
    const idCampanha = await page.evaluate(async (caminho) => (await import(/* @vite-ignore */ caminho)).campanhaAtiva.value!.id, CAMINHO);

    await publicar('outra-campanha', 3);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.item-ref-recursos').count(), 0, 'outra campanha é ignorada');

    await publicar(idCampanha, 7);
    await page.waitForSelector('.item-ref-recursos');
    assert.match((await page.locator('[data-testid^="recurso-pv-"]').textContent()) ?? '', /7\/10/);
    assert.match((await page.locator('[data-testid^="recurso-pd-"]').textContent()) ?? '', /2\/4/);

    await publicar(idCampanha, 2);
    await page.waitForFunction(() => /2\/10/.test(document.querySelector('[data-testid^="recurso-pv-"]')?.textContent ?? ''));
    assert.deepEqual(erros.filter((e) => !/__ponte|Failed to load resource|favicon/.test(e)), []);
  } finally {
    await ctx.close();
  }
});
