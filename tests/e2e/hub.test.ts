import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => { amb = await iniciarAmbiente(); });
after(async () => { await amb.encerrar(); });

const erros = (p: Page): string[] => {
  const lista: string[] = [];
  p.on('console', m => { if (m.type() === 'error') lista.push(m.text()); });
  p.on('pageerror', e => lista.push(`pageerror: ${e.message}`));
  return lista;
};

test('9.1a: a Mesa cria a campanha, o Atlas a vê, e o lugar criado pelo Atlas aparece na Mesa', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1440, height: 860 } });
  // As sugestões do assistente do Atlas ficam por cima do mapa; aqui não interessam.
  await ctx.addInitScript(() => { try { if (localStorage.getItem('atlas:sugestoes') === null) localStorage.setItem('atlas:sugestoes', '0'); } catch { /* sem armazenamento */ } });
  try {
    // 1. A Mesa abre e cria a campanha pela interface.
    const mesa = await ctx.newPage(), errosDaMesa = erros(mesa);
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.waitForSelector('[data-testid="campanha-select"]');
    await mesa.click('[data-testid="aba-campanhas"]');
    await mesa.fill('[data-testid="nova-campanha-nome"]', 'A Ilha');
    await mesa.click('[data-testid="criar-campanha"]');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    assert.equal(await mesa.locator('[data-testid="campanha-select"] option:checked').textContent(), 'A Ilha');
    const campanhaId = await mesa.evaluate(() => localStorage.getItem('mesa:campanha-ativa'));
    assert.ok(campanhaId, 'a campanha ativa fica na chave comum da mesa');

    // 2. O Atlas, aberto depois na mesma origem, vê a mesma campanha (aba Mapa → campanha).
    const atlas = await ctx.newPage(), errosDoAtlas = erros(atlas);
    await atlas.goto(`${amb.origem}/Atlas/`);
    await atlas.waitForSelector('[data-testid="campanha-ativa"]');
    assert.equal(await atlas.locator('[data-testid="campanha-ativa"] option:checked').textContent(), 'A Ilha');

    // 3. O Atlas cria um mapa: nasce o “lugar” da campanha, e a Mesa o mostra sem recarregar.
    await atlas.click('[data-testid="novo-mapa"]');
    await atlas.waitForSelector('[data-testid="area-do-mapa"] canvas', { timeout: 20_000 });
    await mesa.bringToFront();
    const lugar = mesa.locator('[data-testid^="entidade-"][data-tipo="lugar"]');
    await lugar.first().waitFor({ timeout: 10_000 });
    assert.equal(await lugar.count(), 1);
    await lugar.first().click();

    // 4. É do Atlas: a Mesa mostra, não altera; e aponta para o mapa com um link “Abrir” (pelo manifesto do Atlas).
    await mesa.waitForSelector('[data-testid="so-leitura"]');
    assert.equal(await mesa.locator('[data-testid="campo-nome"]').isDisabled(), true);
    assert.equal(await mesa.locator('[data-testid="remover-entidade"]').count(), 0, 'só quem criou remove');
    const abrir = mesa.locator('[data-testid="abrir-ref"]').first();
    await abrir.waitFor({ timeout: 10_000 });
    assert.match((await abrir.getAttribute('href')) ?? '', /\/Atlas\/#\/mapa\/.+/);
    assert.match(await mesa.locator('[data-testid="ref"]').first().textContent() ?? '', /Atlas · mapa/);

    // 5. Entidade da própria Mesa: cria, edita nome, etiquetas e notas, e tudo sobrevive a recarregar.
    await mesa.selectOption('[data-testid="novo-tipo"]', 'personagem');
    await mesa.fill('[data-testid="nova-entidade-nome"]', 'Muirenn');
    await mesa.press('[data-testid="nova-entidade-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="detalhe"] [data-testid="campo-nome"]:not([disabled])');
    await mesa.fill('[data-testid="campo-tags"]', 'investigadora, Ateliê, ');
    await mesa.press('[data-testid="campo-tags"]', 'Enter');
    await mesa.fill('[data-testid="campo-notas"]', 'Chegou na ilha de barco.');
    await mesa.locator('[data-testid="campo-nome"]').click();
    await mesa.waitForFunction(() => (window as unknown as { __mesa: { entidades(): { notas: string }[] } }).__mesa.entidades().some(e => e.notas === 'Chegou na ilha de barco.'));
    await mesa.reload();
    await mesa.waitForSelector('[data-testid="lista-entidades"]');

    // 6. Busca sem acento e filtro por tipo.
    await mesa.fill('[data-testid="busca"]', 'atelie');
    assert.equal(await mesa.locator('[data-testid^="entidade-"]').count(), 1);
    assert.match(await mesa.locator('[data-testid^="entidade-"]').first().textContent() ?? '', /Muirenn/);
    await mesa.fill('[data-testid="busca"]', '');
    await mesa.click('[data-testid="tipo-lugar"]');
    assert.equal(await mesa.locator('[data-testid^="entidade-"]').count(), 1);
    await mesa.click('[data-testid="tipo-lugar"]');
    assert.equal(await mesa.locator('[data-testid^="entidade-"]').count(), 2);

    // 7. Nome vazio é recusado com aviso e o nome antigo volta.
    await mesa.fill('[data-testid="busca"]', 'muirenn');
    await mesa.click('[data-testid^="entidade-"]');
    await mesa.fill('[data-testid="campo-nome"]', '   ');
    await mesa.locator('[data-testid="campo-tags"]').click();
    await mesa.waitForSelector('[data-testid="aviso"]');
    await mesa.waitForFunction(() => (document.querySelector('[data-testid="campo-nome"]') as HTMLInputElement).value === 'Muirenn');
    assert.equal((await mesa.evaluate(() => (window as unknown as { __mesa: { entidades(): { nome: string; tipo: string }[] } }).__mesa.entidades())).filter(e => e.tipo === 'personagem')[0]?.nome, 'Muirenn', 'o banco manteve o nome');

    // 8. O tema vale para a mesa inteira: trocar na Mesa troca no Atlas (evento `storage`).
    await mesa.click('[data-testid="tema-prata"]');
    await atlas.waitForFunction(() => document.documentElement.dataset.tema === 'prata');

    assert.deepEqual(errosDaMesa, [], 'sem erros no console da Mesa');
    assert.deepEqual(errosDoAtlas.filter(e => !/favicon/.test(e)), [], 'sem erros no console do Atlas');
  } finally { await ctx.close(); }
});

