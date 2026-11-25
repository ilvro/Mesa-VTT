/**
 * O que a sala faz com cada mensagem de uma conexão já identificada (puro, sem Workers): valida, confere as
 * permissões, grava no estado e devolve as saídas (a quem mandar o quê). `sala.ts` só liga isto às conexões.
 */

import {
  ROLAGENS_NO_BEM_VINDO, codificarPedaco, decodificarPedaco, lerMensagemParaSala,
  type Eu, type MensagemDaSala, type MsgBemVindo, type MsgBlob,
} from '../src/online/protocolo.ts';
import { ErroEstado, montarMembros, type Estado } from './estado.ts';
import { autorCarimbado, carimbar, envelopeInvalido, permitido } from './permissoes.ts';

/**
 * Destino de uma saída:
 * `remetente` (quem mandou), `outros` (todos menos o remetente), `todos`, `{ ficha: dono }`
 * (o mestre e o dono da ficha, inclusive o remetente) ou `{ para: discordId }` (só as conexões dessa pessoa).
 */
export type Destino = 'remetente' | 'outros' | 'todos' | { ficha: string } | { para: string };

export interface Saida {
  destino: Destino;
  msg: MensagemDaSala;
  /** Quadros binários que seguem a `msg` aos mesmos destinos (os pedaços de um blob). */
  quadros?: ArrayBuffer[];
}

const PREFIXO_PROJETOR = 'atlas:projetor:';
/** Prefixo dos blobs de `estado` comprimido (`estado:<mapa>:<versao>`): o id se repete entre sessões, então vale o mais novo. */
const PREFIXO_ESTADO = 'estado:';
const INTERVALO_PING_MS = 1000;
const ultimoPingPorEstado = new WeakMap<Estado, Map<string, number>>();
function podePingar(estado: Estado, discordId: string, agora: number): boolean {
  let porPessoa = ultimoPingPorEstado.get(estado);
  if (!porPessoa) { porPessoa = new Map(); ultimoPingPorEstado.set(estado, porPessoa); }
  const anterior = porPessoa.get(discordId);
  if (anterior !== undefined && agora - anterior < INTERVALO_PING_MS) return false;
  porPessoa.set(discordId, agora);
  return true;
}

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const blobIdDe = (v: unknown): string[] => (ehObj(v) && typeof v.blobId === 'string' && v.blobId ? [v.blobId] : []);

/** Os `blobId` que uma mensagem de canal cita: o `estado` comprimido, o `retrato` e a `inspecao`. */
export function blobsCitadosPor(msg: unknown): string[] {
  if (!ehObj(msg)) return [];
  if (msg.tipo === 'estado') return msg.comprimido === true && typeof msg.blobId === 'string' && msg.blobId ? [msg.blobId] : [];
  if (msg.tipo === 'retrato') return blobIdDe(msg.blob);
  if (msg.tipo === 'inspecao') return [...blobIdDe(msg.normal), ...blobIdDe(msg.uv)];
  return [];
}

/** Quadros de um blob completo, na ordem em que o mestre os mandou: o anúncio e os pedaços binários. */
export interface BlobParaEnviar { anuncio: MsgBlob; quadros: ArrayBuffer[] }

/** O que mandar a quem chegou depois do `bem-vindo`: os blobs citados nos últimos `canal` guardados e a capa da sala. Os incompletos são pulados. */
export function blobsParaQuemChega(estado: Estado): BlobParaEnviar[] {
  const ids = new Set(estado.blobsCitados());
  const capa = estado.config().capaBlobId;
  if (capa) ids.add(capa);
  const saida: BlobParaEnviar[] = [];
  for (const id of ids) {
    const pedacos = estado.pedacosDoBlob(id);
    if (!pedacos || pedacos.length === 0) continue;
    saida.push({
      anuncio: { tipo: 'blob', id, tipoMime: pedacos[0]!.cab.tipo },
      quadros: pedacos.map(p => codificarPedaco(p.cab, p.dados)),
    });
  }
  return saida;
}

/** O que mandar a quem chegou depois, além dos blobs: o último `jukebox.mix` (o envelope carimbado), como um `evento` comum. */
export function eventosParaQuemChega(estado: Estado): MensagemDaSala[] {
  const mix = estado.ultimoMix();
  return mix ? [{ tipo: 'evento', envelope: mix }] : [];
}

