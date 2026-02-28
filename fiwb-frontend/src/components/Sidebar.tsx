"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquareText, Settings, LogOut, ChevronRight, Plus, MessageCircle, Trash2, TrendingUp, Mail, Cloud, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DriveSyncModal from "@/components/DriveSyncModal";
import clsx from "clsx";

interface SidebarProps {
    threads?: any[];
    activeThreadId?: string;
    onThreadSelect?: (id: string) => void;
    onNewChat?: () => void;
    onDeleteThread?: (id: string) => void;
}

export default function Sidebar({ threads = [], activeThreadId, onThreadSelect, onNewChat, onDeleteThread }: SidebarProps) {
    const pathname = usePathname();
    const [email, setEmail] = useState<string | null>(null);
    const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setEmail(localStorage.getItem("user_email"));
        }
    }, []);

    const handleSignOut = () => {
        localStorage.removeItem("user_email");
        localStorage.removeItem("user_id");
        localStorage.removeItem("user_name");
        localStorage.removeItem("user_picture");
        window.location.href = "/";
    };

    const links = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "AI Chatbot", href: "/chat", icon: MessageSquareText },
        { name: "Operational Insights", href: "/admin", icon: TrendingUp },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    const OWNER_EMAIL = "owaissayyed2007@gmail.com";
    const isOwner = email === OWNER_EMAIL;

    const isChatPage = pathname === "/chat";
    const isAnalysisPage = pathname?.startsWith("/analysis");
    const showThreads = isChatPage || isAnalysisPage;

    return (
        <div className="flex flex-col h-full w-72 bg-white dark:bg-[#050505] border-r border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-400 p-6 flex-shrink-0 relative overflow-hidden bg-dot-pattern transition-colors duration-500">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />

            <Link href="/dashboard" className="flex items-center gap-3 mb-10 px-2 relative z-10 cursor-pointer hover:opacity-90 transition-opacity group">
                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-white/10 bg-[#060606] group-hover:scale-105 transition-transform">
                    <img src="/fiwb-logo.svg" alt="FIWB" className="w-full h-full object-cover" />
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">FIWB <span className="text-blue-500">AI</span></div>
            </Link>

            {isChatPage && (
                <div className="mb-8 px-2 relative z-10">
                    <button
                        onClick={onNewChat}
                        className="w-full flex items-center gap-3 p-3.5 bg-blue-600 dark:bg-transparent glass hover:bg-blue-500 dark:hover:bg-white/10 text-gray-900 dark:text-white rounded-xl border border-blue-500/20 hover:border-blue-500/40 transition-all font-bold text-sm shadow-lg shadow-blue-500/5 group"
                    >
                        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform text-white">
                            <Plus size={16} />
                        </div>
                        Create a New Chat
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-8 pr-2 scrollbar-premium relative z-10">
                <section>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] mb-4 px-3">Navigation</p>
                    <div className="space-y-1">
                        {links.map((link) => {
                            // Hide Operational Insights from non-owners
                            if (link.name === "Operational Insights" && !isOwner) return null;

                            const Icon = link.icon;
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className={clsx(
                                        "group flex items-center justify-between p-3 rounded-xl transition-all duration-300",
                                        isActive
                                            ? "glass-card text-gray-900 dark:text-white border-gray-200 dark:border-white/10 shadow-lg"
                                            : "hover:bg-gray-100 dark:hover:bg-white/5 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon size={18} className={isActive ? "text-blue-500" : "text-gray-400 dark:text-gray-500 group-hover:text-blue-400 transition-colors"} />
                                        <span className="font-semibold text-sm tracking-tight">{link.name}</span>
                                    </div>
                                    {isActive && <motion.div layoutId="active-nav" className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                                </Link>
                            );
                        })}


                        <button
                            onClick={() => setIsDriveModalOpen(true)}
                            className="w-full group flex items-center justify-between p-3 rounded-xl transition-all duration-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent text-gray-400 dark:text-gray-600"
                        >
                            <div className="flex items-center gap-3">
                                <Cloud size={18} className="text-gray-400 dark:text-gray-500 group-hover:text-sky-400 transition-colors" />
                                <span className="font-semibold text-sm tracking-tight">Sync Drive</span>
                            </div>
                        </button>
                    </div>
                </section>

                {showThreads && threads.length > 0 && (
                    <section className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-600 uppercase tracking-[0.2em] mb-4 px-3">Recent Chats</p>
                        <div className="space-y-1">
                            <AnimatePresence>
                                {threads.map((thread) => {
                                    const isAnalysis = !!thread.material_id;
                                    const ThreadIcon = isAnalysis ? BookOpen : MessageCircle;
                                    return (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            key={thread.id}
                                            className={clsx(
                                                "group flex items-center justify-between p-3 rounded-xl transition-all duration-300 cursor-pointer border",
                                                activeThreadId === thread.id
                                                    ? "glass-card text-gray-900 dark:text-white border-blue-500/20 shadow-lg"
                                                    : "hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400 border-transparent"
                                            )}
                                            onClick={() => {
                                                if (isAnalysis) {
                                                    window.location.href = `/analysis/${thread.material_id}?thread=${thread.id}`;
                                                } else {
                                                    onThreadSelect?.(thread.id);
                                                }
                                            }}
                                        >
                                            <div className="flex items-center gap-3 min-w-0 pr-2">
                                                <ThreadIcon size={14} className={clsx(
                                                    activeThreadId === thread.id ? "text-blue-500" : "text-gray-400 dark:text-gray-600",
                                                    isAnalysis && "text-emerald-500"
                                                )} />
                                                <span className="text-xs font-semibold truncate tracking-tight">{thread.title || "New Session"}</span>
                                                {isAnalysis && <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded font-black uppercase tracking-widest shrink-0">Doc</span>}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteThread?.(thread.id); }}
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </section>
                )}
            </div>

            <div className="border-t border-gray-100 dark:border-white/5 pt-6 mt-6 relative z-10">
                {email && (
                    <div className="px-3 mb-6 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border border-white/10 flex items-center justify-center text-[10px] font-black text-white shadow-xl">
                            {email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[8px] text-blue-500 font-black uppercase tracking-widest leading-none mb-1">Authenticated</p>
                            <p className="text-xs text-gray-900 dark:text-white font-bold truncate" title={email}>{email}</p>
                        </div>
                    </div>
                )}
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 p-3 text-gray-600 dark:text-gray-500 hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all group border border-transparent hover:border-red-500/10"
                >
                    <LogOut size={16} />
                    <span className="text-sm font-semibold tracking-tight">De-authorize Session</span>
                </button>
            </div>

            <DriveSyncModal isOpen={isDriveModalOpen} onClose={() => setIsDriveModalOpen(false)} />
        </div>
    );
}
