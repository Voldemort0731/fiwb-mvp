"use client";
import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    useReactFlow,
    ReactFlowProvider,
    Handle,
    Position,
    type NodeProps,
    type Edge,
    type Node,
} from "@xyflow/react";

import Sidebar from "@/components/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sparkles, BookOpen, ChevronLeft, X, Loader2,
    Zap, Network, LayoutGrid, FocusIcon, RefreshCw,
    Search, FileText, MessageSquare, ChevronRight,
    AlignLeft, GitBranch, Circle, CheckCircle2, Info,
    Download, Eye, Layers, ArrowRight
} from "lucide-react";
import clsx from "clsx";
import { API_URL } from "@/utils/config";

/* ─────────────── TYPE DEFINITIONS ─────────────── */

interface MindMapCitation {
    source: string;
    page?: number;
    snippet?: string;
    material_id?: string;
}

interface MindMapNode {
    id: string;
    label: string;
    level: number;
    definition: string;
    citations?: MindMapCitation[];
}

interface MindMapEdge {
    id: string;
    source: string;
    target: string;
    label: string;
    type: string;
}

interface GraphData {
    title: string;
    nodes: MindMapNode[];
    edges: MindMapEdge[];
    sources: { id: string; title: string; type: string }[];
    course_name: string;
    total_materials: number;
}

interface SourceMaterial {
    id: string; // Database ID
    title: string;
    type: string;
    file_id?: string; // Google Drive ID
}

/* ─────────────── LAYOUT ALGORITHM ─────────────── */

function computeLayout(nodes: MindMapNode[], edges: MindMapEdge[]) {
    const levelGroups: Record<number, MindMapNode[]> = {};
    nodes.forEach(n => {
        if (!levelGroups[n.level]) levelGroups[n.level] = [];
        levelGroups[n.level].push(n);
    });

    const positions: Record<string, { x: number; y: number }> = {};
    const LEVEL_GAP = 280;
    const NODE_GAP = 220;

    Object.entries(levelGroups).forEach(([lvl, group]) => {
        const level = parseInt(lvl);
        const totalWidth = (group.length - 1) * NODE_GAP;
        group.forEach((node, i) => {
            positions[node.id] = {
                x: i * NODE_GAP - totalWidth / 2,
                y: level * LEVEL_GAP
            };
        });
    });

    return positions;
}

/* ─────────────── COLORS ─────────────── */

const LEVEL_COLORS = [
    { bg: "linear-gradient(135deg, #3b82f6, #6366f1)", border: "#6366f1", text: "#fff", glow: "rgba(99,102,241,0.35)" },
    { bg: "linear-gradient(135deg, #0ea5e9, #06b6d4)", border: "#06b6d4", text: "#fff", glow: "rgba(6,182,212,0.3)" },
    { bg: "linear-gradient(135deg, #10b981, #34d399)", border: "#10b981", text: "#fff", glow: "rgba(16,185,129,0.3)" },
    { bg: "linear-gradient(135deg, #f59e0b, #fbbf24)", border: "#f59e0b", text: "#fff", glow: "rgba(245,158,11,0.3)" },
];

const EDGE_COLORS: Record<string, string> = {
    hierarchical: "#6366f1",
    related: "#06b6d4",
    prerequisite: "#f59e0b",
};

const EDGE_DASH: Record<string, string | undefined> = {
    hierarchical: undefined,
    related: "6,4",
    prerequisite: "3,3",
};

/* ─────────────── CUSTOM NODE COMPONENT ─────────────── */

