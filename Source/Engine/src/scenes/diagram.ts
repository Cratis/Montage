// Structured infographics: retained SVG geometry, evaluated against the video clock.
// Boxes, labels and routed connectors are independent objects, never a flattened picture.
import { Scene, type Frame } from '../core/scene';
import { font, fitText } from '../core/text';
import { clamp, ease, inv } from '../core/util';

export interface DiagramNode {
  id: string; label: string; x: number; y: number; width?: number; height?: number;
  color?: string; at?: number; duration?: number; effect?: string; spoken?: string;
}
export interface DiagramEdge { from: string; to: string; at?: number; duration?: number; points?: number[][] }
export interface DiagramSpec {
  headline?: string; nodes: DiagramNode[]; edges?: DiagramEdge[];
  template?: string; stagger?: number; effect?: string; describe?: string;
  design?: Partial<typeof diagramStyles.cratis>;
}
export const diagramStyles = {
  cratis: { bg: '#0d1219', fill: '#202a36', ink: '#f5f7fc', accent: '#80b9ff', stroke: '#c9d2df', radius: 22, pen: false },
  blueprint: { bg: '#091c32', fill: '#0c2845', ink: '#e4f4ff', accent: '#54d8e7', stroke: '#6196bb', radius: 6, pen: true },
  editorial: { bg: '#f5f0e6', fill: '#ebe3d6', ink: '#222b32', accent: '#ba553c', stroke: '#9b9589', radius: 12, pen: false },
};
const styleOf = (spec: DiagramSpec) => ({
  ...(diagramStyles[spec.template as keyof typeof diagramStyles] ?? diagramStyles.cratis), ...spec.design,
});
const svgNS = 'http://www.w3.org/2000/svg';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const dimensions = (n: DiagramNode) => ({ w: n.width ?? 260, h: n.height ?? 120 });
const boxPath = (n: DiagramNode, r: number) => {
  const { w, h } = dimensions(n), x = n.x, y = n.y;
  r = Math.min(r, w / 2, h / 2);
  return `M${x+r} ${y} H${x+w-r} Q${x+w} ${y} ${x+w} ${y+r} V${y+h-r} Q${x+w} ${y+h} ${x+w-r} ${y+h} H${x+r} Q${x} ${y+h} ${x} ${y+h-r} V${y+r} Q${x} ${y} ${x+r} ${y} Z`;
};
const edgePath = (edge: DiagramEdge, nodes: DiagramNode[]) => {
  const a = nodes.find(n => n.id === edge.from), b = nodes.find(n => n.id === edge.to);
  if (!a || !b) throw new Error(`Unknown connector ${edge.from} → ${edge.to}`);
  const ad = dimensions(a), bd = dimensions(b);
  // Auto-route from facing sides, with an orthogonal elbow for branched hubs.
  let x1: number, y1: number, x2: number, y2: number;
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (horizontal) {
    const right = b.x > a.x;
    x1 = a.x + (right ? ad.w : 0); y1 = a.y + ad.h / 2;
    x2 = b.x + (right ? 0 : bd.w); y2 = b.y + bd.h / 2;
  } else {
    const down = b.y > a.y;
    x1 = a.x + ad.w / 2; y1 = a.y + (down ? ad.h : 0);
    x2 = b.x + bd.w / 2; y2 = b.y + (down ? 0 : bd.h);
  }
  const points = edge.points ?? (horizontal
    ? [[(x1+x2)/2,y1],[(x1+x2)/2,y2]]
    : [[x1,(y1+y2)/2],[x2,(y1+y2)/2]]);
  return `M${x1} ${y1} ${points.map(p => `L${p[0]} ${p[1]}`).join(' ')} L${x2} ${y2}`;
};

