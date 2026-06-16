interface NodePos {
  id: string;
  x: number;
  y: number;
}

let nodesMap: Map<string, { x: number; y: number }> | null = null;
let ranked: string[] = [];

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (!data || !data.type) return;

  if (data.type === "init") {
    const nodes: NodePos[] = data.nodes;
    ranked = data.rankedNodeIds || [];
    nodesMap = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    // acknowledge
    self.postMessage({ type: "init:ack" });
    return;
  }

  if (data.type === "query") {
    const jobId: number = data.jobId;
    const bounds = data.bounds;
    const limit: number = data.limit || 1000;
    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;

    const out: string[] = [];
    if (!nodesMap) {
      self.postMessage({ type: "result", jobId, ids: out });
      return;
    }

    for (const id of ranked) {
      const p = nodesMap.get(id);
      if (!p) continue;
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
        out.push(id);
        if (out.length >= limit) break;
      }
    }

    self.postMessage({ type: "result", jobId, ids: out });
    return;
  }
};

export {};
