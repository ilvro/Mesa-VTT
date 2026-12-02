export type LadosDado = 4 | 6 | 8 | 10 | 12 | 20;

export const LADOS_VALIDOS: readonly LadosDado[] = [4, 6, 8, 10, 12, 20];

export interface ParticipanteDesafio {
  id: string;
  nome: string;
  fichaId?: string;
  donoDiscordId?: string;
  retrato?: string;
}

export type ModoDicaLockpick = 'posicional' | 'embaralhado';
export type ResultadoPino = 'baixo' | 'exato' | 'alto';

export interface TentativaLockpick {
  numero: number;
  autorNome: string;
  valores: number[];
  feedbackPosicional?: ResultadoPino[];
  feedbackEmbaralhado?: { corretos: number; altos: number; baixos: number };
  acertou: boolean;
  em: number;
}

export interface DesafioLockpick {
  tipo: 'lockpick';
  id: string;
  titulo: string;
  dados: LadosDado[];
  senha?: number[];
  modoDica: ModoDicaLockpick;
  maxTentativas: number;
  tentativasPorRodada?: number;
  jogadorAutorizadoId?: string | null;
  jogadorAutorizadoNome?: string;
  tentativas: TentativaLockpick[];
  status: 'ativo' | 'aberto' | 'travado';
  atualizadoEm: number;
}

export type ModoExibicaoHud = 'destaque' | 'compacto';

export interface DadoEquilibrioJogado {
  id: string;
  valor: number;
  lado: 'esq' | 'dir';
}

export interface DesafioEquilibrio {
  tipo: 'equilibrio';
  id: string;
  titulo: string;
  personagem: ParticipanteDesafio;
  exibicao: ModoExibicaoHud;
  dadoEsq: number | null;
  dadoDir: number | null;
  dadosEquilibrioTotal: number;
  dadosUsados: DadoEquilibrioJogado[];
  d4Pendente: number | null;
  status: 'aguardando' | 'equilibrado' | 'desequilibrado' | 'caiu';
  atualizadoEm: number;
}

export interface DadoEsconderijo {
  id: string;
  lados: LadosDado;
  valor: number;
  descoberto?: boolean;
}

export interface ParticipanteEsconderijo extends ParticipanteDesafio {
  dados: DadoEsconderijo[];
  dtEsconderSe: number;
  encontrado: boolean;
}

export interface BuscaCriatura {
  id: string;
  dados: Array<{ lados: LadosDado; valor: number }>;
  atingidos: Array<{
    participanteId: string;
    nome: string;
    valores: number[];
    ficouEncontrado: boolean;
  }>;
  em: number;
}

export interface DesafioEsconderijo {
  tipo: 'esconderijo';
  id: string;
  titulo: string;
  rodada: number;
  fase: 'personagens' | 'criaturas';
  ocultarDoMestre: boolean;
  dtDistrair: number;
  participantes: ParticipanteEsconderijo[];
  ultimaBusca: BuscaCriatura | null;
  atualizadoEm: number;
}

export type StatusPerseguicao = 'correndo' | 'derrubado' | 'seguro';

export interface ParticipantePerseguicao extends ParticipanteDesafio {
  pa: number;
  folegoTotal: number;
  folegoRestante: number;
  esforcoExtraUsos: number;
  status: StatusPerseguicao;
  carregandoId?: string | null;
  carregadoPorId?: string | null;
  rodadaDerrubado?: number | null;
}

export interface DesafioPerseguicao {
  tipo: 'perseguicao';
  id: string;
  titulo: string;
  rodada: number;
  totalRodadas: number;
  metaPa: number;
  limiaresPorRodada: Record<number, number>;
  mostrarPaJogadores: boolean;
  participantes: ParticipantePerseguicao[];
  atualizadoEm: number;
}

export interface ParticipanteEscalada extends ParticipanteDesafio {
  pontos: number;
  status: 'escalando' | 'topo' | 'caiu';
  ultimoDanoQueda?: number;
}

export interface DesafioEscalada {
  tipo: 'escalada';
  id: string;
  titulo: string;
  metaPontos: number;
  dtRapida: number;
  dtCautelosa: number;
  participantes: ParticipanteEscalada[];
  atualizadoEm: number;
}