/** Portable, static SVG of the same editable diagram used by the animated renderer. */
export function diagramSvg(spec: DiagramSpec): string {
  const style = styleOf(spec);
  const nodes = spec.nodes ?? [];
  return `<svg xmlns="${svgNS}" viewBox="0 0 1600 900"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="none" stroke="${escape(style.stroke)}" stroke-width="1.5"/></marker></defs><rect width="1600" height="900" fill="${escape(style.bg)}"/>
    <text x="64" y="88" fill="${style.ink}" font-family="sans-serif" font-size="42" font-weight="700">${escape(spec.headline ?? '')}</text>
    ${(spec.edges ?? []).map((e,i) => `<path id="edge-${i}" d="${edgePath(e,nodes)}" fill="none" stroke="${style.stroke}" stroke-width="3" marker-end="url(#arrow)" data-at="${e.at ?? 0}"/>`).join('')}
    ${nodes.map(n => { const {w,h}=dimensions(n); return `<g id="${escape(n.id)}" data-at="${n.at ?? 0}" data-effect="${escape(n.effect ?? spec.effect ?? 'draw')}"><path d="${boxPath(n,style.radius)}" fill="${escape(style.fill)}" stroke="${escape(n.color ?? style.stroke)}" stroke-width="3"/><text x="${n.x+w/2}" y="${n.y+h/2}" text-anchor="middle" dominant-baseline="middle" fill="${style.ink}" font-family="sans-serif" font-size="28">${escape(n.label)}</text></g>`; }).join('')}
    </svg>`;
}
interface Geometry { path: Path2D; measure: SVGPathElement; length: number }
function geometry(d: string): Geometry {
  const measure = document.createElementNS(svgNS, 'path');
  measure.setAttribute('d', d);
  return { path: new Path2D(d), measure, length: measure.getTotalLength() };
}

