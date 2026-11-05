import { signal, computed } from '@preact/signals';
import { abrirRepositorioCampanha, mesmaRef, type Campanha, type Entidade, type Ligacao, type RepositorioCampanha, type Tema, type TipoEntidade } from '#mesa';
import { APP_DA_MESA, filtrarEntidades, podeEditar, type FiltroDeEntidades } from '../dominio/entidades.ts';
import { refDaEntidade, refsMencionados } from '../dominio/notas.ts';
import { trocarTema } from './tema.ts';
import { avisar, mensagemDe } from './toasts.ts';

/** A campanha em que o mestre está trabalhando. Chave compartilhada com os outros aplicativos da mesa. */
export const CHAVE_CAMPANHA_ATIVA = 'mesa:campanha-ativa';

/** `null` até abrir; `'indisponivel'` quando o navegador não tem IndexedDB (a Mesa avisa e não quebra). */
export const repositorio = signal<RepositorioCampanha | null | 'indisponivel'>(null);
export const campanhas = signal<Campanha[]>([]);
export const campanhaAtiva = signal<Campanha | null>(null);
export const entidades = signal<Entidade[]>([]);

export const filtroTipo = signal<TipoEntidade | null>(null);
export const busca = signal('');
export const selecionadaId = signal<string | null>(null);

export const visiveis = computed(() => filtrarEntidades(entidades.value, { tipo: filtroTipo.value, busca: busca.value } satisfies FiltroDeEntidades));
export const selecionada = computed(() => entidades.value.find(e => e.id === selecionadaId.value) ?? null);

const repo = (): RepositorioCampanha => {
  const r = repositorio.value;
  if (!r || r === 'indisponivel') throw new Error('O banco da campanha não está disponível neste navegador.');
  return r;
};

/** O repositório da campanha, para os módulos que guardam sessões. Lança se o navegador não tem IndexedDB. */
export const obterRepositorio = repo;

function lerCampanhaAtivaSalva(): string | null { try { return localStorage.getItem(CHAVE_CAMPANHA_ATIVA); } catch { return null; } }
function gravarCampanhaAtiva(id: string | null): void { try { if (id) localStorage.setItem(CHAVE_CAMPANHA_ATIVA, id); else localStorage.removeItem(CHAVE_CAMPANHA_ATIVA); } catch { /* sem armazenamento: vale só nesta aba */ } }

export async function iniciarCampanhas(idb?: IDBFactory): Promise<void> {
  try {
    repositorio.value = await abrirRepositorioCampanha({ app: APP_DA_MESA, ...(idb ? { idb } : {}) });
  } catch (erro) {
    console.warn('Mesa: sem banco da campanha', erro);
    repositorio.value = 'indisponivel';
    return;
  }
  await atualizar();
}

/** Relê campanhas e entidades: o Atlas, a Ficha e os outros escrevem no mesmo banco por fora. */
export async function atualizar(): Promise<void> {
  const r = repositorio.value;
  if (!r || r === 'indisponivel') return;
  try {
    const lista = await r.listarCampanhas();
    campanhas.value = lista;
    const id = lerCampanhaAtivaSalva();
    const ativa = lista.find(c => c.id === id) ?? null;
    if (ativa?.id !== campanhaAtiva.value?.id || ativa?.atualizadaEm !== campanhaAtiva.value?.atualizadaEm) campanhaAtiva.value = ativa;
    entidades.value = ativa ? await r.listarEntidades(ativa.id) : [];
    if (selecionadaId.value && !entidades.value.some(e => e.id === selecionadaId.value)) selecionadaId.value = null;
  } catch (erro) { console.warn('Mesa: não consegui atualizar', erro); }
}

/** Quando outra aba troca a campanha ativa, esta acompanha. */
export function observarCampanhaAtiva(): () => void {
  const ouvinte = (e: StorageEvent) => { if (e.key === null || e.key === CHAVE_CAMPANHA_ATIVA) void atualizar(); };
  window.addEventListener('storage', ouvinte);
  return () => window.removeEventListener('storage', ouvinte);
}

export async function escolherCampanha(id: string | null): Promise<void> {
  gravarCampanhaAtiva(id);
  selecionadaId.value = null; busca.value = ''; filtroTipo.value = null;
  await atualizar();
  // A campanha pode ter um tema próprio: ao entrar nela, a mesa inteira o veste.
  const c = campanhaAtiva.value;
  if (c?.tema) trocarTema({ id: c.tema });
}

export async function criarCampanha(nome: string): Promise<Campanha | null> {
  try {
    const c = await repo().criarCampanha({ nome: nome.trim(), sistema: 'ordem-paranormal', tema: null });
    await escolherCampanha(c.id);
    avisar(`Campanha “${c.nome}” criada.`);
    return c;
  } catch (erro) { avisar(mensagemDe(erro), true); return null; }
}

