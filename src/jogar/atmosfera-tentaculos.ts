/** Tentáculos orgânicos do PD crítico sobre um `<canvas>`: porte do efeito do Dossiê (`drawCriticalTendrils`), sem estado global. */
type Ponto = { x: number; y: number };
type Tentaculo = {
  side: number; position: number; originDepth: number; angleOffset: number; curveBias: number; kinkPhase: number; kinkStrength: number;
  lengthRatio: number; amplitudeRatio: number; widthRatio: number; frequency: number; phase: number; speed: number; branches: number; shade: number;
  presence: number; targetPresence: number;
  x: number; y: number; dx: number; dy: number; px: number; py: number; length: number; amplitude: number; baseWidth: number;
};

export type Tentaculos = { definir(intensidade: number): void; recolher(): void; parar(): void };

function tracar(ctx: CanvasRenderingContext2D, pts: Ponto[], baseWidth: number, phase: number, time: number) {
  const last = pts.length - 1;
  if (last < 1) return;
  const largura = (i: number) => {
    const progress = i / last, taper = Math.pow(Math.max(0, 1 - progress), 0.72), breath = 0.9 + 0.1 * Math.sin(time * 0.001 + phase + progress * 4.7), notch = i % 4 === 0 ? 0.84 : (i % 3 === 0 ? 1.1 : 1);
    return Math.max(0.45, baseWidth * taper * breath * notch);
  };
  const normal = (i: number) => {
    const p = pts[Math.max(0, i - 1)]!, n = pts[Math.min(last, i + 1)]!, vx = n.x - p.x, vy = n.y - p.y, len = Math.hypot(vx, vy) || 1;
    return { nx: -vy / len, ny: vx / len };
  };
  ctx.beginPath();
  for (let i = 0; i <= last; i++) { const { nx, ny } = normal(i), w = largura(i), p = pts[i]!; if (i === 0) ctx.moveTo(p.x + nx * w, p.y + ny * w); else ctx.lineTo(p.x + nx * w, p.y + ny * w); }
  for (let i = last; i >= 0; i--) { const { nx, ny } = normal(i), w = largura(i), p = pts[i]!; ctx.lineTo(p.x - nx * w, p.y - ny * w); }
  ctx.closePath();
}

function posicionar(t: Tentaculo, w: number, h: number) {
  const curto = Math.min(w, h), depth = t.originDepth;
  if (t.side === 0) { t.x = -depth; t.y = t.position * h; } else if (t.side === 1) { t.x = w + depth; t.y = t.position * h; }
  else if (t.side === 2) { t.x = t.position * w; t.y = -depth; } else { t.x = t.position * w; t.y = h + depth; }
  const angle = [0, Math.PI, Math.PI / 2, -Math.PI / 2][t.side]! + t.angleOffset;
  t.dx = Math.cos(angle); t.dy = Math.sin(angle); t.px = -t.dy; t.py = t.dx;
  t.length = curto * t.lengthRatio; t.amplitude = curto * t.amplitudeRatio; t.baseWidth = curto * t.widthRatio;
}

function criar(lista: Tentaculo[], w: number, h: number): Tentaculo {
  const cont = [0, 0, 0, 0];
  lista.filter(t => t.targetPresence > 0).forEach(t => cont[t.side]!++);
  const pesos = cont.map(c => 1 / Math.pow(c + 1, 1.65)), total = pesos.reduce((a, b) => a + b, 0);
  let sorteio = Math.random() * total, side = 0;
  for (; side < 3; side++) { sorteio -= pesos[side]!; if (sorteio <= 0) break; }
  const r1 = Math.random(), r2 = Math.random(), r3 = Math.random(), r4 = Math.random();
  const t: Tentaculo = {
    side, position: 0.025 + Math.random() * 0.95, originDepth: 22 + Math.random() * 34, angleOffset: (Math.random() - 0.5) * 1.28, curveBias: (Math.random() - 0.5) * 0.31,
    kinkPhase: Math.random() * Math.PI * 2, kinkStrength: 0.035 + Math.random() * 0.075, lengthRatio: 0.36 + r2 * 0.42, amplitudeRatio: 0.026 + 0.06 * r3, widthRatio: 0.032 + 0.055 * r4,
    frequency: 0.95 + r2 * 2.35, phase: r1 * Math.PI * 2, speed: 0.00026 + r3 * 0.0004, branches: r4 > 0.68 ? 2 : (r4 > 0.24 ? 1 : 0), shade: Math.floor(Math.random() * 3),
    presence: 0, targetPresence: 1, x: 0, y: 0, dx: 0, dy: 0, px: 0, py: 0, length: 0, amplitude: 0, baseWidth: 0,
  };
  posicionar(t, w, h);
  return t;
}

