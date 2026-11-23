import { useEffect, useState } from 'preact/hooks';
import { enquadrar } from '../../dominio/camera.ts';
import { entidadePorRef } from '../../dominio/cenas.ts';
import { docParaHtml } from '../../dominio/doc-rico.ts';
import { areaUtil, caminhoDaForma } from '../../dominio/formas.ts';
import { familiaCss } from '../../dominio/fontes.ts';
import { PALETA_PADRAO, fundoEfetivo } from '../../dominio/paleta.ts';
import type { ItemParaJogadores } from '../../dominio/projecao.ts';
import { ROTULO_DO_TIPO } from '../../dominio/entidades.ts';
import { entidades } from '../../app/campanha.ts';
import { iniciarJanelaDeProjecao, vistaDaProjecao } from '../../app/projecao.ts';
import { projecaoQuadroId } from '../../app/rotas.ts';
import { ItemImagem } from './ItemImagem.tsx';
import { ItemSeta } from './ItemSeta.tsx';
import { ItemTraco } from './ItemTraco.tsx';
import { estiloCaixaCss } from './Item.tsx';
import { ALINHAMENTO_CSS, VERTICAL_CSS } from './TextoDecorado.tsx';

/**
 * O que os jogadores veem. Só desenha o que `itensParaJogadores` devolveu (ver `app/projecao.ts`):
 * sem `decorar` (nada de chips nem condições), sem ✓, sem selo de âncora, sem contorno de revisão,
 * sem seleção e sem interação. Cartões de entidade mostram só nome e retrato.
 */

function posicao(item: ItemParaJogadores) {
  return {
    left: `${item.x}px`,
    top: `${item.y}px`,
    width: `${item.largura}px`,
    height: item.tipo === 'texto' && item.alturaAuto ? 'auto' : `${item.altura}px`,
    minHeight: item.tipo === 'texto' && item.alturaAuto ? `${item.altura}px` : undefined,
    zIndex: item.z,
    transform: item.rotacao ? `rotate(${item.rotacao}deg)` : undefined,
  };
}

