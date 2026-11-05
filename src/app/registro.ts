import { computed, signal } from '@preact/signals';
import { criarRef, mesmaRef, type Ref, type Sessao } from '#mesa';
import { acrescentar, ehRepeticao, exportarMarkdown, FATOS_REGISTRADOS, horaDe, lerRegistro, textoDoFato } from '../dominio/registro.ts';
import { adicionar, mover, nomeDoRef, ondeEstaORef, podarNotas, removerItem } from '../dominio/roteiro.ts';
import { chaveDaRef } from '#mesa';
import { abrirNoApp, barramentoDaMesa } from './barramento.ts';
import { campanhaAtiva, entidades, obterRepositorio } from './campanha.ts';
import { avisar, mensagemDe } from './toasts.ts';

/** As sessões da campanha ativa (a mais recente primeiro), a que está aberta e se o registro está ligado. */
export const sessoes = signal<Sessao[]>([]);
export const sessaoAtiva = signal<Sessao | null>(null);
export const gravando = signal(false);
export const linhas = computed(() => lerRegistro(sessaoAtiva.value?.registro ?? ''));
export const roteiroDaSessao = computed(() => sessaoAtiva.value?.roteiro ?? []);
/** As notas de cada item do roteiro, por chave do Ref. O contrato guarda só os Refs; as notas ficam no navegador, junto da sessão. */
export const notasDoRoteiro = signal<Record<string, string>>({});

const chaveDaSessaoAtiva = (campanhaId: string) => `mesa:sessao-ativa:${campanhaId}`;
const chaveDasNotas = (sessaoId: string) => `mesa:roteiro-notas:${sessaoId}`;
const lerJson = (chave: string): unknown => { try { const t = localStorage.getItem(chave); return t ? JSON.parse(t) : null; } catch { return null; } };
const gravarJson = (chave: string, valor: unknown): void => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ } };

export const refDaSessao = (id: string): Ref => criarRef('mesa', 'sessao', id);

const nomeDaRefNaCampanha = (r: Ref): string | undefined => entidades.value.find(e => e.refs.some(x => mesmaRef(x, r)))?.nome;

// ---------- Gravar a sessão no banco (uma de cada vez; o estado em tela já vale) ----------
let gravandoNoBanco = false, gravarDeNovo = false;
async function gravarSessao(): Promise<void> {
  if (gravandoNoBanco) { gravarDeNovo = true; return; }
  gravandoNoBanco = true;
  try { do { gravarDeNovo = false; const s = sessaoAtiva.value; if (s) await obterRepositorio().salvarSessao(s); } while (gravarDeNovo); }
  catch (erro) { avisar(`Não consegui gravar a sessão: ${mensagemDe(erro)}`, true); }
  finally { gravandoNoBanco = false; }
}
function alterarSessao(mudancas: Partial<Pick<Sessao, 'roteiro' | 'registro' | 'nome'>>): void {
  const s = sessaoAtiva.value; if (!s) return;
  const nova = { ...s, ...mudancas };
  sessaoAtiva.value = nova;
  sessoes.value = sessoes.value.map(x => (x.id === nova.id ? nova : x));   // a lista não pode ficar com a cópia velha: “Abrir” de novo leria o registro de antes
  void gravarSessao();
}

// ---------- O registro: ouve os fatos do barramento enquanto a sessão grava ----------
let desligarOuvintes: (() => void)[] = [];
let ultimo: { texto: string; em: number } | null = null;

function registrar(texto: string, nota: boolean, em = Date.now()): void {
  const s = sessaoAtiva.value; if (!s) return;
  alterarSessao({ registro: acrescentar(s.registro, { hora: horaDe(em), texto, nota }) });
}

function ouvirFatos(): void {
  pararDeOuvir();
  const b = barramentoDaMesa(); if (!b) return;
  for (const tipo of FATOS_REGISTRADOS) {
    desligarOuvintes.push(b.ouvir(tipo, e => {
      if (!gravando.value || !sessaoAtiva.value) return;
      if (e.campanhaId && e.campanhaId !== campanhaAtiva.value?.id) return;   // fato de outra campanha
      const texto = textoDoFato({ tipo: e.tipo, dados: e.dados }, nomeDaRefNaCampanha);
      if (!texto || ehRepeticao(ultimo, texto, e.em)) return;
      ultimo = { texto, em: e.em };
      registrar(texto, false, e.em);
    }));
  }
}
function pararDeOuvir(): void { desligarOuvintes.forEach(f => f()); desligarOuvintes = []; }

function lembrarSessaoAtiva(): void {
  const c = campanhaAtiva.value; if (!c) return;
  const s = sessaoAtiva.value;
  if (s) gravarJson(chaveDaSessaoAtiva(c.id), { id: s.id, gravando: gravando.value }); else try { localStorage.removeItem(chaveDaSessaoAtiva(c.id)); } catch { /* ignora */ }
}

function abrirNaTela(s: Sessao, ligar: boolean): void {
  sessaoAtiva.value = s; ultimo = null;
  notasDoRoteiro.value = podarNotas(Object(lerJson(chaveDasNotas(s.id))) as Record<string, string>, s.roteiro);
  gravando.value = ligar;
  if (ligar) ouvirFatos(); else pararDeOuvir();
  lembrarSessaoAtiva();
}

