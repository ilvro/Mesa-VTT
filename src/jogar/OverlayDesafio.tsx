/**
 * Overlays visuais imersivos dos Desafios de Ordem Paranormal 2 (A Vigília).
 * Usados na Casca do jogador online (`modo="jogador"`), preview do mestre (`modo="mestre"`)
 * e telão local presencial (`modo="telao"`).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  LADOS_VALIDOS,
  totaisEquilibrio,
  type AcaoDesafio,
  type DesafioAtivo,
  type DesafioEquilibrio,
  type DesafioEscalada,
  type DesafioEsconderijo,
  type DesafioLockpick,
  type DesafioPerseguicao,
  type LadosDado,
  type ParticipanteDesafio,
  type ResultadoPino,
} from '../dominio/desafios.ts';
import { tocarEfeitoDesafio } from './som-desafios.ts';
import './overlay-desafio.css';

export interface OverlayDesafioProps {
  desafio: DesafioAtivo | null;
  /** Papel de quem está vendo: `'jogador'` na Casca, `'mestre'` no preview/espectador, `'telao'` no projetor presencial (somente visualização, sem botões de controle do jogador se não interativo). */
  modo: 'jogador' | 'mestre' | 'telao';
  /** Discord ID do jogador atual (quando online). */
  meuDiscordId?: string | null;
  /** ID da ficha ativa do jogador atual (para destacar seu cartão e autorizar ações). */
  minhaFichaId?: string | null;
  /** Nome do autor para registrar em tentativas de lockpick. */
  meuNome?: string;
  /** Mapa opcional `fichaId -> dataUrl/url` de retratos já carregados na Casca. */
  retratos?: Record<string, string>;
  /** Callback para disparar uma ação do desafio (quando interativo). */
  aoAgir?: (acao: AcaoDesafio) => void;
}

type VarianteDado = 'osso' | 'sombra' | 'acerto' | 'alto' | 'baixo' | 'perigo' | 'trancado';

function iniciaisNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0]?.[0] ?? '?';
  const segunda = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : (partes[0]?.[1] ?? '');
  return (primeira + segunda).toUpperCase();
}

function obterRetrato(
  p: ParticipanteDesafio,
  retratos?: Record<string, string>,
): string | null {
  if (p.fichaId && retratos?.[p.fichaId]) return retratos[p.fichaId] ?? null;
  if (p.retrato) return p.retrato;
  return null;
}

function ehMeuParticipante(
  p: ParticipanteDesafio,
  meuDiscordId?: string | null,
  minhaFichaId?: string | null,
): boolean {
  if (minhaFichaId && p.fichaId && p.fichaId === minhaFichaId) return true;
  if (meuDiscordId && p.donoDiscordId && p.donoDiscordId === meuDiscordId) return true;
  return false;
}

function RetratoParticipante({
  participante,
  retratos,
  tamanho = 'padrao',
}: {
  participante: ParticipanteDesafio;
  retratos?: Record<string, string>;
  tamanho?: 'pequeno' | 'padrao' | 'grande';
}) {
  const url = obterRetrato(participante, retratos);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    setFalhou(false);
  }, [url]);

  const cls =
    tamanho === 'grande'
      ? 'ovd-retrato ovd-retrato-grande'
      : tamanho === 'pequeno'
        ? 'ovd-retrato ovd-retrato-pequeno'
        : 'ovd-retrato';

  if (url && !falhou) {
    return <img class={cls} src={url} alt={participante.nome} onError={() => setFalhou(true)} />;
  }
  return (
    <span class={cls} aria-hidden="true">
      {iniciaisNome(participante.nome)}
    </span>
  );
}

