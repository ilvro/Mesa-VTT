import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ref } from '#mesa';
import { acrescentar, ehRepeticao, exportarMarkdown, formatarLinha, horaDe, lerRegistro, textoDoFato } from '../../src/dominio/registro.ts';

const ficha: Ref = { app: 'ficha', tipo: 'ficha', id: 's1' }, mapa: Ref = { app: 'atlas', tipo: 'mapa', id: 'm1' };
const cena: Ref = { app: 'jukebox', tipo: 'cena-sonora', id: 'chuva' }, doc: Ref = { app: 'atelie', tipo: 'documento', id: 'd1' };
const nomes: Record<string, string> = { 's1': 'Muirenn', 'm1': 'Casa dos Salgueiros', 'chuva': 'Chuva forte', 'd1': 'Carta queimada' };
const nome = (r: Ref) => nomes[r.id];
const semNomes = () => undefined;

const tabela: [string, { tipo: string; dados: unknown }, string | null, ((r: Ref) => string | undefined)?][] = [
  ['rolagem', { tipo: 'ficha.rolagem', dados: { ficha, titulo: 'Investigação', total: 17 } }, 'Muirenn rolou Investigação: 17'],
  ['rolagem com modificador (o total já vale)', { tipo: 'ficha.rolagem', dados: { ficha, titulo: 'Luta', total: 9, modificador: 2 } }, 'Muirenn rolou Luta: 9'],
  ['rolagem de ficha desconhecida', { tipo: 'ficha.rolagem', dados: { ficha, titulo: 'Físico', total: 4 } }, 'Uma ficha rolou Físico: 4', semNomes],
  ['rolagem sem total ou sem título', { tipo: 'ficha.rolagem', dados: { ficha, titulo: 'Luta' } }, null],
  ['rolagem com total inválido', { tipo: 'ficha.rolagem', dados: { ficha, titulo: 'Luta', total: NaN } }, null],
  ['mapa aberto', { tipo: 'atlas.cena-aberta', dados: { mapa } }, 'Mapa aberto: Casa dos Salgueiros'],
  ['mapa aberto sem nome conhecido', { tipo: 'atlas.cena-aberta', dados: { mapa } }, 'Mapa aberto: sem nome', semNomes],
  ['região entrou, com o nome e a peça', { tipo: 'atlas.regiao-entrou', dados: { mapa, regiao: { app: 'atlas', tipo: 'regiao', id: 'm1/r1' }, nome: 'Biblioteca', peca: 'Muirenn' } }, 'Muirenn entrou em Biblioteca (Casa dos Salgueiros)'],
  ['região entrou, sem os nomes opcionais', { tipo: 'atlas.regiao-entrou', dados: { mapa, regiao: { app: 'atlas', tipo: 'regiao', id: 'm1/r1' } } }, 'Uma peça entrou em uma região (Casa dos Salgueiros)'],
  ['revelado com nome', { tipo: 'atlas.revelado', dados: { mapa, alvo: { app: 'atlas', tipo: 'abertura', id: 'm1/p1' }, nome: 'Porta secreta' } }, 'Revelado aos jogadores: Porta secreta'],
  ['revelado sem nome: usa o tipo', { tipo: 'atlas.revelado', dados: { mapa, alvo: { app: 'atlas', tipo: 'comodo', id: 'm1/c1' } } }, 'Revelado aos jogadores: Cômodo'],
  ['revelado de tipo desconhecido', { tipo: 'atlas.revelado', dados: { mapa, alvo: { app: 'atlas', tipo: 'xyz', id: 'm1/x' } } }, 'Revelado aos jogadores: algo'],
  ['documento salvo', { tipo: 'atelie.documento-salvo', dados: { documento: doc, revisao: 3 } }, 'Carta queimada salvo no Ateliê (revisão 3)'],
  ['documento salvo sem revisão nem nome', { tipo: 'atelie.documento-salvo', dados: { documento: doc } }, 'Documento do Ateliê salvo no Ateliê', semNomes],
  ['tocando', { tipo: 'jukebox.tocando', dados: { cena } }, 'Tocando: Chuva forte'],
  ['tocando sem nome', { tipo: 'jukebox.tocando', dados: { cena } }, 'Tocando: uma cena sonora', semNomes],
  ['música parada', { tipo: 'jukebox.tocando', dados: { cena: null } }, 'Música parada'],
  ['recursos não se registram', { tipo: 'ficha.recursos', dados: { ficha, pv: 3, pvMax: 9, pd: 2, pdMax: 9 } }, null],
  ['tipo desconhecido', { tipo: 'outra.coisa', dados: {} }, null],
  ['dados que não são objeto', { tipo: 'atlas.cena-aberta', dados: 'x' }, null],
  ['ref inválida', { tipo: 'atlas.cena-aberta', dados: { mapa: { app: 'xx' } } }, null],
];
for (const [titulo, fato, esperado, resolver] of tabela) test(`textoDoFato: ${titulo}`, () => assert.equal(textoDoFato(fato, resolver ?? nome), esperado));

