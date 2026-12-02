import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  criarEquilibrio,
  criarEscalada,
  criarEsconderijo,
  criarLockpick,
  criarPerseguicao,
  LADOS_VALIDOS,
  totaisEquilibrio,
  type DesafioAtivo,
  type DesafioEquilibrio,
  type DesafioEscalada,
  type DesafioEsconderijo,
  type DesafioLockpick,
  type DesafioPerseguicao,
  type LadosDado,
  type ModoDicaLockpick,
  type ModoExibicaoHud,
  type ParticipanteDesafio,
} from '../dominio/desafios.ts';
import { extrairSugestoesDaFicha, type SugestoesDaFicha } from '../dominio/desafios-ficha.ts';
import { semAcento } from '../dominio/entidades.ts';
import {
  definirDesafioAtivo,
  desafioAtivo,
  despacharAcaoDesafio,
  encerrarDesafioAtivo,
} from '../app/desafios.ts';
import { estadoBrutoDoAtlas, iniciarCombateCanal } from '../app/combate.ts';
import { conexaoOnline, estadoDaPonte } from '../app/online.ts';
import { mapaAtual } from '../app/sessao.ts';
import { abrirJanelaNoSegundoMonitor } from '../app/desktop.ts';
import { cx } from './cx.ts';
import './desafios.css';

type AbaDesafio = DesafioAtivo['tipo'];

const normalizarNome = (nome: string): string => semAcento(nome.trim().toLowerCase());

interface PersonagemDisponivel {
  id: string;
  nome: string;
  fichaId?: string;
  donoDiscordId?: string;
  retrato?: string;
  origem: 'mapa' | 'online' | 'manual';
  sugestoes: SugestoesDaFicha;
}

interface PresetLockpick {
  id: string;
  nome: string;
  resumo: string;
  titulo: string;
  dados: LadosDado[];
  dependencias?: Array<number | null>;
  modoDica: ModoDicaLockpick;
  maxTentativas: number;
}

const PRESETS_LOCKPICK: readonly PresetLockpick[] = [
  {
    id: 'simples',
    nome: 'Simples',
    resumo: '3d6 • 5 tent.',
    titulo: 'Fechadura Simples',
    dados: [6, 6, 6],
    modoDica: 'posicional',
    maxTentativas: 5,
  },
  {
    id: 'media',
    nome: 'Média',
    resumo: '3d8 • 5 tent.',
    titulo: 'Fechadura Média',
    dados: [8, 8, 8],
    modoDica: 'posicional',
    maxTentativas: 5,
  },
  {
    id: 'complexa',
    nome: 'Complexa',
    resumo: '4d10 • 6 tent.',
    titulo: 'Fechadura Complexa',
    dados: [10, 10, 10, 10],
    modoDica: 'posicional',
    maxTentativas: 6,
  },
  {
    id: 'reliquia',
    nome: 'Relíquia Mista',
    resumo: 'd12+d20+d12+d6',
    titulo: 'Fechadura Relíquia',
    dados: [12, 20, 12, 6],
    modoDica: 'posicional',
    maxTentativas: 6,
  },
  {
    id: 'harpa',
    nome: 'Harpa',
    resumo: '3d4 embaralhado',
    titulo: 'Harpa',
    dados: [4, 4, 4],
    modoDica: 'embaralhado',
    maxTentativas: 6,
  },
  {
    id: 'trancada',
    nome: 'Cadeia Trancada',
    resumo: '3d6 • 2→1, 3→2',
    titulo: 'Fechadura Encadeada',
    dados: [6, 6, 6],
    dependencias: [null, 0, 1],
    modoDica: 'posicional',
    maxTentativas: 7,
  },
];

const ABAS: ReadonlyArray<{ id: AbaDesafio; icone: string; rotulo: string }> = [
  { id: 'lockpick', icone: '🔒', rotulo: 'Fechadura' },
  { id: 'equilibrio', icone: '⚖️', rotulo: 'Equilíbrio' },
  { id: 'esconderijo', icone: '👁️', rotulo: 'Furtividade' },
  { id: 'perseguicao', icone: '🏃', rotulo: 'Perseguição' },
  { id: 'escalada', icone: '🧗', rotulo: 'Escalar' },
];

const ROTULO_TIPO: Record<AbaDesafio, string> = {
  lockpick: 'Fechadura',
  equilibrio: 'Equilíbrio',
  esconderijo: 'Furtividade',
  perseguicao: 'Perseguição',
  escalada: 'Escalada',
};

const ATALHOS_BUSCA: ReadonlyArray<{ rotulo: string; dados: LadosDado[] }> = [
  { rotulo: '1d4', dados: [4] },
  { rotulo: '1d6', dados: [6] },
  { rotulo: '2d6', dados: [6, 6] },
  { rotulo: '1d8', dados: [8] },
  { rotulo: '2d8', dados: [8, 8] },
  { rotulo: '1d10', dados: [10] },
];

function paraParticipante(p: PersonagemDisponivel): ParticipanteDesafio {
  const base: ParticipanteDesafio = { id: p.id, nome: p.nome };
  if (p.fichaId !== undefined) base.fichaId = p.fichaId;
  if (p.donoDiscordId !== undefined) base.donoDiscordId = p.donoDiscordId;
  if (p.retrato !== undefined) base.retrato = p.retrato;
  return base;
}

function urlDoTelaoLocal(mapaId: string | null): string {
  const base =
    typeof location !== 'undefined'
      ? `${location.origin}${location.pathname}`
      : './';
  const hash = mapaId ? `#/telao?mapa=${encodeURIComponent(mapaId)}` : '#/telao';
  return `${base}${hash}`;
}

function Stepper({
  valor,
  min = 0,
  max = 99,
  aoMudar,
  rotulo,
}: {
  valor: number;
  min?: number;
  max?: number;
  aoMudar: (novo: number) => void;
  rotulo: string;
}) {
  return (
    <div class="desafios-stepper" role="group" aria-label={rotulo}>
      <button
        type="button"
        disabled={valor <= min}
        aria-label={`Diminuir ${rotulo}`}
        onClick={() => aoMudar(Math.max(min, valor - 1))}
      >
        −
      </button>
      <span>{valor}</span>
      <button
        type="button"
        disabled={valor >= max}
        aria-label={`Aumentar ${rotulo}`}
        onClick={() => aoMudar(Math.min(max, valor + 1))}
      >
        +
      </button>
    </div>
  );
}