const erro = (motivo: string, recusado?: string): Saida => ({
  destino: 'remetente',
  msg: recusado === undefined ? { tipo: 'erro', motivo } : { tipo: 'erro', motivo, recusado },
});

/** Papel efetivo: `mestre` só para o dono da sala. */
export function papelNaSala(discordId: string, dono: string | undefined): 'mestre' | 'jogador' {
  return dono !== undefined && discordId === dono ? 'mestre' : 'jogador';
}

/** `membros` para todos, a cada entrada e saída. */
export function saidaMembros(estado: Estado, conectados: readonly Eu[]): Saida {
  return { destino: 'todos', msg: { tipo: 'membros', membros: montarMembros(conectados, id => estado.personagem(id)) } };
}

/** O `bem-vindo` de quem acabou de entrar: `conectados` já inclui `eu`. */
export function bemVindo(estado: Estado, eu: Eu, conectados: readonly Eu[], agora?: number): MsgBemVindo {
  const guardadas = estado.fichas(eu.papel === 'mestre' ? undefined : eu.discordId);
  const revs: Record<string, number> = {};
  const donos: Record<string, string> = {};
  for (const f of guardadas) {
    revs[f.id] = f.rev;
    donos[f.id] = f.dono;
  }
  return {
    tipo: 'bem-vindo',
    eu,
    membros: montarMembros(conectados, id => estado.personagem(id)),
    fichas: guardadas.map(f => f.ficha),
    ultimoEstado: estado.ultimoEstado(),
    config: estado.config(),
    revs,
    donos,
    rolagens: estado.rolagens(ROLAGENS_NO_BEM_VINDO),
    ...(agora !== undefined ? { agora } : {}),
  };
}

