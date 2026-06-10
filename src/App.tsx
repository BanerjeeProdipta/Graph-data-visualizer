import { useCallback, useEffect, useRef, useState } from "react";
import {
  SigmaContainer,
  useCamera,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { loadGraphData } from "./utils/csvLoader";
import {
  applyWeightedNodeSizes,
  buildSubgraph,
  nodesInViewport,
  rankNodesByImportance,
} from "./utils/graphLod";
import {
  collectGenreColors,
  collectGenreCounts,
  collectGenres,
  topNodesByGenre,
} from "./utils/graphSearch";
import { GraphSearch } from "./components/GraphSearch";
import { GraphLegend } from "./components/GraphLegend";
import { ZoomControls } from "./components/ZoomControls";
import { NodeInfoPanel } from "./components/NodeInfoPanel";
import { Minimap } from "./components/Minimap";
import { buildNodeInfo } from "./utils/nodeInfo";
import Graph from "graphology";
import { NodeCircleProgram } from "sigma/rendering";
import EdgeCurveProgram from "@sigma/edge-curve";

// Hard cap on how many nodes are ever handed to sigma at once. This — not the camera
// zoom level — is the actual lever for keeping the GPU buffers small: whatever region
// the camera is currently looking at, only the `MAX_VISIBLE_NODES` most-followed nodes
// in that region get rendered, whether that region is the whole graph (zoomed out) or
// a tiny corner of it (zoomed in). This avoids ever pushing the full ~310K nodes /
// ~1.3M edges to the GPU, at any zoom level.
const MAX_VISIBLE_NODES = 25000;

// Extra padding (as a fraction of the viewport's graph-space size) added around the
// camera's visible region before culling, so nodes just outside the frame are already
// loaded by the time they scroll into view instead of popping in.
const VIEWPORT_MARGIN_RATIO = 0.35;

// How long to wait after the camera stops moving before rebuilding the visible subgraph.
// Rebuilding on every single 'updated' event (which fires per-frame during animations)
// would itself become the performance bottleneck.
const REBUILD_DEBOUNCE_MS = 100;

// Camera-ratio cutover for edge rendering — sigma's ratio shrinks as the user zooms in.
// Above this ratio (zoomed out), the visible subgraph can still contain thousands of
// nodes, so drawing their edges too would be both visual mush and a frame-rate killer;
// only top-node and hovered edges are drawn. At or below it (zoomed in), the
// viewport-culled subgraph is small enough that drawing all of its edges adds useful
// detail cheaply.
const EDGE_VISIBILITY_RATIO = 1.2;

// Number of highest-follower nodes whose edges are always visible even when zoomed out,
// so the most important connectivity structure is always apparent at a glance.
const TOP_EDGE_NODE_COUNT = 600;

// Darkens a hex color by multiplying each RGB channel by `factor` (0–1), keeping
// it as a hex string so sigma's WebGL pipeline never receives a raw rgba string
// (which it can't parse and would render as white/NaN). Used for hover-dim and
// search-highlight-dimming without breaking the rendering pipeline.
function dimHex(color: string, factor: number): string {
  if (!color.startsWith("#") || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const toHex = (n: number) =>
    Math.round(Math.min(n * factor, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface SearchAssets {
  graph: Graph;
  rankedNodeIds: string[];
  genres: string[];
  genreColors: Map<string, string>;
  genreCounts: Map<string, number>;
}

function GraphLoader() {
  const sigma = useSigma();
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const setSettings = useSetSettings();
  const { gotoNode } = useCamera();

  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(
    new Set(),
  );
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    info: ReturnType<typeof buildNodeInfo>;
  } | null>(null);
  const [searchAssets, setSearchAssets] = useState<SearchAssets | null>(null);
  const [minimapGraph, setMinimapGraph] = useState<Graph | null>(null);

  const fullGraphRef = useRef<Graph | null>(null);
  const rankedNodeIdsRef = useRef<string[]>([]);
  const highlightedRef = useRef<ReadonlySet<string>>(new Set());
  const rebuildTimeoutRef = useRef<number | null>(null);
  const graphBBoxRef = useRef<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);
  // Tracks the camera's current zoom ratio for the edge-visibility LOD check below.
  // Kept in a ref (not state) because the camera fires 'updated' many times per second
  // during a zoom gesture — routing that through React state would itself cause lag.
  const cameraRatioRef = useRef(sigma.getCamera().ratio);
  const topEdgeNodeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    highlightedRef.current = highlightedNodes;
  }, [highlightedNodes]);

  // Rebuilds the rendered subgraph to contain only the most-followed nodes that fall
  // within the camera's current visible region (plus a margin and any search-highlighted
  // nodes). This is what actually bounds GPU memory/buffer size: no matter how far the
  // user zooms in or out, sigma only ever sees up to `MAX_VISIBLE_NODES` nodes — never
  // the full ~310K/1.3M dataset.
  const rebuildVisibleSubgraph = useCallback(() => {
    const fullGraph = fullGraphRef.current;
    const rankedNodeIds = rankedNodeIdsRef.current;
    if (!fullGraph || !rankedNodeIds.length) return;

    let ids: Set<string>;

    if (sigma.getGraph().order === 0) {
      // Nothing is rendered yet, so sigma's viewport isn't framed to the real
      // dataset's coordinate space — `viewportToGraph` would return meaningless
      // values here. Seed the view with the globally most-followed nodes; once
      // the camera moves over real data, the viewport-based culling below
      // (driven by camera 'updated' events) takes over.
      ids = new Set(rankedNodeIds.slice(0, MAX_VISIBLE_NODES));
    } else {
      const container = sigma.getContainer();
      const corner1 = sigma.viewportToGraph({ x: 0, y: 0 });
      const corner2 = sigma.viewportToGraph({
        x: container.clientWidth,
        y: container.clientHeight,
      });

      const minX = Math.min(corner1.x, corner2.x);
      const maxX = Math.max(corner1.x, corner2.x);
      const minY = Math.min(corner1.y, corner2.y);
      const maxY = Math.max(corner1.y, corner2.y);
      const marginX = (maxX - minX) * VIEWPORT_MARGIN_RATIO;
      const marginY = (maxY - minY) * VIEWPORT_MARGIN_RATIO;

      ids = new Set(
        nodesInViewport(
          fullGraph,
          rankedNodeIds,
          {
            minX: minX - marginX,
            maxX: maxX + marginX,
            minY: minY - marginY,
            maxY: maxY + marginY,
          },
          MAX_VISIBLE_NODES,
        ),
      );
    }

    highlightedRef.current.forEach((id) => ids.add(id));
    loadGraph(buildSubgraph(fullGraph, ids));
  }, [loadGraph, sigma]);

  // Debounces rebuilds so a pan/zoom gesture (which fires many 'updated' events per
  // second) triggers one rebuild after the camera settles, not dozens mid-gesture.
  const scheduleRebuild = useCallback(() => {
    if (rebuildTimeoutRef.current != null)
      window.clearTimeout(rebuildTimeoutRef.current);
    rebuildTimeoutRef.current = window.setTimeout(() => {
      rebuildTimeoutRef.current = null;
      rebuildVisibleSubgraph();
    }, REBUILD_DEBOUNCE_MS);
  }, [rebuildVisibleSubgraph]);

  useEffect(() => {
    let cancelled = false;

    loadGraphData()
      .then((graph) => {
        if (cancelled) return;

        // Weight node sizes by relative importance once, globally, before anything
        // is ever rendered — see `applyWeightedNodeSizes` for why this replaces the
        // raw per-row CSV size.
        applyWeightedNodeSizes(graph);

        fullGraphRef.current = graph;
        rankedNodeIdsRef.current = rankNodesByImportance(graph);
        topEdgeNodeIdsRef.current = new Set(
          rankedNodeIdsRef.current.slice(0, TOP_EDGE_NODE_COUNT),
        );

        // Lock the coordinate system to the full graph's bounding box so that
        // loading different subgraphs doesn't recompute the normalization function.
        // Without this, each subgraph rebuild shifts sigma's internal coordinate
        // mapping based on the currently-visible nodes' extent — causing the camera
        // to drift away from the cursor during zoom.
        let xMin = Infinity,
          xMax = -Infinity,
          yMin = Infinity,
          yMax = -Infinity;
        graph.forEachNode((_, attr) => {
          if (attr.x < xMin) xMin = attr.x;
          if (attr.x > xMax) xMax = attr.x;
          if (attr.y < yMin) yMin = attr.y;
          if (attr.y > yMax) yMax = attr.y;
        });
        sigma.setCustomBBox({ x: [xMin, xMax], y: [yMin, yMax] });
        graphBBoxRef.current = {
          minX: xMin,
          maxX: xMax,
          minY: yMin,
          maxY: yMax,
        };

        setSearchAssets({
          graph,
          rankedNodeIds: rankedNodeIdsRef.current,
          genres: collectGenres(graph),
          genreColors: collectGenreColors(graph, rankedNodeIdsRef.current),
          genreCounts: collectGenreCounts(graph),
        });
        setMinimapGraph(graph);
        rebuildVisibleSubgraph();
        setLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load graph data:", error);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rebuildVisibleSubgraph]);

  // Keeps the rendered subgraph in sync with whatever region the camera is looking at,
  // and records the current zoom ratio so the edge-visibility LOD reflects it immediately
  // (recording the ratio is cheap and must not wait for the rebuild's debounce).
  useEffect(() => {
    const camera = sigma.getCamera();
    const handleCameraUpdate = () => {
      cameraRatioRef.current = camera.ratio;
      scheduleRebuild();
    };
    camera.on("updated", handleCameraUpdate);
    return () => {
      camera.removeListener("updated", handleCameraUpdate);
      if (rebuildTimeoutRef.current != null)
        window.clearTimeout(rebuildTimeoutRef.current);
    };
  }, [sigma, scheduleRebuild]);

  // Clamp camera center to graph bounding box so user cannot drag outside model area
  useEffect(() => {
    const camera = sigma.getCamera();
    const handleClamp = () => {
      const b = graphBBoxRef.current;
      if (!b) return;
      const container = sigma.getContainer();
      const c1 = sigma.viewportToGraph({ x: 0, y: 0 });
      const c2 = sigma.viewportToGraph({
        x: container.clientWidth,
        y: container.clientHeight,
      });
      const cx = (c1.x + c2.x) / 2;
      const cy = (c1.y + c2.y) / 2;
      const hx = Math.abs(c2.x - c1.x) / 2;
      const hy = Math.abs(c2.y - c1.y) / 2;

      let targetX = cx;
      let targetY = cy;

      const minCX = b.minX + hx;
      const maxCX = b.maxX - hx;
      const minCY = b.minY + hy;
      const maxCY = b.maxY - hy;

      if (minCX > maxCX) {
        targetX = (b.minX + b.maxX) / 2;
      } else {
        if (cx < minCX) targetX = minCX;
        if (cx > maxCX) targetX = maxCX;
      }

      if (minCY > maxCY) {
        targetY = (b.minY + b.maxY) / 2;
      } else {
        if (cy < minCY) targetY = minCY;
        if (cy > maxCY) targetY = maxCY;
      }

      if (Math.abs(targetX - cx) > 1e-6 || Math.abs(targetY - cy) > 1e-6) {
        camera.animate({ x: targetX, y: targetY }, { duration: 120 });
      }
    };

    camera.on("updated", handleClamp);
    return () => camera.removeListener("updated", handleClamp);
  }, [sigma]);

  useEffect(() => {
    registerEvents({
      enterNode: (event) => setHoveredNode(event.node),
      leaveNode: () => setHoveredNode(null),
      clickNode: (event) => {
        const fg = fullGraphRef.current;
        if (!fg) return;
        setSelectedNode({
          id: event.node,
          info: buildNodeInfo(fg, event.node),
        });
      },
      clickStage: () => setSelectedNode(null),
    });
  }, [registerEvents]);

  // Edge and node level-of-detail reducer: edges use pre-computed source–target blended
  // colors (computed in buildSubgraph at 5% opacity) so the accumulated glow from
  // overlapping edges reveals cluster structure; hovered edges brighten to white for
  // clarity. The node reducer gives the hovered artist a black label (readable on the
  // colored circle) and dims non-highlighted nodes during search/genre selection.
  useEffect(() => {
    const graph = sigma.getGraph();
    setSettings({
      edgeReducer: (edge, data) => {
        const src = graph.source(edge);
        const tgt = graph.target(edge);
        const ratio = cameraRatioRef.current;
        // Thinner edges as you zoom in so they don't visually overwhelm the nodes.
        const edgeSize = Math.max(0.05, 0.5 * ratio);
        const connectedToHovered =
          hoveredNode && (src === hoveredNode || tgt === hoveredNode);
        if (ratio <= EDGE_VISIBILITY_RATIO) {
          // Zoomed in — show all edges; hovered ones brighten to white at 60%.
          return connectedToHovered
            ? { ...data, color: "rgba(255, 255, 255, 0.6)", size: edgeSize }
            : { ...data, size: edgeSize };
        }
        // Zoomed out — show hovered edges at 60% white, top-node edges at
        // their blended color, everything else hidden.
        if (connectedToHovered)
          return { ...data, color: "rgba(255, 255, 255, 0.6)", size: edgeSize };
        const isTopEdge =
          topEdgeNodeIdsRef.current.has(src) ||
          topEdgeNodeIdsRef.current.has(tgt);
        if (isTopEdge) return { ...data, size: edgeSize };
        return { ...data, hidden: true };
      },
      nodeReducer: (node, data) => {
        let result = data;
        const isHovered = hoveredNode === node;
        const isHighlighted = highlightedNodes.has(node);

        // Default: 90% opacity (blend toward black background via hex darkening).
        // Hovered node: full 100% color + bigger + forced label.
        if (isHovered) {
          result = {
            ...result,
            size: result.size * 1.6,
            forceLabel: true,
            zIndex: 1,
          };
        } else {
          result = { ...result, color: dimHex(result.color, 0.9) };
        }

        // Highlight logic for search results / genre selection
        if (highlightedNodes.size > 0) {
          if (isHighlighted) {
            result = {
              ...result,
              size: result.size * 1.8,
              forceLabel: true,
              zIndex: 1,
            };
          } else if (!isHovered) {
            result = { ...result, color: dimHex(result.color, 0.7) };
          }
        }

        // LOD label suppression: as the user zooms in, sigma scales graph-unit
        // node sizes up in screen pixels. Once they exceed `labelRenderedSizeThreshold`
        // sigma forces a label on every visible node, causing dense label overlap.
        // We counter this by hiding labels on less-followed artists proportionally
        // to zoom depth — only hovered and highlighted nodes always keep their label.
        if (!isHovered && !isHighlighted) {
          const ratio = cameraRatioRef.current;
          if (ratio < 0.5) {
            const followers =
              (graph.getNodeAttribute(node, "followers_new") as number) || 0;
            // Raise the follower bar linearly as zoom increases so the number
            // of visible labels stays roughly constant regardless of zoom depth.
            const followerThreshold = 300_000 * (0.5 / ratio);
            if (followers < followerThreshold) {
              result = { ...result, label: "" };
            }
          }
        }

        return result;
      },
    });
  }, [hoveredNode, highlightedNodes, setSettings, sigma]);

  // Search results can point at nodes outside the currently-rendered detail level
  // (e.g. a niche artist while zoomed out). Merge them into the live sigma graph
  // directly so the camera can fly to them immediately; `showDetailLevel` keeps them
  // in place afterwards via `highlightedRef`.
  const focusOnNodes = useCallback(
    (ids: string[]) => {
      const fullGraph = fullGraphRef.current;
      if (!fullGraph || ids.length === 0) return;

      const sigmaGraph = sigma.getGraph();
      ids.forEach((id) => {
        if (!sigmaGraph.hasNode(id))
          sigmaGraph.mergeNode(id, fullGraph.getNodeAttributes(id));
      });

      if (ids.length === 1) {
        const nodeData = sigma.getNodeDisplayData(ids[0]);
        if (nodeData) {
          sigma
            .getCamera()
            .animate(
              { x: nodeData.x, y: nodeData.y, ratio: 0.02 },
              { duration: 600 },
            );
        }
        return;
      }

      const positions = ids
        .map((id) => sigma.getNodeDisplayData(id))
        .filter((data): data is NonNullable<typeof data> => Boolean(data));
      if (!positions.length) return;

      const x = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
      const y = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
      sigma.getCamera().animate({ x, y, ratio: 0.3 }, { duration: 600 });
    },
    [sigma, gotoNode],
  );

  const handleSelectArtist = useCallback(
    (id: string) => {
      setHighlightedNodes(new Set([id]));
      focusOnNodes([id]);
    },
    [focusOnNodes],
  );

  const handleSelectGenre = useCallback(
    (genre: string | null) => {
      const fullGraph = fullGraphRef.current;
      if (!genre || !fullGraph || !searchAssets) {
        setHighlightedNodes(new Set());
        return;
      }

      const ids = topNodesByGenre(fullGraph, searchAssets.rankedNodeIds, genre);
      setHighlightedNodes(new Set(ids));
      focusOnNodes(ids);
    },
    [searchAssets, focusOnNodes],
  );

  if (loading) {
    return (
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "24px",
          color: "white",
          zIndex: 10,
        }}
      >
        Loading graph data...
      </div>
    );
  }

  if (!searchAssets) return null;

  return (
    <>
      <GraphSearch
        graph={searchAssets.graph}
        rankedNodeIds={searchAssets.rankedNodeIds}
        genres={searchAssets.genres}
        genreColors={searchAssets.genreColors}
        genreCounts={searchAssets.genreCounts}
        onSelectArtist={handleSelectArtist}
        onSelectGenre={handleSelectGenre}
      />
      <GraphLegend />
      <ZoomControls />
      <Minimap fullGraph={minimapGraph} />
      {selectedNode && (
        <NodeInfoPanel
          info={selectedNode.info}
          onClose={() => setSelectedNode(null)}
          onSelectArtist={handleSelectArtist}
        />
      )}
    </>
  );
}

function App() {
  const [graph] = useState(() => new Graph());

  return (
    <SigmaContainer
      graph={graph}
      settings={{
        renderEdgeLabels: false,
        labelDensity: 0.07,
        labelGridCellSize: 60,
        labelColor: { color: "#000000" },
        labelRenderedSizeThreshold: 10,
        labelFont: "Arial",
        labelWeight: "bold",
        minEdgeThickness: 0.05,
        defaultNodeType: "circle",
        nodeProgramClasses: { circle: NodeCircleProgram },
        defaultEdgeType: "curved",
        edgeProgramClasses: { curved: EdgeCurveProgram },
        defaultEdgeColor: "rgba(255, 255, 255, 0.12)",
        hideEdgesOnMove: true,
        hideLabelsOnMove: true,
        zoomDuration: 100,
        doubleClickZoomingDuration: 100,
        minCameraRatio: 0.005,
        maxCameraRatio: 1,
      }}
      style={{
        height: "100vh",
        width: "100vw",
        background: "#000",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
        border: "1px solid rgba(255,255,255,0.15)",
        boxSizing: "border-box",
      }}
    >
      <GraphLoader />
    </SigmaContainer>
  );
}

export default App;
