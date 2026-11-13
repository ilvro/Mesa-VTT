import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docDeTexto,
  novaSeta,
  novoTexto,
  type Item,
} from '../../src/dominio/quadro.ts';
import {
  aplicar,
  descerUm,
  duplicar,
  Historico,
  inverter,
  levarParaTras,
  subirUm,
  trazerParaFrente,
  type Passo,
} from '../../src/dominio/quadro-operacoes.ts';

function mapaDe(...itens: Item[]): Map<string, Item> {
  return new Map(itens.map((i) => [i.id, i]));
}

test('aplicar + inverter restauram estado inicial em criar, alterar e remover', () => {
  const a = novoTexto({ quadroId: 'q', x: 10, y: 20, z: 1, doc: docDeTexto('A') }, 100, 'a');
  const b = novoTexto({ quadroId: 'q', x: 30, y: 40, z: 2, doc: docDeTexto('B') }, 100, 'b');
  const inicial = mapaDe(a);

  const passoCriar: Passo = { rotulo: 'Criar', ops: [{ criar: [b] }] };
  const aposCriar = aplicar(inicial, passoCriar);
  assert.equal(aposCriar.size, 2);
  assert.deepEqual(aplicar(aposCriar, inverter(passoCriar)), inicial);
  // imutabilidade: mapa inicial e item 'a' preservados
  assert.equal(inicial.size, 1);
  assert.equal(aposCriar.get('a'), a);

  const passoAlterar: Passo = {
    rotulo: 'Mover',
    ops: [{ alterar: [{ id: 'a', antes: { x: 10, y: 20 }, depois: { x: 99, y: 88 } }] }],
  };
  const aposAlterar = aplicar(aposCriar, passoAlterar);
  assert.equal(aposAlterar.get('a')?.x, 99);
  assert.deepEqual(aplicar(aposAlterar, inverter(passoAlterar)), aposCriar);

  const passoRemover: Passo = { rotulo: 'Remover', ops: [{ remover: [b] }] };
  const aposRemover = aplicar(aposCriar, passoRemover);
  assert.equal(aposRemover.size, 1);
  assert.deepEqual(aplicar(aposRemover, inverter(passoRemover)), aposCriar);
});

test('Historico: respeita limite de 200 passos e agrupa passos consecutivos pela chave', () => {
  const h = new Historico();
  assert.equal(h.limite, 200);

  // Agrupamento de arrasto
  h.agrupar('arrasto-1');
  h.registrar({
    rotulo: 'Mover',
    ops: [{ alterar: [{ id: 'a', antes: { x: 0 }, depois: { x: 10 } }] }],
  });
  h.registrar({
    rotulo: 'Mover',
    ops: [{ alterar: [{ id: 'a', antes: { x: 10 }, depois: { x: 45 } }] }],
  });
  h.agrupar(null);

  assert.equal(h.tamanho, 1);
  const desfeito = h.desfazer()!;
  assert.deepEqual(desfeito.ops, [{ alterar: [{ id: 'a', antes: { x: 45 }, depois: { x: 0 } }] }]);
  const refeito = h.refazer()!;
  assert.deepEqual(refeito.ops, [{ alterar: [{ id: 'a', antes: { x: 0 }, depois: { x: 45 } }] }]);

  // Limite de 200
  h.limpar();
  for (let i = 0; i < 250; i++) {
    h.registrar({
      rotulo: `Passo ${i}`,
      ops: [{ alterar: [{ id: 'a', antes: { x: i }, depois: { x: i + 1 } }] }],
    });
  }
  assert.equal(h.tamanho, 200);
});

test('z-order: trazerParaFrente, levarParaTras, subirUm e descerUm', () => {
  const a = novoTexto({ quadroId: 'q', x: 0, y: 0, z: 1 }, 100, 'a');
  const b = novoTexto({ quadroId: 'q', x: 0, y: 0, z: 2 }, 100, 'b');
  const c = novoTexto({ quadroId: 'q', x: 0, y: 0, z: 3 }, 100, 'c');
  const m = mapaDe(a, b, c);

  const ordem = (mapa: ReadonlyMap<string, Item>) =>
    [...mapa.values()].sort((x, y) => x.z - y.z).map((x) => x.id);

  assert.deepEqual(ordem(aplicar(m, trazerParaFrente(m, ['a']))), ['b', 'c', 'a']);
  assert.deepEqual(ordem(aplicar(m, levarParaTras(m, ['c']))), ['c', 'a', 'b']);
  assert.deepEqual(ordem(aplicar(m, subirUm(m, ['a']))), ['b', 'a', 'c']);
  assert.deepEqual(ordem(aplicar(m, descerUm(m, ['c']))), ['a', 'c', 'b']);
});

test('duplicar: desloca itens e religa setas entre itens duplicados para as cópias', () => {
  const a = novoTexto({ quadroId: 'q', x: 10, y: 10, z: 1 }, 100, 'a');
  const b = novoTexto({ quadroId: 'q', x: 100, y: 10, z: 2 }, 100, 'b');
  const ext = novoTexto({ quadroId: 'q', x: 300, y: 10, z: 3 }, 100, 'ext');
  const s1 = novaSeta(
    { quadroId: 'q', de: { itemId: 'a', lado: 'direita' }, para: { itemId: 'b', lado: 'esquerda' }, z: 4 },
    100,
    's1',
  );
  const s2 = novaSeta(
    { quadroId: 'q', de: { itemId: 'a', lado: 'baixo' }, para: { itemId: 'ext', lado: 'cima' }, z: 5 },
    100,
    's2',
  );
  const s3 = novaSeta(
    { quadroId: 'q', de: { ponto: [5, 5] }, para: { ponto: [15, 25] }, z: 6 },
    100,
    's3',
  );

  let seq = 0;
  const passo = duplicar([a, b, s1, s2, s3], () => `copia-${++seq}`, { dx: 20, dy: 30 }, { agora: 200 });
  const criados = (passo.ops[0] as { criar: Item[] }).criar;
  assert.equal(criados.length, 5);

  const porId = new Map(criados.map((i) => [i.id, i]));
  const aCopia = porId.get('copia-1')!;
  const bCopia = porId.get('copia-2')!;
  assert.equal(aCopia.x, 30);
  assert.equal(aCopia.y, 40);
  assert.equal(bCopia.x, 120);

  const s1Copia = porId.get('copia-3') as Extract<Item, { tipo: 'seta' }>;
  assert.deepEqual(s1Copia.de, { itemId: 'copia-1', lado: 'direita' });
  assert.deepEqual(s1Copia.para, { itemId: 'copia-2', lado: 'esquerda' });

  const s2Copia = porId.get('copia-4') as Extract<Item, { tipo: 'seta' }>;
  assert.deepEqual(s2Copia.de, { itemId: 'copia-1', lado: 'baixo' });
  // 'ext' não foi duplicado, então continua apontando para 'ext'
  assert.deepEqual(s2Copia.para, { itemId: 'ext', lado: 'cima' });

  const s3Copia = porId.get('copia-5') as Extract<Item, { tipo: 'seta' }>;
  assert.deepEqual(s3Copia.de, { ponto: [25, 35] });
  assert.deepEqual(s3Copia.para, { ponto: [35, 55] });
  void ext;
});
