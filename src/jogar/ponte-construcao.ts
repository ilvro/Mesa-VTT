/**
 * Ponte do modo construção colaborativo (S7): liga a sala (`ClienteDaSala`) ao canal local
 * prefixado `sala:<salaId>:atlas:construcao` do editor remoto do Atlas (`#/construir-remoto/<salaId>`).
 *
 * Nunca lê nem escreve nos canais do mestre (`atlas:projetor:*` ou `mesa:eventos` sem prefixo).
 */
import type { ClienteDaSala } from '../online/cliente.ts';
import { LIMITE_ESTADO_BYTES, comprimirEstado, descomprimirEstado } from '../online/estado-comprimido.ts';
import {
  PREFIXO_BLOB_CONSTRUCAO,
  type Autor,
  type ComandoConstrucao,
  type Eu,
  type FichaDaSala,
  type ModoDaSala,
  type NotaConstrucao,
  type OpConstrucao,
  type Papel,
} from '../online/protocolo.ts';
import type { CanalLocal } from './ponte-jogador.ts';

export const PRAZO_DO_BLOB_MS = 15_000;
export const MAX_ATIVIDADES = 50;
export const MAX_NOTAS = 100;

export const canalConstrucaoDaSala = (salaId: string): string => `sala:${salaId}:atlas:construcao`;

/** O endereço do projetor remoto do Atlas para esta sala. */
export const enderecoDoProjetorRemoto = (base: string, salaId: string): string =>
  `${base}#/projetor-remoto/${encodeURIComponent(salaId)}`;

/** O endereço do editor colaborativo remoto do Atlas para esta sala. */
export const enderecoDaConstrucaoRemota = (base: string, salaId: string): string =>
  `${base}#/construir-remoto/${encodeURIComponent(salaId)}`;

/** Seleciona a URL do iframe do Atlas de acordo com o modo atual da sala. */
export const enderecoDoAtlasNoModo = (modo: ModoDaSala, baseAtlas: string, salaId: string): string =>
  modo === 'construcao'
    ? enderecoDaConstrucaoRemota(baseAtlas, salaId)
    : enderecoDoProjetorRemoto(baseAtlas, salaId);

const COR_MESTRE = '#f59e0b';
const PALETA_JOGADORES = [
  '#38bdf8',
  '#34d399',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
  '#f472b6',
  '#60a5fa',
] as const;