export type DesafioAtivo =
  | DesafioLockpick
  | DesafioEquilibrio
  | DesafioEsconderijo
  | DesafioPerseguicao
  | DesafioEscalada;

export type AcaoDesafio =
  | { tipo: 'lockpick.tentar'; valores: number[]; autorNome: string }
  | { tipo: 'equilibrio.rolar-inicial'; dadoEsq?: number; dadoDir?: number }
  | { tipo: 'equilibrio.rolar-d4'; valor?: number }
  | { tipo: 'equilibrio.aplicar-d4'; lado: 'esq' | 'dir' }
  | { tipo: 'esconderijo.definir-dados'; participanteId: string; dados: Array<{ lados: LadosDado; valor: number }> }
  | { tipo: 'esconderijo.adicionar-dado'; participanteId: string; lados: LadosDado; valor?: number }
  | { tipo: 'esconderijo.descartar-dado'; participanteId: string; dadoId: string }
  | { tipo: 'esconderijo.esconder-se'; participanteId: string; passou: boolean; lados?: LadosDado; valor?: number }
  | { tipo: 'esconderijo.distrair'; alvoParticipanteId: string; passou: boolean; lados?: LadosDado; valor?: number }
  | {
      tipo: 'esconderijo.chamar-atencao';
      origemId: string;
      destinoId: string;
      dadoTransferirId: string;
      dadoDescartarId: string;
    }
  | { tipo: 'esconderijo.buscar-criatura'; dados: Array<{ lados: LadosDado; valor?: number }> }
  | { tipo: 'esconderijo.proxima-fase' }
  | { tipo: 'perseguicao.gastar-folego'; participanteId: string; quantidade?: number }
  | { tipo: 'perseguicao.avancar'; participanteId: string; pontos: number; esforcoExtra?: boolean }
  | { tipo: 'perseguicao.carregar'; carregadorId: string; alvoId: string; pontos: number; esforcoExtra?: boolean }
  | { tipo: 'perseguicao.encerrar-rodada' }
  | { tipo: 'escalada.registrar'; participanteId: string; passou: boolean; pontos?: number };

export function rolarDado(lados: LadosDado, rng: () => number = Math.random): number {
  const bruto = rng();
  const normalizado = Number.isFinite(bruto) ? Math.min(Math.max(bruto, 0), 0.999999999999) : 0;
  return Math.floor(normalizado * lados) + 1;
}

function gerarId(prefixo: string, agora: number, rng: () => number = Math.random): string {
  const sufixo = Math.floor(Math.min(Math.max(rng(), 0), 0.999999) * 1_000_000)
    .toString(36)
    .padStart(4, '0');
  return `${prefixo}-${agora.toString(36)}-${sufixo}`;
}

function limitarValorDado(valor: number, lados: LadosDado): number {
  const inteiro = Math.round(Number.isFinite(valor) ? valor : 1);
  return Math.min(lados, Math.max(1, inteiro));
}

function clonarParticipante(p: ParticipanteDesafio): ParticipanteDesafio {
  const copia: ParticipanteDesafio = { id: p.id, nome: p.nome };
  if (p.fichaId !== undefined) copia.fichaId = p.fichaId;
  if (p.donoDiscordId !== undefined) copia.donoDiscordId = p.donoDiscordId;
  if (p.retrato !== undefined) copia.retrato = p.retrato;
  return copia;
}

export function criarLockpick(opts: {
  id?: string;
  titulo?: string;
  dados?: LadosDado[];
  senha?: number[];
  modoDica?: ModoDicaLockpick;
  maxTentativas?: number;
  tentativasPorRodada?: number;
  jogadorAutorizadoId?: string | null;
  jogadorAutorizadoNome?: string;
  agora?: number;
  rng?: () => number;
} = {}): DesafioLockpick {
  const agora = opts.agora ?? Date.now();
  const rng = opts.rng ?? Math.random;
  const dados: LadosDado[] = opts.dados && opts.dados.length > 0 ? [...opts.dados] : [6, 6, 6];
  const senha = dados.map((lados, idx) => {
    const informado = opts.senha?.[idx];
    return informado !== undefined ? limitarValorDado(informado, lados) : rolarDado(lados, rng);
  });

  const desafio: DesafioLockpick = {
    tipo: 'lockpick',
    id: opts.id ?? gerarId('lockpick', agora, rng),
    titulo: opts.titulo ?? 'Fechadura',
    dados,
    senha,
    modoDica: opts.modoDica ?? 'posicional',
    maxTentativas: Math.max(1, Math.floor(opts.maxTentativas ?? 4)),
    jogadorAutorizadoId: opts.jogadorAutorizadoId ?? null,
    tentativas: [],
    status: 'ativo',
    atualizadoEm: agora,
  };
  if (opts.tentativasPorRodada !== undefined) {
    desafio.tentativasPorRodada = Math.max(1, Math.floor(opts.tentativasPorRodada));
  }
  if (opts.jogadorAutorizadoNome !== undefined) {
    desafio.jogadorAutorizadoNome = opts.jogadorAutorizadoNome;
  }
  return desafio;
}