function Retrato({ nome, blob }: { nome: string; blob?: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? (
    <img src={url} alt={nome} class="elenco-retrato" />
  ) : (
    <span class="elenco-retrato elenco-retrato-vazio" aria-hidden="true">{nome.slice(0, 1).toUpperCase()}</span>
  );
}

function Desenho({ item, todos }: { item: ItemParaJogadores; todos: ReadonlyMap<string, ItemParaJogadores> }) {
  switch (item.tipo) {
    case 'texto':
      return (
        <div
          class="item-quadro item-texto"
          data-item-id={item.id}
          style={{ ...posicao(item), ...estiloCaixaCss(item, PALETA_PADRAO) }}
        >
          <div class="item-texto-conteudo doc-rico-html" dangerouslySetInnerHTML={{ __html: docParaHtml(item.doc) }} />
        </div>
      );
    case 'forma': {
      const c = item.caixa;
      const fundo = fundoEfetivo(item, PALETA_PADRAO);
      const util = areaUtil(item.forma, { x: 0, y: 0, largura: item.largura, altura: item.altura });
      const tracos =
        c.tracejado === 'tracejado'
          ? `${Math.max(4, c.espessuraBorda * 3)} ${Math.max(3, c.espessuraBorda * 2)}`
          : c.tracejado === 'pontilhado'
            ? `${Math.max(1, c.espessuraBorda)} ${Math.max(3, c.espessuraBorda * 2)}`
            : undefined;
      return (
        <div class="item-quadro item-forma" data-item-id={item.id} style={{ ...posicao(item), filter: c.sombra ? 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.35))' : undefined }}>
          <svg class="item-forma-svg" width={item.largura} height={item.altura} viewBox={`0 0 ${Math.max(1, item.largura)} ${Math.max(1, item.altura)}`}>
            <path d={caminhoDaForma(item.forma, item.largura, item.altura, c.raio)} fill={fundo ?? 'transparent'} fill-opacity={fundo ? c.opacidade : 0} stroke={c.borda ?? 'none'} stroke-width={c.espessuraBorda} stroke-dasharray={tracos} />
          </svg>
          <div
            class="item-forma-conteudo"
            style={{
              left: `${util.x}px`,
              top: `${util.y}px`,
              width: `${util.largura}px`,
              height: `${util.altura}px`,
              padding: `${c.padding}px`,
              color: item.texto.cor,
              fontFamily: familiaCss(item.texto.fonte),
              fontSize: `${item.texto.tamanho}px`,
              textAlign: ALINHAMENTO_CSS[item.texto.alinhamento],
              justifyContent: VERTICAL_CSS[item.texto.vertical],
            }}
          >
            <div class="item-texto-conteudo doc-rico-html" dangerouslySetInnerHTML={{ __html: docParaHtml(item.doc) }} />
          </div>
        </div>
      );
    }
    case 'imagem':
      return <ItemImagem item={item} />;
    case 'traco':
      return <ItemTraco item={item} />;
    case 'seta':
      return <ItemSeta item={item} itens={todos} editando={false} onSairRotulo={() => {}} />;
    case 'moldura': {
      const c = item.caixa;
      return (
        <div
          class="projecao-moldura"
          data-item-id={item.id}
          style={{
            left: `${item.x}px`,
            top: `${item.y}px`,
            width: `${item.largura}px`,
            height: `${item.altura}px`,
            borderRadius: `${c.raio}px`,
            backgroundColor: c.fundo ?? undefined,
            opacity: c.opacidade,
            border: c.espessuraBorda > 0 && c.borda ? `${c.espessuraBorda}px solid ${c.borda}` : undefined,
          }}
        />
      );
    }
    case 'ref': {
      const e = entidadePorRef(item.ref, entidades.value);
      if (!e) return null; // sem a entidade, nada a mostrar (o id do Ref não é para os jogadores)
      return (
        <div class="item-quadro item-ref projecao-ref" data-item-id={item.id} style={posicao(item)}>
          <div class="item-ref-topo">
            <Retrato nome={e.nome} blob={e.retrato} />
            <div class="item-ref-titulos">
              <div class="item-ref-nome">{e.nome}</div>
              <div class="meta">{ROTULO_DO_TIPO[e.tipo].singular}</div>
            </div>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

export function ProjecaoDoQuadro() {
  const [tela, setTela] = useState({ largura: window.innerWidth, altura: window.innerHeight });

  useEffect(() => iniciarJanelaDeProjecao(() => projecaoQuadroId.peek()), []);
  useEffect(() => {
    const aoRedimensionar = () => setTela({ largura: window.innerWidth, altura: window.innerHeight });
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  const vista = vistaDaProjecao.value;
  if (!vista) return <div class="projecao projecao-preta" data-testid="projecao" data-estado="parada" />;

  const raiz = vista.itens.find((i) => i.id === vista.molduraId)!;
  const camera = enquadrar({ x: raiz.x, y: raiz.y, largura: raiz.largura, altura: raiz.altura }, tela, 24, 0.02, 8);
  const todos = new Map(vista.itens.map((i) => [i.id, i]));
  const ordenados = [...vista.itens].sort(
    (a, b) => (a.tipo === 'moldura' ? 0 : 1) - (b.tipo === 'moldura' ? 0 : 1) || a.z - b.z || (a.id < b.id ? -1 : 1),
  );

  return (
    <div class="projecao" data-testid="projecao" data-estado="projetando" style={{ backgroundColor: vista.quadro.fundo.cor }}>
      <div
        class="mundo-quadro"
        style={{ transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`, transformOrigin: '0 0' }}
      >
        {ordenados.map((item) => (
          <Desenho key={item.id} item={item} todos={todos} />
        ))}
      </div>
    </div>
  );
}
