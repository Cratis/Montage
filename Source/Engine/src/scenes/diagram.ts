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
/** Auto-route from facing sides: horizontal when the nodes are further apart in x than in y. */
function facingSides(a: DiagramNode, b: DiagramNode) {
  const ad = dimensions(a), bd = dimensions(b);
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (horizontal) {
    const right = b.x > a.x;
    return { horizontal, x1: a.x + (right ? ad.w : 0), y1: a.y + ad.h / 2, x2: b.x + (right ? 0 : bd.w), y2: b.y + bd.h / 2 };
  }
  const down = b.y > a.y;
  return { horizontal, x1: a.x + ad.w / 2, y1: a.y + (down ? ad.h : 0), x2: b.x + bd.w / 2, y2: b.y + (down ? 0 : bd.h) };
}
const edgePath = (edge: DiagramEdge, nodes: DiagramNode[]) => {
  const a = nodes.find(n => n.id === edge.from), b = nodes.find(n => n.id === edge.to);
  if (!a || !b) throw new Error(`Unknown connector ${edge.from} → ${edge.to}`);
  const { x1, y1, x2, y2, horizontal } = facingSides(a, b);
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
    const style = styleOf(spec);
    ctx.fillStyle = style.bg; ctx.fillRect(0, 0, this.ctx.W, this.ctx.H);
    ctx.save(); ctx.scale(this.ctx.W / 1600, this.ctx.H / 900);
    if (spec.template === 'blueprint') drawBlueprintGrid(ctx);
    ctx.font = font(42,this.ctx.theme.fontDisplay,700);ctx.fillStyle=style.ink;
    ctx.globalAlpha=clamp(f.lt/0.5);ctx.fillText(spec.headline ?? '',64,88);ctx.globalAlpha=1;
    const clock = this.clockFor(f, spec);
    // Draw links underneath the boxes. Default: a link starts after its source has built.
    this.drawConnectors(ctx, clock, style);
    this.drawBoxes(ctx, clock, style);
    ctx.restore();
  }

  /** When each node starts, and the (possibly stretched) local time everything is evaluated at. */
  private clockFor(f: Frame, spec: DiagramSpec): Clock {
    const nodes = spec.nodes ?? [];
    const stagger = Math.max(0, spec.stagger ?? 0.42);
    const start = (n: DiagramNode, i: number) => this.nodeStart(n, i, { f, stagger });
    // Fit a visual-only build into its actual recorded scene window, leaving a reading
    // hold. Explicit narration anchors are never sped up or shifted away from the voice.
    const finish = Math.max(1,
      ...nodes.map((n,i) => start(n,i) + (n.duration ?? 0.8)),
      ...(spec.edges ?? []).map(e => {
        const i = nodes.findIndex(n => n.id === e.from);
        return (e.at ?? start(nodes[i]!,i) + (nodes[i]!.duration ?? 0.8)) + (e.duration ?? 0.7);
      }));
    const scale = nodes.some(n => n.spoken) ? 1 : Math.max(1, finish / Math.max(0.5, f.end - f.start - 1.2));
    return { start, localTime: f.lt * scale, spec, nodes };
  }

  /** A node starts on its spoken phrase when it has one, else at its time or its staggered slot. */
  private nodeStart(n: DiagramNode, i: number, timing: { f: Frame; stagger: number }): number {
    if (n.spoken) {
      const match = this.ctx.lyrics.lines.find(l => l.sceneId === this.ctx.id && l.text.toLowerCase().includes(n.spoken!.toLowerCase()));
      if (match) return Math.max(0,match.start-timing.f.start);
    }
    return n.at ?? (0.4+i*timing.stagger);
  }

  private drawConnectors(ctx: CanvasRenderingContext2D, clock: Clock, style: Style): void {
    const { spec, nodes, localTime } = clock;
    (spec.edges ?? []).forEach((edge,i) => {
      const sourceIndex=nodes.findIndex(n=>n.id===edge.from);
      const source=nodes[sourceIndex]!;
      const at=edge.at ?? clock.start(source,sourceIndex)+(source.duration ?? 0.8);
      const p=ease.outCubic(clamp(inv(at,at+(edge.duration ?? 0.7),localTime)));
      if(p<=0)return;
      const g=this.connectors[i]!;
      trace(ctx, g, { p, color: style.stroke, pen: style.pen || spec.effect==='pen' }, style.ink);
      if(p>0.92) drawArrowhead(ctx, g, p);
    });
  }

  private drawBoxes(ctx: CanvasRenderingContext2D, clock: Clock, style: Style): void {
    const { spec, nodes, localTime } = clock;
    nodes.forEach((node,i) => {
      const at=clock.start(node,i), duration=Math.max(0.1,node.duration ?? 0.8);
      const raw=clamp(inv(at,at+duration,localTime)), p=ease.outCubic(raw);
      if(p<=0)return;
      this.drawBox(ctx, { node, g: this.boxes[i]!, effect: node.effect ?? spec.effect ?? 'draw' }, { raw, p, style });
    });
  }

  private drawBox(ctx: CanvasRenderingContext2D, box: { node: DiagramNode; g: Geometry; effect: string }, build: { raw: number; p: number; style: Style }): void {
    const { node, g, effect } = box;
    const { raw, p, style } = build;
    const {w,h}=dimensions(node);
    const drawn = DRAWN_EFFECTS.has(effect);
    ctx.save();
    if(effect==='pop') { const s=1-Math.pow(1-raw,3);ctx.translate(node.x+w/2,node.y+h/2);ctx.scale(s,s);ctx.translate(-node.x-w/2,-node.y-h/2); }
    if(effect==='slide')ctx.translate(0,24*(1-p));
    const fill=drawn ? clamp(inv(0.45,1,raw)) : p;
    ctx.globalAlpha=fill;ctx.fillStyle=style.fill;ctx.fill(g.path);ctx.globalAlpha=1;
    if(effect==='wipe') {ctx.beginPath();ctx.rect(node.x,node.y,w*p,h);ctx.clip();}
    if(FADED_EFFECTS.has(effect))ctx.globalAlpha=p;
    trace(ctx, g, { p: drawn?p:1, color: node.color ?? style.stroke, pen: effect==='pen'||style.pen }, style.ink);
    const labelAlpha=clamp(inv(0.6,1,raw));ctx.globalAlpha*=labelAlpha;
    this.drawLabel(ctx, node, { w, h, style });
    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, node: DiagramNode, size: { w: number; h: number; style: Style }): void {
    const { w, h, style } = size;
    const fit=fitText(ctx,node.label,this.ctx.theme.fontDisplay,600,w-30,h-24,3,34,16);
    ctx.font=font(fit.size,this.ctx.theme.fontDisplay,600);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=style.ink;
    fit.lines.forEach((line,j)=>ctx.fillText(line.text,node.x+w/2,node.y+h/2+(j-(fit.lines.length-1)/2)*fit.size*1.18));
  }
}

