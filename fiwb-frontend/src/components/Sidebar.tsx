"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard, MessageSquareText, Settings, LogOut,
    Plus, MessageCircle, Trash2, TrendingUp, Cloud, BookOpen,
    Network, Edit2, Check, X as XIcon, FolderPlus, Folder,
    FolderOpen, ChevronDown, ChevronRight, MoreHorizontal,
    Tag, Palette
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DriveSyncModal from "@/components/DriveSyncModal";
import clsx from "clsx";
import { API_URL } from "@/utils/config";

/* ─── Types ─── */

interface Group {
    id: string;
    name: string;
    color: string;
    emoji: string;
}

interface Thread {
    id: string;
    title: string;
    thread_type: string;
    material_id?: string;
    course_id?: string;
    group_id?: string | null;
    updated_at?: string;
}

interface SidebarProps {
    threads?: Thread[];
    activeThreadId?: string;
    onThreadSelect?: (id: string) => void;
    onNewChat?: () => void;
    onDeleteThread?: (id: string) => void;
    onRenameThread?: (id: string, newTitle: string) => void;
}

/* ─── Preset Color Palette for Groups ─── */
const GROUP_COLORS = [
    "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
    "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"
];

const GROUP_EMOJIS = ["📁", "🚀", "💡", "📚", "🧪", "🎯", "🔬", "⚡", "🌟", "🔥", "💎", "🎓"];

