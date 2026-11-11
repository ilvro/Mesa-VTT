import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { chaveDaRef, type Ref } from '#mesa';
import { entidades } from '../app/campanha.ts';
import { adicionarAoRoteiro, anotar, baixarMarkdown, continuarSessao, definirNotaDoItem, encerrarSessao, fecharSessao, gravando, iniciarSessao, linhas, moverNoRoteiro, notasDoRoteiro, removerDoRoteiro, retomarGravacao, roteiroDaSessao, sessaoAtiva, sessoes, abrirItemDoRoteiro } from '../app/registro.ts';
import { garantirPainelPara } from '../app/sessao.ts';
import { candidatos, nomeDoRef, ondeEstaORef } from '../dominio/roteiro.ts';
import { DialogoChecagemSessao } from './DialogoChecagemSessao.tsx';
import { cx } from './cx.ts';

const checandoProntidao = signal(false);

function Roteiro() {
  const roteiro = roteiroDaSessao.value, opcoes = candidatos(entidades.value).filter(c => !roteiro.some(r => chaveDaRef(r) === chaveDaRef(c.ref)));
  const abrir = (r: Ref) => { garantirPainelPara(r); void abrirItemDoRoteiro(r); };
  return (
    <section class="diario-secao" data-testid="roteiro">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <h4 class="faixa pequena" style={{ margin: 0 }}>Roteiro</h4>
        <button
          type="button"
          class="botao-pilula"
          data-testid="checar-sessao"
          onClick={() => { checandoProntidao.value = true; }}
        >
          Pronto para jogar?
        </button>
      </div>
      {checandoProntidao.value && (
        <DialogoChecagemSessao aoFechar={() => { checandoProntidao.value = false; }} />
      )}
      {roteiro.length === 0 && <p class="dica">Nada no roteiro ainda. Acrescente mapas, cenas sonoras, documentos e fichas na ordem em que devem acontecer.</p>}
      <ol class="roteiro">
        {roteiro.map((r, i) => (
          <li key={chaveDaRef(r)} class="roteiro-item" data-testid="roteiro-item">
            <div class="roteiro-linha">
              <button type="button" class="roteiro-nome" title="Abrir no aplicativo" data-testid={`roteiro-abrir-${i}`} onClick={() => abrir(r)}>
                <b>{i + 1}. {nomeDoRef(entidades.value, r)}</b><span class="meta">{ondeEstaORef(r)}</span>
              </button>
              <span class="roteiro-acoes">
                <button type="button" class="botao-icone-texto" aria-label="Subir" disabled={i === 0} data-testid={`roteiro-subir-${i}`} onClick={() => moverNoRoteiro(i, -1)}>↑</button>
                <button type="button" class="botao-icone-texto" aria-label="Descer" disabled={i === roteiro.length - 1} data-testid={`roteiro-descer-${i}`} onClick={() => moverNoRoteiro(i, 1)}>↓</button>
                <button type="button" class="botao-icone-texto" aria-label="Tirar do roteiro" data-testid={`roteiro-tirar-${i}`} onClick={() => removerDoRoteiro(i)}>✕</button>
              </span>
            </div>
            <input type="text" class="roteiro-nota" placeholder="Nota para este item" maxLength={300} defaultValue={notasDoRoteiro.value[chaveDaRef(r)] ?? ''} data-testid={`roteiro-nota-${i}`}
              onBlur={ev => definirNotaDoItem(r, ev.currentTarget.value)} onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }} />
          </li>
        ))}
      </ol>
      <select aria-label="Acrescentar ao roteiro" data-testid="roteiro-adicionar" value="" disabled={opcoes.length === 0}
        onChange={ev => { const c = opcoes.find(o => chaveDaRef(o.ref) === ev.currentTarget.value); if (c) adicionarAoRoteiro(c.ref); ev.currentTarget.value = ''; }}>
        <option value="">{opcoes.length ? 'Acrescentar ao roteiro…' : 'Nada mais para acrescentar'}</option>
        {opcoes.map(o => <option key={chaveDaRef(o.ref)} value={chaveDaRef(o.ref)}>{o.nome} — {ondeEstaORef(o.ref)}</option>)}
      </select>
    </section>
  );
}

