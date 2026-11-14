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
    assert.match(await mesa.locator('[data-testid="so-leitura"]').textContent() ?? '', /O nome vem do Atlas: renomeie lá\. Etiquetas e notas você edita aqui\./);
    assert.equal(await mesa.locator('[data-testid="campo-tags"]').isDisabled(), false, 'etiquetas liberadas em entidade alheia');
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
    await mesa.fill('[data-testid="campo-tags"]', 'investigadora, Ateliê, rascunho');
    await mesa.press('[data-testid="campo-tags"]', 'Enter');
    await mesa.waitForSelector('[data-testid="etiqueta-rascunho"]');
    await mesa.click('[data-testid="etiqueta-rascunho"] [aria-label="Remover etiqueta rascunho"]');
    await mesa.waitForSelector('[data-testid="etiqueta-rascunho"]', { state: 'detached' });
    await mesa.waitForSelector('[data-testid="etiqueta-atelie"]');
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
    await mesa.click('[data-testid="tema-vigilia"]');
    await atlas.waitForFunction(() => document.documentElement.dataset.tema === 'vigilia');

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

interface LigacaoDoBanco { de: { app: string; tipo: string; id: string }; para: { app: string; tipo: string; id: string }; tipo: string; criadaPor: string }
const ligacoesDoBanco = (p: Page): Promise<LigacaoDoBanco[]> => p.evaluate(() => new Promise<LigacaoDoBanco[]>((ok, erro) => {
  const r = indexedDB.open('mesa-campanha-v1');
  r.onerror = () => erro(r.error);
  r.onsuccess = () => { const db = r.result, q = db.transaction('ligacoes').objectStore('ligacoes').getAll(); q.onsuccess = () => { db.close(); ok(q.result as LigacaoDoBanco[]); }; };
}));