export function criarEquilibrio(opts: {
  id?: string;
  titulo?: string;
  personagem: ParticipanteDesafio;
  dadosEquilibrioTotal?: number;
  exibicao?: ModoExibicaoHud;
  agora?: number;
}): DesafioEquilibrio {
  const agora = opts.agora ?? Date.now();
  return {
    tipo: 'equilibrio',
    id: opts.id ?? gerarId('equilibrio', agora),
    titulo: opts.titulo ?? 'Equilíbrio',
    personagem: clonarParticipante(opts.personagem),
    exibicao: opts.exibicao ?? 'destaque',
    dadoEsq: null,
    dadoDir: null,
    dadosEquilibrioTotal: Math.max(1, Math.floor(opts.dadosEquilibrioTotal ?? 2)),
    dadosUsados: [],
    d4Pendente: null,
    status: 'aguardando',
    atualizadoEm: agora,
  };
}

export function criarEsconderijo(opts: {
  id?: string;
  titulo?: string;
  participantes: ParticipanteDesafio[];
  ocultarDoMestre?: boolean;
  agora?: number;
}): DesafioEsconderijo {
  const agora = opts.agora ?? Date.now();
  return {
    tipo: 'esconderijo',
    id: opts.id ?? gerarId('esconderijo', agora),
    titulo: opts.titulo ?? 'Esconderijo',
    rodada: 1,
    fase: 'personagens',
    ocultarDoMestre: opts.ocultarDoMestre ?? false,
    dtDistrair: 10,
    participantes: opts.participantes.map((p) => ({
      ...clonarParticipante(p),
      dados: [],
      dtEsconderSe: 10,
      encontrado: false,
    })),
    ultimaBusca: null,
    atualizadoEm: agora,
  };
}

export function criarPerseguicao(opts: {
  id?: string;
  titulo?: string;
  participantes: Array<ParticipanteDesafio & { folegoTotal?: number }>;
  totalRodadas?: number;
  metaPa?: number;
  limiaresPorRodada?: Record<number, number>;
  mostrarPaJogadores?: boolean;
  agora?: number;
}): DesafioPerseguicao {
  const agora = opts.agora ?? Date.now();
  const totalRodadas = Math.max(1, Math.floor(opts.totalRodadas ?? 3));
  const limiaresPorRodada = opts.limiaresPorRodada
    ? { ...opts.limiaresPorRodada }
    : { 1: 5, 2: 15, 3: 25 };

  return {
    tipo: 'perseguicao',
    id: opts.id ?? gerarId('perseguicao', agora),
    titulo: opts.titulo ?? 'Perseguição',
    rodada: 1,
    totalRodadas,
    metaPa: Math.max(1, Math.floor(opts.metaPa ?? 25)),
    limiaresPorRodada,
    mostrarPaJogadores: opts.mostrarPaJogadores ?? true,
    participantes: opts.participantes.map((p) => {
      const folegoTotal = Math.max(0, Math.floor(p.folegoTotal ?? 2));
      return {
        ...clonarParticipante(p),
        pa: 0,
        folegoTotal,
        folegoRestante: folegoTotal,
        esforcoExtraUsos: 0,
        status: 'correndo',
        carregandoId: null,
        carregadoPorId: null,
        rodadaDerrubado: null,
      };
    }),
    atualizadoEm: agora,
  };
}

