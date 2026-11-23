import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { executar, lerArgumentos, lerZipDoQuadro, svgDoQuadro } from '../../scripts/quadro-secoes.ts';
import { secoesDoQuadro } from '../../src/dominio/secoes-do-quadro.ts';

test('argumentos: arquivo, opções e erros', () => {
  const a = lerArgumentos(['q.zip', '--vao', '120', '--fator', '2', '--razao-titulo', '1.4', '--secao', 'ilha:x', '--pagina', '2', '--html', 's.html', '--limite', '3000']);
  assert.deepEqual(
    [a.arquivo, a.vao, a.fator, a.razaoTitulo, a.secao, a.pagina, a.html, a.limite],
    ['q.zip', 120, 2, 1.4, 'ilha:x', 2, 's.html', 3000],
  );
  assert.equal(lerArgumentos(['q.zip']).vao, null);
  assert.throws(() => lerArgumentos([]), /Falta o arquivo/);
  assert.throws(() => lerArgumentos(['q.zip', '--vao', 'abc']), /inválido/);
  assert.throws(() => lerArgumentos(['q.zip', '--vao']), /inválido/);
  assert.throws(() => lerArgumentos(['q.zip', '--foo']), /desconhecida/);
});

function zipDaFixture(): Uint8Array {
  const json = readFileSync(new URL('./fixtures/miro/molduras.json', import.meta.url), 'utf8');
  return zipSync({ 'quadro.json': strToU8(json) });
}

test('ponta a ponta: .miro.zip vira mapa, texto de seção e SVG com um grupo por seção', () => {
  const lido = lerZipDoQuadro(zipDaFixture());
  assert.equal(lido.formato, 'miro-bruto');
  const secoes = secoesDoQuadro(lido.itens);
  assert.ok(secoes.length >= 2);

  const a = lerArgumentos(['x.zip']);
  const { saida } = executar(a, lido);
  assert.match(saida, /Quadro Grande/);
  assert.match(saida, /Parâmetros:/);

  const porSecao = executar({ ...a, secao: secoes[0]!.id }, lido).saida;
  assert.match(porSecao, /§/);
  assert.throws(() => executar({ ...a, secao: 'nao-existe' }, lido), /não encontrada/);

  const svg = svgDoQuadro(lido.itens, secoes);
  assert.equal(svg.split('class="secao"').length - 1, secoes.length);
  assert.match(svg, /vector-effect="non-scaling-stroke"/);
  const { html } = executar({ ...a, html: 's.html' }, lido);
  assert.match(html ?? '', /<svg/);
  assert.doesNotMatch(html ?? '', /(src|href)="https?:/);
});

test('zip sem quadro.json ou de formato desconhecido', () => {
  assert.throws(() => lerZipDoQuadro(zipSync({ 'x.txt': strToU8('a') })), /quadro\.json/);
  assert.throws(() => lerZipDoQuadro(zipSync({ 'quadro.json': strToU8('{"formato":"outro"}') })), /não reconhecido/);
});
