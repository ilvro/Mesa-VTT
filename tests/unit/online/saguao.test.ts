import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deveMostrarSaguao,
  estadoDoSaguao,
  prepararFichasImportadas,
  retratoDaFicha,
  urlDoAvatarDiscord,
  visaoDoSaguao,
} from '../../../src/online/saguao.ts';
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

test('deveMostrarSaguao: abre sem mapa ou sem personagem escolhido pelo jogador em sessao', () => {
  assert.equal(deveMostrarSaguao({ temMapa: false, papel: 'jogador', personagem: 'f1' }), true);
  assert.equal(deveMostrarSaguao({ temMapa: true, papel: 'jogador', personagem: null }), true);
  assert.equal(deveMostrarSaguao({ temMapa: true, papel: 'jogador', personagem: 'f1' }), false);
  assert.equal(deveMostrarSaguao({ temMapa: true, papel: 'mestre', personagem: null }), false);
  assert.equal(deveMostrarSaguao({ modo: 'sessao', temMapa: false, temMapaConstrucao: true, papel: 'mestre', personagem: null }), true);
});

test('deveMostrarSaguao: em modo construcao depende só de temMapaConstrucao e não exige ficha', () => {
  assert.equal(deveMostrarSaguao({ modo: 'construcao', temMapa: true, temMapaConstrucao: false, papel: 'mestre', personagem: null }), true);
  assert.equal(deveMostrarSaguao({ modo: 'construcao', temMapa: true, temMapaConstrucao: false, papel: 'jogador', personagem: 'f1' }), true);
  assert.equal(deveMostrarSaguao({ modo: 'construcao', temMapa: false, papel: 'jogador', personagem: null }), true);
  assert.equal(deveMostrarSaguao({ modo: 'construcao', temMapa: false, temMapaConstrucao: true, papel: 'jogador', personagem: null }), false);
  assert.equal(deveMostrarSaguao({ modo: 'construcao', temMapa: false, temMapaConstrucao: true, papel: 'mestre', personagem: null }), false);
});

test('visaoDoSaguao calcula selo de modo, blocos e botões para mestre e jogador', () => {
  const mestreSessao = visaoDoSaguao({ modo: 'sessao', ehMestre: true, mesaAberta: true, temMapaConstrucao: false, podeFechar: true });
  assert.equal(mestreSessao.rotuloModo, 'Modo Sessão');
  assert.equal(mestreSessao.mostrarSeletorModo, true);
  assert.equal(mestreSessao.mostrarPersonagens, false);
  assert.equal(mestreSessao.mostrarMapaConstrucao, false);
  assert.equal(mestreSessao.statusTexto, 'Mesa aberta');
  assert.equal(mestreSessao.podeEntrarNoCabecalho, true);

  const mestreConstrucaoVazio = visaoDoSaguao({ modo: 'construcao', ehMestre: true, mesaAberta: true, temMapaConstrucao: false, podeFechar: false });
  assert.equal(mestreConstrucaoVazio.rotuloModo, 'Modo Construção');
  assert.equal(mestreConstrucaoVazio.mostrarSeletorModo, true);
  assert.equal(mestreConstrucaoVazio.mostrarMapaConstrucao, true);
  assert.equal(mestreConstrucaoVazio.mostrarPersonagens, false);
  assert.equal(mestreConstrucaoVazio.aberta, false);
  assert.equal(mestreConstrucaoVazio.statusTexto, 'Nenhum mapa de construção aberto');

  const mestreConstrucaoAberto = visaoDoSaguao({ modo: 'construcao', ehMestre: true, mesaAberta: false, temMapaConstrucao: true, podeFechar: true });
  assert.equal(mestreConstrucaoAberto.aberta, true);
  assert.equal(mestreConstrucaoAberto.statusTexto, 'Construção aberta');
  assert.equal(mestreConstrucaoAberto.podeEntrarNoCabecalho, false);

  const jogadorConstrucaoFechada = visaoDoSaguao({ modo: 'construcao', ehMestre: false, mesaAberta: true, temMapaConstrucao: false, podeFechar: false });
  assert.equal(jogadorConstrucaoFechada.mostrarSeletorModo, false);
  assert.equal(jogadorConstrucaoFechada.mostrarPersonagens, false);
  assert.equal(jogadorConstrucaoFechada.mostrarStatusConstrucaoJogador, true);
  assert.equal(jogadorConstrucaoFechada.statusTexto, 'Aguardando o mestre abrir um mapa para construir');
  assert.equal(jogadorConstrucaoFechada.podeEntrarNoCabecalho, false);

  const jogadorConstrucaoAberta = visaoDoSaguao({ modo: 'construcao', ehMestre: false, mesaAberta: false, temMapaConstrucao: true, podeFechar: true });
  assert.equal(jogadorConstrucaoAberta.aberta, true);
  assert.equal(jogadorConstrucaoAberta.statusTexto, 'Construção aberta');
  assert.equal(jogadorConstrucaoAberta.rotuloBotaoEntrar, 'Entrar na construção');
  assert.equal(jogadorConstrucaoAberta.podeEntrarNoCabecalho, true);
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

test('urlDoAvatarDiscord e estadoDoSaguao respeitam baseAvatar customizada (proxy do Discord)', () => {
  assert.equal(
    urlDoAvatarDiscord('10', 'hash123', 128, '/.proxy/sala/cdn'),
    '/.proxy/sala/cdn/avatars/10/hash123.png?size=128',
  );
  assert.equal(
    urlDoAvatarDiscord('10', 'hash123', 64, '/.proxy/sala/cdn/'),
    '/.proxy/sala/cdn/avatars/10/hash123.png?size=64',
  );
  const res = estadoDoSaguao([membro('10', 'Ana', 'jogador', null, 'hash123')], [], true, undefined, '/.proxy/sala/cdn');
  assert.equal(res.membros[0]?.avatarUrl, '/.proxy/sala/cdn/avatars/10/hash123.png?size=128');
});

test('retratoDaFicha resolve caminhos relativos e iniciados por / contra a base do Dossiê', () => {
  const f = { id: 'f1', name: 'Muirenn', tokenImage: 'portraits/muirenn.webp' };
  assert.equal(retratoDaFicha(f, 'https://123.discordsays.com/.proxy/Dossie/'), 'https://123.discordsays.com/.proxy/Dossie/portraits/muirenn.webp');
  assert.equal(
    retratoDaFicha({ id: 'f1b', name: 'Muirenn', tokenImage: '/assets/vigilia/token-muirenn-portrait.png' }, 'https://123.discordsays.com/.proxy/Dossie/'),
    'https://123.discordsays.com/.proxy/Dossie/assets/vigilia/token-muirenn-portrait.png',
  );
  assert.equal(
    retratoDaFicha({ id: 'f1c', name: 'Muirenn', tokenImage: '/assets/vigilia/token-muirenn-portrait.png' }, 'https://ilvro.github.io/Dossie/'),
    'https://ilvro.github.io/Dossie/assets/vigilia/token-muirenn-portrait.png',
  );
  assert.equal(retratoDaFicha({ id: 'f2', name: 'A', tokenImage: 'data:image/png;base64,abc' }, 'https://x/Dossie/'), 'data:image/png;base64,abc');
  assert.equal(retratoDaFicha({ id: 'f3', name: 'B', tokenImage: '/.proxy/Dossie/assets/a.png' }, 'https://x/Dossie/'), '/.proxy/Dossie/assets/a.png');
  assert.equal(retratoDaFicha({ id: 'f4', name: 'C', tokenImage: '   ' }, 'https://x/Dossie/'), null);
});