export function criarEscalada(opts: {
  id?: string;
  titulo?: string;
  participantes: ParticipanteDesafio[];
  metaPontos?: number;
  dtRapida?: number;
  dtCautelosa?: number;
  agora?: number;
}): DesafioEscalada {
  const agora = opts.agora ?? Date.now();
  return {
    tipo: 'escalada',
    id: opts.id ?? gerarId('escalada', agora),
    titulo: opts.titulo ?? 'Escalada',
    metaPontos: Math.max(1, Math.floor(opts.metaPontos ?? 6)),
    dtRapida: Math.floor(opts.dtRapida ?? 12),
    dtCautelosa: Math.floor(opts.dtCautelosa ?? 9),
    participantes: opts.participantes.map((p) => ({
      ...clonarParticipante(p),
      pontos: 0,
      status: 'escalando',
    })),
    atualizadoEm: agora,
  };
}

export function totaisEquilibrio(d: DesafioEquilibrio): {
  esq: number;
  dir: number;
  diferenca: number;
  restantes: number;
} {
  let esq = d.dadoEsq ?? 0;
  let dir = d.dadoDir ?? 0;
  for (const dado of d.dadosUsados) {
    if (dado.lado === 'esq') esq += dado.valor;
    else dir += dado.valor;
  }
  const diferenca = Math.abs(esq - dir);
  const pendente = d.d4Pendente !== null ? 1 : 0;
  const restantes = Math.max(0, d.dadosEquilibrioTotal - d.dadosUsados.length - pendente);
  return { esq, dir, diferenca, restantes };
}

function avaliarStatusEquilibrio(d: DesafioEquilibrio): DesafioEquilibrio['status'] {
  if (d.dadoEsq === null || d.dadoDir === null) return 'aguardando';
  const { diferenca, restantes } = totaisEquilibrio(d);
  if (diferenca <= 1) return 'equilibrado';
  if (restantes === 0 && d.d4Pendente === null) return 'caiu';
  return 'desequilibrado';
}

function aplicarLockpick(
  desafio: DesafioLockpick,
  acao: Extract<AcaoDesafio, { tipo: 'lockpick.tentar' }>,
  agora: number,
): DesafioLockpick {
  if (desafio.status !== 'ativo' || !desafio.senha || desafio.senha.length === 0) {
    return desafio;
  }

  const senha = desafio.senha;
  const valores = senha.map((_, idx) => acao.valores[idx] ?? 0);
  const feedbackPosicional: ResultadoPino[] = senha.map((alvo, idx) => {
    const palpite = valores[idx] ?? 0;
    if (palpite > alvo) return 'baixo';
    if (palpite < alvo) return 'alto';
    return 'exato';
  });

  const acertou = feedbackPosicional.every((r) => r === 'exato');
  const tentativa: TentativaLockpick = {
    numero: desafio.tentativas.length + 1,
    autorNome: acao.autorNome,
    valores,
    acertou,
    em: agora,
  };

  if (desafio.modoDica === 'posicional') {
    tentativa.feedbackPosicional = feedbackPosicional;
  } else {
    let corretos = 0;
    let altos = 0;
    let baixos = 0;
    for (const r of feedbackPosicional) {
      if (r === 'exato') corretos += 1;
      else if (r === 'alto') altos += 1;
      else baixos += 1;
    }
    tentativa.feedbackEmbaralhado = { corretos, altos, baixos };
  }

  const tentativas = [...desafio.tentativas, tentativa];
  const status: DesafioLockpick['status'] = acertou
    ? 'aberto'
    : tentativas.length >= desafio.maxTentativas
      ? 'travado'
      : 'ativo';

  return {
    ...desafio,
    tentativas,
    status,
    atualizadoEm: agora,
  };
}

