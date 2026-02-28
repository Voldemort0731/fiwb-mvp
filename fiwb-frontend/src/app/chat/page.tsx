"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    Send, Paperclip, Cpu, Zap,
    RefreshCw, ChevronRight, X, FileText,
    Bot, User, MessageCircle, Trash2,
    Check, BookOpen, Quote, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_URL } from "@/utils/config";

// --- HELPERS ---
const standardize_email = (email: string | null) => {
    if (!email) return "";
    return email.trim().toLowerCase();
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

function Citation({ num, onClick }: { num: string; onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center justify-center w-5 h-5 ml-1 -mt-1 text-[10px] font-black text-white bg-blue-600 rounded-full hover:bg-blue-500 hover:scale-110 active:scale-95 transition-all shadow-[0_0_8px_rgba(59,130,246,0.3)] border border-blue-400/20 align-middle select-none cursor-pointer"
        >
            {num}
        </button>
    );
}

function MessageContent({
    content,
    sources,
    reasoning,
    onCitationClick,
    onInquiryClick
}: {
    content: string;
    sources?: any[];
    reasoning?: string;
    onCitationClick?: (pageNum: string) => void;
    onInquiryClick?: (query: string) => void;
}) {
    // 1. Extract Suggested Inquiries
    const inquiryRegex = /Suggested Inquiries:\n([\s\S]*?)($|\n\n)/i;
    const inquiryMatch = content.match(inquiryRegex);
    const inquiries = inquiryMatch
        ? inquiryMatch[1].split('\n').map(line => line.replace(/^[•\-\*]\s*/, '').trim()).filter(Boolean)
        : [];

    // Remove the inquiries block from main content for cleaner markdown view
    const mainContent = content.replace(inquiryRegex, '').trim();

    // Heuristic for citation to page mapping
    // AI usually lists citations at the end: [1] Title [Page 5]
    const pageMap: Record<string, string> = {};
    const pageMatchRegex = /\[(\d+)\]\s+.*?\s+\[Page\s+(\d+)\]/g;
    let match;
    while ((match = pageMatchRegex.exec(content)) !== null) {
        pageMap[match[1]] = match[2];
    }

    return (
        <div className="space-y-4">
            {reasoning && (
                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 mb-4 italic text-xs text-blue-400 font-medium">
                    <div className="flex items-center gap-2 mb-2 font-black uppercase tracking-widest opacity-60">
                        <Cpu size={12} />
                        Neural Reasoning Path
                    </div>
                    {reasoning}
                </div>
            )}

            <div className="prose prose-invert max-w-none text-sm font-medium leading-relaxed">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc ml-4 mb-4 space-y-2">{children}</ul>,
                        // Custom renderer for citations
                        strong: ({ children }) => {
                            const text = String(children);
                            if (text.startsWith('[') && text.endsWith(']')) {
                                const num = text.replace(/[\[\]]/g, '');
                                if (!isNaN(Number(num))) {
                                    return <Citation num={num} onClick={() => onCitationClick?.(pageMap[num] || '1')} />;
                                }
                            }
                            return <strong>{children}</strong>;
                        }
                    }}
                >
                    {/* Convert [1] into **[1]** so ReactMarkdown component can pick it up via 'strong' override */}
                    {mainContent.replace(/\[(\d+)\]/g, ' **[$1]** ')}
                </ReactMarkdown>
            </div>

            {/* Interactive Inquiries */}
            {inquiries.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-700">
                    {inquiries.map((inquiry, idx) => (
                        <button
                            key={idx}
                            onClick={() => onInquiryClick?.(inquiry)}
                            className="px-4 py-2 glass-dark hover:bg-blue-600/20 border border-white/5 hover:border-blue-500/30 rounded-xl text-[11px] font-bold text-blue-400 transition-all flex items-center gap-2 group cursor-pointer"
                        >
                            <Sparkles size={12} className="opacity-50 group-hover:opacity-100" />
                            {inquiry}
                        </button>
                    ))}
                </div>
            )}

            {sources && sources.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        <span className="text-[10px] font-black uppercase text-blue-500 tracking-widest">Grounding Context</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {sources.map((source, idx) => {
                            const displayTitle = source.display || source.title;
                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.03 }}
                                    whileHover={{ y: -2 }}
                                    className="group/source h-full"
                                >
                                    <div className="h-full flex flex-col p-3 rounded-2xl glass-dark border border-white/5 bg-black/40 hover:border-blue-500/40 hover:bg-blue-500/[0.02] transition-all duration-300">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                                <FileText size={14} className="text-blue-500" />
                                            </div>
                                        </div>
                                        <h4 className="text-[11px] font-bold text-gray-100 line-clamp-2 mb-2 leading-tight">
                                            {displayTitle}
                                        </h4>
                                        <div className="mt-auto pt-2 border-t border-white/5 flex items-center justify-between">
                                            {source.link ? (
                                                <a
                                                    href={source.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 text-[9px] font-black text-blue-500 uppercase tracking-wider hover:text-blue-600 transition-colors"
                                                >
                                                    <BookOpen size={10} />
                                                    View Original
                                                </a>
                                            ) : (
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Internal Reference</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

import { Sparkles } from "lucide-react";

function ChatBody() {
    const [messages, setMessages] = useState<any[]>([]);
    const [threads, setThreads] = useState<any[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string>("new");
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const searchParams = useSearchParams();
    const initializedRef = useRef(false);

    // Viewer State
    const [viewerMaterial, setViewerMaterial] = useState<any>(null);
    const [activeAttachment, setActiveAttachment] = useState<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const [isAutoScrolling, setIsAutoScrolling] = useState(true);
    const [thinkingStep, setThinkingStep] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<any>(null);

    const scrollToBottom = () => {
        if (isAutoScrolling) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    };

    const fetchThreads = async (shouldSelectLatest = false) => {
        const rawEmail = localStorage.getItem("user_email");
        const email = standardize_email(rawEmail);
        if (!email) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/threads?user_email=${email}`);
            const data = await res.json();
            setThreads(data);
            if (shouldSelectLatest && data.length > 0 && activeThreadId === "new") {
                handleThreadSelect(data[0].id);
            }
        } catch (e) {
            console.error("Failed to fetch threads", e);
        }
    };

    const fetchMessages = async (threadId: string) => {
        if (threadId === "new") {
            setMessages([]);
            return;
        }
        setIsLoading(true);
        try {
            const email = standardize_email(localStorage.getItem("user_email"));
            const res = await fetch(`${API_URL}/api/chat/threads/${threadId}/messages?user_email=${email}`);
            const data = await res.json();
            setMessages(data);
        } catch (e) {
            console.error("Failed to fetch messages", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const email = localStorage.getItem("user_email");
        if (!email) {
            window.location.href = "/";
            return;
        }
        fetchThreads(true);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleThreadSelect = (id: string) => {
        const materialId = localStorage.getItem(`analysis_thread_${id}`);
        if (materialId) {
            window.location.href = `/analysis/${materialId}?thread_id=${id}`;
            return;
        }
        setActiveThreadId(id);
        fetchMessages(id);
    };

    const handleDeleteThread = async (id: string) => {
        if (confirm("Permanently delete this neural thread?")) {
            const email = standardize_email(localStorage.getItem("user_email"));
            await fetch(`${API_URL}/api/chat/threads/${id}?user_email=${email}`, { method: "DELETE" });
            if (activeThreadId === id) {
                setActiveThreadId("new");
                setMessages([]);
            }
            fetchThreads();
        }
    };

    const sendMessage = async (forcedContent?: string, attachmentText?: string, targetMaterialId?: string) => {
        const contentToUse = typeof forcedContent === "string" ? forcedContent : input;
        if (!contentToUse.trim() && !selectedFile) return;

        let attachment = null;
        let attachmentType = null;
        const currentFile = selectedFile;
        if (currentFile) {
            try {
                attachment = await fileToBase64(currentFile);
                attachmentType = currentFile.type;
            } catch (e) { console.error("Error converting file", e); }
        }

        const userMsg = contentToUse || (currentFile ? `Attached: ${currentFile.name}` : "");
        setInput("");
        setSelectedFile(null);
        setPreviewUrl(null);

        setMessages(prev => [...prev, {
            role: "user",
            content: userMsg,
            fileName: currentFile?.name,
            attachment,
            attachmentType
        }]);

        setIsLoading(true);
        setThinkingStep("Initializing Neural Link...");

        try {
            const email = standardize_email(localStorage.getItem("user_email") || "");
            const formData = new FormData();
            formData.append("message", userMsg);
            formData.append("user_email", email);
            formData.append("thread_id", activeThreadId);
            if (viewerMaterial?.course_id) formData.append("course_id", viewerMaterial.course_id);
            if (viewerMaterial) {
                formData.append("query_type", "notebook_analysis");
                formData.append("material_id", targetMaterialId || viewerMaterial.id);
                // Pass material content for instant grounding
                if (attachmentText) formData.append("attachment_text", attachmentText);
                else if (viewerMaterial.content) formData.append("attachment_text", viewerMaterial.content);
            }

            const response = await fetch(`${API_URL}/api/chat/stream`, {
                method: "POST",
                body: formData
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = "";
            let accumulatedReasoning = "";
            let accumulatedSources: any[] = [];

            setMessages(prev => [...prev, { role: "assistant", content: "", thinking: true }]);

            while (reader) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data: THREAD_ID:")) {
                        const newId = line.replace("data: THREAD_ID:", "").trim();
                        setActiveThreadId(newId);
                        fetchThreads();
                    } else if (line.startsWith("data: SOURCE:")) {
                        try {
                            const sourceData = JSON.parse(line.replace("data: SOURCE:", ""));
                            accumulatedSources.push(sourceData);
                        } catch (e) { }
                    } else if (line.startsWith("data: REASONING:")) {
                        accumulatedReasoning += line.replace("data: REASONING:", "");
                    } else if (line.startsWith("data: ")) {
                        const lineContent = line.replace("data: ", "").trim();
                        if (!lineContent) continue;

                        if (lineContent.startsWith("EVENT:")) {
                            setThinkingStep(lineContent.replace("EVENT:", "").trim());
                            continue;
                        }

                        // Parse token if JSON, else append raw
                        try {
                            const parsed = JSON.parse(lineContent);
                            if (parsed.token) {
                                accumulatedContent += parsed.token;
                            } else {
                                accumulatedContent += lineContent;
                            }
                        } catch (e) {
                            accumulatedContent += lineContent;
                        }

                        setMessages(prev => {
                            const newMsgs = [...prev];
                            const last = { ...newMsgs[newMsgs.length - 1] };
                            last.content = accumulatedContent;
                            last.reasoning = accumulatedReasoning;
                            last.sources = accumulatedSources;
                            last.thinking = false;
                            newMsgs[newMsgs.length - 1] = last;
                            return newMsgs;
                        });
                    }
                }
            }
        } catch (e: any) {
            console.error("Stream Error:", e);
        } finally {
            setIsLoading(false);
            setThinkingStep(null);
        }
    };

    useEffect(() => {
        const q = searchParams.get("q") || searchParams.get("query");
        const materialId = searchParams.get("material_id");

        if (!initializedRef.current) {
            if (q) {
                initializedRef.current = true;
                sendMessage(q);
            } else if (materialId) {
                initializedRef.current = true;
                const fetchAnalysisMaterial = async () => {
                    const email = standardize_email(localStorage.getItem("user_email"));
                    try {
                        const res = await fetch(`${API_URL}/api/courses/material/${materialId}?user_email=${email}`);
                        const data = await res.json();
                        setViewerMaterial(data);
                        const firstDoc = (data.attachments || [])[0];
                        setActiveAttachment(firstDoc);
                        sendMessage(`Analyze and summarize this: "${data.title}". Give an executive summary and suggested inquiries.`, data.content, data.id);
                    } catch (e) { }
                };
                fetchAnalysisMaterial();
            }
        }
    }, [searchParams]);

    return (
        <div className="flex h-screen w-full bg-white dark:bg-[#050505] text-gray-900 dark:text-white overflow-hidden">
            <Sidebar
                threads={threads}
                activeThreadId={activeThreadId}
                onThreadSelect={handleThreadSelect}
                onNewChat={() => { setActiveThreadId("new"); setMessages([]); }}
                onDeleteThread={handleDeleteThread}
            />

            <main className="flex-1 flex overflow-hidden relative">
                <AnimatePresence>
                    {viewerMaterial && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: "60%", opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="h-full border-r border-white/5 flex flex-col bg-[#0a0a0a]"
                        >
                            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur-xl">
                                <span className="text-[10px] font-black uppercase text-gray-400">Analysis: <span className="text-white ml-2">{viewerMaterial.title}</span></span>
                                <button onClick={() => setViewerMaterial(null)} className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white"><X size={18} /></button>
                            </div>
                            <div className="flex-1 bg-white relative">
                                {activeAttachment ? (
                                    <iframe
                                        src={
                                            (activeAttachment.url?.includes('drive.google.com') || activeAttachment.type === 'drive')
                                                ? `${API_URL}/api/courses/proxy/drive/${activeAttachment.id}?user_email=${localStorage.getItem('user_email')}`
                                                : activeAttachment.url?.replace('/view', '/preview')
                                        }
                                        className="w-full h-full border-none"
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center p-12 text-center bg-[#0a0a0a]">
                                        <div className="max-w-md">
                                            <FileText size={40} className="mx-auto text-gray-600 mb-4" />
                                            <p className="text-gray-400 text-xs font-bold leading-relaxed">{viewerMaterial.content}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className={clsx("flex flex-col relative h-full", viewerMaterial ? "w-[40%]" : "flex-1")}>
                    <header className="px-8 py-5 border-b border-white/5 flex justify-between items-center bg-white/50 dark:bg-black/20 backdrop-blur-xl">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                                <Cpu size={20} className="text-blue-500" />
                            </div>
                            <div>
                                <h2 className="text-sm font-black tracking-tight">{threads.find(t => t.id === activeThreadId)?.title || "Neural Workspace"}</h2>
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">Academic Synthesis Active</p>
                            </div>
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-premium" onScroll={(e) => {
                        const target = e.currentTarget;
                        setIsAutoScrolling(target.scrollHeight - target.scrollTop <= target.clientHeight + 100);
                    }}>
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                                <Zap size={64} className="text-blue-500" />
                                <h3 className="text-xl font-black">Neural Link Established</h3>
                            </div>
                        ) : (
                            messages.map((msg, i) => (
                                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                                    <div className={clsx("max-w-4xl p-6 rounded-[2rem] text-sm", msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "glass-dark border border-white/5 text-gray-100 rounded-tl-none shadow-2xl")}>
                                        <MessageContent
                                            content={msg.content}
                                            sources={msg.sources}
                                            reasoning={msg.reasoning}
                                            onCitationClick={(page) => {
                                                if (activeAttachment && iframeRef.current) {
                                                    const baseUrl = (activeAttachment.url?.includes('drive.google.com') || activeAttachment.type === 'drive')
                                                        ? `${API_URL}/api/courses/proxy/drive/${activeAttachment.id}?user_email=${localStorage.getItem('user_email')}`
                                                        : activeAttachment.url?.replace('/view', '/preview');

                                                    try {
                                                        // Use absolute URL for URL constructor
                                                        const absoluteBase = baseUrl.startsWith('http') ? baseUrl : window.location.origin + baseUrl;
                                                        const url = new URL(absoluteBase);
                                                        url.searchParams.set('page', page);
                                                        iframeRef.current.src = url.toString();
                                                    } catch (err) {
                                                        // Fallback for simple string concat if URL construction fails
                                                        const separator = baseUrl.includes('?') ? '&' : '?';
                                                        iframeRef.current.src = `${baseUrl}${separator}page=${page}`;
                                                    }
                                                }
                                            }}
                                            onInquiryClick={(query) => sendMessage(query)}
                                        />
                                    </div>
                                </motion.div>
                            ))
                        )}
                        {thinkingStep && (
                            <div className="flex items-center gap-2 text-blue-500 px-2 font-black uppercase tracking-[0.2em] text-[10px]">
                                <Loader2 size={12} className="animate-spin" />
                                {thinkingStep}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <footer className="p-8">
                        <div className="max-w-4xl mx-auto relative group">
                            <div className="glass-dark border border-white/10 rounded-3xl p-3 flex items-center gap-3 bg-white/50 dark:bg-black/40">
                                <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-white/5 text-gray-400 transition-all"><Paperclip size={20} /></button>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                                <textarea
                                    rows={1}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                                    className="flex-1 bg-transparent border-none focus:outline-none text-white font-bold py-3 text-sm px-2 resize-none"
                                    placeholder="Execute neural query..."
                                />
                                <button onClick={() => sendMessage()} disabled={isLoading} className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><ChevronRight size={24} /></button>
                            </div>
                        </div>
                    </footer>
                </div>
            </main>
        </div>
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="h-screen bg-[#050505] flex items-center justify-center text-blue-500 font-bold">INIT...</div>}>
            <ChatBody />
        </Suspense>
    );
}
