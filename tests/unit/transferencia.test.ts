import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bancosParaExportar,
  chavesDoLocalStorage,
  desserializar,
  serializar,
  validarManifesto,
  type ManifestoTransferencia,
} from '../../src/dominio/transferencia.ts';

describe('transferencia (domínio)', () => {
  it('filtra chaves do localStorage excluindo mesa:ponte-armazenamento', () => {
    const chaves = ['tema', 'ordem-ii-personagens', 'mesa:ponte-armazenamento', 'jukebox-scenes-v1'];
    const filtradas = chavesDoLocalStorage(chaves);
    assert.deepEqual(filtradas, ['tema', 'ordem-ii-personagens', 'jukebox-scenes-v1']);
    assert.ok(!filtradas.includes('mesa:ponte-armazenamento'));
  });

  it('bancosParaExportar aceita a lista comum', () => {
    const bancos = ['mesa-campanha-v1', 'mesa-handouts-v1', 'atelie-v1:padrao', 'ordem-ii-db'];
    assert.deepEqual(bancosParaExportar(bancos), bancos);
  });

  it('valida o manifesto e rejeita versão inválida ou desconhecida', () => {
    const valido: ManifestoTransferencia = {
      versao: 1,
      exportadoEm: 1731283200000,
      origem: 'http://127.0.0.1:5100',
      bancos: [
        {
          nome: 'mesa-campanha-v1',
          versao: 1,
          lojas: [
            {
              nome: 'campanhas',
              keyPath: 'id',
              autoIncrement: false,
              indices: [],
            },
          ],
        },
      ],
      localStorage: { 'mesa-tema': '{"id":"escuro"}' },
    };

    const validado = validarManifesto(valido);
    assert.equal(validado.versao, 1);
    assert.equal(validado.bancos.length, 1);

    assert.throws(
      () => validarManifesto({ ...valido, versao: 2 }),
      /Versão do manifesto não suportada: 2/
    );

    assert.throws(
      () => validarManifesto(null),
      /Manifesto inválido/
    );

    assert.throws(
      () => validarManifesto({ ...valido, bancos: 'invalido' }),
      /campo "bancos" deve ser uma lista/
    );
  });

  it('serializa e desserializa valores complexos com Blob, Date, Map, Set, Uint8Array e aninhados', async () => {
    const binarios = new Map<string, Uint8Array>();
    let proximoId = 1;

    const guardarBinario = (bytes: Uint8Array, _tipo: string) => {
      const id = `bin-${proximoId++}`;
      binarios.set(id, bytes);
      return id;
    };

    const lerBinario = (id: string) => {
      const bytes = binarios.get(id);
      if (!bytes) throw new Error(`Binário não encontrado: ${id}`);
      return bytes;
    };

    const agora = new Date('2026-11-10T15:30:00.000Z');
    const u8 = new Uint8Array([1, 2, 3, 4, 5]);
    const blobOriginal = new Blob([new Uint8Array([65, 66, 67])], { type: 'text/plain' });
    const mapaOriginal = new Map<string, unknown>([
      ['chave1', 'valor1'],
      ['chave2', 42],
    ]);
    const setOriginal = new Set(['a', 'b', 'c']);

    const objetoOriginal = {
      nome: 'Teste de Transferência',
      data: agora,
      bytes: u8,
      arquivo: blobOriginal,
      mapa: mapaOriginal,
      conjunto: setOriginal,
      aninhado: {
        lista: [1, 'dois', { tres: true, dataInterna: agora }],
      },
    };

    const serializado = await serializar(objetoOriginal, guardarBinario);
    assert.ok(binarios.size >= 2, 'Deve ter gravado os binários de bytes e arquivo');

    const restaurado = desserializar(serializado, lerBinario) as typeof objetoOriginal;

    assert.equal(restaurado.nome, objetoOriginal.nome);
    assert.ok(restaurado.data instanceof Date);
    assert.equal(restaurado.data.toISOString(), agora.toISOString());

    assert.ok(restaurado.bytes instanceof Uint8Array);
    assert.deepEqual(Array.from(restaurado.bytes), [1, 2, 3, 4, 5]);

    assert.ok(restaurado.arquivo instanceof Blob);
    assert.equal(restaurado.arquivo.type, 'text/plain');
    const textoBlob = await restaurado.arquivo.text();
    assert.equal(textoBlob, 'ABC');

    assert.ok(restaurado.mapa instanceof Map);
    assert.equal(restaurado.mapa.get('chave1'), 'valor1');
    assert.equal(restaurado.mapa.get('chave2'), 42);

    assert.ok(restaurado.conjunto instanceof Set);
    assert.ok(restaurado.conjunto.has('a'));
    assert.ok(restaurado.conjunto.has('b'));
    assert.ok(restaurado.conjunto.has('c'));

    assert.deepEqual(restaurado.aninhado.lista[0], 1);
    assert.deepEqual(restaurado.aninhado.lista[1], 'dois');
    const sub = restaurado.aninhado.lista[2] as { tres: boolean; dataInterna: Date };
    assert.equal(sub.tres, true);
    assert.ok(sub.dataInterna instanceof Date);
    assert.equal(sub.dataInterna.toISOString(), agora.toISOString());
  });
});
