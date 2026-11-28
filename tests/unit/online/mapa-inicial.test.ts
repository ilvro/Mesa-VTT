import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descomprimirEstado, LIMITE_ESTADO_BYTES } from '../../../src/online/estado-comprimido.ts';
import {
  FORMATO_BACKUP,
  GENEROS_MAPA,
  SCHEMA_MAPA,
  TAMANHO_CELULA_PADRAO,
  VERSAO_MAPA,
  criarMapaConstrucaoInicial,
  enviarAberturaConstrucao,
  extrairMapaImportado,
  normalizarCelulasMapa,
  type ClienteAberturaConstrucao,
} from '../../../src/online/mapa-inicial.ts';
import type { MensagemParaSala } from '../../../src/online/protocolo.ts';

test('criarMapaConstrucaoInicial gera documento 100% compatível com criarMapa v8 do Atlas', () => {
  const mapa = criarMapaConstrucaoInicial({
    nome: 'Taverna do Porto',
    larguraCelulas: 40,
    alturaCelulas: 24,
    renderer: 'pixel',
    genre: 'fantasia',
    id: 'mapa-taverna-1',
    agora: 1_700_000_000_000,
  });

  assert.equal(mapa.schema, SCHEMA_MAPA);
  assert.equal(mapa.schema, 'atlas.map');
  assert.equal(mapa.version, VERSAO_MAPA);
  assert.equal(mapa.version, 8);
  assert.equal(mapa.id, 'mapa-taverna-1');
  assert.equal(mapa.name, 'Taverna do Porto');
  assert.equal(mapa.revision, 0);
  assert.equal(mapa.createdAt, 1_700_000_000_000);
  assert.equal(mapa.updatedAt, 1_700_000_000_000);
  assert.equal(mapa.campanhaId, null);

  assert.deepEqual(mapa.grid, {
    kind: 'square',
    size: TAMANHO_CELULA_PADRAO,
    offset: [0, 0],
    visible: false,
    snap: true,
    lineStyle: 'solid',
    color: 'auto',
    opacity: 0.1,
    lineWidth: 1,
  });
  assert.deepEqual(mapa.bounds, { width: 60, height: 36 });
  assert.deepEqual(mapa.style, {
    renderer: 'pixel',
    palette: 'investigacao-sepia',
    walls: 'box',
    genre: 'fantasia',
    pixel: { pixelsPerCell: 16, dither: 'bayer4', outline: true },
  });

  assert.equal(mapa.climate.preset, 'dia');
  assert.equal(mapa.climate.gridPower, true);
  assert.deepEqual(mapa.climate.weather, {
    rain: 0, snow: 0, fog: 0, wind: 0, dust: 0, embers: 0, leaves: 0, lightning: 0,
  });
  assert.equal(mapa.finish.preset, 'neutro');
  assert.deepEqual(mapa.memory, { sketch: true, paper: 'papel-claro', ink: '#241b14' });
  assert.deepEqual(mapa.backdrop, { kind: 'solid', color: '#07080b', material: null, title: null });
  assert.deepEqual(mapa.terrain, { resolution: 0.25, base: 'vazio', layers: {} });
  assert.deepEqual(mapa.rooms, {});
  assert.deepEqual(mapa.walls, {});
  assert.deepEqual(mapa.openings, {});
  assert.deepEqual(mapa.props, {});
  assert.deepEqual(mapa.lights, {});
  assert.deepEqual(mapa.regions, {});
  assert.deepEqual(mapa.presence, {});
  assert.deepEqual(mapa.tokens, {});
  assert.deepEqual(mapa.comodosExtra, {});
  assert.deepEqual(mapa.session, { explored: null, initiative: null, revealed: [], event: null });
  assert.equal(mapa.audioCue, null);
  assert.equal(mapa.notes, '');
  assert.deepEqual(mapa.climateAudio, {});
  assert.deepEqual(mapa.customClimates, {});
  assert.deepEqual(mapa.moments, {});
});