test('horaDe e formatarLinha: HH:MM local, anotação com “>”, quebras de linha viram espaço', () => {
  assert.equal(horaDe(new Date(2026, 10, 5, 9, 5).getTime()), '09:05');
  assert.equal(formatarLinha({ hora: '19:42', texto: 'Muirenn rolou Luta: 9', nota: false }), '[19:42] Muirenn rolou Luta: 9');
  assert.equal(formatarLinha({ hora: '19:50', texto: 'A porta\nrangeu', nota: true }), '[19:50] > A porta rangeu');
});

test('lerRegistro: lê as linhas de volta; texto fora do formato fica sem hora; vazias somem', () => {
  const t = '[19:42] Muirenn rolou Luta: 9\n\n[19:50] > A porta rangeu\nlinha solta\n[7:5] mal formada\n';
  assert.deepEqual(lerRegistro(t), [
    { hora: '19:42', texto: 'Muirenn rolou Luta: 9', nota: false }, { hora: '19:50', texto: 'A porta rangeu', nota: true },
    { hora: '', texto: 'linha solta', nota: false }, { hora: '', texto: '[7:5] mal formada', nota: false },
  ]);
  assert.deepEqual(lerRegistro(''), []);
});

test('acrescentar: junta linhas, ignora texto vazio, e descarta as mais antigas ao passar do limite', () => {
  let r = '';
  r = acrescentar(r, { hora: '19:00', texto: 'um', nota: false }); r = acrescentar(r, { hora: '19:01', texto: 'dois', nota: true });
  assert.equal(r, '[19:00] um\n[19:01] > dois');
  assert.equal(acrescentar(r, { hora: '19:02', texto: '   ', nota: false }), r);
  const curto = acrescentar(acrescentar(acrescentar('', { hora: '19:00', texto: 'aaaaaaaaaa', nota: false }, 40), { hora: '19:01', texto: 'bbbbbbbbbb', nota: false }, 40), { hora: '19:02', texto: 'cccccccccc', nota: false }, 40);
  assert.ok(curto.length <= 40 && curto.includes('cccccccccc') && !curto.includes('aaaaaaaaaa'), curto);
});

test('ehRepeticao: o mesmo texto dentro da janela repete; texto diferente ou fora da janela não', () => {
  assert.equal(ehRepeticao(null, 'x', 100), false);
  assert.equal(ehRepeticao({ texto: 'x', em: 100 }, 'x', 900), true);
  assert.equal(ehRepeticao({ texto: 'x', em: 100 }, 'x', 3000), false);
  assert.equal(ehRepeticao({ texto: 'x', em: 100 }, 'y', 200), false);
});

test('exportarMarkdown: título, data, roteiro numerado com notas e o registro com as anotações em destaque', () => {
  const md = exportarMarkdown({ nome: 'Noite na ilha', dataTexto: '5 de novembro de 2026', roteiro: [{ nome: 'Casa dos Salgueiros', onde: 'Atlas · mapa', nota: 'Começar pela chuva\nMostrar o bilhete' }, { nome: 'Chuva forte', onde: 'Jukebox · cena sonora', nota: '' }], registro: '[19:42] Muirenn rolou Luta: 9\n[19:50] > A porta rangeu\nsolta' });
  assert.equal(md, [
    '# Noite na ilha', '', '*5 de novembro de 2026*', '', '## Roteiro', '',
    '1. **Casa dos Salgueiros** — Atlas · mapa', '   > Começar pela chuva', '   > Mostrar o bilhete', '2. **Chuva forte** — Jukebox · cena sonora',
    '', '## Registro', '', '- 19:42 Muirenn rolou Luta: 9', '- 19:50 **Nota:** A porta rangeu', '- solta', '',
  ].join('\n'));
  const vazio = exportarMarkdown({ nome: '', dataTexto: 'hoje', roteiro: [], registro: '' });
  assert.match(vazio, /# Sessão/); assert.match(vazio, /_Sem roteiro\._/); assert.match(vazio, /_Nada registrado\._/);
});
