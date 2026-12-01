import '@fontsource-variable/hanken-grotesk';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/400-italic.css';
import '@fontsource/open-sans/700.css';
import '@fontsource/open-sans/700-italic.css';
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/400-italic.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-serif/700-italic.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/700-italic.css';
import './ui/estilo.css';
import './ui/tutor.css';
import { render } from 'preact';
import { atualizar, campanhaAtiva, campanhas, entidades, iniciarCampanhas, observarCampanhaAtiva, repositorio } from './app/campanha.ts';
import { iniciarFocoDoQuadro } from './app/foco-do-quadro.ts';
import { sondarAplicativos } from './app/inventario.ts';
import { iniciarReligacaoDeNomes } from './app/ligacoes-quadro.ts';
import { itens, quadroAberto } from './app/quadros.ts';
import { iniciarRecursosDasFichas } from './app/recursos-das-fichas.ts';
import { iniciarOnline } from './app/online-login.ts';
import { iniciarRotas, tela } from './app/rotas.ts';
import { iniciarTema } from './app/tema.ts';
import { ehAtividadeDoDiscord } from './jogar/modo-discord.ts';
import { App } from './ui/App.tsx';

iniciarTema();
if (ehAtividadeDoDiscord(location.search)) {
  const raiz = document.getElementById('raiz')!;
  render(<div class="carregando">Abrindo a mesa…</div>, raiz);
  void import('./jogar/Casca.tsx').then(({ CascaDiscord }) => {
    render(<CascaDiscord />, raiz);
  });
} else {
  iniciarRotas();
  void iniciarOnline();
  iniciarFocoDoQuadro();
  iniciarRecursosDasFichas();
  iniciarReligacaoDeNomes(() => {
    const q = quadroAberto.value;
    return q ? { id: q.id, itens: itens.value.values() } : null;
  });
  render(<App />, document.getElementById('raiz')!);
  void iniciarCampanhas();
  observarCampanhaAtiva();

  // O Atlas, a Ficha e os outros escrevem no mesmo banco por fora: relê ao voltar para a aba e, com a aba à vista, a cada poucos segundos.
  const reler = () => { if (document.visibilityState === 'visible') void atualizar(); };
  document.addEventListener('visibilitychange', reler);
  window.addEventListener('focus', reler);
  setInterval(reler, 3000);

  // O inventário de aplicativos: sonda ao abrir a aba (ver o cabeçalho) e, com a tela à vista, a cada 5 s (um aplicativo que sobe depois aparece sozinho).
  setInterval(() => { if (document.visibilityState === 'visible' && tela.value === 'aplicativos') void sondarAplicativos(); }, 5000);

  // Gancho de diagnóstico para os testes: só em desenvolvimento ou com `?diagnostico` no endereço.
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('diagnostico')) {
    Object.defineProperty(window, '__mesa', { value: Object.freeze({ repositorio: () => repositorio.value, campanhas: () => campanhas.value, campanhaAtiva: () => campanhaAtiva.value, entidades: () => entidades.value }), configurable: true });
  }

  // Ponte do assistente: em desenvolvimento e no app de desktop (o build do Pages não a contém; ver `npm run ponte:verificar` no Atlas).
  if (import.meta.env.DEV || import.meta.env.VITE_PONTE === '1') {
    void import('./app/assistente-slot.ts').then(async ({ seloDoAssistente, capturadorDoQuadro, medidorDeTexto, medidorDeLargura }) => {
      const [{ SeloDoAssistente }, { capturarRegiao }, { alturaNecessariaDoTexto, larguraNecessariaDoTexto }] = await Promise.all([
        import('./ui/SeloDoAssistente.tsx'),
        import('./ui/quadro/pixi/captura-quadro.ts'),
        import('./ui/quadro/pixi/render-textos.ts'),
        import('./app/ponte.ts'),
      ]);
      seloDoAssistente.value = SeloDoAssistente;
      capturadorDoQuadro.value = capturarRegiao;
      medidorDeTexto.value = alturaNecessariaDoTexto;
      medidorDeLargura.value = larguraNecessariaDoTexto;
    });
  }
}