/** Lê as sessões da campanha ativa e retoma a que estava aberta neste navegador (com o registro ligado, se estava). */
export async function carregarSessoes(): Promise<void> {
  const c = campanhaAtiva.value;
  if (!c) { sessoes.value = []; sessaoAtiva.value = null; gravando.value = false; pararDeOuvir(); return; }
  try {
    const lista = await obterRepositorio().listarSessoes(c.id);
    sessoes.value = lista;
    const guardada = Object(lerJson(chaveDaSessaoAtiva(c.id))) as { id?: string; gravando?: boolean };
    const s = lista.find(x => x.id === guardada.id);
    if (s && sessaoAtiva.value?.id !== s.id) abrirNaTela(s, guardada.gravando === true);
    else if (!s && sessaoAtiva.value) { sessaoAtiva.value = null; gravando.value = false; pararDeOuvir(); }
  } catch (erro) { console.warn('Mesa: não consegui ler as sessões', erro); }
}

/** Começa uma sessão: cria o registro no banco, liga a escuta e avisa os outros aplicativos (`mesa.sessao-iniciada`). */
export async function iniciarSessao(nome: string): Promise<Sessao | null> {
  const c = campanhaAtiva.value; if (!c) return null;
  const agora = Date.now();
  const sessao: Sessao = { id: crypto.randomUUID(), campanhaId: c.id, nome: nome.trim() || `Sessão de ${new Date(agora).toLocaleDateString('pt-BR')}`, data: agora, roteiro: [], registro: '', criadaEm: agora, atualizadaEm: agora };
  try { await obterRepositorio().salvarSessao(sessao); } catch (erro) { avisar(mensagemDe(erro), true); return null; }
  sessoes.value = [sessao, ...sessoes.value];
  abrirNaTela(sessao, true);
  const b = barramentoDaMesa();
  if (b) { b.campanhaId = c.id; try { b.emitir('mesa.sessao-iniciada', { sessao: refDaSessao(sessao.id) }); } catch (erro) { console.warn('Mesa: não consegui avisar a sessão iniciada', erro); } }
  avisar(`Sessão “${sessao.nome}” iniciada.`);
  return sessao;
}

/** Abre uma sessão que já existe e volta a gravar nela. */
export function continuarSessao(id: string): void {
  const s = sessoes.value.find(x => x.id === id); if (!s) return;
  abrirNaTela(s, true);
}

/** Para de gravar. A sessão continua aberta para ler, exportar e anotar. */
export function encerrarSessao(): void { gravando.value = false; pararDeOuvir(); lembrarSessaoAtiva(); }
/** Volta a gravar na sessão aberta. */
export function retomarGravacao(): void { if (sessaoAtiva.value) { gravando.value = true; ouvirFatos(); lembrarSessaoAtiva(); } }
export function fecharSessao(): void { gravando.value = false; pararDeOuvir(); sessaoAtiva.value = null; lembrarSessaoAtiva(); }

/** Uma anotação do mestre no registro (vale mesmo com o registro parado). */
export function anotar(texto: string): void { if (texto.trim()) registrar(texto, true); }

// ---------- O roteiro ----------
export const adicionarAoRoteiro = (r: Ref): void => alterarSessao({ roteiro: adicionar(roteiroDaSessao.value, r) });
export function removerDoRoteiro(i: number): void {
  const novo = removerItem(roteiroDaSessao.value, i);
  alterarSessao({ roteiro: novo });
  salvarNotas(podarNotas(notasDoRoteiro.value, novo));
}
export const moverNoRoteiro = (i: number, delta: -1 | 1): void => alterarSessao({ roteiro: mover(roteiroDaSessao.value, i, delta) });
function salvarNotas(notas: Record<string, string>): void { notasDoRoteiro.value = notas; const s = sessaoAtiva.value; if (s) gravarJson(chaveDasNotas(s.id), notas); }
export function definirNotaDoItem(r: Ref, texto: string): void { salvarNotas({ ...notasDoRoteiro.value, [chaveDaRef(r)]: texto }); }

/** Abre o item do roteiro no aplicativo dono (o Atlas foca o mapa, a Ficha abre a ficha, o Jukebox toca a cena…). */
export const abrirItemDoRoteiro = (r: Ref): Promise<'atendido' | 'aba' | 'falhou'> => abrirNoApp(r);

// ---------- Exportar ----------
export function markdownDaSessao(): string | null {
  const s = sessaoAtiva.value; if (!s) return null;
  return exportarMarkdown({
    nome: s.nome, dataTexto: new Date(s.data).toLocaleDateString('pt-BR', { dateStyle: 'long' }), registro: s.registro,
    roteiro: s.roteiro.map(r => ({ nome: nomeDoRef(entidades.value, r), onde: ondeEstaORef(r), nota: notasDoRoteiro.value[chaveDaRef(r)] ?? '' })),
  });
}
export function baixarMarkdown(): void {
  const md = markdownDaSessao(), s = sessaoAtiva.value; if (!md || !s) return;
  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = `${s.nome.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'sessao'}.md`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
