import '@fontsource-variable/hanken-grotesk';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import './ui/estilo.css';
import { render } from 'preact';
import { atualizar, campanhaAtiva, campanhas, entidades, iniciarCampanhas, observarCampanhaAtiva, repositorio } from './app/campanha.ts';
import { iniciarRotas } from './app/rotas.ts';
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

// Gancho de diagnóstico para os testes: só em desenvolvimento ou com `?diagnostico` no endereço.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('diagnostico')) {
  Object.defineProperty(window, '__mesa', { value: Object.freeze({ repositorio: () => repositorio.value, campanhas: () => campanhas.value, campanhaAtiva: () => campanhaAtiva.value, entidades: () => entidades.value }), configurable: true });
}
