import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { analisarMarcadores } from '../../../src/dominio/marcadores.ts';
import { CONDICOES, type Condicao } from '../../../src/tutorial/condicoes.ts';
import { LICOES, NOTA_FALA, NOTA_LIGACAO, NOTA_LOOT, NOTA_SEGREDO, NOTA_TESTE, PASTAS_DE_LICOES } from '../../../src/tutorial/licoes.ts';

const quadro = LICOES.filter(l => l.pasta === 'quadro');
const visiveis = LICOES.filter(l => !l.oculta);

/** Todas as condições de um `feito`, descendo pelos `e`. */
const condicoesDe = (c: Condicao): Condicao[] => (c[0] === 'e' ? c.slice(1).flatMap(x => condicoesDe(x as Condicao)) : [c]);

function lerTsx(dir: string): string {
  return readdirSync(dir).map(n => { const p = join(dir, n); return statSync(p).isDirectory() ? lerTsx(p) : n.endsWith('.tsx') ? readFileSync(p, 'utf8') : ''; }).join('\n');
}
const fonteDaUi = lerTsx(new URL('../../../src/ui', import.meta.url).pathname);

test('as lições têm id único, pasta que existe e a próxima existe', () => {
  const ids = LICOES.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const l of LICOES) {
    if (l.pasta) assert.ok(PASTAS_DE_LICOES.some(p => p.id === l.pasta), `${l.id}: pasta ${l.pasta}`);
    if (l.proxima) assert.ok(ids.includes(l.proxima), `${l.id}: próxima ${l.proxima}`);
    assert.ok(l.passos.length > 0);
  }
  assert.deepEqual(quadro.map(l => l.id), ['quadro-notas', 'quadro-ligacoes']);
});

test('todo feito usa uma condição de CONDICOES', () => {
  for (const l of LICOES) for (const [i, p] of l.passos.entries()) for (const c of condicoesDe(p.feito)) assert.ok(c[0] in CONDICOES, `${l.id} passo ${i + 1}: condição ${String(c[0])}`);
});

test('os textos de nota sugeridos têm o tipo de marcador que o passo espera', () => {
  const tipoDe = (texto: string): string[] => analisarMarcadores(texto).flatMap(t => (t.tipo === 'marcador' ? [t.marcador.tipo] : []));
  assert.deepEqual(tipoDe(NOTA_TESTE), ['teste']);
  assert.deepEqual(tipoDe(NOTA_SEGREDO), ['segredo']);
  assert.deepEqual(tipoDe(NOTA_FALA), ['fala']);
  assert.deepEqual(tipoDe(NOTA_LOOT), ['loot']);
  assert.ok(analisarMarcadores(NOTA_LIGACAO).some(t => t.tipo === 'ligacao' && /Joana/.test(t.bruto)));
  // Cada passo de marcador da lição pede um texto que bate com a condição dele (e o texto vem no `valores`).
  const lic = quadro.find(l => l.id === 'quadro-notas')!;
  const pedidos = lic.passos.flatMap(p => condicoesDe(p.feito).filter(c => c[0] === 'marcador').map(c => ({ tipo: String(c[1]), p })));
  assert.deepEqual(pedidos.map(x => x.tipo), ['teste', 'segredo', 'fala', 'loot']);
  for (const { tipo, p } of pedidos) {
    const texto = ({ teste: NOTA_TESTE, segredo: NOTA_SEGREDO, fala: NOTA_FALA, loot: NOTA_LOOT } as Record<string, string>)[tipo]!;
    assert.ok(p.valores?.includes(texto) && p.diga.includes(texto), `passo de ${tipo} traz o texto`);
    assert.ok(tipoDe(texto).includes(tipo));
  }
});

/** O id existe como `data-testid="id"` ou como o começo de um template (`data-testid={\`ferramenta-${f.id}\`}`). */
const prefixosDeTemplate = [...fonteDaUi.matchAll(/data-testid=\{`([^`$]*)\$\{/g)].map(m => m[1]!);
const testidExiste = (id: string, prefixo: boolean): boolean => fonteDaUi.includes(`data-testid="${id}"`) || prefixosDeTemplate.some(p => id.startsWith(p)) || (prefixo && (fonteDaUi.includes(`data-testid="${id}`) || prefixosDeTemplate.some(p => p.startsWith(id))));

