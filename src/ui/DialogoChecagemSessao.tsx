import { useEffect, useState } from 'preact/hooks';
import { mesmaRef, type Entidade, type Ref } from '#mesa';
import { campanhaAtiva, entidades, ligacoes, alternarPersonagemNoElenco } from '../app/campanha.ts';
import { sessaoAtiva } from '../app/registro.ts';
import { abrirNoApp } from '../app/barramento.ts';
import { abrirEntidade, tela } from '../app/rotas.ts';
import { extrairPacoteDeCena, type PacoteDeCena } from '../dominio/cenas.ts';
import { carregarFatos } from '../app/prontidao.ts';
import { pendenciasDaCena, type Pendencia } from '../dominio/prontidao.ts';

export function DialogoChecagemSessao({ aoFechar }: { aoFechar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [itensPorCena, setItensPorCena] = useState<
    { cena: Entidade; pacote: PacoteDeCena; pendencias: Pendencia[] }[]
  >([]);

  const atualizar = async () => {
    const c = campanhaAtiva.value;
    const s = sessaoAtiva.value;
    if (!c || !s) {
      setItensPorCena([]);
      setCarregando(false);
      return;
    }

    const ents = entidades.value;
    const ligs = ligacoes.value;

    const cenasDaSessao: { cena: Entidade; pacote: PacoteDeCena }[] = [];
    for (const item of s.roteiro) {
      let ent: Entidade | undefined;
      if (item.app === 'mesa' && item.tipo === 'entidade') {
        ent = ents.find(e => e.id === item.id);
      } else {
        ent = ents.find(e => e.refs.some(r => mesmaRef(r, item)));
      }
      if (ent && ent.tipo === 'cena') {
        const pacote = extrairPacoteDeCena(ent, ents, ligs);
        cenasDaSessao.push({ cena: ent, pacote });
      }
    }

    const pacotes = cenasDaSessao.map(x => x.pacote);
    const fatos = await carregarFatos(c, pacotes);

    const agrupados = cenasDaSessao.map(({ cena, pacote }) => {
      const pends = pendenciasDaCena(pacote, fatos);
      return { cena, pacote, pendencias: pends };
    });

    setItensPorCena(agrupados);
    setCarregando(false);
  };

  useEffect(() => {
    void atualizar();
  }, []);

  const totalPendencias = itensPorCena.reduce((acc, curr) => acc + curr.pendencias.length, 0);

  const executarAcao = async (
    pend: Pendencia,
    pacote: PacoteDeCena
  ) => {
    const c = campanhaAtiva.value;
    if (pend.tipo === 'sem-mapa' || pend.tipo === 'momento-sem-mapa') {
      abrirEntidade(pend.cenaId);
      tela.value = 'entidades';
      aoFechar();
      return;
    }

    if (pend.tipo === 'trilha-incompleta' || pend.tipo === 'trilha-desconhecida') {
      if (pacote.trilha) {
        void abrirNoApp(pacote.trilha.ref);
      }
      return;
    }

    if (pend.tipo === 'documento-nao-entregue') {
      const pista = pacote.pistas.find(p => (p.entidade?.id ?? p.ref.id) === pend.entidadeId || p.ref.id === pend.entidadeId);
      if (pista) {
        void abrirNoApp(pista.ref);
      }
      return;
    }

    if (pend.tipo === 'fora-do-elenco' && c) {
      await alternarPersonagemNoElenco(c, pend.entidadeId);
      await atualizar();
    }
  };

  return (
    <div
      class="dialogo-fundo"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      data-testid="dialogo-prontidao"
    >
      <div
        class="dialogo-cartao"
        style={{
          background: 'var(--superficie-1, #1e1e24)',
          border: '1px solid var(--linha, #333)',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 class="faixa" style={{ margin: 0 }}>Pronto para jogar?</h3>
          <button
            type="button"
            class="botao-icone-texto"
            aria-label="Fechar"
            onClick={aoFechar}
          >
            ✕
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {carregando ? (
            <div class="carregando">Verificando preparação da sessão…</div>
          ) : totalPendencias === 0 ? (
            <div class="aviso suave" style={{ display: 'flex', alignItems: 'center', gap: '10px' }} data-testid="sessao-tudo-pronto">
              <span style={{ fontSize: '20px' }}>✓</span>
              <span><b>Tudo pronto!</b> Todas as cenas da sessão têm mapas, trilhas carregadas, documentos e elenco preparados.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} data-testid="lista-pendencias">
              {itensPorCena
                .filter(item => item.pendencias.length > 0)
                .map(({ cena, pacote, pendencias }) => (
                  <div
                    key={cena.id}
                    style={{
                      border: '1px solid var(--linha)',
                      borderRadius: '6px',
                      padding: '12px',
                      background: 'var(--superficie-2)',
                    }}
                    data-testid={`pendencias-cena-${cena.id}`}
                  >
                    <h4 style={{ margin: '0 0 10px', fontSize: '15px' }}>
                      🎬 {cena.nome}
                    </h4>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {pendencias.map((pend, idx) => (
                        <li
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            fontSize: '13px',
                          }}
                          data-testid={`pendencia-${pend.tipo}`}
                        >
                          <span>
                            {pend.tipo === 'sem-mapa' && 'Sem mapa vinculado'}
                            {pend.tipo === 'momento-sem-mapa' && 'Momento de abertura configurado, mas sem mapa'}
                            {pend.tipo === 'trilha-incompleta' && `Trilha sonora incompleta: faltam ${pend.faltando} de ${pend.total} faixa(s)`}
                            {pend.tipo === 'trilha-desconhecida' && 'Trilha sonora desconhecida (sem resposta do Jukebox)'}
                            {pend.tipo === 'documento-nao-entregue' && `Documento não entregue: ${pend.nome}`}
                            {pend.tipo === 'fora-do-elenco' && `Personagem fora do elenco: ${pend.nome}`}
                          </span>
                          <button
                            type="button"
                            class="botao-pilula"
                            style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                            onClick={() => void executarAcao(pend, pacote)}
                          >
                            {(pend.tipo === 'sem-mapa' || pend.tipo === 'momento-sem-mapa') && 'Editar cena'}
                            {(pend.tipo === 'trilha-incompleta' || pend.tipo === 'trilha-desconhecida') && 'Abrir a Jukebox'}
                            {pend.tipo === 'documento-nao-entregue' && 'Abrir no Ateliê'}
                            {pend.tipo === 'fora-do-elenco' && 'Pôr no elenco'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--linha)' }}>
          <button type="button" class="botao-pilula" onClick={aoFechar}>Fechar</button>
        </footer>
      </div>
    </div>
  );
}