test('9.1a: renomear, trocar o sistema e o tema da campanha; apagar pede confirmação', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1200, height: 800 } });
  try {
    const p = await ctx.newPage();
    await p.goto(`${amb.origem}/Mesa/`);
    await p.click('[data-testid="aba-campanhas"]');
    await p.fill('[data-testid="nova-campanha-nome"]', 'Primeira');
    await p.press('[data-testid="nova-campanha-nome"]', 'Enter');
    await p.waitForSelector('[data-testid="tela-entidades"]');
    await p.click('[data-testid="aba-campanhas"]');
    await p.fill('[data-testid="campanha-nome"]', 'Segunda');
    await p.fill('[data-testid="campanha-sistema"]', 'vampiro');
    await p.locator('[data-testid="campanha-sistema"]').blur();
    await p.selectOption('[data-testid="campanha-tema"]', 'neutro');
    await p.waitForFunction(() => document.documentElement.dataset.tema === 'neutro');
    await p.waitForFunction(() => { const c = (window as unknown as { __mesa: { campanhas(): { nome: string; sistema: string; tema: string | null }[] } }).__mesa.campanhas()[0]; return c?.nome === 'Segunda' && c.sistema === 'vampiro' && c.tema === 'neutro'; });
    await p.click('[data-testid="apagar-campanha"]');
    assert.equal(await p.evaluate(() => (window as unknown as { __mesa: { campanhas(): unknown[] } }).__mesa.campanhas().length), 1, 'ainda não apagou');
    await p.click('[data-testid="confirmar-apagar"]');
    await p.waitForSelector('text=Nenhuma campanha ainda');
  } finally { await ctx.close(); }
});
