import { useEffect, useState } from 'preact/hooks';
import { iniciarOuvinteDesafioLocal } from '../app/desafios.ts';
import { baseDoApp } from '../app/inventario.ts';
import type { DesafioAtivo } from '../dominio/desafios.ts';
import { urlDoProjetor } from '../dominio/desktop.ts';
import { OverlayDesafio } from '../jogar/OverlayDesafio.tsx';

/**
 * Telão local presencial (`#/telao`, `#/telao?mapa=<id>`, `#/telao/<id>`):
 * exibe em tela cheia o projetor do Atlas com os overlays de desafios por cima, sem cabeçalho do mestre.
 */
export function TelaoLocal({ mapaId }: { mapaId: string | null }) {
  const [desafio, setDesafio] = useState<DesafioAtivo | null>(null);

  useEffect(() => iniciarOuvinteDesafioLocal(setDesafio), []);

  const srcProjetor = urlDoProjetor(baseDoApp('atlas'), mapaId);

  return (
    <div
      data-testid="telao-local"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0b0e',
        overflow: 'hidden',
      }}
    >
      <iframe
        title="Projetor do Atlas"
        data-testid="telao-local-iframe"
        src={srcProjetor}
        allow="fullscreen; autoplay"
        style={{
          width: '100%',
          height: '100%',
          border: 0,
          display: 'block',
        }}
      />
      <OverlayDesafio desafio={desafio} modo="telao" />
    </div>
  );
}
