import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alternarEmpilhamentoPainel,
  alternarPainel,
  aplicarPresetLayout,
  ESCALA_MINIMA,
  escalaDoPainel,
  LARGURA_LOGICA_MINIMA,
  LAYOUT_PADRAO,
  lerLayout,
  moverColuna,
  moverPainel,
  painelVisivel,
  PRESETS,
  presetDe,
  redimensionar,
  redimensionarPilhaVertical,
  separarPainelEmColuna,
  visiveis,
  type Layout,
} from '../../src/dominio/layout.ts';

const somaColunas = (l: Layout) => l.colunas.reduce((a, c) => a + c.peso, 0);
const pesoColuna = (l: Layout, id: string) => l.colunas.find(c => c.paineis.includes(id as never))!.peso;

test('presets: cada um tem ao menos um painel visível e o padrão é o inicial', () => {
  for (const [id, l] of Object.entries(PRESETS)) {
    const todos = [...l.colunas.flatMap(c => c.paineis), ...l.ocultos];
    assert.equal(todos.length, 5, id);
    assert.equal(new Set(todos).size, 5, id);
    assert.ok(visiveis(l).length >= 1, id);
  }
  assert.equal(LAYOUT_PADRAO, PRESETS.padrao);
  assert.deepEqual(visiveis(PRESETS['so-mapa']).map(p => p.id), ['atlas']);
  assert.deepEqual(visiveis(PRESETS['mapa-e-fichas']).map(p => p.id), ['atlas', 'fichas']);
  assert.deepEqual(visiveis(PRESETS['com-quadro']).map(p => p.id), ['atlas', 'fichas', 'quadro']);
  assert.deepEqual(visiveis(PRESETS['com-diario']).map(p => p.id), ['atlas', 'fichas', 'diario']);
  assert.deepEqual(visiveis(PRESETS.padrao).map(p => p.id), ['atlas', 'fichas', 'jukebox']);
  assert.equal(PRESETS['mapa-lateral'].colunas.length, 2);
  assert.deepEqual(PRESETS['mapa-lateral'].colunas[1]!.paineis, ['fichas', 'jukebox']);
  assert.equal(aplicarPresetLayout('mapa-foco'), PRESETS['so-mapa']);
});

test('presetDe: reconhece o preset (mesmo em outra escala) e devolve null para um ajuste à mão', () => {
  assert.equal(presetDe(PRESETS['mapa-grande']), 'mapa-grande');
  assert.equal(presetDe(PRESETS['mapa-lateral']), 'mapa-lateral');
  assert.equal(presetDe({ ...PRESETS.padrao, colunas: PRESETS.padrao.colunas.map(c => ({ ...c, peso: c.peso * 10 })) }), 'padrao');
  assert.equal(presetDe(redimensionar(PRESETS.padrao, 0, 150, 1200)), null);
});

test('redimensionar: arrastar o divisor para a direita cresce a coluna da esquerda e encolhe a da direita', () => {
  const antes = PRESETS.padrao, depois = redimensionar(antes, 0, 100, 1220);
  assert.ok(Math.abs(pesoColuna(depois, 'atlas') - (3 + 0.5)) < 1e-9);
  assert.ok(Math.abs(pesoColuna(depois, 'fichas') - (2 - 0.5)) < 1e-9);
  assert.equal(pesoColuna(depois, 'jukebox'), 1.1);
  assert.ok(Math.abs(somaColunas(depois) - somaColunas(antes)) < 1e-9);
});

test('redimensionar: respeita a largura mínima dos dois lados', () => {
  const l = PRESETS.padrao;
  const muito = redimensionar(l, 1, 5000, 1220);
  assert.ok(Math.abs(pesoColuna(muito, 'jukebox') * 200 - 200) < 1e-6);
  const pouco = redimensionar(l, 1, -5000, 1220);
  assert.ok(Math.abs(pesoColuna(pouco, 'fichas') * 200 - 200) < 1e-6);
  assert.ok(Math.abs(somaColunas(muito) - somaColunas(l)) < 1e-9 && Math.abs(somaColunas(pouco) - somaColunas(l)) < 1e-9);
});

test('redimensionar: índices ou larguras inválidos não mudam nada; quando não cabe no mínimo divide por igual', () => {
  const l = PRESETS['mapa-e-fichas'], depois = redimensionar(l, 0, 100, 1000);
  assert.ok(pesoColuna(depois, 'atlas') > 3 && pesoColuna(depois, 'fichas') < 2);
  assert.equal(redimensionar(l, 1, 100, 1000), l);
  assert.equal(redimensionar(l, 5, 100, 1000), l);
  assert.equal(redimensionar(l, 0, 100, 0), l);
  assert.equal(redimensionar(PRESETS['so-mapa'], 0, 100, 1000), PRESETS['so-mapa']);

  const apertado = redimensionar(PRESETS.padrao, 0, 10, 300);
  assert.ok(pesoColuna(apertado, 'atlas') > 0 && pesoColuna(apertado, 'fichas') > 0);
  assert.ok(Math.abs(somaColunas(apertado) - somaColunas(PRESETS.padrao)) < 1e-9);
});

test('redimensionarPilhaVertical: ajusta alturas relativas respeitando mínimo vertical', () => {
  const l = PRESETS['mapa-lateral'];
  const depois = redimensionarPilhaVertical(l, 1, 0, 50, 1000);
  const col = depois.colunas[1]!;
  assert.ok(col.alturas.fichas! > 0.55 && col.alturas.jukebox! < 0.45);
  assert.ok(Math.abs((col.alturas.fichas! + col.alturas.jukebox!) - 1) < 1e-9);

  const extremo = redimensionarPilhaVertical(l, 1, 0, 5000, 1000);
  assert.ok(Math.abs(extremo.colunas[1]!.alturas.jukebox! * 1000 - 120) < 1e-6);
});

