/**
 * Criação e importação de mapas iniciais para o modo construção colaborativo (S2).
 * Puro (sem DOM): usado pela UI do saguão e pela casca ao enviar `construcao.abrir`.
 */
import { LIMITE_ESTADO_BYTES, comprimirEstado } from './estado-comprimido.ts';
import { PREFIXO_BLOB_CONSTRUCAO, type MensagemParaSala } from './protocolo.ts';

export const SCHEMA_MAPA = 'atlas.map' as const;
export const VERSAO_MAPA = 8 as const;
export const FORMATO_BACKUP = 'atlas.backup' as const;
export const VERSAO_BACKUP = 1 as const;
export const TAMANHO_CELULA_PADRAO = 1.5;

export type RenderizadorMapa = 'illustrated' | 'pixel';

export interface GeneroMapa {
  id: string;
  nome: string;
  descricao: string;
}

/** Gêneros suportados pelo Atlas (`Atlas/src/domain/presets.ts`). */
export const GENEROS_MAPA: readonly GeneroMapa[] = [
  { id: 'investigacao', nome: 'Investigação', descricao: 'Casa antiga, lamparinas, damasco' },
  { id: 'moderno', nome: 'Moderno', descricao: 'Lâmpadas, cores claras' },
  { id: 'fantasia', nome: 'Fantasia', descricao: 'Velas, tochas, pedra e madeira' },
  { id: 'antiguidade', nome: 'Antiguidade', descricao: 'Mármore, bronze, lucernas' },
  { id: 'oriental', nome: 'Oriental', descricao: 'Papel, laca, lanternas' },
  { id: 'deserto', nome: 'Deserto', descricao: 'Adobe, tecido, lanternas de latão' },
  { id: 'faroeste', nome: 'Faroeste', descricao: 'Tábuas, poeira, lampião' },
  { id: 'colonial', nome: 'Colonial e pirata', descricao: 'Caiado, convés, velas' },
  { id: 'vitoriano', nome: 'Vitoriano e steampunk', descricao: 'Latão, vapor, gás' },
  { id: 'pos-apocaliptico', nome: 'Pós-apocalíptico', descricao: 'Ferrugem, lona, fogo de tonel' },
  { id: 'cyberpunk', nome: 'Cyberpunk', descricao: 'Néon, chuva, telas' },
];

export interface OpcoesMapaConstrucaoInicial {
  nome?: string;
  larguraCelulas?: number;
  alturaCelulas?: number;
  renderer?: RenderizadorMapa;
  genre?: string;
  id?: string;
  agora?: number;
}

/** Documento de mapa compatível com `criarMapa` e `ESQUEMA_MAPA` (`Atlas/src/domain/mapa.ts` / `validacao.ts`). */
export type MapaConstrucaoInicial = {
  schema: typeof SCHEMA_MAPA;
  version: number;
  id: string;
  name: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  campanhaId: null;
  grid: {
    kind: 'square';
    size: number;
    offset: [number, number];
    visible: boolean;
    snap: boolean;
    lineStyle: 'solid';
    color: 'auto';
    opacity: number;
    lineWidth: number;
  };
  bounds: { width: number; height: number };
  style: {
    renderer: RenderizadorMapa;
    palette: string;
    walls: 'box';
    genre: string;
    pixel: { pixelsPerCell: number; dither: 'bayer4'; outline: boolean };
  };
  climate: {
    preset: string;
    ambient: { color: string; intensity: number };
    sun: { angle: number; color: string; intensity: number };
    time: string;
    weather: { rain: number; snow: number; fog: number; wind: number; dust: number; embers: number; leaves: number; lightning: number };
    gridPower: boolean;
  };
  finish: {
    preset: string;
    texture: number;
    vignette: number;
    saturation: number;
    grain: number;
    tint: string;
    grade: { lift: number; gamma: number; gain: number };
    edges: { kind: 'none'; amount: number };
    glow: number;
  };
  memory: { sketch: boolean; paper: string; ink: string };
  backdrop: { kind: 'solid'; color: string; material: null; title: null };
  terrain: { resolution: number; base: string; layers: Record<string, never> };
  rooms: Record<string, never>;
  walls: Record<string, never>;
  openings: Record<string, never>;
  props: Record<string, never>;
  lights: Record<string, never>;
  regions: Record<string, never>;
  presence: Record<string, never>;
  tokens: Record<string, never>;
  comodosExtra: Record<string, never>;
  session: { explored: null; initiative: null; revealed: never[]; event: null };
  audioCue: null;
  notes: string;
  climateAudio: Record<string, never>;
  customClimates: Record<string, never>;
  moments: Record<string, never>;
};