test('todo alvo data-testid existe na interface (prefixos de template aceitos)', () => {
  for (const l of visiveis) for (const [i, p] of l.passos.entries()) {
    if (!p.alvo) continue;
    const m = /^\[data-testid(\^)?="([^"]+)"\]$/.exec(p.alvo); assert.ok(m, `${l.id} passo ${i + 1}: alvo ${p.alvo} não é um data-testid`);
    assert.ok(testidExiste(m[2]!, !!m[1]), `${l.id} passo ${i + 1}: ${m[2]} não aparece em src/ui`);
  }
});

test('as ações dos passos apontam para testids que existem', () => {
  for (const l of visiveis) for (const p of l.passos) for (const a of p.acao ? (Array.isArray(p.acao[0]) ? p.acao : [p.acao]) as readonly (readonly string[])[] : []) {
    const m = /data-testid="([^"]+)"/.exec(a[1] ?? ''); if (m) assert.ok(testidExiste(m[1]!, false), m[1]);
  }
});

test('a semente de quadro-ligacoes tem a moldura com duas notas e três em revisão', () => {
  const s = quadro.find(l => l.id === 'quadro-ligacoes')!.semente!, itens = s.quadro!.itens!;
  assert.deepEqual(s.entidades?.map(e => `${e.tipo}:${e.nome}`), ['personagem:Joana', 'lugar:Casa abandonada', 'pista:Carta rasgada']);
  assert.equal(itens.filter(i => i.tipo === 'moldura' && i.titulo === 'Casa abandonada').length, 1);
  assert.equal(itens.filter(i => i.molduraDe === 'Casa abandonada').length, 2);
  assert.equal(itens.filter(i => i.revisao?.origem === 'miro').length, 3);
  assert.equal(s.tela, 'quadros'); assert.equal(s.abrirQuadro, true);
});

test('sessao-ao-vivo: a semente liga a cena à Casa abandonada, não abre o quadro e os passos seguem a ordem da tela', () => {
  const l = LICOES.find(x => x.id === 'sessao-ao-vivo')!, s = l.semente!;
  assert.equal(l.pasta, 'sessao');
  assert.ok(s.entidades?.some(e => e.tipo === 'cena' && e.nome === 'Chegada à casa'));
  assert.deepEqual(s.ligacoes?.map(x => `${x.de}>${x.tipo}>${x.para}`), ['Chegada à casa>esta-em>Casa abandonada', 'Joana>aparece-em>Chegada à casa']);
  for (const x of s.ligacoes!) for (const n of [x.de, x.para]) assert.ok(s.entidades!.some(e => e.nome === n), `ligação cita ${n}`);
  assert.ok(!s.abrirQuadro, 'o quadro abre pelo painel, para o passo do seletor fazer sentido');
  assert.equal(s.quadro?.itens?.filter(i => i.tipo === 'moldura' && i.titulo === 'Casa abandonada').length, 1);
  assert.deepEqual(l.passos.map(p => p.feito[0]), ['tela', 'preset', 'sessaoGravando', 'registro', 'ler', 'modoFoco', 'ler', 'cenaAtivada', 'ler', 'sessaoParada']);
});

test('campanha-cena: a semente traz a cena sem ligações e os passos seguem a ordem da tela', () => {
  const l = LICOES.find(x => x.id === 'campanha-cena')!, s = l.semente!;
  assert.equal(l.pasta, 'campanha'); assert.equal(l.proxima, 'online-caminho');
  assert.deepEqual(s.entidades?.map(e => `${e.tipo}:${e.nome}`), ['personagem:Joana', 'lugar:Casa abandonada', 'pista:Carta rasgada', 'cena:Chegada à casa']);
  assert.ok(!s.ligacoes?.length);
  assert.deepEqual(l.passos.map(p => p.feito[0]), ['selecionada', 'cenaCom', 'cenaCom', 'buscaRapida', 'selecionada', 'menuContexto', 'ler']);
  assert.deepEqual(l.passos.filter(p => p.feito[0] === 'cenaCom').map(p => p.feito[1]), ['pista', 'personagem']);
});

test('online-caminho: só leitura depois de abrir a aba, sem alvo em controle que exige login', () => {
  const l = LICOES.find(x => x.id === 'online-caminho')!;
  assert.deepEqual(l.passos.map(p => p.feito[0]), ['tela', 'ler', 'ler', 'ler', 'ler', 'ler']);
  const semLogin = ['[data-testid="aba-online"]', '[data-testid="online-entrar"]'];
  for (const p of l.passos) if (p.alvo) assert.ok(semLogin.includes(p.alvo), `alvo ${p.alvo} só existe logado`);
  assert.ok(l.passos.some(p => /anônima/.test(p.diga)));
});
