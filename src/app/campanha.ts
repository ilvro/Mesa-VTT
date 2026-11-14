import { signal, computed } from '@preact/signals';
import { abrirRepositorioCampanha, mesmaRef, type Campanha, type Entidade, type Ligacao, type Ref, type RepositorioCampanha, type TipoLigacao, type Tema, type TipoEntidade } from '#mesa';
import { APP_DA_MESA, NOME_DO_APP, ehEncontro, filtrarEntidades, podarElenco, podeEditar, podeEditarConteudo, semAcento, type CategoriaFiltro, type FiltroDeEntidades, type OrdemColecao } from '../dominio/entidades.ts';
import { refDaEntidade, refsMencionados } from '../dominio/notas.ts';
import { casaCena, refParaLigacao } from '../dominio/cenas.ts';
import { agendarSincronizacaoCofre } from './cofre.ts';
import { removerQuadrosDaCampanha } from './banco-quadros.ts';
import { trocarTema } from './tema.ts';
import { avisar, mensagemDe } from './toasts.ts';

/** A campanha em que o mestre está trabalhando. Chave compartilhada com os outros aplicativos da mesa. */
export const CHAVE_CAMPANHA_ATIVA = 'mesa:campanha-ativa';

/** `null` até abrir; `'indisponivel'` quando o navegador não tem IndexedDB (a Mesa avisa e não quebra). */
export const repositorio = signal<RepositorioCampanha | null | 'indisponivel'>(null);
export const campanhas = signal<Campanha[]>([]);
export const campanhaAtiva = signal<Campanha | null>(null);
export const entidades = signal<Entidade[]>([]);
export const ligacoes = signal<Ligacao[]>([]);

export const filtroTipo = signal<CategoriaFiltro | null>(null);
export const busca = signal('');
export const tagAtiva = signal<string | null>(null);
export const soElenco = signal<boolean>(false);
export const ordem = signal<OrdemColecao>('nome-asc');
export const sidebarAberta = signal<boolean>(true);
export const selecionadaId = signal<string | null>(null);

export const historico = signal<(string | null)[]>([null]);
export const indiceHistorico = signal<number>(0);
export const podeVoltar = computed(() => indiceHistorico.value > 0);
export const podeAvancar = computed(() => indiceHistorico.value < historico.value.length - 1);

export function registrarSelecaoNoHistorico(id: string | null): void {
  if (historico.value[indiceHistorico.value] === id) return;
  const novo = historico.value.slice(0, indiceHistorico.value + 1);
  novo.push(id);
  historico.value = novo;
  indiceHistorico.value = novo.length - 1;
}

export function voltarSelecao(): void {
  if (indiceHistorico.value > 0) {
    indiceHistorico.value--;
    const id = historico.value[indiceHistorico.value] ?? null;
    selecionadaId.value = id;
    const alvo = id ? `#/entidade/${encodeURIComponent(id)}` : location.pathname + location.search;
    try { history.replaceState(null, '', alvo); } catch { /* ignora */ }
  }
}

export function avancarSelecao(): void {
  if (indiceHistorico.value < historico.value.length - 1) {
    indiceHistorico.value++;
    const id = historico.value[indiceHistorico.value] ?? null;
    selecionadaId.value = id;
    const alvo = id ? `#/entidade/${encodeURIComponent(id)}` : location.pathname + location.search;
    try { history.replaceState(null, '', alvo); } catch { /* ignora */ }
  }
}

export const visiveis = computed(() =>
  filtrarEntidades(
    entidades.value,
    {
      tipo: filtroTipo.value,
      busca: busca.value,
      tag: tagAtiva.value,
      soElenco: soElenco.value,
      ...(campanhaAtiva.value?.elenco !== undefined ? { elenco: campanhaAtiva.value.elenco } : {}),
    },
    ordem.value,
  )
);
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
    if (
      ativa?.id !== campanhaAtiva.value?.id ||
      ativa?.atualizadaEm !== campanhaAtiva.value?.atualizadaEm ||
      JSON.stringify(ativa?.elenco) !== JSON.stringify(campanhaAtiva.value?.elenco)
    ) {
      campanhaAtiva.value = ativa;
    }
    entidades.value = ativa ? await r.listarEntidades(ativa.id) : [];
    ligacoes.value = ativa ? await r.listarLigacoes(ativa.id) : [];
    if (selecionadaId.value && !entidades.value.some(e => e.id === selecionadaId.value)) selecionadaId.value = null;
    if (ativa) agendarSincronizacaoCofre(ativa, entidades.value, ligacoes.value);
  } catch (erro) { console.warn('Mesa: não consegui atualizar', erro); }
}

