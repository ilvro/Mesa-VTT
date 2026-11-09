import '@fontsource-variable/hanken-grotesk';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import './ui/estilo.css';
import { render } from 'preact';
import { atualizar, campanhaAtiva, campanhas, entidades, iniciarCampanhas, observarCampanhaAtiva, repositorio } from './app/campanha.ts';
import { sondarAplicativos } from './app/inventario.ts';
import { iniciarRotas, tela } from './app/rotas.ts';
import { iniciarTema } from './app/tema.ts';
import { App } from './ui/App.tsx';

iniciarTema();
iniciarRotas();
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

// Ponte do assistente: só em desenvolvimento (o build de produção não a contém; ver `npm run ponte:verificar` no Atlas).
if (import.meta.env.DEV) void import('./app/ponte.ts');
