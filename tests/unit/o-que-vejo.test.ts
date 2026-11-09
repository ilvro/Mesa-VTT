import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Campanha, Entidade } from '#mesa';
import { campanhaAtiva, entidades, selecionadaId } from '../../src/app/campanha.ts';
import { oQueVejo } from '../../src/app/o-que-vejo.ts';
import { tela } from '../../src/app/rotas.ts';

test('mesa_o_que_vejo: campanha, tela e item aberto', () => {
  campanhaAtiva.value = { id: 'c1', nome: 'Ilha', sistema: 'dnd5e' } as unknown as Campanha;
  entidades.value = [{ id: 'e1', campanhaId: 'c1', tipo: 'personagem', nome: 'Muirenn', refs: [], tags: ['aliada'], notas: '' } as unknown as Entidade];
  tela.value = 'entidades'; selecionadaId.value = null;
  let r = oQueVejo() as Record<string, any>;
  assert.deepEqual(r.campanha, { id: 'c1', nome: 'Ilha', sistema: 'dnd5e' });
  assert.equal(r.tela.id, 'entidades'); assert.equal(r.itemAberto, null); assert.equal(r.sessaoAberta, false);
  selecionadaId.value = 'e1';
  r = oQueVejo();
  assert.deepEqual(r.itemAberto, { id: 'e1', tipo: 'personagem', nome: 'Muirenn', tags: ['aliada'] });
  tela.value = 'sessao';
  assert.equal((oQueVejo() as Record<string, any>).sessaoAberta, true);
  campanhaAtiva.value = null;
  assert.equal((oQueVejo() as Record<string, any>).campanha, null);
});
