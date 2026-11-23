import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado } from '../../../sala/estado.ts';
import { blobsCitadosPor, blobsParaQuemChega, tratar, tratarBinario } from '../../../sala/mensagens.ts';
import { decodificarPedaco, lerMensagemDaSala, lerMensagemParaSala, codificarPedaco, type Eu } from '../../../src/online/protocolo.ts';
import { sqlEmMemoria } from './sql-teste.ts';

const mestre: Eu = { discordId: 'M', nome: 'Mestre', papel: 'mestre' };
const ana: Eu = { discordId: 'A', nome: 'Ana', papel: 'jogador' };
const todos = [mestre, ana];
const j = (o: unknown) => JSON.stringify(o);
const CANAL = 'atlas:projetor:remoto';

function sala() {
  const e = criarEstado(sqlEmMemoria());
  e.iniciar('M', 'Campanha');
  return e;
}
/** O mestre sobe um blob inteiro (anúncio e pedaços). */
function subir(e: ReturnType<typeof sala>, id: string, dados: Uint8Array[], tipoMime = 'application/octet-stream') {
  tratar(e, mestre, j({ tipo: 'blob', id, tipoMime }), 1, todos);
  dados.forEach((d, i) => tratarBinario(e, mestre, codificarPedaco({ id, i, n: dados.length, tipo: tipoMime }, d)));
}
const canal = (msg: unknown) => j({ tipo: 'canal', nome: CANAL, msg });

test('blob.tem: protocolo, só o mestre pergunta e a sala responde ao remetente', () => {
  assert.deepEqual(lerMensagemParaSala(j({ tipo: 'blob.tem', id: 'h' })), { tipo: 'blob.tem', id: 'h' });
  assert.equal(lerMensagemParaSala(j({ tipo: 'blob.tem' })), null);
  assert.deepEqual(lerMensagemDaSala(j({ tipo: 'blob.tem', id: 'h', tem: true })), { tipo: 'blob.tem', id: 'h', tem: true });
  assert.equal(lerMensagemDaSala(j({ tipo: 'blob.tem', id: 'h' })), null);

  const e = sala();
  assert.deepEqual(tratar(e, mestre, j({ tipo: 'blob.tem', id: 'h' }), 1, todos), [{ destino: 'remetente', msg: { tipo: 'blob.tem', id: 'h', tem: false } }]);
  subir(e, 'h', [new Uint8Array([1]), new Uint8Array([2])]);
  assert.deepEqual(tratar(e, mestre, j({ tipo: 'blob.tem', id: 'h' }), 1, todos)[0]!.msg, { tipo: 'blob.tem', id: 'h', tem: true });
  assert.deepEqual(tratar(e, ana, j({ tipo: 'blob.tem', id: 'h' }), 1, todos), [{ destino: 'remetente', msg: { tipo: 'erro', motivo: 'permissao', recusado: 'blob.tem' } }]);
  // incompleto não conta
  tratar(e, mestre, j({ tipo: 'blob', id: 'meio', tipoMime: 'x' }), 1, todos);
  tratarBinario(e, mestre, codificarPedaco({ id: 'meio', i: 0, n: 2, tipo: 'x' }, new Uint8Array([1])));
  assert.equal((tratar(e, mestre, j({ tipo: 'blob.tem', id: 'meio' }), 1, todos)[0]!.msg as { tem: boolean }).tem, false);
});

test('blobsCitadosPor: estado comprimido, retrato e inspecao', () => {
  assert.deepEqual(blobsCitadosPor({ tipo: 'estado', blobId: 'estado:m:1', versao: 1, comprimido: true }), ['estado:m:1']);
  assert.deepEqual(blobsCitadosPor({ tipo: 'estado', doc: {}, versao: 1 }), []);
  assert.deepEqual(blobsCitadosPor({ tipo: 'retrato', id: 'r', blob: { blobId: 'h1' } }), ['h1']);
  assert.deepEqual(blobsCitadosPor({ tipo: 'inspecao', normal: { blobId: 'a' }, uv: { blobId: 'b' } }), ['a', 'b']);
  assert.deepEqual(blobsCitadosPor({ tipo: 'inspecao', normal: { blobId: 'a' }, uv: null }), ['a']);
  assert.deepEqual(blobsCitadosPor({ tipo: 'camera' }), []);
});