function aplicarEquilibrio(
  desafio: DesafioEquilibrio,
  acao: Extract<
    AcaoDesafio,
    { tipo: 'equilibrio.rolar-inicial' | 'equilibrio.rolar-d4' | 'equilibrio.aplicar-d4' }
  >,
  agora: number,
  rng: () => number,
): DesafioEquilibrio {
  switch (acao.tipo) {
    case 'equilibrio.rolar-inicial': {
      const dadoEsq = acao.dadoEsq !== undefined ? limitarValorDado(acao.dadoEsq, 10) : rolarDado(10, rng);
      const dadoDir = acao.dadoDir !== undefined ? limitarValorDado(acao.dadoDir, 10) : rolarDado(10, rng);
      const proximo: DesafioEquilibrio = {
        ...desafio,
        dadoEsq,
        dadoDir,
        dadosUsados: [],
        d4Pendente: null,
        atualizadoEm: agora,
      };
      return { ...proximo, status: avaliarStatusEquilibrio(proximo) };
    }
    case 'equilibrio.rolar-d4': {
      if (desafio.status !== 'desequilibrado' || desafio.d4Pendente !== null) return desafio;
      const { restantes } = totaisEquilibrio(desafio);
      if (restantes <= 0) return desafio;
      const valor = acao.valor !== undefined ? limitarValorDado(acao.valor, 4) : rolarDado(4, rng);
      return {
        ...desafio,
        d4Pendente: valor,
        atualizadoEm: agora,
      };
    }
    case 'equilibrio.aplicar-d4': {
      if (desafio.d4Pendente === null) return desafio;
      const novoDado: DadoEquilibrioJogado = {
        id: gerarId('eq-d4', agora, rng),
        valor: desafio.d4Pendente,
        lado: acao.lado,
      };
      const proximo: DesafioEquilibrio = {
        ...desafio,
        dadosUsados: [...desafio.dadosUsados, novoDado],
        d4Pendente: null,
        atualizadoEm: agora,
      };
      return { ...proximo, status: avaliarStatusEquilibrio(proximo) };
    }
  }
}

function criarDadoEsconderijo(
  lados: LadosDado,
  valor: number | undefined,
  agora: number,
  rng: () => number,
  indice?: number,
): DadoEsconderijo {
  const prefixo = indice !== undefined ? `esc-dado-${indice}` : 'esc-dado';
  return {
    id: gerarId(prefixo, agora, rng),
    lados,
    valor: valor !== undefined ? limitarValorDado(valor, lados) : rolarDado(lados, rng),
  };
}

