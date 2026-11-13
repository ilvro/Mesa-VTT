import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  caixaEnvolventeDeItem,
  caixaEnvolventeTotal,
  enquadrar,
  telaParaMundo,
  zoomEm,
  type Caixa,
  type Camera,
  type Ponto,
  type Tamanho,
} from '../../dominio/camera.ts';
import {
  caixaDe,
  contemPonto,
  encaixarNaGrade,
  girar,
  itensNoRetangulo,
  redimensionar,
  type Alca,
} from '../../dominio/geometria.ts';
import {
  docDeTexto,
  novaNotaAdesiva,
  novoTexto,
  textoPuro,
  type Item,
} from '../../dominio/quadro.ts';
import { duplicar } from '../../dominio/quadro-operacoes.ts';
import {
  desfazer,
  executar,
  fecharQuadro,
  historico,
  itemPendente,
  itens,
  mudarFundo,
  quadroAberto,
  refazer,
  renomearQuadro,
  selecao,
} from '../../app/quadros.ts';
import { navegarParaQuadro } from '../../app/rotas.ts';
import { cx } from '../cx.ts';
import { BarraDeFerramentas, type FerramentaQuadro } from './BarraDeFerramentas.tsx';
import { Mundo } from './Mundo.tsx';
import { PainelDoFundo, type ModoRoda } from './PainelDoFundo.tsx';

const CHAVE_RODA = 'mesa:quadro:roda';
const CHAVE_CAMERA = (id: string) => `mesa:quadro-camera:${id}`;
const CAMERA_PADRAO: Camera = { x: -200, y: -150, zoom: 1 };