function ConceptNode({ data, selected }: NodeProps) {
    const color = LEVEL_COLORS[Math.min(data.level as number, LEVEL_COLORS.length - 1)];
    const isRoot = data.level === 0;

    return (
        <>
            <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
            <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                    background: color.bg,
                    border: `2px solid ${selected ? "#fff" : color.border}`,
                    boxShadow: `0 0 ${selected ? 24 : 12}px ${color.glow}, 0 4px 24px rgba(0,0,0,0.4)`,
                    minWidth: isRoot ? 180 : 140,
                    maxWidth: isRoot ? 220 : 180,
                    borderRadius: isRoot ? "20px" : "14px",
                    padding: isRoot ? "14px 20px" : "10px 16px",
                    cursor: "pointer",
                    transition: "box-shadow 0.2s",
                }}
                className="flex flex-col items-center text-center select-none"
            >
                {isRoot && (
                    <div className="mb-2">
                        <Network size={18} className="text-white/80" />
                    </div>
                )}
                <span
                    style={{
                        color: color.text,
                        fontSize: isRoot ? "13px" : "11px",
                        fontWeight: isRoot ? 800 : 700,
                        letterSpacing: isRoot ? "0.03em" : "0",
                        lineHeight: 1.3,
                    }}
                >
                    {data.label as string}
                </span>
                {(data.citations as any)?.length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap justify-center">
                        {(data.citations as any).slice(0, 3).map((cite: MindMapCitation, i: number) => (
                            <span
                                key={i}
                                style={{
                                    fontSize: "7px",
                                    background: "rgba(255,255,255,0.2)",
                                    padding: "1px 5px",
                                    borderRadius: "10px",
                                    color: "#fff",
                                    fontWeight: 600,
                                    maxWidth: "80px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {cite.source} {cite.page ? `• p. ${cite.page}` : ""}
                            </span>
                        ))}
                    </div>
                )}
            </motion.div>
            <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
        </>
    );
}

const nodeTypes = { concept: ConceptNode };

/* ─────────────── MAIN MIND MAP BODY  ─────────────── */

