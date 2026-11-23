import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserContext, Page } from 'playwright';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => {
  amb = await iniciarAmbiente();
});
after(async () => {
  await amb.encerrar();
});

const MODULO_QUADRO = '/Mesa/src/dominio/quadro.ts';
const MODULO_BANCO = '/Mesa/src/app/banco-quadros.ts';
const IGNORAR = /__ponte|Failed to load resource|favicon/;

/** Quadro "Handouts" com a moldura M (só texto normal, segredo, só mestre, e teste) e um texto de fora dela. */
async function montarQuadro(ctx: BrowserContext, nomeCampanha: string): Promise<{ page: Page; quadroId: string; erros: string[] }> {
  const page = await ctx.newPage();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto(`${amb.origem}/Mesa/`);
  await page.waitForSelector('[data-testid="campanha-select"]');
  await page.click('[data-testid="aba-campanhas"]');
  await page.fill('[data-testid="nova-campanha-nome"]', nomeCampanha);
  await page.click('[data-testid="criar-campanha"]');
  await page.waitForSelector('[data-testid="tela-entidades"]');
  await page.click('[data-testid="aba-quadros"]');
  await page.fill('[data-testid="novo-quadro-nome"]', 'Handouts');
  await page.click('[data-testid="criar-quadro"]');
  await page.waitForSelector('[data-testid="area-quadro"]');
  const quadroId = await page.evaluate(
    async ({ mq, mb }) => {
      const caminhoQuadros: string = '/Mesa/src/app/quadros.ts';
      const q = await import(/* @vite-ignore */ caminhoQuadros);
      const dom = await import(/* @vite-ignore */ mq);
      const banco = await import(/* @vite-ignore */ mb);
      const id: string = q.quadroAberto.value!.id;
      const texto = (itemId: string, x: number, y: number, t: string, extra: Record<string, unknown> = {}) => ({
        ...dom.novaNotaAdesiva({ quadroId: id, x, y, largura: 260, altura: 80, doc: dom.docDeTexto(t) }, 1, itemId),
        molduraId: 'M',
        ...extra,
      });
      await banco.gravarItens(
        [
          dom.novaMoldura({ quadroId: id, x: 0, y: 0, largura: 700, altura: 500, titulo: 'Carta' }, 1, 'M'),
          texto('normal', 20, 20, 'Texto normal da carta'),
          texto('segredo', 20, 120, 'Texto segredo do mestre', { semantica: 'segredo' }),
          texto('mestre', 20, 220, 'Anotacao so do mestre', { soMestre: true }),
          texto('teste', 20, 320, 'Olhe em volta [PERCEPÇÃO 13] com cuidado'),
          { ...dom.novaNotaAdesiva({ quadroId: id, x: 900, y: 20, largura: 200, altura: 80, doc: dom.docDeTexto('Texto fora da moldura') }, 1, 'fora'), molduraId: null },
        ],
        [],
      );
      return id;
    },
    { mq: MODULO_QUADRO, mb: MODULO_BANCO },
  );
  // recarrega o quadro com os itens gravados
  await page.goto(`${amb.origem}/Mesa/#/quadro/${quadroId}`);
  await page.reload();
  await page.waitForSelector('[data-testid="item-normal"]');
  return { page, quadroId, erros };
}

async function textoDaProjecao(proj: Page): Promise<string> {
  return (await proj.locator('[data-testid="projecao"]').textContent()) ?? '';
}