test('9.1b: nota com [[ligações]]: autocompleta, vira ligações no banco, abre o mapa no Atlas, cria o que falta e limpa ao apagar', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { if (localStorage.getItem('atlas:sugestoes') === null) localStorage.setItem('atlas:sugestoes', '0'); } catch { /* sem armazenamento */ } });
  try {
    const mesa = await ctx.newPage(), errosDaMesa = erros(mesa);
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-campanhas"]');
    await mesa.fill('[data-testid="nova-campanha-nome"]', 'A Ilha'); await mesa.press('[data-testid="nova-campanha-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="tela-entidades"]');

    // O Atlas cria o mapa “Casa dos Salgueiros” (o lugar nasce na campanha ao gravar).
    const atlas = await ctx.newPage();
    await atlas.goto(`${amb.origem}/Atlas/`);
    await atlas.click('[data-testid="novo-mapa"]'); await atlas.waitForSelector('[data-testid="area-do-mapa"] canvas', { timeout: 20_000 });
    await atlas.fill('#nome-do-mapa', 'Casa dos Salgueiros'); await atlas.press('#nome-do-mapa', 'Enter');
    await atlas.keyboard.press('Control+s');
    await mesa.bringToFront();
    const lugar = mesa.locator('[data-tipo="lugar"]', { hasText: 'Casa dos Salgueiros' });
    await lugar.first().waitFor({ timeout: 15_000 });
    const mapaId = (await atlas.evaluate(() => location.hash)).replace('#/mapa/', '');
    assert.ok(mapaId, 'o Atlas está no mapa');

    // Uma nota da Mesa; ao digitar `[[Casa` o autocompletar sugere o lugar, e Enter o aceita.
    await mesa.selectOption('[data-testid="novo-tipo"]', 'nota');
    await mesa.fill('[data-testid="nova-entidade-nome"]', 'Diário do mestre'); await mesa.press('[data-testid="nova-entidade-nome"]', 'Enter');
    await mesa.waitForSelector('[data-testid="campo-notas"]');
    const notas = mesa.locator('[data-testid="campo-notas"]');
    await notas.click();
    await notas.pressSequentially('Procurar na [[Casa');
    await mesa.waitForSelector('[data-testid="autocompletar"]');
    assert.match(await mesa.locator('[data-testid="sugestao-0"]').textContent() ?? '', /Casa dos Salgueiros/);
    await mesa.keyboard.press('Enter');
    assert.equal(await notas.inputValue(), 'Procurar na [[Casa dos Salgueiros]]');
    assert.equal(await mesa.locator('[data-testid="autocompletar"]').count(), 0, 'fechou ao aceitar');
    await notas.pressSequentially(', falar com [[Fantasma]] e ver [[mesa:atlas/mapa/' + mapaId + '|o mapa]].');
    await mesa.click('[data-testid="nota-modo-ler"]');

    // Leitura: a entidade, o Ref (outra ligação) e o nome sem destino.
    await mesa.waitForSelector('[data-testid="leitura"]');
    assert.equal(await mesa.locator('[data-testid="ligacao-entidade"]').textContent(), 'Casa dos Salgueiros');
    assert.equal(await mesa.locator('[data-testid="ligacao-ref"]').first().textContent(), 'o mapa ↗');
    assert.equal(await mesa.locator('[data-testid="ligacao-sem-destino"]').textContent(), 'Fantasma');

    // No banco: ligações `menciona` da nota para o lugar e para o mapa; “Fantasma” não vira ligação.
    await mesa.waitForFunction(async () => { const r = await new Promise<number>(ok => { const q = indexedDB.open('mesa-campanha-v1'); q.onsuccess = () => { const c = q.result.transaction('ligacoes').objectStore('ligacoes').count(); c.onsuccess = () => { q.result.close(); ok(c.result); }; }; }); return r === 2; });
    let ligacoes = await ligacoesDoBanco(mesa);
    assert.ok(ligacoes.every(l => l.tipo === 'menciona' && l.criadaPor === 'mesa' && l.de.app === 'mesa' && l.de.tipo === 'entidade'));
    assert.ok(ligacoes.some(l => l.para.app === 'atlas' && l.para.tipo === 'mapa' && l.para.id === mapaId), 'ligação ao mapa pelo Ref');
    assert.ok(ligacoes.some(l => l.para.app === 'mesa' && l.para.tipo === 'entidade'), 'ligação ao lugar');
    // O lugar é do Atlas: a Mesa só acrescentou o próprio Ref e deixou o do Atlas.
    const lugarRefs = await mesa.evaluate(() => (window as unknown as { __mesa: { entidades(): { tipo: string; criadaPor: string; refs: { app: string }[] }[] } }).__mesa.entidades().find(e => e.tipo === 'lugar')!.refs.map(r => r.app).sort());
    assert.deepEqual(lugarRefs, ['atlas', 'mesa']);

    // Clicar em “Atlas ↗” ao lado da ligação: o Atlas (aberto noutra aba, na galeria) foca o mapa.
    await atlas.evaluate(() => { location.hash = '#/'; });
    await atlas.waitForSelector('[data-testid="novo-mapa"]');
    await mesa.bringToFront();
    await mesa.click('[data-testid="ligacao-abrir-atlas"]');
    await atlas.waitForFunction(id => location.hash === `#/mapa/${id}`, mapaId, { timeout: 8000 });
    assert.equal(ctx.pages().length, 2, 'foi atendido pelo barramento: nada de aba nova');

    // O nome sem destino ganha entidade: “Criar entidade” → Personagem.
    await mesa.click('[data-testid="ligacao-criar"]'); await mesa.click('[data-testid="ligacao-criar-personagem"]');
    await mesa.waitForFunction(() => document.querySelectorAll('[data-testid="ligacao-sem-destino"]').length === 0);
    assert.equal(await mesa.locator('[data-testid="ligacao-entidade"]').count(), 2);
    await mesa.waitForFunction(async () => { const r = await new Promise<number>(ok => { const q = indexedDB.open('mesa-campanha-v1'); q.onsuccess = () => { const c = q.result.transaction('ligacoes').objectStore('ligacoes').count(); c.onsuccess = () => { q.result.close(); ok(c.result); }; }; }); return r === 3; });
    // Clicar na ligação abre a entidade na Mesa.
    await mesa.locator('[data-testid="ligacao-entidade"]', { hasText: 'Fantasma' }).click();
    await mesa.waitForFunction(() => (document.querySelector('[data-testid="campo-nome"]') as HTMLInputElement | null)?.value === 'Fantasma');
    await mesa.locator('[data-testid^="entidade-"]', { hasText: 'Diário do mestre' }).click();

    // Tirar uma ligação do texto apaga a ligação do banco.
    await mesa.click('[data-testid="nota-modo-editar"]');
    await mesa.fill('[data-testid="campo-notas"]', 'Só a [[Casa dos Salgueiros]].');
    await mesa.click('[data-testid="nota-modo-ler"]');
    await mesa.waitForFunction(async () => { const r = await new Promise<number>(ok => { const q = indexedDB.open('mesa-campanha-v1'); q.onsuccess = () => { const c = q.result.transaction('ligacoes').objectStore('ligacoes').count(); c.onsuccess = () => { q.result.close(); ok(c.result); }; }; }); return r === 1; });
    ligacoes = await ligacoesDoBanco(mesa);
    assert.equal(ligacoes[0]!.para.app, 'mesa', JSON.stringify(ligacoes));

    // Remover a nota leva as ligações dela.
    await mesa.click('[data-testid="remover-entidade"]'); await mesa.click('[data-testid="confirmar-remover"]');
    await mesa.waitForFunction(async () => { const r = await new Promise<number>(ok => { const q = indexedDB.open('mesa-campanha-v1'); q.onsuccess = () => { const c = q.result.transaction('ligacoes').objectStore('ligacoes').count(); c.onsuccess = () => { q.result.close(); ok(c.result); }; }; }); return r === 0; });
    assert.deepEqual(errosDaMesa, [], 'sem erros no console da Mesa');
  } finally { await ctx.close(); }
});

