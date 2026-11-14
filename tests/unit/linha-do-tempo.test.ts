import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extrairLinhaDoTempo } from '../../src/dominio/linha-do-tempo.ts';
import { docDeTexto, novoQuadro, type Item } from '../../src/dominio/quadro.ts';

function itemTexto(id: string, quadroId: string, texto: string): Item {
  return {
    id,
    quadroId,
    tipo: 'texto',
    x: 0,
    y: 0,
    largura: 200,
    altura: 80,
    rotacao: 0,
    z: 0,
    grupoId: null,
    molduraId: null,
    travado: false,
    soMestre: false,
    criadoEm: 1,
    atualizadaEm: 1,
    atualizadoEm: 1,
    doc: docDeTexto(texto),
    texto: { fonte: 'sans', tamanho: 14, cor: '#fff', alinhamento: 'esquerda' },
    caixa: {
      fundo: null,
      borda: null,
      espessuraBorda: 0,
      tracejado: 'solido',
      raio: 4,
      sombra: false,
      padding: 8,
      opacidade: 1,
    },
    alturaAuto: true,
    semantica: null,
  } as unknown as Item;
}

describe('linha do tempo (domínio)', () => {
  it('ordena datas com ano, ano-mes e ano-mes-dia em ordem cronologica', () => {
    const q1 = novoQuadro('c1', 'Lore', 1, 'q1');
    const itens = [
      itemTexto('i1', 'q1', '[DATA 1240-03-15] Queda da torre'),
      itemTexto('i2', 'q1', '[DATA 1240] Fundacao do reino'),
      itemTexto('i3', 'q1', '[DATA 1239-12] Inverno longo'),
      itemTexto('i4', 'q1', '[DATA 1240-03] Chegada dos navios'),
    ];

    const marcos = extrairLinhaDoTempo(itens, [q1]);
    assert.deepEqual(
      marcos.map((m) => m.dataTexto),
      ['1239-12', '1240', '1240-03', '1240-03-15'],
    );
    assert.equal(marcos[0]?.trecho, 'Inverno longo');
    assert.equal(marcos[3]?.itemId, 'i1');
  });
});
