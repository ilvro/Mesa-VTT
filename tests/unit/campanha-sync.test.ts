import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  assinaturaCampanhas,
  assinaturaEntidades,
  assinaturaLigacoes,
  atualizar,
  campanhaAtiva,
  campanhas,
  criarCampanha,
  criarEntidade,
  entidades,
  iniciarCampanhas,
  ligacoes,
  repositorio,
} from '../../src/app/campanha.ts';
import {
  agendarSincronizacaoCofre,
  criarDriverEmMemoria,
  definirDriverAtivo,
  sincronizarAgora,
} from '../../src/app/cofre.ts';
import type { Entidade, Ligacao } from '#mesa';

class StorageMock implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

describe('campanha sync e assinaturas (M1)', () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = new StorageMock();
    definirDriverAtivo(null, null);
  });

  it('assinaturas são determinísticas e sensíveis a mudanças sem serializar blobs', () => {
    const blob1 = new Blob(['abc'], { type: 'image/webp' });
    const blob2 = new Blob(['abcdef'], { type: 'image/webp' });

    const e1: Entidade = {
      id: 'e1',
      campanhaId: 'c1',
      tipo: 'personagem',
      nome: 'Arthur',
      refs: [],
      tags: ['ordem'],
      notas: 'Notas',
      retrato: blob1,
      criadaPor: 'mesa',
      criadaEm: 100,
      atualizadaEm: 200,
    };
    const e1Copia: Entidade = { ...e1, refs: [...e1.refs], tags: [...e1.tags] };
    const e1Alterada: Entidade = { ...e1, retrato: blob2 };

    assert.equal(assinaturaEntidades([e1]), assinaturaEntidades([e1Copia]));
    assert.notEqual(assinaturaEntidades([e1]), assinaturaEntidades([e1Alterada]));

    const l1: Ligacao = {
      id: 'l1',
      campanhaId: 'c1',
      de: { app: 'mesa', tipo: 'entidade', id: 'e1' },
      para: { app: 'mesa', tipo: 'entidade', id: 'e2' },
      tipo: 'menciona',
      criadaPor: 'mesa',
      criadaEm: 300,
    };
    assert.equal(assinaturaLigacoes([l1]), assinaturaLigacoes([{ ...l1 }]));
    assert.notEqual(assinaturaLigacoes([l1]), assinaturaLigacoes([{ ...l1, tipo: 'revela' }]));

    const sigC = assinaturaCampanhas([
      { id: 'c1', nome: 'Camp', sistema: 'ordem', tema: null, capa: null, criadaEm: 1, atualizadaEm: 2 },
    ]);
    assert.ok(sigC.includes('Camp'));
  });

  it('atualizar() preserva identidade referencial dos signals quando nada mudou no banco', async () => {
    await iniciarCampanhas(indexedDB);
    await criarCampanha('Campanha Estável');
    await criarEntidade('personagem', 'Investigador', false);

    const refCampanhas = campanhas.value;
    const refAtiva = campanhaAtiva.value;
    const refEntidades = entidades.value;
    const refLigacoes = ligacoes.value;

    await atualizar();

    assert.equal(campanhas.value, refCampanhas);
    assert.equal(campanhaAtiva.value, refAtiva);
    assert.equal(entidades.value, refEntidades);
    assert.equal(ligacoes.value, refLigacoes);
  });

  it('atualizar() coalesce chamadas concorrentes em single-flight', async () => {
    await iniciarCampanhas(indexedDB);
    await criarCampanha('Campanha Concorrente');

    const repo = repositorio.value;
    assert.ok(repo && repo !== 'indisponivel');

    let leituras = 0;
    const originalListar = repo.listarCampanhas.bind(repo);
    repo.listarCampanhas = async () => {
      leituras++;
      await new Promise(r => setTimeout(r, 20));
      return originalListar();
    };

    try {
      await Promise.all([atualizar(), atualizar(), atualizar()]);
      assert.ok(leituras <= 2, `esperava no máximo 2 leituras coalescidas, obteve ${leituras}`);
    } finally {
      repo.listarCampanhas = originalListar;
    }
  });

  it('agendarSincronizacaoCofre ignora gravação no-op quando dados não mudaram após sync', async () => {
    await iniciarCampanhas(indexedDB);
    const c = (await criarCampanha('Campanha Cofre'))!;
    await criarEntidade('pista', 'Diário Rasgado', false);

    const baseDriver = criarDriverEmMemoria();
    let gravacoes = 0;
    const driverEspiao = {
      ...baseDriver,
      async gravarTexto(caminho: string, conteudo: string) {
        gravacoes++;
        return baseDriver.gravarTexto(caminho, conteudo);
      },
    };

    definirDriverAtivo(driverEspiao, 'cofre-teste');
    await sincronizarAgora();
    const gravacoesAposSyncInicial = gravacoes;
    assert.ok(gravacoesAposSyncInicial > 0);

    // Chamar agendarSincronizacaoCofre com exatamente os mesmos dados deve ser no-op
    agendarSincronizacaoCofre(campanhaAtiva.value, entidades.value, ligacoes.value);
    await new Promise(r => setTimeout(r, 900));
    assert.equal(gravacoes, gravacoesAposSyncInicial);

    // Alterar entidade e agendar deve disparar nova gravação
    await criarEntidade('lugar', 'Farol', false);
    assert.equal(c.id, campanhaAtiva.value?.id);
    await new Promise(r => setTimeout(r, 900));
    assert.ok(gravacoes > gravacoesAposSyncInicial);

    definirDriverAtivo(null, null);
  });
});