export async function alterarCampanha(c: Campanha, mudancas: Partial<Pick<Campanha, 'nome' | 'sistema' | 'tema'>>): Promise<boolean> {
  try {
    const nova: Campanha = { ...c, ...mudancas, atualizadaEm: Date.now() };
    await repo().salvarCampanha(nova);
    if (mudancas.tema && campanhaAtiva.value?.id === c.id) trocarTema({ id: mudancas.tema } satisfies Tema);
    await atualizar();
    return true;
  } catch (erro) { avisar(mensagemDe(erro), true); await atualizar(); return false; }
}

export async function removerCampanha(c: Campanha): Promise<void> {
  try {
    await repo().removerCampanha(c.id);
    if (campanhaAtiva.value?.id === c.id) await escolherCampanha(null); else await atualizar();
    avisar(`Campanha “${c.nome}” apagada.`);
  } catch (erro) { avisar(mensagemDe(erro), true); }
}

export async function criarEntidade(tipo: TipoEntidade, nome: string, selecionar = true): Promise<Entidade | null> {
  const c = campanhaAtiva.value;
  if (!c) return null;
  try {
    const e = await repo().criarEntidade({ campanhaId: c.id, tipo, nome: nome.trim() });
    await atualizar();
    if (selecionar) selecionadaId.value = e.id;
    return e;
  } catch (erro) { avisar(mensagemDe(erro), true); return null; }
}

/** A entidade ganha o Ref da Mesa (`mesa:mesa/entidade/<id>`), com que as ligações a identificam; assim remover a entidade leva as ligações junto. */
async function comRefDaMesa(e: Entidade): Promise<Entidade> {
  const meu = refDaEntidade(e.id);
  if (e.refs.some(r => mesmaRef(r, meu))) return e;
  const nova = { ...e, refs: [...e.refs, meu] };
  await repo().salvarEntidade(nova);
  return (await repo().obterEntidade(e.id)) ?? nova;
}

/**
 * Faz as ligações `menciona` da entidade (da Mesa) serem exatamente as `[[ligações]]` da nota dela: cria as que faltam e apaga as que saíram.
 * Nome sem destino não vira ligação. Devolve quantas ligações a nota tem agora.
 */
export function sincronizarLigacoes(entidadeId: string): Promise<number> {
  // Uma de cada vez: sair do campo e clicar em “Ler” gravam duas vezes quase juntas, e duas sincronizações ao mesmo tempo se atropelariam.
  const vez = filaDeLigacoes.then(() => sincronizar(entidadeId), () => sincronizar(entidadeId));
  filaDeLigacoes = vez.then(() => undefined, () => undefined);
  return vez;
}
let filaDeLigacoes: Promise<void> = Promise.resolve();

async function sincronizar(entidadeId: string): Promise<number> {
  const r = repo(), fonte = await r.obterEntidade(entidadeId);
  if (!fonte || !podeEditar(fonte)) return 0;
  const todas = await r.listarEntidades(fonte.campanhaId), de = refDaEntidade(fonte.id);
  const alvos = refsMencionados(fonte.notas, todas, de);
  if (alvos.length) {
    await comRefDaMesa(fonte);
    for (const alvo of alvos) { const destino = alvo.app === 'mesa' && alvo.tipo === 'entidade' ? todas.find(e => e.id === alvo.id) : undefined; if (destino) await comRefDaMesa(destino); }
  }
  const atuais: Ligacao[] = (await r.listarLigacoes(fonte.campanhaId, de)).filter(l => l.tipo === 'menciona' && l.criadaPor === APP_DA_MESA && mesmaRef(l.de, de));
  for (const alvo of alvos) if (!atuais.some(l => mesmaRef(l.para, alvo))) await r.ligar({ campanhaId: fonte.campanhaId, de, para: alvo, tipo: 'menciona' });
  for (const l of atuais) if (!alvos.some(a => mesmaRef(a, l.para))) await r.removerLigacao(l.id);
  return alvos.length;
}

/** As ligações `menciona` que partem desta entidade (para a tela e para os testes). */
export async function ligacoesDaEntidade(e: Entidade): Promise<Ligacao[]> {
  return (await repo().listarLigacoes(e.campanhaId, refDaEntidade(e.id))).filter(l => l.tipo === 'menciona');
}

/** Grava uma alteração na entidade. Devolve `false` (com aviso) se o repositório recusar, p. ex. nome vazio ou entidade de outro aplicativo. */
export async function alterarEntidade(e: Entidade, mudancas: Partial<Pick<Entidade, 'nome' | 'tags' | 'notas'>>): Promise<boolean> {
  try {
    await repo().salvarEntidade({ ...e, ...mudancas });
    if (mudancas.notas !== undefined) await sincronizarLigacoes(e.id);
    await atualizar();
    return true;
  } catch (erro) { avisar(mensagemDe(erro), true); await atualizar(); return false; }
}

export async function removerEntidade(e: Entidade): Promise<void> {
  try {
    await repo().removerEntidade(e.id);
    if (selecionadaId.value === e.id) selecionadaId.value = null;
    await atualizar();
    avisar(`“${e.nome}” removida.`);
  } catch (erro) { avisar(mensagemDe(erro), true); }
}
