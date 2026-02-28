"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    FileText, Sparkles, Send, Bot, User,
    ChevronLeft, ExternalLink, Maximize2,
    MessageSquare, Quote, Layers, Clock,
    Loader2, Bookmark, Check, Copy, Share2,
    Search, Calendar, MoreVertical, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URL } from "@/utils/config";
import TopNav from "@/components/TopNav";

interface Attachment {
    id: string;
    title: string;
    url: string;
    type: string;
    thumbnail?: string;
    file_type?: string;
}

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
    sources?: any[];
    id?: string;
}

export default function AnalysisPage() {
    const { material_id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [material, setMaterial] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);

    // Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [threadId, setThreadId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const userEmail = typeof window !== 'undefined' ? localStorage.getItem("user_email") : null;

    useEffect(() => {
        if (!material_id || !userEmail) return;

        const fetchMaterial = async () => {
            try {
                const res = await fetch(`${API_URL}/api/courses/material/${material_id}?user_email=${userEmail}`);
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                setMaterial(data);

                // Select first PDF or any attachment
                const attachments = data.attachments || [];
                const firstDoc = attachments.find((a: any) =>
                    a.title.toLowerCase().endsWith('.pdf') ||
                    a.type === 'drive_file' ||
                    a.file_type === 'pdf'
                ) || attachments[0];

                setActiveAttachment(firstDoc);

                // Initial Analysis
                if (messages.length === 0) {
                    startAutoAnalysis(data, firstDoc);
                }
            } catch (err) {
                console.error("Failed to load material:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchMaterial();
    }, [material_id, userEmail]);

    const startAutoAnalysis = (mat: any, att: any) => {
        const docName = att ? att.title : mat.title;
        const query = `Analyze and summarize this document: "${docName}". Provide an executive summary and suggested inquiries.`;
        sendMessage(query, true);
    };

    const sendMessage = async (query: string, isInitial = false) => {
        if (!query.trim() || streaming) return;

        const userMsg: Message = { role: "user", content: query, id: Date.now().toString() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setStreaming(true);

        try {
            const formData = new FormData();
            formData.append("message", query);
            formData.append("user_email", userEmail!);
            formData.append("thread_id", threadId || "new");
            formData.append("query_type", "notebook_analysis"); // FORCE NOTEBOOK MODE
            if (material?.course_id) formData.append("course_id", material.course_id);

            const response = await fetch(`${API_URL}/api/chat/stream`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error("Stream failed");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let assistantContent = "";
            let currentThreadId = threadId;

            setMessages(prev => [...prev, { role: "assistant", content: "", id: "streaming" }]);

            while (reader) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: THREAD_ID:")) {
                        currentThreadId = line.replace("data: THREAD_ID:", "").trim();
                        setThreadId(currentThreadId);
                    } else if (line.startsWith("data: ")) {
                        const content = line.replace("data: ", "").trim();
                        if (content.startsWith("EVENT:")) continue;

                        assistantContent += content;
                        setMessages(prev => {
                            const last = prev[prev.length - 1];
                            if (last.id === "streaming") {
                                return [...prev.slice(0, -1), { ...last, content: assistantContent }];
                            }
                            return prev;
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Chat error:", err);
        } finally {
            setStreaming(false);
        }
    };

    const handleCitationClick = (pageNumber: number) => {
        if (iframeRef.current && activeAttachment?.url) {
            // For Google Drive viewer, we can't easily jump to page via URL if it's the webViewLink
            // But if it's a direct PDF, we add #page=N
            const url = new URL(activeAttachment.url);
            if (url.href.includes('drive.google.com')) {
                // If it's a Google Drive URL, we'd need a more complex integration.
                // For now, we'll try adding page param if lucky, or just alert.
            } else {
                iframeRef.current.src = `${activeAttachment.url}#page=${pageNumber}`;
            }
        }
    };

    if (loading) {
        return (
            <div className="h-screen bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="text-gray-400 font-bold tracking-widest uppercase text-xs">Initializing Analysis Engine...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-[#050505] flex flex-col overflow-hidden font-sans">
            <TopNav />

            {/* Sub-header / Breadcrumbs */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl z-20 mt-16">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors group cursor-pointer"
                    >
                        <ChevronLeft size={18} className="text-gray-400 group-hover:text-white" />
                    </button>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                            <FileText size={16} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white truncate max-w-[300px]">{material?.title}</h2>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{material?.type}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="px-4 py-1.5 glass-dark hover:bg-white/5 border border-white/5 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all flex items-center gap-2 cursor-pointer">
                        <Share2 size={12} />
                        Export Notes
                    </button>
                    <div className="h-4 w-[1px] bg-white/10" />
                    <button
                        onClick={() => window.open(material?.source_link, '_blank')}
                        className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <ExternalLink size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content: Split Screen */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Side: Document Viewer */}
                <div className="flex-1 bg-[#0a0a0a] relative flex flex-col border-r border-white/5">
                    {/* Attachment Tabs (if multiple) */}
                    {(material?.attachments?.length > 1) && (
                        <div className="p-3 px-6 flex items-center gap-2 border-b border-white/5 bg-black/20 overflow-x-auto scrollbar-none">
                            {material.attachments.map((att: Attachment) => (
                                <button
                                    key={att.id}
                                    onClick={() => setActiveAttachment(att)}
                                    className={clsx(
                                        "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer",
                                        activeAttachment?.id === att.id
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                            : "bg-white/5 text-gray-500 hover:text-white"
                                    )}
                                >
                                    {att.title}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 relative bg-white overflow-hidden">
                        {activeAttachment ? (
                            <iframe
                                ref={iframeRef}
                                src={activeAttachment.url.replace('/view', '/preview')}
                                className="w-full h-full border-none"
                                title="Document Preview"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0a] p-10 text-center">
                                <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6 border border-white/10">
                                    <FileText size={40} className="text-gray-600" />
                                </div>
                                <h3 className="text-xl font-black text-white mb-2">Text-Only Resource</h3>
                                <p className="text-gray-500 max-w-md">This material doesn't have a direct PDF attachment. Use the AI interface to analyze its contents.</p>
                                <div className="mt-8 p-6 glass-dark rounded-2xl border border-white/5 text-left w-full max-w-2xl overflow-y-auto max-h-[400px]">
                                    <p className="text-gray-300 font-medium whitespace-pre-wrap">{material?.content}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Viewer Controls */}
                    <div className="h-12 border-t border-white/5 flex items-center justify-center gap-6 bg-black/40 backdrop-blur-xl">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                            <Search size={14} />
                            SEARCH IN DOCUMENT
                        </div>
                    </div>
                </div>

                {/* Right Side: AI Chat */}
                <div className="w-[500px] flex flex-col bg-[#050505] relative shadow-2xl z-10">
                    {/* Chat Header */}
                    <div className="p-6 border-b border-white/5 bg-black/20">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Sparkles className="text-blue-500" size={18} />
                                <h3 className="font-black text-sm tracking-tight text-white uppercase">Neural Artifact Analysis</h3>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest font-mono">Live Sync Active</span>
                            </div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-premium" ref={scrollRef}>
                        {messages.length === 0 && !streaming && (
                            <div className="py-20 text-center space-y-6 opacity-40">
                                <Bot size={40} className="mx-auto text-blue-500" />
                                <p className="text-sm font-medium text-gray-500">How can I help you analyze this today?</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={clsx(
                                    "flex flex-col gap-3",
                                    msg.role === "user" ? "items-end" : "items-start"
                                )}
                            >
                                <div className={clsx(
                                    "max-w-[90%] p-4 rounded-2xl text-sm font-medium whitespace-pre-wrap leading-relaxed",
                                    msg.role === "user"
                                        ? "bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-600/10"
                                        : "glass-dark border border-white/5 text-gray-100 rounded-tl-none shadow-2xl"
                                )}>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                                            ul: ({ children }) => <ul className="list-disc ml-4 mb-4 space-y-2">{children}</ul>,
                                            // Handle citations in Markdown if needed
                                        }}
                                    >
                                        {msg.content.replace(/\[(\d+)\]/g, ' [[$1]] ')}
                                    </ReactMarkdown>
                                </div>
                            </motion.div>
                        ))}

                        {streaming && (
                            <div className="flex items-center gap-2 text-blue-500">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Neural Pulse...</span>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-3xl">
                        <div className="relative group">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage(input);
                                    }
                                }}
                                placeholder="Ask about specific sections, formulas, or summaries..."
                                className="w-full bg-[#101010] border border-white/5 rounded-2xl p-4 pr-14 text-sm font-medium focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none min-h-[60px] max-h-[200px] scrollbar-none text-white"
                            />
                            <button
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || streaming}
                                className="absolute right-3 bottom-3 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <p className="mt-3 text-[9px] text-gray-500 font-bold text-center uppercase tracking-widest opacity-60">FIWB Neural Core | Verified Grounded Engine</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