function aplicarEsconderijo(
  desafio: DesafioEsconderijo,
  acao: Extract<
    AcaoDesafio,
    {
      tipo:
        | 'esconderijo.definir-dados'
        | 'esconderijo.adicionar-dado'
        | 'esconderijo.descartar-dado'
        | 'esconderijo.esconder-se'
        | 'esconderijo.distrair'
        | 'esconderijo.chamar-atencao'
        | 'esconderijo.buscar-criatura'
        | 'esconderijo.proxima-fase';
    }
  >,
  agora: number,
  rng: () => number,
): DesafioEsconderijo {
  switch (acao.tipo) {
    case 'esconderijo.definir-dados': {
      const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
      if (!existe) return desafio;
      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.participanteId) return p;
          const dados = acao.dados.map((d, idx) =>
            criarDadoEsconderijo(d.lados, d.valor, agora, rng, idx),
          );
          return { ...p, dados, encontrado: dados.length === 0 };
        }),
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.adicionar-dado': {
      const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
      if (!existe) return desafio;
      const novoDado = criarDadoEsconderijo(acao.lados, acao.valor, agora, rng);
      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.participanteId) return p;
          return { ...p, dados: [...p.dados, novoDado], encontrado: false };
        }),
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.descartar-dado': {
      const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
      if (!existe) return desafio;
      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.participanteId) return p;
          const dados = p.dados.filter((d) => d.id !== acao.dadoId);
          return { ...p, dados, encontrado: dados.length === 0 };
        }),
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.esconder-se': {
      const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
      if (!existe) return desafio;
      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.participanteId) return p;
          const dtEsconderSe = p.dtEsconderSe + 3;
          if (!acao.passou) {
            return { ...p, dtEsconderSe };
          }
          const lados = acao.lados ?? 6;
          const novoDado = criarDadoEsconderijo(lados, acao.valor, agora, rng);
          return {
            ...p,
            dtEsconderSe,
            dados: [...p.dados, novoDado],
            encontrado: false,
          };
        }),
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.distrair': {
      const dtDistrair = desafio.dtDistrair + 3;
      if (!acao.passou) {
        return {
          ...desafio,
          dtDistrair,
          atualizadoEm: agora,
        };
      }
      const lados = acao.lados ?? 6;
      const novoDado = criarDadoEsconderijo(lados, acao.valor, agora, rng);
      return {
        ...desafio,
        dtDistrair,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.alvoParticipanteId) return p;
          return {
            ...p,
            dados: [...p.dados, novoDado],
            encontrado: false,
          };
        }),
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.chamar-atencao': {
      if (acao.origemId === acao.destinoId || acao.dadoTransferirId === acao.dadoDescartarId) {
        return desafio;
      }
      const origem = desafio.participantes.find((p) => p.id === acao.origemId);
      const destino = desafio.participantes.find((p) => p.id === acao.destinoId);
      if (!origem || !destino) return desafio;

      const dadoTransferir = origem.dados.find((d) => d.id === acao.dadoTransferirId);
      const dadoDescartar = origem.dados.find((d) => d.id === acao.dadoDescartarId);
      if (!dadoTransferir || !dadoDescartar) return desafio;

      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id === acao.origemId) {
            const restantes = p.dados.filter(
              (d) => d.id !== acao.dadoTransferirId && d.id !== acao.dadoDescartarId,
            );
            return { ...p, dados: restantes, encontrado: restantes.length === 0 };
          }
          if (p.id === acao.destinoId) {
            return { ...p, dados: [...p.dados, dadoTransferir], encontrado: false };
          }
          return p;
        }),
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.buscar-criatura': {
      const dadosBusca = acao.dados.map((d) => ({
        lados: d.lados,
        valor: d.valor !== undefined ? limitarValorDado(d.valor, d.lados) : rolarDado(d.lados, rng),
      }));
      const valoresAlvo = new Set(dadosBusca.map((d) => d.valor));
      const atingidos: BuscaCriatura['atingidos'] = [];

      const participantes = desafio.participantes.map((p) => {
        const valoresRemovidos: number[] = [];
        const restantes: DadoEsconderijo[] = [];
        for (const dado of p.dados) {
          if (valoresAlvo.has(dado.valor)) {
            valoresRemovidos.push(dado.valor);
          } else {
            restantes.push(dado);
          }
        }
        if (valoresRemovidos.length === 0) {
          return p;
        }
        const ficouEncontrado = restantes.length === 0;
        atingidos.push({
          participanteId: p.id,
          nome: p.nome,
          valores: valoresRemovidos,
          ficouEncontrado,
        });
        return {
          ...p,
          dados: restantes,
          encontrado: ficouEncontrado,
        };
      });

      const ultimaBusca: BuscaCriatura = {
        id: gerarId('busca', agora, rng),
        dados: dadosBusca,
        atingidos,
        em: agora,
      };

      return {
        ...desafio,
        participantes,
        ultimaBusca,
        atualizadoEm: agora,
      };
    }
    case 'esconderijo.proxima-fase': {
      if (desafio.fase === 'personagens') {
        return { ...desafio, fase: 'criaturas', atualizadoEm: agora };
      }
      return {
        ...desafio,
        fase: 'personagens',
        rodada: desafio.rodada + 1,
        atualizadoEm: agora,
      };
    }
  }
}