test('quem chega depois recebe os blobs citados nos últimos canal; os incompletos e os não citados ficam de fora', () => {
  const e = sala();
  const pedacos = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  subir(e, 'estado:m:1', pedacos, 'application/gzip');
  subir(e, 'h-retrato', [new Uint8Array([9])], 'image/png');
  subir(e, 'h-solto', [new Uint8Array([7])], 'image/png');
  // incompleto: anunciado, só o pedaço 0 de 2
  tratar(e, mestre, j({ tipo: 'blob', id: 'h-meio', tipoMime: 'image/png' }), 1, todos);
  tratarBinario(e, mestre, codificarPedaco({ id: 'h-meio', i: 0, n: 2, tipo: 'image/png' }, new Uint8Array([1])));
  tratar(e, mestre, canal({ tipo: 'estado', blobId: 'estado:m:1', versao: 1, comprimido: true }), 1, todos);
  tratar(e, mestre, canal({ tipo: 'retrato', id: 'r', blob: { blobId: 'h-retrato' } }), 1, todos);
  tratar(e, mestre, canal({ tipo: 'inspecao', nome: 'C', normal: { blobId: 'h-meio' }, uv: { blobId: 'h-fantasma' } }), 1, todos);

  const envios = blobsParaQuemChega(e);
  assert.deepEqual(envios.map(b => b.anuncio), [
    { tipo: 'blob', id: 'estado:m:1', tipoMime: 'application/gzip' },
    { tipo: 'blob', id: 'h-retrato', tipoMime: 'image/png' },
  ]);
  const grande = envios.find(b => b.anuncio.id === 'estado:m:1')!;
  const lidos = grande.quadros.map(q => decodificarPedaco(q)!);
  assert.deepEqual(lidos.map(l => [l.cab.i, l.cab.n]), [[0, 2], [1, 2]]);
  assert.deepEqual(lidos.map(l => [...l.dados]), [[1, 2, 3], [4, 5]]);
});

test('retrato novo troca o citado do canal; o antigo deixa de ser mandado', () => {
  const e = sala();
  subir(e, 'a', [new Uint8Array([1])]);
  subir(e, 'b', [new Uint8Array([2])]);
  tratar(e, mestre, canal({ tipo: 'retrato', id: 'r', blob: { blobId: 'a' } }), 1, todos);
  tratar(e, mestre, canal({ tipo: 'retrato', id: 'r', blob: { blobId: 'b' } }), 1, todos);
  assert.deepEqual(blobsParaQuemChega(e).map(b => b.anuncio.id), ['b']);
});

test('o blob de estado antigo do mesmo mapa é apagado quando a versão nova chega; os outros mapas ficam', () => {
  const e = sala();
  subir(e, 'estado:m:1', [new Uint8Array([1])]);
  subir(e, 'estado:outro:1', [new Uint8Array([2])]);
  subir(e, 'estado:m2:1', [new Uint8Array([3])]);
  tratar(e, mestre, canal({ tipo: 'estado', blobId: 'estado:m:1', versao: 1, comprimido: true }), 1, todos);
  assert.equal(e.temBlob('estado:m:1'), true);
  subir(e, 'estado:m:2', [new Uint8Array([4])]);
  tratar(e, mestre, canal({ tipo: 'estado', blobId: 'estado:m:2', versao: 2, comprimido: true }), 1, todos);
  assert.equal(e.temBlob('estado:m:1'), false);
  assert.equal(e.temBlob('estado:m:2'), true);
  assert.equal(e.temBlob('estado:outro:1'), true, 'outro mapa não é tocado');
  assert.equal(e.temBlob('estado:m2:1'), true, 'prefixo parecido não é tocado');
  assert.deepEqual(e.ultimoEstado()[CANAL], { tipo: 'estado', blobId: 'estado:m:2', versao: 2, comprimido: true });
});

test('o mesmo id estado:<mapa>:<versao> de uma sessão nova substitui o conteúdo velho', () => {
  const e = sala();
  subir(e, 'estado:m:1', [new Uint8Array([1])]);
  assert.equal(tratar(e, mestre, j({ tipo: 'blob', id: 'estado:m:1', tipoMime: 'application/gzip' }), 1, todos)[0]?.destino, 'outros');
  tratarBinario(e, mestre, codificarPedaco({ id: 'estado:m:1', i: 0, n: 1, tipo: 'application/gzip' }, new Uint8Array([8, 8])));
  assert.deepEqual([...e.pedacosDoBlob('estado:m:1')![0]!.dados], [8, 8]);
});
