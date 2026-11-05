import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Page } from 'playwright';
import { iniciarAmbiente, type Ambiente } from './apoio.ts';

let amb: Ambiente;
before(async () => { amb = await iniciarAmbiente(); });
after(async () => { await amb.encerrar(); });

const MAPA = { app: 'atlas', tipo: 'mapa', id: 'm1' }, FICHA = { app: 'ficha', tipo: 'ficha', id: 's1' }, CENA = { app: 'jukebox', tipo: 'cena-sonora', id: 'chuva' };

/** Uma aba que faz o papel de outro aplicativo: posta fatos no barramento e anota o que ouve. */
async function aplicativoFalso(p: Page) {
  await p.goto(`${amb.origem}/Tabletop/`);
  await p.evaluate(() => { const w = window as unknown as { __ouvidos: { tipo: string; dados: unknown }[] }; w.__ouvidos = []; const c = new BroadcastChannel('mesa:eventos'); c.onmessage = e => w.__ouvidos.push(e.data); (window as unknown as { __canal: BroadcastChannel }).__canal = c; });
  return {
    emitir: (app: string, tipo: string, dados: unknown, campanhaId: string | null, em = Date.now()) => p.evaluate(([app, tipo, dados, campanhaId, em]) => (window as unknown as { __canal: BroadcastChannel }).__canal.postMessage({ contrato: 1, app, tipo, id: crypto.randomUUID(), em, campanhaId, dados }), [app, tipo, dados, campanhaId, em] as const),
    ouvidos: () => p.evaluate(() => (window as unknown as { __ouvidos: { tipo: string; dados: unknown }[] }).__ouvidos),
  };
}
const linhas = (p: Page) => p.locator('[data-testid="registro-linha"]').allTextContents();
/** As linhas do registro, sem as “Mapa aberto”: o Atlas embutido no painel abre o mapa sozinho (e isso é um fato de verdade, registrado). */
const fatos = async (p: Page) => (await linhas(p)).filter(t => !/Mapa aberto:/.test(t));
async function esperarFatos(p: Page, n: number): Promise<string[]> {
  for (let i = 0; i < 60; i++) { const t = await fatos(p); if (t.length === n) return t; await p.waitForTimeout(150); }
  throw new Error(`Esperava ${n} linhas e há: ${(await fatos(p)).join(' | ')}`);
}
const sessoesDoBanco = (p: Page) => p.evaluate(() => new Promise<{ nome: string; registro: string; roteiro: { app: string; tipo: string; id: string }[]; roteiroNotas?: Record<string, string> }[]>((ok, erro) => { const r = indexedDB.open('mesa-campanha-v1'); r.onerror = () => erro(r.error); r.onsuccess = () => { const db = r.result, q = db.transaction('sessoes').objectStore('sessoes').getAll(); q.onsuccess = () => { db.close(); ok(q.result); }; }; }));

