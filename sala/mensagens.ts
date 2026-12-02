/**
 * O que a sala faz com cada mensagem de uma conexão já identificada (puro, sem Workers): valida, confere as
 * permissões, grava no estado e devolve as saídas (a quem mandar o quê). `sala.ts` só liga isto às conexões.
 */

import { aplicarAcaoDesafio, sanitizarDesafioPara } from '../src/dominio/desafios.ts';
import {
  PREFIXO_BLOB_CONSTRUCAO, ROLAGENS_NO_BEM_VINDO, codificarPedaco, decodificarPedaco, lerMensagemParaSala,
  type Eu, type MensagemDaSala, type MsgBemVindo, type MsgBlob, type MsgConstrucaoEstado,
} from '../src/online/protocolo.ts';
import { ErroEstado, montarMembros, type Estado, type EstadoConstrucao } from './estado.ts';
import { autorCarimbado, carimbar, criarLimitador, envelopeInvalido, permitido } from './permissoes.ts';

/**
 * Destino de uma saída:
 * `remetente` (quem mandou), `outros` (todos menos o remetente), `todos`, `mestre` (só conexões do mestre),
 * `jogadores` (só conexões de jogadores), `{ ficha: dono }` (o mestre e o dono da ficha, inclusive o remetente)
 * ou `{ para: discordId }` (só as conexões dessa pessoa).
 */
export type Destino = 'remetente' | 'outros' | 'todos' | 'mestre' | 'jogadores' | { ficha: string } | { para: string };

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