test('E3b: "Mostrar aos jogadores" abre a projeção só com o que é dos jogadores; parar deixa preto', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const { page, erros } = await montarQuadro(ctx, 'Campanha Projecao');

    // Mestre: o segredo e o teste aparecem no quadro dele.
    assert.match((await page.locator('[data-testid="item-teste"]').textContent()) ?? '', /PERCEPÇÃO/);

    // Menu da moldura -> Mostrar aos jogadores (abre a janela de projeção)
    await page.locator('[data-testid="item-M"]').click({ button: 'right', position: { x: 6, y: 6 } });
    await page.waitForSelector('[data-testid="menu-do-item"]');
    const [proj] = await Promise.all([ctx.waitForEvent('page'), page.click('[data-testid="menu-mostrar-aos-jogadores"]')]);
    const errosProj: string[] = [];
    proj.on('pageerror', (e) => errosProj.push(e.message));
    await proj.waitForSelector('[data-testid="projecao"][data-estado="projetando"]', { timeout: 10000 });
    await proj.waitForSelector('[data-item-id="normal"]');

    // Sem cabeçalho do app
    assert.equal(await proj.locator('[data-testid="aba-quadros"]').count(), 0);
    assert.match(await proj.locator('[data-testid="projecao"]').innerHTML(), /Texto normal da carta/);

    const html = await proj.content();
    assert.match(await textoDaProjecao(proj), /Texto normal da carta/);
    assert.match(await textoDaProjecao(proj), /Olhe em volta\s+com cuidado/);
    for (const proibido of ['segredo do mestre', 'so do mestre', 'PERCEPÇÃO', 'PERCEP', 'fora da moldura']) {
      assert.equal(html.includes(proibido), false, `a projeção não pode conter "${proibido}"`);
    }
    assert.equal(await proj.locator('[data-item-id="segredo"], [data-item-id="mestre"], [data-item-id="fora"]').count(), 0);
    assert.equal(await proj.locator('.item-feito-btn, .selo-condicao, .em-revisao, .item-pino-ancora').count(), 0);

    // Selo no quadro do mestre
    assert.match((await page.locator('[data-testid="selo-projecao"]').textContent()) ?? '', /Projetando: Carta/);

    // Parar: tela preta e selo some
    await page.click('[data-testid="parar-projecao"]');
    await proj.waitForSelector('[data-testid="projecao"][data-estado="parada"]');
    assert.equal(await page.locator('[data-testid="selo-projecao"]').count(), 0);
    assert.equal((await textoDaProjecao(proj)).trim(), '');

    assert.deepEqual(erros.filter((e) => !IGNORAR.test(e)), []);
    assert.deepEqual(errosProj.filter((e) => !IGNORAR.test(e)), []);
  } finally {
    await ctx.close();
  }
});

test('E3b: a rota de projeção obedece ao canal (mostrar, atualizar, parar) e relê o banco', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const { page, quadroId } = await montarQuadro(ctx, 'Campanha Canal');
    const proj = await ctx.newPage();
    await proj.goto(`${amb.origem}/Mesa/#/projecao/${quadroId}`);
    await proj.waitForSelector('[data-testid="projecao"][data-estado="parada"]');

    const enviar = (m: unknown) =>
      page.evaluate((msg) => {
        const c = new BroadcastChannel('mesa:projecao');
        c.postMessage(msg);
        c.close();
      }, m);

    await enviar({ tipo: 'mostrar', quadroId, molduraId: 'M' });
    await proj.waitForSelector('[data-item-id="normal"]');
    assert.equal(await proj.locator('[data-item-id="segredo"], [data-item-id="mestre"], [data-item-id="fora"]').count(), 0);
    assert.equal((await proj.content()).includes('PERCEPÇÃO'), false);

    // O mestre muda um item no banco (o segredo vira texto comum) e manda "atualizar".
    await page.evaluate(async (mb) => {
      const banco = await import(/* @vite-ignore */ mb);
      const lista = await banco.listarItens((await import(/* @vite-ignore */ ('/Mesa/src/app/quadros.ts' as string))).quadroAberto.value!.id);
      const it = lista.find((i: { id: string }) => i.id === 'segredo');
      await banco.gravarItens([{ ...it, semantica: null }], []);
    }, MODULO_BANCO);
    await enviar({ tipo: 'atualizar' });
    await proj.waitForSelector('[data-item-id="segredo"]');
    assert.equal((await proj.content()).includes('so do mestre'), false);

    // Mensagens de outra forma são ignoradas.
    await enviar({ tipo: 'mostrar', quadroId });
    await enviar({ tipo: 'qualquer' });
    await proj.waitForTimeout(300);
    assert.equal(await proj.locator('[data-item-id="normal"]').count(), 1);

    await enviar({ tipo: 'parar' });
    await proj.waitForSelector('[data-testid="projecao"][data-estado="parada"]');
    assert.equal(await proj.locator('[data-item-id]').count(), 0);
  } finally {
    await ctx.close();
  }
});