export class Diagram extends Scene {
  private boxes: Geometry[] = [];
  private connectors: Geometry[] = [];
  override init(): void {
    const spec = this.ctx.params as DiagramSpec;
    const nodes = spec.nodes ?? [];
    if (new Set(nodes.map(n => n.id)).size !== nodes.length) throw new Error('Diagram node IDs must be unique');
    const style = styleOf(spec);
    this.boxes = nodes.map(n => geometry(boxPath(n, style.radius)));
    this.connectors = (spec.edges ?? []).map(e => geometry(edgePath(e, nodes)));
  }
  override render(f: Frame, ctx: CanvasRenderingContext2D): void {
    const spec = this.ctx.params as DiagramSpec;
    const nodes = spec.nodes ?? [];
    const style = styleOf(spec);
    ctx.fillStyle = style.bg; ctx.fillRect(0, 0, this.ctx.W, this.ctx.H);
    ctx.save(); ctx.scale(this.ctx.W / 1600, this.ctx.H / 900);
    if (spec.template === 'blueprint') {
      ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
      for (let x=0;x<1600;x+=32) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,900);ctx.stroke(); }
      for (let y=0;y<900;y+=32) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1600,y);ctx.stroke(); }
    }
    ctx.font = font(42,this.ctx.theme.fontDisplay,700);ctx.fillStyle=style.ink;
    ctx.globalAlpha=clamp(f.lt/0.5);ctx.fillText(spec.headline ?? '',64,88);ctx.globalAlpha=1;
    const stagger = Math.max(0, spec.stagger ?? 0.42);
    const start = (n: DiagramNode, i: number) => {
      if (n.spoken) {
        const match = this.ctx.lyrics.lines.find(l => l.sceneId === this.ctx.id && l.text.toLowerCase().includes(n.spoken!.toLowerCase()));
        if (match) return Math.max(0,match.start-f.start);
      }
      return n.at ?? (0.4+i*stagger);
    };
    // Fit a visual-only build into its actual recorded scene window, leaving a reading
    // hold. Explicit narration anchors are never sped up or shifted away from the voice.
    const finish = Math.max(1,
      ...nodes.map((n,i) => start(n,i) + (n.duration ?? 0.8)),
      ...(spec.edges ?? []).map(e => {
        const i = nodes.findIndex(n => n.id === e.from);
        return (e.at ?? start(nodes[i]!,i) + (nodes[i]!.duration ?? 0.8)) + (e.duration ?? 0.7);
      }));
    const scale = nodes.some(n => n.spoken) ? 1 : Math.max(1, finish / Math.max(0.5, f.end - f.start - 1.2));
    const localTime = f.lt * scale;
    const trace = (g: Geometry, p: number, color: string, pen: boolean) => {
      ctx.strokeStyle=color;ctx.lineWidth=2.6;ctx.lineJoin='round';ctx.lineCap='round';
      ctx.setLineDash([g.length,g.length]);ctx.lineDashOffset=g.length*(1-p);ctx.stroke(g.path);ctx.setLineDash([]);ctx.lineDashOffset=0;
      if (pen && p>0 && p<1) {
        const tip=g.measure.getPointAtLength(g.length*p);
        ctx.save();ctx.shadowColor=color;ctx.shadowBlur=16;ctx.fillStyle=style.ink;
        ctx.beginPath();ctx.arc(tip.x,tip.y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
      }
    };
    // Draw links underneath the boxes. Default: a link starts after its source has built.
    (spec.edges ?? []).forEach((edge,i) => {
      const sourceIndex=nodes.findIndex(n=>n.id===edge.from);
      const source=nodes[sourceIndex]!;
      const at=edge.at ?? start(source,sourceIndex)+(source.duration ?? 0.8);
      const p=ease.outCubic(clamp(inv(at,at+(edge.duration ?? 0.7),localTime)));
      if(p<=0)return;
      const g=this.connectors[i]!;trace(g,p,style.stroke,style.pen || spec.effect==='pen');
      if(p>0.92) {
        const end=g.measure.getPointAtLength(g.length), prev=g.measure.getPointAtLength(Math.max(0,g.length-2));
        const a=Math.atan2(end.y-prev.y,end.x-prev.x);
        ctx.save();ctx.globalAlpha=clamp((p-0.92)/0.08);ctx.translate(end.x,end.y);ctx.rotate(a);
        ctx.beginPath();ctx.moveTo(-12,-6);ctx.lineTo(0,0);ctx.lineTo(-12,6);ctx.stroke();ctx.restore();
      }
    });
    nodes.forEach((node,i) => {
      const at=start(node,i), duration=Math.max(0.1,node.duration ?? 0.8);
      const raw=clamp(inv(at,at+duration,localTime)), p=ease.outCubic(raw);
      if(p<=0)return;
      const g=this.boxes[i]!, {w,h}=dimensions(node), effect=node.effect ?? spec.effect ?? 'draw';
      ctx.save();
      if(effect==='pop') { const s=1-Math.pow(1-raw,3);ctx.translate(node.x+w/2,node.y+h/2);ctx.scale(s,s);ctx.translate(-node.x-w/2,-node.y-h/2); }
      if(effect==='slide')ctx.translate(0,24*(1-p));
      const fill=effect==='draw'||effect==='pen' ? clamp(inv(0.45,1,raw)) : p;
      ctx.globalAlpha=fill;ctx.fillStyle=style.fill;ctx.fill(g.path);ctx.globalAlpha=1;
      if(effect==='wipe') {ctx.beginPath();ctx.rect(node.x,node.y,w*p,h);ctx.clip();}
      if(effect==='fade'||effect==='pop'||effect==='slide')ctx.globalAlpha=p;
      trace(g,effect==='draw'||effect==='pen'?p:1,node.color ?? style.stroke,effect==='pen'||style.pen);
      const labelAlpha=clamp(inv(0.6,1,raw));ctx.globalAlpha*=labelAlpha;
      const fit=fitText(ctx,node.label,this.ctx.theme.fontDisplay,600,w-30,h-24,3,34,16);
      ctx.font=font(fit.size,this.ctx.theme.fontDisplay,600);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=style.ink;
      fit.lines.forEach((line,j)=>ctx.fillText(line.text,node.x+w/2,node.y+h/2+(j-(fit.lines.length-1)/2)*fit.size*1.18));
      ctx.restore();
    });
    ctx.restore();
  }
}
