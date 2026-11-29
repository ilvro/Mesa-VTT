/**
 * Ponte do jogador: traz da sala (Cloudflare) para o `BroadcastChannel` local o que o mestre projeta, e leva à sala os eventos permitidos.
 * Plano: `Atlas/docs/plano/mesa-online.md` (R7, decisões 5 e 8). O cliente da sala e o `BroadcastChannel` entram por parâmetro, para os testes.
 *
 * Os canais locais têm o prefixo da sala (`sala:<id>:…`) e nunca são os do mestre (`atlas:projetor:*`, `mesa:eventos`): abrir o link do
 * jogador no navegador do mestre não cria eco nem mistura eventos que não passaram pela sala. `abrir` recusa qualquer nome fora do prefixo.
 *
 * Fichas (R11): no canal `sala:<id>:mesa:eventos`, a ponte atende os pedidos do Dossiê em modo jogador pelo barramento normal:
 * `sala.fichas` (as fichas do `bem-vindo` e das atualizações) e `sala.salvar-ficha` (vira `ficha.salvar` na sala, com o `rev` mais recente
 * que a ponte conhece). Cada `ficha.atualizada` da sala vira o fato `sala.ficha-atualizada` no canal local, com o `autor` que a sala carimbou (R13),
 * e `ficha.removida` (a ficha foi entregue a outro jogador) vira `sala.ficha-removida`: a ponte a esquece e o Dossiê a tira da lista.
 */
import { CONTRATO, criarBarramento, validarEvento } from '#mesa';
import type { ClienteDaSala } from '../online/cliente.ts';
import { descomprimirEstado } from '../online/estado-comprimido.ts';
import type { Envelope, Eu, FichaDaSala } from '../online/protocolo.ts';

/** Os eventos que o jogador pode mandar à sala (a sala confere de novo e carimba o autor). */
export const EVENTOS_DO_JOGADOR: readonly string[] = ['ficha.rolagem', 'ficha.recursos', 'atlas.mover-peca', 'mesa.ping'];
/** Quanto a ponte espera um blob que ainda não chegou antes de descartar a mensagem que o cita. */
export const PRAZO_DO_BLOB_MS = 15_000;

export const canalProjetorDaSala = (salaId: string): string => `sala:${salaId}:atlas:projetor`;
export const canalEventosDaSala = (salaId: string): string => `sala:${salaId}:mesa:eventos`;

/** O pedaço do `BroadcastChannel` que a ponte usa. */
export interface CanalLocal {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}

export interface OpcoesDaPonteDoJogador {
  cliente: ClienteDaSala;
  salaId: string;
  criarCanal: (nome: string) => CanalLocal;
  /** Agenda uma espera e devolve o cancelamento (padrão: `setTimeout`). Para testes. */
  agendar?: (f: () => void, ms: number) => () => void;
  prazoDoBlobMs?: number;
  /** A primeira vez que um `estado` foi entregue ao projetor local (a sala já tem mapa). */
  aoTerMapa?: () => void;
  /** O mestre encerrou a sessão / fechou a mesa online: volta ao estado sem mapa. */
  aoSemMapa?: () => void;
  /** Chamado quando o Dossiê pede `sala.fichas` (sinal de que carregou e registrou seus listeners). */
  aoDossiePronto?: () => void;
  /** Chamado quando o mestre projeta ou fecha a projeção de uma ficha em tela cheia. */
  aoProjetarFicha?: (projecao: { fichaId: string; ficha?: FichaDaSala } | null) => void;
  aviso?: (texto: string) => void;
}

