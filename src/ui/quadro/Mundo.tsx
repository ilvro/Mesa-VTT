import { useMemo } from 'preact/hooks';
import {
  caixaVisivel,
  itensVisiveis,
  type Caixa,
  type Camera,
  type Tamanho,
} from '../../dominio/camera.ts';
import type { Alca } from '../../dominio/geometria.ts';
import type { Item as ItemModelo } from '../../dominio/quadro.ts';
import { Item } from './Item.tsx';
import { Selecao } from './Selecao.tsx';

interface MundoProps {
  camera: Camera;
  tamanhoTela: Tamanho;
  itens: ReadonlyMap<string, ItemModelo>;
  selecao: ReadonlySet<string>;
  editandoId: string | null;
  retanguloSelecao: Caixa | null;
  onSairEdicao: (id: string, novoTexto?: string) => void;
  onIniciarRedimensionar: (alca: Alca, e: PointerEvent) => void;
  onIniciarGirar: (e: PointerEvent) => void;
}

export function Mundo({
  camera,
  tamanhoTela,
  itens,
  selecao,
  editandoId,
  retanguloSelecao,
  onSairEdicao,
  onIniciarRedimensionar,
  onIniciarGirar,
}: MundoProps) {
  const visiveis = useMemo(() => {
    const caixa = caixaVisivel(camera, tamanhoTela);
    const margem = 120 / Math.max(0.02, camera.zoom);
    return itensVisiveis(itens.values(), caixa, margem).sort(
      (a, b) => a.z - b.z || a.id.localeCompare(b.id),
    );
  }, [camera, tamanhoTela, itens]);

  const selecionados = useMemo(() => {
    const lista: ItemModelo[] = [];
    for (const id of selecao) {
      const it = itens.get(id);
      if (it) lista.push(it);
    }
    return lista;
  }, [selecao, itens]);

  return (
    <div
      class="mundo-quadro"
      data-testid="mundo-quadro"
      style={{
        transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {visiveis.map((item) => (
        <Item
          key={item.id}
          item={item}
          editando={editandoId === item.id}
          onSairEdicao={(novoTexto) => onSairEdicao(item.id, novoTexto)}
        />
      ))}
      <Selecao
        selecionados={selecionados}
        zoom={camera.zoom}
        retanguloSelecao={retanguloSelecao}
        onIniciarRedimensionar={onIniciarRedimensionar}
        onIniciarGirar={onIniciarGirar}
      />
    </div>
  );
}
