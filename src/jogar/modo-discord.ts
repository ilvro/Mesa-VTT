/** Detecção do modo Atividade do Discord pela query string (`frame_id`). Sem dependências para não pesar no `main.tsx`. */
export function ehAtividadeDoDiscord(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  const frameId = new URLSearchParams(search).get('frame_id');
  return typeof frameId === 'string' && frameId.length > 0;
}
