export function GraphLegend() {
    return (
        <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/60 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/70"/>
                    Artist
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-px w-4 bg-white/40"/>
                    Collaboration
                </span>
            </div>
        </div>
    );
}