test('9.5b: roteiro e registro da sessão: avisa o início, registra só os fatos certos, abre os itens, exporta em Markdown e sobrevive a recarregar', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { if (localStorage.getItem('atlas:sugestoes') === null) localStorage.setItem('atlas:sugestoes', '0'); } catch { /* sem armazenamento */ } });
  try {
    const mesa = await ctx.newPage(), errosDaMesa: string[] = [];
    mesa.on('pageerror', e => errosDaMesa.push(`pageerror: ${e.message}`));
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]'); await mesa.fill('[data-testid="nova-campanha-nome"]', 'A Ilha'); await mesa.press('[data-testid="nova-campanha-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    const campanhaId = (await mesa.evaluate(() => localStorage.getItem('mesa:campanha-ativa')))!;
    // A campanha: o mapa vem do Atlas; a personagem (com ficha) e a cena sonora (do Jukebox) são entidades com os Refs deles.
    const atlas = await ctx.newPage(); await atlas.goto(`${amb.origem}/Atlas/`);
    await atlas.click('[data-testid="novo-mapa"]'); await atlas.waitForSelector('[data-testid="area-do-mapa"] canvas', { timeout: 20_000 });
    await atlas.fill('#nome-do-mapa', 'Casa dos Salgueiros'); await atlas.press('#nome-do-mapa', 'Enter'); await atlas.keyboard.press('Control+s');
    await atlas.evaluate(() => { location.hash = '#/'; }); await atlas.waitForSelector('[data-testid="novo-mapa"]');
    await mesa.bringToFront();
    await mesa.evaluate(async ([campanhaId, ficha, cena]) => {
      const repo = (window as unknown as { __mesa: { repositorio(): { criarEntidade(d: unknown): Promise<unknown> } } }).__mesa.repositorio();
      await repo.criarEntidade({ campanhaId, tipo: 'personagem', nome: 'Muirenn', refs: [ficha] }); await repo.criarEntidade({ campanhaId, tipo: 'cena', nome: 'Chuva forte', refs: [cena] });
    }, [campanhaId, FICHA, CENA] as const);
    await mesa.waitForFunction(() => (window as unknown as { __mesa: { entidades(): { nome: string }[] } }).__mesa.entidades().some(e => e.nome === 'Casa dos Salgueiros'), null, { timeout: 15_000 });
    const mapaId = (await mesa.evaluate(() => (window as unknown as { __mesa: { entidades(): { tipo: string; refs: { app: string; tipo: string; id: string }[] }[] } }).__mesa.entidades().find(e => e.tipo === 'lugar')!.refs.find(r => r.app === 'atlas')!.id));

    const outro = await aplicativoFalso(await ctx.newPage());
    await mesa.bringToFront();
    await mesa.click('[data-testid="aba-sessao"]'); await mesa.click('[data-testid="preset-com-diario"]');
    await mesa.waitForSelector('[data-testid="sem-sessao"]');
    assert.equal(await mesa.locator('[data-testid="painel-corpo-diario"]').count(), 1);

    // Iniciar: cria a sessão e avisa a todos (`mesa.sessao-iniciada`, com o Ref da sessão).
    await mesa.fill('[data-testid="sessao-nome"]', 'Noite na ilha'); await mesa.click('[data-testid="sessao-iniciar"]');
    await mesa.waitForSelector('[data-testid="diario"]');
    assert.equal(await mesa.locator('[data-testid="sessao-estado"]').textContent(), 'Gravando');
    await outro.ouvidos().then(() => new Promise(r => setTimeout(r, 300)));
    const iniciada = (await outro.ouvidos()).find(e => e.tipo === 'mesa.sessao-iniciada') as { app: string; dados: { sessao: { app: string; tipo: string; id: string } } } | undefined;
    assert.ok(iniciada, 'a Mesa avisou o início'); assert.equal(iniciada.app, 'mesa'); assert.deepEqual({ app: iniciada.dados.sessao.app, tipo: iniciada.dados.sessao.tipo }, { app: 'mesa', tipo: 'sessao' });
    const sessaoId = iniciada.dados.sessao.id;

    // Três fatos de verdade viram três linhas; repetido, de outra campanha, `recursos` e tipo desconhecido não entram.
    const agora = Date.now();
    await outro.emitir('ficha', 'ficha.rolagem', { ficha: FICHA, titulo: 'Investigação', total: 17 }, campanhaId, agora);
    await outro.emitir('ficha', 'ficha.rolagem', { ficha: FICHA, titulo: 'Investigação', total: 17 }, campanhaId, agora);          // o mesmo fato por outro caminho
    await outro.emitir('ficha', 'ficha.recursos', { ficha: FICHA, pv: 3, pvMax: 9, pd: 2, pdMax: 9 }, campanhaId);                   // ruído
    await outro.emitir('ficha', 'ficha.rolagem', { ficha: FICHA, titulo: 'Luta', total: 5 }, 'outra-campanha');                      // de outra campanha
    await outro.emitir('atlas', 'atlas.revelado', { mapa: MAPA, alvo: { app: 'atlas', tipo: 'abertura', id: 'm1/p1' }, nome: 'Porta secreta' }, campanhaId);
    await outro.emitir('jukebox', 'jukebox.tocando', { cena: CENA }, campanhaId);
    await esperarFatos(mesa, 3); await mesa.waitForTimeout(500);
    const texto = await esperarFatos(mesa, 3);
    assert.match(texto[0]!, /^\d{2}:\d{2}Muirenn rolou Investigação: 17$/); assert.match(texto[1]!, /Revelado aos jogadores: Porta secreta$/); assert.match(texto[2]!, /Tocando: Chuva forte$/);

    // O mestre anota.
    await mesa.fill('[data-testid="anotar"]', 'A porta rangeu'); await mesa.press('[data-testid="anotar"]', 'Enter');
    await esperarFatos(mesa, 4);
    assert.equal(await mesa.locator('[data-testid="registro-linha"].nota').count(), 1);

    // Roteiro: acrescentar, reordenar, anotar e abrir. Abrir o mapa traz o Atlas (aberto noutra aba, na galeria) para ele.
    for (const rotulo of ['Chuva forte — Jukebox · cena sonora', 'Casa dos Salgueiros — Atlas · mapa']) await mesa.selectOption('[data-testid="roteiro-adicionar"]', { label: rotulo });
    assert.equal(await mesa.locator('[data-testid="roteiro-item"]').count(), 2);
    await mesa.click('[data-testid="roteiro-subir-1"]');
    assert.match(await mesa.locator('[data-testid="roteiro-abrir-0"]').textContent() ?? '', /1\. Casa dos Salgueiros/);
    await mesa.fill('[data-testid="roteiro-nota-0"]', 'Começar pela chuva'); await mesa.press('[data-testid="roteiro-nota-0"]', 'Enter');
    await mesa.click('[data-testid="roteiro-abrir-0"]');
    await atlas.waitForFunction(id => location.hash === `#/mapa/${id}`, mapaId, { timeout: 8000 });

    // Exportar: um .md com título, roteiro com a nota e o registro com a anotação em destaque.
    const [baixado] = await Promise.all([mesa.waitForEvent('download'), mesa.click('[data-testid="sessao-exportar"]')]);
    assert.equal(baixado.suggestedFilename(), 'noite-na-ilha.md');
    const md = await readFile((await baixado.path())!, 'utf8');
    assert.match(md, /^# Noite na ilha\n/); assert.match(md, /## Roteiro\n\n1\. \*\*Casa dos Salgueiros\*\* — Atlas · mapa\n   > Começar pela chuva\n2\. \*\*Chuva forte\*\* — Jukebox · cena sonora/);
    assert.match(md, /- \d{2}:\d{2} Muirenn rolou Investigação: 17\n/); assert.match(md, /- \d{2}:\d{2} \*\*Nota:\*\* A porta rangeu\n/);

    // No banco: a sessão tem o registro, o roteiro e as notas dos itens.
    let guardada = (await sessoesDoBanco(mesa))[0]!;
    for (let i = 0; i < 40 && !(guardada.roteiro.length === 2 && guardada.registro.includes('A porta rangeu')); i++) { await mesa.waitForTimeout(150); guardada = (await sessoesDoBanco(mesa))[0]!; }
    assert.equal(guardada.nome, 'Noite na ilha'); assert.deepEqual(guardada.roteiro.map(r => `${r.app}/${r.tipo}`), ['atlas/mapa', 'jukebox/cena-sonora']);
    assert.equal(guardada.roteiro[0]!.id, mapaId); assert.deepEqual(guardada.roteiroNotas, { [`atlas/mapa/${mapaId}`]: 'Começar pela chuva' }, 'a nota do item está na sessão, no banco'); assert.match(guardada.registro, /Muirenn rolou Investigação: 17/); assert.match(guardada.registro, /\[\d{2}:\d{2}\] > A porta rangeu/);

    // Recarregar: a sessão volta, ainda gravando, com as linhas e as notas do roteiro (vindas do banco); um fato novo continua entrando.
    await mesa.reload(); await mesa.waitForSelector('[data-testid="aba-sessao"]'); await mesa.click('[data-testid="aba-sessao"]');
    await mesa.waitForSelector('[data-testid="sessao-nome-ativa"]'); // (o painel do diário continua à vista: o layout é lembrado)
    assert.equal(await mesa.locator('[data-testid="sessao-nome-ativa"]').textContent(), 'Noite na ilha');
    assert.equal(await mesa.locator('[data-testid="sessao-estado"]').textContent(), 'Gravando');
    await esperarFatos(mesa, 4); assert.equal(await mesa.inputValue('[data-testid="roteiro-nota-0"]'), 'Começar pela chuva');
    const abertos = async () => (await linhas(mesa)).filter(t => /Mapa aberto: Casa dos Salgueiros$/.test(t)).length, antes = await abertos();
    await outro.emitir('atlas', 'atlas.cena-aberta', { mapa: MAPA }, campanhaId, Date.now() + 5000);
    for (let i = 0; i < 60 && (await abertos()) <= antes; i++) await mesa.waitForTimeout(150);
    assert.ok((await abertos()) > antes, 'o fato novo entrou depois de recarregar');

    // Parar: o registro deixa de ouvir, mas as anotações continuam valendo.
    await mesa.click('[data-testid="sessao-encerrar"]');
    assert.equal(await mesa.locator('[data-testid="sessao-estado"]').textContent(), 'Parada');
    const totalParado = (await linhas(mesa)).length;
    await outro.emitir('jukebox', 'jukebox.tocando', { cena: null }, campanhaId); await mesa.waitForTimeout(600);
    assert.equal((await linhas(mesa)).length, totalParado, 'parada não registra fatos');
    await mesa.fill('[data-testid="anotar"]', 'Fim da noite'); await mesa.press('[data-testid="anotar"]', 'Enter');
    await mesa.waitForFunction(n => document.querySelectorAll('[data-testid="registro-linha"]').length === n, totalParado + 1);
    // Fechar e abrir de novo pela lista de sessões anteriores.
    await mesa.click('[data-testid="sessao-fechar"]'); await mesa.waitForSelector('[data-testid="sem-sessao"]');
    await mesa.click(`[data-testid="sessao-continuar-${sessaoId}"]`); await mesa.waitForSelector('[data-testid="diario"]');
    assert.equal((await linhas(mesa)).length, totalParado + 1); assert.equal(await mesa.locator('[data-testid="sessao-estado"]').textContent(), 'Gravando');
    assert.ok((await linhas(mesa)).some(t => /Fim da noite$/.test(t)));
    assert.deepEqual(errosDaMesa, [], 'sem erros de script na Mesa');
  } finally { await ctx.close(); }
});

