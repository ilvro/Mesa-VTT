import { useEffect, useRef } from 'preact/hooks';
import { apagarTreino, campanhaDeTreino, iniciarLicao, tutor, voltarACampanha } from '../app/tutoriais.ts';
import { LICOES } from '../tutorial/licoes.ts';
import type { Acao, Passo } from '../tutorial/tutor.ts';

const acoesDe = (p: Passo): readonly Acao[] => (p.acao ? (Array.isArray(p.acao[0]) || (p.acao as readonly unknown[]).length === 0 ? p.acao : [p.acao]) as readonly Acao[] : []);
const mostrarNumero = (v: string): string => (/^-?\d+(\.\d+)?$/.test(v) ? v.replace('.', ',') : v);

/** Os valores que um passo pede: os escritos à mão, ou o rótulo de cada campo e o que vai nele (saem das ações do teste). */
function valoresDoPasso(p: Passo): string {
  if (p.valores) return p.valores;
  const rotuloDe = (seletor: string): string | null => document.querySelector(seletor)?.closest('[data-campo]')?.getAttribute('data-campo') ?? null;
  return acoesDe(p).filter(a => a[0] === 'preencher' || a[0] === 'escolher').map(a => { const r = rotuloDe(a[1]); return r ? `<b>${r}</b>: ${mostrarNumero((a as readonly [string, string, string])[2])}` : ''; }).filter(Boolean).join(' · ');
}

type Caixa = { left: number; top: number; right: number; bottom: number };

