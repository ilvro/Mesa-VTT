/**
 * O que a sala faz com cada mensagem de uma conexão já identificada (puro, sem Workers): valida, confere as
 * permissões, grava no estado e devolve as saídas (a quem mandar o quê). `sala.ts` só liga isto às conexões.
 */

import {
  decodificarPedaco, lerMensagemParaSala,
  type Eu, type MensagemDaSala, type MsgBemVindo,
} from '../src/online/protocolo.ts';
import { ErroEstado, montarMembros, type Estado } from './estado.ts';
import { carimbar, envelopeInvalido, permitido } from './permissoes.ts';

/**
 * Destino de uma saída:
 * `remetente` (quem mandou), `outros` (todos menos o remetente), `todos`, ou `{ ficha: dono }`
 * (o mestre e o dono da ficha, inclusive o remetente).
 */
export type Destino = 'remetente' | 'outros' | 'todos' | { ficha: string };

export interface Saida {
  destino: Destino;
  msg: MensagemDaSala;
}

const PREFIXO_PROJETOR = 'atlas:projetor:';

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
export function bemVindo(estado: Estado, eu: Eu, conectados: readonly Eu[]): MsgBemVindo {
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
    case 'canal': {
      if (!msg.nome.startsWith(PREFIXO_PROJETOR)) return [erro('invalido', 'canal')];
      const dentro = msg.msg as { tipo?: unknown } | null;
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'estado') estado.guardarUltimo(msg.nome, msg.msg);
      return [{ destino: 'outros', msg: { tipo: 'canal', nome: msg.nome, msg: msg.msg } }];
    }
    case 'evento': {
      const envelope = carimbar(msg.envelope, eu, estado.idsDoDono(eu.discordId));
      if (envelope.tipo === 'ficha.rolagem') estado.registrarRolagem(envelope, eu.discordId, agora);
      return [{ destino: 'outros', msg: { tipo: 'evento', envelope } }];
    }
    case 'ficha.salvar': {
      try {
        const r = estado.salvarFicha(msg.ficha, eu.discordId, msg.rev, agora);
        return [{
          destino: { ficha: r.dono },
          msg: { tipo: 'ficha.atualizada', ficha: msg.ficha, rev: r.rev, dono: r.dono, ...(r.conflito ? { conflito: true } : {}) },
        }];
      } catch (e) {
        if (e instanceof ErroEstado) return [erro(e.codigo, msg.tipo)];
        throw e;
      }
    }
    case 'ficha.entregar': {
      const f = estado.entregarFicha(msg.fichaId, msg.dono);
      if (!f) return [erro('inexistente', msg.tipo)];
      return [{ destino: { ficha: f.dono }, msg: { tipo: 'ficha.atualizada', ficha: f.ficha, rev: f.rev, dono: f.dono } }];
    }
    case 'membro.personagem':
      estado.escolherPersonagem(eu.discordId, msg.fichaId);
      return [saidaMembros(estado, conectados)];
    case 'sala.config':
      estado.definirConfig(msg.nome, msg.capaBlobId);
      return [];
    case 'blob':
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
