import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';
import { NOTA_FALA, NOTA_LIGACAO, NOTA_LOOT, NOTA_SEGREDO, NOTA_TESTE } from '../../src/tutorial/licoes.ts';

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

test('MT3: quadro-notas de ponta a ponta pela interface (moldura, título, quatro notas com marcador e a leitura final)', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const mesa = await ctx.newPage(), erros: string[] = [];
    mesa.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]');
    await mesa.fill('[data-testid="nova-campanha-nome"]', 'Minha');
    await mesa.click('[data-testid="criar-campanha"]');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    await mesa.click('[data-testid="aba-aprender"]');
    await mesa.click('[data-testid="licao-comecar-quadro-notas"]');
    await mesa.waitForSelector('[data-testid="area-quadro"]');
    const passo = (n: number) => mesa.waitForSelector(`[data-testid="tutor"][data-passo="${n}"]`);
    const area = (await mesa.locator('[data-testid="area-quadro"]').boundingBox())!;

    // 1-2: ferramenta Moldura e arrastar.
    await passo(0);
    await mesa.click('[data-testid="ferramenta-moldura"]'); await passo(1);
    await mesa.mouse.move(area.x + 300, area.y + 200); await mesa.mouse.down(); await mesa.mouse.move(area.x + 850, area.y + 560, { steps: 6 }); await mesa.mouse.up();
    // 3: título.
    await passo(2);
    await mesa.mouse.dblclick(area.x + 575, area.y + 380);
    await mesa.waitForSelector('[data-testid="moldura-titulo-input"]');
    await mesa.fill('[data-testid="moldura-titulo-input"]', 'Casa abandonada');
    await mesa.keyboard.press('Enter');
    await passo(3);
    // 4-7: uma nota por marcador, dentro da moldura (à direita do cartão do tutor, que cobre a esquerda).
    const notas: [string, number, number][] = [[NOTA_TESTE, 480, 250], [NOTA_SEGREDO, 700, 250], [NOTA_FALA, 480, 440], [NOTA_LOOT, 700, 440]];
    for (const [i, [texto, dx, dy]] of notas.entries()) {
      await passo(3 + i);
      await mesa.click('[data-testid="ferramenta-nota"]');
      await mesa.mouse.click(area.x + dx, area.y + dy);
      await mesa.waitForSelector('[data-testid="editor-rico"]');
      await mesa.keyboard.type(texto);
      await mesa.keyboard.press('Escape');
      await mesa.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });
    }
    // 8: leitura; Continuar fecha a lição.
    await passo(7);
    await mesa.click('[data-testid="tutor-continuar"]');
    await mesa.waitForSelector('[data-testid="tutor-fim"]');
    assert.match((await mesa.textContent('[data-testid="tutor-proxima"]')) ?? '', /Quadro II/);
    assert.deepEqual(erros, []);
  } finally { await ctx.close(); }
});

test('MT3: quadro-ligacoes de ponta a ponta (link, entidade, seta, modelo, revisão, Ler e projeção)', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const mesa = await ctx.newPage(), erros: string[] = [];
    mesa.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]');
    await mesa.fill('[data-testid="nova-campanha-nome"]', 'Minha');
    await mesa.click('[data-testid="criar-campanha"]');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    await mesa.click('[data-testid="aba-aprender"]');
    await mesa.click('[data-testid="licao-comecar-quadro-ligacoes"]');
    await mesa.waitForSelector('[data-testid="area-quadro"]');
    const passo = (n: number) => mesa.waitForSelector(`[data-testid="tutor"][data-passo="${n}"]`);
    const area = (await mesa.locator('[data-testid="area-quadro"]').boundingBox())!;
    const cam = await mesa.evaluate(() => (window as unknown as { __mesaQuadro: { camera(): { x: number; y: number; zoom: number } } }).__mesaQuadro.camera());
    const tela = (x: number, y: number): [number, number] => [area.x + (x - cam.x) * cam.zoom, area.y + (y - cam.y) * cam.zoom];
    const itens = () => mesa.evaluate(() => (window as unknown as { __mesaQuadro: { itens(): { tipo: string }[] } }).__mesaQuadro.itens().length);
    assert.equal(await itens(), 6, 'a semente: moldura, 2 notas e 3 em revisão');

    // 0: a fila abre sozinha (o quadro tem itens do Miro); aceitar o grupo e confirmar.
    await passo(0);
    await mesa.locator('[data-testid^="revisao-massa-"]').first().click();
    await mesa.locator('[data-testid^="revisao-massa-confirmar-"]').first().click();
    await passo(1); await mesa.click('[data-testid="ferramenta-nota"]'); await passo(2);
    await mesa.mouse.click(...tela(300, 520));
    await mesa.waitForSelector('[data-testid="editor-rico"]');
    await mesa.keyboard.type(NOTA_LIGACAO);
    await mesa.keyboard.press('Escape');
    if (await mesa.locator('[data-testid="editor-rico"]').count()) await mesa.keyboard.press('Escape');
    await mesa.waitForSelector('[data-testid="editor-rico"]', { state: 'detached' });
    await passo(3); await mesa.click('[data-testid="ferramenta-entidade"]'); await passo(4);
    await mesa.mouse.click(...tela(700, 520));
    await mesa.locator('[data-testid^="colocar-entidade-"]', { hasText: 'Carta rasgada' }).click();
    await passo(5); await mesa.click('[data-testid="ferramenta-seta"]'); await passo(6);
    const [ax, ay] = tela(210, 160), [bx, by] = tela(520, 160);
    await mesa.mouse.move(ax, ay); await mesa.mouse.down(); await mesa.mouse.move(bx, by, { steps: 6 }); await mesa.mouse.up();
    await passo(7);
    // A seta recém-criada fica selecionada; um clique na moldura (espaço vazio) a seleciona.
    await mesa.mouse.click(...tela(300, 360));
    await passo(8);
    await mesa.mouse.click(...tela(300, 360), { button: 'right' });
    await mesa.click('[data-testid="menu-salvar-modelo"]');
    await mesa.fill('[data-testid="modelo-nome"]', 'Casa abandonada');
    await mesa.click('[data-testid="modelo-salvar"]');
    await passo(9); await mesa.click('[data-testid="modo-ler"]'); await passo(10);
    await mesa.click('[data-testid="modo-quadro"]'); await passo(11);
    await mesa.click('[data-testid="tutor-continuar"]'); await passo(12);
    await mesa.waitForSelector('[data-testid="area-quadro"]');
    const area2 = (await mesa.locator('[data-testid="area-quadro"]').boundingBox())!;
    const cam2 = await mesa.evaluate(() => (window as unknown as { __mesaQuadro: { camera(): { x: number; y: number; zoom: number } } }).__mesaQuadro.camera());
    await mesa.mouse.click(area2.x + (300 - cam2.x) * cam2.zoom, area2.y + (360 - cam2.y) * cam2.zoom, { button: 'right' });
    const [proj] = await Promise.all([ctx.waitForEvent('page'), mesa.click('[data-testid="menu-mostrar-aos-jogadores"]')]);
    await proj.waitForSelector('[data-testid="projecao"]');
    await passo(13);
    await mesa.click('[data-testid="parar-projecao"]');
    await mesa.waitForSelector('[data-testid="tutor-fim"]');
    assert.deepEqual(erros, []);
  } finally { await ctx.close(); }
});