function novoIdItem(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `it-${crypto.randomUUID()}`;
  }
  return `it-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function lerModoRoda(): ModoRoda {
  try {
    return localStorage.getItem(CHAVE_RODA) === 'rolagem' ? 'rolagem' : 'zoom';
  } catch {
    return 'zoom';
  }
}

function gravarModoRoda(modo: ModoRoda): void {
  try {
    localStorage.setItem(CHAVE_RODA, modo);
  } catch {
    /* ignora */
  }
}

function lerCameraSalva(id: string): Camera {
  try {
    const bruto = localStorage.getItem(CHAVE_CAMERA(id));
    if (!bruto) return CAMERA_PADRAO;
    const obj = JSON.parse(bruto) as Partial<Camera>;
    if (
      typeof obj.x === 'number' &&
      Number.isFinite(obj.x) &&
      typeof obj.y === 'number' &&
      Number.isFinite(obj.y) &&
      typeof obj.zoom === 'number' &&
      Number.isFinite(obj.zoom) &&
      obj.zoom > 0
    ) {
      return { x: obj.x, y: obj.y, zoom: obj.zoom };
    }
  } catch {
    /* ignora */
  }
  return CAMERA_PADRAO;
}

function gravarCamera(id: string, cam: Camera): void {
  try {
    localStorage.setItem(CHAVE_CAMERA(id), JSON.stringify(cam));
  } catch {
    /* ignora */
  }
}

function corFundoClara(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

function estiloGrade(
  fundo: { cor: string; grade: 'nenhuma' | 'pontos' | 'linhas'; passo: number },
  cam: Camera,
): Record<string, string | undefined> {
  const passoTela = fundo.passo * cam.zoom;
  if (fundo.grade === 'nenhuma' || passoTela < 6) {
    return { backgroundColor: fundo.cor };
  }
  const clara = corFundoClara(fundo.cor);
  const traco = clara ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)';
  const ponto = clara ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.2)';
  const ox = ((-cam.x * cam.zoom) % passoTela + passoTela) % passoTela;
  const oy = ((-cam.y * cam.zoom) % passoTela + passoTela) % passoTela;

  const backgroundImage =
    fundo.grade === 'pontos'
      ? `radial-gradient(circle, ${ponto} 1px, transparent 1px)`
      : `linear-gradient(to right, ${traco} 1px, transparent 1px), linear-gradient(to bottom, ${traco} 1px, transparent 1px)`;

  return {
    backgroundColor: fundo.cor,
    backgroundImage,
    backgroundSize: `${passoTela}px ${passoTela}px`,
    backgroundPosition: `${ox}px ${oy}px`,
  };
}

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  const tag = alvo.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo.isContentEditable;
}

function itemNoPonto(mapa: ReadonlyMap<string, Item>, ponto: Ponto): Item | null {
  const ordenados = [...mapa.values()].sort(
    (a, b) => b.z - a.z || b.id.localeCompare(a.id),
  );
  for (const item of ordenados) {
    if (contemPonto(item, ponto)) return item;
  }
  return null;
}

type Gesto =
  | { tipo: 'pan'; x: number; y: number; camX: number; camY: number }
  | { tipo: 'marque'; inicio: Ponto }
  | {
      tipo: 'mover';
      chave: string;
      inicioMundo: Ponto;
      originais: Map<string, { x: number; y: number }>;
    }
  | {
      tipo: 'redimensionar';
      chave: string;
      alca: Alca;
      inicioMundo: Ponto;
      caixaInicial: Caixa;
      originais: Map<string, { x: number; y: number; largura: number; altura: number }>;
    }
  | {
      tipo: 'girar';
      chave: string;
      id: string;
      centro: Ponto;
      anguloInicial: number;
      rotacaoInicial: number;
    };

export function Quadro() {
  const q = quadroAberto.value;
  if (!q) return null;

  const areaRef = useRef<HTMLDivElement>(null);
  const camera = useSignal<Camera>(lerCameraSalva(q.id));
  const tamanhoTela = useSignal<Tamanho>({ largura: 1280, altura: 720 });
  const painelFundoAberto = useSignal(false);
  const ferramenta = useSignal<FerramentaQuadro>('selecionar');
  const espacoPressionado = useSignal(false);
  const modoRoda = useSignal<ModoRoda>(lerModoRoda());
  const editandoId = useSignal<string | null>(null);
  const retanguloSelecao = useSignal<Caixa | null>(null);
  const gestoRef = useRef<Gesto | null>(null);

  useEffect(() => {
    camera.value = lerCameraSalva(q.id);
    editandoId.value = null;
  }, [q.id]);

  useEffect(() => {
    gravarCamera(q.id, camera.value);
  }, [q.id, camera.value]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const atualizarTamanho = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        tamanhoTela.value = { largura: r.width, altura: r.height };
      }
    };
    atualizarTamanho();
    const obs = new ResizeObserver(atualizarTamanho);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const pendenteId = itemPendente.value;
    if (!pendenteId) return;
    const alvo = itens.value.get(pendenteId);
    if (!alvo) return;
    camera.value = enquadrar(caixaEnvolventeDeItem(alvo), tamanhoTela.value, 80);
    selecao.value = new Set([alvo.id]);
    itemPendente.value = null;
  }, [itemPendente.value, itens.value, tamanhoTela.value]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camera.value;
      if (e.ctrlKey || e.metaKey || modoRoda.value === 'zoom') {
        const rect = el.getBoundingClientRect();
        const ponto = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const fator = Math.exp(-e.deltaY * 0.002);
        camera.value = zoomEm(cam, ponto, fator);
      } else {
        camera.value = {
          ...cam,
          x: cam.x + e.deltaX / cam.zoom,
          y: cam.y + e.deltaY / cam.zoom,
        };
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pontoMundoDe = (e: PointerEvent | MouseEvent): Ponto => {
    const rect = areaRef.current!.getBoundingClientRect();
    return telaParaMundo(camera.value, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Atalhos de teclado
  useEffect(() => {
    const verTudo = () => {
      const caixa = caixaEnvolventeTotal(itens.value.values());
      camera.value = caixa ? enquadrar(caixa, tamanhoTela.value, 64) : CAMERA_PADRAO;
    };

    const zoomNoCentro = (novoFatorOuZoom: { fator?: number; zoomExato?: number }) => {
      const cam = camera.value;
      const centro = {
        x: tamanhoTela.value.largura / 2,
        y: tamanhoTela.value.altura / 2,
      };
      const fator =
        novoFatorOuZoom.zoomExato !== undefined
          ? novoFatorOuZoom.zoomExato / cam.zoom
          : (novoFatorOuZoom.fator ?? 1);
      camera.value = zoomEm(cam, centro, fator);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (emCampoDeTexto(e.target)) return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        espacoPressionado.value = true;
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === '0') {
          e.preventDefault();
          zoomNoCentro({ zoomExato: 1 });
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomNoCentro({ fator: 1.25 });
        } else if (e.key === '-') {
          e.preventDefault();
          zoomNoCentro({ fator: 1 / 1.25 });
        } else if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          desfazer();
        } else if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          refazer();
        } else if (k === 'a') {
          e.preventDefault();
          selecao.value = new Set(itens.value.keys());
        } else if (k === 'd') {
          e.preventDefault();
          const sel = [...selecao.value]
            .map((id) => itens.value.get(id))
            .filter((i): i is Item => Boolean(i));
          if (sel.length === 0) return;
          const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
          const passo = duplicar(sel, novoIdItem, { dx: 24, dy: 24 }, {
            agora: Date.now(),
            zBase: maxZ + 1,
          });
          executar(passo);
          const criados = (passo.ops[0] as { criar: Item[] } | undefined)?.criar ?? [];
          selecao.value = new Set(criados.map((i) => i.id));
        }
        return;
      }

      if (e.key === 'Escape') {
        if (editandoId.value) {
          editandoId.value = null;
        } else if (selecao.value.size > 0) {
          selecao.value = new Set();
        } else {
          ferramenta.value = 'selecionar';
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selecao.value.size === 0) return;
        e.preventDefault();
        const remover = [...selecao.value]
          .map((id) => itens.value.get(id))
          .filter((i): i is Item => Boolean(i));
        if (remover.length > 0) {
          executar({ rotulo: 'Remover', ops: [{ remover }] });
          selecao.value = new Set();
        }
        return;
      }

      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        const moviveis = [...selecao.value]
          .map((id) => itens.value.get(id))
          .filter((i): i is Item => Boolean(i))
          .filter((i) => !i.travado);
        if (moviveis.length === 0) return;
        e.preventDefault();
        const passo = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0;
        const dy = e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0;
        const agora = Date.now();
        executar({
          rotulo: 'Mover',
          ops: [
            {
              alterar: moviveis.map((it) => ({
                id: it.id,
                antes: { x: it.x, y: it.y, atualizadoEm: it.atualizadoEm },
                depois: { x: it.x + dx, y: it.y + dy, atualizadoEm: agora },
              })),
            },
          ],
        });
        return;
      }

      if (e.shiftKey && (e.code === 'Digit1' || e.key === '!')) {
        e.preventDefault();
        verTudo();
        return;
      }

      if (!e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v') ferramenta.value = 'selecionar';
        else if (k === 'h') ferramenta.value = ferramenta.value === 'mao' ? 'selecionar' : 'mao';
        else if (k === 't') ferramenta.value = 'texto';
        else if (k === 'n') ferramenta.value = 'nota';
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        espacoPressionado.value = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const modoPanAtivo = ferramenta.value === 'mao' || espacoPressionado.value;

  const iniciarRedimensionar = (alca: Alca, e: PointerEvent) => {
    const moviveis = [...selecao.value]
      .map((id) => itens.value.get(id))
      .filter((i): i is Item => Boolean(i))
      .filter((i) => !i.travado);
    if (moviveis.length === 0) return;

    const el = areaRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const originais = new Map<
      string,
      { x: number; y: number; largura: number; altura: number }
    >();
    for (const it of moviveis) {
      originais.set(it.id, {
        x: it.x,
        y: it.y,
        largura: it.largura,
        altura: it.altura,
      });
      const c = moviveis.length === 1 ? it : caixaDe(it);
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + c.largura > maxX) maxX = c.x + c.largura;
      if (c.y + c.altura > maxY) maxY = c.y + c.altura;
    }

    const chave = `redim-${Date.now()}-${Math.random()}`;
    historico.agrupar(chave);
    gestoRef.current = {
      tipo: 'redimensionar',
      chave,
      alca,
      inicioMundo: pontoMundoDe(e),
      caixaInicial: { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY },
      originais,
    };
  };

  const iniciarGirar = (e: PointerEvent) => {
    if (selecao.value.size !== 1) return;
    const id = [...selecao.value][0]!;
    const item = itens.value.get(id);
    if (!item || item.travado) return;

    const el = areaRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);

    const centro = { x: item.x + item.largura / 2, y: item.y + item.altura / 2 };
    const p = pontoMundoDe(e);
    const anguloInicial = (Math.atan2(p.y - centro.y, p.x - centro.x) * 180) / Math.PI;
    const chave = `girar-${Date.now()}-${Math.random()}`;
    historico.agrupar(chave);
    gestoRef.current = {
      tipo: 'girar',
      chave,
      id,
      centro,
      anguloInicial,
      rotacaoInicial: item.rotacao,
    };
  };

  const aoPressionar = (e: PointerEvent) => {
    const ehBotaoMeio = e.button === 1;
    const ehPanEsquerdo = e.button === 0 && modoPanAtivo;
    if (ehBotaoMeio || ehPanEsquerdo) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      gestoRef.current = {
        tipo: 'pan',
        x: e.clientX,
        y: e.clientY,
        camX: camera.value.x,
        camY: camera.value.y,
      };
      return;
    }

    if (e.button !== 0) return;

    // Se estava editando, o blur do textarea já salva; garante saída
    if (editandoId.value) {
      editandoId.value = null;
    }

    const p = pontoMundoDe(e);
    const encaixar = q.fundo.encaixar;
    const passoGrade = q.fundo.passo;

    if (ferramenta.value === 'texto' || ferramenta.value === 'nota') {
      const agora = Date.now();
      const maxZ = Math.max(0, ...[...itens.value.values()].map((i) => i.z));
      const x = encaixar ? encaixarNaGrade(p.x, passoGrade) : Math.round(p.x);
      const y = encaixar ? encaixarNaGrade(p.y, passoGrade) : Math.round(p.y);
      const novo =
        ferramenta.value === 'nota'
          ? novaNotaAdesiva({ quadroId: q.id, x, y, z: maxZ + 1 }, agora, novoIdItem())
          : novoTexto({ quadroId: q.id, x, y, z: maxZ + 1 }, agora, novoIdItem());
      executar({ rotulo: 'Criar item', ops: [{ criar: [novo] }] });
      selecao.value = new Set([novo.id]);
      ferramenta.value = 'selecionar';
      editandoId.value = novo.id;
      return;
    }

    if (ferramenta.value === 'selecionar') {
      const alvo = itemNoPonto(itens.value, p);
      if (alvo) {
        if (e.shiftKey) {
          const prox = new Set(selecao.value);
          if (prox.has(alvo.id)) prox.delete(alvo.id);
          else prox.add(alvo.id);
          selecao.value = prox;
          return;
        }
        if (!selecao.value.has(alvo.id)) {
          selecao.value = new Set([alvo.id]);
        }
        const moviveis = [...selecao.value]
          .map((id) => itens.value.get(id))
          .filter((i): i is Item => Boolean(i))
          .filter((i) => !i.travado);
        if (moviveis.length === 0) return;

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const originais = new Map<string, { x: number; y: number }>();
        for (const it of moviveis) {
          originais.set(it.id, { x: it.x, y: it.y });
        }
        const chave = `mover-${Date.now()}-${Math.random()}`;
        historico.agrupar(chave);
        gestoRef.current = {
          tipo: 'mover',
          chave,
          inicioMundo: p,
          originais,
        };
      } else {
        if (!e.shiftKey) {
          selecao.value = new Set();
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        gestoRef.current = { tipo: 'marque', inicio: p };
        retanguloSelecao.value = { x: p.x, y: p.y, largura: 0, altura: 0 };
      }
    }
  };

  const aoMover = (e: PointerEvent) => {
    const g = gestoRef.current;
    if (!g) return;
    const cam = camera.value;

    if (g.tipo === 'pan') {
      camera.value = {
        ...cam,
        x: g.camX - (e.clientX - g.x) / cam.zoom,
        y: g.camY - (e.clientY - g.y) / cam.zoom,
      };
      return;
    }

    const p = pontoMundoDe(e);

    if (g.tipo === 'marque') {
      const ret: Caixa = {
        x: g.inicio.x,
        y: g.inicio.y,
        largura: p.x - g.inicio.x,
        altura: p.y - g.inicio.y,
      };
      retanguloSelecao.value = ret;
      const achados = itensNoRetangulo(
        itens.value.values(),
        ret,
        e.altKey ? 'conter' : 'tocar',
      );
      selecao.value = new Set(achados.map((i) => i.id));
      return;
    }

    if (g.tipo === 'mover') {
      let dx = p.x - g.inicioMundo.x;
      let dy = p.y - g.inicioMundo.y;
      if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const agora = Date.now();
      const alterar: { id: string; antes: Partial<Item>; depois: Partial<Item> }[] = [];
      for (const [id, orig] of g.originais) {
        const atual = itens.value.get(id);
        if (!atual) continue;
        let nx = orig.x + dx;
        let ny = orig.y + dy;
        if (q.fundo.encaixar) {
          nx = encaixarNaGrade(nx, q.fundo.passo);
          ny = encaixarNaGrade(ny, q.fundo.passo);
        }
        if (nx !== atual.x || ny !== atual.y) {
          alterar.push({
            id,
            antes: { x: atual.x, y: atual.y, atualizadoEm: atual.atualizadoEm },
            depois: { x: nx, y: ny, atualizadoEm: agora },
          });
        }
      }
      if (alterar.length > 0) {
        executar({ rotulo: 'Mover', ops: [{ alterar }] }, g.chave);
      }
      return;
    }

    if (g.tipo === 'redimensionar') {
      const delta = { x: p.x - g.inicioMundo.x, y: p.y - g.inicioMundo.y };
      const novaCaixa = redimensionar(g.caixaInicial, g.alca, delta, {
        manterProporcao: e.shiftKey,
        doCentro: e.altKey,
        minTamanho: 20,
      });
      if (q.fundo.encaixar) {
        novaCaixa.x = encaixarNaGrade(novaCaixa.x, q.fundo.passo);
        novaCaixa.y = encaixarNaGrade(novaCaixa.y, q.fundo.passo);
        novaCaixa.largura = Math.max(
          20,
          encaixarNaGrade(novaCaixa.largura, q.fundo.passo),
        );
        novaCaixa.altura = Math.max(
          20,
          encaixarNaGrade(novaCaixa.altura, q.fundo.passo),
        );
      }

      const escalaX = novaCaixa.largura / Math.max(1, g.caixaInicial.largura);
      const escalaY = novaCaixa.altura / Math.max(1, g.caixaInicial.altura);
      const agora = Date.now();
      const alterar: { id: string; antes: Partial<Item>; depois: Partial<Item> }[] = [];

      for (const [id, orig] of g.originais) {
        const atual = itens.value.get(id);
        if (!atual) continue;
        const nx = novaCaixa.x + (orig.x - g.caixaInicial.x) * escalaX;
        const ny = novaCaixa.y + (orig.y - g.caixaInicial.y) * escalaY;
        const nl = Math.max(20, orig.largura * escalaX);
        const na = Math.max(20, orig.altura * escalaY);
        alterar.push({
          id,
          antes: {
            x: atual.x,
            y: atual.y,
            largura: atual.largura,
            altura: atual.altura,
            atualizadoEm: atual.atualizadoEm,
          },
          depois: {
            x: nx,
            y: ny,
            largura: nl,
            altura: na,
            atualizadoEm: agora,
          },
        });
      }
      if (alterar.length > 0) {
        executar({ rotulo: 'Redimensionar', ops: [{ alterar }] }, g.chave);
      }
      return;
    }

    if (g.tipo === 'girar') {
      const atual = itens.value.get(g.id);
      if (!atual) return;
      const angulo = (Math.atan2(p.y - g.centro.y, p.x - g.centro.x) * 180) / Math.PI;
      const novaRotacao = girar(
        atual,
        g.rotacaoInicial + (angulo - g.anguloInicial),
        e.shiftKey,
      );
      if (novaRotacao !== atual.rotacao) {
        executar(
          {
            rotulo: 'Girar',
            ops: [
              {
                alterar: [
                  {
                    id: g.id,
                    antes: { rotacao: atual.rotacao, atualizadoEm: atual.atualizadoEm },
                    depois: { rotacao: novaRotacao, atualizadoEm: Date.now() },
                  },
                ],
              },
            ],
          },
          g.chave,
        );
      }
    }
  };

  const aoSoltar = (e: PointerEvent) => {
    const g = gestoRef.current;
    if (!g) return;
    gestoRef.current = null;
    if (g.tipo === 'marque') {
      retanguloSelecao.value = null;
    } else if (g.tipo === 'mover' || g.tipo === 'redimensionar' || g.tipo === 'girar') {
      historico.agrupar(null);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignora */
    }
  };

  const aoDuploClique = (e: MouseEvent) => {
    if (ferramenta.value !== 'selecionar') return;
    const p = pontoMundoDe(e);
    const alvo = itemNoPonto(itens.value, p);
    if (alvo && alvo.tipo === 'texto' && !alvo.travado) {
      selecao.value = new Set([alvo.id]);
      editandoId.value = alvo.id;
    }
  };

  const aoSairEdicao = (id: string, novoTexto?: string) => {
    if (editandoId.value === id) {
      editandoId.value = null;
    }
    if (novoTexto === undefined) return;
    const atual = itens.value.get(id);
    if (!atual || atual.tipo !== 'texto') return;
    if (textoPuro(atual.doc) === novoTexto) return;
    executar({
      rotulo: 'Editar texto',
      ops: [
        {
          alterar: [
            {
              id,
              antes: { doc: atual.doc, atualizadoEm: atual.atualizadoEm },
              depois: { doc: docDeTexto(novoTexto), atualizadoEm: Date.now() },
            },
          ],
        },
      ],
    });
  };

  return (
    <section class="tela-quadro" data-testid="tela-quadro">
      <div class="barra-quadro" data-testid="barra-quadro">
        <button
          type="button"
          class="botao-pilula"
          data-testid="voltar-quadros"
          onClick={() => {
            void fecharQuadro().then(() => navegarParaQuadro(null));
          }}
        >
          ← Quadros
        </button>
        <input
          type="text"
          class="quadro-nome-input"
          aria-label="Nome do quadro"
          data-testid="quadro-nome"
          value={q.nome}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== q.nome) {
              void renomearQuadro(q.id, v);
            } else {
              e.currentTarget.value = q.nome;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <span class="espaco" />
        <button
          type="button"
          class="botao-pilula"
          aria-pressed={painelFundoAberto.value}
          data-testid="botao-fundo"
          onClick={() => {
            painelFundoAberto.value = !painelFundoAberto.value;
          }}
        >
          Fundo e grade
        </button>
        <button
          type="button"
          class="selo"
          title="Clique para voltar a 100% (Ctrl+0)"
          data-testid="quadro-zoom"
          onClick={() => {
            const cam = camera.value;
            const centro = {
              x: tamanhoTela.value.largura / 2,
              y: tamanhoTela.value.altura / 2,
            };
            camera.value = zoomEm(cam, centro, 1 / cam.zoom);
          }}
        >
          {Math.round(camera.value.zoom * 100)}%
        </button>
      </div>

      <div
        ref={areaRef}
        class={cx(
          'area-quadro',
          modoPanAtivo && 'modo-mao',
          (ferramenta.value === 'texto' || ferramenta.value === 'nota') && 'modo-criar',
        )}
        data-testid="area-quadro"
        style={estiloGrade(q.fundo, camera.value)}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onDblClick={aoDuploClique}
      >
        <Mundo
          camera={camera.value}
          tamanhoTela={tamanhoTela.value}
          itens={itens.value}
          selecao={selecao.value}
          editandoId={editandoId.value}
          retanguloSelecao={retanguloSelecao.value}
          onSairEdicao={aoSairEdicao}
          onIniciarRedimensionar={iniciarRedimensionar}
          onIniciarGirar={iniciarGirar}
        />

        <div
          onPointerDown={(e) => e.stopPropagation()}
          onDblClick={(e) => e.stopPropagation()}
        >
          <BarraDeFerramentas
            ativa={ferramenta.value}
            onEscolher={(f) => {
              ferramenta.value = f;
            }}
          />
        </div>

        {painelFundoAberto.value ? (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onDblClick={(e) => e.stopPropagation()}
          >
            <PainelDoFundo
              fundo={q.fundo}
              roda={modoRoda.value}
              onMudarFundo={(parcial) => {
                void mudarFundo(parcial);
              }}
              onMudarRoda={(modo) => {
                modoRoda.value = modo;
                gravarModoRoda(modo);
              }}
              onFechar={() => {
                painelFundoAberto.value = false;
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
