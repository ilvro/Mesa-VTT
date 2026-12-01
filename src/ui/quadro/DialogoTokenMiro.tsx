import { useSignal } from '@preact/signals';
import { dialogoTokenMiroAberto, gravarTokenMiro, lerTokenMiro } from '../../app/imagens-miro.ts';
import { avisar } from '../../app/toasts.ts';

/** Token do Miro para trazer as imagens coladas; fica só neste aparelho (localStorage). */
export function DialogoTokenMiro() {
  const token = useSignal('');
  if (!dialogoTokenMiroAberto.value) return null;
  const fechar = () => {
    dialogoTokenMiroAberto.value = false;
    token.value = '';
  };
  const tem = lerTokenMiro() !== null;
  return (
    <div
      class="miro-molduras-fundo"
      data-testid="dialogo-token-miro"
      onKeyDown={(e) => {
        if (e.key === 'Escape') fechar();
      }}
    >
      <div class="miro-molduras-dialogo" role="dialog" aria-label="Token do Miro">
        <h2 class="miro-molduras-titulo">Token do Miro</h2>
        <p class="meta">
          Com o token, as imagens coladas do Miro chegam com o arquivo. Ele fica só neste aparelho: não vai para o
          banco, para as exportações nem para a sala online.{' '}
        </p>
        <ol class="meta">
          <li>
            Na primeira vez, crie um time de desenvolvedor:{' '}
            <a href="https://miro.com/app/dashboard/?createDevTeam=1" target="_blank" rel="noreferrer">
              abrir no Miro
            </a>{' '}
            → <b>Create team</b>.
          </li>
          <li>
            Avatar → <b>Settings</b> → <b>Your apps</b> → <b>+ Create new app</b>. Deixe desmarcado “Expire user
            authorization token”.
          </li>
          <li>
            Na página do app, em <b>Permissions</b>, marque <code>boards:read</code>.
          </li>
          <li>
            No fim da página, <b>Install app and get OAuth token</b> → escolha o time → <b>Install &amp; authorize</b>,
            e cole o token aqui.
          </li>
        </ol>
        <input
          type="password"
          class="campo-inline"
          autocomplete="off"
          placeholder={tem ? 'Token salvo (digite para trocar)' : 'Cole o token'}
          aria-label="Token do Miro"
          data-testid="token-miro-campo"
          value={token.value}
          onInput={(e) => {
            token.value = e.currentTarget.value;
          }}
        />
        <div class="miro-molduras-rodape">
          {tem ? (
            <button
              type="button"
              class="botao-pilula"
              data-testid="token-miro-apagar"
              onClick={() => {
                gravarTokenMiro(null);
                avisar('Token do Miro apagado.');
                fechar();
              }}
            >
              Apagar
            </button>
          ) : null}
          <button type="button" class="botao-pilula" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="button"
            class="botao-pilula destaque"
            data-testid="token-miro-salvar"
            disabled={!token.value.trim()}
            onClick={() => {
              gravarTokenMiro(token.value);
              avisar('Token do Miro salvo neste aparelho.');
              fechar();
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