/* ─── Thread Context Menu ─── */
function ThreadContextMenu({
    groups,
    currentGroupId,
    onAssignGroup,
    onClose
}: {
    groups: Group[];
    currentGroupId?: string | null;
    onAssignGroup: (groupId: string | null) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 z-50 w-52 bg-[#0d0d0d] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
            onClick={e => e.stopPropagation()}
        >
            <div className="p-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-600 px-2 py-1.5">
                    Move to Group
                </p>

                {/* Ungrouped option */}
                <button
                    onClick={() => { onAssignGroup(null); onClose(); }}
                    className={clsx(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all",
                        !currentGroupId
                            ? "bg-white/10 text-white"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    <Tag size={12} className="text-gray-500" />
                    Ungrouped
                    {!currentGroupId && <Check size={10} className="ml-auto text-blue-400" />}
                </button>

                {groups.length > 0 && <div className="h-px bg-white/5 my-1.5" />}

                {groups.map(g => (
                    <button
                        key={g.id}
                        onClick={() => { onAssignGroup(g.id); onClose(); }}
                        className={clsx(
                            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all",
                            currentGroupId === g.id
                                ? "bg-white/10 text-white"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <span className="text-sm">{g.emoji}</span>
                        <span className="truncate">{g.name}</span>
                        {currentGroupId === g.id && <Check size={10} className="ml-auto text-blue-400" />}
                    </button>
                ))}
            </div>
        </motion.div>
    );
}

/* ─── Individual Thread Item ─── */
function ThreadItem({
    thread, isActive, onSelect, onDelete, onRename, onAssignGroup, groups
}: {
    thread: Thread;
    isActive: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onRename: (newTitle: string) => void;
    onAssignGroup: (groupId: string | null) => void;
    groups: Group[];
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(thread.title || "New Session");
    const [showMenu, setShowMenu] = useState(false);

    const isMindmap = thread.thread_type === "mindmap";
    const isAnalysis = thread.thread_type === "analysis" || (!!thread.material_id && !isMindmap);

    let ThreadIcon = MessageCircle;
    let iconColor = "text-gray-500";
    if (isMindmap) { ThreadIcon = Network; iconColor = "text-indigo-400"; }
    else if (isAnalysis) { ThreadIcon = BookOpen; iconColor = "text-emerald-400"; }

    const handleRenameSubmit = () => {
        if (title.trim() && title !== thread.title) onRename(title);
        setIsEditing(false);
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className={clsx(
                "group relative flex items-center justify-between px-2.5 py-2 rounded-xl transition-all duration-200 cursor-pointer",
                isActive
                    ? "bg-white/10 text-white"
                    : "hover:bg-white/5 text-gray-500 hover:text-gray-300"
            )}
            onClick={() => !isEditing && !showMenu && onSelect()}
        >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ThreadIcon size={13} className={clsx("shrink-0", isActive ? "text-blue-400" : iconColor)} />
                {isEditing ? (
                    <input
                        autoFocus
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") { setTitle(thread.title); setIsEditing(false); } }}
                        onClick={e => e.stopPropagation()}
                        className="bg-white/10 border border-blue-500/40 rounded-lg px-2 py-0.5 text-xs font-semibold text-white focus:outline-none w-full"
                    />
                ) : (
                    <span className="text-xs font-semibold truncate">{thread.title || "New Session"}</span>
                )}
            </div>

            {/* Actions — visible on hover */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                {!isEditing && (
                    <button
                        onClick={e => { e.stopPropagation(); setIsEditing(true); }}
                        className="p-1 hover:bg-white/10 rounded-md transition-all text-gray-600 hover:text-white"
                        title="Rename"
                    >
                        <Edit2 size={11} />
                    </button>
                )}
                <div className="relative">
                    <button
                        onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
                        className="p-1 hover:bg-white/10 rounded-md transition-all text-gray-600 hover:text-white"
                        title="Move to Group"
                    >
                        <MoreHorizontal size={11} />
                    </button>
                    <AnimatePresence>
                        {showMenu && (
                            <ThreadContextMenu
                                groups={groups}
                                currentGroupId={thread.group_id}
                                onAssignGroup={onAssignGroup}
                                onClose={() => setShowMenu(false)}
                            />
                        )}
                    </AnimatePresence>
                </div>
                <button
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                    className="p-1 hover:bg-red-500/10 rounded-md transition-all text-gray-600 hover:text-red-400"
                    title="Delete"
                >
                    <Trash2 size={11} />
                </button>
            </div>
        </motion.div>
    );
}

/* ─── Group Section ─── */
function GroupSection({
    group, threads, activeThreadId, groups,
    onThreadSelect, onDeleteThread, onRenameThread, onAssignGroup,
    onRenameGroup, onDeleteGroup
}: {
    group: Group;
    threads: Thread[];
    activeThreadId?: string;
    groups: Group[];
    onThreadSelect?: (id: string) => void;
    onDeleteThread?: (id: string) => void;
    onRenameThread?: (id: string, title: string) => void;
    onAssignGroup: (threadId: string, groupId: string | null) => void;
    onRenameGroup: (id: string, name: string) => void;
    onDeleteGroup: (id: string) => void;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(group.name);
    const [showGroupMenu, setShowGroupMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowGroupMenu(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleRenameSubmit = () => {
        if (name.trim() && name !== group.name) onRenameGroup(group.id, name);
        setIsEditing(false);
    };

    const FolderIcon = collapsed ? Folder : FolderOpen;

    return (
        <div className="mb-3">
            {/* Group Header */}
            <div className="flex items-center gap-1.5 px-1 mb-1 group/header">
                <button
                    onClick={() => setCollapsed(v => !v)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 py-1 px-1.5 rounded-lg hover:bg-white/5 transition-all"
                >
                    <span className="text-sm leading-none">{group.emoji}</span>
                    {isEditing ? (
                        <input
                            autoFocus
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={e => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") { setName(group.name); setIsEditing(false); } }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white/10 border border-blue-500/30 rounded px-1.5 text-[11px] font-black text-white uppercase tracking-widest focus:outline-none w-full"
                        />
                    ) : (
                        <span
                            className="text-[10px] font-black uppercase tracking-widest truncate"
                            style={{ color: group.color }}
                        >
                            {group.name}
                        </span>
                    )}
                    <span className="text-[9px] text-gray-700 font-bold ml-auto shrink-0">
                        {threads.length}
                    </span>
                    {collapsed
                        ? <ChevronRight size={10} className="text-gray-600 shrink-0" />
                        : <ChevronDown size={10} className="text-gray-600 shrink-0" />
                    }
                </button>

                {/* Group context actions */}
                <div className="relative opacity-0 group-hover/header:opacity-100 transition-all" ref={menuRef}>
                    <button
                        onClick={e => { e.stopPropagation(); setShowGroupMenu(v => !v); }}
                        className="p-1 hover:bg-white/10 rounded-md text-gray-700 hover:text-white transition-all"
                    >
                        <MoreHorizontal size={11} />
                    </button>
                    <AnimatePresence>
                        {showGroupMenu && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                className="absolute right-0 top-7 z-50 w-40 bg-[#0d0d0d] border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1.5"
                            >
                                <button
                                    onClick={() => { setIsEditing(true); setShowGroupMenu(false); }}
                                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                                >
                                    <Edit2 size={12} /> Rename
                                </button>
                                <button
                                    onClick={() => { onDeleteGroup(group.id); setShowGroupMenu(false); }}
                                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-all"
                                >
                                    <Trash2 size={12} /> Delete Group
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Threads inside group */}
            <AnimatePresence>
                {!collapsed && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pl-3 space-y-0.5 overflow-hidden border-l"
                        style={{ borderColor: group.color + "33" }}
                    >
                        <AnimatePresence mode="popLayout">
                            {threads.map(thread => (
                                <ThreadItem
                                    key={thread.id}
                                    thread={thread}
                                    isActive={activeThreadId === thread.id}
                                    groups={groups}
                                    onSelect={() => {
                                        if (thread.thread_type === "mindmap") {
                                            window.location.href = `/mindmap/${thread.course_id || "placeholder"}?thread=${thread.id}`;
                                        } else if (thread.thread_type === "analysis" || thread.material_id) {
                                            window.location.href = `/analysis/${thread.material_id}?thread=${thread.id}`;
                                        } else {
                                            onThreadSelect?.(thread.id);
                                        }
                                    }}
                                    onDelete={() => onDeleteThread?.(thread.id)}
                                    onRename={newTitle => onRenameThread?.(thread.id, newTitle)}
                                    onAssignGroup={gId => onAssignGroup(thread.id, gId)}
                                />
                            ))}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── Create Group Modal ─── */
function CreateGroupModal({ onClose, onCreate }: {
    onClose: () => void;
    onCreate: (name: string, color: string, emoji: string) => void;
}) {
    const [name, setName] = useState("");
    const [color, setColor] = useState(GROUP_COLORS[0]);
    const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="relative w-[340px] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-0.5">New Project Group</p>
                        <h3 className="text-lg font-black text-white">Create Group</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-all">
                        <XIcon size={16} />
                    </button>
                </div>

                {/* Preview */}
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 mb-5">
                    <span className="text-2xl">{emoji}</span>
                    <span className="font-black text-sm" style={{ color }}>{name || "Group Name"}</span>
                </div>

                {/* Name input */}
                <div className="mb-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5 block">Group Name</label>
                    <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && name.trim()) onCreate(name, color, emoji); }}
                        placeholder="e.g. Semester 2 Project"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-all"
                    />
                </div>

                {/* Emoji picker */}
                <div className="mb-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5 block">Icon</label>
                    <div className="flex flex-wrap gap-2">
                        {GROUP_EMOJIS.map(e => (
                            <button
                                key={e}
                                onClick={() => setEmoji(e)}
                                className={clsx(
                                    "w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition-all",
                                    emoji === e
                                        ? "border-blue-500/60 bg-blue-500/10"
                                        : "border-white/5 hover:border-white/20 bg-white/5"
                                )}
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Color picker */}
                <div className="mb-6">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5 block">Color</label>
                    <div className="flex gap-2">
                        {GROUP_COLORS.map(c => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={clsx(
                                    "w-7 h-7 rounded-full border-2 transition-all",
                                    color === c ? "border-white scale-110" : "border-transparent scale-100"
                                )}
                                style={{ background: c }}
                            />
                        ))}
                    </div>
                </div>

                <button
                    disabled={!name.trim()}
                    onClick={() => onCreate(name, color, emoji)}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-gray-600 text-white font-black rounded-xl transition-all text-sm tracking-wide"
                >
                    Create Group
                </button>
            </motion.div>
        </motion.div>
    );
}

/* ─── Main Sidebar ─── */
export default function Sidebar({ threads = [], activeThreadId, onThreadSelect, onNewChat, onDeleteThread, onRenameThread }: SidebarProps) {
    const pathname = usePathname();
    const [email, setEmail] = useState<string | null>(null);
    const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
    const [groups, setGroups] = useState<Group[]>([]);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [localThreads, setLocalThreads] = useState<Thread[]>(threads);

    // Sync localThreads when parent passes new threads
    useEffect(() => { setLocalThreads(threads); }, [threads]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const em = localStorage.getItem("user_email");
            setEmail(em);
            if (em) fetchGroups(em);
        }
    }, []);

    const fetchGroups = async (em: string) => {
        try {
            const res = await fetch(`${API_URL}/api/chat/groups?user_email=${em}`);
            if (res.ok) setGroups(await res.json());
        } catch { }
    };

    const handleCreateGroup = async (name: string, color: string, emoji: string) => {
        if (!email) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/groups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_email: email, name, color, emoji })
            });
            if (res.ok) {
                const g = await res.json();
                setGroups(prev => [...prev, g]);
            }
        } catch { }
        setShowCreateGroup(false);
    };

    const handleRenameGroup = async (id: string, name: string) => {
        if (!email) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/groups/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_email: email, name })
            });
            if (res.ok) {
                const g = await res.json();
                setGroups(prev => prev.map(gr => gr.id === id ? { ...gr, ...g } : gr));
            }
        } catch { }
    };

    const handleDeleteGroup = async (id: string) => {
        if (!email) return;
        try {
            await fetch(`${API_URL}/api/chat/groups/${id}?user_email=${email}`, { method: "DELETE" });
            setGroups(prev => prev.filter(g => g.id !== id));
            // Unassign threads locally
            setLocalThreads(prev => prev.map(t => t.group_id === id ? { ...t, group_id: null } : t));
        } catch { }
    };

    const handleAssignGroup = async (threadId: string, groupId: string | null) => {
        if (!email) return;
        try {
            const res = await fetch(`${API_URL}/api/chat/threads/${threadId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_email: email, group_id: groupId })
            });
            if (res.ok) {
                setLocalThreads(prev => prev.map(t => t.id === threadId ? { ...t, group_id: groupId } : t));
            }
        } catch { }
    };

    const handleSignOut = () => {
        localStorage.clear();
        window.location.href = "/";
    };

    const links = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "AI Chatbot", href: "/chat", icon: MessageSquareText },
        { name: "Mind Maps", href: "/dashboard", icon: Network },
        { name: "Operational Insights", href: "/admin", icon: TrendingUp },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    const OWNER_EMAIL = "owaissayyed2007@gmail.com";
    const isOwner = email === OWNER_EMAIL;
    const isChatPage = pathname === "/chat";
    const isAnalysisPage = pathname?.startsWith("/analysis");
    const showThreads = isChatPage || isAnalysisPage || pathname?.startsWith("/mindmap");

    // Separate grouped vs ungrouped threads
    const groupedThreads = (gId: string) => localThreads.filter(t => t.group_id === gId);
    const ungroupedThreads = localThreads.filter(t => !t.group_id);

    // Auto-type sections (for ungrouped)
    const autoSections = [
        {
            label: "AI Conversations", type: "chat", icon: MessageCircle, color: "text-blue-400",
            filter: (t: Thread) => t.thread_type === "chat" || !t.thread_type
        },
        {
            label: "Document Analysis", type: "analysis", icon: BookOpen, color: "text-emerald-400",
            filter: (t: Thread) => t.thread_type === "analysis" || (!!t.material_id && t.thread_type !== "mindmap")
        },
        {
            label: "Concept Graphs", type: "mindmap", icon: Network, color: "text-indigo-400",
            filter: (t: Thread) => t.thread_type === "mindmap"
        }
    ];

    const threadActions = (thread: Thread) => ({
        onSelect: () => {
            if (thread.thread_type === "mindmap") {
                window.location.href = `/mindmap/${thread.course_id || "placeholder"}?thread=${thread.id}`;
            } else if (thread.thread_type === "analysis" || thread.material_id) {
                window.location.href = `/analysis/${thread.material_id}?thread=${thread.id}`;
            } else {
                onThreadSelect?.(thread.id);
            }
        },
        onDelete: () => onDeleteThread?.(thread.id),
        onRename: (newTitle: string) => onRenameThread?.(thread.id, newTitle),
        onAssignGroup: (gId: string | null) => handleAssignGroup(thread.id, gId),
    });

    return (
        <>
            <div className="flex flex-col h-full w-72 bg-white dark:bg-[#050505] border-r border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-400 p-5 flex-shrink-0 relative overflow-hidden transition-colors duration-500">
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />

                {/* Logo */}
                <Link href="/dashboard" className="flex items-center gap-3 mb-8 px-1 relative z-10 hover:opacity-90 transition-opacity group">
                    <div className="w-9 h-9 rounded-xl overflow-hidden shadow-xl border border-gray-200 dark:border-white/10 bg-[#060606] group-hover:scale-105 transition-transform">
                        <img src="/fiwb-logo.svg" alt="FIWB" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">FIWB <span className="text-blue-500">AI</span></div>
                </Link>

                {/* New Chat button */}
                {isChatPage && (
                    <div className="mb-6 relative z-10">
                        <button
                            onClick={onNewChat}
                            className="w-full flex items-center gap-3 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl border border-blue-500/30 transition-all font-bold text-sm shadow-lg shadow-blue-500/10 group"
                        >
                            <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus size={14} />
                            </div>
                            New Chat
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-premium relative z-10">
                    {/* Navigation */}
                    <section>
                        <p className="text-[10px] font-black text-gray-500 dark:text-gray-600 uppercase tracking-[0.2em] mb-3 px-2">Navigation</p>
                        <div className="space-y-0.5">
                            {links.map(link => {
                                if (link.name === "Operational Insights" && !isOwner) return null;
                                const Icon = link.icon;
                                const isActive = pathname === link.href;
                                return (
                                    <Link key={link.name} href={link.href} className={clsx(
                                        "flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-semibold",
                                        isActive
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                            : "text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5"
                                    )}>
                                        <Icon size={16} />
                                        {link.name}
                                    </Link>
                                );
                            })}
                            <button
                                onClick={() => setIsDriveModalOpen(true)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all text-sm font-semibold text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5"
                            >
                                <Cloud size={16} />Sync Drive
                            </button>
                        </div>
                    </section>

                    {/* Thread workspace */}
                    {showThreads && (
                        <section className="space-y-4">
                            {/* Custom Groups header */}
                            <div className="flex items-center justify-between px-2">
                                <p className="text-[10px] font-black text-gray-500 dark:text-gray-600 uppercase tracking-[0.2em]">Projects</p>
                                <button
                                    onClick={() => setShowCreateGroup(true)}
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-black text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all uppercase tracking-wide"
                                    title="New Group"
                                >
                                    <FolderPlus size={11} />
                                    New
                                </button>
                            </div>

                            {/* Render custom groups */}
                            {groups.length > 0 && (
                                <div className="space-y-2">
                                    {groups.map(group => {
                                        const gThreads = groupedThreads(group.id);
                                        if (gThreads.length === 0 && groups.length > 0) {
                                            // Show empty group still so user can rename/delete
                                        }
                                        return (
                                            <GroupSection
                                                key={group.id}
                                                group={group}
                                                threads={gThreads}
                                                activeThreadId={activeThreadId}
                                                groups={groups}
                                                onThreadSelect={onThreadSelect}
                                                onDeleteThread={onDeleteThread}
                                                onRenameThread={onRenameThread}
                                                onAssignGroup={handleAssignGroup}
                                                onRenameGroup={handleRenameGroup}
                                                onDeleteGroup={handleDeleteGroup}
                                            />
                                        );
                                    })}
                                </div>
                            )}

                            {/* Ungrouped auto-type sections */}
                            {ungroupedThreads.length > 0 && (
                                <div className="space-y-4">
                                    {groups.length > 0 && (
                                        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] px-2">Ungrouped</p>
                                    )}
                                    {autoSections.map(section => {
                                        const sectionThreads = ungroupedThreads.filter(section.filter);
                                        if (sectionThreads.length === 0) return null;
                                        const SIcon = section.icon;
                                        return (
                                            <div key={section.type}>
                                                <div className="flex items-center gap-1.5 mb-1.5 px-2">
                                                    <SIcon size={10} className={clsx("opacity-50", section.color)} />
                                                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.18em]">{section.label}</p>
                                                </div>
                                                <div className="space-y-0.5">
                                                    <AnimatePresence mode="popLayout">
                                                        {sectionThreads.map(thread => (
                                                            <ThreadItem
                                                                key={thread.id}
                                                                thread={thread}
                                                                isActive={activeThreadId === thread.id}
                                                                groups={groups}
                                                                {...threadActions(thread)}
                                                            />
                                                        ))}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Empty state */}
                            {localThreads.length === 0 && (
                                <div className="text-center py-8 px-3">
                                    <div className="w-12 h-12 mx-auto rounded-2xl bg-white/5 flex items-center justify-center mb-3 border border-white/5">
                                        <MessageCircle size={20} className="text-gray-600" />
                                    </div>
                                    <p className="text-xs text-gray-600 font-semibold">No sessions yet</p>
                                    <p className="text-[10px] text-gray-700 mt-1">Start a chat or open a document</p>
                                </div>
                            )}
                        </section>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-100 dark:border-white/5 pt-5 mt-5 relative z-10">
                    {email && (
                        <div className="px-2 mb-4 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white">
                                {email[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[8px] text-blue-500 font-black uppercase tracking-widest mb-0.5">Authenticated</p>
                                <p className="text-xs text-gray-900 dark:text-white font-bold truncate">{email}</p>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-gray-500 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-all text-sm font-semibold border border-transparent hover:border-red-500/10"
                    >
                        <LogOut size={15} />
                        De-authorize Session
                    </button>
                </div>

                <DriveSyncModal isOpen={isDriveModalOpen} onClose={() => setIsDriveModalOpen(false)} />
            </div>

            {/* Create Group Modal */}
            <AnimatePresence>
                {showCreateGroup && (
                    <CreateGroupModal
                        onClose={() => setShowCreateGroup(false)}
                        onCreate={handleCreateGroup}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
