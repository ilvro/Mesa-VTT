import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => { amb = await iniciarAmbiente(); });
after(async () => { await amb.encerrar(); });

test('MT2: a lição de teste roda numa campanha de treino e apagar o treino devolve a campanha de antes', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1440, height: 860 } });
  try {
    const mesa = await ctx.newPage(), erros: string[] = [];
    mesa.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
    // `?tutor-teste` mostra a lição oculta na lista.
    await mesa.goto(`${amb.origem}/Mesa/?tutor-teste`);
    await mesa.click('[data-testid="aba-campanhas"]');
    await mesa.fill('[data-testid="nova-campanha-nome"]', 'Minha');
    await mesa.click('[data-testid="criar-campanha"]');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    const nomeAtiva = () => mesa.locator('[data-testid="campanha-select"] option:checked').textContent();
    const nomes = () => mesa.locator('[data-testid="campanha-select"] option').allTextContents();
    assert.equal(await nomeAtiva(), 'Minha');

    await mesa.click('[data-testid="aba-aprender"]');
    await mesa.waitForSelector('[data-testid="aprender-lista"]');
    await mesa.click('[data-testid="licao-comecar-teste-do-motor"]');
    await mesa.waitForSelector('[data-testid="tutor-cartao"]');
    assert.equal(await nomeAtiva(), 'Treino · Teste do motor');

    // Passo 1: a aba Quadros. Passo 2: a ferramenta Nota.
    assert.equal(await mesa.getAttribute('[data-testid="tutor"]', 'data-passo'), '0');
    await mesa.click('[data-testid="aba-quadros"]');
    await mesa.waitForSelector('[data-testid="tutor"][data-passo="1"]');
    await mesa.click('[data-testid="ferramenta-nota"]');
    await mesa.waitForSelector('[data-testid="tutor-fim"]');

    await mesa.click('[data-testid="tutor-apagar-treino"]');
    await mesa.waitForFunction(() => !document.querySelector('[data-testid="tutor-fim"]'));
    for (let i = 0; i < 40 && (await nomeAtiva()) !== 'Minha'; i++) await mesa.waitForTimeout(100);
    assert.equal(await nomeAtiva(), 'Minha');
    assert.ok(!(await nomes()).some(n => n.startsWith('Treino ·')), 'não sobra campanha de treino');
    const sobras = await mesa.evaluate(() => (window as unknown as { __mesa: { campanhas(): { nome: string }[] } }).__mesa.campanhas().map(c => c.nome));
    assert.deepEqual(sobras, ['Minha']);
    assert.deepEqual(erros, []);
  } finally { await ctx.close(); }
});