/** Mesma paleta e hash FNV-1a de `Atlas/src/domain/pings.ts`, para o painel e o cursor no canvas terem a mesma cor. */
export function corDoColaborador(discordId: string, papel: Papel): string {
  if (papel === 'mestre') return COR_MESTRE;
  let h = 2166136261;
  for (let i = 0; i < discordId.length; i++) {
    h ^= discordId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETA_JOGADORES[(h >>> 0) % PALETA_JOGADORES.length]!;
}

const CLASSES_ROTULO: Record<string, string> = {
  combatente: 'Combatente',
  especialista: 'Especialista',
  ocultista: 'Ocultista',
  mundano: 'Mundano',
};

export function formatarHora(em: number): string {
  if (!Number.isFinite(em)) return '--:--';
  const d = new Date(em);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function resumoDaFicha(f: FichaDaSala): string {
  const partes: string[] = [];
  const classeRaw = typeof f.classe === 'string' ? f.classe : (typeof f.classeId === 'string' ? f.classeId : '');
  if (classeRaw.trim()) {
    const c = classeRaw.trim();
    partes.push(CLASSES_ROTULO[c.toLowerCase()] ?? (c.charAt(0).toUpperCase() + c.slice(1)));
  }
  if (typeof f.nex === 'number' && Number.isFinite(f.nex)) {
    partes.push(`NEX ${f.nex}%`);
  }
  if (f.systemMode === 'threat' && typeof f.vd === 'number' && Number.isFinite(f.vd)) {
    partes.push(`VD ${f.vd}`);
  }
  if (typeof f.pv === 'number' && Number.isFinite(f.pv)) {
    const max = typeof f.maxPv === 'number' && Number.isFinite(f.maxPv) ? `/${f.maxPv}` : '';
    partes.push(`PV ${f.pv}${max}`);
  }
  if (f.systemMode === 'original') {
    if (f.usaPD && typeof f.pe === 'number' && Number.isFinite(f.pe)) {
      const max = typeof f.maxPe === 'number' && Number.isFinite(f.maxPe) ? `/${f.maxPe}` : '';
      partes.push(`PE ${f.pe}${max}`);
    } else if (typeof f.san === 'number' && Number.isFinite(f.san)) {
      const max = typeof f.maxSan === 'number' && Number.isFinite(f.maxSan) ? `/${f.maxSan}` : '';
      partes.push(`SAN ${f.san}${max}`);
    }
  } else if (typeof f.pd === 'number' && Number.isFinite(f.pd)) {
    const max = typeof f.maxPd === 'number' && Number.isFinite(f.maxPd) ? `/${f.maxPd}` : '';
    partes.push(`PD ${f.pd}${max}`);
  }
  return partes.join(' · ');
}

export interface AtividadeConstrucao {
  rev: number;
  opId: string;
  autor: Autor;
  rotulo: string;
  em: number;
}

export interface MapaDownloadConstrucao {
  mapa: Record<string, unknown>;
  nome: string;
  rev: number;
}

export interface OpcoesDaPonteConstrucao {
  cliente: ClienteDaSala;
  salaId: string;
  criarCanal: (nome: string) => CanalLocal;
  /** Usuário já autenticado no `bem-vindo` (útil quando a ponte abre depois que a sala já conectou). */
  eu?: Eu | null;
  /** Agenda uma espera e devolve o cancelamento (padrão: `setTimeout`). Para testes. */
  agendar?: (f: () => void, ms: number) => () => void;
  prazoDoBlobMs?: number;
  agora?: () => number;
  aoMudarAtividades?: (atividades: AtividadeConstrucao[]) => void;
  aoMudarNotas?: (notas: NotaConstrucao[]) => void;
  aoMudarMapa?: (info: { nome: string; rev: number } | null) => void;
  aoFechar?: () => void;
  aviso?: (texto: string) => void;
}

export interface PonteConstrucao {
  enviarNota(texto: string): boolean;
  mapaParaDownload(): MapaDownloadConstrucao | null;
  esvaziar(): Promise<void>;
  fechar(): void;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const naoNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const enc = new TextEncoder();

function dedupNotas(lista: readonly NotaConstrucao[]): NotaConstrucao[] {
  const vistos = new Set<string>();
  const saida: NotaConstrucao[] = [];
  for (const n of lista) {
    if (vistos.has(n.id)) continue;
    vistos.add(n.id);
    saida.push(n);
  }
  return saida;
}

function nomeDoMapa(mapa: Obj, nome?: string): string {
  if (typeof nome === 'string' && nome.trim()) return nome.trim();
  if (typeof mapa.name === 'string' && mapa.name.trim()) return mapa.name.trim();
  return 'Mapa sem nome';
}

export function criarPonteConstrucao(o: OpcoesDaPonteConstrucao): PonteConstrucao {
  const { cliente, salaId } = o;
  const prefixo = `sala:${salaId}:`;
  const avisar = o.aviso ?? ((t: string) => { console.warn(t); });
  const agendar = o.agendar ?? ((f, ms) => { const t = setTimeout(f, ms); return () => clearTimeout(t); });
  const agora = o.agora ?? (() => Date.now());
  const prazo = o.prazoDoBlobMs ?? PRAZO_DO_BLOB_MS;

  const abrir = (nome: string): CanalLocal => {
    if (!nome.startsWith(prefixo)) throw new Error(`canal fora da sala: ${nome}`);
    return o.criarCanal(nome);
  };
  const canal = abrir(canalConstrucaoDaSala(salaId));

  let eu: Eu | null = o.eu ?? null;
  let canalPronto = false;
  let fechada = false;
  let geracao = 0;

  let mapaAtual: Obj | null = null;
  let revInicial = 0;
  let revAtual = 0;
  let nomeAtual = '';
  let opsAtual: OpConstrucao[] = [];
  let ultimoSnapshot: MapaDownloadConstrucao | null = null;
  let atividades: AtividadeConstrucao[] = [];
  let notas: NotaConstrucao[] = [];

  const blobs = new Map<string, Blob>();
  const esperando = new Map<string, Set<(b: Blob | null) => void>>();
  const blobsDescartados = new Set<string>();
  const snapshotsPendentes = new Set<Promise<void>>();
  const filaEntrada: Array<() => Promise<void>> = [];
  let drenagem: Promise<void> | null = null;

  function cancelarEsperasDeBlob(): void {
    for (const fs of [...esperando.values()]) {
      for (const f of [...fs]) f(null);
    }
  }

  function aguardarBlob(id: string): Promise<Blob | null> {
    const ja = blobs.get(id);
    if (ja) return Promise.resolve(ja);
    return new Promise(resolver => {
      let cancelar: () => void = () => {};
      const fila = esperando.get(id) ?? new Set();
      esperando.set(id, fila);
      const f = (b: Blob | null) => {
        cancelar();
        fila.delete(f);
        if (!fila.size) esperando.delete(id);
        resolver(b);
      };
      fila.add(f);
      cancelar = agendar(() => {
        avisar(`Sala: o blob ${id} não chegou em ${prazo / 1000} s; o estado da construção foi descartado.`);
        f(null);
      }, prazo);
    });
  }

  async function drenar(): Promise<void> {
    while (filaEntrada.length > 0) {
      const tarefa = filaEntrada.shift()!;
      try { await tarefa(); } catch { /* uma mensagem ruim não trava a fila */ }
    }
    drenagem = null;
  }

  function enfileirar(tarefa: () => Promise<void>): void {
    filaEntrada.push(tarefa);
    drenagem ??= drenar();
  }

  function postarEstadoAoCanal(): void {
    if (!mapaAtual || fechada) return;
    canal.postMessage({
      tipo: 'construcao.estado',
      mapa: mapaAtual,
      rev: revInicial,
      ops: opsAtual,
      nome: nomeAtual,
      ...(eu ? { eu } : {}),
    });
  }

  canal.onmessage = ({ data }) => {
    if (fechada || !ehObj(data) || typeof data.tipo !== 'string') return;

    switch (data.tipo) {
      case 'atlas-construcao.pronto': {
        canalPronto = true;
        if (eu) {
          canal.postMessage({ tipo: 'construcao.identidade', discordId: eu.discordId });
        }
        if (mapaAtual) {
          postarEstadoAoCanal();
        } else {
          cliente.enviar({ tipo: 'construcao.ressincronizar' });
        }
        return;
      }
      case 'construcao.comando': {
        if ('autor' in data) return;
        if (!naoNegInt(data.baseRev) || typeof data.opId !== 'string' || !data.opId || !Array.isArray(data.comandos)) return;
        cliente.enviar({
          tipo: 'construcao.comando',
          baseRev: data.baseRev,
          opId: data.opId,
          comandos: data.comandos as ComandoConstrucao[],
          ...(typeof data.rotulo === 'string' ? { rotulo: data.rotulo } : {}),
        });
        return;
      }
      case 'construcao.cursor': {
        if ('autor' in data) return;
        if (!num(data.x) || !num(data.y)) return;
        if (data.levelId !== null && typeof data.levelId !== 'string') return;
        if (typeof data.ferramenta !== 'string' || !data.ferramenta) return;
        cliente.enviar({
          tipo: 'construcao.cursor',
          x: data.x,
          y: data.y,
          levelId: data.levelId,
          ferramenta: data.ferramenta,
          ...(typeof data.pintando === 'boolean' ? { pintando: data.pintando } : {}),
        });
        return;
      }
      case 'construcao.ressincronizar': {
        cliente.enviar({ tipo: 'construcao.ressincronizar' });
        return;
      }
      case 'construcao.snapshot': {
        if ('autor' in data) return;
        if (!naoNegInt(data.rev) || !ehObj(data.mapa)) return;
        const rev = data.rev;
        const mapa = data.mapa;
        const nome = nomeDoMapa(mapa, typeof data.nome === 'string' ? data.nome : nomeAtual);

        ultimoSnapshot = { mapa, nome, rev };
        mapaAtual = mapa;
        revInicial = rev;
        revAtual = Math.max(revAtual, rev);
        nomeAtual = nome;
        opsAtual = opsAtual.filter(op => op.rev > rev);
        o.aoMudarMapa?.({ nome: nomeAtual, rev: revAtual });

        const tarefa = (async () => {
          const tamanho = enc.encode(JSON.stringify(mapa)).length;
          if (tamanho > LIMITE_ESTADO_BYTES) {
            const blobId = `${PREFIXO_BLOB_CONSTRUCAO}${rev}`;
            const comprimido = await comprimirEstado(mapa);
            if (fechada) return;
            const subiu = await cliente.enviarBlob(blobId, comprimido);
            if (!subiu || fechada) return;
            cliente.enviar({
              tipo: 'construcao.snapshot',
              rev,
              blobId,
              ...(nome ? { nome } : {}),
            });
            return;
          }
          if (fechada) return;
          cliente.enviar({
            tipo: 'construcao.snapshot',
            rev,
            mapa,
            ...(nome ? { nome } : {}),
          });
        })();
        snapshotsPendentes.add(tarefa);
        void tarefa.finally(() => { snapshotsPendentes.delete(tarefa); });
        return;
      }
    }
  };

  const soltar = [
    cliente.ouvir('bem-vindo', m => {
      if (fechada) return;
      eu = m.eu;
      if (canalPronto) {
        canal.postMessage({ tipo: 'construcao.identidade', discordId: m.eu.discordId });
      }
    }),

    cliente.ouvir('construcao.estado', m => {
      if (fechada) return;
      geracao++;
      const g = geracao;
      filaEntrada.length = 0;
      cancelarEsperasDeBlob();

      enfileirar(async () => {
        if (fechada || g !== geracao) return;
        let mapa: Obj | null = m.mapa ?? null;
        if (!mapa && m.blobId) {
          if (!blobs.has(m.blobId)) {
            cliente.enviar({ tipo: 'blob.pedir', id: m.blobId });
          }
          const b = await aguardarBlob(m.blobId);
          if (!b || fechada || g !== geracao) return;
          blobs.delete(m.blobId);
          let bruto: unknown;
          try {
            bruto = await descomprimirEstado(b);
          } catch {
            avisar(`Sala: o estado de construção ${m.blobId} não pôde ser descomprimido.`);
            return;
          }
          if (fechada || g !== geracao) return;
          if (!ehObj(bruto)) {
            avisar(`Sala: o estado de construção ${m.blobId} está em formato inválido.`);
            return;
          }
          mapa = bruto;
        }
        if (!mapa || fechada || g !== geracao) return;

        const nome = nomeDoMapa(mapa, m.nome);
        const emFallback = agora();
        mapaAtual = mapa;
        revInicial = m.rev;
        opsAtual = [...m.ops];
        revAtual = m.ops.reduce((acc, op) => Math.max(acc, op.rev), m.rev);
        nomeAtual = nome;
        ultimoSnapshot = { mapa, nome, rev: m.rev };
        atividades = m.ops
          .slice(-MAX_ATIVIDADES)
          .reverse()
          .map(op => ({
            rev: op.rev,
            opId: op.opId,
            autor: op.autor,
            rotulo: op.rotulo?.trim() || 'Edição no mapa',
            em: typeof op.em === 'number' && Number.isFinite(op.em) ? op.em : emFallback,
          }));
        notas = dedupNotas(m.notas ?? []).slice(-MAX_NOTAS);

        o.aoMudarAtividades?.([...atividades]);
        o.aoMudarNotas?.([...notas]);
        o.aoMudarMapa?.({ nome: nomeAtual, rev: revAtual });
        postarEstadoAoCanal();
      });
    }),

    cliente.ouvir('construcao.aplicada', m => {
      if (fechada) return;
      const g = geracao;
      enfileirar(async () => {
        if (fechada || g !== geracao) return;
        const rotulo = m.rotulo?.trim() || 'Edição no mapa';
        const em = agora();
        canal.postMessage({
          tipo: 'construcao.aplicada',
          rev: m.rev,
          opId: m.opId,
          autor: m.autor,
          comandos: m.comandos,
          ...(m.rotulo !== undefined ? { rotulo: m.rotulo } : {}),
        });
        if (!opsAtual.some(op => op.rev === m.rev)) {
          opsAtual = [
            ...opsAtual,
            {
              rev: m.rev,
              opId: m.opId,
              autor: m.autor,
              comandos: m.comandos,
              ...(m.rotulo !== undefined ? { rotulo: m.rotulo } : {}),
              em,
            },
          ];
        }
        revAtual = Math.max(revAtual, m.rev);
        if (!atividades.some(a => a.rev === m.rev && a.opId === m.opId)) {
          atividades = [{ rev: m.rev, opId: m.opId, autor: m.autor, rotulo, em }, ...atividades].slice(0, MAX_ATIVIDADES);
          o.aoMudarAtividades?.([...atividades]);
        }
        if (mapaAtual) {
          o.aoMudarMapa?.({ nome: nomeAtual, rev: revAtual });
        }
      });
    }),

    cliente.ouvir('construcao.cursor', m => {
      if (fechada) return;
      canal.postMessage({
        tipo: 'construcao.cursor',
        autor: m.autor,
        x: m.x,
        y: m.y,
        levelId: m.levelId,
        ferramenta: m.ferramenta,
        ...(m.pintando !== undefined ? { pintando: m.pintando } : {}),
      });
    }),

    cliente.ouvir('construcao.nota', m => {
      if (fechada) return;
      if (notas.some(n => n.id === m.id)) return;
      notas = [...notas, { id: m.id, autor: m.autor, texto: m.texto, em: m.em }].slice(-MAX_NOTAS);
      o.aoMudarNotas?.([...notas]);
    }),

    cliente.ouvir('construcao.fechada', () => {
      if (fechada) return;
      geracao++;
      const g = geracao;
      filaEntrada.length = 0;
      cancelarEsperasDeBlob();
      enfileirar(async () => {
        if (fechada || g !== geracao) return;
        mapaAtual = null;
        revInicial = 0;
        revAtual = 0;
        nomeAtual = '';
        opsAtual = [];
        ultimoSnapshot = null;
        atividades = [];
        notas = [];
        o.aoMudarAtividades?.([]);
        o.aoMudarNotas?.([]);
        o.aoMudarMapa?.(null);
        canal.postMessage({ tipo: 'construcao.fechada' });
        o.aoFechar?.();
      });
    }),

    cliente.ouvirBlob((id, b) => {
      if (fechada || blobsDescartados.delete(id)) return;
      blobs.set(id, b);
      for (const f of [...(esperando.get(id) ?? [])]) f(b);
    }),
  ];

  return {
    enviarNota(texto) {
      const limpo = texto.trim();
      if (!limpo || fechada) return false;
      const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `nota-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return cliente.enviar({ tipo: 'construcao.nota', id, texto: limpo });
    },
    mapaParaDownload() {
      return ultimoSnapshot ? { ...ultimoSnapshot } : null;
    },
    async esvaziar() {
      while (drenagem || snapshotsPendentes.size > 0) {
        if (drenagem) await drenagem;
        if (snapshotsPendentes.size > 0) await Promise.all([...snapshotsPendentes]);
      }
    },
    fechar() {
      if (fechada) return;
      fechada = true;
      geracao++;
      filaEntrada.length = 0;
      for (const f of soltar) f();
      cancelarEsperasDeBlob();
      canal.onmessage = null;
      canal.close();
    },
  };
}