/** Quando outra aba troca a campanha ativa, esta acompanha. */
export function observarCampanhaAtiva(): () => void {
  const ouvinte = (e: StorageEvent) => { if (e.key === null || e.key === CHAVE_CAMPANHA_ATIVA || e.key === 'mesa:campanha-atualizada') void atualizar(); };
  window.addEventListener('storage', ouvinte);
  return () => window.removeEventListener('storage', ouvinte);
}

export async function escolherCampanha(id: string | null): Promise<void> {
  gravarCampanhaAtiva(id);
  selecionadaId.value = null; busca.value = ''; filtroTipo.value = null; tagAtiva.value = null; soElenco.value = false; ordem.value = 'nome-asc';
  historico.value = [null]; indiceHistorico.value = 0;
  await atualizar();
  // A campanha pode ter um tema próprio: ao entrar nela, a mesa inteira o veste.
  const c = campanhaAtiva.value;
  if (c?.tema) trocarTema({ id: c.tema });
}

export const SISTEMA_PADRAO = 'ordem-paranormal';

/** O caminho do botão "Criar campanha" do hub. `selecionar: false` cria sem trocar a campanha ativa. */
export async function criarCampanha(nome: string, opcoes: { sistema?: string; selecionar?: boolean } = {}): Promise<Campanha | null> {
  try {
    const c = await repo().criarCampanha({ nome: nome.trim(), sistema: opcoes.sistema ?? SISTEMA_PADRAO, tema: null });
    if (opcoes.selecionar === false) await atualizar(); else await escolherCampanha(c.id);
    avisar(`Campanha “${c.nome}” criada.`);
    return c;
  } catch (erro) { avisar(mensagemDe(erro), true); return null; }
}

export async function alterarCampanha(c: Campanha, mudancas: Partial<Pick<Campanha, 'nome' | 'sistema' | 'tema' | 'elenco'>>): Promise<boolean> {
  try {
    const nova: Campanha = { ...c, ...mudancas, atualizadaEm: Math.max(Date.now(), c.atualizadaEm + 1) };
    if (nova.elenco !== undefined) {
      const ents = await repo().listarEntidades(c.id);
      nova.elenco = podarElenco(nova.elenco, ents);
    }
    await repo().salvarCampanha(nova);
    try { localStorage.setItem('mesa:campanha-atualizada', `${c.id}:${nova.atualizadaEm}`); } catch { /* ignora */ }
    if (mudancas.tema && campanhaAtiva.value?.id === c.id) trocarTema({ id: mudancas.tema } satisfies Tema);
    await atualizar();
    return true;
  } catch (erro) { avisar(mensagemDe(erro), true); await atualizar(); return false; }
}

export async function definirElenco(c: Campanha, ids: readonly string[] = []): Promise<boolean> {
  return alterarCampanha(c, { elenco: [...ids] });
}

export async function alternarPersonagemNoElenco(c: Campanha, entidadeId: string): Promise<boolean> {
  const atual = c.elenco ?? [];
  const novo = atual.includes(entidadeId) ? atual.filter(id => id !== entidadeId) : [...atual, entidadeId];
  return alterarCampanha(c, { elenco: novo });
}

export async function salvarElencoDaCampanha(elenco: readonly string[]): Promise<boolean> {
  if (!campanhaAtiva.value) await atualizar();
  const c = campanhaAtiva.value;
  if (!c) return false;
  return alterarCampanha(c, { elenco: [...elenco] });
}

