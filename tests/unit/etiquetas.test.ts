import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { abrirRepositorioCampanha } from '#mesa';
import { renomearTag } from '../../src/dominio/entidades.ts';
import { atualizar, criarCampanha, criarEntidade, entidades, iniciarCampanhas, renomearEtiquetaNaCampanha, repositorio, tagAtiva } from '../../src/app/campanha.ts';

describe('renomearTag', () => {
  it('troca preservando a posição', () => assert.deepEqual(renomearTag(['a', 'Vilão', 'b'], 'vilao', 'Rival'), ['a', 'Rival', 'b']));
  it('funde se o novo nome já existe (sem acento)', () => assert.deepEqual(renomearTag(['vilão', 'x', 'Rival'], 'vilao', 'rival'), ['rival', 'x']));
  it('funde quando o existente vem antes', () => assert.deepEqual(renomearTag(['Rival', 'x', 'vilão'], 'vilao', 'rival'), ['Rival', 'x']));
  it('vazio remove', () => assert.deepEqual(renomearTag(['a', 'b'], 'a', '  '), ['b']));
  it('ausente devolve o mesmo conteúdo', () => assert.deepEqual(renomearTag(['a', 'b'], 'z', 'y'), ['a', 'b']));
  it('limita a 40 caracteres e ignora #', () => assert.equal(renomearTag(['a'], '#a', ' #' + 'x'.repeat(50))[0]?.length, 40));
});

class Mock implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

describe('renomearEtiquetaNaCampanha', () => {
  beforeEach(() => { (globalThis as any).localStorage = new Mock(); tagAtiva.value = null; });

  it('renomeia só o que muda, inclusive entidades de outro app, e ajusta tagAtiva', async () => {
    await iniciarCampanhas(indexedDB);
    const c = (await criarCampanha('Teste etiquetas'))!;
    const minha = (await criarEntidade('personagem', 'Muirenn', false))!;
    const outra = await abrirRepositorioCampanha({ app: 'atlas', idb: indexedDB });
    const doAtlas = await outra.criarEntidade({ campanhaId: c.id, tipo: 'lugar', nome: 'Ilha', tags: ['Vilão', 'mapa'] });
    const intacta = await outra.criarEntidade({ campanhaId: c.id, tipo: 'lugar', nome: 'Vila', tags: ['mapa'] });
    const repo = repositorio.value as any;
    await repo.salvarEntidade({ ...minha, tags: ['vilao'] });
    const antesIntacta = (await repo.obterEntidade(intacta.id)).atualizadaEm;
    await new Promise(r => setTimeout(r, 5));
    await atualizar();
    tagAtiva.value = 'vilao';
    const n = await renomearEtiquetaNaCampanha('vilao', 'Rival');
    assert.equal(n, 2);
    assert.equal(tagAtiva.value, 'rival');
    const por = new Map(entidades.value.map(e => [e.id, e]));
    assert.deepEqual(por.get(doAtlas.id)!.tags, ['Rival', 'mapa']);
    assert.deepEqual(por.get(minha.id)!.tags, ['Rival']);
    assert.equal(por.get(intacta.id)!.atualizadaEm, antesIntacta);

    const m = await renomearEtiquetaNaCampanha('rival', '');
    assert.equal(m, 2);
    assert.equal(tagAtiva.value, null);
    assert.deepEqual(entidades.value.find(e => e.id === doAtlas.id)!.tags, ['mapa']);
  });
});
