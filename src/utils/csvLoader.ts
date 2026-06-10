import Papa from 'papaparse';
import Graph from 'graphology';

// Real sizes are assigned by `applyWeightedNodeSizes` once the whole graph is loaded
// (it needs the global max follower count to weight against); this is just a valid,
// inert value to satisfy sigma until that pass runs.
const MIN_PLACEHOLDER_SIZE = 0.4;

interface NodeData {
    artist_id: string;
    label: string;
    cluster_id: string;
    X: number;
    Y: number;
    artist_node_size: number;
    color: string;
    followers_new: number;
    popularity_growth: number;
    genre: string;
    top_country: string;
}

interface EdgeData {
    Source: string;
    Target: string;
}

function parseCsv<T>(text: string, step: (row: T) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        Papa.parse<T>(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            step: (results) => step(results.data),
            complete: () => resolve(),
            error: (error: Error) => reject(error)
        });
    });
}

export async function loadGraphData(): Promise<Graph> {
    const graph = new Graph();
    const includedNodeIds = new Set<string>();

    const nodesResponse = await fetch('/nodes.csv');
    const nodesText = await nodesResponse.text();

    await parseCsv<NodeData>(nodesText, (node) => {
        if (!node.artist_id) return;

        includedNodeIds.add(node.artist_id);
        graph.addNode(node.artist_id, {
            // `dynamicTyping` turns purely-numeric values into JS numbers, which would
            // otherwise crash any code calling string methods on a band named e.g. "311".
            label: node.label != null ? String(node.label) : '',
            x: node.X || 0,
            y: node.Y || 0,
            // Placeholder — `applyWeightedNodeSizes` overwrites this with a size weighted
            // by relative importance once the full dataset (and its max followers) is known.
            size: MIN_PLACEHOLDER_SIZE,
            color: node.color || '#999999',
            cluster_id: node.cluster_id,
            followers_new: node.followers_new,
            popularity_growth: node.popularity_growth,
            genre: node.genre != null ? String(node.genre) : '',
            top_country: node.top_country || ''
        });
    });

    const edgesResponse = await fetch('/egdes.csv');
    const edgesText = await edgesResponse.text();

    await parseCsv<EdgeData>(edgesText, (edge) => {
        if (!edge.Source || !edge.Target) return;
        if (!includedNodeIds.has(edge.Source) || !includedNodeIds.has(edge.Target)) return;

        graph.mergeEdge(edge.Source, edge.Target);
    });

    return graph;
}