import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserContext, Page } from 'playwright';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

/**
 * Validação da Fase 9 (tarefa 9.7), com os aplicativos de verdade numa origem só (como no GitHub Pages):
 * a Mesa grava o diário enquanto, no Atlas, a ficha de uma personagem (Ficha) vira peça, a rolagem dela aparece sobre a peça e no projetor,
 * uma pista (Ateliê, com luz UV) é inspecionada no projetor, e o Jukebox troca a música quando o clima muda e quando a peça entra numa região.
 */
let amb: Ambiente;
before(async () => { amb = await iniciarAmbiente({ comFicha: true, comAtelie: true }); });
after(async () => { await amb.encerrar(); });

/** Um WAV mudo de `s` segundos: as faixas de verdade têm centenas de MB, e o teste só precisa que existam. */
function wavMudo(s: number): Buffer {
  const n = Math.round(8000 * s), cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + n, 4); cab.write('WAVEfmt ', 8); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(8000, 24); cab.writeUInt32LE(8000, 28); cab.writeUInt16LE(1, 32); cab.writeUInt16LE(8, 34); cab.write('data', 36); cab.writeUInt32LE(n, 40);
  return Buffer.concat([cab, Buffer.alloc(n, 128)]);
}

type W = Window & typeof globalThis;
const atlasPronto = (p: Page) => p.waitForFunction(() => (window as unknown as { __atlas?: { servicos(): unknown } }).__atlas?.servicos() != null, null, { timeout: 30_000 });
const sessao = (p: Page, fn: string, arg?: unknown) => p.evaluate(`(() => { const s = window.__atlas.sessao(); const f = ${fn}; return f(s, ${JSON.stringify(arg ?? null)}); })()`);
const documento = (p: Page) => p.evaluate(() => structuredClone((window as unknown as { __atlas: { sessao(): { doc: { value: unknown } } } }).__atlas.sessao().doc.value)) as Promise<{ id: string; tokens: Record<string, { id: string; name: string; refs: unknown[] }>; props: Record<string, { id: string; position: [number, number]; interaction?: { kind: string } | null }>; session: { revealed: string[] } }>;
const clientDe = (p: Page, mundo: [number, number]) => p.evaluate(m => (window as unknown as { __atlas: { viewport(): { clientDe(p: [number, number]): [number, number] } } }).__atlas.viewport().clientDe(m), mundo);
async function ferramenta(p: Page, id: string) { await p.click(`[data-testid="ferramenta-${id}"]`); await p.waitForTimeout(350); }
async function clicar(p: Page, mundo: [number, number]) { const [x, y] = await clientDe(p, mundo); await p.mouse.click(x, y); await p.waitForTimeout(250); }
const linhasDoDiario = (mesa: Page) => mesa.locator('[data-testid="registro-linha"]').allTextContents();

async function esperarLinha(mesa: Page, padrao: RegExp, ms = 15_000): Promise<string> {
  for (let i = 0; i < ms / 200; i++) { const achou = (await linhasDoDiario(mesa)).find(l => padrao.test(l)); if (achou) return achou; await mesa.waitForTimeout(200); }
  throw new Error(`O diário não registrou ${padrao}. Linhas: ${(await linhasDoDiario(mesa)).join(' | ')}`);
}

