import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copiar } from '../../src/dominio/area-de-transferencia.ts';
import {
  carimbarModelo,
  imagensDoModelo,
  modelosDaCampanha,
  nomeDeModeloValido,
  validarModelo,
  type ModeloDeCena,
} from '../../src/dominio/modelos.ts';
import { itensDeTopo } from '../../src/dominio/molduras.ts';
import { novaImagem, novaMoldura, novaNotaAdesiva } from '../../src/dominio/quadro.ts';

const moldura = novaMoldura({ quadroId: 'q', x: 0, y: 0, largura: 400, altura: 300, z: 1 }, 1, 'm');
const nota1 = { ...novaNotaAdesiva({ quadroId: 'q', x: 20, y: 20, z: 2 }, 1, 'n1'), molduraId: 'm' };
const nota2 = { ...novaNotaAdesiva({ quadroId: 'q', x: 220, y: 20, z: 3 }, 1, 'n2'), molduraId: 'm' };

function modelo(id: string, nome: string, campanhaId: string | null, conteudo: string): ModeloDeCena {
  return { id, nome, campanhaId, conteudo, criadoEm: 1 };
}

describe('modelos de cena', () => {
  const conteudo = copiar([moldura, nota1, nota2]);

  it('carimba com ids novos, no quadro e no ponto, e a seleção de topo é a moldura', () => {
    let n = 0;
    const itens = carimbarModelo(modelo('a', 'Cena', 'c', conteudo), () => `novo-${n++}`, {
      quadroId: 'q2',
      centro: { x: 1000, y: 500 },
      zBase: 10,
    });
    assert.ok(itens);
    assert.equal(itens.length, 3);
    assert.ok(itens.every((i) => i.quadroId === 'q2' && i.id.startsWith('novo-')));
    const fm = itens.find((i) => i.tipo === 'moldura')!;
    const minX = Math.min(...itens.map((i) => i.x));
    const maxX = Math.max(...itens.map((i) => i.x + i.largura));
    const minY = Math.min(...itens.map((i) => i.y));
    const maxY = Math.max(...itens.map((i) => i.y + i.altura));
    assert.equal((minX + maxX) / 2, 1000);
    assert.equal((minY + maxY) / 2, 500);
    assert.ok(itens.filter((i) => i.tipo !== 'moldura').every((i) => i.molduraId === fm.id));
    assert.deepEqual(itensDeTopo(itens).map((i) => i.id), [fm.id]);
    assert.ok(itens.every((i) => i.z > 10));
  });

  it('conteúdo ilegível não carimba', () => {
    const itens = carimbarModelo(modelo('a', 'x', null, 'lixo'), () => 'id', {
      quadroId: 'q',
      centro: { x: 0, y: 0 },
    });
    assert.equal(itens, null);
  });

  it('lista os da campanha e os de todas, em ordem', () => {
    const lista = [
      modelo('1', 'Zeta', 'c1', conteudo),
      modelo('2', 'Alfa', null, conteudo),
      modelo('3', 'Beta', 'c2', conteudo),
      modelo('4', 'Épico', 'c1', conteudo),
    ];
    assert.deepEqual(modelosDaCampanha(lista, 'c1').map((m) => m.id), ['2', '4', '1']);
    assert.deepEqual(modelosDaCampanha(lista, null).map((m) => m.id), ['2']);
  });

  it('acha as imagens usadas pelo conteúdo', () => {
    const img = novaImagem({ quadroId: 'q', x: 0, y: 0, imagemId: 'hash-1', larguraOriginal: 10, alturaOriginal: 10, z: 1 }, 1, 'i');
    assert.deepEqual([...imagensDoModelo(copiar([img, nota1]))], ['hash-1']);
    assert.equal(imagensDoModelo('lixo').size, 0);
    assert.equal(imagensDoModelo('mesa-quadro:1:{').size, 0);
  });

  it('valida nome e forma do registro', () => {
    assert.equal(nomeDeModeloValido('  '), false);
    assert.equal(nomeDeModeloValido('Cena'), true);
    assert.doesNotThrow(() => validarModelo(modelo('a', 'Cena', null, conteudo)));
    assert.throws(() => validarModelo(modelo('a', '', null, conteudo)));
    assert.throws(() => validarModelo(modelo('a', 'Cena', null, 'x')));
  });
});
