import assert from 'node:assert/strict';
import { test } from 'node:test';
import { novaImagem, novaNotaAdesiva, novaSeta, novoQuadro } from '../../src/dominio/quadro.ts';
import {
  imagensDoPacote,
  lerPacote,
  montarPacote,
  nomeDoArquivo,
  nomeParaImportar,
  prepararImportacao,
} from '../../src/dominio/pacote-quadro.ts';

function exemplo() {
  const quadro = {
    ...novoQuadro('c1', 'Lysdal', 1, 'q1'),
    origem: { miroBoardId: 'b1', sincronizadoEm: 5, vistos: ['m1'] },
  };
  const n1 = {
    ...novaNotaAdesiva({ quadroId: 'q1', x: 0, y: 0 }, 1, 'n1'),
    grupoId: 'g1',
    origem: { miro: 'm1', assinatura: 'abc' },
  };
  const n2 = { ...novaNotaAdesiva({ quadroId: 'q1', x: 300, y: 40 }, 1, 'n2'), grupoId: 'g1' };
  const s1 = novaSeta(
    { quadroId: 'q1', de: { itemId: 'n1', lado: 'direita' }, para: { itemId: 'n2', lado: 'esquerda' }, x: 200, y: 100, largura: 100, altura: 20 },
    1,
    's1',
  );
  const img = novaImagem({ quadroId: 'q1', x: 0, y: 400, largura: 100, altura: 80, imagemId: 'hash1', larguraOriginal: 100, alturaOriginal: 80 }, 1, 'i1');
  return { quadro, itens: [n1, n2, s1, img] };
}

test('exportar e importar dá o mesmo quadro com ids novos', () => {
  const { quadro, itens } = exemplo();
  const pacote = lerPacote(montarPacote(quadro, itens));
  let seq = 0;
  const r = prepararImportacao(pacote, { campanhaId: 'c2', nomesExistentes: [], novoId: () => `novo-${++seq}`, agora: 99 });

  assert.equal(r.quadro.campanhaId, 'c2');
  assert.notEqual(r.quadro.id, 'q1');
  assert.equal(r.quadro.nome, 'Lysdal');
  assert.deepEqual(r.quadro.origem, quadro.origem);
  assert.equal(r.itens.length, 4);
  const ids = new Set(r.itens.map((i) => i.id));
  assert.equal(ids.size, 4);
  for (const it of r.itens) {
    assert.equal(it.quadroId, r.quadro.id);
    assert.ok(!['n1', 'n2', 's1', 'i1'].includes(it.id));
  }
  const [a, b, s, im] = r.itens;
  assert.equal(a!.x, 0);
  assert.equal(b!.x, 300);
  assert.equal(a!.grupoId, b!.grupoId);
  assert.notEqual(a!.grupoId, 'g1');
  assert.deepEqual(a!.origem, { miro: 'm1', assinatura: 'abc' });
  assert.equal(s!.tipo, 'seta');
  if (s!.tipo === 'seta') {
    assert.deepEqual(s!.de, { itemId: a!.id, lado: 'direita' });
    assert.deepEqual(s!.para, { itemId: b!.id, lado: 'esquerda' });
  }
  assert.equal(im!.tipo === 'imagem' && im!.imagemId, 'hash1');
  assert.deepEqual(imagensDoPacote(itens), ['hash1']);
});

test('nome ganha (cópia) só se já existe', () => {
  assert.equal(nomeParaImportar('Lysdal', ['lysdal']), 'Lysdal (cópia)');
  assert.equal(nomeParaImportar('Lysdal', ['Outro']), 'Lysdal');
});

test('nome de arquivo é sanitizado', () => {
  assert.equal(nomeDoArquivo('A/B: "c"'), 'A B c.mesa-quadro.zip');
  assert.equal(nomeDoArquivo('  '), 'quadro.mesa-quadro.zip');
});

test('pacote inválido é recusado com mensagem clara', () => {
  const { quadro, itens } = exemplo();
  assert.throws(() => lerPacote('{'), /malformado/);
  assert.throws(() => lerPacote('{"formato":"outro"}'), /não é um pacote/);
  assert.throws(() => lerPacote(JSON.stringify({ formato: 'mesa-quadro', versao: 2 })), /Versão de pacote/);
  assert.throws(() => lerPacote(JSON.stringify({ formato: 'mesa-quadro', versao: 1, quadro: {}, itens: [] })), /inválido/);
  assert.throws(() => lerPacote(JSON.stringify({ formato: 'mesa-quadro', versao: 1, quadro })), /faltam os itens/);
  assert.throws(
    () => lerPacote(JSON.stringify({ formato: 'mesa-quadro', versao: 1, quadro, itens: [{ ...itens[0], tipo: 'xyz' }] })),
    /itens\[0\]/,
  );
});

test('quadro sem itens importa vazio', () => {
  const { quadro } = exemplo();
  const r = prepararImportacao(lerPacote(montarPacote(quadro, [])), { campanhaId: 'c1', nomesExistentes: ['Lysdal'], novoId: () => 'x', agora: 1 });
  assert.equal(r.itens.length, 0);
  assert.equal(r.quadro.nome, 'Lysdal (cópia)');
});
