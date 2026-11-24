import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { lerEntradaDoZip, percorrerZipEmPedacos } from '../../src/app/zip-streaming.ts';

describe('zip-streaming', () => {
  it('lê entradas comprimidas e não comprimidas em pedaços pequenos a partir de Blob', async () => {
    const grande = new Uint8Array(6000);
    for (let i = 0; i < grande.length; i++) grande[i] = (i * 31) & 0xff;

    const zipBytes = zipSync({
      'imagens/a.bin': [grande, { level: 0 }],
      'imagens/b.txt': [strToU8('olá mundo '.repeat(400)), { level: 6 }],
      'quadro.json': [strToU8('{"ok":true}'), { level: 6 }],
    });

    const blob = new Blob([zipBytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
    const lidos = new Map<string, Uint8Array>();

    await percorrerZipEmPedacos(blob, {
      tamanhoPedaco: 1024,
      decidir: (nome) => nome !== 'imagens/a.bin',
      aoLer: (nome, dados) => {
        lidos.set(nome, dados);
      },
    });

    assert.equal(lidos.has('imagens/a.bin'), false);
    assert.equal(strFromU8(lidos.get('imagens/b.txt')!), 'olá mundo '.repeat(400));
    assert.equal(strFromU8(lidos.get('quadro.json')!), '{"ok":true}');
  });

  it('lerEntradaDoZip encontra entrada no fim do zip e para sem ler o restante', async () => {
    const zipBytes = zipSync({
      'imagens/1.png': [new Uint8Array(4096).fill(7), { level: 0 }],
      'quadro.json': [strToU8('{"board":{"name":"Teste"}}'), { level: 6 }],
      'imagens/2.png': [new Uint8Array(4096).fill(9), { level: 0 }],
    });

    const jsonBytes = await lerEntradaDoZip(new Blob([zipBytes as Uint8Array<ArrayBuffer>]), 'quadro.json', 1024);
    assert.ok(jsonBytes);
    assert.deepEqual(JSON.parse(strFromU8(jsonBytes)), { board: { name: 'Teste' } });

    const ausente = await lerEntradaDoZip(zipBytes, 'nao-existe.json', 1024);
    assert.equal(ausente, null);
  });

  it('rejeita arquivo que não é zip válido quando o fluxo falha', async () => {
    const lixo = new Uint8Array(2048).fill(0x55);
    const achado = await lerEntradaDoZip(lixo, 'quadro.json', 1024);
    assert.equal(achado, null);
  });
});
