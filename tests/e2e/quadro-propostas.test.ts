import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

const QUADROS = '/Mesa/src/app/quadros.ts';
const PROPOSTA = '/Mesa/src/dominio/proposta-quadro.ts';
let amb: Ambiente;
before(async () => {
  amb = await iniciarAmbiente();
});
after(async () => {
  await amb.encerrar();
});

test('L4a: proposta do assistente vira moldura e notas na fila "Do assistente"; aceitar todas e Ctrl+Z', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(`${amb.origem}/Mesa/`);
    await page.waitForSelector('[data-testid="campanha-select"]');
    await page.click('[data-testid="aba-campanhas"]');
    await page.fill('[data-testid="nova-campanha-nome"]', 'Campanha Propostas');
    await page.click('[data-testid="criar-campanha"]');
    await page.waitForSelector('[data-testid="tela-entidades"]');
    await page.click('[data-testid="aba-quadros"]');
    await page.fill('[data-testid="novo-quadro-nome"]', 'Ideias');
    await page.click('[data-testid="criar-quadro"]');
    await page.waitForSelector('[data-testid="area-quadro"]');

    const n = await page.evaluate(async ({ q, p }) => {
      const quadros = await import(/* @vite-ignore */ q);
      const prop = await import(/* @vite-ignore */ p);
      const pos = prop.posicaoLivre(prop.tamanhoDaProposta(3), quadros.itens.value.values(), null);
      const r = prop.montarProposta('Ganchos', [{ texto: 'O ferreiro mente', tipo: 'segredo' }, { texto: 'Uma ponte cai' }, { texto: 'Um estranho chega', tipo: 'evento' }], {
        quadroId: quadros.quadroAberto.value.id, x: pos.x, y: pos.y, agora: Date.now(), novoId: () => crypto.randomUUID(),
      });
      quadros.executar({ rotulo: 'Proposta do assistente', ops: [{ criar: r.itens }] });
      return r.moldura.id as string;
    }, { q: QUADROS, p: PROPOSTA });

    await page.waitForSelector(`[data-testid="item-${n}"].em-revisao-assistente`);
    assert.equal(await page.locator('.item-texto.em-revisao-assistente').count(), 3);

    await page.click('[data-testid="botao-fila-revisao"]');
    await page.waitForSelector('[data-testid="revisao-grupo-assistente"]');
    assert.equal(await page.locator('[data-testid="revisao-grupo-assistente"] .fila-revisao-item').count(), 4);

    await page.click('[data-testid="revisao-assistente-aceitar"]');
    await page.waitForSelector('[data-testid="revisao-vazia"]');
    assert.equal(await page.locator('.em-revisao-assistente').count(), 0);

    await page.click('[data-testid="fechar-fila-revisao"]');
    await page.keyboard.press('Control+z');
    await page.waitForSelector('[data-testid="revisao-grupo-assistente"], [data-testid="item-' + n + '"].em-revisao-assistente');
    assert.equal(await page.locator('.item-texto.em-revisao-assistente').count(), 3);
    assert.deepEqual(erros, []);
  } finally {
    await ctx.close();
  }
});