function aplicarPerseguicao(
  desafio: DesafioPerseguicao,
  acao: Extract<
    AcaoDesafio,
    {
      tipo:
        | 'perseguicao.gastar-folego'
        | 'perseguicao.avancar'
        | 'perseguicao.carregar'
        | 'perseguicao.encerrar-rodada';
    }
  >,
  agora: number,
): DesafioPerseguicao {
  switch (acao.tipo) {
    case 'perseguicao.gastar-folego': {
      const qtd = Math.max(1, Math.floor(acao.quantidade ?? 1));
      const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
      if (!existe) return desafio;
      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.participanteId) return p;
          return { ...p, folegoRestante: Math.max(0, p.folegoRestante - qtd) };
        }),
        atualizadoEm: agora,
      };
    }
    case 'perseguicao.avancar': {
      const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
      if (!existe) return desafio;
      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id !== acao.participanteId) return p;
          const pa = Math.max(0, p.pa + acao.pontos);
          const status: StatusPerseguicao = pa >= desafio.metaPa ? 'seguro' : p.status;
          const esforcoExtraUsos = p.esforcoExtraUsos + (acao.esforcoExtra ? 1 : 0);
          return { ...p, pa, status, esforcoExtraUsos };
        }),
        atualizadoEm: agora,
      };
    }
    case 'perseguicao.carregar': {
      if (acao.carregadorId === acao.alvoId) return desafio;
      const carregador = desafio.participantes.find((p) => p.id === acao.carregadorId);
      const alvo = desafio.participantes.find((p) => p.id === acao.alvoId);
      if (!carregador || !alvo) return desafio;

      const basePa = carregador.pa > alvo.pa ? alvo.pa : carregador.pa;
      const novoPaCarregador = Math.max(0, basePa + acao.pontos);
      const novoPaAlvo = alvo.pa < novoPaCarregador ? novoPaCarregador : alvo.pa;

      return {
        ...desafio,
        participantes: desafio.participantes.map((p) => {
          if (p.id === acao.carregadorId) {
            return {
              ...p,
              pa: novoPaCarregador,
              status: novoPaCarregador >= desafio.metaPa ? 'seguro' : p.status,
              esforcoExtraUsos: p.esforcoExtraUsos + (acao.esforcoExtra ? 1 : 0),
              carregandoId: alvo.id,
            };
          }
          if (p.id === acao.alvoId) {
            return {
              ...p,
              pa: novoPaAlvo,
              status: novoPaAlvo >= desafio.metaPa ? 'seguro' : p.status,
              carregadoPorId: carregador.id,
            };
          }
          return p;
        }),
        atualizadoEm: agora,
      };
    }
    case 'perseguicao.encerrar-rodada': {
      const limiar = desafio.limiaresPorRodada[desafio.rodada];
      const participantes = desafio.participantes.map((p) => {
        if (limiar !== undefined && p.status === 'correndo' && p.pa < limiar) {
          return {
            ...p,
            status: 'derrubado' as const,
            rodadaDerrubado: desafio.rodada,
          };
        }
        return p;
      });
      const proximaRodada = Math.min(desafio.totalRodadas, desafio.rodada + 1);
      return {
        ...desafio,
        rodada: proximaRodada,
        participantes,
        atualizadoEm: agora,
      };
    }
  }
}

function aplicarEscalada(
  desafio: DesafioEscalada,
  acao: Extract<AcaoDesafio, { tipo: 'escalada.registrar' }>,
  agora: number,
): DesafioEscalada {
  const existe = desafio.participantes.some((p) => p.id === acao.participanteId);
  if (!existe) return desafio;

  return {
    ...desafio,
    participantes: desafio.participantes.map((p) => {
      if (p.id !== acao.participanteId) return p;
      if (acao.passou) {
        const ganho = Math.max(0, acao.pontos ?? 1);
        const pontos = p.pontos + ganho;
        const status: ParticipanteEscalada['status'] =
          pontos >= desafio.metaPontos ? 'topo' : 'escalando';
        return { ...p, pontos, status };
      }
      return {
        ...p,
        status: 'caiu',
        ultimoDanoQueda: p.pontos,
      };
    }),
    atualizadoEm: agora,
  };
}

export function aplicarAcaoDesafio(
  desafio: DesafioAtivo,
  acao: AcaoDesafio,
  opts: { agora?: number; rng?: () => number } = {},
): DesafioAtivo {
  const agora = opts.agora ?? Date.now();
  const rng = opts.rng ?? Math.random;

  switch (desafio.tipo) {
    case 'lockpick':
      if (acao.tipo === 'lockpick.tentar') {
        return aplicarLockpick(desafio, acao, agora);
      }
      return desafio;
    case 'equilibrio':
      if (
        acao.tipo === 'equilibrio.rolar-inicial' ||
        acao.tipo === 'equilibrio.rolar-d4' ||
        acao.tipo === 'equilibrio.aplicar-d4'
      ) {
        return aplicarEquilibrio(desafio, acao, agora, rng);
      }
      return desafio;
    case 'esconderijo':
      if (
        acao.tipo === 'esconderijo.definir-dados' ||
        acao.tipo === 'esconderijo.adicionar-dado' ||
        acao.tipo === 'esconderijo.descartar-dado' ||
        acao.tipo === 'esconderijo.esconder-se' ||
        acao.tipo === 'esconderijo.distrair' ||
        acao.tipo === 'esconderijo.chamar-atencao' ||
        acao.tipo === 'esconderijo.buscar-criatura' ||
        acao.tipo === 'esconderijo.proxima-fase'
      ) {
        return aplicarEsconderijo(desafio, acao, agora, rng);
      }
      return desafio;
    case 'perseguicao':
      if (
        acao.tipo === 'perseguicao.gastar-folego' ||
        acao.tipo === 'perseguicao.avancar' ||
        acao.tipo === 'perseguicao.carregar' ||
        acao.tipo === 'perseguicao.encerrar-rodada'
      ) {
        return aplicarPerseguicao(desafio, acao, agora);
      }
      return desafio;
    case 'escalada':
      if (acao.tipo === 'escalada.registrar') {
        return aplicarEscalada(desafio, acao, agora);
      }
      return desafio;
  }
}

