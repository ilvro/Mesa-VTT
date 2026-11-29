import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado } from '../../../sala/estado.ts';
import { bemVindo, blobsCitadosPor, blobsParaQuemChega, tratar, tratarBinario } from '../../../sala/mensagens.ts';
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
  assert.deepEqual(lerMensagemDaSala(j({ tipo: 'blob.tem', id: 'h', tem: true, tamanho: 9 })), { tipo: 'blob.tem', id: 'h', tem: true, tamanho: 9 });
  assert.equal(lerMensagemDaSala(j({ tipo: 'blob.tem', id: 'h', tem: true, tamanho: 'x' })), null);
  assert.equal(lerMensagemDaSala(j({ tipo: 'blob.tem', id: 'h' })), null);

  const e = sala();
  assert.deepEqual(tratar(e, mestre, j({ tipo: 'blob.tem', id: 'h' }), 1, todos), [{ destino: 'remetente', msg: { tipo: 'blob.tem', id: 'h', tem: false } }]);
  subir(e, 'h', [new Uint8Array([1]), new Uint8Array([2])]);
  assert.deepEqual(tratar(e, mestre, j({ tipo: 'blob.tem', id: 'h' }), 1, todos)[0]!.msg, { tipo: 'blob.tem', id: 'h', tem: true, tamanho: 2 });
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

test('pedir-retrato devolve blob + canal ao remetente se a sala tiver, ou encaminha aos outros se faltar', () => {
  const e = sala();
  subir(e, 'h-ret', [new Uint8Array([1, 2, 3])], 'image/png');
  tratar(e, mestre, canal({ tipo: 'retrato', id: 'r1', blob: { blobId: 'h-ret' } }), 1, todos);

  const achou = tratar(e, ana, j({ tipo: 'pedir-retrato', id: 'r1' }), 2, todos);
  assert.equal(achou.length, 2);
  assert.equal(achou[0]!.destino, 'remetente');
  assert.deepEqual(achou[0]!.msg, { tipo: 'blob', id: 'h-ret', tipoMime: 'image/png' });
  assert.equal(achou[0]!.quadros?.length, 1);
  assert.deepEqual(achou[1], { destino: 'remetente', msg: { tipo: 'canal', nome: CANAL, msg: { tipo: 'retrato', id: 'r1', blob: { blobId: 'h-ret' } } } });

  const faltou = tratar(e, ana, j({ tipo: 'pedir-retrato', id: 'nao-existe' }), 3, todos);
  assert.deepEqual(faltou, [{ destino: 'outros', msg: { tipo: 'pedir-retrato', id: 'nao-existe' } }]);
});

test('projetar-ficha anexa os dados da ficha da sala, aparece no bem-vindo e limpa quando fichaId é null', () => {
  const e = sala();
  const fichaOutro = { id: 'f-kael', name: 'Kael', pv: 12 };
  tratar(e, mestre, j({ tipo: 'ficha.salvar', ficha: fichaOutro, rev: 0 }), 1, todos);

  const s1 = tratar(e, mestre, canal({ tipo: 'projetar-ficha', fichaId: 'f-kael' }), 2, todos);
  assert.deepEqual(s1, [{ destino: 'outros', msg: { tipo: 'canal', nome: CANAL, msg: { tipo: 'projetar-ficha', fichaId: 'f-kael', ficha: fichaOutro } } }]);
  assert.deepEqual(e.ultimoEstado()[`${CANAL}:ficha-projetada`], { tipo: 'projetar-ficha', fichaId: 'f-kael' });

  const s2 = tratar(e, mestre, canal({ tipo: 'projetar-ficha', fichaId: null }), 3, todos);
  assert.deepEqual(s2, [{ destino: 'outros', msg: { tipo: 'canal', nome: CANAL, msg: { tipo: 'projetar-ficha', fichaId: null } } }]);
  assert.equal(`${CANAL}:ficha-projetada` in e.ultimoEstado(), false);
});

test('projetar-ficha local do mestre preserva ficha inline no ultimoEstado e entrega no bemVindo', () => {
  const e = sala();
  const fichaLocal = { id: 'f-npc', name: 'Barão', pv: 30 };
  const s1 = tratar(e, mestre, canal({ tipo: 'projetar-ficha', fichaId: 'f-npc', ficha: fichaLocal }), 1, todos);
  assert.deepEqual(s1, [{ destino: 'outros', msg: { tipo: 'canal', nome: CANAL, msg: { tipo: 'projetar-ficha', fichaId: 'f-npc', ficha: fichaLocal } } }]);
  assert.deepEqual(e.ultimoEstado()[`${CANAL}:ficha-projetada`], { tipo: 'projetar-ficha', fichaId: 'f-npc', ficha: fichaLocal });
  const bv = bemVindo(e, ana, todos, 2);
  assert.deepEqual(bv.ultimoEstado[`${CANAL}:ficha-projetada`], { tipo: 'projetar-ficha', fichaId: 'f-npc', ficha: fichaLocal });
});

test('alternar-porta é permitido a jogador e mestre e encaminhado aos outros', () => {
  const e = sala();
  assert.deepEqual(
    tratar(e, ana, j({ tipo: 'alternar-porta', id: 'porta-42' }), 1, todos),
    [{ destino: 'outros', msg: { tipo: 'alternar-porta', id: 'porta-42' } }],
  );
  assert.deepEqual(
    tratar(e, mestre, j({ tipo: 'alternar-porta', id: 'porta-42' }), 2, todos),
    [{ destino: 'outros', msg: { tipo: 'alternar-porta', id: 'porta-42' } }],
  );
});

test('visao-remota é persistido em :visao-remota e incluído no bem-vindo', () => {
  const e = sala();
  const msg = { tipo: 'visao-remota', modo: 'mestre' };
  const s = tratar(e, mestre, canal(msg), 1, todos);
  assert.deepEqual(s, [{ destino: 'outros', msg: { tipo: 'canal', nome: CANAL, msg } }]);
  assert.deepEqual(e.ultimoEstado()[`${CANAL}:visao-remota`], msg);
  const bv = bemVindo(e, ana, todos, 2);
  assert.deepEqual(bv.ultimoEstado[`${CANAL}:visao-remota`], msg);
});
