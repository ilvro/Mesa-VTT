import { useEffect, useRef, useState } from 'preact/hooks';
import type { Entidade, Ref } from '#mesa';
import { abrirNoApp } from '../app/barramento.ts';
import { removerEntidade } from '../app/campanha.ts';
import { idDaPistaDoAtelie } from '../app/pistas-atelie.ts';
import { abrirEntidade } from '../app/rotas.ts';
import { ativarCena } from '../app/sessao.ts';
import { ehEncontro, NOME_DO_APP, NOME_DO_TIPO_DE_REF } from '../dominio/entidades.ts';
import { ehRefDeEntidadeDaMesa } from '../dominio/notas.ts';
import { abrirInspecaoNaMesa } from './InspecaoDePista.tsx';

import { menuContexto, type AcaoMenuContexto, type EstadoMenuContexto } from '../app/sobreposicoes.ts';
export { menuContexto, type AcaoMenuContexto, type EstadoMenuContexto };

export function fecharMenuContexto(): void {
  menuContexto.value = null;
}

export function abrirMenuContexto(
  ev: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number },
  acoes: readonly AcaoMenuContexto[],
  titulo?: string,
): void {
  if (acoes.length === 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  menuContexto.value = { x: ev.clientX, y: ev.clientY, ...(titulo ? { titulo } : {}), acoes };
}

/** Monta as ações padrão de botão direito para uma referência externa (ficha no Dossiê, documento no Ateliê, mapa no Atlas, trilha no Jukebox). */
export function acoesParaRef(
  r: Ref,
  extras: readonly AcaoMenuContexto[] = [],
): AcaoMenuContexto[] {
  const appNome = NOME_DO_APP[r.app] ?? r.app;
  const tipoNome = NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo;
  const acoes: AcaoMenuContexto[] = [];
  if (idDaPistaDoAtelie(r)) {
    acoes.push({
      id: `inspecionar-pista-${r.id}`,
      rotulo: '🔬 Inspecionar pista (Luz UV)',
      executar: () => abrirInspecaoNaMesa(r),
    });
  }
  acoes.push(
    {
      id: `abrir-ref-${r.app}-${r.id}`,
      rotulo: `Abrir ${tipoNome} no ${appNome} ↗`,
      executar: () => abrirNoApp(r),
    },
    ...extras,
  );
  return acoes;
}

/** Monta as ações padrão de botão direito para uma entidade da campanha (Abrir no app dono, Abrir na Mesa, Ativar cena e Deletar). */
export function acoesParaEntidade(
  e: Entidade,
  opcoes: { mostrarAbrirNaMesa?: boolean; extras?: readonly AcaoMenuContexto[] } = {},
): AcaoMenuContexto[] {
  const acoes: AcaoMenuContexto[] = [];
  const refsExternas = e.refs.filter(r => !ehRefDeEntidadeDaMesa(r));
  const refPista = refsExternas.find(r => idDaPistaDoAtelie(r) !== null);

  if (refPista) {
    acoes.push({
      id: `inspecionar-pista-${refPista.id}`,
      rotulo: '🔬 Inspecionar pista (Luz UV)',
      executar: () => abrirInspecaoNaMesa(refPista),
    });
  }

  for (const r of refsExternas) {
    const appNome = NOME_DO_APP[r.app] ?? r.app;
    const tipoNome = NOME_DO_TIPO_DE_REF[r.tipo] ?? r.tipo;
    acoes.push({
      id: `abrir-app-${r.app}-${r.id}`,
      rotulo: refsExternas.length === 1 ? `Abrir no ${appNome} ↗` : `Abrir ${tipoNome} no ${appNome} ↗`,
      executar: () => abrirNoApp(r),
    });
  }

  if (e.tipo === 'cena') {
    const encontro = ehEncontro(e);
    acoes.push({
      id: 'ativar-cena',
      rotulo: encontro ? '⚔ Lançar encontro' : '▶ Ativar cena',
      executar: () => ativarCena(e),
    });
  }

  if (opcoes.mostrarAbrirNaMesa !== false) {
    acoes.push({
      id: 'abrir-na-mesa',
      rotulo: refsExternas.length > 0 ? 'Abrir detalhes na Mesa' : 'Abrir',
      executar: () => abrirEntidade(e.id),
    });
  }

  if (opcoes.extras) {
    acoes.push(...opcoes.extras);
  }

  acoes.push({
    id: 'deletar',
    rotulo: 'Deletar',
    perigo: true,
    confirmar: true,
    executar: () => removerEntidade(e),
  });

  return acoes;
}

export function MenuDeContexto() {
  const estado = menuContexto.value;
  const ref = useRef<HTMLDivElement>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  useEffect(() => {
    setConfirmandoId(null);
  }, [estado]);

  useEffect(() => {
    if (!estado) return;
    const aoPressionarFora = (ev: PointerEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) {
        fecharMenuContexto();
      }
    };
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        fecharMenuContexto();
      }
    };
    const aoRolar = () => fecharMenuContexto();
    window.addEventListener('pointerdown', aoPressionarFora, true);
    window.addEventListener('keydown', aoTeclar, true);
    window.addEventListener('scroll', aoRolar, true);
    return () => {
      window.removeEventListener('pointerdown', aoPressionarFora, true);
      window.removeEventListener('keydown', aoTeclar, true);
      window.removeEventListener('scroll', aoRolar, true);
    };
  }, [estado]);

  if (!estado) return null;

  const larguraMax = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const alturaMax = typeof window !== 'undefined' ? window.innerHeight : 720;
  const left = Math.max(8, Math.min(estado.x, larguraMax - 230));
  const top = Math.max(8, Math.min(estado.y, alturaMax - (estado.acoes.length * 36 + 44)));

  return (
    <div
      ref={ref}
      class="menu-contexto-mesa"
      role="menu"
      data-testid="menu-contexto"
      style={{ left: `${left}px`, top: `${top}px` }}
      onContextMenu={ev => {
        ev.preventDefault();
        ev.stopPropagation();
      }}
    >
      {estado.titulo && (
        <div class="menu-contexto-titulo" title={estado.titulo}>
          {estado.titulo}
        </div>
      )}
      {estado.acoes.map(acao => {
        if (acao.confirmar && confirmandoId === acao.id) {
          return (
            <div key={acao.id} class="menu-contexto-confirmacao" data-testid={`menu-contexto-confirmacao-${acao.id}`}>
              <button
                type="button"
                role="menuitem"
                class="menu-contexto-btn perigo confirmar"
                data-testid={`menu-contexto-confirmar-${acao.id}`}
                onClick={() => {
                  fecharMenuContexto();
                  void acao.executar();
                }}
              >
                Confirmar: {acao.rotulo}
              </button>
              <button
                type="button"
                class="menu-contexto-btn cancelar"
                data-testid={`menu-contexto-cancelar-${acao.id}`}
                onClick={() => setConfirmandoId(null)}
              >
                Cancelar
              </button>
            </div>
          );
        }
        return (
          <button
            key={acao.id}
            type="button"
            role="menuitem"
            class={`menu-contexto-btn${acao.perigo ? ' perigo' : ''}`}
            data-testid={`menu-contexto-${acao.id}`}
            onClick={() => {
              if (acao.confirmar) {
                setConfirmandoId(acao.id);
              } else {
                fecharMenuContexto();
                void acao.executar();
              }
            }}
          >
            {acao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