export interface PonteDoJogador {
  /** Já chegou algum `estado` do mestre? */
  readonly temMapa: boolean;
  /** Resolve quando tudo o que estava na fila de entrada foi tratado. */
  esvaziar(): Promise<void>;
  fechar(): void;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const ehRefDeBlob = (v: unknown): v is { blobId: string } => ehObj(v) && typeof v.blobId === 'string' && Object.keys(v).length === 1;

/** O evento local pode ir à sala? Tipo permitido a jogador e sem `autor` (o que tem `autor` veio da sala). */
export function eventoPodeSair(e: unknown): e is Envelope {
  if (!ehObj(e) || typeof e.tipo !== 'string' || typeof e.id !== 'string') return false;
  return EVENTOS_DO_JOGADOR.includes(e.tipo) && !('autor' in e);
}

export function criarPonteDoJogador(o: OpcoesDaPonteDoJogador): PonteDoJogador {
  const { cliente, salaId } = o;
  const prefixo = `sala:${salaId}:`;
  const avisar = o.aviso ?? ((t: string) => { console.warn(t); });
  const agendar = o.agendar ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  const prazo = o.prazoDoBlobMs ?? PRAZO_DO_BLOB_MS;
  const abrir = (nome: string): CanalLocal => {
    if (!nome.startsWith(prefixo)) throw new Error(`canal fora da sala: ${nome}`);
    return o.criarCanal(nome);
  };
  const projetor = abrir(canalProjetorDaSala(salaId));
  const eventos = abrir(canalEventosDaSala(salaId));

  // Fichas do jogador: o que a sala tem (o `bem-vindo` e as `ficha.atualizada`), o `rev` de cada uma, quem sou eu e o personagem ativo.
  const fichas = new Map<string, FichaDaSala>();
  const revs = new Map<string, number>();
  let eu: Eu | null = null;
  let personagemAtivo: string | null = null;
  let abriu: () => void = () => {};
  const aberta = new Promise<void>(r => { abriu = r; });
  const barramento = criarBarramento({ app: 'mesa', campanhaId: null, criarCanal: () => abrir(canalEventosDaSala(salaId)), aviso: avisar });

  const blobs = new Map<string, Blob>();
  const esperando = new Map<string, Set<(b: Blob | null) => void>>();
  let fechada = false, temMapa = false;
  let ultimoEstado: unknown = null, ultimaCamera: unknown = null, ultimoControle: unknown = null, ultimaVisaoRemota: unknown = null;
  let ultimaProjecaoFicha: { fichaId: string; ficha?: FichaDaSala } | null = null;
  const ultimosRetratos = new Map<string, unknown>();
  const retratoBlobIds = new Map<string, string>();
  const pedidosRetrato = new Map<string, number>();

  function emitirRetratoSeTiver(id: string): boolean {
    if (ultimosRetratos.has(id)) {
      projetor.postMessage(ultimosRetratos.get(id));
      return true;
    }
    const bid = retratoBlobIds.get(id);
    if (bid && blobs.has(bid)) {
      const m = { tipo: 'retrato', id, blob: blobs.get(bid)! };
      ultimosRetratos.set(id, m);
      projetor.postMessage(m);
      return true;
    }
    return false;
  }

  function pedirRetratoFaltante(id: string): void {
    if (!id || emitirRetratoSeTiver(id)) return;
    const agora = Date.now();
    if (agora - (pedidosRetrato.get(id) ?? 0) < 2000) return;
    pedidosRetrato.set(id, agora);
    const bid = retratoBlobIds.get(id);
    if (bid) cliente.enviar({ tipo: 'blob.pedir', id: bid });
    cliente.enviar({ tipo: 'pedir-retrato', id });
  }

  /** O blob `id`: o que já chegou, ou o que chegar em até `prazo` ms; `null` depois disso. */
  function blob(id: string): Promise<Blob | null> {
    const ja = blobs.get(id);
    if (ja) return Promise.resolve(ja);
    return new Promise(resolver => {
      let cancelar: () => void = () => {};
      const fila = esperando.get(id) ?? new Set();
      esperando.set(id, fila);
      const f = (b: Blob | null) => { cancelar(); fila.delete(f); if (!fila.size) esperando.delete(id); resolver(b); };
      fila.add(f);
      cancelar = agendar(() => { avisar(`Sala: o blob ${id} não chegou em ${prazo / 1000} s; a mensagem foi descartada.`); f(null); }, prazo);
    });
  }

  /** A mensagem do `canal` pronta para o projetor: `{ blobId }` trocado pelo `Blob` e o `estado` comprimido descomprimido; `null` se não deu. */
  async function remontar(msg: unknown): Promise<unknown> {
    if (!ehObj(msg)) return null;
    if (msg.tipo === 'estado' && msg.comprimido === true && typeof msg.blobId === 'string') {
      const b = await blob(msg.blobId);
      if (!b) return null;
      blobs.delete(msg.blobId);
      try { return await descomprimirEstado(b); } catch { avisar(`Sala: o estado ${msg.blobId} não pôde ser descomprimido.`); return null; }
    }
    const saida: Obj = { ...msg };
    for (const [campo, v] of Object.entries(msg)) {
      if (!ehRefDeBlob(v)) continue;
      const b = await blob(v.blobId);
      if (!b) return null;
      saida[campo] = b;
    }
    return saida;
  }

  /** Um de cada vez, na ordem em que chegaram: uma mensagem que espera um blob segura as seguintes (a ordem importa: `estado` antes de `camera`). */
  let fila: Promise<void> = Promise.resolve();
  async function entregar(msg: unknown): Promise<void> {
    if (ehObj(msg) && msg.tipo === 'encerrado') {
      ultimoEstado = null; ultimaCamera = null; ultimoControle = null; ultimaVisaoRemota = null; ultimosRetratos.clear();
      if (ultimaProjecaoFicha !== null) { ultimaProjecaoFicha = null; o.aoProjetarFicha?.(null); }
      if (temMapa) { temMapa = false; o.aoSemMapa?.(); }
      return;
    }
    if (ehObj(msg) && msg.tipo === 'retrato' && typeof msg.id === 'string' && ehRefDeBlob(msg.blob)) {
      retratoBlobIds.set(msg.id, msg.blob.blobId);
    }
    const pronta = await remontar(msg);
    if (!pronta || fechada) return;
    const tipo = (pronta as Obj).tipo;
    if (tipo === 'projetar-ficha') {
      const fichaId = typeof (pronta as Obj).fichaId === 'string' && (pronta as Obj).fichaId ? (pronta as Obj).fichaId as string : null;
      if (fichaId) {
        const f = ehObj((pronta as Obj).ficha) ? (pronta as Obj).ficha as FichaDaSala : fichas.get(fichaId);
        ultimaProjecaoFicha = { fichaId, ...(f ? { ficha: f } : {}) };
        o.aoProjetarFicha?.(ultimaProjecaoFicha);
      } else {
        ultimaProjecaoFicha = null;
        o.aoProjetarFicha?.(null);
      }
      return;
    }
    if (tipo === 'estado') { ultimoEstado = pronta; if (!temMapa) { temMapa = true; o.aoTerMapa?.(); } }
    else if (tipo === 'camera') ultimaCamera = pronta;
    else if (tipo === 'controle-jogadores') ultimoControle = pronta;
    else if (tipo === 'visao-remota') ultimaVisaoRemota = pronta;
    else if (tipo === 'retrato' && typeof (pronta as Obj).id === 'string') ultimosRetratos.set((pronta as Obj).id as string, pronta);
    projetor.postMessage(pronta);
  }
  const enfileirar = (msg: unknown): void => { fila = fila.then(() => entregar(msg)).catch(() => { /* uma mensagem ruim não para a fila */ }); };

  // O projetor local fala `ola` enquanto não tem mapa; o `BroadcastChannel` não guarda mensagens, então a ponte reenvia o último estado e a câmera.
  // Nenhuma `MensagemDoProjetor` sai para a sala, exceto `pedir-retrato` (quando o retrato ainda não está na ponte) e `alternar-porta`.
  projetor.onmessage = ({ data }) => {
    if (!ehObj(data)) return;
    if (data.tipo === 'pedir-retrato' && typeof data.id === 'string' && data.id) {
      pedirRetratoFaltante(data.id);
      return;
    }
    if (data.tipo === 'alternar-porta' && typeof data.id === 'string' && data.id) {
      cliente.enviar({ tipo: 'alternar-porta', id: data.id });
      return;
    }
    if (data.tipo !== 'ola') return;
    if (ultimoEstado) projetor.postMessage(ultimoEstado);
    if (ultimaCamera) projetor.postMessage(ultimaCamera);
    if (ultimoControle) projetor.postMessage(ultimoControle);
    if (ultimaVisaoRemota) projetor.postMessage(ultimaVisaoRemota);
    for (const r of ultimosRetratos.values()) projetor.postMessage(r);
    if (ehObj(ultimoEstado) && ehObj(ultimoEstado.doc) && ehObj(ultimoEstado.doc.tokens)) {
      for (const t of Object.values(ultimoEstado.doc.tokens)) {
        if (ehObj(t) && ehObj(t.portrait) && typeof t.portrait.id === 'string' && t.portrait.id && !ultimosRetratos.has(t.portrait.id)) {
          emitirRetratoSeTiver(t.portrait.id);
        }
      }
    }
  };

  eventos.onmessage = ({ data }) => { if (eventoPodeSair(data)) cliente.enviar({ tipo: 'evento', envelope: data }); };

  barramento.atender('sala.fichas', async () => {
    o.aoDossiePronto?.();
    await aberta;
    const minhas = [...fichas.values()].filter(f => !donos.has(f.id) || !eu || donos.get(f.id) === eu.discordId);
    return {
      ok: true,
      fichas: minhas,
      revs: Object.fromEntries(minhas.filter(f => revs.has(f.id)).map(f => [f.id, revs.get(f.id)])),
      ...(eu ? { eu: { discordId: eu.discordId, nome: eu.nome } } : {}),
      ...(personagemAtivo ? { ativaId: personagemAtivo } : {}),
    };
  });
  barramento.atender('sala.salvar-ficha', dados => {
    const { ficha, rev } = dados as { ficha: FichaDaSala; rev?: number };
    const revAtual = revs.get(ficha.id) ?? (typeof rev === 'number' ? rev : 0);
    if (!cliente.enviar({ tipo: 'ficha.salvar', ficha, rev: revAtual })) return { ok: false, motivo: 'A sala não está conectada.' };
    fichas.set(ficha.id, ficha);
    return { ok: true, rev: revAtual };
  });
  const donos = new Map<string, string>();
  const soltar = [
    cliente.ouvir('bem-vindo', m => {
      eu = m.eu;
      personagemAtivo = m.membros.find(x => x.discordId === m.eu.discordId)?.personagem ?? null;
      fichas.clear(); revs.clear(); donos.clear();
      for (const f of m.fichas) fichas.set(f.id, f);
      for (const [id, r] of Object.entries(m.revs ?? {})) revs.set(id, r);
      for (const [id, d] of Object.entries(m.donos ?? {})) donos.set(id, d);
      abriu();
    }),
    cliente.ouvir('membros', m => {
      if (eu) personagemAtivo = m.membros.find(x => x.discordId === eu!.discordId)?.personagem ?? null;
    }),
    cliente.ouvir('ficha.atualizada', m => {
      if (fechada) return;
      fichas.set(m.ficha.id, m.ficha); revs.set(m.ficha.id, m.rev);
      if (m.dono) donos.set(m.ficha.id, m.dono);
      if (ultimaProjecaoFicha && ultimaProjecaoFicha.fichaId === m.ficha.id) {
        ultimaProjecaoFicha = { fichaId: m.ficha.id, ficha: m.ficha };
        o.aoProjetarFicha?.(ultimaProjecaoFicha);
      }
      const envelope = { contrato: CONTRATO, app: 'mesa', tipo: 'sala.ficha-atualizada', id: crypto.randomUUID(), em: Date.now(), campanhaId: null, dados: { ficha: m.ficha, rev: m.rev, ...(m.conflito ? { conflito: true } : {}) }, autor: m.autor };
      if (validarEvento(envelope).ok) eventos.postMessage(envelope);
    }),
    cliente.ouvir('ficha.removida', m => {
      if (fechada) return;
      fichas.delete(m.id); revs.delete(m.id); donos.delete(m.id);
      const envelope = { contrato: CONTRATO, app: 'mesa', tipo: 'sala.ficha-removida', id: crypto.randomUUID(), em: Date.now(), campanhaId: null, dados: { id: m.id } };
      if (validarEvento(envelope).ok) eventos.postMessage(envelope);
    }),
    cliente.ouvir('canal', m => { if (m.nome.startsWith('atlas:projetor:')) enfileirar(m.msg); }),
    cliente.ouvir('evento', m => { if (!fechada) eventos.postMessage(m.envelope); }),
    cliente.ouvir('bem-vindo', m => {
      const entradas = Object.entries(m.ultimoEstado ?? {}).filter(([nome]) => nome.startsWith('atlas:projetor:'));
      for (const [nome, msg] of entradas) if (!nome.endsWith(':controle') && !nome.includes(':retrato:') && !nome.endsWith(':ficha-projetada')) enfileirar(msg);
      for (const [nome, msg] of entradas) if (nome.includes(':retrato:')) enfileirar(msg);
      for (const [nome, msg] of entradas) if (nome.endsWith(':controle')) enfileirar(msg);
      const projecoes = entradas.filter(([nome]) => nome.endsWith(':ficha-projetada'));
      if (projecoes.length > 0) for (const [, msg] of projecoes) enfileirar(msg);
      else if (ultimaProjecaoFicha !== null) enfileirar({ tipo: 'projetar-ficha', fichaId: null });
    }),
    cliente.ouvirBlob((id, b) => {
      blobs.set(id, b);
      for (const f of [...(esperando.get(id) ?? [])]) f(b);
      for (const [rid, bid] of retratoBlobIds) {
        if (bid === id && !ultimosRetratos.has(rid)) {
          const msg = { tipo: 'retrato', id: rid, blob: b };
          ultimosRetratos.set(rid, msg);
          projetor.postMessage(msg);
        }
      }
    }),
  ];

  return {
    get temMapa() { return temMapa; },
    esvaziar: async () => { let atual; do { atual = fila; await atual; } while (atual !== fila); },
    fechar() {
      fechada = true;
      for (const f of soltar) f();
      for (const fs of [...esperando.values()]) for (const f of [...fs]) f(null);
      projetor.onmessage = null; eventos.onmessage = null;
      barramento.fechar();
      projetor.close(); eventos.close();
    },
  };
}