const PADRAO_IDENT = /^[A-Za-z0-9_-]{1,64}$/;

/** Normaliza dimensões em células mantendo `bounds` dentro do limite `[3, 600]` m do Atlas. */
export function normalizarCelulasMapa(valor: number | undefined, padrao: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return padrao;
  return Math.max(2, Math.min(400, Math.round(valor)));
}

/** Gera um `MapaAtlas` v8 em branco, idêntico ao criado por `criarMapa` do Atlas. */
export function criarMapaConstrucaoInicial(o: OpcoesMapaConstrucaoInicial = {}): MapaConstrucaoInicial {
  const celula = TAMANHO_CELULA_PADRAO;
  const largura = normalizarCelulasMapa(o.larguraCelulas, 30);
  const altura = normalizarCelulasMapa(o.alturaCelulas, 20);
  const t = typeof o.agora === 'number' && Number.isFinite(o.agora) && o.agora >= 0 ? o.agora : Date.now();
  const id = o.id && PADRAO_IDENT.test(o.id) ? o.id : crypto.randomUUID();
  const nome = (o.nome ?? '').trim().slice(0, 120) || 'Mapa sem nome';
  const renderer: RenderizadorMapa = o.renderer === 'pixel' ? 'pixel' : 'illustrated';
  const genre = typeof o.genre === 'string' && o.genre.trim() ? o.genre.trim().slice(0, 40) : 'investigacao';

  return {
    schema: SCHEMA_MAPA,
    version: VERSAO_MAPA,
    id,
    name: nome,
    revision: 0,
    createdAt: t,
    updatedAt: t,
    campanhaId: null,
    grid: {
      kind: 'square',
      size: celula,
      offset: [0, 0],
      visible: false,
      snap: true,
      lineStyle: 'solid',
      color: 'auto',
      opacity: 0.1,
      lineWidth: 1,
    },
    bounds: { width: largura * celula, height: altura * celula },
    style: {
      renderer,
      palette: 'investigacao-sepia',
      walls: 'box',
      genre,
      pixel: { pixelsPerCell: 16, dither: 'bayer4', outline: true },
    },
    climate: {
      preset: 'dia',
      ambient: { color: '#d1ccc0', intensity: 0.82 },
      sun: { angle: 0.6, color: '#fff2d6', intensity: 1 },
      time: '14:30',
      weather: { rain: 0, snow: 0, fog: 0, wind: 0, dust: 0, embers: 0, leaves: 0, lightning: 0 },
      gridPower: true,
    },
    finish: {
      preset: 'neutro',
      texture: 0.2,
      vignette: 0.28,
      saturation: 1,
      grain: 0.03,
      tint: '#ffffff',
      grade: { lift: 0, gamma: 1, gain: 1 },
      edges: { kind: 'none', amount: 0 },
      glow: 0,
    },
    memory: { sketch: true, paper: 'papel-claro', ink: '#241b14' },
    backdrop: { kind: 'solid', color: '#07080b', material: null, title: null },
    terrain: { resolution: 0.25, base: 'vazio', layers: {} },
    rooms: {},
    walls: {},
    openings: {},
    props: {},
    lights: {},
    regions: {},
    presence: {},
    tokens: {},
    comodosExtra: {},
    session: { explored: null, initiative: null, revealed: [], event: null },
    audioCue: null,
    notes: '',
    climateAudio: {},
    customClimates: {},
    moments: {},
  };
}

export type MapaImportado = Record<string, unknown> & {
  schema: typeof SCHEMA_MAPA;
  version: number;
  id: string;
  name: string;
};

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validarEntradaDeMapa(bruto: unknown): { ok: true; mapa: MapaImportado } | { ok: false; motivo: string } {
  if (!ehObj(bruto)) return { ok: false, motivo: 'O arquivo não é um mapa válido do Atlas.' };
  if (bruto.schema !== SCHEMA_MAPA) return { ok: false, motivo: `Esperado mapa com schema “${SCHEMA_MAPA}”.` };
  if (typeof bruto.version !== 'number' || !Number.isInteger(bruto.version) || bruto.version < 1) {
    return { ok: false, motivo: 'Versão do mapa inválida.' };
  }
  if (bruto.version > VERSAO_MAPA) {
    return { ok: false, motivo: `Este mapa é da versão ${bruto.version}, mais nova que a ${VERSAO_MAPA} suportada.` };
  }
  if (typeof bruto.id !== 'string' || !bruto.id.trim()) {
    return { ok: false, motivo: 'O mapa não possui um identificador válido.' };
  }
  if (typeof bruto.name !== 'string' || !bruto.name.trim()) {
    return { ok: false, motivo: 'O mapa não possui um nome válido.' };
  }
  if (bruto.bounds !== undefined) {
    if (!ehObj(bruto.bounds) || typeof bruto.bounds.width !== 'number' || !Number.isFinite(bruto.bounds.width) || bruto.bounds.width <= 0
      || typeof bruto.bounds.height !== 'number' || !Number.isFinite(bruto.bounds.height) || bruto.bounds.height <= 0) {
      return { ok: false, motivo: 'Dimensões do mapa inválidas.' };
    }
  }
  if (bruto.grid !== undefined && !ehObj(bruto.grid)) {
    return { ok: false, motivo: 'Configuração de grade inválida.' };
  }
  return { ok: true, mapa: bruto as MapaImportado };
}

