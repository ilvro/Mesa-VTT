import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarPacote, lerPacote, prepararImportacao } from '../../src/dominio/pacote-quadro.ts';
import { assinaturaDoAlvo, resumosParaOMapa, type ResumoGuardado } from '../../src/dominio/resumos-do-quadro.ts';
import type { Item } from '../../src/dominio/quadro.ts';
import { novaImagem, novaMoldura, novaNotaAdesiva, novoQuadro } from '../../src/dominio/quadro.ts';
import { secoesDoQuadro } from '../../src/dominio/secoes-do-quadro.ts';

const doc = (t: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const itens = (): Item[] => [
  { ...novaMoldura({ quadroId: 'q1', x: 0, y: 0, largura: 600, altura: 400, titulo: 'Cap' }, 1, 'm1'), molduraId: null } as Item,
  { ...novaNotaAdesiva({ quadroId: 'q1', x: 10, y: 10, largura: 100, altura: 100, doc: doc('texto') }, 1, 'n1'), molduraId: 'm1' } as Item,
  { ...novaImagem({ quadroId: 'q1', x: 200, y: 10, imagemId: 'hash1', larguraOriginal: 10, alturaOriginal: 10 }, 1, 'i1'), molduraId: 'm1' } as Item,
  // ilha solta, longe
  { ...novaNotaAdesiva({ quadroId: 'q1', x: 5000, y: 5000, largura: 100, altura: 100, doc: doc('Ilha título') }, 1, 'n9'), semantica: 'titulo' } as Item,
  { ...novaNotaAdesiva({ quadroId: 'q1', x: 5010, y: 5120, largura: 100, altura: 100, doc: doc('Outro') }, 1, 'n10') } as Item,
];

test('resumosParaOMapa: marca desatualizado, descrições por item, ignora alvo que sumiu', () => {
  const its = itens();
  const sec = secoesDoQuadro(its);
  const sig = assinaturaDoAlvo('m1', sec, its)!;
  const reg = (alvo: string, assinatura: string): ResumoGuardado => ({ alvo, texto: `t-${alvo}`, assinatura, autor: 'assistente', em: 1 });
  const { resumos, descricoes } = resumosParaOMapa([reg('m1', sig), reg('item:i1', 'hash1'), reg('item:n1', 'x'), reg('zzz', 'x'), reg('ilha:n9', 'velha')], sec, its);
  assert.equal(resumos.get('m1')!.desatualizado, false);
  assert.equal(resumos.get('item:i1')!.desatualizado, false);
  assert.equal(resumos.has('item:n1'), false); // não é imagem
  assert.equal(resumos.has('zzz'), false);
  assert.equal(resumos.get('ilha:n9')!.desatualizado, true);
  assert.equal(descricoes.get('i1'), 't-item:i1');
});

test('pacote: resumos vão no pacote, pacote antigo continua válido e a importação remapeia os alvos', () => {
  const its = itens();
  const sec = secoesDoQuadro(its);
  const quadro = novoQuadro('c1', 'Q', 1, 'q1');
  const g = (alvo: string, assinatura: string): ResumoGuardado => ({ alvo, texto: alvo, assinatura, autor: 'mestre', em: 5 });
  const resumos = [
    g('m1', assinaturaDoAlvo('m1', sec, its)!),
    g('ilha:n9', assinaturaDoAlvo('ilha:n9', sec, its)!),
    g('item:i1', 'hash1'),
    g('m1-velho', 'x'),
  ];
  assert.equal(lerPacote(montarPacote(quadro, its)).resumos, undefined);
  const pacote = lerPacote(montarPacote(quadro, its, [...resumos.slice(0, 3), { ...resumos[0]!, alvo: 'item:fantasma' }]));
  assert.equal(pacote.resumos!.length, 4);
  let seq = 0;
  const r = prepararImportacao(pacote, { campanhaId: 'c2', nomesExistentes: [], novoId: () => `novo-${++seq}`, agora: 9 });
  const novoId = (antigo: string) => r.itens[its.findIndex((i) => i.id === antigo)]!.id;
  const alvos = r.resumos.map((x) => x.alvo).sort();
  assert.deepEqual(alvos, [novoId('m1'), `ilha:${novoId('n9')}`, `item:${novoId('i1')}`].sort());
  for (const x of r.resumos) assert.equal(x.quadroId, r.quadro.id);
  // em dia no pacote → em dia depois de importar (assinatura recalculada com os ids novos)
  const novasSec = secoesDoQuadro(r.itens);
  for (const x of r.resumos) assert.equal(assinaturaDoAlvo(x.alvo, novasSec, r.itens), x.assinatura, x.alvo);
  assert.ok(r.resumos.every((x) => x.autor === 'mestre' && x.em === 5));
});

test('pacote: resumo já desatualizado continua desatualizado ao importar', () => {
  const its = itens();
  const quadro = novoQuadro('c1', 'Q', 1, 'q1');
  const pacote = lerPacote(montarPacote(quadro, its, [{ alvo: 'm1', texto: 'x', assinatura: 'velha', autor: 'assistente', em: 1 }]));
  let seq = 0;
  const r = prepararImportacao(pacote, { campanhaId: 'c2', nomesExistentes: [], novoId: () => `n-${++seq}`, agora: 1 });
  assert.equal(r.resumos[0]!.assinatura, 'velha');
});