/** Effects that draw the outline on; the rest fade their fill in. */
const DRAWN_EFFECTS = new Set(['draw', 'pen']);
/** Effects that fade the whole box with its progress. */
const FADED_EFFECTS = new Set(['fade', 'pop', 'slide']);

type Style = ReturnType<typeof styleOf>;
interface Clock { start: (n: DiagramNode, i: number) => number; localTime: number; spec: DiagramSpec; nodes: DiagramNode[] }

function drawBlueprintGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
  for (let x=0;x<1600;x+=32) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,900);ctx.stroke(); }
  for (let y=0;y<900;y+=32) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1600,y);ctx.stroke(); }
}

/** Stroke a geometry progressively (dash trick); a pen tip glows at the leading point. */
function trace(ctx: CanvasRenderingContext2D, g: Geometry, look: { p: number; color: string; pen: boolean }, ink: string): void {
  const { p, color, pen } = look;
  ctx.strokeStyle=color;ctx.lineWidth=2.6;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.setLineDash([g.length,g.length]);ctx.lineDashOffset=g.length*(1-p);ctx.stroke(g.path);ctx.setLineDash([]);ctx.lineDashOffset=0;
  if (pen && inProgress(p)) {
    const tip=g.measure.getPointAtLength(g.length*p);
    ctx.save();ctx.shadowColor=color;ctx.shadowBlur=16;ctx.fillStyle=ink;
    ctx.beginPath();ctx.arc(tip.x,tip.y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

const inProgress = (p: number) => p > 0 && p < 1;

/** Arrow tip fading in at the end of a nearly complete connector. */
function drawArrowhead(ctx: CanvasRenderingContext2D, g: Geometry, p: number): void {
  const end=g.measure.getPointAtLength(g.length), prev=g.measure.getPointAtLength(Math.max(0,g.length-2));
  const a=Math.atan2(end.y-prev.y,end.x-prev.x);
  ctx.save();ctx.globalAlpha=clamp((p-0.92)/0.08);ctx.translate(end.x,end.y);ctx.rotate(a);
  ctx.beginPath();ctx.moveTo(-12,-6);ctx.lineTo(0,0);ctx.lineTo(-12,6);ctx.stroke();ctx.restore();
}
