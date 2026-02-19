"use client";
import Sidebar from "@/components/Sidebar";
import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Send, User, Bot, Sparkles, StopCircle, Paperclip, X, FileText, Image as ImageIcon, BookOpen, Quote, Cpu, Settings, Zap, ChevronRight, RefreshCw, Layers, Copy, Check, Reply } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { API_URL, standardize_email } from "@/utils/config";

interface Source {
    title: string;
    display: string;
    link?: string;
    snippet?: string;
    source_type?: string;
}

interface MessageContentProps {
    content: string;
    sources?: Source[];
    onOpenDocument?: (url: string, title: string) => void;
}

function MessageContent({ content, sources = [], onOpenDocument }: MessageContentProps) {
    const [expandedSnippet, setExpandedSnippet] = useState<number | null>(null);

    // 1. Parse Personal Reasoning (Handle typos like PERNALIZED)
    const reasoningRegex = /\[(?:PERSONAL_REASONING|PERNALIZED_CONTEXT_USED)(?::\s*(.*?))?\]/i;
    const reasoningMatch = content.match(reasoningRegex);
    const hasPersonalReasoning = !!reasoningMatch;
    const reasoningItems = reasoningMatch && reasoningMatch[1] ? reasoningMatch[1].split(",").map(s => s.trim()) : [];

    // 2. Parse Exact Documents Referenced (with Page Support)
    const docsRegex = /\[DOCUMENTS_REFERENCED(?::\s*(.*?))?\]/i;
    const docsMatch = content.match(docsRegex);
    const docItemsRaw = docsMatch && docsMatch[1] ? docsMatch[1].split(",").map(s => s.trim()) : [];

    // Extract base titles and pages: "Syllabus [Page 1, 2]" -> { baseTitle: "Syllabus", pages: "1, 2" }
    const docCitations = docItemsRaw.map(item => {
        const pageMatch = item.match(/(.*?)\s*\[Page(?:s)?\s*(.*?)\]/i);
        if (pageMatch) {
            return {
                baseTitle: pageMatch[1].trim(),
                pages: pageMatch[2].trim(),
                full: item
            };
        }
        return { baseTitle: item, pages: null, full: item };
    });

    // 3. Clean Content
    let cleanContent = content
        .replace(reasoningRegex, "")
        .replace(docsRegex, "")
        .trim();

    // 4. Source Attribution (legacy support)
    const sourceRegex = /SOURCE: \[(.*?)\]/g;
    const legacySources = Array.from(cleanContent.matchAll(sourceRegex)).map(m => m[1]);
    let markdownContent = cleanContent.replace(sourceRegex, "").trim();

    // Merge citations
    const retrievedTitles = sources.map(s => s.title);
    const allBaseSources = Array.from(new Set([
        ...docCitations.map(d => d.baseTitle),
        ...legacySources,
        ...retrievedTitles
    ])).filter(s => s && s.toLowerCase() !== "none");

    // Normalize LaTeX delimiters for better rendering
    let finalDisplayContent = markdownContent
        .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$")
        .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$")
        .trim();

    if (!finalDisplayContent) finalDisplayContent = content.trim();

    return (
        <div className="space-y-6 w-full">
            {hasPersonalReasoning && (
                <div className="flex flex-col gap-3 mb-6 p-4 rounded-2xl bg-gradient-to-br from-pink-500/10 to-transparent border border-pink-500/10 shadow-inner">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1 px-2 glass bg-pink-500 rounded text-[9px] font-black text-white uppercase tracking-widest shadow-lg shadow-pink-500/20">
                            Neural Inference
                        </div>
                        <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400 opacity-70">Cognitive Nodes Active</span>
                    </div>
                    {reasoningItems.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {reasoningItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/40 dark:bg-pink-500/10 border border-pink-500/20 shadow-sm transition-transform hover:scale-105">
                                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-pink-700 dark:text-pink-300 uppercase tracking-wide">
                                        {item}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[10px] text-pink-600/60 dark:text-pink-400/60 font-medium italic">Synthesizing personalized academic context...</p>
                    )}
                </div>
            )}

            <div className="markdown-content prose dark:prose-invert prose-blue max-w-none">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                        p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed text-gray-900 dark:text-gray-200 font-medium">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc ml-6 mb-4 space-y-2 text-gray-900 dark:text-gray-200 font-medium">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-6 mb-4 space-y-2 text-gray-900 dark:text-gray-200 font-medium">{children}</ol>,
                        h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white tracking-tight">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-6 text-gray-900 dark:text-white tracking-tight">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4 text-gray-900 dark:text-white tracking-tight">{children}</h3>,
                        code: ({ node, ...props }) => (
                            <code className="bg-white/5 px-1.5 py-0.5 rounded text-blue-400 text-[13px] font-mono border border-white/5" {...props} />
                        ),
                        pre: ({ children }) => (
                            <pre className="bg-black/40 p-5 rounded-2xl border border-white/5 overflow-x-auto my-6 shadow-xl scrollbar-thin">
                                {children}
                            </pre>
                        ),
                    }}
                >
                    {finalDisplayContent}
                </ReactMarkdown>
            </div>

            {allBaseSources.length > 0 && (
                <div className="pt-10 border-t border-gray-100 dark:border-white/5 mt-10 space-y-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
                                <Layers size={14} className="text-blue-500" />
                            </div>
                            <div>
                                <h5 className="text-[11px] font-black uppercase tracking-[0.25em] text-gray-500">Academic Integrity Report</h5>
                                <p className="text-[9px] text-gray-400 font-medium">Verified sources retrieved from your Digital Twin's vault</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-full shadow-sm">
                            <Quote size={10} className="text-blue-500/50" />
                            <span className="text-[10px] font-black text-gray-600 dark:text-blue-400/80 uppercase tracking-tighter">{allBaseSources.length} Citations</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                        {allBaseSources.map((baseTitle, idx) => {
                            const matchedSource = sources.find(s => s.title.toLowerCase() === baseTitle.toLowerCase());
                            const citation = docCitations.find(d => d.baseTitle.toLowerCase() === baseTitle.toLowerCase());
                            const displayTitle = matchedSource?.display || baseTitle;
                            const link = matchedSource?.link;
                            const pages = citation?.pages;
                            const snippet = matchedSource?.snippet;

                            return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    whileHover={{ y: -4, scale: 1.01 }}
                                    className="group/source relative h-full"
                                >
                                    <div className="h-full flex flex-col p-4 rounded-[24px] glass-dark border border-gray-200/50 dark:border-white/5 bg-white/70 dark:bg-black/60 hover:border-blue-500/40 hover:bg-blue-500/[0.02] transition-all duration-300 shadow-xl shadow-black/5">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20">
                                                <FileText size={18} className="text-white" />
                                            </div>
                                            {pages ? (
                                                <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                                    <BookOpen size={10} className="text-blue-500" />
                                                    <span className="text-[10px] font-extrabold text-blue-500 uppercase">Pages {pages}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-white/5 rounded-md">
                                                    <span className="text-[8px] font-bold text-gray-400 uppercase">Document</span>
                                                </div>
                                            )}
                                        </div>

                                        {link ? (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    if (onOpenDocument) onOpenDocument(link, displayTitle);
                                                }}
                                                className="block group/title text-left w-full"
                                            >
                                                <h4 className="text-[12px] font-black text-gray-900 dark:text-gray-100 line-clamp-2 mb-3 leading-tight group-hover/title:text-blue-600 dark:group-hover/title:text-blue-400 transition-colors">
                                                    {displayTitle}
                                                </h4>
                                            </button>
                                        ) : (
                                            <h4 className="text-[12px] font-black text-gray-900 dark:text-gray-100 line-clamp-2 mb-3 leading-tight transition-colors">
                                                {displayTitle}
                                            </h4>
                                        )}


                                        <div className="mt-auto pt-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                                            {link ? (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => onOpenDocument?.(link, displayTitle)}
                                                        className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                                                    >
                                                        <Zap size={10} />
                                                        Focus View
                                                    </button>
                                                    <a
                                                        href={link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                                                        title="Open in new tab"
                                                    >
                                                        <RefreshCw size={12} />
                                                    </a>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-white/5 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-wider opacity-60">
                                                    <Settings size={10} />
                                                    Legacy Asset
                                                </div>
                                            )}
                                            <div className="flex items-center -space-x-1">
                                                <div className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-900 bg-blue-500 flex items-center justify-center">
                                                    <Check size={8} className="text-white" />
                                                </div>
                                            </div>
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

    const [isAutoScrolling, setIsAutoScrolling] = useState(true);

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
        fetchThreads(true);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleThreadSelect = (id: string) => {
        setActiveThreadId(id);
        fetchMessages(id);
    };

    const handleDeleteThread = async (id: string) => {
        if (confirm("Delete this conversation?")) {
            const email = standardize_email(localStorage.getItem("user_email"));
            await fetch(`${API_URL}/api/chat/threads/${id}?user_email=${email}`, { method: "DELETE" });
            if (activeThreadId === id) {
                setActiveThreadId("new");
                setMessages([]);
            }
            fetchThreads();
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            if (file.type.startsWith("image/")) {
                setPreviewUrl(URL.createObjectURL(file));
            } else {
                setPreviewUrl(null);
            }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const blob = items[i].getAsFile();
                if (blob) {
                    const isImage = blob.type.startsWith("image/");
                    const file = new File([blob], blob.name || `pasted-${Date.now()}.${isImage ? 'png' : 'file'}`, { type: blob.type });
                    setSelectedFile(file);
                    if (isImage) {
                        setPreviewUrl(URL.createObjectURL(blob));
                    } else {
                        setPreviewUrl(null);
                    }
                    e.preventDefault();
                }
            }
        }
    };

    const removeFile = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    const initializedRef = useRef(false);

    const [thinkingStep, setThinkingStep] = useState<string | null>(null);
    const [foundSources, setFoundSources] = useState<Source[]>([]);

    // --- NEW FEATURES STATE ---
    const [replyingTo, setReplyingTo] = useState<any>(null);
    const [selectionPopup, setSelectionPopup] = useState<{ x: number, y: number, text: string } | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [activeDocumentUrl, setActiveDocumentUrl] = useState<string | null>(null);
    const [activeDocumentTitle, setActiveDocumentTitle] = useState<string | null>(null);

    // Track if user has scrolled up
    const handleScroll = (e: any) => {
        const threshold = 100;
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
        setIsAutoScrolling(atBottom);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(text);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSelection = () => {
        const selection = window.getSelection();
        // Check if selection exists and is not empty
        if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
            setSelectionPopup(null);
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Show popup ONLY if selection is visible in viewport
        if (rect.width > 0 && rect.height > 0) {
            setSelectionPopup({
                x: rect.left + (rect.width / 2) - 60, // Center (approx 120px width)
                y: rect.top - 50, // Position above the selection
                text: selection.toString()
            });
        }
    };

    // Close selection popup on click outside
    useEffect(() => {
        const closePopup = (e: MouseEvent) => {
            // If clicking the popup itself, don't close
            // (Logic simplified: rely on button clicks)
            if ((e.target as HTMLElement).closest('button')) return;
            setSelectionPopup(null);
        };
        document.addEventListener('mousedown', closePopup);
        return () => document.removeEventListener('mousedown', closePopup);
    }, []);

    const sendMessage = async (forcedContent?: string) => {
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

        // --- HANDLE REPLY CONTEXT ---
        let finalUserMsg = contentToUse;
        if (replyingTo) {
            finalUserMsg = `[RE: ${replyingTo.content.substring(0, 50)}...] ${contentToUse}`;
            setReplyingTo(null);
        }

        const userMsg = finalUserMsg || (currentFile ? `Attached: ${currentFile.name}` : "");
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
        setFoundSources([]);

        try {
            const email = standardize_email(localStorage.getItem("user_email") || "");
            const formData = new FormData();
            formData.append("message", userMsg);
            formData.append("user_email", email);
            formData.append("thread_id", activeThreadId);

            const chatHistory = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));
            formData.append("history", JSON.stringify(chatHistory));
            if (currentFile) formData.append("file", currentFile);

            const response = await fetch(`${API_URL}/api/chat/stream`, { method: "POST", body: formData });

            if (!response.ok) {
                // Try to read error message from body
                let errorMsg = "Neural Link Connection Failed";
                try {
                    const errorJson = await response.json();
                    if (errorJson.detail) errorMsg = errorJson.detail;
                } catch (e) { }

                throw new Error(errorMsg);
            }

            if (!response.body) throw new Error("No neural data stream received.");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiMessage = "";
            let streamStarted = false;
            let buffer = "";

            let accumulatedSources: Source[] = []; // Local source tracker

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    fetchThreads();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                // We split by \n\n as per SSE convention, but some chunks might be plain text or JSON
                // The current backend sends distinct lines prefixed with "data: "
                let lines = buffer.split("\n\n");
                // Keep the last chunk as it might be incomplete
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine.startsWith("data: ")) continue;

                    const data = trimmedLine.slice(6);

                    if (data.startsWith("THREAD_ID:")) {
                        const newId = data.replace("THREAD_ID:", "").trim();
                        if (activeThreadId === "new") {
                            setActiveThreadId(newId);
                            fetchThreads();
                        }
                    } else if (data.startsWith("EVENT:THINKING:")) {
                        const step = data.replace("EVENT:THINKING:", "").trim();
                        setThinkingStep(step);

                        if (!streamStarted) {
                            streamStarted = true;
                            setMessages(prev => [...prev, {
                                role: "assistant",
                                content: step,
                                sources: accumulatedSources,
                                isThinking: true
                            }]);
                        } else {
                            setMessages(prev => {
                                const newMsgs = [...prev];
                                const last = newMsgs[newMsgs.length - 1];
                                if (last.role === "assistant" && last.isThinking) {
                                    last.content = step;
                                }
                                return newMsgs;
                            });
                        }
                    } else if (data.startsWith("EVENT:SOURCES:")) {
                        try {
                            const found = JSON.parse(data.replace("EVENT:SOURCES:", "").trim());
                            accumulatedSources = found;
                            setFoundSources(found);

                            if (!streamStarted) {
                                streamStarted = true;
                                setMessages(prev => [...prev, {
                                    role: "assistant",
                                    content: "Retrieving Academic Intelligence...",
                                    sources: found,
                                    isThinking: true
                                }]);
                            } else {
                                setMessages(prev => {
                                    const newMsgs = [...prev];
                                    const lastMsg = newMsgs[newMsgs.length - 1];
                                    if (lastMsg && lastMsg.role === "assistant") {
                                        lastMsg.sources = found;
                                    }
                                    return newMsgs;
                                });
                            }
                        } catch (e) { console.error("Error parsing sources", e); }
                    } else {
                        // Regular token content
                        if (!streamStarted) {
                            streamStarted = true;
                            setThinkingStep(null);
                            setMessages(prev => {
                                const newMsgs = [...prev];
                                const last = newMsgs[newMsgs.length - 1];
                                if (last && last.role === "assistant" && last.isThinking) {
                                    last.isThinking = false;
                                    last.content = ""; // Clear process text to start real content
                                    last.sources = accumulatedSources;
                                } else {
                                    newMsgs.push({
                                        role: "assistant",
                                        content: "",
                                        sources: accumulatedSources,
                                        isThinking: false
                                    });
                                }
                                return newMsgs;
                            });
                        }

                        // Parse token from raw or JSON
                        let token = data;
                        if (data.startsWith("{") && data.endsWith("}")) {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.token) token = parsed.token;
                            } catch (e) { }
                        }

                        aiMessage += token;
                        setMessages(prev => {
                            const newMsgs = [...prev];
                            const last = { ...newMsgs[newMsgs.length - 1] };
                            if (last.role === "assistant") {
                                last.content = aiMessage;
                                last.sources = accumulatedSources; // Ensure sources are kept
                                last.isThinking = false; // Safety flip
                            }
                            newMsgs[newMsgs.length - 1] = last;
                            return newMsgs;
                        });
                    }
                }
            }
        } catch (e: any) {
            console.error("Stream Error:", e);
            const errorText = e.message || "Connection Error. Neural Link Severed.";
            setMessages(prev => [...prev, { role: "system", content: errorText }]);
        } finally {
            setIsLoading(false);
            setThinkingStep(null);
        }
    };

    useEffect(() => {
        // Handle incoming query params from dashboard or other links
        const q = searchParams.get("q") || searchParams.get("query");
        if (q && !initializedRef.current) {
            initializedRef.current = true;
            setActiveThreadId("new");
            setMessages([]);
            sendMessage(q);

            // Clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete("q");
            url.searchParams.delete("query");
            window.history.replaceState({}, "", url);
        }
    }, [searchParams]);

    return (
        <div className="flex h-screen w-full bg-white dark:bg-[#050505] text-gray-900 dark:text-white font-sans selection:bg-blue-500/30 overflow-hidden transition-colors duration-500">
            <Sidebar
                threads={threads}
                activeThreadId={activeThreadId}
                onThreadSelect={handleThreadSelect}
                onNewChat={() => { setActiveThreadId("new"); setMessages([]); setActiveDocumentUrl(null); }}
                onDeleteThread={handleDeleteThread}
            />
            <div className="flex-1 flex overflow-hidden">
                <main
                    className={clsx(
                        "flex-1 flex flex-col relative transition-all duration-500 ease-in-out",
                        activeDocumentUrl ? "lg:flex-[0.4]" : "w-full",
                        "bg-dot-pattern"
                    )}
                    onScroll={handleScroll}
                >
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

                    <header className="px-8 py-5 glass-dark border-b border-gray-200 dark:border-white/5 flex justify-between items-center relative z-20">
                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 glass-card rounded-2xl flex items-center justify-center border border-gray-200 dark:border-white/10 shadow-2xl">
                                <Cpu size={22} className="text-blue-500 dark:text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                                    Neural <span className="text-blue-600 dark:text-blue-500">Workspace</span>
                                </h2>
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-700 dark:text-gray-500">Session: {activeThreadId === 'new' ? 'Uninitialized' : activeThreadId.slice(0, 8)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="px-3 py-1.5 glass rounded-full border border-blue-500/10 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Synapse Active</span>
                            </div>
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-premium relative z-10 scroll-smooth" onMouseUp={handleSelection}>
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="w-24 h-24 glass-card rounded-3xl flex items-center justify-center border border-white/10 shadow-2xl animate-float"
                                >
                                    <Zap size={48} className="text-blue-500" />
                                </motion.div>
                                <div className="max-w-md space-y-3">
                                    <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Neural Interface Ready</h3>
                                    <p className="text-gray-800 dark:text-gray-500 font-semibold leading-relaxed">
                                        Your personal AI Chatbot is online. Ask about course materials, upcoming labs, or synthesize a summary.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 max-w-lg">
                                    {["Summarize Recent Labs", "Upcoming Assignments", "Analyze Course Materials", "Study Plan Generation"].map(q => (
                                        <button
                                            key={q}
                                            onClick={() => setInput(q)}
                                            className="px-5 py-2.5 glass-card border border-gray-200 dark:border-white/5 text-[10px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-white hover:border-blue-500/30 transition-all hover:bg-gray-50 dark:hover:bg-white/5"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {messages.map((msg, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={i}
                                        className={clsx("flex flex-col max-w-[90%] lg:max-w-[80%] space-y-2 group/message", msg.role === "user" ? "ml-auto items-end" : "items-start")}
                                    >
                                        <div className={clsx(
                                            "px-6 py-4 rounded-[1.5rem] shadow-2xl relative overflow-hidden transition-colors duration-500",
                                            msg.role === "user" ? "bg-blue-600 text-white font-medium rounded-tr-none shadow-blue-900/20" : "glass-dark border border-gray-200 dark:border-white/5 rounded-tl-none font-medium text-gray-900 dark:text-gray-200 bg-white dark:bg-black/40 shadow-xl shadow-gray-200/50 dark:shadow-none"
                                        )}>
                                            {msg.attachment && msg.attachment_type?.startsWith('image/') && (
                                                <div className="mb-4 -mx-2 -mt-2">
                                                    <img src={msg.attachment} alt="Attachment" className="rounded-xl w-full max-h-[400px] object-cover border border-white/10" />
                                                </div>
                                            )}
                                            {msg.attachment && !msg.attachment_type?.startsWith('image/') && (
                                                <div className="mb-4 bg-gray-100 dark:bg-white/10 p-3 rounded-xl flex items-center gap-3 border border-gray-200 dark:border-white/10">
                                                    <div className="w-10 h-10 bg-gray-200 dark:bg-white/20 rounded-lg flex items-center justify-center">
                                                        <FileText size={20} className="text-blue-600 dark:text-white" />
                                                    </div>
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="text-sm font-bold truncate text-gray-900 dark:text-white">{msg.file_name || "Attachment"}</span>
                                                        <span className="text-[10px] opacity-70 uppercase tracking-widest text-gray-700 dark:text-gray-300">File Transferred</span>
                                                    </div>
                                                </div>
                                            )}

                                            {msg.isThinking ? (
                                                <div className="flex flex-col gap-4 py-2">
                                                    <div className="flex items-center gap-3">
                                                        <RefreshCw size={14} className="text-blue-500 animate-spin" />
                                                        <span className="text-xs font-bold text-blue-500 animate-pulse">{msg.content || "Neural Synthesis Active..."}</span>
                                                    </div>
                                                    {msg.sources && msg.sources.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                                                            {msg.sources.slice(0, 3).map((s: any, idx: number) => (
                                                                <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/5 border border-blue-500/10 text-[9px] font-bold text-blue-500/70">
                                                                    <BookOpen size={9} />
                                                                    <span className="truncate max-w-[100px]">{s.title}</span>
                                                                </div>
                                                            ))}
                                                            {msg.sources.length > 3 && (
                                                                <span className="text-[9px] font-bold text-gray-400 mt-1">+{msg.sources.length - 3} more sources</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <MessageContent
                                                    content={msg.content}
                                                    sources={msg.sources}
                                                    onOpenDocument={(url, title) => {
                                                        setActiveDocumentUrl(url);
                                                        setActiveDocumentTitle(title);
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 px-2 opacity-0 group-hover/message:opacity-100 transition-opacity">
                                            <span className="text-[9px] uppercase tracking-widest font-black text-gray-700 dark:text-gray-600 mr-2">
                                                {msg.role === "user" ? "Authorized User" : "Neural Synthesizer"}
                                            </span>

                                            <button
                                                onClick={() => handleCopy(msg.content)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-gray-500 hover:text-blue-500 transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                {copiedId === msg.content ? <Check size={12} /> : <Copy size={12} />}
                                            </button>

                                            <button
                                                onClick={() => setReplyingTo(msg)}
                                                className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded text-gray-500 hover:text-blue-500 transition-colors"
                                                title="Reply to message"
                                            >
                                                <Reply size={12} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* Standalone Thinking indicator (Pre-stream phase) */}
                        <AnimatePresence>
                            {thinkingStep && !messages.some(m => m.role === 'assistant' && (m.isThinking || m.content)) && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex flex-col items-start max-w-[90%] lg:max-w-[80%] space-y-4 mb-4 mt-8"
                                >
                                    <div className="glass-dark border border-blue-500/20 rounded-[1.5rem] px-8 py-6 shadow-2xl bg-white dark:bg-black/40 relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 animate-pulse" />
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                                <RefreshCw size={18} className="text-blue-500 animate-spin" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-blue-500 font-black text-[10px] uppercase tracking-[0.2em] mb-1">Process Active</span>
                                                <span className="text-gray-900 dark:text-white font-bold text-sm tracking-tight">{thinkingStep}</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div ref={messagesEndRef} />

                        {/* Selection Popup */}
                        <AnimatePresence>
                            {selectionPopup && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    style={{
                                        position: 'fixed',
                                        left: selectionPopup.x,
                                        top: selectionPopup.y,
                                        zIndex: 9999,
                                        pointerEvents: 'auto'
                                    }}
                                    className="flex gap-1 bg-white dark:bg-black rounded-full shadow-2xl p-1 border border-gray-200 dark:border-white/10"
                                >
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setInput(`Explain this: "${selectionPopup.text}"`);
                                            setSelectionPopup(null);
                                            setTimeout(() => fileInputRef.current?.focus(), 50);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold shadow-sm hover:bg-blue-500 transition-all whitespace-nowrap"
                                    >
                                        <Sparkles size={12} />
                                        Ask AI
                                    </button>
                                    <div className="w-[1px] bg-gray-200 dark:bg-white/10 my-1" />
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleCopy(selectionPopup.text);
                                            setSelectionPopup(null);
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 rounded-full text-xs font-bold transition-all whitespace-nowrap"
                                    >
                                        <Copy size={12} />
                                        Copy
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <footer className="p-8 relative z-20">
                        <div className="max-w-6xl mx-auto space-y-4">
                            <AnimatePresence>
                                {replyingTo && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="flex items-center gap-3 p-3 glass-dark bg-white/50 dark:bg-black/40 border border-blue-500/20 rounded-2xl mb-2 backdrop-blur-md relative overflow-hidden"
                                    >
                                        <div className="w-1 h-8 bg-blue-500 rounded-full" />
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest mb-0.5">Replying to {replyingTo.role === 'user' ? 'Yourself' : 'Neural Synthesizer'}</p>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 truncate font-medium">{replyingTo.content}</p>
                                        </div>
                                        <button
                                            onClick={() => setReplyingTo(null)}
                                            className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </motion.div>
                                )}
                                {selectedFile && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                                        className="relative inline-block group"
                                    >
                                        {previewUrl ? (
                                            <img src={previewUrl} alt="Preview" className="h-32 rounded-2xl border-2 border-blue-500 shadow-2xl" />
                                        ) : (
                                            <div className="h-20 px-6 bg-blue-900/20 rounded-2xl border border-blue-500/50 flex items-center gap-3 shadow-2xl backdrop-blur-md">
                                                <FileText size={24} className="text-blue-400" />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-blue-100 max-w-[150px] truncate">{selectedFile.name}</span>
                                                    <span className="text-[10px] text-blue-400/70 font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                                </div>
                                            </div>
                                        )}
                                        <button onClick={removeFile} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-xl transition-colors">
                                            <X size={12} />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="relative group">
                                <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-3xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                                <div className="relative glass-dark border border-gray-200 dark:border-white/10 rounded-3xl p-3 flex items-center gap-3 shadow-2xl transition-all duration-500 focus-within:border-blue-500/40 bg-white dark:bg-black/40">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-12 h-12 flex items-center justify-center glass hover:bg-gray-100 dark:hover:bg-white/5 rounded-2xl text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all flex-shrink-0"
                                    >
                                        <Paperclip size={20} />
                                    </button>
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                                    <input
                                        type="text" className="flex-1 bg-transparent border-none focus:outline-none text-gray-900 dark:text-white placeholder-gray-600 dark:placeholder-gray-600 font-bold py-3 text-sm px-2"
                                        placeholder="Execute academic query..." value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && !isLoading && sendMessage()}
                                        onPaste={handlePaste}
                                    />
                                    <button
                                        onClick={() => sendMessage()}
                                        disabled={isLoading || (!input.trim() && !selectedFile)}
                                        className="w-12 h-12 flex items-center justify-center bg-blue-600 text-white rounded-2xl hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 flex-shrink-0 shadow-lg shadow-blue-600/20"
                                    >
                                        {isLoading ? <RefreshCw size={20} className="animate-spin" /> : <ChevronRight size={24} />}
                                    </button>
                                </div>
                            </div>
                            <p className="text-center text-[9px] uppercase tracking-[0.4em] font-black text-gray-700 dark:text-gray-600 opacity-60 transition-colors">GPT-4O NEURAL ARCHITECTURE • QUANTUM PERSISTENCE ENABLED</p>
                        </div>
                    </footer>
                </main>

                <AnimatePresence>
                    {activeDocumentUrl && (
                        <motion.div
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="w-full lg:flex-[0.6] border-l border-gray-200 dark:border-white/5 bg-white dark:bg-[#050505] flex flex-col relative z-40 shadow-[-20px_0_50px_rgba(0,0,0,0.2)]"
                        >
                            <div className="p-4 border-b border-gray-200 dark:border-white/5 flex justify-between items-center bg-gray-50 dark:bg-black/20 backdrop-blur-xl">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 shadow-lg shadow-blue-500/5">
                                        <FileText size={18} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-500/70">Document Workspace</span>
                                        <h3 className="text-sm font-black truncate max-w-[200px] sm:max-w-[400px]">{activeDocumentTitle}</h3>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={activeDocumentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/5 rounded-xl transition-all"
                                        title="Open in Full Window"
                                    >
                                        <RefreshCw size={20} />
                                    </a>
                                    <button
                                        onClick={() => setActiveDocumentUrl(null)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all"
                                        title="Close Workspace"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 w-full relative bg-white overflow-hidden">
                                <iframe
                                    src={activeDocumentUrl}
                                    className="w-full h-full border-none"
                                    title="Institutional Document Viewer"
                                />
                                {/* Glass Overlay for smoothness */}
                                <div className="absolute inset-0 pointer-events-none border border-black/5 dark:border-white/5 rounded-none" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-blue-500 font-bold tracking-widest animate-pulse uppercase bg-[#050505]">Initializing Neural Link...</div>}>
            <ChatBody />
        </Suspense>
    );
}
