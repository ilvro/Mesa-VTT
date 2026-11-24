import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deveMostrarSaguao, estadoDoSaguao, prepararFichasImportadas, urlDoAvatarDiscord } from '../../../src/online/saguao.ts';
import type { FichaDaSala, Membro } from '../../../src/online/protocolo.ts';

const membro = (discordId: string, nome: string, papel: 'mestre' | 'jogador', personagem: string | null = null, avatar: string | null = null): Membro =>
  ({ discordId, nome, papel, personagem, avatar });

test('estadoDoSaguao: identifica quem falta escolher, se o mestre está presente e se a mesa está aberta', () => {
  const membros: Membro[] = [
    membro('1', 'Mestre', 'mestre', null, 'av1'),
    membro('2', 'Ana', 'jogador', 'f1', 'av2'),
    membro('3', 'Bruno', 'jogador', null, null),
  ];
  const fichas: FichaDaSala[] = [
    { id: 'f1', name: 'Helena', tokenImage: 'data:image/png;base64,abc' },
  ];

  const fechado = estadoDoSaguao(membros, fichas, false);
  assert.equal(fechado.mestrePresente, true);
  assert.equal(fechado.mesaAberta, false);
  assert.deepEqual(fechado.faltamEscolher.map(m => m.discordId), ['3']);
  assert.equal(fechado.membros[0]?.avatarUrl, 'https://cdn.discordapp.com/avatars/1/av1.png?size=128');
  assert.equal(fechado.membros[1]?.personagemNome, 'Helena');
  assert.equal(fechado.membros[1]?.personagemRetrato, 'data:image/png;base64,abc');
  assert.equal(fechado.membros[1]?.escolheu, true);
  assert.equal(fechado.membros[2]?.avatarUrl, null);
  assert.equal(fechado.membros[2]?.escolheu, false);

  const semMestre = estadoDoSaguao([membro('2', 'Ana', 'jogador', 'f1')], fichas, true);
  assert.equal(semMestre.mestrePresente, false);
  assert.equal(semMestre.mesaAberta, true);
  assert.equal(semMestre.faltamEscolher.length, 0);
});

test('deveMostrarSaguao: abre sem mapa ou sem personagem escolhido pelo jogador', () => {
  assert.equal(deveMostrarSaguao({ temMapa: false, papel: 'jogador', personagem: 'f1' }), true);
  assert.equal(deveMostrarSaguao({ temMapa: true, papel: 'jogador', personagem: null }), true);
  assert.equal(deveMostrarSaguao({ temMapa: true, papel: 'jogador', personagem: 'f1' }), false);
  assert.equal(deveMostrarSaguao({ temMapa: true, papel: 'mestre', personagem: null }), false);
});

test('urlDoAvatarDiscord e prepararFichasImportadas', () => {
  assert.equal(urlDoAvatarDiscord('10', null), null);
  assert.equal(urlDoAvatarDiscord('10', 'https://exemplo/a.png'), 'https://exemplo/a.png');

  let n = 0;
  const uma = prepararFichasImportadas({ id: 'antigo', name: 'Kael' }, () => `novo-${++n}`);
  assert.deepEqual(uma, [{ id: 'novo-1', name: 'Kael' }]);

  const varias = prepararFichasImportadas([{ name: 'A' }, { name: 'B' }], () => `novo-${++n}`);
  assert.equal(varias.length, 2);
  assert.equal(varias[0]?.id, 'novo-2');
  assert.equal(varias[1]?.id, 'novo-3');

  assert.throws(() => prepararFichasImportadas([], () => 'x'));
  assert.throws(() => prepararFichasImportadas('texto', () => 'x'));
});