/** O tutor sobre a interface de verdade: anel no alvo, o cartão do passo (com ajuda em degraus) e o cartão final. Nunca faz o passo pela pessoa. */
export function Tutor() {
  void tutor.versao.value;
  const info = tutor.info(), fim = tutor.fim.value, passo = tutor.passo(), treino = campanhaDeTreino.value;
  const anel = useRef<HTMLDivElement>(null), cartao = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!tutor.info()) return;
    let quadro = 0, perdido = 0, ultimo = -1;
    const laco = () => {
      quadro = requestAnimationFrame(laco);
      const p = tutor.passo(); if (!p) return;
      if (tutor.info()!.indice !== ultimo) { ultimo = tutor.info()!.indice; perdido = 0; }
      if (tutor.tique()) return;
      const sozinho = !!p.tentar && !tutor.ajuda().mostrouOnde;
      const alvo = p.alvo && !sozinho ? document.querySelector(p.alvo) : null, r = anel.current, c = cartao.current;
      // Um campo (input, select) é apontado com o rótulo junto.
      const area = alvo && alvo.matches('input, select, textarea') ? alvo.closest('[data-campo]') ?? alvo : alvo, caixa = area ? area.getBoundingClientRect() : null;
      const visivel = !!caixa && caixa.width > 0 && caixa.bottom > 0 && caixa.top < innerHeight;
      if (alvo && !visivel && caixa && caixa.width > 0) alvo.scrollIntoView({ block: 'center' });
      if (r) {
        r.hidden = !visivel;
        if (visivel && caixa) { const pad = 5; Object.assign(r.style, { left: `${caixa.left - pad}px`, top: `${caixa.top - pad}px`, width: `${caixa.width + pad * 2}px`, height: `${caixa.height + pad * 2}px` }); }
        r.classList.toggle('insiste', tutor.ajuda().insiste);
      }
      // O alvo sumiu da tela por um tempo: avisa uma vez e o cartão mostra a saída.
      const sumiu = !!p.alvo && !sozinho && !visivel; perdido = sumiu ? perdido + 1 : 0;
      if (perdido === 90) tutor.perdido();
      c?.querySelector<HTMLElement>('.tutor-perdido')?.toggleAttribute('hidden', perdido < 90);
      // O cartão procura um lugar que não cubra o alvo.
      if (c) {
        const w = c.offsetWidth, h = c.offsetHeight, folga = 16, M = 12, livre: Caixa[] = visivel && caixa ? [{ left: caixa.left - 8, top: caixa.top - 8, right: caixa.right + 8, bottom: caixa.bottom + 8 }] : [];
        const candidatos: [number, number][] = [];
        if (visivel && caixa) candidatos.push([caixa.right + folga, caixa.top], [caixa.right + folga, innerHeight - h - 60], [caixa.left, caixa.bottom + folga], [caixa.left - folga - w, caixa.top], [caixa.left, caixa.top - folga - h]);
        candidatos.push([innerWidth - w - 24, innerHeight - h - 60], [innerWidth - w - 320, innerHeight - h - 60], [innerWidth - w - 24, 70], [innerWidth / 2 - w / 2, innerHeight - h - 60], [24, innerHeight - h - 60], [24, 70]);
        const cabeTela = ([x, y]: [number, number]) => x >= M && y >= M && x + w <= innerWidth - M && y + h <= innerHeight - M;
        const cabeTudo = (pos: [number, number]) => cabeTela(pos) && !livre.some(b => pos[0] < b.right && pos[0] + w > b.left && pos[1] < b.bottom && pos[1] + h > b.top);
        const [esq, topo] = candidatos.find(cabeTudo) ?? candidatos.find(cabeTela) ?? [innerWidth - w - 24, innerHeight - h - 60];
        c.style.left = `${Math.round(esq)}px`; c.style.top = `${Math.round(topo)}px`;
      }
    };
    quadro = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(quadro);
  }, [info?.id, info ? true : false]);

  if (fim) {
    const proxima = fim.proxima ? LICOES.find(l => l.id === fim.proxima) : null;
    return (
      <div class="tutor" data-testid="tutor-fim">
        <section class="tutor-cartao fim" role="dialog" aria-label="Tutorial">
          <header><span class="eyebrow">{fim.titulo}</span><button type="button" class="quieto" data-testid="tutor-fechar" onClick={() => tutor.fecharFim()}>Fechar</button></header>
          <p class="tutor-diga">{fim.concluida ? 'Concluído.' : 'Você saiu do tutorial. O progresso fica guardado.'}</p>
          {fim.aprendeu.length > 0 && <><p class="tutor-porque">O que você aprendeu:</p><ul class="tutor-aprendeu">{fim.aprendeu.map((a, i) => <li key={i}>{typeof a === 'string' ? a : <><kbd>{a[0]}</kbd> {a[1]}</>}</li>)}</ul></>}
          {treino && <p class="tutor-porque">Esta lição aconteceu na campanha de treino “{treino.nome}”. A sua campanha não foi tocada.</p>}
          <footer>
            {treino && <button type="button" class="botao-pilula" data-testid="tutor-apagar-treino" onClick={() => { void apagarTreino(); }}>Apagar o treino</button>}
            {treino && <button type="button" class="botao-pilula" data-testid="tutor-voltar-campanha" onClick={() => { void voltarACampanha(); }}>Voltar à minha campanha</button>}
            {proxima && <button type="button" class="botao-pilula destaque" data-testid="tutor-proxima" onClick={() => { tutor.fecharFim(); void iniciarLicao(proxima.id); }}>Próxima: {proxima.titulo}</button>}
          </footer>
        </section>
      </div>
    );
  }
  if (!info || !passo) return null;
  const ajuda = tutor.ajuda(), ultimo = info.indice === info.total - 1, espera = passo.feito[0] === 'ler';
  const etapa = LICOES.find(x => x.id === info.id)?.passos.slice(0, info.indice + 1).findLast(p => p.etapa)?.etapa ?? null;
  const valores = ajuda.valores ? valoresDoPasso(passo) : '';
  return (
    <div class="tutor" data-testid="tutor" data-passo={info.indice} data-licao={info.id}>
      <div class="tutor-anel" ref={anel} hidden data-testid="tutor-anel" />
      <section class="tutor-cartao" ref={cartao} role="dialog" aria-live="polite" aria-label="Tutorial" data-testid="tutor-cartao">
        <header><span class="eyebrow">{info.titulo} · {info.indice + 1} de {info.total}</span><button type="button" class="quieto" data-testid="tutor-sair" onClick={() => tutor.parar()} aria-label="Sair do tutorial">Sair</button></header>
        <div class="tutor-progresso"><i style={{ width: `${((info.indice + 1) / info.total) * 100}%` }} /></div>
        {etapa && <p class="tutor-etapa">{etapa}</p>}
        {passo.tentar && <p class="tutor-sozinho">Agora sozinho</p>}
        <p class="tutor-diga" data-testid="tutor-diga" dangerouslySetInnerHTML={{ __html: passo.diga }} />
        {passo.porque && <p class="tutor-porque" dangerouslySetInnerHTML={{ __html: passo.porque }} />}
        {valores && <p class="tutor-valores" data-testid="tutor-valores" dangerouslySetInnerHTML={{ __html: valores }} />}
        <p class="tutor-perdido" hidden>Não encontrei este controle na tela. Siga a instrução acima; se não der, pule o passo.</p>
        {ajuda.oferecer && <div class="tutor-ajuda">
          {passo.tentar && passo.alvo && !ajuda.mostrouOnde && <button type="button" class="quieto" data-testid="tutor-onde" onClick={() => tutor.mostrarOnde()}>Mostrar onde</button>}
          {!ajuda.valores && valoresDoPasso(passo) !== '' && <button type="button" class="quieto" data-testid="tutor-valores-botao" onClick={() => tutor.pedirValores()}>Mostrar os valores</button>}
        </div>}
        <footer>
          <button type="button" class="quieto" data-testid="tutor-voltar" disabled={info.indice === 0} onClick={() => tutor.voltar()}>Voltar</button>
          {!espera && <button type="button" class="quieto" data-testid="tutor-pular" onClick={() => tutor.pular()}>Pular</button>}
          {espera && <button type="button" class="botao-pilula destaque" data-testid="tutor-continuar" onClick={() => tutor.continuar()}>{ultimo ? 'Concluir' : 'Continuar'}</button>}
        </footer>
      </section>
    </div>
  );
}
