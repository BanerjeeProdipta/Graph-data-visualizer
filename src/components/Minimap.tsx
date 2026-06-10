import {useEffect, useRef} from 'react';
import {useSigma} from '@react-sigma/core';
import Graph from 'graphology';

const W = 168;
const H = 126;
const PAD = 4; // px margin inside the map canvas

interface Props {
    fullGraph: Graph | null;
}

interface Bounds {
    minX: number; maxX: number; minY: number; maxY: number;
}

function graphBounds(graph: Graph): Bounds {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    graph.forEachNode((_id, a) => {
        const x = a.x as number, y = a.y as number;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    });
    return {minX, maxX, minY, maxY};
}

function makeProjector(bounds: Bounds, w: number, h: number) {
    const gw = bounds.maxX - bounds.minX || 1;
    const gh = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((w - PAD * 2) / gw, (h - PAD * 2) / gh);
    const ox = PAD + ((w - PAD * 2) - gw * scale) / 2;
    const oy = PAD + ((h - PAD * 2) - gh * scale) / 2;
    return (x: number, y: number) => ({
        sx: ox + (x - bounds.minX) * scale,
        sy: oy + (y - bounds.minY) * scale,
    });
}

// Builds a static pixel image of all nodes; called once when the graph loads.
function prerenderNodes(graph: Graph): HTMLCanvasElement {
    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d')!;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, W, H);

    const bounds = graphBounds(graph);
    const project = makeProjector(bounds, W, H);

    graph.forEachNode((_id, a) => {
        const {sx, sy} = project(a.x as number, a.y as number);
        ctx.fillStyle = (a.color as string) || '#555';
        ctx.fillRect(sx, sy, 1.5, 1.5);
    });

    return offscreen;
}

export function Minimap({fullGraph}: Props) {
    const sigma = useSigma();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const boundsRef = useRef<Bounds | null>(null);

    // Pre-render nodes once whenever the full graph changes.
    useEffect(() => {
        if (!fullGraph) return;
        offscreenRef.current = prerenderNodes(fullGraph);
        boundsRef.current = graphBounds(fullGraph);
    }, [fullGraph]);

    // On every camera update, blit the pre-rendered nodes then draw the viewport rect.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;

        const draw = () => {
            ctx.clearRect(0, 0, W, H);

            if (offscreenRef.current) {
                ctx.drawImage(offscreenRef.current, 0, 0);
            } else {
                ctx.fillStyle = '#0b0b0b';
                ctx.fillRect(0, 0, W, H);
            }

            const bounds = boundsRef.current;
            if (!bounds) return;

            const project = makeProjector(bounds, W, H);
            const container = sigma.getContainer();

            const c1 = sigma.viewportToGraph({x: 0, y: 0});
            const c2 = sigma.viewportToGraph({x: container.clientWidth, y: container.clientHeight});
            const p1 = project(c1.x, c1.y);
            const p2 = project(c2.x, c2.y);

            const rx = Math.min(p1.sx, p2.sx);
            const ry = Math.min(p1.sy, p2.sy);
            const rw = Math.abs(p2.sx - p1.sx);
            const rh = Math.abs(p2.sy - p1.sy);

            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, rw, rh);
        };

        draw();
        const camera = sigma.getCamera();
        camera.on('updated', draw);
        return () => {
            camera.removeListener('updated', draw);
        };
    }, [sigma, fullGraph]);

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const bounds = boundsRef.current;
        if (!bounds) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        const gw = bounds.maxX - bounds.minX || 1;
        const gh = bounds.maxY - bounds.minY || 1;
        const scale = Math.min((W - PAD * 2) / gw, (H - PAD * 2) / gh);
        const ox = PAD + ((W - PAD * 2) - gw * scale) / 2;
        const oy = PAD + ((H - PAD * 2) - gh * scale) / 2;

        const gx = (cx - ox) / scale + bounds.minX;
        const gy = (cy - oy) / scale + bounds.minY;

        sigma.getCamera().animate({x: gx, y: gy}, {duration: 300});
    };

    return (
        <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '5px',
            overflow: 'hidden',
            zIndex: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
            cursor: 'crosshair',
        }}>
            <canvas
                ref={canvasRef}
                width={W}
                height={H}
                onClick={handleClick}
            />
        </div>
    );
}
