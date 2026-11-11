import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buscar, type ItemBusca } from '../../src/dominio/busca.ts';

describe('busca rápida (domínio)', () => {
  const itensExemplo: ItemBusca[] = [
    { id: '1', nome: 'Marte', tipo: 'lugar', origem: 'entidade' },
    { id: '2', nome: 'Terra Nova Marítima', tipo: 'lugar', origem: 'entidade' },
    { id: '3', nome: 'Câmara Secreta', tipo: 'lugar', origem: 'entidade' },
    { id: '4', nome: 'Porto Seguro', tipo: 'lugar', tags: ['marinho'], origem: 'entidade' },
    { id: '5', nome: 'Outro Lugar', tipo: 'lugar', origem: 'entidade' },
  ];

  it('pontuação e ordem: começo do nome > começo de palavra > contém > tag', () => {
    const res = buscar('mar', itensExemplo);
    assert.equal(res.length, 4);
    assert.equal(res[0]?.id, '1', 'Começo do nome deve vir em primeiro (Marte)');
    assert.equal(res[1]?.id, '2', 'Começo de palavra deve vir em segundo (Terra Nova Marítima)');
    assert.equal(res[2]?.id, '3', 'Contém no nome deve vir em terceiro (Câmara Secreta)');
    assert.equal(res[3]?.id, '4', 'Tag deve vir em quarto (#marinho)');
  });

  it('ignora acentos na busca e nos itens (NFD)', () => {
    const itens: ItemBusca[] = [
      { id: 'a1', nome: 'Álamo Solitário', tipo: 'lugar', origem: 'entidade' },
      { id: 'a2', nome: 'Sessão de Abertura', tipo: 'sessao', origem: 'sessao' },
    ];

    const r1 = buscar('alamo', itens);
    assert.equal(r1.length, 1);
    assert.equal(r1[0]?.id, 'a1');

    const r2 = buscar('sessao', itens);
    assert.equal(r2.length, 1);
    assert.equal(r2[0]?.id, 'a2');
  });

  it('respeita o limite informado e o padrão (12)', () => {
    const muitos: ItemBusca[] = Array.from({ length: 20 }, (_, i) => ({
      id: `id-${i}`,
      nome: `Item ${i}`,
      tipo: 'nota',
      origem: 'entidade',
    }));

    const padrao = buscar('item', muitos);
    assert.equal(padrao.length, 12);

    const limitado = buscar('item', muitos, 5);
    assert.equal(limitado.length, 5);
  });

  it('termo vazio ou apenas espaços retorna lista vazia', () => {
    assert.deepEqual(buscar('', itensExemplo), []);
    assert.deepEqual(buscar('   ', itensExemplo), []);
  });
});