test('alternarPainel: esconde e mostra, nunca deixa a tela sem painel e lembra peso', () => {
  let l: Layout = PRESETS.padrao;
  l = alternarPainel(l, 'jukebox');
  assert.deepEqual(visiveis(l).map(p => p.id), ['atlas', 'fichas']);
  l = alternarPainel(l, 'fichas');
  assert.deepEqual(visiveis(l).map(p => p.id), ['atlas']);
  assert.equal(alternarPainel(l, 'atlas'), l);
  l = alternarPainel(l, 'jukebox');
  assert.deepEqual(visiveis(l).map(p => p.id), ['atlas', 'jukebox']);
  assert.equal(pesoColuna(l, 'jukebox'), 1.1);
  assert.equal(painelVisivel(l, 'jukebox'), true);
  assert.equal(painelVisivel(l, 'fichas'), false);
});

test('moverPainel: reordena entre colunas, empilha verticalmente, separa e troca de lugar', () => {
  // Empilhar jukebox abaixo de fichas
  const empilhado = moverPainel(PRESETS.padrao, 'jukebox', 'fichas', 'empilhar-abaixo');
  assert.equal(empilhado.colunas.length, 2);
  assert.deepEqual(empilhado.colunas[1]!.paineis, ['fichas', 'jukebox']);

  // Separar de volta em coluna própria
  const separado = separarPainelEmColuna(empilhado, 'jukebox');
  assert.equal(separado.colunas.length, 3);
  assert.deepEqual(separado.colunas.map(c => c.paineis), [['atlas'], ['fichas'], ['jukebox']]);

  // Trocar atlas com jukebox
  const trocado = moverPainel(PRESETS.padrao, 'atlas', 'jukebox', 'trocar');
  assert.deepEqual(trocado.colunas.map(c => c.paineis), [['jukebox'], ['fichas'], ['atlas']]);

  // Mover para antes de atlas
  const antes = moverPainel(PRESETS.padrao, 'jukebox', 'atlas', 'antes');
  assert.deepEqual(antes.colunas.map(c => c.paineis), [['jukebox'], ['atlas'], ['fichas']]);

  // Mover coluna 1 passo e alternar empilhamento
  const dir = moverColuna(PRESETS.padrao, 'atlas', 1);
  assert.deepEqual(dir.colunas.map(c => c.paineis), [['fichas'], ['atlas'], ['jukebox']]);
  const alt = alternarEmpilhamentoPainel(PRESETS.padrao, 'fichas');
  assert.deepEqual(alt.colunas[1]!.paineis, ['jukebox', 'fichas']);
});

test('lerLayout: migra formato legado sem perda, aceita formato em colunas e rejeita entradas inválidas', () => {
  const legado = [
    { id: 'jukebox', peso: 1, visivel: true },
    { id: 'atlas', peso: 4, visivel: true },
    { id: 'diario', peso: 1.5, visivel: false },
    { id: 'fichas', peso: 2, visivel: false },
    { id: 'quadro', peso: 2, visivel: false },
  ];
  const migrado = lerLayout(legado);
  assert.deepEqual(migrado.colunas.map(c => c.paineis), [['jukebox'], ['atlas']]);
  assert.equal(migrado.colunas[0]!.peso, 1);
  assert.equal(migrado.colunas[1]!.peso, 4);
  assert.deepEqual(migrado.ocultos, ['diario', 'fichas', 'quadro']);

  // Legado de 4 itens (sem quadro)
  const migrado4 = lerLayout(legado.slice(0, 4));
  assert.ok(migrado4.ocultos.includes('quadro'));

  // Novo formato roundtrip
  assert.deepEqual(lerLayout(PRESETS['mapa-lateral']), PRESETS['mapa-lateral']);

  // Entradas inválidas
  for (const ruim of [
    null,
    'x',
    [],
    [legado[0]],
    [...legado.slice(0, 4), { id: 'atlas', peso: 1, visivel: true }],
    legado.slice(0, 3),
    legado.map(p => ({ ...p, peso: 0 })),
    legado.map(p => ({ ...p, peso: NaN })),
    legado.map(p => ({ ...p, visivel: false })),
    legado.map(p => ({ ...p, id: 'outro' })),
    { colunas: [] },
    { colunas: [{ peso: 0, paineis: ['atlas'] }] },
    { colunas: [{ peso: 1, paineis: ['atlas', 'atlas'] }] },
  ]) {
    assert.equal(lerLayout(ruim), LAYOUT_PADRAO);
  }
});

test('escalaDoPainel: 1 quando cabe, a razão quando aperta, nunca abaixo da metade; sem mínimo ou largura inválida, 1', () => {
  assert.equal(escalaDoPainel(900, 900), 1);
  assert.equal(escalaDoPainel(1400, 900), 1);
  assert.equal(escalaDoPainel(720, 900), 0.8);
  assert.equal(escalaDoPainel(260, 520), 0.5);
  assert.equal(escalaDoPainel(100, 520), ESCALA_MINIMA);
  assert.equal(escalaDoPainel(300, undefined), 1);
  assert.equal(escalaDoPainel(0, 520), 1);
  assert.equal(escalaDoPainel(NaN, 520), 1);
  assert.equal(LARGURA_LOGICA_MINIMA.fichas, undefined);
  assert.ok(LARGURA_LOGICA_MINIMA.atlas! > LARGURA_LOGICA_MINIMA.jukebox!);
});
