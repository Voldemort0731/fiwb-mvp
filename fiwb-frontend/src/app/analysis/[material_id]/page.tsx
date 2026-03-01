"use client";
import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    FileText, Sparkles, Send, Bot, User,
    ChevronLeft, ExternalLink,
    Loader2, Copy, Check, Search,
    BookOpen, Lightbulb, MessageSquare,
    ChevronDown, ArrowRight, RefreshCw, Network
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URL } from "@/utils/config";

/* ─────────────── INTERFACES ─────────────── */

interface Attachment {
    id: string;
    title: string;
    url: string;
    type: string;
    thumbnail?: string;
    file_type?: string;
}

interface Source {
    title: string;
    display: string;
    link?: string;
    snippet?: string;
    source_type?: string;
}

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
    sources?: Source[];
    thinking?: boolean;
    id?: string;
}

/* ─────────────── HELPER: Parse Suggested Questions ─────────────── */

function extractSuggestedQuestions(content: string): string[] {
    const questions: string[] = [];
    // Match numbered list items that look like questions (inside quotes or with ?)
    const patterns = [
        /\d+\.\s*"([^"]+\??)"/g,           // 1. "What is X?"
        /\d+\.\s*"([^"]+)"/g,              // 1. "Explain X in simple terms"
        /[-•]\s*"([^"]+\??)"/g,            // - "What is X?"
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const q = match[1].trim();
            if (q.length > 10 && q.length < 200 && !questions.includes(q)) {
                questions.push(q);
            }
        }
    }
    return questions.slice(0, 5);
}

/* ─────────────── COMPONENT: Citation Button ─────────────── */

function CitationButton({ num, onClick }: { num: number, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center justify-center w-5 h-5 mx-0.5 text-[9px] font-black bg-blue-500/20 text-blue-400 rounded-full hover:bg-blue-500/40 hover:text-blue-300 transition-all cursor-pointer border border-blue-500/30 hover:border-blue-400/50 align-super leading-none"
            title={`Jump to source [${num}]`}
        >
            {num}
        </button>
    );
}

/* ─────────────── COMPONENT: Source Card ─────────────── */

