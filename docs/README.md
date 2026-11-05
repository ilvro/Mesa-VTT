# Mesa — documentação

- Contrato da plataforma: [`../../Atlas/docs/PLATAFORMA.md`](../../Atlas/docs/PLATAFORMA.md)
- Plano de tarefas (Fase 9, tarefas 9.1 a 9.5): [`../../Atlas/docs/plano/fase-9.md`](../../Atlas/docs/plano/fase-9.md)
- Identidade da interface: [`../../Atlas/docs/INTERFACE.md`](../../Atlas/docs/INTERFACE.md)

## Estrutura

| Pasta | O quê |
| --- | --- |
| `src/dominio/` | Regras puras: filtros, busca sem acento, quem pode editar, etiquetas |
| `src/app/` | Estado (signals), banco da campanha, tema, manifestos, rotas |
| `src/ui/` | Componentes Preact e o CSS |
| `vendor/mesa-core/` | Cópia compilada e fixa do contrato (fonte no Atlas) |
| `public/mesa.json` | Manifesto da Mesa |