export async function removerCampanha(c: Campanha): Promise<void> {
  try {
    await repo().removerCampanha(c.id);
    await removerQuadrosDaCampanha(c.id);
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
    if (selecionar) {
      selecionadaId.value = e.id;
      registrarSelecaoNoHistorico(e.id);
    }
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
  if (!fonte || !podeEditarConteudo(fonte)) return 0;
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
  if (mudancas.nome !== undefined && mudancas.nome !== e.nome && !podeEditar(e)) {
    avisar(`O nome vem do ${NOME_DO_APP[e.criadaPor] ?? e.criadaPor}: renomeie lá. Etiquetas e notas você edita aqui.`, true);
    return false;
  }
  try {
    await repo().salvarEntidade({ ...e, ...mudancas });
    if (mudancas.notas !== undefined) await sincronizarLigacoes(e.id);
    await atualizar();
    return true;
  } catch (erro) { avisar(mensagemDe(erro), true); await atualizar(); return false; }
}

/** Liga duas referências (uso da ponte do assistente). Entidades da Mesa ganham o Ref da Mesa, para a ligação sair junto quando elas forem removidas. Lança em caso de erro. */
export async function ligarRefs(de: Ref, para: Ref, tipo: TipoLigacao): Promise<Ligacao> {
  const r = repo(), c = campanhaAtiva.value;
  if (!c) throw new Error('Nenhuma campanha selecionada.');
  for (const ref of [de, para]) {
    if (ref.app === 'mesa' && ref.tipo === 'entidade') { const e = await r.obterEntidade(ref.id); if (e && podeEditar(e)) await comRefDaMesa(e); }
  }
  const l = await r.ligar({ campanhaId: c.id, de, para, tipo });
  await atualizar();
  return l;
}

export async function removerEntidade(e: Entidade): Promise<void> {
  try {
    await repo().removerEntidade(e.id);
    if (selecionadaId.value === e.id) {
      selecionadaId.value = null;
      registrarSelecaoNoHistorico(null);
    }
    await atualizar();
    avisar(`“${e.nome}” removida.`);
  } catch (erro) { avisar(mensagemDe(erro), true); }
}

/** Vincula um Mapa/Cômodo como o cenário desta cena (ligação `esta-em`). */
export async function vincularMapaNaCena(cena: Entidade, mapa: Entidade): Promise<boolean> {
  const r = repo();
  const c = campanhaAtiva.value;
  if (!c) return false;
  try {
    await comRefDaMesa(cena);
    await comRefDaMesa(mapa);
    const de = refParaLigacao(cena);
    const para = refParaLigacao(mapa);

    // Substitui mapa anterior da cena caso já exista
    const todas = await r.listarLigacoes(c.id);
    const refCena = refDaEntidade(cena.id);
    const antigas = todas.filter(
      l => l.tipo === 'esta-em' && l.criadaPor === APP_DA_MESA && casaCena(l.de, cena, refCena),
    );
    for (const antiga of antigas) {
      await r.removerLigacao(antiga.id);
    }

    await r.ligar({ campanhaId: c.id, de, para, tipo: 'esta-em' });
    await atualizar();
    avisar(`Mapa “${mapa.nome}” vinculado à cena.`);
    return true;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return false;
  }
}

/** Vincula uma Trilha Sonora/Cena Sonora do Jukebox a esta cena (ligação `toca-em`). */
export async function vincularTrilhaNaCena(cena: Entidade, trilha: Entidade): Promise<boolean> {
  const r = repo();
  const c = campanhaAtiva.value;
  if (!c) return false;
  try {
    await comRefDaMesa(cena);
    await comRefDaMesa(trilha);
    const de = refParaLigacao(cena);
    const para = refParaLigacao(trilha);

    // Substitui trilha anterior da cena caso já exista
    const todas = await r.listarLigacoes(c.id);
    const refCena = refDaEntidade(cena.id);
    const antigas = todas.filter(
      l => l.tipo === 'toca-em' && l.criadaPor === APP_DA_MESA && casaCena(l.de, cena, refCena),
    );
    for (const antiga of antigas) {
      await r.removerLigacao(antiga.id);
    }

    await r.ligar({ campanhaId: c.id, de, para, tipo: 'toca-em' });
    await atualizar();
    avisar(`Trilha sonora “${trilha.nome}” vinculada à cena.`);
    return true;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return false;
  }
}

/** Vincula um participante (personagem ou ameaça) ao encontro da cena (ligação `aparece-em`). */
export async function vincularParticipanteNaCena(cena: Entidade, participante: Entidade): Promise<boolean> {
  const r = repo();
  const c = campanhaAtiva.value;
  if (!c) return false;
  try {
    await comRefDaMesa(cena);
    await comRefDaMesa(participante);
    const de = refParaLigacao(participante);
    const para = refParaLigacao(cena);

    const todas = await r.listarLigacoes(c.id);
    const jaExiste = todas.some(
      l => l.tipo === 'aparece-em' && mesmaRef(l.de, de) && mesmaRef(l.para, para),
    );
    if (!jaExiste) {
      await r.ligar({ campanhaId: c.id, de, para, tipo: 'aparece-em' });
    }
    await atualizar();
    avisar(`“${participante.nome}” adicionado à cena.`);
    return true;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return false;
  }
}

/** Vincula uma pista à cena (ligação `revela`). */
export async function vincularPistaNaCena(cena: Entidade, pista: Entidade): Promise<boolean> {
  const r = repo();
  const c = campanhaAtiva.value;
  if (!c) return false;
  try {
    await comRefDaMesa(cena);
    await comRefDaMesa(pista);
    const de = refParaLigacao(cena);
    const para = refParaLigacao(pista);

    const todas = await r.listarLigacoes(c.id);
    const jaExiste = todas.some(
      l => l.tipo === 'revela' && mesmaRef(l.de, de) && mesmaRef(l.para, para),
    );
    if (!jaExiste) {
      await r.ligar({ campanhaId: c.id, de, para, tipo: 'revela' });
    }
    await atualizar();
    avisar(`Pista “${pista.nome}” vinculada à cena.`);
    return true;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return false;
  }
}

/** Desvincula qualquer item de uma cena (remove a ligação no banco da campanha). */
export async function desvincularDaCena(ligacaoId: string, nomeItem?: string): Promise<boolean> {
  const r = repo();
  try {
    await r.removerLigacao(ligacaoId);
    await atualizar();
    if (nomeItem) {
      avisar(`“${nomeItem}” desvinculado.`);
    } else {
      avisar('Vínculo removido.');
    }
    return true;
  } catch (erro) {
    avisar(mensagemDe(erro), true);
    return false;
  }
}

/** Alterna a marcação da cena como encontro de combate (etiqueta #encontro). */
export async function alternarEncontroDaCena(cena: Entidade): Promise<boolean> {
  const eh = ehEncontro(cena);
  let novasTags: string[];
  if (eh) {
    novasTags = cena.tags.filter(t => {
      const k = semAcento(t.replace(/^#/, '').trim());
      return k !== 'encontro' && k !== 'combate';
    });
  } else {
    novasTags = [...cena.tags, 'encontro'];
  }
  const ok = await alterarEntidade(cena, { tags: novasTags });
  if (ok) {
    avisar(!eh ? 'Cena marcada como encontro de combate.' : 'Removida dos encontros de combate.');
  }
  return ok;
}

/** Define ou remove o momento de abertura de uma cena (etiqueta momento:<id-ou-nome>). */
export async function definirMomentoDaCena(cena: Entidade, momento: string | null): Promise<boolean> {
  const limpo = momento?.trim() ?? '';
  const semMomento = cena.tags.filter(t => !semAcento(t.replace(/^#/, '').trim()).startsWith('momento:'));
  const novasTags = limpo ? [...semMomento, `momento:${limpo}`] : semMomento;
  const ok = await alterarEntidade(cena, { tags: novasTags });
  if (ok) {
    avisar(limpo ? `Momento de abertura “${limpo}” configurado.` : 'Momento de abertura removido.');
  }
  return ok;
}