test('criarMapaConstrucaoInicial aplica padrões seguros e normaliza dimensões/nome', () => {
  const padrao = criarMapaConstrucaoInicial();
  assert.equal(padrao.name, 'Mapa sem nome');
  assert.deepEqual(padrao.bounds, { width: 45, height: 30 });
  assert.equal(padrao.style.renderer, 'illustrated');
  assert.equal(padrao.style.genre, 'investigacao');
  assert.match(padrao.id, /^[A-Za-z0-9_-]{1,64}$/);

  const limites = criarMapaConstrucaoInicial({
    nome: '   ',
    larguraCelulas: 1,
    alturaCelulas: 999,
  });
  assert.equal(limites.name, 'Mapa sem nome');
  assert.deepEqual(limites.bounds, { width: 3, height: 600 });
  assert.equal(normalizarCelulasMapa(Number.NaN, 30), 30);
  assert.ok(GENEROS_MAPA.some(g => g.id === 'investigacao'));
  assert.ok(GENEROS_MAPA.some(g => g.id === 'fantasia'));
});

test('extrairMapaImportado aceita atlas.map avulso e atlas.backup, recusando lixo', () => {
  const mapa = criarMapaConstrucaoInicial({ nome: 'Cripta', id: 'cripta-1' });
  assert.equal(extrairMapaImportado(mapa), mapa);

  // Backup com primeiro mapa inválido e segundo válido: devolve o 1º válido
  const backupMisto = {
    formato: FORMATO_BACKUP,
    versao: 1,
    criadoEm: 123,
    mapas: [
      { schema: 'outro', version: 1 },
      mapa,
      criarMapaConstrucaoInicial({ nome: 'Segundo', id: 'm2' }),
    ],
    assets: [],
  };
  assert.equal(extrairMapaImportado(backupMisto).id, 'cripta-1');

  // Aceita mapas antigos (v1..v7) que serão migrados pelo Atlas
  const antigo = { schema: 'atlas.map', version: 4, id: 'v4-id', name: 'Antigo' };
  assert.equal(extrairMapaImportado(antigo).id, 'v4-id');

  assert.throws(() => extrairMapaImportado(null), /Atlas/);
  assert.throws(() => extrairMapaImportado([]), /Atlas/);
  assert.throws(() => extrairMapaImportado({ foo: 'bar' }), /atlas\.map/);
  assert.throws(() => extrairMapaImportado({ schema: 'atlas.map', version: 99, id: 'x', name: 'Futuro' }), /mais nova/);
  assert.throws(() => extrairMapaImportado({ schema: 'atlas.map', version: 8, id: '', name: 'Sem id' }), /identificador/);
  assert.throws(() => extrairMapaImportado({ schema: 'atlas.map', version: 8, id: 'x', name: '  ' }), /nome/);
  assert.throws(() => extrairMapaImportado({ formato: FORMATO_BACKUP, versao: 9, mapas: [], assets: [] }), /versão 9/);
  assert.throws(() => extrairMapaImportado({ formato: FORMATO_BACKUP, versao: 1, mapas: [], assets: [] }), /nenhum mapa/);
  assert.throws(() => extrairMapaImportado({ formato: FORMATO_BACKUP, versao: 1, mapas: [{ lixo: true }], assets: [] }), /atlas\.map/);
});

test('enviarAberturaConstrucao envia inline abaixo do limite e comprime como blob construcao:0 acima de 256 KB', async () => {
  const enviadas: MensagemParaSala[] = [];
  const blobs: Array<{ id: string; blob: Blob }> = [];
  const cliente: ClienteAberturaConstrucao = {
    estado: 'aberta',
    enviar(msg) { enviadas.push(msg); return true; },
    async enviarBlob(id, blob) { blobs.push({ id, blob }); return true; },
  };

  const pequeno = criarMapaConstrucaoInicial({ nome: 'Pequeno', id: 'm-peq' });
  await enviarAberturaConstrucao(cliente, pequeno);
  assert.equal(blobs.length, 0);
  assert.deepEqual(enviadas, [{ tipo: 'construcao.abrir', mapa: pequeno, nome: 'Pequeno' }]);

  enviadas.length = 0;
  const grande = {
    ...criarMapaConstrucaoInicial({ nome: 'Grande', id: 'm-grande' }),
    notes: 'x'.repeat(LIMITE_ESTADO_BYTES + 2048),
  };
  await enviarAberturaConstrucao(cliente, grande);
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0]?.id, 'construcao:0');
  assert.deepEqual(await descomprimirEstado(blobs[0]!.blob), grande);
  assert.deepEqual(enviadas, [{ tipo: 'construcao.abrir', blobId: 'construcao:0', nome: 'Grande' }]);

  await assert.rejects(() => enviarAberturaConstrucao(null, pequeno), /conectada/);
  await assert.rejects(
    () => enviarAberturaConstrucao({ estado: 'aberta', enviar: () => true, enviarBlob: async () => false }, grande),
    /comprimido/,
  );
});
