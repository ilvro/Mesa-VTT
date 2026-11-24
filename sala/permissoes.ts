/** Permissões da sala (puro): quem pode mandar o quê, conforme a tabela "Protocolo da sala" do plano. */

import { EVENTOS_DO_MESTRE, type Autor, type Envelope, type Eu, type MensagemParaSala } from '../src/online/protocolo.ts';
import { validarEvento } from '../vendor/mesa-core/eventos.js';

/** O que as permissões precisam saber das fichas da sala. */
export interface ContextoPermissao {
  /** `discordId` do dono da ficha, ou `null` se ela não existe. */
  donoDaFicha(id: string): string | null;
}

/** O envelope passa por `validarEvento` (contrato, catálogo e dados)? Devolve o motivo, ou `null` se vale. */
export function envelopeInvalido(envelope: unknown): string | null {
  const v = validarEvento(envelope);
  return v.ok ? null : `${v.motivo}: ${v.detalhe}`;
}

/** Id da ficha a que um `ficha.rolagem` ou `ficha.recursos` se refere (o Ref `dados.ficha`), ou `null`. */
export function fichaDoEvento(envelope: Envelope): string | null {
  const dados = envelope.dados as { ficha?: { app?: unknown; tipo?: unknown; id?: unknown } } | null | undefined;
  const ref = dados?.ficha;
  if (!ref || ref.app !== 'ficha' || ref.tipo !== 'ficha' || typeof ref.id !== 'string') return null;
  return ref.id;
}

function eventoPermitido(envelope: Envelope, autor: Eu, ctx: ContextoPermissao): boolean {
  if (envelopeInvalido(envelope) !== null) return false;
  if (autor.papel === 'mestre') return EVENTOS_DO_MESTRE.includes(envelope.tipo);
  if (envelope.tipo === 'atlas.mover-peca') return true;
  if (envelope.tipo === 'ficha.rolagem' || envelope.tipo === 'ficha.recursos') {
    const id = fichaDoEvento(envelope);
    return id !== null && ctx.donoDaFicha(id) === autor.discordId;
  }
  return false;
}

/** `autor` (papel efetivo na sala) pode mandar `msg`? O `ola` nunca passa por aqui. */
export function permitido(msg: MensagemParaSala, autor: Eu, ctx: ContextoPermissao): boolean {
  const mestre = autor.papel === 'mestre';
  switch (msg.tipo) {
    case 'ola': return false;
    case 'canal': return mestre;
    case 'evento': return eventoPermitido(msg.envelope, autor, ctx);
    case 'ficha.salvar': {
      if (mestre) return true;
      const dono = ctx.donoDaFicha(msg.ficha.id);
      return dono === null || dono === autor.discordId;
    }
    case 'ficha.entregar':
    case 'sala.config':
    case 'blob':
    case 'blob.tem': return mestre;
    // qualquer membro pede; quais ids saem é decisão da sala (`mensagens.ts`)
    case 'blob.pedir':
    case 'rolagens.historico': return true;
    case 'membro.personagem':
      return msg.fichaId === null || ctx.donoDaFicha(msg.fichaId) === autor.discordId;
  }
}

/** O carimbo da sala para `autor`: o `Eu` e os ids das fichas que ele tem. */
export function autorCarimbado(autor: Eu, fichas: string[]): Autor {
  return { discordId: autor.discordId, nome: autor.nome, papel: autor.papel, fichas };
}

/** Sobrescreve o `autor` do envelope: a sala é a única que carimba, e ignora o que o cliente mandou. */
export function carimbar(envelope: Envelope, autor: Eu, fichas: string[]): Envelope {
  return { ...envelope, autor: autorCarimbado(autor, fichas) };
}

/** Limite de mensagens por conexão: janela fixa de `janelaMs`. Puro; a chave é qualquer objeto. */
export interface Limitador {
  /** `ok` passa; `excedeu` descarta; `avisar` descarta e é a primeira da janela (manda um `erro`). */
  tentar(chave: object, agora: number): 'ok' | 'excedeu' | 'avisar';
}

export function criarLimitador(limite = 60, janelaMs = 1000): Limitador {
  const janelas = new WeakMap<object, { inicio: number; n: number; avisou: boolean }>();
  return {
    tentar(chave, agora) {
      let j = janelas.get(chave);
      if (!j || agora - j.inicio >= janelaMs) {
        j = { inicio: agora, n: 0, avisou: false };
        janelas.set(chave, j);
      }
      if (j.n < limite) {
        j.n++;
        return 'ok';
      }
      if (j.avisou) return 'excedeu';
      j.avisou = true;
      return 'avisar';
    },
  };
}
