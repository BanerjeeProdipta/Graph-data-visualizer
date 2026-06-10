import {useEffect, useState} from 'react';
import {useSigma} from '@react-sigma/core';
import {Minus, Plus, Crosshair} from 'lucide-react';

export function ZoomControls() {
    const sigma = useSigma();
    const [zoomPct, setZoomPct] = useState(() => Math.round(100 / sigma.getCamera().ratio));

    useEffect(() => {
        const camera = sigma.getCamera();
        const update = () => setZoomPct(Math.round(100 / camera.ratio));
        camera.on('updated', update);
        return () => { camera.removeListener('updated', update); };
    }, [sigma]);

    const handleZoomIn = () => sigma.getCamera().animatedZoom({duration: 150});
    const handleZoomOut = () => sigma.getCamera().animatedUnzoom({duration: 150});
    const handleCenter = () => sigma.getCamera().animatedReset({duration: 300});

    return (
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-center gap-1">
            <button
                type="button"
                onClick={handleZoomIn}
                className="flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white"
                title="Zoom in"
            >
                <Plus size={16}/>
            </button>
            <button
                type="button"
                onClick={handleZoomOut}
                className="flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white"
                title="Zoom out"
            >
                <Minus size={16}/>
            </button>
            <button
                type="button"
                onClick={handleCenter}
                className="flex h-8 w-8 items-center justify-center rounded border border-white/15 bg-black/60 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white"
                title="Reset view"
            >
                <Crosshair size={14}/>
            </button>
            <div className="mt-1 w-8 rounded border border-white/15 bg-black/60 py-1 text-center text-[10px] leading-none text-white/50 backdrop-blur-sm tabular-nums">
                {zoomPct}%
            </div>
        </div>
    );
}
