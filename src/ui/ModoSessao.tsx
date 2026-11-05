import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { carregarEscolhas, escolhas, fichaDaAba, fichasEmAbas, layout, mapaAtual, mapas, mudarEscolhas, mudarLayout, personagens, alternarFicha, restaurarLayoutPadrao } from '../app/sessao.ts';
import { baseDoApp, inventario, sondarAplicativos } from '../app/inventario.ts';
import { campanhaAtiva } from '../app/campanha.ts';
import { enderecoDe } from '../app/aplicativos.ts';
import { alternarPainel, presetDe, PRESETS, redimensionar, ROTULO_DO_PAINEL, ROTULO_DO_PRESET, visiveis, type Layout, type PainelId, type PresetId } from '../dominio/layout.ts';
import { enderecoDaFicha, enderecoDoAtlas } from '../dominio/sessao.ts';
import { cx } from './cx.ts';
import { Diario } from './Diario.tsx';
import { carregarSessoes } from '../app/registro.ts';

const LARGURA_DO_DIVISOR = 8;

/** O app não está ao lado da Mesa: o painel avisa em vez de mostrar um quadro de erro. */
function foraDoAr(app: 'atlas' | 'ficha' | 'jukebox'): boolean { return inventario.value.find(i => i.app === app)?.estado === 'fora-do-ar'; }
const SemApp = ({ nome }: { nome: string }) => <div class="painel-vazio" data-testid="painel-fora-do-ar"><p>{nome} não está ao lado da Mesa.</p><p class="meta">Suba tudo com “npm run mesa-dev”, na pasta do Atlas.</p></div>;

function PainelDoAtlas() {
  const m = mapaAtual.value;
  if (foraDoAr('atlas')) return <SemApp nome="O Atlas" />;
  return <iframe class="quadro" data-testid="iframe-atlas" title="Atlas" src={enderecoDoAtlas(baseDoApp('atlas'), m?.mapaId ?? null)} allow="fullscreen; autoplay; clipboard-write" />;
}

function PainelDasFichas() {
  const abas = fichasEmAbas.value, ativa = fichaDaAba.value;
  const [abertas, setAbertas] = useState<string[]>([]);
  useEffect(() => { if (ativa && !abertas.includes(ativa.fichaId)) setAbertas(a => [...a, ativa.fichaId]); }, [ativa?.fichaId]);
  if (foraDoAr('ficha')) return <SemApp nome="A Ficha" />;
  if (!personagens.value.length) return <div class="painel-vazio" data-testid="fichas-vazio"><p>Nenhuma personagem com ficha nesta campanha.</p><p class="meta">Abra a Ficha com esta campanha ativa: ela publica as personagens aqui.</p></div>;
  return (
    <>
      <div class="abas-fichas" role="tablist" aria-label="Fichas">
        {abas.map(f => <button key={f.fichaId} type="button" role="tab" aria-selected={ativa?.fichaId === f.fichaId} class={cx('chip', ativa?.fichaId === f.fichaId && 'ativa')} data-testid={`ficha-aba-${f.fichaId}`} onClick={() => mudarEscolhas({ ativa: f.fichaId })}>{f.nome}</button>)}
        <details class="escolher-fichas">
          <summary class="chip" data-testid="escolher-fichas">Personagens…</summary>
          <ul class="menu-fichas">
            {personagens.value.map(p => <li key={p.fichaId}><label><input type="checkbox" checked={abas.some(a => a.fichaId === p.fichaId)} data-testid={`ficha-escolher-${p.fichaId}`} onChange={() => alternarFicha(p.fichaId)} /> {p.nome}</label></li>)}
          </ul>
        </details>
      </div>
      <div class="painel-corpo-abas">
        {abas.length === 0 && <div class="painel-vazio"><p>Nenhuma ficha em abas. Escolha em “Personagens…”.</p></div>}
        {abas.filter(f => abertas.includes(f.fichaId)).map(f => {
          const rota = enderecoDe(f.ref), src = rota ?? enderecoDaFicha(baseDoApp('ficha'), f.fichaId);
          return <iframe key={f.fichaId} class="quadro" data-testid={`iframe-ficha-${f.fichaId}`} title={`Ficha de ${f.nome}`} src={src} hidden={ativa?.fichaId !== f.fichaId} allow="fullscreen; autoplay; clipboard-write" />;
        })}
      </div>
    </>
  );
}

function PainelDoJukebox() {
  if (foraDoAr('jukebox')) return <SemApp nome="O Jukebox" />;
  return <iframe class="quadro" data-testid="iframe-jukebox" title="Jukebox" src={baseDoApp('jukebox')} allow="fullscreen; autoplay" />;
}

