import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaNotaAdesiva, novaSeta } from '../../src/dominio/quadro.ts';
import { colar, copiar } from '../../src/dominio/area-de-transferencia.ts';

test('copiar e colar geram novos ids, preservam grupo e religam setas entre itens copiados', () => {
  const n1 = { ...novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 0 }, 1, 'n1'), grupoId: 'g1' };
  const n2 = { ...novaNotaAdesiva({ quadroId: 'q1', x: 300, y: 0 }, 1, 'n2'), grupoId: 'g1' };
  const s1 = novaSeta(
    {
      quadroId: 'q1',
      de: { itemId: 'n1', lado: 'direita' },
      para: { itemId: 'n2', lado: 'esquerda' },
      x: 200,
      y: 100,
      largura: 100,
      altura: 20,
    },
    1,
    's1',
  );

  const texto = copiar([n1, n2, s1]);
  let seq = 1;
  const colados = colar(
    texto,
    () => `novo-${seq++}`,
    { quadroId: 'q2', centro: { x: 1000, y: 1000 } },
    500,
  );

  assert.ok(colados);
  assert.equal(colados.length, 3);

  const c1 = colados[0]!;
  const c2 = colados[1]!;
  const cs = colados[2]!;

  assert.notEqual(c1.id, 'n1');
  assert.notEqual(c2.id, 'n2');
  assert.equal(c1.quadroId, 'q2');
  assert.ok(c1.grupoId && c1.grupoId !== 'g1');
  assert.equal(c1.grupoId, c2.grupoId);

  assert.equal(cs.tipo, 'seta');
  if (cs.tipo === 'seta') {
    assert.deepEqual(cs.de, { itemId: c1.id, lado: 'direita' });
    assert.deepEqual(cs.para, { itemId: c2.id, lado: 'esquerda' });
  }
});

test('colar texto comum sem prefixo retorna null', () => {
  assert.equal(
    colar('apenas um texto', () => 'x', { quadroId: 'q1', centro: { x: 0, y: 0 } }),
    null,
  );
});
