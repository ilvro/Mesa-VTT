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

    assert.deepEqual(erros.filter((e) => !/__ponte/.test(e)), []);
  } finally {
    await ctx.close();
  }
});