test('9.1c: o inventário mostra o que está por perto (achado, sem manifesto, fora do ar) e o que cada aplicativo oferece e atende', async () => {
  const ctx = await amb.navegador.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const mesa = await ctx.newPage(), errosDaMesa = erros(mesa);
    await mesa.goto(`${amb.origem}/Mesa/`);
    await mesa.click('[data-testid="aba-aplicativos"]');
    await mesa.waitForSelector('[data-testid="tela-aplicativos"] [data-testid="app-atlas"]');
    const estado = (app: string) => mesa.locator(`[data-testid="app-${app}"]`).getAttribute('data-estado');
    await mesa.waitForFunction(() => document.querySelectorAll('[data-testid^="app-"][data-estado]').length === 6);
    assert.equal(await estado('atlas'), 'achado');
    assert.equal(await estado('mesa'), 'achado');
    assert.equal(await estado('jukebox'), 'achado');
    assert.equal(await estado('tabletop'), 'sem-manifesto');
    assert.equal(await estado('ficha'), 'fora-do-ar');
    assert.equal(await estado('atelie'), 'fora-do-ar');

    // O cartão mostra o que o aplicativo oferece e atende (do manifesto), um link para abri-lo e o ícone.
    const atlas = mesa.locator('[data-testid="app-atlas"]');
    assert.match(await atlas.textContent() ?? '', /mapa/); assert.match(await atlas.textContent() ?? '', /atlas\.focar/);
    assert.match((await atlas.locator('[data-testid="app-abrir"]').getAttribute('href')) ?? '', /\/Atlas\/$/);
    const juke = mesa.locator('[data-testid="app-jukebox"]');
    assert.match(await juke.textContent() ?? '', /jukebox\.tocar/); assert.match(await juke.textContent() ?? '', /cena-sonora/);
    assert.equal(await mesa.locator('[data-testid="app-mesa"] [data-testid="app-estado"]').textContent(), 'Você está aqui');
    assert.equal(await mesa.locator('[data-testid="app-mesa"] [data-testid="app-abrir"]').count(), 0, 'a Mesa não se abre a si mesma');
    assert.match(await mesa.locator('[data-testid="app-tabletop"] [data-testid="app-detalhe"]').textContent() ?? '', /mesa\.json/);
    assert.match(await mesa.locator('[data-testid="app-ficha"] [data-testid="app-detalhe"]').textContent() ?? '', /mesa-dev/);
    assert.equal(await mesa.locator('[data-testid="app-ficha"] [data-testid="app-abrir"]').count(), 0, 'fora do ar não tem “Abrir”');
    const ico = await mesa.evaluate(() => { const i = document.querySelector('[data-testid="app-atlas"] img.app-icone') as HTMLImageElement | null; return i ? { ok: i.complete && i.naturalWidth > 0, src: i.src } : null; });
    assert.ok(ico?.ok, `o ícone do Atlas carregou (${ico?.src})`);

    // Um aplicativo que sobe depois aparece ao procurar de novo.
    await mesa.click('[data-testid="atualizar-aplicativos"]');
    await mesa.waitForFunction(() => !(document.querySelector('[data-testid="atualizar-aplicativos"]') as HTMLButtonElement).disabled);
    assert.equal(await estado('jukebox'), 'achado');
    assert.deepEqual(errosDaMesa.filter(e => !/Failed to load resource|favicon/.test(e)), [], 'sem erros de script na Mesa');
  } finally { await ctx.close(); }
});