async function prepararContexto(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    try {
      const w = window as unknown as { __ATELIE_STORAGE: string };
      w.__ATELIE_STORAGE = 'browser';
      if (localStorage.getItem('atlas:sugestoes') === null) localStorage.setItem('atlas:sugestoes', '0');
      // Duas cenas do próprio mestre, cada uma com uma faixa do preset de exemplo: o Jukebox as lê do localStorage ao abrir.
      if (location.pathname.includes('/Jukebox/') && !localStorage.getItem('jukebox-scenes-v1')) {
        const faixa = (title: string) => ({ songId: `x-${title}`, title, originalTitle: title, sourceName: `${title}.mp3`, volume: 0.4, currentTime: 0, region: null, activeEffects: [], selectionFadeEnabled: false, selectionStopEnabled: false });
        localStorage.setItem('jukebox-scenes-v1', JSON.stringify([
          { id: 'cena-aurora', name: 'Aurora', createdAt: 1, masterVolume: 1, tracks: [faixa('Aurora')] },
          { id: 'cena-batalha', name: 'Batalha', createdAt: 1, masterVolume: 1, tracks: [faixa('Batalha')] },
        ]));
      }
    } catch { /* sem armazenamento */ }
  });
  await ctx.route('**/Jukebox/sample/*.mp3', r => r.fulfill({ body: wavMudo(3), contentType: 'audio/wav' }));
}

