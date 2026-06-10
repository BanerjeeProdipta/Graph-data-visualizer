import Graph from 'graphology';

export interface ArtistMatch {
    id: string;
    label: string;
    genre: string;
    score: number;
}

function fuzzyScore(query: string, label: string): number {
    const q = query.toLowerCase();
    const l = label.toLowerCase();

    if (l === q) return 100;
    if (l.startsWith(q)) return 90;
    if (l.includes(q)) return 80;

    // Subsequence match: all query chars appear in label in order (handles typos,
    // missing characters, and extra characters — e.g. "radhead" → "Radiohead").
    let qi = 0;
    for (let li = 0; li < l.length && qi < q.length; li++) {
        if (q[qi] === l[li]) qi++;
    }
    if (qi === q.length) return 60;

    return 0;
}

// Scans the ranked id list (most-followed first) and returns the top `limit` artists
// whose labels fuzzy-match the query, scored by match quality then popularity.
export function searchArtistsByLabel(
    graph: Graph, rankedNodeIds: string[], query: string, limit = 8
): ArtistMatch[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const matches: ArtistMatch[] = [];
    const MAX_SCAN = 100_000;

    for (let i = 0; i < rankedNodeIds.length && i < MAX_SCAN; i++) {
        const id = rankedNodeIds[i];
        const label = graph.getNodeAttribute(id, 'label') as string;
        if (!label) continue;

        const score = fuzzyScore(needle, label as string);
        if (score === 0) continue;

        // Insert in score-descending order (tie goes to earlier in ranked list = more followers)
        const match: ArtistMatch = {id, label: label as string, genre: graph.getNodeAttribute(id, 'genre') as string, score};
        const insertAt = matches.findIndex((m) => score > m.score);
        if (insertAt === -1) {
            if (matches.length < limit) matches.push(match);
        } else {
            matches.splice(insertAt, 0, match);
            if (matches.length > limit) matches.pop();
        }
    }

    return matches;
}

export function collectGenres(graph: Graph): string[] {
    const genres = new Set<string>();
    graph.forEachNode((_id, attributes) => {
        if (attributes.genre) genres.add(attributes.genre as string);
    });
    return Array.from(genres).sort();
}

export function collectGenreCounts(graph: Graph): Map<string, number> {
    const counts = new Map<string, number>();
    graph.forEachNode((_id, attributes) => {
        const genre = attributes.genre as string;
        if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    });
    return counts;
}

// Returns a genre→color map, using the color of the most-followed artist in each genre
// (rankedNodeIds is most-followed first, so the first hit per genre is its champion).
export function collectGenreColors(graph: Graph, rankedNodeIds: string[]): Map<string, string> {
    const colors = new Map<string, string>();
    for (const id of rankedNodeIds) {
        const genre = graph.getNodeAttribute(id, 'genre') as string;
        const color = graph.getNodeAttribute(id, 'color') as string;
        if (genre && color && !colors.has(genre)) {
            colors.set(genre, color);
        }
    }
    return colors;
}

// Returns the most-followed artists for a genre (capped) so that selecting a genre
// highlights its leading artists rather than dumping potentially tens of thousands
// of nodes into the renderer at once.
export function topNodesByGenre(graph: Graph, rankedNodeIds: string[], genre: string, limit = 300): string[] {
    const ids: string[] = [];
    for (const id of rankedNodeIds) {
        if (graph.getNodeAttribute(id, 'genre') === genre) {
            ids.push(id);
            if (ids.length >= limit) break;
        }
    }
    return ids;
}