export const MAX_CURSORES_POR_SEGUNDO = 15;
const JANELA_CURSOR_MS = 1000;
const limitadorCursorPorConexao = criarLimitador(MAX_CURSORES_POR_SEGUNDO, JANELA_CURSOR_MS);
const cursoresPorEstado = new WeakMap<Estado, Map<string, { inicio: number; n: number }>>();
function podeEnviarCursor(estado: Estado, discordId: string, agora: number, conexao?: object): boolean {
  if (conexao) return limitadorCursorPorConexao.tentar(conexao, agora) === 'ok';
  let porPessoa = cursoresPorEstado.get(estado);
  if (!porPessoa) { porPessoa = new Map(); cursoresPorEstado.set(estado, porPessoa); }
  let j = porPessoa.get(discordId);
  if (!j || agora - j.inicio >= JANELA_CURSOR_MS) {
    j = { inicio: agora, n: 0 };
    porPessoa.set(discordId, j);
  }
  if (j.n >= MAX_CURSORES_POR_SEGUNDO) return false;
  j.n++;
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

/** O que mandar a quem chegou depois do `bem-vindo`: os blobs citados nos últimos `canal` guardados, a capa da sala e o snapshot da construção. Os incompletos são pulados. */
export function blobsParaQuemChega(estado: Estado): BlobParaEnviar[] {
  const ids = new Set(estado.blobsCitados());
  const capa = estado.config().capaBlobId;
  if (capa) ids.add(capa);
  const snapBlob = estado.estadoConstrucao()?.blobId;
  if (snapBlob) ids.add(snapBlob);
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

/** Blob do snapshot da construção para enviar também ao mestre quando entra/reconecta. */
export function blobConstrucaoParaQuemChega(estado: Estado): BlobParaEnviar[] {
  const id = estado.estadoConstrucao()?.blobId;
  if (!id) return [];
  const pedacos = estado.pedacosDoBlob(id);
  if (!pedacos || pedacos.length === 0) return [];
  return [{
    anuncio: { tipo: 'blob', id, tipoMime: pedacos[0]!.cab.tipo },
    quadros: pedacos.map(p => codificarPedaco(p.cab, p.dados)),
  }];
}

function msgEstadoConstrucao(estado: Estado, c: EstadoConstrucao): MsgConstrucaoEstado {
  const notas = estado.notasConstrucao();
  return {
    tipo: 'construcao.estado',
    ...(c.mapa !== undefined ? { mapa: c.mapa } : {}),
    ...(c.blobId !== undefined ? { blobId: c.blobId } : {}),
    ...(c.nome !== undefined ? { nome: c.nome } : {}),
    rev: c.rev,
    ops: c.ops,
    ...(notas.length > 0 ? { notas } : {}),
  };
}

/** Estado da construção colaborativa para quem chega (mestre ou jogador), se houver mapa de construção aberto. */
export function construcaoParaQuemChega(estado: Estado): MsgConstrucaoEstado | null {
  const c = estado.estadoConstrucao();
  return c ? msgEstadoConstrucao(estado, c) : null;
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
  const ultimoEstado = estado.ultimoEstado();
  for (const [canal, valor] of Object.entries(ultimoEstado)) {
    if (!canal.endsWith(':ficha-projetada') || !ehObj(valor) || valor.tipo !== 'projetar-ficha') continue;
    if (typeof valor.fichaId === 'string' && valor.fichaId && !ehObj(valor.ficha)) {
      const f = estado.ficha(valor.fichaId)?.ficha;
      if (f) ultimoEstado[canal] = { ...valor, ficha: f };
    }
  }
  const desafioAtual = estado.desafio();
  return {
    tipo: 'bem-vindo',
    eu,
    membros: montarMembros(conectados, id => estado.personagem(id)),
    fichas: guardadas.map(f => f.ficha),
    ultimoEstado,
    config: estado.config(),
    revs,
    donos,
    rolagens: estado.rolagens(ROLAGENS_NO_BEM_VINDO),
    construcao: estado.resumoConstrucao(),
    desafio: desafioAtual ? sanitizarDesafioPara(desafioAtual, eu.papel) : null,
    ...(agora !== undefined ? { agora } : {}),
  };
}

/** Trata um quadro de texto de uma conexão identificada. */
export function tratar(estado: Estado, eu: Eu, texto: string, agora: number, conectados: readonly Eu[], conexao?: object): Saida[] {
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
      const dentro = msg.msg as { tipo?: unknown; id?: unknown } | null;
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'projetar-ficha') {
        const rawId = (dentro as { fichaId?: unknown }).fichaId;
        const fichaId = typeof rawId === 'string' && rawId ? rawId : null;
        if (fichaId) {
          const dentroFicha = (dentro as { ficha?: unknown }).ficha;
          const daSala = estado.ficha(fichaId)?.ficha;
          const f = (ehObj(dentroFicha) ? dentroFicha : undefined) ?? daSala;
          const fichaLocal = !daSala && ehObj(dentroFicha) ? dentroFicha : undefined;
          estado.guardarUltimo(`${msg.nome}:ficha-projetada`, { tipo: 'projetar-ficha', fichaId, ...(fichaLocal ? { ficha: fichaLocal } : {}) });
          return [{ destino: 'outros', msg: { tipo: 'canal', nome: msg.nome, msg: { tipo: 'projetar-ficha', fichaId, ...(f ? { ficha: f } : {}) } } }];
        }
        estado.apagarUltimo(`${msg.nome}:ficha-projetada`);
        return [{ destino: 'outros', msg: { tipo: 'canal', nome: msg.nome, msg: { tipo: 'projetar-ficha', fichaId: null } } }];
      }
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'estado') estado.guardarUltimo(msg.nome, msg.msg);
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'controle-jogadores') estado.guardarUltimo(`${msg.nome}:controle`, msg.msg);
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'visao-remota') estado.guardarUltimo(`${msg.nome}:visao-remota`, msg.msg);
      if (dentro && typeof dentro === 'object' && dentro.tipo === 'retrato' && typeof dentro.id === 'string' && dentro.id) {
        estado.guardarUltimo(`${msg.nome}:retrato:${dentro.id}`, msg.msg);
      }
      if (dentro && typeof dentro === 'object' && (dentro.tipo === 'estado' || dentro.tipo === 'retrato' || dentro.tipo === 'inspecao')) {
        const ids = blobsCitadosPor(msg.msg);
        const tipoCitado = dentro.tipo === 'retrato' && typeof dentro.id === 'string' && dentro.id
          ? `retrato:${dentro.id}`
          : dentro.tipo;
        estado.guardarCitados(msg.nome, tipoCitado, ids);
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
        const saidas: Saida[] = [{
          destino: { ficha: r.dono },
          msg: { tipo: 'ficha.atualizada', ficha: msg.ficha, rev: r.rev, autor: autorCarimbado(eu, estado.idsDoDono(eu.discordId)), dono: r.dono, ...(r.conflito ? { conflito: true } : {}) },
        }];
        for (const [canal, valor] of Object.entries(estado.ultimoEstado())) {
          if (!canal.endsWith(':ficha-projetada') || !ehObj(valor) || valor.tipo !== 'projetar-ficha') continue;
          if (valor.fichaId === msg.ficha.id) {
            saidas.push({
              destino: 'outros',
              msg: { tipo: 'canal', nome: canal.slice(0, -':ficha-projetada'.length), msg: { tipo: 'projetar-ficha', fichaId: msg.ficha.id, ficha: msg.ficha } },
            });
          }
        }
        return saidas;
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
    case 'sala.modo':
      estado.definirModo(msg.modo);
      return [{ destino: 'todos', msg: { tipo: 'config', config: estado.config() } }];
    case 'sala.limpar-sessao':
      estado.limparSessao();
      return [
        saidaMembros(estado, conectados),
        { destino: 'outros', msg: { tipo: 'canal', nome: 'atlas:projetor:remoto', msg: { tipo: 'encerrado' } } },
      ];
    case 'construcao.abrir': {
      try {
        const c = estado.abrirConstrucao({
          ...(msg.mapa !== undefined ? { mapa: msg.mapa } : {}),
          ...(msg.blobId !== undefined ? { blobId: msg.blobId } : {}),
          ...(msg.nome !== undefined ? { nome: msg.nome } : {}),
        });
        return [{ destino: 'todos', msg: msgEstadoConstrucao(estado, c) }];
      } catch (e) {
        if (e instanceof ErroEstado) return [erro(e.codigo, msg.tipo)];
        throw e;
      }
    }
    case 'construcao.fechar':
      estado.fecharConstrucao();
      return [{ destino: 'todos', msg: { tipo: 'construcao.fechada' } }];
    case 'construcao.comando': {
      try {
        const autor = autorCarimbado(eu, estado.idsDoDono(eu.discordId));
        const op = estado.registrarOpConstrucao({
          opId: msg.opId,
          autor,
          comandos: msg.comandos,
          ...(msg.rotulo !== undefined ? { rotulo: msg.rotulo } : {}),
          em: agora,
        });
        if (!op) return [erro('inexistente', msg.tipo)];
        return [{
          destino: 'todos',
          msg: {
            tipo: 'construcao.aplicada',
            rev: op.rev,
            opId: op.opId,
            autor: op.autor,
            comandos: op.comandos,
            ...(op.rotulo !== undefined ? { rotulo: op.rotulo } : {}),
          },
        }];
      } catch (e) {
        if (e instanceof ErroEstado) return [erro(e.codigo, msg.tipo)];
        throw e;
      }
    }
    case 'construcao.snapshot': {
      try {
        estado.salvarSnapshotConstrucao({
          rev: msg.rev,
          ...(msg.mapa !== undefined ? { mapa: msg.mapa } : {}),
          ...(msg.blobId !== undefined ? { blobId: msg.blobId } : {}),
          ...(msg.nome !== undefined ? { nome: msg.nome } : {}),
        });
        return [];
      } catch (e) {
        if (e instanceof ErroEstado) return [erro(e.codigo, msg.tipo)];
        throw e;
      }
    }
    case 'construcao.cursor': {
      if (!podeEnviarCursor(estado, eu.discordId, agora, conexao)) return [];
      const autor = autorCarimbado(eu, estado.idsDoDono(eu.discordId));
      return [{
        destino: 'outros',
        msg: {
          tipo: 'construcao.cursor',
          autor,
          x: msg.x,
          y: msg.y,
          levelId: msg.levelId,
          ferramenta: msg.ferramenta,
          ...(msg.pintando !== undefined ? { pintando: msg.pintando } : {}),
        },
      }];
    }
    case 'construcao.ressincronizar': {
      const c = estado.estadoConstrucao();
      if (!c) return [{ destino: 'remetente', msg: { tipo: 'construcao.fechada' } }];
      return [{ destino: 'remetente', msg: msgEstadoConstrucao(estado, c) }];
    }
    case 'construcao.nota': {
      try {
        const autor = autorCarimbado(eu, estado.idsDoDono(eu.discordId));
        const nota = estado.registrarNotaConstrucao({ id: msg.id, autor, texto: msg.texto, em: agora });
        return [{ destino: 'todos', msg: { tipo: 'construcao.nota', id: nota.id, autor: nota.autor, texto: nota.texto, em: nota.em } }];
      } catch (e) {
        if (e instanceof ErroEstado) return [erro(e.codigo, msg.tipo)];
        throw e;
      }
    }
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
    case 'pedir-retrato': {
      const sufixo = `:retrato:${msg.id}`;
      for (const [canal, valor] of Object.entries(estado.ultimoEstado())) {
        if (!canal.startsWith(PREFIXO_PROJETOR) || !canal.endsWith(sufixo)) continue;
        const canalBase = canal.slice(0, -sufixo.length);
        const ids = blobsCitadosPor(valor);
        const blobId = ids[0];
        const pedacos = blobId ? estado.pedacosDoBlob(blobId) : null;
        if (blobId && pedacos && pedacos.length > 0) {
          return [
            {
              destino: 'remetente',
              msg: { tipo: 'blob', id: blobId, tipoMime: pedacos[0]!.cab.tipo },
              quadros: pedacos.map(p => codificarPedaco(p.cab, p.dados)),
            },
            { destino: 'remetente', msg: { tipo: 'canal', nome: canalBase, msg: valor } },
          ];
        }
      }
      return [{ destino: 'outros', msg: { tipo: 'pedir-retrato', id: msg.id } }];
    }
    case 'alternar-porta':
      return [{ destino: 'outros', msg: { tipo: 'alternar-porta', id: msg.id } }];
    case 'desafio.definir':
      estado.definirDesafio(msg.desafio);
      return [
        { destino: 'mestre', msg: { tipo: 'desafio.estado', desafio: msg.desafio ? sanitizarDesafioPara(msg.desafio, 'mestre') : null } },
        { destino: 'jogadores', msg: { tipo: 'desafio.estado', desafio: msg.desafio ? sanitizarDesafioPara(msg.desafio, 'jogador') : null } },
      ];
    case 'desafio.acao': {
      const atual = estado.desafio();
      if (!atual) return [];
      if (eu.papel === 'jogador') {
        if (
          msg.acao.tipo === 'esconderijo.buscar-criatura'
          || msg.acao.tipo === 'esconderijo.proxima-fase'
          || msg.acao.tipo === 'perseguicao.encerrar-rodada'
        ) {
          return [erro('permissao', 'desafio.acao')];
        }
        if (
          msg.acao.tipo === 'lockpick.tentar'
          && atual.tipo === 'lockpick'
          && atual.jogadorAutorizadoId
          && atual.jogadorAutorizadoId !== eu.discordId
          && !estado.idsDoDono(eu.discordId).includes(atual.jogadorAutorizadoId)
        ) {
          return [erro('permissao', 'desafio.acao')];
        }
      }
      const proximo = aplicarAcaoDesafio(atual, msg.acao, { agora });
      estado.definirDesafio(proximo);
      return [
        { destino: 'mestre', msg: { tipo: 'desafio.estado', desafio: sanitizarDesafioPara(proximo, 'mestre') } },
        { destino: 'jogadores', msg: { tipo: 'desafio.estado', desafio: sanitizarDesafioPara(proximo, 'jogador') } },
      ];
    }
    case 'blob':
      // `estado:<mapa>:<versao>` pode voltar com outro conteúdo (a versão recomeça numa sessão nova): o novo substitui
      if (msg.id.startsWith(PREFIXO_ESTADO)) estado.apagarBlob(msg.id);
      // `construcao:0` de um novo mapa aberto pelo mestre substitui o anterior
      if (eu.papel === 'mestre' && msg.id === `${PREFIXO_BLOB_CONSTRUCAO}0`) estado.apagarBlob(msg.id);
      // o id não se repete: se já está completo, o anúncio é ignorado
      return estado.temBlob(msg.id) ? [] : [{ destino: 'outros', msg: { tipo: 'blob', id: msg.id, tipoMime: msg.tipoMime } }];
  }
}

/** Trata um quadro binário (pedaço de blob). Mestre guarda qualquer um; em `'construcao'`, participantes guardam snapshots `construcao:`. */
export function tratarBinario(estado: Estado, eu: Eu, quadro: ArrayBuffer): { saidas: Saida[]; repassar: boolean } {
  if (eu.papel !== 'mestre' && estado.modo() !== 'construcao') {
    return { saidas: [erro('permissao', 'blob')], repassar: false };
  }
  const p = decodificarPedaco(quadro);
  if (!p) return { saidas: [erro('formato', 'blob')], repassar: false };
  if (eu.papel !== 'mestre' && !p.cab.id.startsWith(PREFIXO_BLOB_CONSTRUCAO)) {
    return { saidas: [erro('permissao', 'blob')], repassar: false };
  }
  if (estado.temBlob(p.cab.id)) return { saidas: [], repassar: false };
  try {
    estado.guardarPedaco(p.cab, p.dados);
  } catch (e) {
    if (e instanceof ErroEstado) return { saidas: [erro(e.codigo, 'blob')], repassar: false };
    throw e;
  }
  return { saidas: [], repassar: true };
}