export function sanitizarDesafioPara(
  desafio: DesafioAtivo,
  papel: 'mestre' | 'jogador',
): DesafioAtivo {
  if (papel === 'jogador' && desafio.tipo === 'lockpick' && desafio.status !== 'aberto') {
    const { senha: _omitido, ...semSenha } = desafio;
    return semSenha;
  }
  if (papel === 'mestre' && desafio.tipo === 'esconderijo' && desafio.ocultarDoMestre) {
    return {
      ...desafio,
      participantes: desafio.participantes.map((p) => ({
        ...p,
        dados: p.dados.map((d) => ({ ...d, valor: 0 })),
      })),
    };
  }
  return desafio;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function ehNumeroFinito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function ehLadosDado(v: unknown): v is LadosDado {
  return typeof v === 'number' && (LADOS_VALIDOS as readonly number[]).includes(v);
}

function ehParticipante(v: unknown): v is ParticipanteDesafio {
  return ehObjeto(v) && typeof v.id === 'string' && typeof v.nome === 'string';
}

export function ehDesafioAtivo(v: unknown): v is DesafioAtivo {
  if (!ehObjeto(v)) return false;
  if (typeof v.id !== 'string' || typeof v.titulo !== 'string' || !ehNumeroFinito(v.atualizadoEm)) {
    return false;
  }

  switch (v.tipo) {
    case 'lockpick':
      return (
        Array.isArray(v.dados) &&
        v.dados.every(ehLadosDado) &&
        (v.modoDica === 'posicional' || v.modoDica === 'embaralhado') &&
        ehNumeroFinito(v.maxTentativas) &&
        Array.isArray(v.tentativas) &&
        (v.status === 'ativo' || v.status === 'aberto' || v.status === 'travado')
      );
    case 'equilibrio':
      return (
        ehParticipante(v.personagem) &&
        (v.exibicao === 'destaque' || v.exibicao === 'compacto') &&
        (v.dadoEsq === null || ehNumeroFinito(v.dadoEsq)) &&
        (v.dadoDir === null || ehNumeroFinito(v.dadoDir)) &&
        ehNumeroFinito(v.dadosEquilibrioTotal) &&
        Array.isArray(v.dadosUsados) &&
        (v.d4Pendente === null || ehNumeroFinito(v.d4Pendente)) &&
        (v.status === 'aguardando' ||
          v.status === 'equilibrado' ||
          v.status === 'desequilibrado' ||
          v.status === 'caiu')
      );
    case 'esconderijo':
      return (
        ehNumeroFinito(v.rodada) &&
        (v.fase === 'personagens' || v.fase === 'criaturas') &&
        typeof v.ocultarDoMestre === 'boolean' &&
        ehNumeroFinito(v.dtDistrair) &&
        Array.isArray(v.participantes) &&
        v.participantes.every(ehParticipante)
      );
    case 'perseguicao':
      return (
        ehNumeroFinito(v.rodada) &&
        ehNumeroFinito(v.totalRodadas) &&
        ehNumeroFinito(v.metaPa) &&
        ehObjeto(v.limiaresPorRodada) &&
        typeof v.mostrarPaJogadores === 'boolean' &&
        Array.isArray(v.participantes) &&
        v.participantes.every(ehParticipante)
      );
    case 'escalada':
      return (
        ehNumeroFinito(v.metaPontos) &&
        ehNumeroFinito(v.dtRapida) &&
        ehNumeroFinito(v.dtCautelosa) &&
        Array.isArray(v.participantes) &&
        v.participantes.every(ehParticipante)
      );
    default:
      return false;
  }
}