const CORPO: Record<PainelId, () => preact.JSX.Element> = { atlas: PainelDoAtlas, fichas: PainelDasFichas, jukebox: PainelDoJukebox, diario: Diario };

export function ModoSessao() {
  const c = campanhaAtiva.value, area = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState(false);
  useEffect(() => { carregarEscolhas(c?.id ?? null); void sondarAplicativos(); void carregarSessoes(); }, [c?.id]);

  if (!c) return <section class="pagina"><div class="vazio"><h2>Escolha uma campanha</h2><p>O modo sessão junta o mapa, as fichas e a música da campanha ativa.</p></div></section>;
  const l = layout.value, v = visiveis(l), preset = presetDe(l);

  const arrastar = (indice: number) => (ev: PointerEvent) => {
    const alvo = ev.currentTarget as HTMLElement, caixa = area.current; if (!caixa) return;
    ev.preventDefault(); alvo.setPointerCapture(ev.pointerId); setArrastando(true);
    const inicio = ev.clientX, original: Layout = layout.value, larguraUtil = caixa.clientWidth - (v.length - 1) * LARGURA_DO_DIVISOR;
    const mover = (m: PointerEvent) => mudarLayout(redimensionar(original, indice, m.clientX - inicio, larguraUtil), false);
    const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); alvo.removeEventListener('pointercancel', soltar); setArrastando(false); mudarLayout(layout.value); };
    alvo.addEventListener('pointermove', mover); alvo.addEventListener('pointerup', soltar); alvo.addEventListener('pointercancel', soltar);
  };
  const teclar = (indice: number) => (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault(); const caixa = area.current; if (!caixa) return;
    mudarLayout(redimensionar(layout.value, indice, (ev.key === 'ArrowRight' ? 1 : -1) * 32, caixa.clientWidth - (v.length - 1) * LARGURA_DO_DIVISOR));
  };
  const telaCheia = (id: PainelId) => { const el = area.current?.querySelector<HTMLElement>(`[data-painel="${id}"]`); void el?.requestFullscreen?.().catch(() => undefined); };

  return (
    <section class="sessao" data-testid="tela-sessao">
      <div class="sessao-barra">
        <label class="linha-campanha">Mapa
          <select data-testid="sessao-mapa" value={mapaAtual.value?.mapaId ?? ''} disabled={mapas.value.length === 0} onChange={ev => mudarEscolhas({ mapaId: ev.currentTarget.value || null })}>
            {mapas.value.length === 0 ? <option value="">Nenhum mapa na campanha</option> : mapas.value.map(m => <option key={m.mapaId} value={m.mapaId}>{m.nome}</option>)}
          </select>
        </label>
        <div class="chips" role="group" aria-label="Layout">
          {(Object.keys(PRESETS) as PresetId[]).map(id => <button key={id} type="button" class={cx('chip', preset === id && 'ativa')} aria-pressed={preset === id} data-testid={`preset-${id}`} onClick={() => mudarLayout(PRESETS[id])}>{ROTULO_DO_PRESET[id]}</button>)}
        </div>
        <div class="chips" role="group" aria-label="Painéis">
          {l.map(p => <button key={p.id} type="button" class={cx('chip', p.visivel && 'ativa')} aria-pressed={p.visivel} data-testid={`painel-${p.id}`} onClick={() => mudarLayout(alternarPainel(layout.value, p.id))}>{ROTULO_DO_PAINEL[p.id]}</button>)}
        </div>
        <span class="espaco" />
        <button type="button" class="botao-pilula" data-testid="layout-padrao" onClick={restaurarLayoutPadrao}>Layout padrão</button>
      </div>
      <div class={cx('sessao-paineis', arrastando && 'arrastando')} ref={area} data-testid="sessao-paineis">
        {v.map((p, i) => {
          const Corpo = CORPO[p.id];
          return (
            <Fragment key={p.id}>
              <section class="painel" data-painel={p.id} data-testid={`painel-corpo-${p.id}`} style={{ flex: `${p.peso} 1 0` }}>
                <header class="painel-topo"><h3>{ROTULO_DO_PAINEL[p.id]}</h3><span class="espaco" /><button type="button" class="botao-icone-texto" title="Tela cheia (Esc volta)" data-testid={`tela-cheia-${p.id}`} onClick={() => telaCheia(p.id)}>⛶</button></header>
                <div class="painel-corpo"><Corpo /></div>
              </section>
              {i < v.length - 1 && <div class="divisor" role="separator" aria-orientation="vertical" aria-label={`Largura: ${ROTULO_DO_PAINEL[p.id]} e ${ROTULO_DO_PAINEL[v[i + 1]!.id]}`} tabIndex={0} data-testid={`divisor-${i}`} onPointerDown={arrastar(i)} onKeyDown={teclar(i)} />}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
