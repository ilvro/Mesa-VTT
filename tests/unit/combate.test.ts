import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDaRef, type Entidade, type Ref } from '#mesa';
import {
  interpretarEntradaPv,
  montarEstadoDeCombate,
  type EstadoDeIniciativaAtlas,
} from '../../src/dominio/combate.ts';
import type { Recursos } from '../../src/dominio/recursos-das-fichas.ts';

const refFicha = (id: string): Ref => ({ app: 'ficha', tipo: 'ficha', id });
const refEntidade = (id: string): Ref => ({ app: 'mesa', tipo: 'entidade', id });

function criarEntidade(parcial: Partial<Entidade> & Pick<Entidade, 'id' | 'nome' | 'tipo'>): Entidade {
  return {
    campanhaId: 'camp-1',
    criadaPor: 'mesa',
    criadaEm: 1,
    atualizadaEm: 1,
    tags: [],
    notas: '',
    refs: [],
    ...parcial,
  };
}

describe('dominio/combate — montarEstadoDeCombate', () => {
  it('retorna estado desconectado quando eventoAtlas é null', () => {
    const estado = montarEstadoDeCombate(null, [], {});
    assert.deepEqual(estado, {
      conectado: false,
      mapaId: null,
      mapaNome: null,
      ativa: false,
      rodada: 1,
      combatentes: [],
      daVez: null,
    });
  });

  it('lista tokens presentes no mapa quando o combate não está ativo', () => {
    const evento: EstadoDeIniciativaAtlas = {
      tipo: 'iniciativa',
      mapaId: 'mapa-1',
      mapaNome: 'Galpão Abandonado',
      ativa: false,
      rodada: 1,
      atual: 0,
      ordem: [],
      combatentes: [
        { tokenId: 'tok-pj', nome: 'Arthur', jogador: true, estado: 'normal', refs: [refFicha('f-arthur')], pv: 20, pvMax: 20 },
        { tokenId: 'tok-z1', nome: 'Zumbi de Sangue 1', jogador: false, estado: 'normal', refs: [refFicha('f-zumbi')], pv: 45, pvMax: 45 },
      ],
    };

    const estado = montarEstadoDeCombate(evento, [], {});
    assert.equal(estado.conectado, true);
    assert.equal(estado.mapaId, 'mapa-1');
    assert.equal(estado.mapaNome, 'Galpão Abandonado');
    assert.equal(estado.ativa, false);
    assert.equal(estado.rodada, 1);
    assert.equal(estado.daVez, null);
    assert.equal(estado.combatentes.length, 2);
    assert.equal(estado.combatentes[0]?.tokenId, 'tok-pj');
    assert.equal(estado.combatentes[0]?.valorIniciativa, null);
    assert.equal(estado.combatentes[0]?.ehVez, false);
    assert.equal(estado.combatentes[1]?.tokenId, 'tok-z1');
  });

  it('ordena combatentes por iniciativa, marca ehVez/daVez, vincula entidade/retrato e combina recursos de PJs vs ameaças numeradas', () => {
    const retratoArthur = new Blob(['img-arthur'], { type: 'image/png' });
    const retratoZumbi = new Blob(['img-zumbi'], { type: 'image/png' });

    const rArthur = refFicha('f-arthur');
    const rDante = refFicha('f-dante');
    const rZumbi = refFicha('f-zumbi');

    const entidades: Entidade[] = [
      criarEntidade({
        id: 'ent-arthur',
        nome: 'Arthur Cervero',
        tipo: 'personagem',
        refs: [refEntidade('ent-arthur'), rArthur],
        retrato: retratoArthur,
      }),
      criarEntidade({
        id: 'ent-zumbi',
        nome: 'Zumbi de Sangue',
        tipo: 'ameaca',
        refs: [refEntidade('ent-zumbi'), rZumbi],
        retrato: retratoZumbi,
      }),
    ];

    const recursosFichas: Record<string, Recursos> = {
      [chaveDaRef(rArthur)]: { pv: 5, pvMax: 20, pd: 12, pdMax: 30 },
      // Mesmo existindo entrada de ficha para a ameaça, ameaças numeradas devem usar o PV local do token do Atlas!
      [chaveDaRef(rZumbi)]: { pv: 45, pvMax: 45, pd: 0, pdMax: 0 },
    };

    const evento: EstadoDeIniciativaAtlas = {
      tipo: 'iniciativa',
      mapaId: 'mapa-2',
      mapaNome: 'Cripta',
      ativa: true,
      rodada: 3,
      atual: 1,
      ordem: [
        { tokenId: 'tok-z2', valor: 22 },
        { tokenId: 'tok-arthur', valor: 18 },
        { tokenId: 'tok-dante', valor: 14 },
        { tokenId: 'tok-z1', valor: 9 },
      ],
      combatentes: [
        { tokenId: 'tok-arthur', nome: 'Arthur', jogador: true, estado: 'normal', refs: [rArthur], pv: 18, pvMax: 20, pd: 20, pdMax: 30 },
        { tokenId: 'tok-dante', nome: 'Dante', jogador: true, estado: 'normal', refs: [rDante], pv: 10, pvMax: 16, pd: 8, pdMax: 25 },
        { tokenId: 'tok-z1', nome: 'Zumbi 1', jogador: false, estado: 'ferido', refs: [rZumbi], pv: 10, pvMax: 45 },
        { tokenId: 'tok-z2', nome: 'Zumbi 2', jogador: false, estado: 'normal', refs: [rZumbi], pv: 38, pvMax: 45 },
      ],
    };

    const estado = montarEstadoDeCombate(evento, entidades, recursosFichas);

    assert.equal(estado.conectado, true);
    assert.equal(estado.ativa, true);
    assert.equal(estado.rodada, 3);
    assert.deepEqual(
      estado.combatentes.map(c => c.tokenId),
      ['tok-z2', 'tok-arthur', 'tok-dante', 'tok-z1'],
    );

    // Zumbi 2 (índice 0, ameaça numerada): usa PV do Atlas (38/45), não o da ficha (45/45)
    const z2 = estado.combatentes[0]!;
    assert.equal(z2.valorIniciativa, 22);
    assert.equal(z2.ehVez, false);
    assert.equal(z2.pv, 38);
    assert.equal(z2.pvMax, 45);
    assert.equal(z2.critico, false);
    assert.equal(z2.entidadeId, 'ent-zumbi');
    assert.strictEqual(z2.retrato, retratoZumbi);

    // Arthur (índice 1, PJ da vez): usa recursosDasFichas (5/20 = 25% -> critico: true)
    const arthur = estado.combatentes[1]!;
    assert.equal(arthur.valorIniciativa, 18);
    assert.equal(arthur.ehVez, true);
    assert.strictEqual(estado.daVez, arthur);
    assert.equal(arthur.pv, 5);
    assert.equal(arthur.pvMax, 20);
    assert.equal(arthur.pd, 12);
    assert.equal(arthur.pdMax, 30);
    assert.equal(arthur.critico, true);
    assert.equal(arthur.entidadeId, 'ent-arthur');
    assert.equal(arthur.fichaId, 'f-arthur');
    assert.deepEqual(arthur.refFicha, rArthur);
    assert.strictEqual(arthur.retrato, retratoArthur);

    // Dante (índice 2, PJ sem entrada em recursosFichas): fallback para PV/PD do Atlas
    const dante = estado.combatentes[2]!;
    assert.equal(dante.pv, 10);
    assert.equal(dante.pvMax, 16);
    assert.equal(dante.pd, 8);
    assert.equal(dante.pdMax, 25);
    assert.equal(dante.critico, false);
    assert.equal(dante.entidadeId, null);
    assert.equal(dante.fichaId, 'f-dante');

    // Zumbi 1 (índice 3, ameaça numerada com 10/45 <= 25% -> critico: true)
    const z1 = estado.combatentes[3]!;
    assert.equal(z1.pv, 10);
    assert.equal(z1.pvMax, 45);
    assert.equal(z1.critico, true);
  });

  it('também aceita ReadonlyMap<string, Recursos> (como o signal recursosDasFichas)', () => {
    const r = refFicha('f-joui');
    const mapa = new Map<string, Recursos>([
      [chaveDaRef(r), { pv: 3, pvMax: 20, pd: 5, pdMax: 20 }],
    ]);
    const evento: EstadoDeIniciativaAtlas = {
      tipo: 'iniciativa',
      mapaId: 'm1',
      mapaNome: 'Mansão',
      ativa: true,
      rodada: 1,
      atual: 0,
      ordem: [{ tokenId: 't1', valor: 15 }],
      combatentes: [{ tokenId: 't1', nome: 'Joui', jogador: true, estado: 'normal', refs: [r], pv: 20, pvMax: 20 }],
    };

    const estado = montarEstadoDeCombate(evento, [], mapa);
    assert.equal(estado.combatentes[0]?.pv, 3);
    assert.equal(estado.combatentes[0]?.pd, 5);
    assert.equal(estado.combatentes[0]?.critico, true);
  });
});

describe('dominio/combate — interpretarEntradaPv', () => {
  it('interpreta deltas negativos e positivos', () => {
    assert.deepEqual(interpretarEntradaPv('-5'), { delta: -5 });
    assert.deepEqual(interpretarEntradaPv('+4'), { delta: 4 });
    assert.deepEqual(interpretarEntradaPv('  -12  '), { delta: -12 });
    assert.deepEqual(interpretarEntradaPv('+0'), { delta: 0 });
    assert.deepEqual(interpretarEntradaPv('-0'), { delta: 0 });
  });

  it('interpreta valores absolutos não-negativos', () => {
    assert.deepEqual(interpretarEntradaPv('18'), { absoluto: 18 });
    assert.deepEqual(interpretarEntradaPv(' 0 '), { absoluto: 0 });
  });

  it('retorna null para entradas vazias ou inválidas', () => {
    assert.equal(interpretarEntradaPv(''), null);
    assert.equal(interpretarEntradaPv('   '), null);
    assert.equal(interpretarEntradaPv('abc'), null);
    assert.equal(interpretarEntradaPv('12.5'), null);
    assert.equal(interpretarEntradaPv('+-5'), null);
    assert.equal(interpretarEntradaPv('- 5'), null);
  });
});