test('fase 9 (validação): a ficha vira peça, a rolagem aparece sobre ela e no projetor, a pista do Ateliê é inspecionada com UV no projetor, o clima e a região trocam a música no Jukebox, e o diário da Mesa registra tudo', { timeout: 420_000 }, async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1600, height: 960 } });
  await prepararContexto(ctx);
  try {
    // 1. A Mesa cria a campanha e começa a sessão; só o painel do diário fica à vista (os outros aplicativos abrem em abas próprias).
    const mesa = await ctx.newPage(), errosDaMesa: string[] = [];
    mesa.on('pageerror', e => errosDaMesa.push(`pageerror: ${e.message}`));
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]'); await mesa.fill('[data-testid="nova-campanha-nome"]', 'A Ilha'); await mesa.press('[data-testid="nova-campanha-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    await mesa.click('[data-testid="aba-sessao"]');
    await mesa.click('[data-testid="painel-diario"]');
    for (const p of ['atlas', 'fichas', 'jukebox']) await mesa.click(`[data-testid="painel-${p}"]`);
    await mesa.fill('[data-testid="sessao-nome"]', 'Noite na ilha'); await mesa.click('[data-testid="sessao-iniciar"]');
    await mesa.waitForSelector('[data-testid="diario"]');

    // 2. O Jukebox de verdade abre com a campanha ativa, carrega o preset de exemplo e publica as cenas.
    const juke = await ctx.newPage(); await juke.goto(`${amb.origem}/Jukebox/`);
    await juke.waitForFunction(() => (window as unknown as { __jukeboxMesa?: { pronto: boolean } }).__jukeboxMesa?.pronto === true, null, { timeout: 20_000 });
    await juke.mouse.click(5, 5);
    await juke.evaluate(() => document.getElementById('load-sample-btn')!.click());
    await juke.waitForFunction(() => (window as unknown as { __jukeboxMesa: { efeitosDisponiveis(): unknown[] } }).__jukeboxMesa.efeitosDisponiveis().length >= 1, null, { timeout: 120_000 });
    await juke.waitForFunction(() => document.querySelectorAll('.song-item').length >= 28, null, { timeout: 120_000 }).catch(() => undefined);
    await juke.waitForTimeout(1200);

    // 3. A Ficha de verdade publica as personagens; o Ateliê de verdade arquiva um bilhete com uma camada UV.
    const ficha = await ctx.newPage(); await ficha.goto(`${amb.origem}/Ficha/`);
    await mesa.bringToFront();
    await mesa.waitForFunction(() => { const es = (window as unknown as { __mesa: { entidades(): { tipo: string; criadaPor: string; nome: string }[] } }).__mesa.entidades(); return es.some(e => e.tipo === 'personagem') && ['Aurora', 'Batalha'].every(n => es.some(e => e.tipo === 'cena' && e.criadaPor === 'jukebox' && e.nome === n)); }, null, { timeout: 60_000 });
    const entidades = await mesa.evaluate(() => (window as unknown as { __mesa: { entidades(): { tipo: string; nome: string; criadaPor: string; id: string; refs: { app: string; tipo: string; id: string }[] }[] } }).__mesa.entidades());
    const personagem = entidades.find(e => e.tipo === 'personagem' && e.criadaPor === 'ficha')!, refFicha = personagem.refs.find(r => r.app === 'ficha')!;
    const aurora = entidades.find(e => e.tipo === 'cena' && e.nome === 'Aurora')!.refs[0]!, batalha = entidades.find(e => e.tipo === 'cena' && e.nome === 'Batalha')!.refs[0]!;

    const atelie = await ctx.newPage(), errosDoAtelie: string[] = []; atelie.on('pageerror', e => errosDoAtelie.push(String(e)));
    await atelie.goto(`${amb.origem}/Atelie/?diagnostics`);
    await atelie.waitForFunction(() => !!(window as unknown as { __atelie?: { editor?: { state?: unknown } } }).__atelie?.editor?.state, null, { timeout: 30_000 });
    const idBilhete = await atelie.evaluate(() => {
      const editor = (window as unknown as { __atelie: { editor: { state: { handout: object; edit(d: object, o: object): void } } } }).__atelie.editor;
      const doc = structuredClone(editor.state.handout) as { id: string; name: string; layers: object[] };
      doc.name = 'Bilhete da biblioteca';
      doc.layers.push({ id: 'uv-layer-1', name: 'Pista UV', kind: 'shape', visible: true, locked: false, opacity: 1, blend: 'normal', x: 20, y: 20, width: 80, height: 80, rotation: 0, clip: false, light: 'uv', shape: { type: 'rect', fill: '#00ffff', stroke: null, strokeWidth: 0, radius: 0, dash: [] } });
      editor.state.edit(doc, { label: 'Camada UV' });
      return doc.id;
    });
    await atelie.click('[data-action="archive"]');
    await atelie.waitForFunction(() => !(window as unknown as { __atelie: { editor: { state: { dirty: boolean } } } }).__atelie.editor.state.dirty, null, { timeout: 30_000 });

    // 4. O Atlas: mapa com um cômodo; a personagem da Ficha vira peça; a pista do Ateliê entra no cômodo; as cenas do Jukebox ficam ligadas ao clima e a uma região.
    const atlas = await ctx.newPage(); await atlas.goto(`${amb.origem}/Atlas/`); await atlasPronto(atlas);
    await atlas.click('[data-testid="novo-mapa"]'); await atlas.waitForSelector('[data-testid="area-do-mapa"] canvas', { timeout: 20_000 });
    await atlas.waitForFunction(() => (window as unknown as { __atlas: { viewport(): unknown } }).__atlas.viewport() != null);
    await ferramenta(atlas, 'comodo');
    const [ax, ay] = await clientDe(atlas, [3.75, 3.75]), [bx, by] = await clientDe(atlas, [14.25, 9.75]);
    await atlas.keyboard.down('Shift'); await atlas.mouse.move(ax, ay); await atlas.mouse.down(); await atlas.mouse.move(bx, by, { steps: 6 }); await atlas.mouse.up(); await atlas.keyboard.up('Shift');
    await ferramenta(atlas, 'selecionar');
    await atlas.evaluate(() => { const w = window as unknown as { __ouvidos: { tipo: string; dados: unknown }[]; __atlas: { servicos(): { barramento: { ouvir(t: string, f: (e: { tipo: string; dados: unknown }) => void): void } } } }; w.__ouvidos = []; for (const t of ['ficha.rolagem', 'jukebox.tocando']) w.__atlas.servicos().barramento.ouvir(t, e => w.__ouvidos.push({ tipo: e.tipo, dados: e.dados })); });
    // A Ficha mostra a personagem escolhida (pedido `ficha.abrir`), para a rolagem sair em nome dela.
    const aberta = await atlas.evaluate(async ref => (await (window as unknown as { __atlas: { servicos(): { barramento: { pedir(t: string, d: unknown): Promise<{ ok: boolean }> } } } }).__atlas.servicos().barramento.pedir('ficha.abrir', { ref })), refFicha);
    assert.equal(aberta.ok, true, 'a Ficha atendeu ficha.abrir');
    await atlas.click('[data-testid="aba-mapa"]');
    await atlas.locator(`[data-testid="personagem-por-${personagem.id}"]`).waitFor({ timeout: 10_000 }); await atlas.click(`[data-testid="personagem-por-${personagem.id}"]`); await atlas.waitForTimeout(300);
    await atlas.evaluate(() => (window as unknown as { __atlas: { viewport(): { focarEm(c: object): void } } }).__atlas.viewport().focarEm({ x0: 3, y0: 3, x1: 15, y1: 10.5 })); await atlas.waitForTimeout(250);
    await ferramenta(atlas, 'objeto'); await atlas.locator(`[data-testid="pista-${idBilhete}"]`).waitFor({ timeout: 15_000 }); await atlas.click(`[data-testid="pista-por-${idBilhete}"]`); await atlas.waitForTimeout(400);
    const doc0 = await documento(atlas), peca = Object.values(doc0.tokens)[0]!, pista = Object.values(doc0.props).find(o => o.interaction?.kind === 'clue')!;
    assert.equal(peca.name, personagem.nome); assert.deepEqual(peca.refs, [refFicha], 'a peça é a personagem da Ficha');
    await sessao(atlas, `(s, a) => {
      s.store.executar({ tipo: "clima.audio", id: "tempestade", ref: a.aurora });
      s.store.executar({ tipo: "item.adicionar", colecao: "regions", item: { id: "biblioteca", polygon: [[11, 3.5], [14.5, 3.5], [14.5, 9], [11, 9]], kind: "audio", gmOnly: false, payload: { nome: "Biblioteca" }, refs: [a.batalha] } });
      s.store.executar({ tipo: "item.atualizar", colecao: "tokens", id: a.peca, patch: { position: [4.5, 6.75] } });
    }`, { aurora, batalha, peca: peca.id });

    // 5. Sessão e projetor.
    await atlas.click('[data-testid="modo-sessao"]'); await atlas.locator('[data-testid="dock"]').waitFor(); await atlas.click('[data-testid="dock-titulo-projetor"]');
    const proj = await ctx.newPage(); await proj.goto(`${amb.origem}/Atlas/#/projetor/${doc0.id}`);
    await proj.waitForFunction(() => (window as unknown as { __projetor?: { doc(): { tokens: object } | null } }).__projetor?.doc()?.tokens != null, null, { timeout: 30_000 });
    await atlas.getByText('Conectado', { exact: true }).waitFor({ timeout: 8000 });
    await atlas.click('[data-testid="dock-titulo-projetor"]'); await atlas.click('[data-testid="dock-titulo-clima"]').catch(() => undefined);

    // 6. A rolagem na Ficha de verdade aparece sobre a peça, no mapa e no projetor.
    await ficha.bringToFront(); await ficha.waitForSelector('[data-roll]', { timeout: 30_000 });
    await ficha.locator('[data-roll]').first().click({ force: true }); await ficha.waitForTimeout(1500); await ficha.keyboard.press('Space');
    await atlas.waitForFunction(() => (window as unknown as { __ouvidos: { tipo: string }[] }).__ouvidos.some(e => e.tipo === 'ficha.rolagem'), null, { timeout: 40_000 });
    await atlas.locator('[data-testid="rolagem-flutuante"]').first().waitFor({ timeout: 6000 }); await proj.locator('[data-testid="rolagem-flutuante"]').first().waitFor({ timeout: 6000 });

    // 7. A pista do Ateliê, inspecionada com a luz UV, no projetor.
    await atlas.bringToFront();
    await clicar(atlas, pista.position as [number, number]); await atlas.locator('[data-testid="inspecao"]').waitFor({ timeout: 8000 });
    await atlas.click('[data-testid="inspecao-uv"]'); await atlas.click('[data-testid="inspecao-mostrar"]');
    const caixa = (await atlas.locator('[data-testid="inspecao-visor"]').boundingBox())!; await atlas.mouse.move(caixa.x + caixa.width * 0.45, caixa.y + caixa.height * 0.5, { steps: 6 });
    await proj.locator('[data-testid="projetor-inspecao"]').waitFor({ timeout: 8000 });
    await proj.waitForFunction(() => (document.querySelector('[data-testid="projetor-visor"]') as HTMLElement | null)?.dataset.uv === '1', null, { timeout: 8000 });
    await atlas.keyboard.press('Escape'); await proj.locator('[data-testid="projetor-inspecao"]').waitFor({ state: 'detached', timeout: 6000 });
    assert.ok((await documento(atlas)).session.revealed.includes(pista.id), 'a pista mostrada ficou revelada');

    // 8. O clima troca a música no Jukebox de verdade; entrar na região também; sair volta à do clima.
    const tocando = () => atlas.evaluate(() => (window as unknown as { __ouvidos: { tipo: string; dados: { cena: { id: string } | null } }[] }).__ouvidos.filter(e => e.tipo === 'jukebox.tocando').map(e => e.dados.cena?.id ?? null));
    await sessao(atlas, '(s) => s.store.executar({ tipo: "clima.predefinir", id: "tempestade" })');
    await atlas.waitForFunction(() => (window as unknown as { __ouvidos: { tipo: string }[] }).__ouvidos.filter(e => e.tipo === 'jukebox.tocando').length >= 1, null, { timeout: 15_000 });
    await sessao(atlas, '(s, a) => s.store.executar({ tipo: "peca.mover", id: a, para: [12.75, 6.75], livre: true })', peca.id);
    await atlas.waitForFunction(() => (window as unknown as { __ouvidos: { tipo: string }[] }).__ouvidos.filter(e => e.tipo === 'jukebox.tocando').length >= 2, null, { timeout: 15_000 });
    await sessao(atlas, '(s, a) => s.store.executar({ tipo: "peca.mover", id: a, para: [4.5, 6.75], livre: true })', peca.id);
    await atlas.waitForFunction(() => (window as unknown as { __ouvidos: { tipo: string }[] }).__ouvidos.filter(e => e.tipo === 'jukebox.tocando').length >= 3, null, { timeout: 15_000 });
    assert.deepEqual(await tocando(), [aurora.id, batalha.id, aurora.id], 'clima → região de áudio → de volta ao clima');
    await atlas.screenshot({ path: 'test-results/fase9-mesa-atlas.png' });

    // 9. O diário da Mesa registrou tudo isso, sem ninguém copiar nada à mão.
    await mesa.bringToFront();
    await esperarLinha(mesa, new RegExp(`${personagem.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} rolou .+: \\d+$`));
    await esperarLinha(mesa, /Revelado aos jogadores: Pista$/);
    await esperarLinha(mesa, /entrou em Biblioteca \(/);
    await esperarLinha(mesa, /Tocando: Aurora$/); await esperarLinha(mesa, /Tocando: Batalha$/);
    await esperarLinha(mesa, /salvo no Ateliê/);
    const linhas = await linhasDoDiario(mesa), ordem = (re: RegExp) => linhas.findIndex(l => re.test(l));
    assert.ok(ordem(/Tocando: Aurora$/) < ordem(/Tocando: Batalha$/), 'a música do clima veio antes da da região');
    await mesa.screenshot({ path: 'test-results/fase9-mesa-diario.png' });
    assert.deepEqual(errosDaMesa, [], 'sem erros de script na Mesa'); assert.deepEqual(errosDoAtelie, [], 'sem erros de script no Ateliê');
  } finally { await ctx.close(); }
});