export function criarTentaculos(canvas: HTMLCanvasElement, reduzirMovimento: () => boolean): Tentaculos {
  let lista: Tentaculo[] = [];
  let raf = 0, parada = 0, alvo = 0, atual = 0;
  const ctx = canvas.getContext('2d');

  const reconciliar = (w: number, h: number) => {
    const desejados = Math.round(4 + Math.max(0, Math.min(1, alvo)) * 6), ativos = lista.filter(t => t.targetPresence > 0);
    for (let faltam = desejados - ativos.length; faltam > 0; faltam--) lista.push(criar(lista, w, h));
    const sobra = ativos.length - desejados;
    if (sobra > 0) ativos.slice(desejados).forEach(t => { t.targetPresence = 0; });
    lista.forEach(t => posicionar(t, w, h));
  };

  const desenhar = (time: number) => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!ctx || !w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; if (parada) lista.forEach(t => posicionar(t, w, h)); else reconciliar(w, h); }
    ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over';
    for (const t of lista) {
      t.presence += (t.targetPresence - t.presence) * (t.targetPresence > 0 ? 0.075 : 0.11);
      if (Math.abs(t.targetPresence - t.presence) < 0.002) t.presence = t.targetPresence;
      const reveal = t.presence;
      if (reveal <= 0.002) continue;
      ctx.save(); ctx.globalAlpha = Math.pow(reveal, 1.1) * 0.68;
      const pts: Ponto[] = [], growth = 0.04 + reveal * 0.96 + 0.055 * Math.sin(time * 0.00031 + t.phase) * reveal, len = t.length, rw = t.baseWidth * (0.18 + reveal * 0.82);
      for (let s = 0; s <= 14; s++) {
        const pr = s / 14, taper = Math.sin(pr * Math.PI);
        const wave = Math.sin(pr * t.frequency * Math.PI + t.phase + time * t.speed) * t.amplitude * taper;
        const sway = Math.sin(time * t.speed * 0.43 + t.phase * 0.7) * t.amplitude * 0.42 * pr;
        const curl = Math.sin(pr * Math.PI * 0.76 + t.phase * 0.4 - time * t.speed * 0.22) * t.amplitude * 0.5 * pr * pr;
        const curve = t.curveBias * len * Math.pow(pr, 1.45), kink = Math.sin(pr * Math.PI * 3 + t.kinkPhase) * len * t.kinkStrength * taper;
        const fwd = Math.cos(pr * Math.PI * 2.4 + t.kinkPhase) * t.amplitude * 0.22 * taper, lateral = (wave + sway + curl) * reveal + curve + kink;
        pts.push({ x: t.x + t.dx * (len * growth * pr + fwd) + t.px * lateral, y: t.y + t.dy * (len * growth * pr + fwd) + t.py * lateral });
      }
      const tip = pts[pts.length - 1]!, corpo = ctx.createLinearGradient(t.x, t.y, tip.x, tip.y);
      const paleta = t.shade === 0 ? ['#020005', '#120424', '#1e0838'] : t.shade === 1 ? ['#030107', '#16052c', '#150527'] : ['#040109', '#1b0635', '#17052c'];
      corpo.addColorStop(0, paleta[0]!); corpo.addColorStop(0.64, paleta[1]!); corpo.addColorStop(1, paleta[2]!);
      tracar(ctx, pts, rw, t.phase, time); ctx.fillStyle = corpo; ctx.fill(); ctx.strokeStyle = 'rgba(48,15,85,.42)'; ctx.lineJoin = 'miter'; ctx.lineWidth = 1 + atual * 0.6; ctx.stroke();
      ctx.globalAlpha *= 0.35; ctx.strokeStyle = 'rgba(70,24,120,.38)'; ctx.lineWidth = Math.max(0.8, rw * 0.045); ctx.lineCap = 'square';
      ctx.beginPath(); ctx.moveTo(pts[1]!.x, pts[1]!.y); for (let i = 2; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y); ctx.stroke();
      for (let b = 0; b < t.branches; b++) {
        const br = Math.max(0, Math.min(1, reveal * 1.35 - b * 0.28));
        if (br <= 0.02) continue;
        const at = 8 + b * 5, o = pts[Math.min(at, pts.length - 4)]!, n = pts[Math.min(at + 2, pts.length - 2)]!, vx = n.x - o.x, vy = n.y - o.y, vl = Math.hypot(vx, vy) || 1;
        const dir = b % 2 ? 1 : -1, nx = (-vy / vl) * dir, ny = (vx / vl) * dir, bl = len * (0.16 + b * 0.055) * br, bp: Ponto[] = [];
        for (let s = 0; s <= 10; s++) {
          const pr = s / 10, c = Math.sin(pr * Math.PI * 1.3 + t.phase + time * t.speed * 0.8) * t.amplitude * 0.18 * Math.sin(pr * Math.PI);
          bp.push({ x: o.x + (vx / vl * 0.34 + nx * 0.94) * bl * pr + -ny * c, y: o.y + (vy / vl * 0.34 + ny * 0.94) * bl * pr + nx * c });
        }
        tracar(ctx, bp, rw * (0.38 - b * 0.07), t.phase + b, time); ctx.fillStyle = corpo; ctx.fill(); ctx.strokeStyle = 'rgba(40,12,70,.35)'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    }
    lista = lista.filter(t => t.targetPresence > 0 || t.presence > 0.002);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };

  const parar = () => {
    clearTimeout(parada); parada = 0; cancelAnimationFrame(raf); raf = 0;
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    atual = 0; alvo = 0; lista = [];
  };

  return {
    definir(intensidade) {
      clearTimeout(parada); parada = 0;
      const primeira = lista.length === 0 && !raf;
      alvo = intensidade;
      if (primeira) atual = Math.min(0.02, intensidade);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w && h) reconciliar(w, h);
      if (reduzirMovimento()) { atual = intensidade; lista.forEach(t => { t.presence = t.targetPresence; }); desenhar(0); return; }
      if (raf) return;
      const animar = (time: number) => {
        atual += (alvo - atual) * 0.055;
        if (Math.abs(alvo - atual) < 0.001) atual = alvo;
        try { desenhar(time); } catch (e) { console.error('Erro ao desenhar efeito crítico de PD:', e); }
        raf = requestAnimationFrame(animar);
      };
      raf = requestAnimationFrame(animar);
    },
    recolher() {
      if (!raf && !lista.length) return;
      if (reduzirMovimento()) { parar(); return; }
      if (parada) return;
      alvo = 0; lista.forEach(t => { t.targetPresence = 0; });
      parada = window.setTimeout(() => { parada = 0; if (alvo <= 0) parar(); }, 1100);
    },
    parar,
  };
}