/** Polígonos SVG reais de dados: d4, d6, d8, d10, d12, d20. */
function DadoPoligono({
  lados,
  valor,
  variante = 'osso',
  tamanho = 56,
  interativo = false,
  rotulo,
  classe,
}: {
  lados: LadosDado;
  valor: number | string;
  variante?: VarianteDado;
  tamanho?: number;
  interativo?: boolean;
  rotulo?: string;
  classe?: string;
}) {
  const texto = String(valor);
  const tamanhoFonte =
    texto.length >= 2
      ? lados === 4
        ? 19
        : 22
      : lados === 4
        ? 23
        : 26;
  const textoY = lados === 4 ? 42 : 34;

  let forma: string;
  let faceta: string;
  switch (lados) {
    case 4:
      // Triângulo chanfrado
      forma = '30,6 34,6 59,50 56,56 8,56 5,50';
      faceta = '32,14 52,50 12,50';
      break;
    case 6:
      // Quadrado com cantos levemente biselados
      forma = '14,7 50,7 57,14 57,50 50,57 14,57 7,50 7,14';
      faceta = '17,13 47,13 51,17 51,47 47,51 17,51 13,47 13,17';
      break;
    case 8:
      // Losango / diamante
      forma = '32,4 58,32 32,60 6,32';
      faceta = '32,12 50,32 32,52 14,32';
      break;
    case 10:
    case 12:
      // Pentágono gótico
      forma = '32,5 58,24 48,56 16,56 6,24';
      faceta = '32,12 50,26 43,50 21,50 14,26';
      break;
    case 20:
      // Hexágono robusto
      forma = '32,4 56,18 56,46 32,60 8,46 8,18';
      faceta = '32,12 49,22 49,42 32,52 15,42 15,22';
      break;
  }

  const seta = variante === 'alto' ? '▲' : variante === 'baixo' ? '▼' : null;
  const setaY = variante === 'alto' ? 16 : 53;

  return (
    <span
      class={`ovd-dado${interativo ? ' ovd-dado-interativo' : ''}${classe ? ` ${classe}` : ''}`}
      data-variante={variante}
      data-lados={lados}
      style={{ width: `${tamanho}px`, height: `${tamanho}px` }}
      aria-label={rotulo ?? `d${lados}: ${texto}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <polygon class="ovd-dado-forma" points={forma} stroke-width="2.4" stroke-linejoin="round" />
        <polygon class="ovd-dado-faceta" points={faceta} stroke-width="1.2" stroke-linejoin="round" />
        {seta && lados !== 4 && (
          <text class="ovd-dado-seta" x="32" y={setaY} font-size="9">
            {seta}
          </text>
        )}
        <text class="ovd-dado-valor" x="32" y={textoY} font-size={tamanhoFonte}>
          {texto}
        </text>
      </svg>
    </span>
  );
}

/** Ícone SVG de figura encapuzada/sombra para Furtividade. */
function IconeSombra({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <svg
      class="ovd-esc-sombra-icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2.5C8.5 2.5 6 5.4 5.5 9.2L4.2 18.8C4 20.1 5 21.2 6.3 21.2H17.7C19 21.2 20 20.1 19.8 18.8L18.5 9.2C18 5.4 15.5 2.5 12 2.5Z"
        fill="currentColor"
        fill-opacity="0.16"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M8.6 9.5C9.4 7.5 10.6 6.5 12 6.5C13.4 6.5 14.6 7.5 15.4 9.5C14.8 12.2 13.5 13.6 12 13.6C10.5 13.6 9.2 12.2 8.6 9.5Z"
        fill="#0b0912"
        stroke="currentColor"
        stroke-width="1.3"
      />
      <circle cx="10.6" cy="10.2" r="0.8" fill="currentColor" />
      <circle cx="13.4" cy="10.2" r="0.8" fill="currentColor" />
    </svg>
  );
}

/** Ícone SVG de silhueta correndo para Perseguição. */
function IconeCorrendo({ tamanho = 24 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="15.5" cy="4.5" r="2" fill="currentColor" />
      <path
        d="M9.5 9.5L12.6 8.2L15.4 10.6L18.6 9.8M12.6 8.2L10.8 13.4L14.6 15.6L13.8 20.2M10.8 13.4L7.2 16.4L4.5 16"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** SVG de contorno anatômico de pulmão com dados d6 de fôlego no interior. */
function PulmaoFolego({
  restante,
  total,
  interativo,
  aoUsar,
}: {
  restante: number;
  total: number;
  interativo: boolean;
  aoUsar: () => void;
}) {
  const slots = Math.max(total, restante, 0);
  const itens = Array.from({ length: slots }, (_, idx) => idx < restante);

  return (
    <div class="ovd-pulmao-wrap">
      <button
        type="button"
        class="ovd-pulmao-btn"
        data-interativo={interativo && restante > 0 ? '1' : '0'}
        disabled={!interativo || restante <= 0}
        onClick={aoUsar}
        title={interativo && restante > 0 ? 'Usar 1 dado de Fôlego (d6)' : `Fôlego: ${restante}/${total}`}
        aria-label={`Fôlego: ${restante} de ${total} dados d6`}
      >
        <svg width="96" height="76" viewBox="0 0 120 96" fill="none" aria-hidden="true">
          {/* Traqueia e brônquios */}
          <path
            d="M60 6V30M60 28L47 38M60 28L73 38"
            stroke="rgba(225, 240, 255, 0.72)"
            stroke-width="2.4"
            stroke-linecap="round"
          />
          {/* Pulmão esquerdo */}
          <path
            d="M52 24C40 20 22 30 16 50C12 64 14 78 24 83C34 88 47 82 52 74C54 70 55 58 55 44C55 34 54 27 52 24Z"
            fill="rgba(108, 214, 247, 0.08)"
            stroke="rgba(230, 244, 255, 0.84)"
            stroke-width="2"
            stroke-linejoin="round"
          />
          {/* Pulmão direito */}
          <path
            d="M68 24C80 20 98 30 104 50C108 64 106 78 96 83C86 88 73 82 68 74C66 70 65 58 65 44C65 34 66 27 68 24Z"
            fill="rgba(108, 214, 247, 0.08)"
            stroke="rgba(230, 244, 255, 0.84)"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </svg>
        <div class="ovd-pulmao-dados">
          {itens.map((ativo, i) => (
            <span key={i} class={ativo ? undefined : 'ovd-pulmao-gasto'}>
              <DadoPoligono lados={6} valor="d6" variante={ativo ? 'osso' : 'sombra'} tamanho={22} />
            </span>
          ))}
        </div>
      </button>
      <span class="ovd-pulmao-legenda">
        Fôlego {restante}/{total}
      </span>
    </div>
  );
}

/** Selo circular de pedra escura entalhada em SVG (estética A Vigília). */
function SeloPedraSvg({ angulo, status }: { angulo: number; status: DesafioLockpick['status'] }) {
  const corAcento =
    status === 'aberto'
      ? 'rgba(232, 185, 90, 0.62)'
      : status === 'travado'
        ? 'rgba(255, 92, 108, 0.55)'
        : 'rgba(234, 230, 221, 0.24)';
  const marcas = Array.from({ length: 24 }, (_, i) => i * 15);

  return (
    <svg class="ovd-lock-selo-svg" viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="ovd-pedra-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#221d30" stop-opacity="0.52" />
          <stop offset="72%" stop-color="#110e19" stop-opacity="0.72" />
          <stop offset="100%" stop-color="#09070e" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="186" fill="url(#ovd-pedra-grad)" />
      {/* Anel externo rotativo */}
      <g class="ovd-selo-anel-ext" style={{ transform: `rotate(${angulo}deg)` }}>
        <circle cx="200" cy="200" r="174" stroke={corAcento} stroke-width="2" stroke-dasharray="18 8 4 8" />
        <circle cx="200" cy="200" r="158" stroke="rgba(234, 230, 221, 0.14)" stroke-width="1.2" />
        {marcas.map((deg) => (
          <line
            key={deg}
            x1="200"
            y1="28"
            x2="200"
            y2={deg % 45 === 0 ? '44' : '36'}
            stroke={deg % 90 === 0 ? corAcento : 'rgba(234, 230, 221, 0.18)'}
            stroke-width={deg % 90 === 0 ? '2' : '1'}
            transform={`rotate(${deg} 200 200)`}
          />
        ))}
        {/* Losangos cardeais */}
        {[0, 90, 180, 270].map((deg) => (
          <polygon
            key={deg}
            points="200,14 206,22 200,30 194,22"
            fill={corAcento}
            transform={`rotate(${deg} 200 200)`}
          />
        ))}
      </g>
      {/* Anel interno contra-rotativo */}
      <g class="ovd-selo-anel-int" style={{ transform: `rotate(${-angulo * 1.4}deg)` }}>
        <circle cx="200" cy="200" r="118" stroke={corAcento} stroke-width="1.5" stroke-dasharray="6 6" />
        <polygon
          points="200,92 293,254 107,254"
          stroke="rgba(234, 230, 221, 0.1)"
          stroke-width="1.2"
          fill="none"
        />
        <polygon
          points="200,308 293,146 107,146"
          stroke="rgba(234, 230, 221, 0.1)"
          stroke-width="1.2"
          fill="none"
        />
      </g>
    </svg>
  );
}

/** Balança SVG animada para o desafio de Equilíbrio. */
function BalancaSvg({
  esq,
  dir,
  status,
  compacto = false,
}: {
  esq: number;
  dir: number;
  status: DesafioEquilibrio['status'];
  compacto?: boolean;
}) {
  const angulo = Math.max(-22, Math.min(22, (dir - esq) * 4.5));
  const corMetal =
    status === 'equilibrado'
      ? '#53e2a1'
      : status === 'caiu'
        ? '#ff5c6c'
        : '#e8b95a';

  return (
    <svg
      class={compacto ? 'ovd-balanca-svg ovd-eq-compacto-svg' : 'ovd-balanca-svg'}
      viewBox="0 0 440 230"
      fill="none"
      aria-label={`Balança: esquerda ${esq}, direita ${dir}`}
    >
      {/* Pedestal e pilar ornamentado */}
      <path
        d="M168 214H272L260 200H180L168 214Z"
        fill="rgba(234, 230, 221, 0.14)"
        stroke={corMetal}
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <rect x="214" y="64" width="12" height="136" rx="4" fill="rgba(234, 230, 221, 0.12)" stroke={corMetal} stroke-width="1.6" />
      {/* Ornamento central */}
      <polygon points="220,30 231,48 220,66 209,48" fill="rgba(20, 16, 30, 0.95)" stroke={corMetal} stroke-width="2" />
      <circle cx="220" cy="48" r="3.5" fill={corMetal} />

      {/* Haste inclinável */}
      <g class="ovd-balanca-haste" style={{ transform: `rotate(${angulo}deg)` }}>
        <path
          d="M84 64C128 54 176 58 220 64C264 58 312 54 356 64"
          stroke={corMetal}
          stroke-width="4.5"
          stroke-linecap="round"
        />
        <circle cx="96" cy="64" r="5" fill={corMetal} />
        <circle cx="344" cy="64" r="5" fill={corMetal} />

        {/* Prato esquerdo (contra-rotação para manter nivelado) */}
        <g class="ovd-balanca-prato-esq" style={{ transform: `rotate(${-angulo}deg)` }}>
          <line x1="96" y1="68" x2="64" y2="146" stroke="rgba(234, 230, 221, 0.55)" stroke-width="1.6" />
          <line x1="96" y1="68" x2="128" y2="146" stroke="rgba(234, 230, 221, 0.55)" stroke-width="1.6" />
          <path
            d="M48 146H144C140 162 122 170 96 170C70 170 52 162 48 146Z"
            fill="rgba(24, 20, 34, 0.92)"
            stroke={corMetal}
            stroke-width="2"
            stroke-linejoin="round"
          />
          <text
            x="96"
            y="134"
            text-anchor="middle"
            fill="#eae6dd"
            font-size="28"
            font-weight="800"
            font-family="var(--ovd-fonte-titulo)"
          >
            {esq}
          </text>
          <text
            x="96"
            y="186"
            text-anchor="middle"
            fill="rgba(234, 230, 221, 0.62)"
            font-size="10.5"
            font-weight="700"
            letter-spacing="2"
          >
            ESQUERDA
          </text>
        </g>

        {/* Prato direito (contra-rotação para manter nivelado) */}
        <g class="ovd-balanca-prato-dir" style={{ transform: `rotate(${-angulo}deg)` }}>
          <line x1="344" y1="68" x2="312" y2="146" stroke="rgba(234, 230, 221, 0.55)" stroke-width="1.6" />
          <line x1="344" y1="68" x2="376" y2="146" stroke="rgba(234, 230, 221, 0.55)" stroke-width="1.6" />
          <path
            d="M296 146H392C388 162 370 170 344 170C318 170 300 162 296 146Z"
            fill="rgba(24, 20, 34, 0.92)"
            stroke={corMetal}
            stroke-width="2"
            stroke-linejoin="round"
          />
          <text
            x="344"
            y="134"
            text-anchor="middle"
            fill="#eae6dd"
            font-size="28"
            font-weight="800"
            font-family="var(--ovd-fonte-titulo)"
          >
            {dir}
          </text>
          <text
            x="344"
            y="186"
            text-anchor="middle"
            fill="rgba(234, 230, 221, 0.62)"
            font-size="10.5"
            font-weight="700"
            letter-spacing="2"
          >
            DIREITA
          </text>
        </g>
      </g>

      {/* Pivô central sobre a haste */}
      <circle cx="220" cy="64" r="7" fill="#16131c" stroke={corMetal} stroke-width="2.2" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. ABRIR FECHADURAS (LOCKPICK)
   ═══════════════════════════════════════════════════════════════════════════ */

function fraseEmbaralhada(tipo: 'corretos' | 'altos' | 'baixos' | 'trancados', qtd: number): string {
  if (tipo === 'corretos') return qtd === 1 ? 'ALGUM ESTÁ CORRETO' : `${qtd} ESTÃO CORRETOS`;
  if (tipo === 'altos') return qtd === 1 ? 'ALGUM ESTÁ ALTO' : `${qtd} ESTÃO ALTOS`;
  if (tipo === 'baixos') return qtd === 1 ? 'ALGUM ESTÁ BAIXO' : `${qtd} ESTÃO BAIXOS`;
  return qtd === 1 ? 'ALGUM ESTÁ TRANCADO' : `${qtd} ESTÃO TRANCADOS`;
}

function rotuloPino(res: ResultadoPino): string {
  if (res === 'exato') return '✓ EXATO';
  if (res === 'alto') return '▲ MAIS ALTO';
  if (res === 'baixo') return '▼ MAIS BAIXO';
  return '🔒 TRANCADO';
}

function variantePino(res: ResultadoPino | undefined, status: DesafioLockpick['status']): VarianteDado {
  if (status === 'aberto') return 'acerto';
  if (status === 'travado') return 'perigo';
  if (res === 'exato') return 'acerto';
  if (res === 'alto') return 'alto';
  if (res === 'baixo') return 'baixo';
  if (res === 'trancado') return 'trancado';
  return 'osso';
}

function OverlayLockpick({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  meuNome,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioLockpick;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  meuNome?: string;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const ultimaTentativa = desafio.tentativas[desafio.tentativas.length - 1];
  const [valores, setValores] = useState<number[]>(() =>
    desafio.dados.map((_, i) => ultimaTentativa?.valores[i] ?? 1),
  );
  const idRef = useRef(desafio.id);

  useEffect(() => {
    if (idRef.current !== desafio.id || valores.length !== desafio.dados.length) {
      idRef.current = desafio.id;
      const ult = desafio.tentativas[desafio.tentativas.length - 1];
      setValores(desafio.dados.map((_, i) => ult?.valores[i] ?? 1));
    }
  }, [desafio.id, desafio.dados, desafio.tentativas, valores.length]);

  const autorizado =
    !desafio.jogadorAutorizadoId ||
    desafio.jogadorAutorizadoId === meuDiscordId ||
    desafio.jogadorAutorizadoId === minhaFichaId;
  const podeAgir = modo === 'jogador' && Boolean(aoAgir) && desafio.status === 'ativo' && autorizado;

  const ajustar = (idx: number, delta: number) => {
    if (!podeAgir) return;
    const lados = desafio.dados[idx] ?? 6;
    setValores((atual) =>
      atual.map((v, i) => {
        if (i !== idx) return v;
        const proximo = ((v - 1 + delta) % lados + lados) % lados + 1;
        return proximo;
      }),
    );
    tocarEfeitoDesafio('pino-girar');
  };

  const tentar = () => {
    if (!podeAgir || !aoAgir) return;
    aoAgir({
      tipo: 'lockpick.tentar',
      valores: desafio.dados.map((_, i) => valores[i] ?? 1),
      autorNome: meuNome?.trim() || 'Investigador',
    });
  };

  const tentativasUsadas = desafio.tentativas.length;
  const restantes = Math.max(0, desafio.maxTentativas - tentativasUsadas);
  const anguloSelo = tentativasUsadas * 28 + (desafio.status === 'aberto' ? 90 : 0);

  return (
    <div class="ovd-palco-backdrop" data-testid="overlay-lockpick">
      <section class="ovd-palco ovd-palco-lockpick" data-status={desafio.status} aria-label={desafio.titulo}>
        <header class="ovd-palco-topo">
          <div class="ovd-palco-titulos">
            <span class="ovd-eyebrow">Abrir Fechaduras</span>
            <h2 class="ovd-titulo">{desafio.titulo}</h2>
            {desafio.jogadorAutorizadoNome && (
              <p class="ovd-subtitulo">
                Na fechadura: <strong>{desafio.jogadorAutorizadoNome}</strong>
              </p>
            )}
          </div>
          <button type="button" class="ovd-btn-recolher" onClick={aoRecolher}>
            Espiar mapa
          </button>
        </header>

        <div class="ovd-lock-arena">
          <div class="ovd-lock-selo-bg">
            <SeloPedraSvg angulo={anguloSelo} status={desafio.status} />
          </div>

          <div class="ovd-lock-pinos" data-qtd={desafio.dados.length}>
            {desafio.dados.map((lados, idx) => {
              const valorExibido =
                desafio.status === 'aberto' && desafio.senha?.[idx] !== undefined
                  ? desafio.senha[idx]!
                  : podeAgir
                    ? (valores[idx] ?? 1)
                    : (ultimaTentativa?.valores[idx] ?? valores[idx] ?? 1);
              const dicaPosicional =
                desafio.modoDica === 'posicional' ? ultimaTentativa?.feedbackPosicional?.[idx] : undefined;
              const dep = desafio.dependencias?.[idx] ?? null;
              const depDestrancada =
                dep === null ||
                desafio.status === 'aberto' ||
                (dicaPosicional !== undefined && dicaPosicional !== 'trancado');
              const variante =
                dicaPosicional === undefined && dep !== null && desafio.status === 'ativo'
                  ? 'trancado'
                  : variantePino(dicaPosicional, desafio.status);

              return (
                <div
                  key={idx}
                  class="ovd-lock-pino"
                  onWheel={(e) => {
                    if (!podeAgir) return;
                    e.preventDefault();
                    ajustar(idx, e.deltaY < 0 ? 1 : -1);
                  }}
                >
                  <span class="ovd-lock-pino-rotulo">
                    Pino {idx + 1} • d{lados}
                  </span>
                  {dep !== null && (
                    <span class="ovd-lock-pino-dep" data-aberto={depDestrancada ? '1' : '0'}>
                      {depDestrancada ? `🔓 Pino ${dep + 1}` : `🔒 Requer Pino ${dep + 1}`}
                    </span>
                  )}
                  {podeAgir && (
                    <button
                      type="button"
                      class="ovd-lock-controle"
                      aria-label={`Aumentar pino ${idx + 1}`}
                      onClick={() => ajustar(idx, 1)}
                    >
                      +
                    </button>
                  )}
                  <DadoPoligono
                    lados={lados}
                    valor={valorExibido}
                    variante={variante}
                    tamanho={76}
                    interativo={podeAgir}
                    rotulo={`Pino ${idx + 1} (d${lados}): ${valorExibido}`}
                  />
                  {podeAgir && (
                    <button
                      type="button"
                      class="ovd-lock-controle"
                      aria-label={`Diminuir pino ${idx + 1}`}
                      onClick={() => ajustar(idx, -1)}
                    >
                      −
                    </button>
                  )}
                  {desafio.modoDica === 'posicional' && dicaPosicional && desafio.status === 'ativo' && (
                    <span class="ovd-lock-dica-pino" data-res={dicaPosicional}>
                      {rotuloPino(dicaPosicional)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Feedback embaralhado (estética da harpa) */}
        {desafio.modoDica === 'embaralhado' &&
          desafio.status === 'ativo' &&
          ultimaTentativa?.feedbackEmbaralhado && (
            <div class="ovd-lock-harpa" aria-live="polite">
              {ultimaTentativa.feedbackEmbaralhado.corretos > 0 && (
                <p class="ovd-lock-harpa-linha" data-tom="acerto">
                  {fraseEmbaralhada('corretos', ultimaTentativa.feedbackEmbaralhado.corretos)}
                </p>
              )}
              {ultimaTentativa.feedbackEmbaralhado.altos > 0 && (
                <p class="ovd-lock-harpa-linha" data-tom="alto">
                  {fraseEmbaralhada('altos', ultimaTentativa.feedbackEmbaralhado.altos)}
                </p>
              )}
              {ultimaTentativa.feedbackEmbaralhado.baixos > 0 && (
                <p class="ovd-lock-harpa-linha" data-tom="baixo">
                  {fraseEmbaralhada('baixos', ultimaTentativa.feedbackEmbaralhado.baixos)}
                </p>
              )}
              {(ultimaTentativa.feedbackEmbaralhado.trancados ?? 0) > 0 && (
                <p class="ovd-lock-harpa-linha" data-tom="trancado">
                  {fraseEmbaralhada('trancados', ultimaTentativa.feedbackEmbaralhado.trancados ?? 0)}
                </p>
              )}
            </div>
          )}

        {/* Banners finais */}
        {desafio.status === 'aberto' && (
          <div class="ovd-lock-banner" data-status="aberto" role="status">
            FECHADURA DESTRANCADA
          </div>
        )}
        {desafio.status === 'travado' && (
          <div class="ovd-lock-banner" data-status="travado" role="status">
            FECHADURA DANIFICADA
          </div>
        )}

        <footer class="ovd-lock-rodape">
          {podeAgir && (
            <button type="button" class="ovd-btn ovd-btn-primario" onClick={tentar}>
              Testar Combinação
            </button>
          )}

          <div class="ovd-lock-pips-wrap">
            <span class="ovd-lock-pips-rotulo">
              Tentativas restantes: {restantes}/{desafio.maxTentativas}
            </span>
            <span class="ovd-lock-pips" aria-hidden="true">
              {Array.from({ length: desafio.maxTentativas }, (_, i) => (
                <span key={i} class="ovd-lock-pip" data-gasto={i < tentativasUsadas ? '1' : '0'} />
              ))}
            </span>
          </div>

          {desafio.tentativas.length > 0 && (
            <div class="ovd-lock-historico" aria-label="Tentativas anteriores">
              {desafio.tentativas.map((t) => (
                <span key={t.numero} class="ovd-lock-hist-item" data-acertou={t.acertou ? '1' : '0'}>
                  <span>#{t.numero}</span>
                  <strong>{t.valores.join(' · ')}</strong>
                  <span>{t.autorNome}</span>
                </span>
              ))}
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. EQUILÍBRIO (BALANÇA)
   ═══════════════════════════════════════════════════════════════════════════ */

function textoStatusEquilibrio(status: DesafioEquilibrio['status'], diferenca: number): string {
  switch (status) {
    case 'aguardando':
      return 'AGUARDANDO ROLAGEM';
    case 'equilibrado':
      return 'EQUILIBRADO';
    case 'desequilibrado':
      return `EM RISCO — DIFERENÇA ${diferenca}`;
    case 'caiu':
      return 'CAIU!';
  }
}

function OverlayEquilibrio({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  retratos,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioEquilibrio;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const { esq, dir, diferenca, restantes } = totaisEquilibrio(desafio);
  const temRestricao = Boolean(desafio.personagem.fichaId || desafio.personagem.donoDiscordId);
  const souEu = ehMeuParticipante(desafio.personagem, meuDiscordId, minhaFichaId);
  const podeAgir = modo === 'jogador' && Boolean(aoAgir) && (!temRestricao || souEu);

  const dadosEsq = desafio.dadosUsados.filter((d) => d.lado === 'esq');
  const dadosDir = desafio.dadosUsados.filter((d) => d.lado === 'dir');
  const statusTexto = textoStatusEquilibrio(desafio.status, diferenca);

  const acoes = podeAgir && aoAgir && (
    <div class="ovd-eq-acoes">
      {desafio.dadoEsq === null || desafio.dadoDir === null ? (
        <button
          type="button"
          class="ovd-btn ovd-btn-primario"
          onClick={() => aoAgir({ tipo: 'equilibrio.rolar-inicial' })}
        >
          Rolar 2d10
        </button>
      ) : desafio.d4Pendente !== null ? (
        <div class="ovd-eq-pendente">
          <DadoPoligono lados={4} valor={desafio.d4Pendente} variante="alto" tamanho={46} />
          <button
            type="button"
            class="ovd-btn ovd-btn-primario ovd-btn-pequeno"
            onClick={() => aoAgir({ tipo: 'equilibrio.aplicar-d4', lado: 'esq' })}
          >
            Colocar na Esquerda
          </button>
          <button
            type="button"
            class="ovd-btn ovd-btn-primario ovd-btn-pequeno"
            onClick={() => aoAgir({ tipo: 'equilibrio.aplicar-d4', lado: 'dir' })}
          >
            Colocar na Direita
          </button>
        </div>
      ) : desafio.status === 'desequilibrado' && restantes > 0 ? (
        <button
          type="button"
          class="ovd-btn ovd-btn-primario"
          onClick={() => aoAgir({ tipo: 'equilibrio.rolar-d4' })}
        >
          Rolar d4 de Equilíbrio ({restantes})
        </button>
      ) : null}
    </div>
  );

  if (desafio.exibicao === 'compacto') {
    return (
      <div class="ovd-eq-compacto-wrap" data-testid="overlay-equilibrio-compacto">
        <section class="ovd-eq-compacto-card" data-status={desafio.status} aria-label={desafio.titulo}>
          <header class="ovd-eq-compacto-topo">
            <div class="ovd-eq-personagem">
              <RetratoParticipante participante={desafio.personagem} retratos={retratos} tamanho="pequeno" />
              <div>
                <div class="ovd-eyebrow">{desafio.titulo}</div>
                <strong style={{ fontSize: '13px' }}>{desafio.personagem.nome}</strong>
              </div>
            </div>
            <button type="button" class="ovd-btn-recolher" onClick={aoRecolher}>
              Recolher
            </button>
          </header>

          <BalancaSvg esq={esq} dir={dir} status={desafio.status} compacto />

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span class="ovd-eq-status" data-status={desafio.status}>
              {statusTexto}
            </span>
          </div>

          {acoes}
        </section>
      </div>
    );
  }

  return (
    <div class="ovd-palco-backdrop" data-testid="overlay-equilibrio-destaque">
      <section class="ovd-palco" aria-label={desafio.titulo}>
        <header class="ovd-palco-topo">
          <div class="ovd-eq-personagem">
            <RetratoParticipante participante={desafio.personagem} retratos={retratos} tamanho="grande" />
            <div class="ovd-palco-titulos">
              <span class="ovd-eyebrow">Desafio de Equilíbrio</span>
              <h2 class="ovd-titulo">{desafio.titulo}</h2>
              <p class="ovd-subtitulo">
                {desafio.personagem.nome} • Dados d4 restantes: <strong>{restantes}</strong>/{desafio.dadosEquilibrioTotal}
              </p>
            </div>
          </div>
          <button type="button" class="ovd-btn-recolher" onClick={aoRecolher}>
            Espiar mapa
          </button>
        </header>

        <div class="ovd-balanca-wrap">
          <BalancaSvg esq={esq} dir={dir} status={desafio.status} />

          <span class="ovd-eq-status" data-status={desafio.status} role="status">
            {statusTexto}
          </span>

          <div class="ovd-eq-dados-linha">
            <div class="ovd-eq-lado-box">
              <span class="ovd-eq-lado-titulo">Prato Esquerdo ({esq})</span>
              <div class="ovd-eq-lado-dados">
                <DadoPoligono
                  lados={10}
                  valor={desafio.dadoEsq ?? '—'}
                  variante={desafio.status === 'caiu' ? 'perigo' : 'osso'}
                  tamanho={48}
                />
                {dadosEsq.map((d) => (
                  <DadoPoligono key={d.id} lados={4} valor={d.valor} variante="alto" tamanho={34} />
                ))}
              </div>
            </div>

            <div class="ovd-eq-lado-box">
              <span class="ovd-eq-lado-titulo">Prato Direito ({dir})</span>
              <div class="ovd-eq-lado-dados">
                <DadoPoligono
                  lados={10}
                  valor={desafio.dadoDir ?? '—'}
                  variante={desafio.status === 'caiu' ? 'perigo' : 'osso'}
                  tamanho={48}
                />
                {dadosDir.map((d) => (
                  <DadoPoligono key={d.id} lados={4} valor={d.valor} variante="alto" tamanho={34} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {acoes}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. CENA DE FURTIVIDADE (ESCONDERIJO)
   ═══════════════════════════════════════════════════════════════════════════ */

function OverlayEsconderijo({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  retratos,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioEsconderijo;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [ladosRolar, setLadosRolar] = useState<LadosDado>(6);
  const [ladosEsconder, setLadosEsconder] = useState<LadosDado>(6);
  const [ladosDistrair, setLadosDistrair] = useState<LadosDado>(6);
  const [aliadoDistrairId, setAliadoDistrairId] = useState<string>('');
  const [aliadoChamarId, setAliadoChamarId] = useState<string>('');
  const [dadoTransferirId, setDadoTransferirId] = useState<string>('');
  const [dadoDescartarId, setDadoDescartarId] = useState<string>('');
  const [buscaOcultaId, setBuscaOcultaId] = useState<string | null>(null);

  const mostrarBusca = Boolean(desafio.ultimaBusca && desafio.ultimaBusca.id !== buscaOcultaId);

  return (
    <div class="ovd-hud-topo" data-testid="overlay-esconderijo">
      <header class="ovd-hud-barra">
        <IconeSombra tamanho={18} />
        <span class="ovd-hud-barra-titulo">{desafio.titulo}</span>
        <span class="ovd-hud-chip">Rodada {desafio.rodada}</span>
        <span class="ovd-hud-chip" data-tom={desafio.fase === 'criaturas' ? 'carmesim' : 'ouro'}>
          {desafio.fase === 'criaturas' ? 'Turno das Criaturas' : 'Turno dos Personagens'}
        </span>
        <span class="ovd-hud-chip">Distrair DT {desafio.dtDistrair}</span>
        <button type="button" class="ovd-btn-recolher" onClick={aoRecolher}>
          Recolher
        </button>
      </header>

      {mostrarBusca && desafio.ultimaBusca && (
        <div class="ovd-busca-banner" role="alert">
          <div class="ovd-busca-esquerda">
            <span class="ovd-busca-rotulo">Busca da Criatura</span>
            <div class="ovd-busca-dados">
              {desafio.ultimaBusca.dados.map((d, i) => (
                <DadoPoligono key={i} lados={d.lados} valor={d.valor} variante="perigo" tamanho={34} />
              ))}
            </div>
            <span class="ovd-busca-atingidos">
              {desafio.ultimaBusca.atingidos.length === 0
                ? 'Ninguém foi atingido.'
                : desafio.ultimaBusca.atingidos
                    .map((a) =>
                      a.ficouEncontrado
                        ? `${a.nome} perdeu [${a.valores.join(', ')}] e foi ENCONTRADO!`
                        : `${a.nome} perdeu [${a.valores.join(', ')}]`,
                    )
                    .join(' • ')}
            </span>
          </div>
          <button
            type="button"
            class="ovd-btn-recolher"
            onClick={() => setBuscaOcultaId(desafio.ultimaBusca?.id ?? null)}
          >
            Fechar
          </button>
        </div>
      )}

      <div class="ovd-faixa-cards">
        {desafio.participantes.map((p) => {
          const souEu = ehMeuParticipante(p, meuDiscordId, minhaFichaId);
          const podeAgir = modo === 'jogador' && Boolean(aoAgir) && souEu;
          const expandido = podeAgir && abertoId === p.id;
          const aliados = desafio.participantes.filter((outro) => outro.id !== p.id);
          const alvoDistrair =
            aliados.some((a) => a.id === aliadoDistrairId) ? aliadoDistrairId : (aliados[0]?.id ?? '');
          const alvoChamar =
            aliados.some((a) => a.id === aliadoChamarId) ? aliadoChamarId : (aliados[0]?.id ?? '');
          const transferirAtual =
            p.dados.some((d) => d.id === dadoTransferirId) ? dadoTransferirId : (p.dados[0]?.id ?? '');
          const descartarAtual =
            p.dados.some((d) => d.id === dadoDescartarId && d.id !== transferirAtual)
              ? dadoDescartarId
              : (p.dados.find((d) => d.id !== transferirAtual)?.id ?? '');

          return (
            <article
              key={p.id}
              class="ovd-esc-card"
              data-meu={souEu ? '1' : '0'}
              data-encontrado={p.encontrado ? '1' : '0'}
            >
              <div class="ovd-esc-topo">
                <RetratoParticipante participante={p} retratos={retratos} tamanho="padrao" />
                <div class="ovd-esc-info">
                  <span class="ovd-esc-nome">{p.nome}</span>
                  <span class="ovd-esc-meta">
                    <span>Esconder-se DT {p.dtEsconderSe}</span>
                  </span>
                </div>
                <IconeSombra tamanho={20} />
              </div>

              <div class="ovd-esc-dados">
                {p.encontrado ? (
                  <span class="ovd-selo-encontrado">ENCONTRADO</span>
                ) : p.dados.length === 0 ? (
                  <span class="ovd-esc-vazio">Sem dados de esconderijo</span>
                ) : (
                  p.dados.map((d) => (
                    <DadoPoligono
                      key={d.id}
                      lados={d.lados}
                      valor={d.valor === 0 ? '?' : d.valor}
                      variante="sombra"
                      tamanho={38}
                    />
                  ))
                )}
              </div>

              {podeAgir && aoAgir && (
                <>
                  <button
                    type="button"
                    class="ovd-btn ovd-btn-pequeno"
                    aria-expanded={expandido}
                    onClick={() => setAbertoId(expandido ? null : p.id)}
                  >
                    {expandido ? 'Fechar Ações' : 'Ações de Furtividade'}
                  </button>

                  {expandido && (
                    <div class="ovd-esc-acoes-painel">
                      {/* Rolar Esconderijo */}
                      <div class="ovd-esc-bloco">
                        <span class="ovd-esc-bloco-titulo">Rolar Esconderijo</span>
                        <div class="ovd-esc-linha">
                          <select
                            class="ovd-select"
                            aria-label="Lados do dado de esconderijo"
                            value={ladosRolar}
                            onChange={(e) => setLadosRolar(Number(e.currentTarget.value) as LadosDado)}
                          >
                            {LADOS_VALIDOS.map((l) => (
                              <option key={l} value={l}>
                                d{l}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            class="ovd-btn ovd-btn-pequeno ovd-btn-primario"
                            onClick={() =>
                              aoAgir({
                                tipo: 'esconderijo.adicionar-dado',
                                participanteId: p.id,
                                lados: ladosRolar,
                              })
                            }
                          >
                            + Rolar d{ladosRolar}
                          </button>
                        </div>
                      </div>

                      {/* Esconder-se */}
                      <div class="ovd-esc-bloco">
                        <span class="ovd-esc-bloco-titulo">Esconder-se (DT {p.dtEsconderSe})</span>
                        <div class="ovd-esc-linha">
                          <select
                            class="ovd-select"
                            aria-label="Dado de Esconder-se"
                            value={ladosEsconder}
                            onChange={(e) => setLadosEsconder(Number(e.currentTarget.value) as LadosDado)}
                          >
                            {LADOS_VALIDOS.map((l) => (
                              <option key={l} value={l}>
                                d{l}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            class="ovd-btn ovd-btn-pequeno ovd-btn-esmeralda"
                            onClick={() =>
                              aoAgir({
                                tipo: 'esconderijo.esconder-se',
                                participanteId: p.id,
                                passou: true,
                                lados: ladosEsconder,
                              })
                            }
                          >
                            Passou
                          </button>
                          <button
                            type="button"
                            class="ovd-btn ovd-btn-pequeno ovd-btn-carmesim"
                            onClick={() =>
                              aoAgir({
                                tipo: 'esconderijo.esconder-se',
                                participanteId: p.id,
                                passou: false,
                              })
                            }
                          >
                            Falhou
                          </button>
                        </div>
                      </div>

                      {/* Distrair */}
                      {aliados.length > 0 && (
                        <div class="ovd-esc-bloco">
                          <span class="ovd-esc-bloco-titulo">Distrair (DT {desafio.dtDistrair})</span>
                          <div class="ovd-esc-linha">
                            <select
                              class="ovd-select"
                              aria-label="Aliado para Distrair"
                              value={alvoDistrair}
                              onChange={(e) => setAliadoDistrairId(e.currentTarget.value)}
                            >
                              {aliados.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nome}
                                </option>
                              ))}
                            </select>
                            <select
                              class="ovd-select"
                              aria-label="Dado de Distrair"
                              value={ladosDistrair}
                              onChange={(e) => setLadosDistrair(Number(e.currentTarget.value) as LadosDado)}
                            >
                              {LADOS_VALIDOS.map((l) => (
                                <option key={l} value={l}>
                                  d{l}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              class="ovd-btn ovd-btn-pequeno ovd-btn-esmeralda"
                              disabled={!alvoDistrair}
                              onClick={() =>
                                aoAgir({
                                  tipo: 'esconderijo.distrair',
                                  alvoParticipanteId: alvoDistrair,
                                  passou: true,
                                  lados: ladosDistrair,
                                })
                              }
                            >
                              Passou
                            </button>
                            <button
                              type="button"
                              class="ovd-btn ovd-btn-pequeno ovd-btn-carmesim"
                              disabled={!alvoDistrair}
                              onClick={() =>
                                aoAgir({
                                  tipo: 'esconderijo.distrair',
                                  alvoParticipanteId: alvoDistrair,
                                  passou: false,
                                })
                              }
                            >
                              Falhou
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Chamar Atenção */}
                      {aliados.length > 0 && p.dados.length >= 2 && (
                        <div class="ovd-esc-bloco">
                          <span class="ovd-esc-bloco-titulo">Chamar Atenção (transfere 1 + descarta 1)</span>
                          <div class="ovd-esc-linha">
                            <select
                              class="ovd-select"
                              aria-label="Aliado destino"
                              value={alvoChamar}
                              onChange={(e) => setAliadoChamarId(e.currentTarget.value)}
                            >
                              {aliados.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nome}
                                </option>
                              ))}
                            </select>
                            <select
                              class="ovd-select"
                              aria-label="Dado a transferir"
                              value={transferirAtual}
                              onChange={(e) => setDadoTransferirId(e.currentTarget.value)}
                            >
                              {p.dados.map((d) => (
                                <option key={d.id} value={d.id}>
                                  Dar d{d.lados} ({d.valor || '?'})
                                </option>
                              ))}
                            </select>
                            <select
                              class="ovd-select"
                              aria-label="Dado a descartar"
                              value={descartarAtual}
                              onChange={(e) => setDadoDescartarId(e.currentTarget.value)}
                            >
                              {p.dados
                                .filter((d) => d.id !== transferirAtual)
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    Desc. d{d.lados} ({d.valor || '?'})
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              class="ovd-btn ovd-btn-pequeno"
                              disabled={!alvoChamar || !transferirAtual || !descartarAtual}
                              onClick={() =>
                                aoAgir({
                                  tipo: 'esconderijo.chamar-atencao',
                                  origemId: p.id,
                                  destinoId: alvoChamar,
                                  dadoTransferirId: transferirAtual,
                                  dadoDescartarId: descartarAtual,
                                })
                              }
                            >
                              Executar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ação Chamativa */}
                      {p.dados.length > 0 && (
                        <div class="ovd-esc-bloco">
                          <span class="ovd-esc-bloco-titulo">Ação Chamativa (descartar 1 dado)</span>
                          <div class="ovd-esc-linha">
                            {p.dados.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                class="ovd-btn ovd-btn-pequeno ovd-btn-carmesim"
                                onClick={() =>
                                  aoAgir({
                                    tipo: 'esconderijo.descartar-dado',
                                    participanteId: p.id,
                                    dadoId: d.id,
                                  })
                                }
                              >
                                × d{d.lados} ({d.valor || '?'})
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. PERSEGUIÇÃO (FÔLEGO + AVANÇO)
   ═══════════════════════════════════════════════════════════════════════════ */

function OverlayPerseguicao({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  retratos,
  aoAgir,
  aoRecolher,
}: {
  desafio: DesafioPerseguicao;
  modo: OverlayDesafioProps['modo'];
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  retratos?: Record<string, string>;
  aoAgir?: (acao: AcaoDesafio) => void;
  aoRecolher: () => void;
}) {
  const mostrarPa = desafio.mostrarPaJogadores || modo === 'mestre';
  const limiarAtual = desafio.limiaresPorRodada[desafio.rodada];

  return (
    <div class="ovd-hud-topo" data-testid="overlay-perseguicao">
      <header class="ovd-hud-barra">
        <IconeCorrendo tamanho={18} />
        <span class="ovd-hud-barra-titulo">
          {desafio.titulo} • Rodada {desafio.rodada} / {desafio.totalRodadas}
        </span>
        {mostrarPa && limiarAtual !== undefined && (
          <span class="ovd-hud-chip" data-tom="ouro">
            Limiar R{desafio.rodada}: {limiarAtual} PA
          </span>
        )}
        {mostrarPa && <span class="ovd-hud-chip">Meta: {desafio.metaPa} PA</span>}
        <button type="button" class="ovd-btn-recolher" onClick={aoRecolher}>
          Recolher
        </button>
      </header>

      <div class="ovd-faixa-cards">
        {desafio.participantes.map((p) => {
          const souEu = ehMeuParticipante(p, meuDiscordId, minhaFichaId);
          const podeGastarFolego =
            modo === 'jogador' && Boolean(aoAgir) && souEu && p.folegoRestante > 0 && p.status === 'correndo';
          const alvoNumero =
            limiarAtual !== undefined && p.pa < limiarAtual ? limiarAtual : desafio.metaPa;
          const pct = Math.min(100, Math.round((p.pa / Math.max(1, desafio.metaPa)) * 100));
          const pctLimiar =
            limiarAtual !== undefined
              ? Math.min(100, Math.round((limiarAtual / Math.max(1, desafio.metaPa)) * 100))
              : null;

          const usarFolego = () => {
            if (!podeGastarFolego || !aoAgir) return;
            tocarEfeitoDesafio('folego-gastar');
            aoAgir({ tipo: 'perseguicao.gastar-folego', participanteId: p.id, quantidade: 1 });
          };

          return (
            <article
              key={p.id}
              class="ovd-pers-card"
              data-meu={souEu ? '1' : '0'}
              data-status={p.status}
            >
              <div class="ovd-esc-topo">
                <RetratoParticipante participante={p} retratos={retratos} tamanho="pequeno" />
                <div class="ovd-esc-info">
                  <span class="ovd-esc-nome">{p.nome}</span>
                </div>
                <span
                  class="ovd-hud-chip"
                  data-tom={
                    p.status === 'seguro'
                      ? 'esmeralda'
                      : p.status === 'derrubado'
                        ? 'carmesim'
                        : undefined
                  }
                >
                  {p.status === 'seguro'
                    ? 'SEGURO'
                    : p.status === 'derrubado'
                      ? 'DERRUBADO'
                      : 'CORRENDO'}
                </span>
              </div>

              <div class="ovd-pers-corpo">
                <PulmaoFolego
                  restante={p.folegoRestante}
                  total={p.folegoTotal}
                  interativo={podeGastarFolego}
                  aoUsar={usarFolego}
                />

                <div class="ovd-avanco-box">
                  {mostrarPa && (
                    <>
                      <div class="ovd-avanco-topo">
                        <IconeCorrendo tamanho={20} />
                        <span class="ovd-avanco-numero">{p.pa}</span>
                        <span class="ovd-avanco-meta">/ {alvoNumero}</span>
                      </div>
                      <div class="ovd-barra-trilha" aria-hidden="true">
                        <div class="ovd-barra-preenchimento" style={{ width: `${pct}%` }} />
                        {pctLimiar !== null && (
                          <span class="ovd-barra-limiar" style={{ left: `${pctLimiar}%` }} />
                        )}
                      </div>
                    </>
                  )}

                  <div class="ovd-pers-badges">
                    {p.esforcoExtraUsos > 0 && (
                      <span class="ovd-hud-chip" data-tom="ouro">
                        Esforço Extra ×{p.esforcoExtraUsos}
                      </span>
                    )}
                    {podeGastarFolego && (
                      <button
                        type="button"
                        class="ovd-btn ovd-btn-pequeno ovd-btn-primario"
                        onClick={usarFolego}
                      >
                        Usar Fôlego
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. ESCALAR (ESCALADA)
   ═══════════════════════════════════════════════════════════════════════════ */

function OverlayEscalada({
  desafio,
  meuDiscordId,
  minhaFichaId,
  retratos,
  aoRecolher,
}: {
  desafio: DesafioEscalada;
  meuDiscordId?: string | null;
  minhaFichaId?: string | null;
  retratos?: Record<string, string>;
  aoRecolher: () => void;
}) {
  return (
    <div class="ovd-escalada-wrap" data-testid="overlay-escalada">
      <section class="ovd-escalada-card" aria-label={desafio.titulo}>
        <header class="ovd-escalada-topo">
          <div>
            <span class="ovd-eyebrow">Escalada</span>
            <h2 class="ovd-titulo" style={{ fontSize: '18px' }}>
              {desafio.titulo}
            </h2>
          </div>
          <button type="button" class="ovd-btn-recolher" onClick={aoRecolher}>
            Recolher
          </button>
        </header>

        <div class="ovd-escalada-lista">
          {desafio.participantes.map((p) => {
            const souEu = ehMeuParticipante(p, meuDiscordId, minhaFichaId);
            const pct = Math.min(100, Math.round((p.pontos / Math.max(1, desafio.metaPontos)) * 100));
            const danoQueda = p.status === 'caiu' ? (p.ultimoDanoQueda ?? p.pontos) : p.pontos;

            return (
              <article
                key={p.id}
                class="ovd-escalada-item"
                data-meu={souEu ? '1' : '0'}
                data-status={p.status}
              >
                <div class="ovd-altimetro" aria-label={`Altura ${p.pontos} de ${desafio.metaPontos}`}>
                  <div class="ovd-altimetro-fill" style={{ height: `${pct}%` }} />
                  <span class="ovd-altimetro-marcador" style={{ bottom: `${Math.min(88, Math.max(12, pct))}%` }}>
                    {p.pontos}
                  </span>
                </div>

                <div class="ovd-escalada-info">
                  <div class="ovd-esc-topo">
                    <RetratoParticipante participante={p} retratos={retratos} tamanho="pequeno" />
                    <div class="ovd-esc-info">
                      <span class="ovd-esc-nome">{p.nome}</span>
                      <span class="ovd-esc-meta">
                        Altura {p.pontos} / {desafio.metaPontos}
                      </span>
                    </div>
                    <span
                      class="ovd-hud-chip"
                      data-tom={
                        p.status === 'topo'
                          ? 'esmeralda'
                          : p.status === 'caiu'
                            ? 'carmesim'
                            : undefined
                      }
                    >
                      {p.status === 'topo' ? 'TOPO' : p.status === 'caiu' ? 'CAIU' : 'ESCALANDO'}
                    </span>
                  </div>

                  <div class="ovd-escalada-alerta">
                    {p.status === 'caiu'
                      ? `Sofreu ${danoQueda} de dano na queda`
                      : `${danoQueda} de dano se cair`}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <footer class="ovd-escalada-lembrete">
          Rápida (DT {desafio.dtRapida} → RA) • Cautelosa (DT {desafio.dtCautelosa} → RB)
        </footer>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EFEITOS SONOROS AUTOMÁTICOS + PÍLULA RECOLHIDA
   ═══════════════════════════════════════════════════════════════════════════ */

function resumoPilula(desafio: DesafioAtivo): { icone: string; titulo: string; detalhe: string } {
  switch (desafio.tipo) {
    case 'lockpick':
      return {
        icone: '🔒',
        titulo: desafio.titulo,
        detalhe: `${desafio.tentativas.length}/${desafio.maxTentativas}`,
      };
    case 'equilibrio': {
      const { esq, dir } = totaisEquilibrio(desafio);
      return {
        icone: '⚖',
        titulo: desafio.titulo,
        detalhe: `${esq} × ${dir}`,
      };
    }
    case 'esconderijo':
      return {
        icone: '👁',
        titulo: desafio.titulo,
        detalhe: `R${desafio.rodada}`,
      };
    case 'perseguicao':
      return {
        icone: '🏃',
        titulo: desafio.titulo,
        detalhe: `R${desafio.rodada}/${desafio.totalRodadas}`,
      };
    case 'escalada':
      return {
        icone: '⛰',
        titulo: desafio.titulo,
        detalhe: `Meta ${desafio.metaPontos}`,
      };
  }
}

function useSonsDeDesafio(desafio: DesafioAtivo | null): void {
  const anteriorRef = useRef<DesafioAtivo | null>(null);

  useEffect(() => {
    const prev = anteriorRef.current;
    anteriorRef.current = desafio;
    if (!desafio || !prev || prev.id !== desafio.id || prev.tipo !== desafio.tipo) {
      return;
    }

    switch (desafio.tipo) {
      case 'lockpick': {
        const p = prev as DesafioLockpick;
        if (p.status !== 'aberto' && desafio.status === 'aberto') {
          tocarEfeitoDesafio('lockpick-aberto');
        } else if (p.status !== 'travado' && desafio.status === 'travado') {
          tocarEfeitoDesafio('lockpick-travado');
        } else if (desafio.tentativas.length > p.tentativas.length) {
          tocarEfeitoDesafio('pino-tentar');
        }
        return;
      }

      case 'equilibrio': {
        const p = prev as DesafioEquilibrio;
        if (p.status !== 'caiu' && desafio.status === 'caiu') {
          tocarEfeitoDesafio('balanca-queda');
        } else if (p.status !== 'equilibrado' && desafio.status === 'equilibrado') {
          tocarEfeitoDesafio('balanca-estavel');
        } else if (
          desafio.dadoEsq !== p.dadoEsq ||
          desafio.dadoDir !== p.dadoDir ||
          desafio.dadosUsados.length !== p.dadosUsados.length ||
          desafio.d4Pendente !== p.d4Pendente
        ) {
          tocarEfeitoDesafio('balanca-inclinar');
        }
        return;
      }

      case 'esconderijo': {
        const p = prev as DesafioEsconderijo;
        if (desafio.ultimaBusca && desafio.ultimaBusca.id !== p.ultimaBusca?.id) {
          const alguemEncontrado = desafio.ultimaBusca.atingidos.some((a) => a.ficouEncontrado);
          tocarEfeitoDesafio(alguemEncontrado ? 'esconderijo-descoberto' : 'esconderijo-busca');
          return;
        }
        const novoEncontrado = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return cur.encontrado && (!ant || !ant.encontrado);
        });
        if (novoEncontrado) {
          tocarEfeitoDesafio('esconderijo-descoberto');
          return;
        }
        const totalAntes = p.participantes.reduce((s, x) => s + x.dados.length, 0);
        const totalAgora = desafio.participantes.reduce((s, x) => s + x.dados.length, 0);
        if (totalAgora !== totalAntes) {
          tocarEfeitoDesafio('esconderijo-dado');
        }
        return;
      }

      case 'perseguicao': {
        const p = prev as DesafioPerseguicao;
        const derrubou = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return cur.status === 'derrubado' && ant?.status !== 'derrubado';
        });
        if (derrubou) {
          tocarEfeitoDesafio('perseguicao-derrubado');
          return;
        }
        const gastouFolego = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return ant !== undefined && cur.folegoRestante < ant.folegoRestante;
        });
        if (gastouFolego) {
          tocarEfeitoDesafio('folego-gastar');
          return;
        }
        const avancou = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return ant !== undefined && cur.pa > ant.pa;
        });
        if (avancou) {
          tocarEfeitoDesafio('perseguicao-avanco');
        }
        return;
      }

      case 'escalada': {
        const p = prev as DesafioEscalada;
        const caiu = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return cur.status === 'caiu' && ant?.status !== 'caiu';
        });
        if (caiu) {
          tocarEfeitoDesafio('escalada-queda');
          return;
        }
        const subiu = desafio.participantes.some((cur) => {
          const ant = p.participantes.find((x) => x.id === cur.id);
          return ant !== undefined && cur.pontos > ant.pontos;
        });
        if (subiu) {
          tocarEfeitoDesafio('escalada-subir');
        }
        return;
      }
    }
  }, [desafio]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

export function OverlayDesafio({
  desafio,
  modo,
  meuDiscordId,
  minhaFichaId,
  meuNome,
  retratos,
  aoAgir,
}: OverlayDesafioProps) {
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    setRecolhido(false);
  }, [desafio?.id]);

  useSonsDeDesafio(desafio);

  if (!desafio) return null;

  if (recolhido) {
    const { icone, titulo, detalhe } = resumoPilula(desafio);
    return (
      <div class="ovd-raiz" data-modo={modo} data-recolhido="1">
        <div class="ovd-pilula-wrap">
          <button
            type="button"
            class="ovd-pilula"
            data-testid="overlay-desafio-pilula"
            onClick={() => setRecolhido(false)}
          >
            <span class="ovd-pilula-icone" aria-hidden="true">
              {icone}
            </span>
            <span>{titulo}</span>
            <span class="ovd-pilula-detalhe">({detalhe})</span>
          </button>
        </div>
      </div>
    );
  }

  const recolher = () => setRecolhido(true);

  return (
    <div class="ovd-raiz" data-modo={modo} data-tipo={desafio.tipo}>
      {desafio.tipo === 'lockpick' && (
        <OverlayLockpick
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          meuNome={meuNome}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'equilibrio' && (
        <OverlayEquilibrio
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'esconderijo' && (
        <OverlayEsconderijo
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'perseguicao' && (
        <OverlayPerseguicao
          desafio={desafio}
          modo={modo}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          retratos={retratos}
          aoAgir={aoAgir}
          aoRecolher={recolher}
        />
      )}
      {desafio.tipo === 'escalada' && (
        <OverlayEscalada
          desafio={desafio}
          meuDiscordId={meuDiscordId}
          minhaFichaId={minhaFichaId}
          retratos={retratos}
          aoRecolher={recolher}
        />
      )}
    </div>
  );
}