function SourceCard({ source, index }: { source: Source; index: number }) {
    return (
        <motion.a
            href={source.link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-xl transition-all group cursor-pointer"
        >
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 border border-blue-500/20">
                <BookOpen size={14} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white truncate">{source.title}</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-0.5">{source.source_type || "document"}</p>
            </div>
            <ExternalLink size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
        </motion.a>
    );
}

/* ─────────────── COMPONENT: Message Renderer ─────────────── */

function MessageContent({ content, onCitationClick, onQuestionClick }: {
    content: string;
    onCitationClick: (page: number) => void;
    onQuestionClick: (question: string) => void;
}) {
    const suggestedQuestions = extractSuggestedQuestions(content);

    // Remove the suggested questions section from rendered content for separate rendering
    let cleanContent = content;
    const splitTokens = ["**💡 Dive Deeper:**", "💡 Dive Deeper:", "**Suggested Questions", "Suggested Questions:", "💡 Suggested Questions"];
    for (const token of splitTokens) {
        if (cleanContent.includes(token)) {
            // Keep everything before the token, trim trailing whitespace
            cleanContent = cleanContent.split(token)[0].trimEnd();
            break;
        }
    }

    // Process children to replace [n] patterns with clickable buttons
    const processChildren = (kids: React.ReactNode): React.ReactNode => {
        return React.Children.map(kids, (child) => {
            if (typeof child !== 'string') return child;

            const parts = child.split(/\[(\d+)\]/g);
            if (parts.length === 1) return child;

            return parts.map((part, i) => {
                if (i % 2 === 1) {
                    const num = parseInt(part);
                    return <CitationButton key={i} num={num} onClick={() => onCitationClick(num)} />;
                }
                return part;
            });
        });
    };

    return (
        <div className="space-y-4">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => {
                        return <p className="mb-3 last:mb-0 leading-relaxed">{processChildren(children)}</p>;
                    },
                    h1: ({ children }) => <h1 className="text-lg font-black text-white mt-4 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-black text-white mt-4 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-black text-white mt-3 mb-1.5">{children}</h3>,
                    ul: ({ children }) => <ul className="list-disc ml-5 mb-3 space-y-1.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal ml-5 mb-3 space-y-1.5">{children}</ol>,
                    li: ({ children }) => {
                        return <li className="text-gray-300 pl-1 marker:text-gray-500">{processChildren(children)}</li>;
                    },
                    strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,

                    em: ({ children }) => <em className="text-blue-300 italic">{children}</em>,
                    code: ({ className, children }) => {
                        const isInline = !className;
                        if (isInline) {
                            return <code className="bg-white/10 text-emerald-400 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
                        }
                        return (
                            <code className="block bg-[#0d0d0d] border border-white/5 rounded-xl p-4 my-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => <pre className="bg-[#0d0d0d] border border-white/5 rounded-xl p-4 my-3 text-xs font-mono text-gray-300 overflow-x-auto">{children}</pre>,
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-blue-500/50 pl-4 my-3 text-gray-400 italic bg-blue-500/5 py-2 pr-4 rounded-r-lg">
                            {children}
                        </blockquote>
                    ),
                    hr: () => <hr className="border-white/10 my-4" />,
                    table: ({ children }) => (
                        <div className="overflow-x-auto my-3">
                            <table className="w-full text-xs border-collapse">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
                    th: ({ children }) => <th className="text-left p-2 text-gray-300 font-bold border-b border-white/10">{children}</th>,
                    td: ({ children }) => <td className="p-2 text-gray-400 border-b border-white/5">{children}</td>,
                }}
            >
                {cleanContent}
            </ReactMarkdown>

            {/* Render suggested questions as interactive chips */}
            {suggestedQuestions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                        <Lightbulb size={14} className="text-amber-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/80">Suggested Questions</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {suggestedQuestions.map((q, i) => (
                            <motion.button
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + i * 0.08 }}
                                onClick={() => onQuestionClick(q)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-left bg-white/[0.03] hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 rounded-xl transition-all group cursor-pointer"
                            >
                                <ArrowRight size={12} className="text-gray-600 group-hover:text-blue-400 transition-colors shrink-0" />
                                <span className="text-xs text-gray-400 group-hover:text-blue-300 transition-colors line-clamp-2">{q}</span>
                            </motion.button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* We need React import for React.Children */
import React from "react";

/* ─────────────── COMPONENT: Thinking Indicator ─────────────── */

function ThinkingIndicator({ step }: { step: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 bg-blue-500/5 border border-blue-500/10 rounded-xl"
        >
            <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Loader2 size={14} className="text-blue-400 animate-spin" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">{step}</p>
                <p className="text-[9px] text-gray-500 font-bold">Processing your document...</p>
            </div>
        </motion.div>
    );
}

/* ─────────────── MAIN COMPONENT ─────────────── */

function AnalysisBody() {
    const { material_id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const existingThreadId = searchParams.get("thread");

    const [material, setMaterial] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);

    // Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const [threadId, setThreadId] = useState<string | null>(existingThreadId || null);
    const [thinkingStep, setThinkingStep] = useState("");
    const [sources, setSources] = useState<Source[]>([]);
    const [showSources, setShowSources] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasInitialized = useRef(false);

    // Sidebar thread state
    const [threads, setThreads] = useState<any[]>([]);

    const userEmail = typeof window !== 'undefined' ? localStorage.getItem("user_email") : null;

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, streaming]);

    // Fetch threads for sidebar
    const fetchThreads = useCallback(async () => {
        if (!userEmail) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/threads?user_email=${userEmail}`);
            const data = await res.json();
            setThreads(data);
        } catch (e) {
            console.error("Failed to fetch threads:", e);
        }
    }, [userEmail]);

    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    // Fetch material data
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
                    a.title?.toLowerCase().endsWith('.pdf') ||
                    a.type === 'drive_file' ||
                    a.file_type === 'pdf'
                ) || attachments[0];

                setActiveAttachment(firstDoc);
            } catch (err) {
                console.error("Failed to load material:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchMaterial();
    }, [material_id, userEmail]);

    // Load existing thread messages (if reopening a saved thread)
    useEffect(() => {
        if (!existingThreadId || !userEmail) return;

        const loadHistory = async () => {
            try {
                const res = await fetch(`${API_URL}/api/chat/threads/${existingThreadId}/messages?user_email=${userEmail}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.length > 0) {
                    const loaded: Message[] = data.map((m: any, i: number) => ({
                        role: m.role,
                        content: m.content,
                        sources: m.sources || [],
                        id: `loaded-${i}`
                    }));
                    setMessages(loaded);
                    hasInitialized.current = true; // Don't auto-trigger analysis
                }
            } catch (e) {
                console.error("Failed to load thread history:", e);
            }
        };

        loadHistory();
    }, [existingThreadId, userEmail]);

    // Initial analysis trigger (runs once after material loads, ONLY for new sessions)
    useEffect(() => {
        if (!material || hasInitialized.current || messages.length > 0 || existingThreadId) return;
        hasInitialized.current = true;

        const docName = activeAttachment ? activeAttachment.title : material.title;
        const initQuery = `Analyze and summarize this "${docName}". Give an executive summary and suggested inquiries.`;
        sendMessage(initQuery, material.content || "");
    }, [material, activeAttachment]);

    // Copy message content
    const copyMessage = useCallback((content: string, id: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }, []);

    // Navigate PDF to page
    const navigateToPage = useCallback((pageNum: number) => {
        if (!iframeRef.current || !activeAttachment) return;

        console.log(`Navigating to page ${pageNum} for ${activeAttachment.title}`);

        let targetUrl = "";
        const isDrive = activeAttachment.url?.includes('drive.google.com');

        if (isDrive) {
            // Use the proxy URL as base
            targetUrl = `${API_URL}/api/courses/proxy/drive/${activeAttachment.id}?user_email=${userEmail}`;
        } else {
            // Direct preview URL
            targetUrl = activeAttachment.url?.replace('/view', '/preview') || "";
        }

        // Append page as fragment (Standard for PDF viewers to jump without reload)
        const finalUrl = `${targetUrl}#page=${pageNum}`;

        // Force update if it's the same base URL to ensure fragment jump
        if (iframeRef.current.src.split('#')[0] === finalUrl.split('#')[0]) {
            iframeRef.current.src = `${targetUrl}&_t=${Date.now()}#page=${pageNum}`;
        } else {
            iframeRef.current.src = finalUrl;
        }
    }, [activeAttachment, userEmail]);

    // Main send message function
    const sendMessage = async (query: string, attachmentText?: string) => {
        if (!query.trim() || streaming) return;

        const userMsg: Message = { role: "user", content: query, id: Date.now().toString() };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setStreaming(true);
        setThinkingStep("Analyzing document context...");

        try {
            const formData = new FormData();
            formData.append("message", query);
            formData.append("user_email", userEmail!);
            formData.append("thread_id", threadId || "new");
            formData.append("query_type", "notebook_analysis");
            if (material?.course_id) formData.append("course_id", material.course_id);
            if (material?.id) formData.append("material_id", material.id);

            // Pass document content for grounding
            const textToSend = attachmentText || material?.content || "";
            if (textToSend) formData.append("attachment_text", textToSend);

            const response = await fetch(`${API_URL}/api/chat/stream`, {
                method: "POST",
                body: formData
            });

            if (!response.ok) throw new Error("Stream failed");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let assistantContent = "";
            let msgSources: Source[] = [];

            setMessages(prev => [...prev, { role: "assistant", content: "", id: "streaming", thinking: true }]);

            while (reader) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.substring(6).trim();

                    if (payload.startsWith("THREAD_ID:")) {
                        const newId = payload.replace("THREAD_ID:", "").trim();
                        setThreadId(newId);
                        fetchThreads(); // Refresh sidebar
                    } else if (payload.startsWith("EVENT:THINKING:")) {
                        setThinkingStep(payload.replace("EVENT:THINKING:", ""));
                    } else if (payload.startsWith("EVENT:SOURCES:")) {
                        try {
                            const parsedSources = JSON.parse(payload.replace("EVENT:SOURCES:", ""));
                            msgSources = parsedSources;
                            setSources(parsedSources);
                        } catch (e) { }
                    } else {
                        // Parse token JSON
                        try {
                            const tokenData = JSON.parse(payload);
                            if (tokenData.token) {
                                assistantContent += tokenData.token;
                                setMessages(prev => {
                                    const updated = [...prev];
                                    const lastIdx = updated.length - 1;
                                    if (updated[lastIdx]?.id === "streaming") {
                                        updated[lastIdx] = {
                                            ...updated[lastIdx],
                                            content: assistantContent,
                                            thinking: false
                                        };
                                    }
                                    return updated;
                                });
                            }
                        } catch (e) {
                            // Not JSON, might be raw text
                            if (payload && !payload.startsWith("EVENT:") && !payload.startsWith("[DONE]")) {
                                assistantContent += payload;
                                setMessages(prev => {
                                    const updated = [...prev];
                                    const lastIdx = updated.length - 1;
                                    if (updated[lastIdx]?.id === "streaming") {
                                        updated[lastIdx] = {
                                            ...updated[lastIdx],
                                            content: assistantContent,
                                            thinking: false
                                        };
                                    }
                                    return updated;
                                });
                            }
                        }
                    }
                }
            }

            // Finalize message
            setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.id === "streaming") {
                    updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: assistantContent,
                        sources: msgSources,
                        thinking: false,
                        id: Date.now().toString()
                    };
                }
                return updated;
            });

        } catch (err) {
            console.error("Chat error:", err);
            setMessages(prev => [...prev, {
                role: "assistant",
                content: "⚠️ Analysis engine encountered an error. Please try again.",
                id: "error"
            }]);
        } finally {
            setStreaming(false);
            setThinkingStep("");
        }
    };

    /* ─────────────── LOADING STATE ─────────────── */
    if (loading) {
        return (
            <div className="h-screen bg-[#050505] flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-6"
                >
                    <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full animate-pulse" />
                    </div>
                    <div className="text-center">
                        <p className="text-gray-400 font-black tracking-widest uppercase text-xs">Initializing Analysis Engine</p>
                        <p className="text-gray-600 text-[10px] mt-1 tracking-widest uppercase">Loading document context...</p>
                    </div>
                </motion.div>
            </div>
        );
    }

    /* ─────────────── MAIN RENDER ─────────────── */
    const handleDeleteThread = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/chat/threads/${id}?user_email=${userEmail}`, { method: 'DELETE' });
            setThreads(prev => prev.filter(t => t.id !== id));
            if (id === threadId) {
                setMessages([]);
                setThreadId(null);
                hasInitialized.current = false; // Allow re-analysis
            }
        } catch (e) {
            console.error("Failed to delete thread:", e);
        }
    };

    return (
        <div className="h-screen bg-[#050505] flex flex-row overflow-hidden font-sans selection:bg-blue-500/30">
            <Sidebar
                threads={threads}
                activeThreadId={threadId || undefined}
                onDeleteThread={handleDeleteThread}
            />

            <div className="flex-1 flex flex-col min-w-0 relative">
                <TopNav />

                {/* Sub-header */}
                <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl z-20 mt-16 shrink-0">
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
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{material?.type} • NotebookCore</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {sources.length > 0 && (
                            <button
                                onClick={() => setShowSources(!showSources)}
                                className={clsx(
                                    "px-4 py-1.5 border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer",
                                    showSources
                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                        : "bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <BookOpen size={12} />
                                {sources.length} Sources
                                <ChevronDown size={12} className={clsx("transition-transform", showSources && "rotate-180")} />
                            </button>
                        )}
                        <button
                            onClick={() => router.push(`/mindmap/${material?.course_id}?material=${material?.id}`)}
                            className="px-4 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
                        >
                            <Network size={12} />
                            Mind Map
                        </button>
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
                        {/* Attachment Tabs */}
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
                                    key={`${activeAttachment.id}-${userEmail}`}
                                    ref={iframeRef}
                                    src={
                                        activeAttachment.url?.includes('drive.google.com')
                                            ? `${API_URL}/api/courses/proxy/drive/${activeAttachment.id}?user_email=${userEmail}`
                                            : activeAttachment.url?.replace('/view', '/preview')
                                    }
                                    className="w-full h-full border-none"
                                    title="Document Preview"
                                    allow="autoplay"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0a] p-10 text-center">
                                    <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6 border border-white/10">
                                        <FileText size={40} className="text-gray-600" />
                                    </div>
                                    <h3 className="text-xl font-black text-white mb-2">Text-Only Resource</h3>
                                    <p className="text-gray-500 max-w-md">This material doesn&apos;t have a PDF attachment. Use the AI to analyze its contents.</p>
                                    <div className="mt-8 p-6 glass-dark rounded-2xl border border-white/5 text-left w-full max-w-2xl overflow-y-auto max-h-[400px]">
                                        <p className="text-gray-300 font-medium whitespace-pre-wrap">{material?.content}</p>
                                    </div>
                                </div>
                            )}

                            {/* Viewer Controls Overlay */}
                            {activeAttachment?.url?.includes('drive.google.com') && (
                                <div className="absolute top-4 right-4 flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            if (iframeRef.current) {
                                                const originalSrc = iframeRef.current.src;
                                                iframeRef.current.src = 'about:blank';
                                                setTimeout(() => { if (iframeRef.current) iframeRef.current.src = originalSrc; }, 50);
                                            }
                                        }}
                                        className="p-2.5 glass-dark border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer group"
                                    >
                                        <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                                        Refresh Viewer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Side: AI Chat */}
                    <div className="w-[500px] flex flex-col bg-[#050505] relative shadow-2xl z-10">
                        {/* Chat Header */}
                        <div className="p-5 border-b border-white/5 bg-black/20">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                                        <Sparkles size={14} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-sm tracking-tight text-white">NotebookCore</h3>
                                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Source-Grounded Analysis
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            setMessages([]);
                                            setThreadId(null);
                                            setSources([]);
                                            hasInitialized.current = false;
                                        }}
                                        className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all cursor-pointer"
                                        title="New Analysis Session"
                                    >
                                        <MessageSquare size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Sources Drawer */}
                        <AnimatePresence>
                            {showSources && sources.length > 0 && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-b border-white/5 bg-black/30 overflow-hidden"
                                >
                                    <div className="p-4 space-y-2 max-h-[200px] overflow-y-auto scrollbar-premium">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">Referenced Documents</p>
                                        {sources.map((source, i) => (
                                            <SourceCard key={i} source={source} index={i} />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-premium" ref={scrollRef}>
                            {messages.length === 0 && !streaming && (
                                <div className="py-16 text-center space-y-6">
                                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-600/10 to-purple-600/10 flex items-center justify-center border border-white/5">
                                        <Bot size={28} className="text-blue-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white mb-1">Document Analysis Ready</p>
                                        <p className="text-xs text-gray-500 max-w-[280px] mx-auto">Ask questions about the document and I&apos;ll respond with grounded answers and citations.</p>
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <motion.div
                                    key={msg.id || i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className={clsx(
                                        "flex flex-col gap-2",
                                        msg.role === "user" ? "items-end" : "items-start"
                                    )}
                                >
                                    {/* Role label */}
                                    <div className={clsx(
                                        "flex items-center gap-1.5 px-1",
                                        msg.role === "user" ? "flex-row-reverse" : ""
                                    )}>
                                        <div className={clsx(
                                            "w-5 h-5 rounded-md flex items-center justify-center",
                                            msg.role === "user" ? "bg-blue-600/20" : "bg-white/5"
                                        )}>
                                            {msg.role === "user" ? <User size={10} className="text-blue-400" /> : <Bot size={10} className="text-gray-400" />}
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                                            {msg.role === "user" ? "You" : "NotebookCore"}
                                        </span>
                                    </div>

                                    {/* Message bubble */}
                                    <div className={clsx(
                                        "max-w-[95%] rounded-2xl text-sm leading-relaxed relative group",
                                        msg.role === "user"
                                            ? "bg-blue-600 text-white p-4 rounded-tr-sm shadow-xl shadow-blue-600/10"
                                            : "bg-[#0a0a0a] border border-white/5 text-gray-200 p-5 rounded-tl-sm"
                                    )}>
                                        {msg.role === "assistant" && msg.thinking && !msg.content ? (
                                            <ThinkingIndicator step={thinkingStep || "Analyzing..."} />
                                        ) : msg.role === "assistant" ? (
                                            <MessageContent
                                                content={msg.content}
                                                onCitationClick={navigateToPage}
                                                onQuestionClick={(q) => sendMessage(q)}
                                            />
                                        ) : (
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        )}

                                        {/* Copy button (assistant only) */}
                                        {msg.role === "assistant" && msg.content && (
                                            <button
                                                onClick={() => copyMessage(msg.content, msg.id || String(i))}
                                                className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                            >
                                                {copiedId === (msg.id || String(i)) ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            ))}

                            {/* Streaming indicator */}
                            {streaming && messages[messages.length - 1]?.thinking && (
                                <div className="flex items-start gap-2">
                                    <ThinkingIndicator step={thinkingStep} />
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-3xl">
                            <div className="relative group">
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage(input);
                                        }
                                    }}
                                    placeholder="Ask about specific sections, formulas, or concepts..."
                                    className="w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 pr-14 text-sm font-medium focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none min-h-[56px] max-h-[160px] scrollbar-none text-white resize-none"
                                    rows={1}
                                />
                                <button
                                    onClick={() => sendMessage(input)}
                                    disabled={!input.trim() || streaming}
                                    className="absolute right-3 bottom-3 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                            <p className="mt-2.5 text-[9px] text-gray-600 font-bold text-center uppercase tracking-widest">
                                Source-grounded • Citations verified • {material?.attachments?.length || 0} documents loaded
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AnalysisPage() {
    return (
        <Suspense fallback={
            <div className="h-screen bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Initializing...</p>
                </div>
            </div>
        }>
            <AnalysisBody />
        </Suspense>
    );
}
