"use client";

import TopNav from "@/components/TopNav";
import DriveSyncModal from "@/components/DriveSyncModal";
import GmailSyncModal from "@/components/GmailSyncModal";
import GmailPreviewModal from "@/components/GmailPreviewModal";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, Bell, Sparkles, Calendar, Clock, BookOpen,
    Cloud, RefreshCw, ChevronRight, GraduationCap,
    ExternalLink, MapPin, User as UserIcon, CheckCircle2,
    Zap, Users, Mail, MessageSquare, Settings as SettingsIcon,
    Moon, Sun, Command, FileText
} from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { API_URL } from "@/utils/config";
import { useTheme } from "@/context/ThemeContext";

import { useAcademic } from "@/context/AcademicContext";

export default function Dashboard() {
    const router = useRouter();
    const { toggleTheme } = useTheme();
    const {
        courses,
        gmailMaterials,
        loading,
        syncing,
        error: academicError,
        startSync,
        refreshData
    } = useAcademic();

    const [userName, setUserName] = useState("");
    const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
    const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
    const [gmailVisibleCount, setGmailVisibleCount] = useState(10);
    const [selectedEmail, setSelectedEmail] = useState<any>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const name = localStorage.getItem("user_name");
        if (name) setUserName(name.split(" ")[0]);

        if (!localStorage.getItem("user_email")) {
            window.location.href = "/";
            return;
        }

        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [router]);

    // Search Logic
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const query = searchQuery.toLowerCase();
        const results: any[] = [];

        // 1. Search Courses
        courses.forEach(c => {
            if (c.name.toLowerCase().includes(query) || (c.professor && c.professor.toLowerCase().includes(query))) {
                results.push({ type: 'course', id: c.id, title: c.id === 'GMAIL_INBOX' ? 'Gmail' : c.name, subtitle: 'Course', icon: GraduationCap });
            }
        });

        // 2. Search Gmail Documents/Notifications
        gmailMaterials.forEach(note => {
            const titleMatch = note.title?.toLowerCase().includes(query);
            const descMatch = (note.description || note.content || "")?.toLowerCase().includes(query);
            if (titleMatch || descMatch) {
                results.push({
                    type: 'email',
                    title: note.title || "Untitled Intelligence",
                    subtitle: 'Mail',
                    icon: Mail,
                    action: () => setSelectedEmail(note)
                });
            }
        });

        // 3. Search Commands/Settings
        const commands = [
            { title: 'Open Settings', subtitle: 'Manage profile and themes', icon: SettingsIcon, action: () => router.push('/settings') },
            { title: 'Toggle Appearance', subtitle: 'Switch between light and dark', icon: Zap, action: () => toggleTheme() },
            { title: 'Neural Chat', subtitle: 'Ask AI academics or general questions', icon: MessageSquare, action: () => router.push('/chat') },
        ];

        commands.forEach(cmd => {
            if (cmd.title.toLowerCase().includes(query) || cmd.subtitle.toLowerCase().includes(query)) {
                results.push({ ...cmd, type: 'command' });
            }
        });

        // 5. Initial Fallback (Synchronous)
        if (results.length === 0) {
            results.push({
                type: 'ai',
                title: `Ask AI: "${searchQuery}"`,
                subtitle: 'Press Enter to ask',
                icon: Sparkles,
                action: () => router.push(`/chat?q=${encodeURIComponent(searchQuery)}`)
            });
        }

        setSearchResults(results);

        // 4. Search Course Materials via API (debounced)
        const searchMaterials = async () => {
            const email = localStorage.getItem("user_email");
            if (!email || query.length < 2) return;

            try {
                const res = await fetch(`${API_URL}/api/search/materials?q=${encodeURIComponent(query)}&user_email=${email}`);
                const materials = await res.json();

                // Remove the temporary "Ask AI" placeholder if we found real stuff
                const currentResults = results.filter(r => r.type !== 'ai');

                materials.forEach((m: any) => {
                    if (currentResults.some(r => r.id === m.id)) return;
                    currentResults.push({
                        type: 'document',
                        id: m.id,
                        title: m.title,
                        subtitle: `${m.type} • ${m.source}`,
                        icon: m.source === "Supermemory Memory" ? Sparkles : FileText,
                        action: () => m.source_link ? window.open(m.source_link, '_blank') : null
                    });
                });

                // Always append Ask AI at the bottom or if empty
                if (currentResults.length === 0 || true) { // Always show Ask AI at bottom? No, generic
                    if (currentResults.length === 0) {
                        currentResults.push({
                            type: 'ai',
                            title: `Ask AI: "${searchQuery}"`,
                            subtitle: 'Send this question to the chatbot',
                            icon: Sparkles,
                            action: () => router.push(`/chat?q=${encodeURIComponent(searchQuery)}`)
                        });
                    } else {
                        // Optional: Add "Search in Chat" as last option?
                        currentResults.push({
                            type: 'ai',
                            title: `Ask AI about "${searchQuery}"`,
                            subtitle: 'Search purely in chat',
                            icon: Sparkles,
                            action: () => router.push(`/chat?q=${encodeURIComponent(searchQuery)}`)
                        });
                    }
                }

                setSearchResults([...currentResults]);
            } catch (err) {
                console.error("Material search failed:", err);
            }
        };

        const timer = setTimeout(searchMaterials, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, courses, gmailMaterials, router, toggleTheme]);

    const handleSync = () => {
        startSync();
    };

    return (
        <div className="min-h-screen bg-[#fcfcfd] dark:bg-[#050505] text-gray-900 dark:text-white font-sans transition-colors duration-500 selection:bg-blue-500/30">
            <TopNav />
            <DriveSyncModal isOpen={isDriveModalOpen} onClose={() => setIsDriveModalOpen(false)} />
            <GmailSyncModal isOpen={isGmailModalOpen} onClose={() => setIsGmailModalOpen(false)} onSyncSuccess={refreshData} />
            <GmailPreviewModal isOpen={!!selectedEmail} onClose={() => setSelectedEmail(null)} email={selectedEmail} />

            <main className="max-w-[1400px] mx-auto pt-28 pb-20 px-6 space-y-10 relative">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

                {/* Header Section */}
                <header className="space-y-1 relative z-10">
                    <motion.h1
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl font-black tracking-tight"
                    >
                        Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{userName || "Student"}!</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-gray-500 font-medium"
                    >
                        Institution-aware neural workspace is ready.
                    </motion.p>
                </header>

                {/* AI Spotlight Search */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="relative z-[50]"
                    ref={searchRef}
                >
                    <div className={clsx(
                        "p-12 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-[3rem] shadow-2xl transition-all duration-500",
                        isSearchFocused ? "shadow-blue-500/10 ring-1 ring-blue-500/20" : "shadow-blue-500/5"
                    )}>
                        <div className="flex flex-col items-center text-center space-y-8 max-w-2xl mx-auto">
                            <div className="space-y-3">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <div className="w-8 h-8 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600">
                                        <Command size={18} />
                                    </div>
                                    <h2 className="text-2xl font-black tracking-tight">AI Spotlight Search</h2>
                                </div>
                                <p className="text-gray-500 font-medium">Search Drive, Classroom, or ask AI</p>
                            </div>

                            <div className="relative w-full group">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setIsSearchFocused(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            if (searchResults.length > 0) {
                                                const topResult = searchResults[0];
                                                if (topResult.action) topResult.action();
                                                else if (topResult.id) router.push(`/course/${topResult.id}`);
                                                setIsSearchFocused(false);
                                                setSearchQuery("");
                                            } else if (searchQuery.trim()) {
                                                // Fallback to Ask AI if no recommendations yet
                                                router.push(`/chat?q=${encodeURIComponent(searchQuery)}`);
                                                setIsSearchFocused(false);
                                                setSearchQuery("");
                                            }
                                        }
                                    }}
                                    placeholder="Search Drive, Gmail, Classroom..."
                                    className="w-full h-16 bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/10 rounded-[1.25rem] pl-8 pr-36 font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 transition-all text-lg"
                                />

                                <button
                                    onClick={() => searchQuery.trim() && router.push(`/chat?q=${encodeURIComponent(searchQuery)}`)}
                                    disabled={!searchQuery.trim()}
                                    className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-white/5 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-[1rem] px-5 font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 z-10"
                                >
                                    <Sparkles size={16} />
                                    Ask AI
                                </button>

                                {/* Search Results Dropdown */}
                                <AnimatePresence>
                                    {isSearchFocused && searchQuery && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute top-full left-0 right-0 mt-4 bg-white dark:bg-[#0a0a0a] border border-gray-100 dark:border-white/10 rounded-[2rem] shadow-2xl p-4 overflow-hidden z-[100]"
                                        >
                                            <div className="max-h-[300px] overflow-y-auto scrollbar-premium">
                                                {searchResults.length > 0 ? (
                                                    searchResults.map((res, i) => {
                                                        const Icon = res.icon;
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => {
                                                                    if (res.action) res.action();
                                                                    else if (res.id) router.push(`/course/${res.id}`);
                                                                    setIsSearchFocused(false);
                                                                    setSearchQuery("");
                                                                }}
                                                                className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-white/5 rounded-2xl cursor-pointer transition-all group"
                                                            >
                                                                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-blue-500 group-hover:bg-blue-500/10 transition-all">
                                                                    <Icon size={18} />
                                                                </div>
                                                                <div className="flex-1 text-left">
                                                                    <h4 className="text-sm font-black text-gray-900 dark:text-white leading-tight">{res.title}</h4>
                                                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{res.subtitle}</p>
                                                                </div>
                                                                <ChevronRight size={14} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-all" />
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="p-4 text-center text-gray-500">
                                                        Searching...
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-4">
                                <span className="text-xs font-black uppercase tracking-widest text-gray-400 mr-2">Quick Actions:</span>
                                <button
                                    onClick={() => router.push("/chat")}
                                    className="px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-600/10 hover:border-blue-500/30 transition-all active:scale-95"
                                >
                                    <MessageSquare size={16} className="text-blue-500" />
                                    Chatbot
                                </button>
                                <button
                                    onClick={() => setIsGmailModalOpen(true)}
                                    className="px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-600/10 hover:border-blue-500/30 transition-all active:scale-95"
                                >
                                    <Mail size={16} className="text-indigo-500" />
                                    Sync Gmail
                                </button>
                                <button
                                    onClick={() => setIsDriveModalOpen(true)}
                                    className="px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-600/10 hover:border-blue-500/30 transition-all active:scale-95"
                                >
                                    <Cloud size={16} className="text-sky-500" />
                                    Sync Drive
                                </button>
                                <button
                                    onClick={handleSync}
                                    disabled={syncing}
                                    className="px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-600/10 hover:border-blue-500/30 transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <RefreshCw size={16} className={clsx("text-emerald-500", syncing && "animate-spin")} />
                                    {syncing ? "Refreshing..." : "Refresh Classroom"}
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.section>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">

                    {/* Col 1: Institutional Intelligence (All Courses) */}
                    <motion.section
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="lg:col-span-4 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-[2.5rem] flex flex-col overflow-hidden shadow-xl"
                    >
                        <div className="p-8 pb-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-600/10 rounded-xl text-blue-600">
                                        <GraduationCap size={18} />
                                    </div>
                                    <h3 className="font-black tracking-tight">Your Courses</h3>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-lg text-gray-500">{courses.length} TOTAL</span>
                            </div>

                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                                <input
                                    type="text"
                                    placeholder="Filter courses..."
                                    className="w-full bg-gray-50 dark:bg-white/5 border border-transparent focus:border-blue-500/20 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none transition-all"
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 px-8 py-4 space-y-4 max-h-[500px] overflow-y-auto scrollbar-premium">
                            {loading ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="p-5 bg-gray-50/50 dark:bg-white/2 rounded-[1.5rem] flex items-center gap-5 animate-pulse">
                                        <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-white/5" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 bg-gray-200 dark:bg-white/5 rounded w-3/4" />
                                            <div className="h-2 bg-gray-200 dark:bg-white/5 rounded w-1/4" />
                                        </div>
                                    </div>
                                ))
                            ) : academicError ? (
                                <div className="text-center py-10 px-6 space-y-4 bg-red-500/5 rounded-[2rem] border border-red-500/10">
                                    <div className="w-12 h-12 bg-red-500/10 rounded-full mx-auto flex items-center justify-center text-red-500 font-bold">
                                        !
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-gray-900 dark:text-white">Connection Interrupted</p>
                                        <p className="text-xs text-gray-500 font-medium">Unable to reach the academic engine. Please ensure the local backend is running.</p>
                                    </div>
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="px-4 py-2 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-red-500 transition-colors"
                                    >
                                        Retry Connection
                                    </button>
                                </div>
                            ) : courses.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                                courses
                                    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .slice(0, 50) // Limit display for performance, search still covers all
                                    .map((course) => (
                                        <div
                                            key={course.id}
                                            onClick={() => window.location.href = `/course/${course.id}`}
                                            className="group p-5 bg-gray-50/50 dark:bg-white/2 border border-transparent hover:border-blue-500/20 hover:bg-white dark:hover:bg-white/5 rounded-[1.5rem] flex items-center gap-5 transition-all cursor-pointer"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                                                <BookOpen size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-gray-900 dark:text-white truncate">{course.id === 'GMAIL_INBOX' ? 'Gmail' : course.name}</h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{course.platform}</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-all translate-x-0 group-hover:translate-x-1" />
                                        </div>
                                    ))
                            ) : (courses.length === 0 && !loading) ? (
                                <div className="text-center py-12 px-6 space-y-4 bg-gray-50/50 dark:bg-white/2 rounded-[2rem] border border-dashed border-gray-200 dark:border-white/10">
                                    <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-3xl mx-auto flex items-center justify-center text-gray-400">
                                        <BookOpen size={32} />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-black text-gray-900 dark:text-white">Workspace Ready</h3>
                                        <p className="text-xs text-gray-500 font-medium">No courses have been synced yet.</p>
                                    </div>
                                    <button
                                        onClick={handleSync}
                                        disabled={syncing}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all disabled:opacity-50"
                                    >
                                        {syncing ? "Syncing..." : "Sync Now"}
                                    </button>
                                    <div className="pt-4 border-t border-gray-200 dark:border-white/5">
                                        <details className="text-left">
                                            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-blue-500">Debug Info</summary>
                                            <pre className="mt-2 text-[9px] bg-gray-900 text-green-400 p-2 rounded overflow-x-auto">
                                                {JSON.stringify({
                                                    api: API_URL,
                                                    email: localStorage.getItem("user_email"),
                                                    courses: courses.length,
                                                    error: academicError
                                                }, null, 2)}
                                            </pre>
                                        </details>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10 space-y-3">
                                    <div className="w-12 h-12 bg-gray-100 dark:bg-white/5 rounded-full mx-auto flex items-center justify-center text-gray-400 font-bold">
                                        !
                                    </div>
                                    <p className="text-gray-500 font-medium text-sm">No courses matching your search.</p>
                                </div>
                            )}
                        </div>
                    </motion.section>

                    {/* Col 2: Neural Inbox (Gmail Insights) */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="lg:col-span-4 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-[2.5rem] flex flex-col overflow-hidden shadow-xl"
                    >
                        <div className="p-8 pb-4 flex items-center gap-3">
                            <div className="p-2 bg-indigo-600/10 rounded-xl text-indigo-600">
                                <Mail size={18} />
                            </div>
                            <h3 className="font-black tracking-tight">Gmail</h3>
                        </div>

                        <div className="flex-1 px-8 py-4 space-y-4 max-h-[800px] overflow-y-auto scrollbar-premium pb-24">
                            {academicError ? (
                                <div className="text-center py-20 px-6 space-y-4">
                                    <div className="w-16 h-16 bg-red-500/5 rounded-3xl mx-auto flex items-center justify-center text-red-500/50">
                                        <Mail size={32} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-gray-900 dark:text-white">Inbox Sync Unavailable</p>
                                        <p className="text-xs text-gray-500 font-medium">Verify engine status to restore Gmail insights.</p>
                                    </div>
                                </div>
                            ) : gmailMaterials.length > 0 ? (
                                <div className="space-y-4">
                                    {gmailMaterials.slice(0, gmailVisibleCount).map((item: any) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedEmail(item)}
                                            className="group p-4 bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-gray-100 dark:border-white/5 hover:border-blue-500/30 transition-all cursor-pointer"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                                                    <Mail size={18} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Mail</span>
                                                        <span className="text-[10px] font-bold text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-500 transition-colors truncate">
                                                        {item.title.replace(/^📧\s*[A-Z]+\s*:\s*/, '')}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1 font-medium leading-relaxed">
                                                        {item.content.split('\n\nCONTENT:')[0].replace('SUMMARY: ', '')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {gmailVisibleCount < gmailMaterials.length && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setGmailVisibleCount(prev => prev + 10);
                                            }}
                                            className="w-full py-4 bg-gray-50 dark:bg-white/[0.02] rounded-2xl border border-dashed border-gray-200 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 hover:text-blue-500 hover:border-blue-500/30 transition-all"
                                        >
                                            Load More Insights ({gmailMaterials.length - gmailVisibleCount} remaining)
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-20 px-6 space-y-4">
                                    <div className="w-16 h-16 bg-gray-50 dark:bg-white/5 rounded-3xl mx-auto flex items-center justify-center text-gray-300">
                                        <Mail size={32} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-black text-gray-900 dark:text-white">Mail Ready</p>
                                        <p className="text-xs text-gray-500 font-medium">Synced with your entire academic inbox. Click 'Refresh Classroom' if empty.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => {
                                const userEmail = localStorage.getItem("user_email");
                                if (userEmail) {
                                    window.open(`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(userEmail)}`, '_blank');
                                } else {
                                    window.open('https://mail.google.com', '_blank');
                                }
                            }}
                            className="px-8 py-5 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/2 hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-400 flex items-center justify-center gap-2"
                        >
                            Go to Gmail Workspace
                        </button>
                    </motion.section>

                    {/* Col 3: System Controls & Repository */}
                    <motion.section
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="lg:col-span-4 space-y-8"
                    >
                        <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-[2.5rem] p-8 shadow-xl flex flex-col relative overflow-hidden group">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="p-2 bg-emerald-600/10 rounded-xl text-emerald-600">
                                    <Zap size={18} />
                                </div>
                                <h3 className="font-black tracking-tight">System Controls</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => router.push('/settings')}
                                    className="p-6 bg-gray-50 dark:bg-white/5 rounded-[2rem] flex flex-col items-center gap-3 hover:bg-blue-50 dark:hover:bg-blue-600/10 transition-all border border-transparent hover:border-blue-500/20"
                                >
                                    <SettingsIcon className="text-blue-500" size={24} />
                                    <span className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-400">Settings</span>
                                </button>
                                <button
                                    onClick={toggleTheme}
                                    className="p-6 bg-gray-50 dark:bg-white/5 rounded-[2rem] flex flex-col items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-600/10 transition-all border border-transparent hover:border-indigo-500/20"
                                >
                                    <div className="relative">
                                        <Sun size={24} className="text-orange-500 dark:opacity-0 transition-opacity" />
                                        <Moon size={24} className="text-indigo-500 absolute top-0 left-0 opacity-0 dark:opacity-100 transition-opacity" />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-400">Appearance</span>
                                </button>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-600/20 relative overflow-hidden group">
                            <Sparkles size={120} className="absolute -bottom-10 -right-10 text-white/10 group-hover:rotate-12 transition-transform duration-700" />
                            <div className="relative z-10 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Zap size={18} className="text-yellow-400 fill-yellow-400" />
                                    <span className="text-xs font-black uppercase tracking-[0.2em]">Neural Insight</span>
                                </div>
                                <h3 className="text-xl font-black leading-tight">Sync complete. Your mail repository is up to date.</h3>
                                <p className="text-white/80 text-sm font-medium leading-relaxed">Integrated {courses.length} courses and {gmailMaterials.length} inbox highlights into your AI Chatbot repository.</p>
                                <button
                                    onClick={() => router.push('/chat')}
                                    className="px-6 py-3 bg-white text-blue-600 font-black rounded-xl text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
                                >
                                    Ask Anything
                                </button>
                            </div>
                        </div>
                    </motion.section>
                </div>

            </main>
        </div >
    );
}