/**
 * Extrai um mapa do Atlas de um JSON já parseado: aceita um `atlas.map` avulso
 * ou um `atlas.backup` (`PacoteBackup`), devolvendo o 1º mapa válido encontrado.
 */
export function extrairMapaImportado(parsed: unknown): MapaImportado {
  if (!ehObj(parsed)) throw new Error('O arquivo não contém um mapa do Atlas.');

  if (parsed.schema === SCHEMA_MAPA) {
    const res = validarEntradaDeMapa(parsed);
    if (!res.ok) throw new Error(res.motivo);
    return res.mapa;
  }

  if (parsed.formato === FORMATO_BACKUP) {
    if (typeof parsed.versao !== 'number' || !Number.isInteger(parsed.versao) || parsed.versao < 1) {
      throw new Error('Versão do arquivo de backup inválida.');
    }
    if (parsed.versao > VERSAO_BACKUP) {
      throw new Error(`Backup da versão ${parsed.versao}; este hub entende até a versão ${VERSAO_BACKUP}.`);
    }
    if (!Array.isArray(parsed.mapas)) {
      throw new Error('Backup incompleto: falta a lista de mapas.');
    }
    if (parsed.mapas.length === 0) {
      throw new Error('O arquivo de backup não contém nenhum mapa.');
    }
    let primeiroMotivo = 'Nenhum mapa válido encontrado no arquivo de backup.';
    for (let i = 0; i < parsed.mapas.length; i++) {
      const res = validarEntradaDeMapa(parsed.mapas[i]);
      if (res.ok) return res.mapa;
      if (i === 0) primeiroMotivo = res.motivo;
    }
    throw new Error(primeiroMotivo);
  }

  throw new Error('O arquivo não é um mapa (atlas.map) nem um backup (atlas.backup) do Atlas.');
}

export interface ClienteAberturaConstrucao {
  readonly estado: string;
  enviar(msg: MensagemParaSala): boolean;
  enviarBlob(id: string, blob: Blob): Promise<boolean>;
}

const BYTES = new TextEncoder();

/**
 * Envia `construcao.abrir` para a sala; se o JSON ultrapassar `LIMITE_ESTADO_BYTES`,
 * comprime em gzip e sobe como blob `construcao:0` antes de enviar a referência.
 */
export async function enviarAberturaConstrucao(
  cliente: ClienteAberturaConstrucao | null,
  mapa: Record<string, unknown>,
  nome?: string,
): Promise<void> {
  if (!cliente || cliente.estado !== 'aberta') {
    throw new Error('A sala não está conectada.');
  }
  const nomeFinal = nome?.trim() || (typeof mapa.name === 'string' && mapa.name.trim() ? mapa.name.trim() : undefined);
  const tamanhoBytes = BYTES.encode(JSON.stringify(mapa)).length;

  if (tamanhoBytes > LIMITE_ESTADO_BYTES) {
    const blobId = `${PREFIXO_BLOB_CONSTRUCAO}0`;
    const comprimido = await comprimirEstado(mapa);
    const subiu = await cliente.enviarBlob(blobId, comprimido);
    if (!subiu) throw new Error('Não foi possível enviar o mapa comprimido para a sala.');
    const enviou = cliente.enviar({
      tipo: 'construcao.abrir',
      blobId,
      ...(nomeFinal ? { nome: nomeFinal } : {}),
    });
    if (!enviou) throw new Error('A sala não está conectada.');
    return;
  }

  const enviou = cliente.enviar({
    tipo: 'construcao.abrir',
    mapa,
    ...(nomeFinal ? { nome: nomeFinal } : {}),
  });
  if (!enviou) throw new Error('A sala não está conectada.');
}