function Registro() {
  const lista = linhas.value, fim = useRef<HTMLLIElement>(null), [nota, setNota] = useState('');
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [lista.length]);
  return (
    <section class="diario-secao registro-secao" data-testid="registro">
      <h4 class="faixa pequena">Registro</h4>
      {lista.length === 0 && <p class="dica" data-testid="registro-vazio">{gravando.value ? 'Gravando: rolagens, mapas abertos, revelações e músicas aparecem aqui.' : 'Nada registrado.'}</p>}
      <ul class="registro-linhas" data-testid="registro-linhas">
        {lista.map((l, i) => <li key={i} class={cx('registro-linha', l.nota && 'nota')} data-testid="registro-linha"><span class="hora">{l.hora}</span><span>{l.texto}</span></li>)}
        <li ref={fim} aria-hidden="true" />
      </ul>
      <form class="anotar" onSubmit={ev => { ev.preventDefault(); anotar(nota); setNota(''); }}>
        <input type="text" placeholder="Anotar…" maxLength={500} value={nota} data-testid="anotar" onInput={ev => setNota(ev.currentTarget.value)} />
        <button type="submit" class="botao-pilula" disabled={!nota.trim()} data-testid="anotar-enviar">Anotar</button>
      </form>
    </section>
  );
}

function SemSessao() {
  const [nome, setNome] = useState('');
  return (
    <div class="diario-vazio" data-testid="sem-sessao">
      <form class="nova-sessao" onSubmit={ev => { ev.preventDefault(); void iniciarSessao(nome).then(() => setNome('')); }}>
        <input type="text" placeholder="Nome da sessão (opcional)" maxLength={200} value={nome} data-testid="sessao-nome" onInput={ev => setNome(ev.currentTarget.value)} />
        <button type="submit" class="botao-pilula destaque" data-testid="sessao-iniciar">Iniciar sessão</button>
      </form>
      <p class="dica">Ao iniciar, o diário passa a registrar o que acontece na mesa (rolagens, mapas, revelações, músicas) e avisa os outros aplicativos.</p>
      {sessoes.value.length > 0 && (
        <>
          <h4 class="faixa pequena">Sessões anteriores</h4>
          <ul class="sessoes-anteriores">
            {sessoes.value.map(s => <li key={s.id}><span>{s.nome}<span class="meta"> · {new Date(s.data).toLocaleDateString('pt-BR')}</span></span><button type="button" class="botao-pilula" data-testid={`sessao-continuar-${s.id}`} onClick={() => continuarSessao(s.id)}>Abrir</button></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

/** O diário da sessão: roteiro, registro automático do que acontece e as anotações do mestre; exporta em Markdown. */
export function Diario() {
  const s = sessaoAtiva.value;
  if (!s) return <SemSessao />;
  return (
    <div class="diario" data-testid="diario">
      <header class="diario-topo">
        <strong class="diario-nome" data-testid="sessao-nome-ativa">{s.nome}</strong>
        <span class={cx('selo', gravando.value ? 'selo-achado' : 'selo-sem-manifesto')} data-testid="sessao-estado"><i class="ponto" />{gravando.value ? 'Gravando' : 'Parada'}</span>
        <span class="espaco" />
        {gravando.value
          ? <button type="button" class="botao-pilula" data-testid="sessao-encerrar" onClick={encerrarSessao}>Parar</button>
          : <button type="button" class="botao-pilula destaque" data-testid="sessao-retomar" onClick={retomarGravacao}>Gravar</button>}
        <button type="button" class="botao-pilula" data-testid="sessao-exportar" onClick={baixarMarkdown}>Exportar .md</button>
        <button type="button" class="botao-icone-texto" aria-label="Fechar a sessão" title="Fechar (a sessão fica guardada)" data-testid="sessao-fechar" onClick={fecharSessao}>✕</button>
      </header>
      <div class="diario-corpo"><Roteiro /><Registro /></div>
    </div>
  );
}