function MindMapBody() {
    const { course_id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [availableSources, setAvailableSources] = useState<SourceMaterial[]>([]);
    const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showColorBy, setShowColorBy] = useState<"level" | "source">("level");
    const [layoutMode, setLayoutMode] = useState<"hierarchical" | "radial">("hierarchical");
    const [threads, setThreads] = useState<any[]>([]);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
    const [activePage, setActivePage] = useState<number | null>(null);
    const [showReader, setShowReader] = useState(false);

    const userEmail = typeof window !== "undefined" ? localStorage.getItem("user_email") : null;
    const { fitView, setCenter } = useReactFlow();
    const iframeRef = useRef<HTMLIFrameElement>(null);

    /* ── Build ReactFlow nodes/edges from graph data ── */
    const buildFlowGraph = useCallback((data: GraphData) => {
        const positions = computeLayout(data.nodes, data.edges);

        const flowNodes: Node[] = data.nodes.map(n => ({
            id: n.id,
            type: "concept",
            position: positions[n.id] || { x: 0, y: 0 },
            data: {
                label: n.label,
                level: n.level,
                definition: n.definition,
                citations: n.citations,
                nodeData: n,
            },
            draggable: true,
        }));

        const flowEdges: Edge[] = data.edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: e.type === "related",
            style: {
                stroke: EDGE_COLORS[e.type] || "#6366f1",
                strokeWidth: e.type === "hierarchical" ? 2.5 : 1.5,
                strokeDasharray: EDGE_DASH[e.type],
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: EDGE_COLORS[e.type] || "#6366f1",
                width: 14,
                height: 14,
            },
            labelStyle: {
                fill: "#9ca3af",
                fontSize: 10,
                fontWeight: 600,
            },
            labelBgStyle: {
                fill: "#0a0a0a",
                fillOpacity: 0.8,
            },
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);

        setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 100);
    }, [setNodes, setEdges, fitView]);

    /* ── Generate mind map ── */
    const handleGenerate = useCallback(async (customIds?: string[]) => {
        if (!course_id || !userEmail) return;
        setGenerating(true);
        setError(null);
        setSelectedNode(null);
        setFocusedNodeId(null);

        try {
            const res = await fetch(`${API_URL}/api/mindmap/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_email: userEmail,
                    course_id,
                    material_ids: customIds || (selectedSourceIds.size > 0
                        ? Array.from(selectedSourceIds)
                        : undefined),
                }),
            });
            if (!res.ok) {
                let errMsg = "Generation failed";
                try { const err = await res.json(); errMsg = err.detail || errMsg; } catch { }
                throw new Error(errMsg);
            }
            const data: GraphData = await res.json();
            setGraphData(data);
            buildFlowGraph(data);
        } catch (e: any) {
            console.error("Mind map generation failed:", e);
            const msg = e.message || "";
            if (msg === "Failed to fetch") {
                setError("Neural link interrupted. This usually means the backend is restarting or your connection dropped. Please wait 10s and retry.");
            } else {
                setError(msg || "Failed to generate mind map. Please check your document selection.");
            }
        } finally {
            setGenerating(false);
        }
    }, [course_id, userEmail, selectedSourceIds, buildFlowGraph]);

    /* ── Fetch sidebar threads ── */
    useEffect(() => {
        if (!userEmail) return;
        fetch(`${API_URL}/api/chat/threads?user_email=${userEmail}`)
            .then(r => r.json()).then(setThreads).catch(() => { });
    }, [userEmail]);

    const hasAutoGenerated = useRef(false);

    /* ── Fetch available source materials ── */
    useEffect(() => {
        if (!course_id || !userEmail) return;
        setLoading(true);
        fetch(`${API_URL}/api/mindmap/sources/${course_id}?user_email=${userEmail}`)
            .then(r => r.json())
            .then(data => {
                setAvailableSources(data);

                // If a specific material is requested in URL, select ONLY that one
                const targetMatId = searchParams.get("material");
                if (targetMatId) {
                    const found = data.find((s: SourceMaterial) => s.id === targetMatId);
                    setSelectedSourceIds(new Set([targetMatId]));
                    // Crucial: Use file_id for the reader proxy, NOT the database id
                    setActiveMaterialId(found?.file_id || targetMatId);
                    setShowReader(true);

                    if (!hasAutoGenerated.current) {
                        hasAutoGenerated.current = true;
                        handleGenerate([targetMatId]);
                    }
                } else {
                    setSelectedSourceIds(new Set(data.map((s: SourceMaterial) => s.id)));
                }
            })
            .catch(e => setError("Failed to load course materials."))
            .finally(() => setLoading(false));
    }, [course_id, userEmail, searchParams, handleGenerate]); // handleGenerate is stable due to useCallback

    /* ── Re-fit view when reader is toggled ── */
    useEffect(() => {
        if (graphData) {
            setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 350); // wait for anim
        }
    }, [showReader, graphData, fitView]);

    /* ── Node click handler ── */
    const handleNodeClick = useCallback((_: any, node: Node) => {
        const nd = node.data.nodeData as MindMapNode;
        setSelectedNode(nd);
        setFocusedNodeId(node.id);

        // Sync with reader: if node has citations, open the first one in the reader
        if (nd.citations && nd.citations.length > 0) {
            const firstCite = nd.citations[0];
            if (firstCite.material_id) {
                setActiveMaterialId(firstCite.material_id);
                setActivePage(firstCite.page || null);
                setShowReader(true);
            }
        }

        setCenter(node.position.x + 90, node.position.y + 40, { zoom: 1.2, duration: 500 });
    }, [setCenter]);

    /* ── Focus mode: dim other nodes ── */
    useEffect(() => {
        if (!focusedNodeId) {
            setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
            setEdges(eds => eds.map(e => ({ ...e, style: { ...e.style, opacity: 1 } })));
            return;
        }
        const connectedNodeIds = new Set<string>([focusedNodeId]);
        edges.forEach(e => {
            if (e.source === focusedNodeId) connectedNodeIds.add(e.target);
            if (e.target === focusedNodeId) connectedNodeIds.add(e.source);
        });
        setNodes(nds => nds.map(n => ({
            ...n,
            style: { ...n.style, opacity: connectedNodeIds.has(n.id) ? 1 : 0.2 }
        })));
        setEdges(eds => eds.map(e => ({
            ...e,
            style: {
                ...e.style,
                opacity: connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target) ? 1 : 0.1
            }
        })));
    }, [focusedNodeId]);

    /* ── Search: highlight matching nodes ── */
    useEffect(() => {
        if (!searchQuery.trim()) {
            setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
            return;
        }
        const q = searchQuery.toLowerCase();
        setNodes(nds => nds.map(n => ({
            ...n,
            style: {
                ...n.style,
                opacity: (n.data.label as string).toLowerCase().includes(q) ? 1 : 0.2
            }
        })));
    }, [searchQuery]);

    const toggleSource = (id: string) => {
        setSelectedSourceIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const clearFocus = () => {
        setFocusedNodeId(null);
        setSelectedNode(null);
    };

    const typeIcon = (type: string) => {
        if (type === "announcement") return "📢";
        if (type === "assignment") return "📝";
        if (type === "material") return "📚";
        return "📄";
    };

    return (
        <div className="h-screen bg-[#050505] flex flex-row overflow-hidden font-sans">
            <Sidebar
                threads={threads}
                onDeleteThread={async (id) => {
                    await fetch(`${API_URL}/api/chat/threads/${id}?user_email=${userEmail}`, { method: "DELETE" });
                    setThreads(prev => prev.filter(t => t.id !== id));
                }}
            />

            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Header */}
                <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/60 backdrop-blur-xl z-20 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors group cursor-pointer"
                        >
                            <ChevronLeft size={18} className="text-gray-400 group-hover:text-white" />
                        </button>
                        <div className="h-4 w-[1px] bg-white/10" />
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
                                <Network size={14} className="text-indigo-400" />
                            </div>
                            <div>
                                <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest leading-none">Concept Graph</p>
                                <p className="text-xs text-white font-bold leading-tight truncate max-w-[200px]">
                                    {graphData?.course_name || "Mind Map"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Reader Toggle */}
                        <button
                            onClick={() => setShowReader(!showReader)}
                            className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs transition-all",
                                showReader
                                    ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
                                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                            )}
                        >
                            <BookOpen size={12} />
                            {showReader ? "Hide Reader" : "Split View"}
                        </button>

                        {/* Search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search concepts..."
                                className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 w-36"
                            />
                        </div>

                        {focusedNodeId && (
                            <button
                                onClick={clearFocus}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 hover:bg-indigo-600/30 transition-colors"
                            >
                                <Eye size={12} /> Exit Focus
                            </button>
                        )}

                        {graphData && (
                            <button
                                onClick={() => fitView({ padding: 0.1, duration: 600 })}
                                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
                                title="Fit view"
                            >
                                <LayoutGrid size={14} className="text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Reader Panel (if visible) */}
                    <AnimatePresence>
                        {showReader && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: "50%", opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="border-r border-white/10 bg-black flex flex-col overflow-hidden"
                            >
                                {activeMaterialId ? (
                                    <div className="flex-1 relative">
                                        <iframe
                                            key={`${activeMaterialId}-${activePage}`}
                                            ref={iframeRef}
                                            src={`${API_URL}/api/courses/proxy/drive/${activeMaterialId}?user_email=${userEmail}&_t=${Date.now()}${activePage ? `#page=${activePage}` : ""}`}
                                            className="w-full h-full border-none bg-white"
                                            title="Document Reader"
                                        />
                                        {/* Reader Header Overlay */}
                                        <div className="absolute top-0 left-0 right-0 h-10 bg-black/80 backdrop-blur flex items-center justify-between px-4 border-b border-white/5">
                                            <p className="text-[10px] text-gray-400 font-bold truncate"> Reference: {availableSources.find(s => s.id === activeMaterialId)?.title}</p>
                                            <button
                                                onClick={() => setShowReader(false)}
                                                className="p-1 hover:bg-white/10 rounded"
                                            >
                                                <X size={12} className="text-gray-500" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-gray-500">
                                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                                            <FileText size={32} />
                                        </div>
                                        <h3 className="text-sm font-bold text-white mb-1">Interactive Reader</h3>
                                        <p className="text-xs">Click any concept node to jump to its source document.</p>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Left Sources Panel */}
                    <div className="w-72 border-r border-white/5 bg-black/40 backdrop-blur overflow-y-auto flex-shrink-0 flex flex-col">
                        <div className="p-5 border-b border-white/5">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">Document Sources</p>

                            {loading ? (
                                <div className="space-y-2">
                                    {[1, 2, 3].map(i => <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />)}
                                </div>
                            ) : availableSources.length === 0 ? (
                                <p className="text-xs text-gray-500">No materials found. Sync your course first.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {availableSources.map(src => (
                                        <button
                                            key={src.id}
                                            onClick={() => toggleSource(src.id)}
                                            className={clsx(
                                                "w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all text-xs",
                                                selectedSourceIds.has(src.id)
                                                    ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-200"
                                                    : "bg-white/3 border-white/5 text-gray-500 hover:text-gray-300"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0",
                                                selectedSourceIds.has(src.id)
                                                    ? "bg-indigo-500 border-indigo-400"
                                                    : "border-white/20"
                                            )}>
                                                {selectedSourceIds.has(src.id) && <CheckCircle2 size={10} className="text-white" />}
                                            </div>
                                            <span className="text-[8px] mr-1">{typeIcon(src.type)}</span>
                                            <span className="truncate font-semibold leading-tight">{src.title}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Generate Button */}
                        <div className="p-5 space-y-3">
                            <button
                                onClick={() => handleGenerate()}
                                disabled={generating || selectedSourceIds.size === 0}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl font-bold text-sm transition-all bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/20 cursor-pointer disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed"
                            >
                                {generating ? (
                                    <><Loader2 size={14} className="animate-spin" /> Generating...</>
                                ) : (
                                    <><Sparkles size={14} /> {graphData ? "Regenerate" : "Generate Mind Map"}</>
                                )}
                            </button>

                            {selectedSourceIds.size > 0 && (
                                <p className="text-[9px] text-gray-500 text-center">
                                    {selectedSourceIds.size} of {availableSources.length} sources selected
                                </p>
                            )}
                        </div>

                        {/* Legend */}
                        <div className="px-5 pb-5 space-y-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-600">Edge Types</p>
                            {[
                                { label: "Hierarchical", color: "#6366f1", dash: undefined },
                                { label: "Related", color: "#06b6d4", dash: "dashed" },
                                { label: "Prerequisite", color: "#f59e0b", dash: "dotted" },
                            ].map(e => (
                                <div key={e.label} className="flex items-center gap-2.5">
                                    <div className="w-8 h-0.5 relative flex-shrink-0"
                                        style={{ background: e.color, borderTop: e.dash ? `2px ${e.dash} ${e.color}` : undefined }} />
                                    <span className="text-[10px] text-gray-500 font-semibold">{e.label}</span>
                                </div>
                            ))}

                            <div className="pt-2 space-y-1.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-600">Node Levels</p>
                                {[
                                    { label: "Root Topic", color: "#6366f1" },
                                    { label: "Main Topics", color: "#06b6d4" },
                                    { label: "Subtopics", color: "#10b981" },
                                    { label: "Details", color: "#f59e0b" },
                                ].map(l => (
                                    <div key={l.label} className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
                                        <span className="text-[10px] text-gray-500 font-semibold">{l.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {graphData && (
                            <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-600 mb-2">Graph Stats</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: "Nodes", val: graphData.nodes.length },
                                        { label: "Edges", val: graphData.edges.length },
                                        { label: "Sources", val: graphData.total_materials },
                                        { label: "Levels", val: Math.max(...graphData.nodes.map(n => n.level)) + 1 },
                                    ].map(s => (
                                        <div key={s.label} className="bg-white/5 rounded-lg p-2 text-center">
                                            <p className="text-base font-black text-white">{s.val}</p>
                                            <p className="text-[8px] text-gray-500 uppercase tracking-wider">{s.label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Graph Canvas */}
                    <div className="flex-1 relative">
                        {!graphData && !generating && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col items-center gap-4 text-center px-8"
                                >
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
                                            <Network size={36} className="text-indigo-400" />
                                        </div>
                                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 rounded-full animate-pulse flex items-center justify-center">
                                            <Sparkles size={10} className="text-white" />
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-white mb-2">AI Concept Graph</h2>
                                        <p className="text-sm text-gray-500 max-w-xs">
                                            Select your course materials on the left, then click <span className="text-indigo-400 font-bold">Generate Mind Map</span> to extract and visualize all key concepts.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 mt-2">
                                        {[
                                            { icon: GitBranch, label: "Hierarchical Layout" },
                                            { icon: Layers, label: "Source tracking" },
                                            { icon: MessageSquare, label: "Ask AI per node" },
                                        ].map(f => (
                                            <div key={f.label} className="flex flex-col items-center gap-1.5 p-3 bg-white/3 rounded-xl border border-white/5">
                                                <f.icon size={16} className="text-indigo-400" />
                                                <span className="text-[9px] text-gray-500 font-semibold text-center">{f.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>
                        )}

                        {generating && (
                            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60 backdrop-blur-sm">
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center gap-5"
                                >
                                    <div className="relative w-16 h-16">
                                        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-spin" style={{ borderTopColor: "#6366f1" }} />
                                        <div className="absolute inset-2 rounded-full border-2 border-purple-500/20 animate-spin" style={{ borderTopColor: "#a855f7", animationDirection: "reverse", animationDuration: "1.5s" }} />
                                        <div className="absolute inset-4 flex items-center justify-center">
                                            <Sparkles size={16} className="text-indigo-400" />
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-black text-white mb-1">Extracting Concepts</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Analyzing course materials with AI...</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {["NER", "Clustering", "Graph Build", "Layout"].map((step, i) => (
                                            <motion.div
                                                key={step}
                                                initial={{ opacity: 0.3 }}
                                                animate={{ opacity: [0.3, 1, 0.3] }}
                                                transition={{ delay: i * 0.4, repeat: Infinity, duration: 1.6 }}
                                                className="px-2 py-1 bg-indigo-600/10 border border-indigo-500/20 rounded text-[9px] font-black text-indigo-400 uppercase tracking-wider"
                                            >
                                                {step}
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>
                        )}

                        {error && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-semibold shadow-xl"
                                >
                                    <X size={12} /> {error}
                                    <button onClick={() => setError(null)} className="ml-2 hover:text-white">✕</button>
                                </motion.div>
                            </div>
                        )}

                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onNodeClick={handleNodeClick}
                            onPaneClick={clearFocus}
                            nodeTypes={nodeTypes}
                            fitView
                            minZoom={0.1}
                            maxZoom={2}
                            style={{ background: "#050505" }}
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background color="#1f2937" gap={24} size={1} />
                            <MiniMap
                                nodeColor={n => LEVEL_COLORS[Math.min((n.data?.level as number) || 0, 3)].border}
                                bgColor="#0a0a0a"
                                maskColor="rgba(0,0,0,0.7)"
                                style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                            />
                            <Controls
                                style={{
                                    background: "#111",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "8px",
                                }}
                            />
                        </ReactFlow>
                    </div>

                    {/* Node Detail Side Panel */}
                    <AnimatePresence>
                        {selectedNode && (
                            <motion.div
                                initial={{ opacity: 0, x: 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 40 }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="w-80 border-l border-white/5 bg-black/60 backdrop-blur overflow-y-auto flex-shrink-0 flex flex-col"
                            >
                                <div className="p-5 border-b border-white/5 flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ background: LEVEL_COLORS[Math.min(selectedNode.level, 3)].border }}
                                            />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                                                {["Root Topic", "Main Topic", "Subtopic", "Detail"][Math.min(selectedNode.level, 3)]}
                                            </span>
                                        </div>
                                        <h2 className="text-lg font-black text-white leading-tight">{selectedNode.label}</h2>
                                    </div>
                                    <button
                                        onClick={clearFocus}
                                        className="ml-3 p-1.5 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                                    >
                                        <X size={14} className="text-gray-400" />
                                    </button>
                                </div>

                                {/* Definition */}
                                <div className="p-5 border-b border-white/5">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-2">Definition</p>
                                    <p className="text-sm text-gray-300 leading-relaxed">{selectedNode.definition || "No definition available."}</p>
                                </div>

                                {/* Page Citations */}
                                {selectedNode.citations && selectedNode.citations.length > 0 && (
                                    <div className="p-5 border-b border-white/5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400 mb-3">Found In</p>
                                        <div className="space-y-2">
                                            {selectedNode.citations.map((cite, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        if (cite.material_id) {
                                                            setActiveMaterialId(cite.material_id);
                                                            setActivePage(cite.page || null);
                                                            setShowReader(true);
                                                        }
                                                    }}
                                                    className="w-full flex items-center justify-between p-2.5 bg-white/3 hover:bg-white/10 rounded-lg border border-white/5 transition-all text-left cursor-pointer group"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <FileText size={12} className="text-cyan-400 flex-shrink-0" />
                                                        <span className="text-xs text-gray-300 font-semibold truncate">{cite.source}</span>
                                                    </div>
                                                    {cite.page && (
                                                        <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-black border border-cyan-500/20">
                                                            P. {cite.page}
                                                        </span>
                                                    ) || (
                                                            <ArrowRight size={10} className="text-gray-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                                                        )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Connected concepts */}
                                <div className="p-5 border-b border-white/5">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-3">Connected Concepts</p>
                                    {(() => {
                                        const connected = edges
                                            .filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
                                            .map(e => {
                                                const otherId = e.source === selectedNode.id ? e.target : e.source;
                                                const other = nodes.find(n => n.id === otherId);
                                                return other ? { label: other.data.label, rel: e.label, direction: e.source === selectedNode.id ? "→" : "←" } : null;
                                            })
                                            .filter(Boolean);

                                        return connected.length > 0 ? (
                                            <div className="space-y-1.5">
                                                {connected.map((c: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                                                        <span className="text-emerald-500 font-bold flex-shrink-0">{c.direction}</span>
                                                        <span className="text-[9px] text-gray-600 font-semibold flex-shrink-0">{c.rel}</span>
                                                        <span className="text-gray-300 font-semibold truncate">{c.label as string}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-600">No direct connections shown.</p>
                                        );
                                    })()}
                                </div>

                                {/* Actions */}
                                <div className="p-5 space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 mb-3">Actions</p>
                                    <button
                                        onClick={() => {
                                            const query = `Explain the concept "${selectedNode.label}" and how it relates to the course material.`;
                                            const url = `/chat?q=${encodeURIComponent(query)}`;
                                            router.push(url);
                                        }}
                                        className="w-full flex items-center gap-2.5 p-3 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 rounded-xl text-xs text-indigo-300 font-bold transition-all cursor-pointer"
                                    >
                                        <MessageSquare size={14} className="text-indigo-400 flex-shrink-0" />
                                        Ask AI About This Concept
                                        <ChevronRight size={12} className="ml-auto text-indigo-500" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${selectedNode.label}: ${selectedNode.definition}`);
                                        }}
                                        className="w-full flex items-center gap-2.5 p-3 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-xs text-gray-400 font-semibold transition-all cursor-pointer"
                                    >
                                        <AlignLeft size={13} className="flex-shrink-0" />
                                        Copy Definition
                                    </button>
                                    <button
                                        onClick={() => {
                                            setFocusedNodeId(prev => prev === selectedNode.id ? null : selectedNode.id);
                                        }}
                                        className={clsx(
                                            "w-full flex items-center gap-2.5 p-3 border rounded-xl text-xs font-semibold transition-all cursor-pointer",
                                            focusedNodeId === selectedNode.id
                                                ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                                : "bg-white/5 hover:bg-white/8 border-white/10 text-gray-400"
                                        )}
                                    >
                                        <FocusIcon size={13} className="flex-shrink-0" />
                                        {focusedNodeId === selectedNode.id ? "Exit Focus Mode" : "Focus Mode"}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

/* ─────────────── PAGE WRAPPER ─────────────── */

function MindMapPage() {
    return (
        <ReactFlowProvider>
            <Suspense fallback={
                <div className="h-screen bg-[#050505] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Loading Mind Map...</p>
                    </div>
                </div>
            }>
                <MindMapBody />
            </Suspense>
        </ReactFlowProvider>
    );
}

export default MindMapPage;