/** Trata um quadro de texto de uma conexão identificada. */
export function tratar(estado: Estado, eu: Eu, texto: string, agora: number, conectados: readonly Eu[]): Saida[] {
  const msg = lerMensagemParaSala(texto);
  if (!msg || msg.tipo === 'ola') return [erro('formato')];

  if (msg.tipo === 'evento') {
    // evento fora do catálogo ou malformado: recusado antes de olhar o papel
    if (envelopeInvalido(msg.envelope) !== null) return [erro('invalido', msg.envelope.tipo)];
  }
  if (!permitido(msg, eu, estado)) return [erro('permissao', msg.tipo === 'evento' ? msg.envelope.tipo : msg.tipo)];

  switch (msg.tipo) {
    case 'ping':
      return [{ destino: 'remetente', msg: { tipo: 'pong', em: msg.em, agora } }];
    case 'canal': {
      if (!msg.nome.startsWith(PREFIXO_PROJETOR)) return [erro('invalido', 'canal')];
      const dentro = msg.msg as { tipo?: unknown } | null;
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'estado') estado.guardarUltimo(msg.nome, msg.msg);
      if (dentro && typeof dentro === 'object' && (dentro.tipo === 'estado' || dentro.tipo === 'retrato' || dentro.tipo === 'inspecao')) {
        const ids = blobsCitadosPor(msg.msg);
        estado.guardarCitados(msg.nome, dentro.tipo, ids);
        // chegou uma versão nova do estado: a antiga do mesmo mapa não serve mais
        const nova = dentro.tipo === 'estado' ? ids[0] : undefined;
        if (nova?.startsWith(PREFIXO_ESTADO)) estado.apagarBlobsComPrefixo(nova.slice(0, nova.lastIndexOf(':') + 1), nova);
      }
      return [{ destino: 'outros', msg: { tipo: 'canal', nome: msg.nome, msg: msg.msg } }];
    }
    case 'evento': {
      const envelope = carimbar(msg.envelope, eu, estado.idsDoDono(eu.discordId));
      if (envelope.tipo === 'mesa.ping' && !podePingar(estado, eu.discordId, agora)) return [];
      if (envelope.tipo === 'ficha.rolagem') estado.registrarRolagem(envelope, eu.discordId, agora);
      if (envelope.tipo === 'jukebox.mix') estado.guardarMix(envelope);
      if (envelope.tipo === 'jukebox.efeito-tocado') {
        const id = (envelope.dados as { faixaId?: unknown } | undefined)?.faixaId;
        if (typeof id === 'string' && id) estado.lembrarEfeito(id);
      }
      return [{ destino: 'outros', msg: { tipo: 'evento', envelope } }];
    }
    case 'ficha.salvar': {
      try {
        const r = estado.salvarFicha(msg.ficha, eu.discordId, msg.rev, agora);
        return [{
          destino: { ficha: r.dono },
          msg: { tipo: 'ficha.atualizada', ficha: msg.ficha, rev: r.rev, autor: autorCarimbado(eu, estado.idsDoDono(eu.discordId)), dono: r.dono, ...(r.conflito ? { conflito: true } : {}) },
        }];
      } catch (e) {
        if (e instanceof ErroEstado) return [erro(e.codigo, msg.tipo)];
        throw e;
      }
    }
    case 'ficha.entregar': {
      const antigo = estado.donoDaFicha(msg.fichaId);
      const f = estado.entregarFicha(msg.fichaId, msg.dono);
      if (!f) return [erro('inexistente', msg.tipo)];
      const saidas: Saida[] = [{
        destino: { ficha: f.dono },
        msg: { tipo: 'ficha.atualizada', ficha: f.ficha, rev: f.rev, autor: autorCarimbado(eu, estado.idsDoDono(eu.discordId)), dono: f.dono },
      }];
      // quem perdeu a ficha (um jogador, não o mestre) a tira da lista; e deixa de tê-la como personagem
      if (antigo !== null && antigo !== f.dono && antigo !== eu.discordId) {
        saidas.push({ destino: { para: antigo }, msg: { tipo: 'ficha.removida', id: msg.fichaId } }, saidaMembros(estado, conectados));
      }
      return saidas;
    }
    case 'rolagens.historico':
      return [{ destino: 'remetente', msg: { tipo: 'rolagens.historico', rolagens: estado.rolagens() } }];
    case 'membro.personagem':
      estado.escolherPersonagem(eu.discordId, msg.fichaId);
      return [saidaMembros(estado, conectados)];
    case 'sala.config':
      estado.definirConfig(msg.nome, msg.capaBlobId);
      return [{ destino: 'todos', msg: { tipo: 'config', config: estado.config() } }];
    case 'blob.tem': {
      const tamanho = estado.tamanhoDoBlob(msg.id);
      return [{ destino: 'remetente', msg: { tipo: 'blob.tem', id: msg.id, tem: tamanho !== null, ...(tamanho !== null ? { tamanho } : {}) } }];
    }
    case 'blob.pedir': {
      if (!estado.blobsPedidos().includes(msg.id)) return [erro('permissao', msg.tipo)];
      const pedacos = estado.pedacosDoBlob(msg.id);
      if (!pedacos || pedacos.length === 0) return [erro('inexistente', msg.tipo)];
      return [{
        destino: 'remetente',
        msg: { tipo: 'blob', id: msg.id, tipoMime: pedacos[0]!.cab.tipo },
        quadros: pedacos.map(p => codificarPedaco(p.cab, p.dados)),
      }];
    }
    case 'blob':
      // `estado:<mapa>:<versao>` pode voltar com outro conteúdo (a versão recomeça numa sessão nova): o novo substitui
      if (msg.id.startsWith(PREFIXO_ESTADO)) estado.apagarBlob(msg.id);
      // o id não se repete: se já está completo, o anúncio é ignorado
      return estado.temBlob(msg.id) ? [] : [{ destino: 'outros', msg: { tipo: 'blob', id: msg.id, tipoMime: msg.tipoMime } }];
  }
}

/** Trata um quadro binário (pedaço de blob). Só o mestre guarda; devolve se o quadro deve ser repassado. */
export function tratarBinario(estado: Estado, eu: Eu, quadro: ArrayBuffer): { saidas: Saida[]; repassar: boolean } {
  if (eu.papel !== 'mestre') return { saidas: [erro('permissao', 'blob')], repassar: false };
  const p = decodificarPedaco(quadro);
  if (!p) return { saidas: [erro('formato', 'blob')], repassar: false };
  if (estado.temBlob(p.cab.id)) return { saidas: [], repassar: false };
  try {
    estado.guardarPedaco(p.cab, p.dados);
  } catch (e) {
    if (e instanceof ErroEstado) return { saidas: [erro(e.codigo, 'blob')], repassar: false };
    throw e;
  }
  return { saidas: [], repassar: true };
}