test('9.5b: as notas do roteiro que estavam no navegador (versão antiga) passam para o banco ao abrir a sessão', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1500, height: 900 } });
  try {
    const mesa = await ctx.newPage();
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]'); await mesa.fill('[data-testid="nova-campanha-nome"]', 'Migração'); await mesa.press('[data-testid="nova-campanha-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');
    const campanhaId = (await mesa.evaluate(() => localStorage.getItem('mesa:campanha-ativa')))!;
    // Uma sessão antiga: o roteiro está no banco, mas a nota estava só no localStorage.
    await mesa.evaluate(async ([campanhaId, mapa]) => {
      const repo = (window as unknown as { __mesa: { repositorio(): { salvarSessao(s: unknown): Promise<void> } } }).__mesa.repositorio();
      await repo.salvarSessao({ id: 'sessao-antiga', campanhaId, nome: 'Antiga', data: 1, roteiro: [mapa], registro: '', criadaEm: 1, atualizadaEm: 1 });
      localStorage.setItem('mesa:roteiro-notas:sessao-antiga', JSON.stringify({ 'atlas/mapa/m1': 'Nota velha', 'atlas/mapa/fora': 'some' }));
      localStorage.setItem(`mesa:sessao-ativa:${campanhaId}`, JSON.stringify({ id: 'sessao-antiga', gravando: false }));
    }, [campanhaId, MAPA] as const);
    await mesa.reload(); await mesa.click('[data-testid="aba-sessao"]'); await mesa.click('[data-testid="painel-diario"]');
    await mesa.waitForSelector('[data-testid="diario"]');
    assert.equal(await mesa.inputValue('[data-testid="roteiro-nota-0"]'), 'Nota velha');
    let [s] = await sessoesDoBanco(mesa);
    for (let i = 0; i < 40 && !s!.roteiroNotas; i++) { await mesa.waitForTimeout(150); [s] = await sessoesDoBanco(mesa); }
    assert.deepEqual(s!.roteiroNotas, { 'atlas/mapa/m1': 'Nota velha' }, 'só a nota de um item que está no roteiro foi para o banco');
    assert.equal(await mesa.evaluate(() => localStorage.getItem('mesa:roteiro-notas:sessao-antiga')), null, 'a cópia antiga foi apagada');
  } finally { await ctx.close(); }
});