function AdicionarParticipanteManual({
  aoAdicionar,
}: {
  aoAdicionar: (nome: string) => void;
}) {
  const [nome, setNome] = useState('');
  const enviar = (ev: Event) => {
    ev.preventDefault();
    const limpo = nome.trim();
    if (!limpo) return;
    aoAdicionar(limpo);
    setNome('');
  };
  return (
    <form class="desafios-add-manual" onSubmit={enviar}>
      <input
        type="text"
        placeholder="Adicionar personagem ou NPC manualmente…"
        value={nome}
        maxLength={80}
        onInput={(ev) => setNome(ev.currentTarget.value)}
      />
      <button type="submit" class="botao-pilula" disabled={!nome.trim()}>
        + Adicionar
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Configuração (quando NÃO há desafio ativo)                                */
/* -------------------------------------------------------------------------- */

function ConfigLockpick({
  pool,
  rotuloPool,
}: {
  pool: PersonagemDisponivel[];
  rotuloPool: string;
}) {
  const [presetId, setPresetId] = useState<string>('simples');
  const [titulo, setTitulo] = useState('Fechadura Simples');
  const [dados, setDados] = useState<LadosDado[]>([6, 6, 6]);
  const [dependencias, setDependencias] = useState<Array<number | null>>([null, null, null]);
  const [modoDica, setModoDica] = useState<ModoDicaLockpick>('posicional');
  const [maxTentativas, setMaxTentativas] = useState(5);
  const [autorizadoId, setAutorizadoId] = useState<string>('');
  const [tentativasPorRodada, setTentativasPorRodada] = useState<number>(2);
  const [senhaManualAtiva, setSenhaManualAtiva] = useState(false);
  const [senhaManual, setSenhaManual] = useState<number[]>([1, 1, 1]);

  const aplicarPreset = (p: PresetLockpick) => {
    setPresetId(p.id);
    setTitulo(p.titulo);
    setDados([...p.dados]);
    setDependencias(p.dados.map((_, i) => p.dependencias?.[i] ?? null));
    setModoDica(p.modoDica);
    setMaxTentativas(p.maxTentativas);
    setSenhaManual(p.dados.map(() => 1));
  };

  const adicionarDado = (lados: LadosDado) => {
    setPresetId('');
    setDados((prev) => [...prev, lados]);
    setDependencias((prev) => [...prev, null]);
    setSenhaManual((prev) => [...prev, 1]);
  };

  const removerDado = (idx: number) => {
    if (dados.length <= 1) return;
    setPresetId('');
    setDados((prev) => prev.filter((_, i) => i !== idx));
    setDependencias((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((dep) => {
          if (dep === null || dep === idx) return null;
          return dep > idx ? dep - 1 : dep;
        }),
    );
    setSenhaManual((prev) => prev.filter((_, i) => i !== idx));
  };

  const aoEscolherAutorizado = (id: string) => {
    setAutorizadoId(id);
    const achado = pool.find((p) => p.id === id);
    if (achado) {
      setTentativasPorRodada(achado.sugestoes.tentativasCrime);
    }
  };

  const selecionado = pool.find((p) => p.id === autorizadoId) ?? null;

  const iniciar = () => {
    const opts: Parameters<typeof criarLockpick>[0] = {
      titulo: titulo.trim() || 'Fechadura',
      dados,
      modoDica,
      maxTentativas,
      jogadorAutorizadoId: selecionado ? (selecionado.donoDiscordId ?? selecionado.id) : null,
    };
    if (dependencias.some((d) => d !== null)) {
      opts.dependencias = [...dependencias];
    }
    if (selecionado) {
      opts.jogadorAutorizadoNome = selecionado.nome;
      opts.tentativasPorRodada = tentativasPorRodada;
    }
    if (senhaManualAtiva) {
      opts.senha = dados.map((lados, i) => {
        const v = senhaManual[i] ?? 1;
        return Math.min(lados, Math.max(1, v));
      });
    }
    definirDesafioAtivo(criarLockpick(opts));
  };

  return (
    <div class="desafios-bloco">
      <h4 class="desafios-subtitulo">Presets rápidos</h4>
      <div class="desafios-presets">
        {PRESETS_LOCKPICK.map((p) => (
          <button
            key={p.id}
            type="button"
            class={cx('desafios-preset', presetId === p.id && 'ativo')}
            onClick={() => aplicarPreset(p)}
          >
            <strong>{p.nome}</strong>
            <span>{p.resumo}</span>
          </button>
        ))}
      </div>

      <div class="desafios-grade-campos">
        <label class="desafios-campo">
          Título
          <input
            type="text"
            value={titulo}
            maxLength={80}
            onInput={(ev) => setTitulo(ev.currentTarget.value)}
          />
        </label>
        <label class="desafios-campo">
          Modo de dica
          <select
            value={modoDica}
            onChange={(ev) => setModoDica(ev.currentTarget.value as ModoDicaLockpick)}
          >
            <option value="posicional">Posicional (baixo / exato / alto)</option>
            <option value="embaralhado">Embaralhado (algum correto / alto / baixo)</option>
          </select>
        </label>
      </div>

      <div class="desafios-campo">
        <span>Pinos / Dados ({dados.length})</span>
        <div class="desafios-dados-lista">
          {dados.map((lados, idx) => (
            <span key={`${idx}-${lados}`} class="desafios-dado-chip">
              d{lados}
              {dados.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remover dado ${idx + 1}`}
                  onClick={() => removerDado(idx)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        <div class="desafios-dados-lista" style={{ marginTop: '4px' }}>
          {LADOS_VALIDOS.map((lados) => (
            <button
              key={lados}
              type="button"
              class="desafios-dado-add"
              onClick={() => adicionarDado(lados)}
            >
              +d{lados}
            </button>
          ))}
        </div>
      </div>

      {dados.length > 1 && (
        <div class="desafios-campo">
          <span>Modo trancado — pino só revela dica se outro estiver correto</span>
          <div class="desafios-grade-campos">
            {dados.map((lados, idx) => (
              <label key={idx} class="desafios-campo">
                Pino {idx + 1} (d{lados})
                <select
                  value={dependencias[idx] === null || dependencias[idx] === undefined ? '' : String(dependencias[idx])}
                  onChange={(ev) => {
                    const bruto = ev.currentTarget.value;
                    setPresetId('');
                    setDependencias((prev) => {
                      const prox = dados.map((_, i) => prev[i] ?? null);
                      prox[idx] = bruto === '' ? null : Number(bruto);
                      return prox;
                    });
                  }}
                >
                  <option value="">Livre</option>
                  {dados.map((_, outroIdx) =>
                    outroIdx === idx ? null : (
                      <option key={outroIdx} value={String(outroIdx)}>
                        🔒 Trancado até Pino {outroIdx + 1}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div class="desafios-grade-campos">
        <div class="desafios-campo">
          <span>Limite de tentativas</span>
          <Stepper valor={maxTentativas} min={1} max={20} aoMudar={setMaxTentativas} rotulo="Limite de tentativas" />
        </div>
        <label class="desafios-campo">
          <span>
            Quem pode destrancar <span class="meta">({rotuloPool})</span>
          </span>
          <select
            value={autorizadoId}
            onChange={(ev) => aoEscolherAutorizado(ev.currentTarget.value)}
          >
            <option value="">Qualquer jogador</option>
            {pool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} (Crime d{p.sugestoes.crimeDado} → {p.sugestoes.tentativasCrime}/rod.)
              </option>
            ))}
          </select>
        </label>
        {selecionado && (
          <div class="desafios-campo">
            <span>Tentativas / rodada</span>
            <Stepper
              valor={tentativasPorRodada}
              min={1}
              max={10}
              aoMudar={setTentativasPorRodada}
              rotulo="Tentativas por rodada"
            />
          </div>
        )}
      </div>

      <div class="desafios-linha">
        <label class="desafios-toggle">
          <input
            type="checkbox"
            checked={senhaManualAtiva}
            onChange={(ev) => setSenhaManualAtiva(ev.currentTarget.checked)}
          />
          Definir senha manualmente (padrão: aleatória)
        </label>
      </div>

      {senhaManualAtiva && (
        <div class="desafios-dados-lista">
          {dados.map((lados, idx) => (
            <label key={idx} class="desafios-campo" style={{ width: '74px' }}>
              Pino {idx + 1} (d{lados})
              <input
                type="number"
                min={1}
                max={lados}
                value={senhaManual[idx] ?? 1}
                onInput={(ev) => {
                  const n = Number(ev.currentTarget.value) || 1;
                  setSenhaManual((prev) => {
                    const prox = [...prev];
                    prox[idx] = Math.min(lados, Math.max(1, n));
                    return prox;
                  });
                }}
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        class="botao-pilula destaque desafios-acao-principal"
        data-testid="desafios-iniciar-lockpick"
        onClick={iniciar}
      >
        🔒 Abrir fechadura na tela
      </button>
    </div>
  );
}

function ConfigEquilibrio({
  pool,
  rotuloPool,
  aoAdicionarManual,
}: {
  pool: PersonagemDisponivel[];
  rotuloPool: string;
  aoAdicionarManual: (nome: string) => void;
}) {
  const [selecionadoId, setSelecionadoId] = useState<string>(pool[0]?.id ?? '');
  const [titulo, setTitulo] = useState('Equilíbrio');
  const [dadosEquilibrio, setDadosEquilibrio] = useState<number>(
    pool[0]?.sugestoes.dadosEquilibrio ?? 2,
  );
  const [exibicao, setExibicao] = useState<ModoExibicaoHud>('compacto');

  useEffect(() => {
    if (selecionadoId && pool.some((p) => p.id === selecionadoId)) return;
    const primeiro = pool[0];
    if (!primeiro) {
      if (selecionadoId !== '') setSelecionadoId('');
      return;
    }
    setSelecionadoId(primeiro.id);
    setDadosEquilibrio(primeiro.sugestoes.dadosEquilibrio);
  }, [pool, selecionadoId]);

  const escolhido = pool.find((p) => p.id === selecionadoId) ?? pool[0] ?? null;

  const trocarPersonagem = (id: string) => {
    setSelecionadoId(id);
    const achado = pool.find((p) => p.id === id);
    if (achado) {
      setDadosEquilibrio(achado.sugestoes.dadosEquilibrio);
    }
  };

  const iniciar = () => {
    const personagem: ParticipanteDesafio = escolhido
      ? paraParticipante(escolhido)
      : { id: `manual-${Date.now()}`, nome: 'Personagem' };
    definirDesafioAtivo(
      criarEquilibrio({
        titulo: titulo.trim() || 'Equilíbrio',
        personagem,
        dadosEquilibrioTotal: dadosEquilibrio,
        exibicao,
      }),
    );
  };

  return (
    <div class="desafios-bloco">
      <div class="desafios-grade-campos">
        <label class="desafios-campo">
          Título
          <input
            type="text"
            value={titulo}
            maxLength={80}
            onInput={(ev) => setTitulo(ev.currentTarget.value)}
          />
        </label>
        <label class="desafios-campo">
          Exibição na tela
          <select
            value={exibicao}
            onChange={(ev) => setExibicao(ev.currentTarget.value as ModoExibicaoHud)}
          >
            <option value="destaque">Destaque central</option>
            <option value="compacto">HUD compacto no canto</option>
          </select>
        </label>
      </div>

      <label class="desafios-campo">
        <span>
          Personagem em equilíbrio <span class="meta">({rotuloPool})</span>
        </span>
        <select
          value={escolhido?.id ?? ''}
          onChange={(ev) => trocarPersonagem(ev.currentTarget.value)}
          disabled={pool.length === 0}
        >
          {pool.length === 0 ? (
            <option value="">Nenhum personagem na lista (adicione abaixo)</option>
          ) : (
            pool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} (Acrobacia d{p.sugestoes.acrobaciaDado} → {p.sugestoes.dadosEquilibrio}d4)
              </option>
            ))
          )}
        </select>
      </label>

      <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
        <div class="desafios-campo">
          <span>Dados de Equilíbrio (d4 — metade de Acrobacia)</span>
          {escolhido && (
            <span class="meta">
              Sugerido pela ficha: Acrobacia d{escolhido.sugestoes.acrobaciaDado} → {escolhido.sugestoes.dadosEquilibrio}× d4
            </span>
          )}
        </div>
        <Stepper
          valor={dadosEquilibrio}
          min={1}
          max={12}
          aoMudar={setDadosEquilibrio}
          rotulo="Dados de equilíbrio"
        />
      </div>

      <AdicionarParticipanteManual aoAdicionar={aoAdicionarManual} />

      <button
        type="button"
        class="botao-pilula destaque desafios-acao-principal"
        data-testid="desafios-iniciar-equilibrio"
        onClick={iniciar}
      >
        ⚖️ Iniciar Equilíbrio
      </button>
    </div>
  );
}

function ConfigEsconderijo({
  pool,
  rotuloPool,
  aoAdicionarManual,
  aoRemoverManual,
}: {
  pool: PersonagemDisponivel[];
  rotuloPool: string;
  aoAdicionarManual: (nome: string) => void;
  aoRemoverManual: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState('Furtividade');
  const [ocultarDoMestre, setOcultarDoMestre] = useState(true);
  const [desmarcados, setDesmarcados] = useState<Record<string, boolean>>({});

  const selecionados = pool.filter((p) => !desmarcados[p.id]);

  const alternar = (id: string) => {
    setDesmarcados((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const iniciar = () => {
    const lista = selecionados.map(paraParticipante);
    definirDesafioAtivo(
      criarEsconderijo({
        titulo: titulo.trim() || 'Furtividade',
        participantes: lista,
        ocultarDoMestre,
      }),
    );
  };

  return (
    <div class="desafios-bloco">
      <label class="desafios-campo">
        Título
        <input
          type="text"
          value={titulo}
          maxLength={80}
          onInput={(ev) => setTitulo(ev.currentTarget.value)}
        />
      </label>

      <label class="desafios-toggle">
        <input
          type="checkbox"
          checked={ocultarDoMestre}
          onChange={(ev) => setOcultarDoMestre(ev.currentTarget.checked)}
        />
        Ocultar números do mestre (evita metagaming)
      </label>

      <h4 class="desafios-subtitulo">
        <span>Participantes ({selecionados.length})</span>
        <span class="meta">{rotuloPool}</span>
      </h4>

      <div class="desafios-participantes">
        {pool.length === 0 ? (
          <p class="meta" style={{ margin: 0 }}>
            Nenhum personagem encontrado. Adicione abaixo para começar.
          </p>
        ) : (
          pool.map((p) => {
            const marcado = !desmarcados[p.id];
            return (
              <div key={p.id} class={cx('desafios-participante-item', marcado && 'selecionado')}>
                <input
                  type="checkbox"
                  checked={marcado}
                  aria-label={`Incluir ${p.nome}`}
                  onChange={() => alternar(p.id)}
                />
                <span class="desafios-participante-nome">{p.nome}</span>
                <span class="desafios-participante-meta">
                  Furtividade d{p.sugestoes.furtividadeDado}
                </span>
                {p.origem === 'manual' && (
                  <button
                    type="button"
                    class="desafios-fechar"
                    style={{ width: '24px', height: '24px', fontSize: '12px' }}
                    aria-label={`Remover ${p.nome}`}
                    onClick={() => aoRemoverManual(p.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <AdicionarParticipanteManual aoAdicionar={aoAdicionarManual} />

      <button
        type="button"
        class="botao-pilula destaque desafios-acao-principal"
        data-testid="desafios-iniciar-esconderijo"
        disabled={selecionados.length === 0}
        onClick={iniciar}
      >
        👁️ Iniciar Furtividade
      </button>
    </div>
  );
}

function ConfigPerseguicao({
  pool,
  rotuloPool,
  aoAdicionarManual,
  aoRemoverManual,
}: {
  pool: PersonagemDisponivel[];
  rotuloPool: string;
  aoAdicionarManual: (nome: string) => void;
  aoRemoverManual: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState('Perseguição');
  const [totalRodadas, setTotalRodadas] = useState(4);
  const [metaPa, setMetaPa] = useState(25);
  const [mostrarPaJogadores, setMostrarPaJogadores] = useState(true);
  const [limiares, setLimiares] = useState<Record<number, number>>({
    2: 5,
    3: 15,
    4: 25,
  });
  const [desmarcados, setDesmarcados] = useState<Record<string, boolean>>({});
  const [folegoOverride, setFolegoOverride] = useState<Record<string, number>>({});

  const selecionados = pool.filter((p) => !desmarcados[p.id]);

  const folegoDe = (p: PersonagemDisponivel): number =>
    folegoOverride[p.id] ?? p.sugestoes.dadosFolego;

  const alterarLimiar = (rodada: number, bruto: string) => {
    setLimiares((prev) => {
      const copia = { ...prev };
      const limpo = bruto.trim();
      if (limpo === '') {
        delete copia[rodada];
      } else {
        const n = Math.max(0, Math.floor(Number(limpo) || 0));
        if (n === 0) delete copia[rodada];
        else copia[rodada] = n;
      }
      return copia;
    });
  };

  const iniciar = () => {
    const limiaresFiltrados: Record<number, number> = {};
    for (let r = 1; r <= totalRodadas; r++) {
      const v = limiares[r];
      if (v !== undefined && v > 0) limiaresFiltrados[r] = v;
    }
    definirDesafioAtivo(
      criarPerseguicao({
        titulo: titulo.trim() || 'Perseguição',
        participantes: selecionados.map((p) => ({
          ...paraParticipante(p),
          folegoTotal: folegoDe(p),
        })),
        totalRodadas,
        metaPa,
        limiaresPorRodada: limiaresFiltrados,
        mostrarPaJogadores,
      }),
    );
  };

  return (
    <div class="desafios-bloco">
      <div class="desafios-grade-campos">
        <label class="desafios-campo">
          Título
          <input
            type="text"
            value={titulo}
            maxLength={80}
            onInput={(ev) => setTitulo(ev.currentTarget.value)}
          />
        </label>
        <div class="desafios-campo">
          <span>Rodadas</span>
          <Stepper valor={totalRodadas} min={1} max={10} aoMudar={setTotalRodadas} rotulo="Rodadas" />
        </div>
        <label class="desafios-campo">
          Meta PA
          <input
            type="number"
            min={1}
            max={200}
            value={metaPa}
            onInput={(ev) => setMetaPa(Math.max(1, Number(ev.currentTarget.value) || 1))}
          />
        </label>
      </div>

      <div class="desafios-campo">
        <span>Limiares de PA por rodada (vazio = sem limiar)</span>
        <div class="desafios-limiares-grade">
          {Array.from({ length: totalRodadas }, (_, i) => i + 1).map((r) => (
            <label key={r} class="desafios-campo">
              Rodada {r}
              <input
                type="number"
                min={0}
                max={200}
                placeholder="—"
                value={limiares[r] ?? ''}
                onInput={(ev) => alterarLimiar(r, ev.currentTarget.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <label class="desafios-toggle">
        <input
          type="checkbox"
          checked={mostrarPaJogadores}
          onChange={(ev) => setMostrarPaJogadores(ev.currentTarget.checked)}
        />
        Mostrar contador de PA aos jogadores
      </label>

      <h4 class="desafios-subtitulo">
        <span>Participantes ({selecionados.length}) — Fôlego (d6)</span>
        <span class="meta">{rotuloPool}</span>
      </h4>

      <div class="desafios-participantes">
        {pool.length === 0 ? (
          <p class="meta" style={{ margin: 0 }}>
            Nenhum personagem encontrado. Adicione abaixo para começar.
          </p>
        ) : (
          pool.map((p) => {
            const marcado = !desmarcados[p.id];
            return (
              <div key={p.id} class={cx('desafios-participante-item', marcado && 'selecionado')}>
                <input
                  type="checkbox"
                  checked={marcado}
                  aria-label={`Incluir ${p.nome}`}
                  onChange={() => setDesmarcados((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                />
                <span class="desafios-participante-nome">{p.nome}</span>
                <span class="desafios-participante-meta">Vig d{p.sugestoes.vigorDado}</span>
                <Stepper
                  valor={folegoDe(p)}
                  min={0}
                  max={12}
                  aoMudar={(n) => setFolegoOverride((prev) => ({ ...prev, [p.id]: n }))}
                  rotulo={`Fôlego de ${p.nome}`}
                />
                {p.origem === 'manual' && (
                  <button
                    type="button"
                    class="desafios-fechar"
                    style={{ width: '24px', height: '24px', fontSize: '12px' }}
                    aria-label={`Remover ${p.nome}`}
                    onClick={() => aoRemoverManual(p.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <AdicionarParticipanteManual aoAdicionar={aoAdicionarManual} />

      <button
        type="button"
        class="botao-pilula destaque desafios-acao-principal"
        data-testid="desafios-iniciar-perseguicao"
        disabled={selecionados.length === 0}
        onClick={iniciar}
      >
        🏃 Iniciar Perseguição
      </button>
    </div>
  );
}

function ConfigEscalada({
  pool,
  rotuloPool,
  aoAdicionarManual,
  aoRemoverManual,
}: {
  pool: PersonagemDisponivel[];
  rotuloPool: string;
  aoAdicionarManual: (nome: string) => void;
  aoRemoverManual: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState('Escalada');
  const [metaPontos, setMetaPontos] = useState(10);
  const [dtRapida, setDtRapida] = useState(8);
  const [dtCautelosa, setDtCautelosa] = useState(6);
  const [desmarcados, setDesmarcados] = useState<Record<string, boolean>>({});

  const selecionados = pool.filter((p) => !desmarcados[p.id]);

  const iniciar = () => {
    definirDesafioAtivo(
      criarEscalada({
        titulo: titulo.trim() || 'Escalada',
        participantes: selecionados.map(paraParticipante),
        metaPontos,
        dtRapida,
        dtCautelosa,
      }),
    );
  };

  return (
    <div class="desafios-bloco">
      <div class="desafios-grade-campos">
        <label class="desafios-campo">
          Título
          <input
            type="text"
            value={titulo}
            maxLength={80}
            onInput={(ev) => setTitulo(ev.currentTarget.value)}
          />
        </label>
        <div class="desafios-campo">
          <span>Meta de pontos</span>
          <Stepper valor={metaPontos} min={1} max={50} aoMudar={setMetaPontos} rotulo="Meta de pontos" />
        </div>
        <div class="desafios-campo">
          <span>DT Rápida</span>
          <Stepper valor={dtRapida} min={1} max={30} aoMudar={setDtRapida} rotulo="DT Rápida" />
        </div>
        <div class="desafios-campo">
          <span>DT Cautelosa</span>
          <Stepper valor={dtCautelosa} min={1} max={30} aoMudar={setDtCautelosa} rotulo="DT Cautelosa" />
        </div>
      </div>

      <h4 class="desafios-subtitulo">
        <span>Escaladores ({selecionados.length})</span>
        <span class="meta">{rotuloPool}</span>
      </h4>

      <div class="desafios-participantes">
        {pool.length === 0 ? (
          <p class="meta" style={{ margin: 0 }}>
            Nenhum personagem encontrado. Adicione abaixo para começar.
          </p>
        ) : (
          pool.map((p) => {
            const marcado = !desmarcados[p.id];
            return (
              <div key={p.id} class={cx('desafios-participante-item', marcado && 'selecionado')}>
                <input
                  type="checkbox"
                  checked={marcado}
                  aria-label={`Incluir ${p.nome}`}
                  onChange={() => setDesmarcados((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                />
                <span class="desafios-participante-nome">{p.nome}</span>
                <span class="desafios-participante-meta">
                  Atletismo d{p.sugestoes.atletismoDado}
                </span>
                {p.origem === 'manual' && (
                  <button
                    type="button"
                    class="desafios-fechar"
                    style={{ width: '24px', height: '24px', fontSize: '12px' }}
                    aria-label={`Remover ${p.nome}`}
                    onClick={() => aoRemoverManual(p.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <AdicionarParticipanteManual aoAdicionar={aoAdicionarManual} />

      <button
        type="button"
        class="botao-pilula destaque desafios-acao-principal"
        data-testid="desafios-iniciar-escalada"
        disabled={selecionados.length === 0}
        onClick={iniciar}
      >
        🧗 Iniciar Escalada
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Controles ao vivo (quando HÁ um desafio ativo)                            */
/* -------------------------------------------------------------------------- */

function VivoLockpick({ desafio }: { desafio: DesafioLockpick }) {
  const [mostrarSenha, setMostrarSenha] = useState(true);
  const [palpites, setPalpites] = useState<number[]>(() => desafio.dados.map(() => 1));
  const [autorManual, setAutorManual] = useState(desafio.jogadorAutorizadoNome ?? 'Mesa');

  useEffect(() => {
    setPalpites(desafio.dados.map(() => 1));
  }, [desafio.id, desafio.dados.length]);

  const enviarTentativaManual = (ev: Event) => {
    ev.preventDefault();
    if (desafio.status !== 'ativo') return;
    const valores = desafio.dados.map((lados, idx) => {
      const v = palpites[idx] ?? 1;
      return Math.min(lados, Math.max(1, v));
    });
    despacharAcaoDesafio({
      tipo: 'lockpick.tentar',
      valores,
      autorNome: autorManual.trim() || 'Mesa',
    });
  };

  const reiniciar = () => {
    const opts: Parameters<typeof criarLockpick>[0] = {
      titulo: desafio.titulo,
      dados: [...desafio.dados],
      modoDica: desafio.modoDica,
      maxTentativas: desafio.maxTentativas,
      jogadorAutorizadoId: desafio.jogadorAutorizadoId ?? null,
    };
    if (desafio.dependencias) {
      opts.dependencias = [...desafio.dependencias];
    }
    if (desafio.tentativasPorRodada !== undefined) {
      opts.tentativasPorRodada = desafio.tentativasPorRodada;
    }
    if (desafio.jogadorAutorizadoNome !== undefined) {
      opts.jogadorAutorizadoNome = desafio.jogadorAutorizadoNome;
    }
    definirDesafioAtivo(criarLockpick(opts));
  };

  const statusClasse =
    desafio.status === 'aberto' ? 'ok' : desafio.status === 'travado' ? 'erro' : 'alerta';
  const statusTexto =
    desafio.status === 'aberto' ? 'Aberta!' : desafio.status === 'travado' ? 'Travada' : 'Ativo';

  return (
    <>
      <div class="desafios-bloco desafios-bloco-destaque">
        <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>🔒 {desafio.titulo}</strong>
            <div class="meta">
              {desafio.dados.map((d) => `d${d}`).join(' + ')} •{' '}
              {desafio.modoDica === 'posicional' ? 'Posicional' : 'Embaralhado'} •{' '}
              {desafio.tentativas.length}/{desafio.maxTentativas} tentativas
              {desafio.jogadorAutorizadoNome ? ` • ${desafio.jogadorAutorizadoNome}` : ''}
            </div>
          </div>
          <span class={cx('desafios-status-pill', statusClasse)}>{statusTexto}</span>
        </div>

        <div class="desafios-senha-caixa">
          <span class="meta" style={{ fontWeight: 700, textTransform: 'uppercase' }}>
            Senha secreta (só mestre):
          </span>
          <div class="desafios-senha-valores">
            {(desafio.senha ?? []).map((valor, idx) => (
              <span key={idx} class="desafios-pino" title={`d${desafio.dados[idx] ?? 6}`}>
                {mostrarSenha ? valor : '•'}
              </span>
            ))}
          </div>
          <span class="espaco" />
          <button
            type="button"
            class="botao-pilula"
            onClick={() => setMostrarSenha((v) => !v)}
            title={mostrarSenha ? 'Esconder senha (para compartilhamento de tela)' : 'Mostrar senha'}
          >
            {mostrarSenha ? '🙈 Esconder' : '👁 Mostrar'}
          </button>
        </div>

        <div class="desafios-linha">
          <button type="button" class="botao-pilula" onClick={reiniciar}>
            ↻ Nova senha / Reiniciar
          </button>
        </div>
      </div>

      {desafio.status === 'ativo' && (
        <form class="desafios-bloco" onSubmit={enviarTentativaManual}>
          <h4 class="desafios-subtitulo">Registrar tentativa manual (presencial)</h4>
          <div class="desafios-linha">
            {desafio.dados.map((lados, idx) => (
              <label key={idx} class="desafios-campo" style={{ width: '68px' }}>
                d{lados}
                <input
                  type="number"
                  min={1}
                  max={lados}
                  value={palpites[idx] ?? 1}
                  onInput={(ev) => {
                    const n = Number(ev.currentTarget.value) || 1;
                    setPalpites((prev) => {
                      const prox = [...prev];
                      prox[idx] = Math.min(lados, Math.max(1, n));
                      return prox;
                    });
                  }}
                />
              </label>
            ))}
            <label class="desafios-campo" style={{ flex: 1, minWidth: '110px' }}>
              Quem tentou
              <input
                type="text"
                value={autorManual}
                maxLength={50}
                onInput={(ev) => setAutorManual(ev.currentTarget.value)}
              />
            </label>
          </div>
          <button type="submit" class="botao-pilula destaque">
            Testar combinação
          </button>
        </form>
      )}

      <div class="desafios-bloco">
        <h4 class="desafios-subtitulo">
          Histórico de tentativas ({desafio.tentativas.length}/{desafio.maxTentativas})
        </h4>
        {desafio.tentativas.length === 0 ? (
          <p class="meta" style={{ margin: 0 }}>
            Nenhuma tentativa registrada ainda.
          </p>
        ) : (
          <ul class="desafios-historico">
            {[...desafio.tentativas].reverse().map((t) => (
              <li key={t.numero} class="desafios-historico-item">
                <span class="meta">#{t.numero}</span>
                <strong>{t.autorNome}</strong>
                <div class="desafios-senha-valores">
                  {t.valores.map((v, idx) => {
                    const fb = t.feedbackPosicional?.[idx];
                    const seta =
                      fb === 'alto'
                        ? ' ↑'
                        : fb === 'baixo'
                          ? ' ↓'
                          : fb === 'exato'
                            ? ' ✓'
                            : fb === 'trancado'
                              ? ' 🔒'
                              : '';
                    return (
                      <span key={idx} class={cx('desafios-pino', fb)}>
                        {v}
                        {seta}
                      </span>
                    );
                  })}
                </div>
                {t.feedbackEmbaralhado && (
                  <span class="meta">
                    ✓ {t.feedbackEmbaralhado.corretos} • ↑ {t.feedbackEmbaralhado.altos} • ↓{' '}
                    {t.feedbackEmbaralhado.baixos}
                    {(t.feedbackEmbaralhado.trancados ?? 0) > 0
                      ? ` • 🔒 ${t.feedbackEmbaralhado.trancados}`
                      : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function VivoEquilibrio({ desafio }: { desafio: DesafioEquilibrio }) {
  const totais = totaisEquilibrio(desafio);
  const [esqManual, setEsqManual] = useState(5);
  const [dirManual, setDirManual] = useState(5);

  const alternarExibicao = () => {
    const proximo: ModoExibicaoHud = desafio.exibicao === 'destaque' ? 'compacto' : 'destaque';
    definirDesafioAtivo({
      ...desafio,
      exibicao: proximo,
      atualizadoEm: Date.now(),
    });
  };

  const statusClasse =
    desafio.status === 'equilibrado'
      ? 'ok'
      : desafio.status === 'caiu'
        ? 'erro'
        : 'alerta';

  const statusTexto =
    desafio.status === 'aguardando'
      ? 'Aguardando 2d10'
      : desafio.status === 'equilibrado'
        ? 'Equilibrado!'
        : desafio.status === 'caiu'
          ? 'Caiu!'
          : 'Desequilibrado';

  return (
    <>
      <div class="desafios-bloco desafios-bloco-destaque">
        <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>⚖️ {desafio.titulo} — {desafio.personagem.nome}</strong>
            <div class="meta">
              d4 restantes: {totais.restantes} / {desafio.dadosEquilibrioTotal}
            </div>
          </div>
          <span class={cx('desafios-status-pill', statusClasse)}>{statusTexto}</span>
        </div>

        <div class="desafios-balanca">
          <div class="desafios-balanca-lado">
            <span class="meta">Esquerda</span>
            <span class="desafios-balanca-num">{desafio.dadoEsq === null ? '—' : totais.esq}</span>
          </div>
          <div class="desafios-balanca-diff">
            <strong>Dif: {desafio.dadoEsq === null ? '—' : totais.diferenca}</strong>
            <span>meta ≤ 1</span>
          </div>
          <div class="desafios-balanca-lado">
            <span class="meta">Direita</span>
            <span class="desafios-balanca-num">{desafio.dadoDir === null ? '—' : totais.dir}</span>
          </div>
        </div>

        <div class="desafios-linha">
          <button type="button" class="botao-pilula" onClick={alternarExibicao}>
            Exibição: {desafio.exibicao === 'destaque' ? 'Destaque central' : 'HUD compacto'}
          </button>
        </div>
      </div>

      <div class="desafios-bloco">
        <h4 class="desafios-subtitulo">Rolagem inicial (2d10)</h4>
        <div class="desafios-linha">
          <button
            type="button"
            class="botao-pilula destaque"
            onClick={() => despacharAcaoDesafio({ tipo: 'equilibrio.rolar-inicial' })}
          >
            🎲 Rolar 2d10
          </button>
          <span class="meta">ou físico:</span>
          <input
            type="number"
            class="desafios-input-curto"
            min={1}
            max={10}
            aria-label="Dado esquerdo manual"
            value={esqManual}
            onInput={(ev) => setEsqManual(Math.min(10, Math.max(1, Number(ev.currentTarget.value) || 1)))}
          />
          <input
            type="number"
            class="desafios-input-curto"
            min={1}
            max={10}
            aria-label="Dado direito manual"
            value={dirManual}
            onInput={(ev) => setDirManual(Math.min(10, Math.max(1, Number(ev.currentTarget.value) || 1)))}
          />
          <button
            type="button"
            class="botao-pilula"
            onClick={() =>
              despacharAcaoDesafio({
                tipo: 'equilibrio.rolar-inicial',
                dadoEsq: esqManual,
                dadoDir: dirManual,
              })
            }
          >
            Aplicar 2d10
          </button>
        </div>
      </div>

      {desafio.status === 'desequilibrado' && (
        <div class="desafios-bloco">
          <h4 class="desafios-subtitulo">Dados de Equilíbrio (d4)</h4>
          {desafio.d4Pendente === null ? (
            <div class="desafios-linha">
              <button
                type="button"
                class="botao-pilula destaque"
                disabled={totais.restantes <= 0}
                onClick={() => despacharAcaoDesafio({ tipo: 'equilibrio.rolar-d4' })}
              >
                🎲 Rolar d4 ({totais.restantes} rest.)
              </button>
              <span class="meta">ou físico:</span>
              {[1, 2, 3, 4].map((v) => (
                <button
                  key={v}
                  type="button"
                  class="botao-pilula"
                  disabled={totais.restantes <= 0}
                  onClick={() => despacharAcaoDesafio({ tipo: 'equilibrio.rolar-d4', valor: v })}
                >
                  {v}
                </button>
              ))}
            </div>
          ) : (
            <div class="desafios-linha">
              <span class="desafios-pino">{desafio.d4Pendente}</span>
              <button
                type="button"
                class="botao-pilula destaque"
                onClick={() =>
                  despacharAcaoDesafio({ tipo: 'equilibrio.aplicar-d4', lado: 'esq' })
                }
              >
                ← Aplicar na Esquerda
              </button>
              <button
                type="button"
                class="botao-pilula destaque"
                onClick={() =>
                  despacharAcaoDesafio({ tipo: 'equilibrio.aplicar-d4', lado: 'dir' })
                }
              >
                Aplicar na Direita →
              </button>
            </div>
          )}
        </div>
      )}

      {desafio.dadosUsados.length > 0 && (
        <div class="desafios-bloco">
          <h4 class="desafios-subtitulo">d4 aplicados ({desafio.dadosUsados.length})</h4>
          <div class="desafios-dados-lista">
            {desafio.dadosUsados.map((d) => (
              <span key={d.id} class="desafios-dado-chip">
                {d.lado === 'esq' ? '← Esq' : 'Dir →'} +{d.valor}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function VivoEsconderijo({ desafio }: { desafio: DesafioEsconderijo }) {
  const [buscaLados, setBuscaLados] = useState<LadosDado>(6);
  const [buscaManualTexto, setBuscaManualTexto] = useState('');
  const [dadoAddLados, setDadoAddLados] = useState<Record<string, LadosDado>>({});
  const [dadoAddValor, setDadoAddValor] = useState<Record<string, string>>({});

  const alternarOcultar = () => {
    definirDesafioAtivo({
      ...desafio,
      ocultarDoMestre: !desafio.ocultarDoMestre,
      atualizadoEm: Date.now(),
    });
  };

  const dispararBuscaManual = (ev: Event) => {
    ev.preventDefault();
    const nums = buscaManualTexto
      .split(/[\s,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 1);
    if (nums.length === 0) {
      despacharAcaoDesafio({
        tipo: 'esconderijo.buscar-criatura',
        dados: [{ lados: buscaLados }],
      });
      return;
    }
    despacharAcaoDesafio({
      tipo: 'esconderijo.buscar-criatura',
      dados: nums.map((valor) => ({ lados: buscaLados, valor })),
    });
    setBuscaManualTexto('');
  };

  const adicionarDadoPara = (participanteId: string) => {
    const lados = dadoAddLados[participanteId] ?? 6;
    const texto = (dadoAddValor[participanteId] ?? '').trim();
    const valorNum = texto !== '' ? Number(texto) : NaN;
    if (Number.isFinite(valorNum) && valorNum >= 1) {
      despacharAcaoDesafio({
        tipo: 'esconderijo.adicionar-dado',
        participanteId,
        lados,
        valor: valorNum,
      });
    } else {
      despacharAcaoDesafio({
        tipo: 'esconderijo.adicionar-dado',
        participanteId,
        lados,
      });
    }
    setDadoAddValor((prev) => ({ ...prev, [participanteId]: '' }));
  };

  return (
    <>
      <div class="desafios-bloco desafios-bloco-destaque">
        <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>👁️ {desafio.titulo} — Rodada {desafio.rodada}</strong>
            <div class="meta">
              Fase: <b>{desafio.fase === 'personagens' ? 'Personagens' : 'Criaturas'}</b> •
              Distrair: DT {desafio.dtDistrair}
            </div>
          </div>
          <button
            type="button"
            class="botao-pilula destaque"
            onClick={() => despacharAcaoDesafio({ tipo: 'esconderijo.proxima-fase' })}
          >
            Avançar fase →
          </button>
        </div>

        <label class="desafios-toggle">
          <input
            type="checkbox"
            checked={desafio.ocultarDoMestre}
            onChange={alternarOcultar}
          />
          Ocultar números do mestre
        </label>
      </div>

      <div class="desafios-bloco">
        <h4 class="desafios-subtitulo">Busca das Criaturas</h4>
        <div class="desafios-linha">
          {ATALHOS_BUSCA.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              class="botao-pilula destaque"
              onClick={() =>
                despacharAcaoDesafio({
                  tipo: 'esconderijo.buscar-criatura',
                  dados: a.dados.map((lados) => ({ lados })),
                })
              }
            >
              🎲 {a.rotulo}
            </button>
          ))}
        </div>

        <form class="desafios-linha" onSubmit={dispararBuscaManual}>
          <select
            aria-label="Dado da busca"
            value={buscaLados}
            onChange={(ev) => setBuscaLados(Number(ev.currentTarget.value) as LadosDado)}
          >
            {LADOS_VALIDOS.map((l) => (
              <option key={l} value={l}>
                d{l}
              </option>
            ))}
          </select>
          <input
            type="text"
            style={{ flex: 1, minWidth: '140px' }}
            placeholder="Valores físicos (ex: 3, 6) ou vazio p/ rolar"
            value={buscaManualTexto}
            onInput={(ev) => setBuscaManualTexto(ev.currentTarget.value)}
          />
          <button type="submit" class="botao-pilula">
            Rolar busca da criatura
          </button>
        </form>

        {desafio.ultimaBusca && (
          <div class="desafios-busca-resultado" data-testid="esconderijo-ultima-busca">
            <div class="desafios-linha">
              <span class="meta">Última busca:</span>
              {desafio.ultimaBusca.dados.map((d, i) => (
                <span key={i} class="desafios-pino">
                  d{d.lados}: {d.valor}
                </span>
              ))}
            </div>
            {desafio.ultimaBusca.atingidos.length === 0 ? (
              <span class="meta">Ninguém foi atingido nesta busca.</span>
            ) : (
              desafio.ultimaBusca.atingidos.map((a) => (
                <div key={a.participanteId}>
                  <strong>{a.nome}</strong> perdeu dado(s) <code>{a.valores.join(', ')}</code>
                  {a.ficouEncontrado && (
                    <span class="desafios-status-pill erro" style={{ marginLeft: '6px' }}>
                      Encontrado!
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div class="desafios-bloco">
        <h4 class="desafios-subtitulo">Participantes ({desafio.participantes.length})</h4>
        {desafio.participantes.map((p) => (
          <div key={p.id} class={cx('desafios-card-vivo', p.encontrado && 'encontrado')}>
            <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{p.nome}</strong>
                <div class="meta">
                  {p.dados.length} {p.dados.length === 1 ? 'dado' : 'dados'} • DT Esconder-se:{' '}
                  {p.dtEsconderSe}
                </div>
              </div>
              <span class={cx('desafios-status-pill', p.encontrado ? 'erro' : 'ok')}>
                {p.encontrado ? 'Encontrado' : 'Escondido'}
              </span>
            </div>

            {p.dados.length > 0 && (
              <div class="desafios-dados-lista">
                {p.dados.map((d) => (
                  <span key={d.id} class="desafios-dado-chip">
                    d{d.lados}: {desafio.ocultarDoMestre || d.valor === 0 ? '•' : d.valor}
                    <button
                      type="button"
                      title="Descartar dado"
                      aria-label={`Descartar dado de ${p.nome}`}
                      onClick={() =>
                        despacharAcaoDesafio({
                          tipo: 'esconderijo.descartar-dado',
                          participanteId: p.id,
                          dadoId: d.id,
                        })
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div class="desafios-linha">
              <select
                aria-label={`Tipo de dado para ${p.nome}`}
                value={dadoAddLados[p.id] ?? 6}
                onChange={(ev) =>
                  setDadoAddLados((prev) => ({
                    ...prev,
                    [p.id]: Number(ev.currentTarget.value) as LadosDado,
                  }))
                }
              >
                {LADOS_VALIDOS.map((l) => (
                  <option key={l} value={l}>
                    d{l}
                  </option>
                ))}
              </select>
              <input
                type="number"
                class="desafios-input-curto"
                min={1}
                max={dadoAddLados[p.id] ?? 6}
                placeholder="auto"
                aria-label={`Valor manual para ${p.nome}`}
                value={dadoAddValor[p.id] ?? ''}
                onInput={(ev) =>
                  setDadoAddValor((prev) => ({ ...prev, [p.id]: ev.currentTarget.value }))
                }
              />
              <button
                type="button"
                class="botao-pilula"
                onClick={() => adicionarDadoPara(p.id)}
              >
                + Dado
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function VivoPerseguicao({ desafio }: { desafio: DesafioPerseguicao }) {
  const [paInput, setPaInput] = useState<Record<string, number>>({});
  const [esforcoInput, setEsforcoInput] = useState<Record<string, boolean>>({});
  const [carregarAlvo, setCarregarAlvo] = useState<Record<string, string>>({});

  const limiarAtual = desafio.limiaresPorRodada[desafio.rodada];

  const alternarMostrarPa = () => {
    definirDesafioAtivo({
      ...desafio,
      mostrarPaJogadores: !desafio.mostrarPaJogadores,
      atualizadoEm: Date.now(),
    });
  };

  return (
    <>
      <div class="desafios-bloco desafios-bloco-destaque">
        <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong>
              🏃 {desafio.titulo} — Rodada {desafio.rodada} / {desafio.totalRodadas}
            </strong>
            <div class="meta">
              Meta: {desafio.metaPa} PA •{' '}
              {limiarAtual !== undefined
                ? `Limiar desta rodada: ${limiarAtual} PA`
                : 'Sem limiar nesta rodada'}
            </div>
          </div>
          <button
            type="button"
            class="botao-pilula destaque"
            onClick={() => despacharAcaoDesafio({ tipo: 'perseguicao.encerrar-rodada' })}
          >
            Encerrar Rodada (aplicar limiar)
          </button>
        </div>

        <label class="desafios-toggle">
          <input
            type="checkbox"
            checked={desafio.mostrarPaJogadores}
            onChange={alternarMostrarPa}
          />
          Mostrar contador de PA aos jogadores
        </label>
      </div>

      <div class="desafios-bloco">
        <h4 class="desafios-subtitulo">Participantes ({desafio.participantes.length})</h4>
        {desafio.participantes.map((p) => {
          const pct = Math.min(100, Math.round((p.pa / Math.max(1, desafio.metaPa)) * 100));
          const pontos = paInput[p.id] ?? 5;
          const esforco = esforcoInput[p.id] ?? false;
          const outros = desafio.participantes.filter((o) => o.id !== p.id);
          const alvoId = carregarAlvo[p.id] ?? outros[0]?.id ?? '';
          const statusClasse =
            p.status === 'seguro' ? 'ok' : p.status === 'derrubado' ? 'erro' : 'alerta';

          return (
            <div key={p.id} class={cx('desafios-card-vivo', p.status)}>
              <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{p.nome}</strong>
                  <div class="meta">
                    PA: <b>{p.pa}</b> / {desafio.metaPa} • Fôlego: <b>{p.folegoRestante}</b>/
                    {p.folegoTotal} d6 • Esforço Extra: {p.esforcoExtraUsos}× (próx.{' '}
                    {p.esforcoExtraUsos + 1}d4)
                  </div>
                </div>
                <span class={cx('desafios-status-pill', statusClasse)}>
                  {p.status === 'correndo'
                    ? 'Correndo'
                    : p.status === 'derrubado'
                      ? 'Derrubado'
                      : 'Seguro'}
                </span>
              </div>

              <div class="desafios-progresso-trilha">
                <div
                  class={cx(
                    'desafios-progresso-barra',
                    p.status === 'seguro' && 'sucesso',
                    p.status === 'derrubado' && 'perigo',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div class="desafios-linha">
                <input
                  type="number"
                  class="desafios-input-curto"
                  min={0}
                  max={100}
                  aria-label={`Pontos de avanço de ${p.nome}`}
                  value={pontos}
                  onInput={(ev) =>
                    setPaInput((prev) => ({
                      ...prev,
                      [p.id]: Math.max(0, Number(ev.currentTarget.value) || 0),
                    }))
                  }
                />
                <label class="desafios-toggle" style={{ fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={esforco}
                    onChange={(ev) =>
                      setEsforcoInput((prev) => ({ ...prev, [p.id]: ev.currentTarget.checked }))
                    }
                  />
                  Esforço Extra ({p.esforcoExtraUsos + 1}d4)
                </label>
                <button
                  type="button"
                  class="botao-pilula destaque"
                  onClick={() => {
                    despacharAcaoDesafio({
                      tipo: 'perseguicao.avancar',
                      participanteId: p.id,
                      pontos,
                      esforcoExtra: esforco,
                    });
                    if (esforco) {
                      setEsforcoInput((prev) => ({ ...prev, [p.id]: false }));
                    }
                  }}
                >
                  +{pontos} PA
                </button>
                <button
                  type="button"
                  class="botao-pilula"
                  disabled={p.folegoRestante <= 0}
                  onClick={() =>
                    despacharAcaoDesafio({
                      tipo: 'perseguicao.gastar-folego',
                      participanteId: p.id,
                      quantidade: 1,
                    })
                  }
                >
                  −1 Fôlego
                </button>
              </div>

              {outros.length > 0 && (
                <div class="desafios-linha">
                  <select
                    aria-label={`Aliado para ${p.nome} carregar`}
                    value={alvoId}
                    onChange={(ev) =>
                      setCarregarAlvo((prev) => ({ ...prev, [p.id]: ev.currentTarget.value }))
                    }
                  >
                    {outros.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome} ({o.pa} PA)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    class="botao-pilula"
                    disabled={!alvoId}
                    onClick={() => {
                      if (!alvoId) return;
                      despacharAcaoDesafio({
                        tipo: 'perseguicao.carregar',
                        carregadorId: p.id,
                        alvoId,
                        pontos,
                        esforcoExtra: esforco,
                      });
                    }}
                  >
                    Carregar aliado (+{pontos})
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function VivoEscalada({ desafio }: { desafio: DesafioEscalada }) {
  const [ptsInput, setPtsInput] = useState<Record<string, number>>({});

  return (
    <>
      <div class="desafios-bloco desafios-bloco-destaque">
        <div>
          <strong>🧗 {desafio.titulo}</strong>
          <div class="meta">
            Meta: {desafio.metaPontos} pts • DT Rápida: {desafio.dtRapida} • DT Cautelosa:{' '}
            {desafio.dtCautelosa}
          </div>
        </div>
      </div>

      <div class="desafios-bloco">
        <h4 class="desafios-subtitulo">Escaladores ({desafio.participantes.length})</h4>
        {desafio.participantes.map((p) => {
          const pct = Math.min(100, Math.round((p.pontos / Math.max(1, desafio.metaPontos)) * 100));
          const pts = ptsInput[p.id] ?? 2;
          const statusClasse =
            p.status === 'topo' ? 'ok' : p.status === 'caiu' ? 'erro' : 'alerta';

          return (
            <div key={p.id} class={cx('desafios-card-vivo', p.status)}>
              <div class="desafios-linha" style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong>{p.nome}</strong>
                  <div class="meta">
                    Pontos: <b>{p.pontos}</b> / {desafio.metaPontos} • Dano de queda atual:{' '}
                    <b>{p.status === 'caiu' ? (p.ultimoDanoQueda ?? p.pontos) : p.pontos}</b>
                  </div>
                </div>
                <span class={cx('desafios-status-pill', statusClasse)}>
                  {p.status === 'topo' ? 'Topo!' : p.status === 'caiu' ? 'Caiu!' : 'Escalando'}
                </span>
              </div>

              <div class="desafios-progresso-trilha">
                <div
                  class={cx(
                    'desafios-progresso-barra',
                    p.status === 'topo' && 'sucesso',
                    p.status === 'caiu' && 'perigo',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div class="desafios-linha">
                <input
                  type="number"
                  class="desafios-input-curto"
                  min={1}
                  max={20}
                  aria-label={`Pontos de escalada para ${p.nome}`}
                  value={pts}
                  onInput={(ev) =>
                    setPtsInput((prev) => ({
                      ...prev,
                      [p.id]: Math.max(1, Number(ev.currentTarget.value) || 1),
                    }))
                  }
                />
                <button
                  type="button"
                  class="botao-pilula destaque"
                  onClick={() =>
                    despacharAcaoDesafio({
                      tipo: 'escalada.registrar',
                      participanteId: p.id,
                      passou: true,
                      pontos: pts,
                    })
                  }
                >
                  Rápida (+{pts})
                </button>
                <button
                  type="button"
                  class="botao-pilula"
                  onClick={() =>
                    despacharAcaoDesafio({
                      tipo: 'escalada.registrar',
                      participanteId: p.id,
                      passou: true,
                      pontos: pts,
                    })
                  }
                >
                  Cautelosa (+{pts})
                </button>
                <button
                  type="button"
                  class="botao-pilula perigo"
                  onClick={() =>
                    despacharAcaoDesafio({
                      tipo: 'escalada.registrar',
                      participanteId: p.id,
                      passou: false,
                    })
                  }
                >
                  Falhou (Caiu!)
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Componente principal: PainelDesafios                                      */
/* -------------------------------------------------------------------------- */

export function PainelDesafios({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const [aba, setAba] = useState<AbaDesafio>('lockpick');
  const [manuais, setManuais] = useState<PersonagemDisponivel[]>([]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, aoFechar]);

  useEffect(() => {
    if (!aberto) return;
    return iniciarCombateCanal();
  }, [aberto]);

  const estadoAtlas = estadoBrutoDoAtlas.value;
  const fichasOnline = estadoDaPonte.value.fichas;
  const membrosOnline = estadoDaPonte.value.membros;

  const { pool, rotuloPool } = useMemo<{
    pool: PersonagemDisponivel[];
    rotuloPool: string;
  }>(() => {
    const automaticos: PersonagemDisponivel[] = [];
    const vistosFichaId = new Set<string>();
    const vistosNome = new Set<string>();

    const buscarFichaPorNome = (nomeNorm: string) => {
      if (!nomeNorm) return undefined;
      for (let i = fichasOnline.length - 1; i >= 0; i--) {
        const f = fichasOnline[i];
        if (!f) continue;
        if (normalizarNome(extrairSugestoesDaFicha(f).nome) === nomeNorm) {
          return f;
        }
      }
      return undefined;
    };

    const buscarDono = (fichaId: string | undefined, nomeNorm: string): string | undefined => {
      if (fichaId) {
        const porId = membrosOnline.find((m) => m.personagem === fichaId);
        if (porId?.discordId) return porId.discordId;
      }
      if (nomeNorm) {
        for (const m of membrosOnline) {
          if (!m.personagem) continue;
          const f = fichasOnline.find((x) => x.id === m.personagem);
          if (f && normalizarNome(extrairSugestoesDaFicha(f).nome) === nomeNorm) {
            return m.discordId;
          }
        }
      }
      return undefined;
    };

    const adicionarUnico = (item: PersonagemDisponivel, idsExtras?: readonly (string | undefined)[]) => {
      const chaveNome = normalizarNome(item.nome);
      if (item.fichaId && vistosFichaId.has(item.fichaId)) return;
      if (idsExtras?.some((id) => id && vistosFichaId.has(id))) return;
      if (chaveNome && vistosNome.has(chaveNome)) return;

      if (item.fichaId) vistosFichaId.add(item.fichaId);
      if (idsExtras) {
        for (const id of idsExtras) {
          if (id) vistosFichaId.add(id);
        }
      }
      if (chaveNome) vistosNome.add(chaveNome);
      automaticos.push(item);
    };

    const tokensJogadores = estadoAtlas?.combatentes.filter((c) => c.jogador) ?? [];
    if (tokensJogadores.length > 0) {
      for (const c of tokensJogadores) {
        const refFichaId = c.refs.find((r) => r.app === 'ficha' && r.tipo === 'ficha')?.id;
        const nomeToken = c.nome.trim();
        const nomeNorm = normalizarNome(nomeToken);
        const ficha =
          (refFichaId ? fichasOnline.find((f) => f.id === refFichaId) : undefined)
          ?? buscarFichaPorNome(nomeNorm);
        const sugestoes = ficha
          ? extrairSugestoesDaFicha(ficha)
          : extrairSugestoesDaFicha({ name: nomeToken || 'Personagem' });
        const nomeFinal = nomeToken || sugestoes.nome;
        const fichaIdFinal = ficha?.id ?? refFichaId;
        const donoDiscordId =
          buscarDono(fichaIdFinal, normalizarNome(nomeFinal))
          ?? (refFichaId && refFichaId !== fichaIdFinal ? buscarDono(refFichaId, '') : undefined);

        const item: PersonagemDisponivel = {
          id: fichaIdFinal ?? c.tokenId,
          nome: nomeFinal,
          origem: 'mapa',
          sugestoes,
        };
        if (fichaIdFinal !== undefined) item.fichaId = fichaIdFinal;
        if (donoDiscordId !== undefined) item.donoDiscordId = donoDiscordId;
        if (sugestoes.retrato !== undefined) item.retrato = sugestoes.retrato;

        adicionarUnico(item, [refFichaId]);
      }

      return {
        pool: [...automaticos, ...manuais],
        rotuloPool: `No mapa atual (${automaticos.length})`,
      };
    }

    const jogadoresConectados = membrosOnline.filter(
      (m) => m.papel === 'jogador' && m.personagem,
    );
    for (const m of jogadoresConectados) {
      const fichaId = m.personagem!;
      const ficha = fichasOnline.find((f) => f.id === fichaId);
      const sugestoes = ficha
        ? extrairSugestoesDaFicha(ficha)
        : extrairSugestoesDaFicha({ name: m.nome });
      const nomeFinal = ficha ? sugestoes.nome : m.nome;

      const item: PersonagemDisponivel = {
        id: fichaId,
        nome: nomeFinal,
        fichaId,
        donoDiscordId: m.discordId,
        origem: 'online',
        sugestoes,
      };
      if (sugestoes.retrato !== undefined) item.retrato = sugestoes.retrato;
      adicionarUnico(item);
    }

    return {
      pool: [...automaticos, ...manuais],
      rotuloPool:
        automaticos.length > 0
          ? `Conectados na sala (${automaticos.length})`
          : 'No mapa atual (0)',
    };
  }, [estadoAtlas, fichasOnline, membrosOnline, manuais]);

  if (!aberto) return null;

  const ativo = desafioAtivo.value;
  const online = conexaoOnline.value === 'aberta';

  const adicionarManual = (nome: string) => {
    const id = `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setManuais((prev) => [
      ...prev,
      {
        id,
        nome,
        origem: 'manual',
        sugestoes: extrairSugestoesDaFicha({ name: nome }),
      },
    ]);
  };

  const removerManual = (id: string) => {
    setManuais((prev) => prev.filter((m) => m.id !== id));
  };

  const abrirTelao = () => {
    const url = urlDoTelaoLocal(mapaAtual.value?.mapaId ?? null);
    void abrirJanelaNoSegundoMonitor(url, 'mesa-telao');
  };

  return (
    <div
      class="desafios-fundo"
      data-testid="painel-desafios-fundo"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) aoFechar();
      }}
    >
      <div
        class="desafios-gaveta"
        role="dialog"
        aria-modal="true"
        aria-label="Desafios de Cena"
        data-testid="painel-desafios"
      >
        <header class="desafios-topo">
          <div class="desafios-topo-linha">
            <h2 class="faixa">Desafios de Cena</h2>
            <button
              type="button"
              class="desafios-fechar"
              aria-label="Fechar painel de desafios"
              data-testid="painel-desafios-fechar"
              onClick={aoFechar}
            >
              ✕
            </button>
          </div>

          <div class="desafios-status-bar">
            {ativo && (
              <span class="selo desafios-selo-ativo" data-testid="desafios-selo-ativo">
                <i class="desafios-ponto" />
                Ativo: {ROTULO_TIPO[ativo.tipo]}
              </span>
            )}
            <span
              class={cx('selo', online && 'desafios-selo-online')}
              title={
                online
                  ? 'Conectado à sala online: mudanças espelham automaticamente para todos os jogadores.'
                  : 'Modo local/presencial: mudanças espelham para o Telão local.'
              }
            >
              <i class="desafios-ponto" />
              {online ? 'Online — espelhando' : 'Local / Presencial'}
            </span>
            <span class="espaco" />
            <button
              type="button"
              class="botao-pilula"
              data-testid="desafios-abrir-telao"
              title="Abrir Telão local com mapa e desafios na TV ou 2º monitor"
              onClick={abrirTelao}
            >
              📺 Telão local (2º monitor)
            </button>
            {ativo && (
              <button
                type="button"
                class="botao-pilula perigo"
                data-testid="desafios-encerrar"
                onClick={encerrarDesafioAtivo}
              >
                Encerrar desafio
              </button>
            )}
          </div>
        </header>

        <div class="desafios-corpo">
          {ativo === null ? (
            <>
              <div class="desafios-abas" role="tablist" aria-label="Tipo de desafio">
                {ABAS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={aba === a.id}
                    class={cx('desafios-aba', aba === a.id && 'ativa')}
                    data-testid={`desafios-aba-${a.id}`}
                    onClick={() => setAba(a.id)}
                  >
                    <span class="desafios-aba-icone">{a.icone}</span>
                    <span>{a.rotulo}</span>
                  </button>
                ))}
              </div>

              {aba === 'lockpick' && <ConfigLockpick pool={pool} rotuloPool={rotuloPool} />}
              {aba === 'equilibrio' && (
                <ConfigEquilibrio
                  pool={pool}
                  rotuloPool={rotuloPool}
                  aoAdicionarManual={adicionarManual}
                />
              )}
              {aba === 'esconderijo' && (
                <ConfigEsconderijo
                  pool={pool}
                  rotuloPool={rotuloPool}
                  aoAdicionarManual={adicionarManual}
                  aoRemoverManual={removerManual}
                />
              )}
              {aba === 'perseguicao' && (
                <ConfigPerseguicao
                  pool={pool}
                  rotuloPool={rotuloPool}
                  aoAdicionarManual={adicionarManual}
                  aoRemoverManual={removerManual}
                />
              )}
              {aba === 'escalada' && (
                <ConfigEscalada
                  pool={pool}
                  rotuloPool={rotuloPool}
                  aoAdicionarManual={adicionarManual}
                  aoRemoverManual={removerManual}
                />
              )}
            </>
          ) : (
            <>
              {ativo.tipo === 'lockpick' && <VivoLockpick desafio={ativo} />}
              {ativo.tipo === 'equilibrio' && <VivoEquilibrio desafio={ativo} />}
              {ativo.tipo === 'esconderijo' && <VivoEsconderijo desafio={ativo} />}
              {ativo.tipo === 'perseguicao' && <VivoPerseguicao desafio={ativo} />}
              {ativo.tipo === 'escalada' && <VivoEscalada desafio={ativo} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
