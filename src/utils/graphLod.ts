import Graph from "graphology";

// Visual size range (in screen pixels — sigma's default `itemSizesReference: "screen"`
// keeps these constant regardless of zoom) that every node's weighted size is mapped into.
const MIN_NODE_SIZE = 0.5;
const MAX_NODE_SIZE = 2;

// Replaces each node's raw CSV size with one weighted by its relative importance
// (follower count), mapped into a fixed, small pixel range. The source data assigns
// almost every node virtually the same `artist_node_size`, so the old `size` formula
// rendered the entire ~310K-node long tail at nearly the same large radius — massive
// GPU overdraw that made panning/zooming sluggish. Follower counts are also extremely
// skewed (median ~4.6K vs a max of ~152M), so we weight on a log scale: the long tail
// of minor artists collapses toward `MIN_NODE_SIZE` while the handful of major artists
// stand out near `MAX_NODE_SIZE`. Run once, globally, right after load — before the
// graph is ever handed to sigma — so rendering never has to compute or re-derive sizes.
export function applyWeightedNodeSizes(
  graph: Graph,
  minSize = MIN_NODE_SIZE,
  maxSize = MAX_NODE_SIZE,
): void {
  let maxFollowers = 0;
  graph.forEachNode((_id, attributes) => {
    const followers = (attributes.followers_new as number) || 0;
    if (followers > maxFollowers) maxFollowers = followers;
  });

  const logMax = Math.log1p(maxFollowers) || 1;
  graph.forEachNode((id, attributes) => {
    const followers = (attributes.followers_new as number) || 0;
    const weight = Math.log1p(followers) / logMax;
    graph.setNodeAttribute(id, "size", minSize + weight * (maxSize - minSize));
  });
}

// Returns every node id, ranked by follower count (most-followed first). Used both
// to pick which nodes belong in the lightweight "overview" graph and to surface the
// most relevant matches first when searching.
export function rankNodesByImportance(graph: Graph): string[] {
  return graph
    .nodes()
    .sort(
      (a, b) =>
        ((graph.getNodeAttribute(b, "followers_new") as number) || 0) -
        ((graph.getNodeAttribute(a, "followers_new") as number) || 0),
    );
}

// Normalize node coordinates so the whole dataset fits inside a unit circle
// centered at (0,0). Useful when the rendering/clip expects data in [-1,1].
export function normalizeToCircle(graph: Graph): void {
  const n = graph.order;
  if (!n) return;

  // Centroid
  let cx = 0;
  let cy = 0;
  graph.forEachNode((_id, a) => {
    const x = Number((a as any).x) || 0;
    const y = Number((a as any).y) || 0;
    cx += x;
    cy += y;
  });
  cx /= n;
  cy /= n;

  // Max radius from centroid
  let maxR = 0;
  graph.forEachNode((_id, a) => {
    const x = Number((a as any).x) || 0;
    const y = Number((a as any).y) || 0;
    const d = Math.hypot(x - cx, y - cy);
    if (d > maxR) maxR = d;
  });

  if (maxR <= 0) {
    // Degenerate: collapse to origin
    graph.forEachNode((id) => {
      graph.setNodeAttribute(id, "x", 0);
      graph.setNodeAttribute(id, "y", 0);
    });
    return;
  }

  // Remap into unit circle
  graph.forEachNode((id, a) => {
    const x = Number((a as any).x) || 0;
    const y = Number((a as any).y) || 0;
    graph.setNodeAttribute(id, "x", (x - cx) / maxR);
    graph.setNodeAttribute(id, "y", (y - cy) / maxR);
  });
}

export interface GraphBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// Walks the ranked id list (most-followed first) and collects the ids whose graph
// position falls inside `bounds`, stopping at `limit`. This is the core of viewport
// culling: whatever the camera is currently looking at, only up to `limit` of the
// most-relevant nodes in that region are ever handed to the renderer — keeping the
// GPU buffers small no matter how far the user zooms in or out.
export function nodesInViewport(
  graph: Graph,
  rankedNodeIds: string[],
  bounds: GraphBounds,
  limit: number,
): string[] {
  const ids: string[] = [];
  for (const id of rankedNodeIds) {
    const x = graph.getNodeAttribute(id, "x") as number;
    const y = graph.getNodeAttribute(id, "y") as number;
    if (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      y >= bounds.minY &&
      y <= bounds.maxY
    ) {
      ids.push(id);
      if (ids.length >= limit) break;
    }
  }
  return ids;
}

// Blends two hex colors into an rgba string at a given alpha. Used to give each edge a
// color that visually bridges its source and target nodes — the 50/50 mix of both endpoint
// colors makes edges feel like a smooth gradient connection rather than a monochrome line.
export function blendHexColors(c1: string, c2: string, alpha = 0.12): string {
  const r1 = parseInt(c1.slice(1, 3), 16);
  const g1 = parseInt(c1.slice(3, 5), 16);
  const b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16);
  const g2 = parseInt(c2.slice(3, 5), 16);
  const b2 = parseInt(c2.slice(5, 7), 16);
  return `rgba(${Math.round((r1 + r2) / 2)},${Math.round((g1 + g2) / 2)},${Math.round((b1 + b2) / 2)},${alpha})`;
}

// Builds a smaller graph containing only the given node ids and the edges between them.
// This is what keeps the renderer's buffers small when zoomed out: instead of asking
// sigma to deal with the full ~310K nodes / ~1.3M edges, it only ever sees this subset.
// Edge colors are pre-computed as a 50/50 blend of source and target node colors at 5%
// opacity so that the accumulated glow of many edges reveals cluster structure naturally.
//
// Iterates edges per visible node (O(sum of visible node degrees)) instead of scanning
// the entire ~1.3M-edge list, which was the dominant CPU cost on every pan/zoom rebuild.
export function buildSubgraph(
  full: Graph,
  nodeIds: ReadonlySet<string>,
): Graph {
  const sub = new Graph();
  const addedEdges = new Set<string>();

  nodeIds.forEach((id) => sub.addNode(id, full.getNodeAttributes(id)));
  nodeIds.forEach((id) => {
    full.forEachEdge(id, (edge, _attributes, source, target) => {
      if (addedEdges.has(edge)) return;
      if (nodeIds.has(source) && nodeIds.has(target)) {
        addedEdges.add(edge);
        const sColor = full.getNodeAttribute(source, "color") as string;
        const tColor = full.getNodeAttribute(target, "color") as string;
        const blended = blendHexColors(sColor, tColor);
        sub.addEdgeWithKey(edge, source, target, {
          type: "curved",
          color: blended,
          ..._attributes,
        });
      }
    });
  });

  return sub;
}
