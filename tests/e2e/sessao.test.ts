import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Frame, Page } from 'playwright';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => { amb = await iniciarAmbiente({ comFicha: true }); });
after(async () => { await amb.encerrar(); });

const quadro = (p: Page, app: string): Frame | undefined => p.frames().find(f => f.url().includes(`/${app}/`) && f !== p.mainFrame());
const larguraDoPainel = (p: Page, id: string) => p.evaluate(i => document.querySelector(`[data-painel="${i}"]`)!.getBoundingClientRect().width, id);

test('9.5a: o modo sessão mostra Atlas, fichas e Jukebox lado a lado, com layout ajustável, e uma rolagem na Ficha embutida chega ao Atlas embutido', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(() => { try { if (localStorage.getItem('atlas:sugestoes') === null) localStorage.setItem('atlas:sugestoes', '0'); } catch { /* sem armazenamento */ } });
  try {
    // A campanha, o mapa (Atlas) e as personagens (a Ficha publica ao abrir): tudo no mesmo banco.
    const mesa = await ctx.newPage(), errosDaMesa: string[] = [];
    mesa.on('pageerror', e => errosDaMesa.push(`pageerror: ${e.message}`));
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]'); await mesa.fill('[data-testid="nova-campanha-nome"]', 'A Ilha'); await mesa.press('[data-testid="nova-campanha-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    const atlas = await ctx.newPage(); await atlas.goto(`${amb.origem}/Atlas/`);
    await atlas.click('[data-testid="novo-mapa"]'); await atlas.waitForSelector('[data-testid="area-do-mapa"] canvas', { timeout: 20_000 });
    await atlas.fill('#nome-do-mapa', 'Casa dos Salgueiros'); await atlas.press('#nome-do-mapa', 'Enter'); await atlas.keyboard.press('Control+s');
    const ficha = await ctx.newPage(); await ficha.goto(`${amb.origem}/Ficha/`);
    await mesa.bringToFront();
    await mesa.waitForFunction(() => { const w = window as unknown as { __mesa: { entidades(): { tipo: string; nome: string }[] } }; const es = w.__mesa.entidades(); return es.some(e => e.tipo === 'personagem') && es.some(e => e.tipo === 'lugar' && e.nome === 'Casa dos Salgueiros'); }, null, { timeout: 40_000 });
    await mesa.waitForTimeout(2500);   // a Ficha termina de publicar as demais
    await atlas.close(); await ficha.close();

    // Sessão: os três painéis, cada um com o seu aplicativo carregado.
    await mesa.click('[data-testid="aba-sessao"]');
    await mesa.waitForSelector('[data-testid="iframe-atlas"]'); await mesa.waitForSelector('[data-testid="iframe-jukebox"]');
    await mesa.waitForSelector('[data-testid^="iframe-ficha-"]');
    assert.equal(await mesa.locator('[data-testid="sessao-mapa"] option:checked').textContent(), 'Casa dos Salgueiros');
    for (const id of ['atlas', 'fichas', 'jukebox']) assert.equal(await mesa.locator(`[data-testid="painel-corpo-${id}"]`).count(), 1, id);
    // Painéis estreitos desenham o aplicativo numa largura mínima e encolhem (o Jukebox, que é estreito, mais que o Atlas); a Ficha não encolhe.
    const escala = (id: string) => mesa.locator(`[data-testid="escala-${id}"]`).getAttribute('data-escala').then(Number);
    await mesa.waitForFunction(() => Number(document.querySelector('[data-testid="escala-jukebox"]')?.getAttribute('data-escala')) < 1);
    const eAtlas = await escala('atlas'), eJuke = await escala('jukebox');
    assert.ok(eJuke >= 0.5 && eJuke < eAtlas && eAtlas < 1, `Jukebox ${eJuke} < Atlas ${eAtlas} < 1`);
    assert.equal(await mesa.locator('[data-testid="escala-fichas"]').count(), 0, 'a Ficha se adapta sozinha');
    await mesa.waitForFunction(() => document.querySelectorAll('iframe').length >= 3);

    // O Atlas embutido: abre o mapa direto em Sessão, sem galeria, sem alternar modo, com o cabeçalho compacto e o projetor a um botão.
    const a = (await (async () => { for (let i = 0; i < 60; i++) { const f = quadro(mesa, 'Atlas'); if (f && f.url().includes('embutido=1')) return f; await mesa.waitForTimeout(250); } return undefined; })())!;
    assert.ok(a, 'o quadro do Atlas carregou com ?embutido=1');
    await a.waitForSelector('[data-testid="cabecalho-embutido"]', { timeout: 30_000 });
    await a.waitForSelector('[data-testid="dock"]', { timeout: 30_000 });
    assert.equal(await a.locator('[data-testid="nome-do-mapa-embutido"]').textContent(), 'Casa dos Salgueiros');
    assert.equal(await a.locator('[data-testid="chave-de-modo"]').count(), 0, 'sem alternar para Construir');
    assert.equal(await a.locator('[data-testid="galeria-vazia"], [data-testid="lista-mapas"], [data-testid="novo-mapa"]').count(), 0, 'sem galeria');
    assert.equal(await a.locator('[data-testid="embutido-projetor"]').count(), 1, 'o projetor continua a um botão');
    assert.equal(await a.locator('[data-testid="ferramenta-comodo"]').count(), 0, 'sem ferramentas de construção (é Sessão)');
    await mesa.locator('[data-testid="iframe-atlas"]').focus(); await mesa.keyboard.press('m');   // o atalho de alternar o modo não faz nada no embutido
    await mesa.waitForTimeout(300);
    assert.equal(await a.locator('[data-testid="ferramenta-comodo"]').count(), 0);

    // O Jukebox embutido carregou o próprio aplicativo.
    const j = quadro(mesa, 'Jukebox')!; assert.ok(j, 'o quadro do Jukebox existe'); await j.waitForSelector('body', { timeout: 20_000 });
    assert.match(await j.title(), /Jukebox/);

    // A Ficha embutida: uma rolagem sai pelo barramento (que a Mesa ouve) e o Atlas embutido a mostra (sem peça no mapa: um aviso).
    await mesa.evaluate(() => { const w = window as unknown as { __rolagens: unknown[] }; w.__rolagens = []; const c = new BroadcastChannel('mesa:eventos'); c.onmessage = e => { if (e.data?.tipo === 'ficha.rolagem') w.__rolagens.push(e.data); }; });
    const f = (await (async () => { for (let i = 0; i < 80; i++) { const q = quadro(mesa, 'Ficha'); if (q) return q; await mesa.waitForTimeout(250); } return undefined; })())!;
    await f.waitForSelector('[data-roll]', { timeout: 40_000 });
    await f.locator('[data-roll]').first().click({ force: true }); await mesa.waitForTimeout(1500); await mesa.keyboard.press('Space');
    await mesa.waitForFunction(() => ((window as unknown as { __rolagens: unknown[] }).__rolagens ?? []).length > 0, null, { timeout: 30_000 });
    await a.getByText(/^Rolagem: /).first().waitFor({ timeout: 10_000 });

    if (process.env.CAPTURAR) await mesa.screenshot({ path: process.env.CAPTURAR });

    // Layout: presets, painéis, divisor arrastado e por teclado, tela cheia, e tudo persiste ao recarregar.
    await mesa.click('[data-testid="preset-so-mapa"]');
    await mesa.waitForFunction(() => document.querySelector('[data-testid="escala-atlas"]')?.getAttribute('data-escala') === '1.000');   // o mapa sozinho tem largura de sobra: sem redução
    assert.equal(await mesa.locator('[data-testid="painel-corpo-fichas"]').count(), 0); assert.equal(await mesa.locator('[data-testid="iframe-jukebox"]').count(), 0);
    await mesa.click('[data-testid="preset-padrao"]');
    assert.equal(await mesa.locator('[data-testid="painel-corpo-fichas"]').count(), 1);
    await mesa.click('[data-testid="painel-jukebox"]');
    assert.equal(await mesa.locator('[data-testid="painel-corpo-jukebox"]').count(), 0, 'o painel de música some');
    const antes = await larguraDoPainel(mesa, 'atlas'), caixa = (await mesa.locator('[data-testid="divisor-0"]').boundingBox())!;
    await mesa.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2); await mesa.mouse.down(); await mesa.mouse.move(caixa.x + 150, caixa.y + 40, { steps: 8 }); await mesa.mouse.up();
    const depois = await larguraDoPainel(mesa, 'atlas');
    assert.ok(depois > antes + 80, `arrastar o divisor aumenta o mapa (${antes} → ${depois})`);
    await mesa.locator('[data-testid="divisor-0"]').focus(); await mesa.keyboard.press('ArrowLeft'); await mesa.keyboard.press('ArrowLeft');
    assert.ok(await larguraDoPainel(mesa, 'atlas') < depois - 40, 'as setas também redimensionam');
    const ajustado = await larguraDoPainel(mesa, 'atlas');
    await mesa.reload(); await mesa.waitForSelector('[data-testid="aba-sessao"]'); await mesa.click('[data-testid="aba-sessao"]'); await mesa.waitForSelector('[data-testid="painel-corpo-atlas"]');
    assert.equal(await mesa.locator('[data-testid="painel-corpo-jukebox"]').count(), 0, 'o painel escondido continua escondido');
    assert.ok(Math.abs(await larguraDoPainel(mesa, 'atlas') - ajustado) < 4, 'a largura ajustada foi lembrada');
    await mesa.click('[data-testid="layout-padrao"]');
    assert.equal(await mesa.locator('[data-testid="painel-corpo-jukebox"]').count(), 1);

    await mesa.click('[data-testid="tela-cheia-atlas"]');
    await mesa.waitForFunction(() => document.fullscreenElement?.getAttribute('data-painel') === 'atlas', null, { timeout: 5000 }).then(() => mesa.evaluate(() => document.exitFullscreen()), () => console.log('# tela cheia indisponível neste navegador de teste (não conta)'));

    // Fichas em abas: escolher outra personagem abre outra aba, com a ficha dela.
    const abas = mesa.locator('[data-testid^="ficha-aba-"]'), total = await abas.count();
    assert.ok(total >= 2, 'a campanha tem ao menos duas personagens com ficha');
    const segunda = abas.nth(1); const idSegunda = (await segunda.getAttribute('data-testid'))!.replace('ficha-aba-', '');
    await segunda.click();
    await mesa.waitForSelector(`[data-testid="iframe-ficha-${idSegunda}"]`);
    assert.equal(await mesa.locator(`[data-testid="iframe-ficha-${idSegunda}"]`).isVisible(), true);
    assert.match((await mesa.locator(`[data-testid="iframe-ficha-${idSegunda}"]`).getAttribute('src')) ?? '', new RegExp(`/Ficha/\\?ficha=${idSegunda}`));
    assert.deepEqual(errosDaMesa, [], 'sem erros de script na Mesa');
  } finally { await ctx.close(); }
});
