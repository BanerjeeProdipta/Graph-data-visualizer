import Graph from 'graphology';

export interface NodeInfo {
    id: string;
    label: string;
    genre: string;
    followers: number;
    popularityGrowth: number;
    topCountry: string;
    clusterId: string;
    connections: {id: string; label: string; followers: number}[];
}

export function buildNodeInfo(fullGraph: Graph, nodeId: string): NodeInfo {
    const label = fullGraph.getNodeAttribute(nodeId, 'label') as string || 'Unknown';
    const genre = fullGraph.getNodeAttribute(nodeId, 'genre') as string || '';
    const followers = (fullGraph.getNodeAttribute(nodeId, 'followers_new') as number) || 0;
    const popularityGrowth = (fullGraph.getNodeAttribute(nodeId, 'popularity_growth') as number) || 0;
    const topCountry = fullGraph.getNodeAttribute(nodeId, 'top_country') as string || '';
    const clusterId = fullGraph.getNodeAttribute(nodeId, 'cluster_id') as string || '';

    const connections: {id: string; label: string; followers: number}[] = [];
    const seen = new Set<string>();

    fullGraph.forEachNeighbor(nodeId, (neighbor: string) => {
        if (seen.has(neighbor)) return;
        seen.add(neighbor);
        connections.push({
            id: neighbor,
            label: fullGraph.getNodeAttribute(neighbor, 'label') as string || neighbor,
            followers: (fullGraph.getNodeAttribute(neighbor, 'followers_new') as number) || 0,
        });
    });

    return {id: nodeId, label, genre, followers, popularityGrowth, topCountry, clusterId, connections};
}
