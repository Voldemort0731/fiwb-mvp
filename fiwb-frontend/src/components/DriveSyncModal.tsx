"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, X, Check, Loader2, Cloud, Search, ChevronRight, Trash2, FolderSync, FolderMinus, FileText, Sparkles } from "lucide-react";
import { API_URL } from "@/utils/config";
import clsx from "clsx";

interface DriveSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = "add" | "manage";

export default function DriveSyncModal({ isOpen, onClose }: DriveSyncModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>("add");
    const [syncedFolders, setSyncedFolders] = useState<any[]>([]);
    const [loadingSynced, setLoadingSynced] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchSyncedFolders();
        }
    }, [isOpen]);

    const openPicker = async () => {
        const email = localStorage.getItem("user_email");
        if (!email) return;

        setSyncing(true);
        try {
            // 1. Fetch fresh access token from backend
            const tokenRes = await fetch(`${API_URL}/api/auth/token?user_email=${email}`);
            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;

            if (!accessToken) throw new Error("Could not retrieve access token");

            // 2. Load gapi and open picker
            const loadGapi = () => {
                return new Promise((resolve) => {
                    const g = window as any;
                    if (g.gapi) {
                        g.gapi.load("picker", resolve);
                    } else {
                        const script = document.createElement("script");
                        script.src = "https://apis.google.com/js/api.js";
                        script.onload = () => g.gapi.load("picker", resolve);
                        document.body.appendChild(script);
                    }
                });
            };

            await loadGapi();
            const g = window as any;

            const docsView = new g.google.picker.DocsView()
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true);

            const picker = new g.google.picker.PickerBuilder()
                .addView(docsView)
                .setOAuthToken(accessToken)
                .setDeveloperKey("") // Optional: User should add API Key for better limits
                .setCallback(async (data: any) => {
                    if (data.action === (g.google.picker as any).Action.PICKED) {
                        const docs = data.docs;
                        const ids = docs.map((d: any) => d.id);
                        await handleSyncManual(ids);
                    }
                })
                .build();
            picker.setVisible(true);
        } catch (e) {
            console.error("Picker failed", e);
            alert("Failed to open Google Picker. Please try again.");
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncManual = async (ids: string[]) => {
        const email = localStorage.getItem("user_email");
        if (!email || !ids.length) return;

        setSyncing(true);
        try {
            await fetch(`${API_URL}/api/drive/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_email: email,
                    folder_ids: ids
                })
            });

            await fetchSyncedFolders();
            setActiveTab("manage");
            window.dispatchEvent(new Event('drive-sync-refresh'));
        } catch (e) {
            console.error("Sync failed", e);
        } finally {
            setSyncing(false);
        }
    };

    const fetchSyncedFolders = async () => {
        const email = localStorage.getItem("user_email");
        if (!email) return;
        setLoadingSynced(true);
        try {
            const res = await fetch(`${API_URL}/api/drive/synced-folders?user_email=${email}`);
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setSyncedFolders(data);
            } else {
                setSyncedFolders([]);
            }
        } catch (e) {
            console.error("Failed to fetch synced folders", e);
            setSyncedFolders([]);
        } finally {
            setLoadingSynced(false);
        }
    };


    const handleRemoveFolder = async (folderId: string) => {
        const email = localStorage.getItem("user_email");
        if (!email) return;

        const confirmed = confirm("Remove this folder from sync? Its synced documents will be deleted.");
        if (!confirmed) return;

        setRemoving(folderId);
        try {
            const res = await fetch(`${API_URL}/api/drive/unsync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_email: email,
                    folder_ids: [folderId]
                })
            });

            if (res.ok) {
                // Remove from local state immediately
                setSyncedFolders(prev => prev.filter(f => f.id !== folderId));

                // Refresh dashboard data
                window.dispatchEvent(new Event('drive-sync-refresh'));
            }
        } catch (e) {
            console.error("Failed to remove folder", e);
        } finally {
            setRemoving(null);
        }
    };

    const handleRemoveAll = async () => {
        const email = localStorage.getItem("user_email");
        if (!email || syncedFolders.length === 0) return;

        const confirmed = confirm(`Remove ALL ${syncedFolders.length} synced folders? All synced documents will be deleted.`);
        if (!confirmed) return;

        setRemoving("all");
        try {
            const allIds = syncedFolders.map(f => f.id);
            const res = await fetch(`${API_URL}/api/drive/unsync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_email: email,
                    folder_ids: allIds
                })
            });

            if (res.ok) {
                setSyncedFolders([]);
                window.dispatchEvent(new Event('drive-sync-refresh'));
            }
        } catch (e) {
            console.error("Failed to remove all folders", e);
        } finally {
            setRemoving(null);
        }
    };


    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-2xl bg-white dark:bg-[#0a0a0a] border border-gray-100 dark:border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] transition-colors duration-500"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-8 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gradient-to-r from-blue-600/5 to-transparent transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gray-50 dark:bg-black/40 rounded-2xl flex items-center justify-center border border-gray-200 dark:border-white/10 shadow-xl">
                                    <Cloud className="text-blue-600 dark:text-blue-400" size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Google Drive Sync</h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-500 font-bold uppercase tracking-widest leading-relaxed">
                                        Manage your synced Drive folders
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors text-gray-500 dark:text-gray-400">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="px-8 pt-4 pb-0 flex gap-2 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.02] transition-colors">
                            <button
                                onClick={() => setActiveTab("add")}
                                className={clsx(
                                    "flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-[1px]",
                                    activeTab === "add"
                                        ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-white dark:bg-[#0a0a0a]"
                                        : "text-gray-400 dark:text-gray-600 border-transparent hover:text-gray-600 dark:hover:text-gray-400"
                                )}
                            >
                                <FolderSync size={14} />
                                Add Folders
                            </button>
                            <button
                                onClick={() => setActiveTab("manage")}
                                className={clsx(
                                    "flex items-center gap-2 px-5 py-3 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-[1px]",
                                    activeTab === "manage"
                                        ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-white dark:bg-[#0a0a0a]"
                                        : "text-gray-400 dark:text-gray-600 border-transparent hover:text-gray-600 dark:hover:text-gray-400"
                                )}
                            >
                                <FolderMinus size={14} />
                                Synced ({syncedFolders.length})
                            </button>
                        </div>

                        {/* Tab Content */}
                        {activeTab === "add" ? (
                            <>
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center space-y-8 bg-dot-pattern">
                                    <div className="w-24 h-24 bg-blue-600/10 rounded-3xl flex items-center justify-center border border-blue-500/20 shadow-2xl animate-float">
                                        <Cloud className="text-blue-500" size={48} />
                                    </div>
                                    <div className="max-w-xs space-y-4">
                                        <h4 className="text-xl font-black text-gray-900 dark:text-white">Secure Access Model</h4>
                                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                            FIWB uses <span className="text-blue-500 font-black">DRIVE.FILE</span> permissions.
                                            We only see the specific folders you explicitly select.
                                        </p>
                                        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 p-4 rounded-2xl flex gap-3 text-left">
                                            <Sparkles className="text-blue-600 shrink-0" size={18} />
                                            <p className="text-[11px] text-blue-700 dark:text-blue-400 font-bold leading-normal">
                                                <span className="uppercase tracking-widest block mb-1">Recommended Interaction</span>
                                                Select your <span className="underline decoration-2 underline-offset-2 text-blue-800 dark:text-blue-300">"Classroom"</span> folder to automatically sync all your course PDFs, docs, and materials.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={openPicker}
                                        disabled={syncing}
                                        className="px-8 py-5 bg-blue-600 dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                                    >
                                        {syncing ? <Loader2 className="animate-spin" size={20} /> : <FolderSync size={20} />}
                                        Open Google Picker
                                    </button>
                                </div>

                            </>
                        ) : (
                            /* MANAGE TAB - Synced Folders */
                            <>
                                <div className="flex-1 overflow-y-auto p-4 scrollbar-premium">
                                    {loadingSynced ? (
                                        <div className="h-64 flex flex-col items-center justify-center gap-4 text-gray-500">
                                            <Loader2 className="animate-spin text-blue-500" size={32} />
                                            <span className="text-sm font-black uppercase tracking-[0.2em]">Loading synced folders...</span>
                                        </div>
                                    ) : syncedFolders.length === 0 ? (
                                        <div className="h-64 flex flex-col items-center justify-center text-center p-8">
                                            <FolderMinus className="text-gray-300 dark:text-gray-800 mb-4" size={48} />
                                            <p className="text-gray-500 font-medium">No folders synced yet</p>
                                            <p className="text-xs text-gray-400 mt-2">
                                                Switch to <span className="font-bold">Add Folders</span> to start syncing.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2">
                                            {syncedFolders.map(folder => (
                                                <motion.div
                                                    key={folder.id}
                                                    layout
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, x: -50 }}
                                                    className="group flex items-center justify-between p-4 rounded-2xl border border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={clsx(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center border",
                                                            folder.type === 'application/vnd.google-apps.folder'
                                                                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                                                                : "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20"
                                                        )}>
                                                            {folder.type === 'application/vnd.google-apps.folder' ? (
                                                                <Folder size={20} className="text-emerald-600 dark:text-emerald-400" />
                                                            ) : (
                                                                <FileText size={20} className="text-blue-600 dark:text-blue-400" />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <span className="font-black text-sm tracking-tight text-gray-900 dark:text-white">{folder.name}</span>
                                                            <p className={clsx(
                                                                "text-[10px] font-black uppercase tracking-widest mt-0.5",
                                                                folder.type === 'application/vnd.google-apps.folder' ? "text-emerald-600" : "text-blue-600"
                                                            )}>
                                                                {folder.type === 'application/vnd.google-apps.folder' ? "Synced Folder" : "Direct Link"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveFolder(folder.id)}
                                                        disabled={removing === folder.id || removing === "all"}
                                                        className="p-2.5 rounded-xl border border-transparent hover:border-red-200 dark:hover:border-red-500/20 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all disabled:opacity-30"
                                                        title="Remove from sync"
                                                    >
                                                        {removing === folder.id ? (
                                                            <Loader2 className="animate-spin" size={16} />
                                                        ) : (
                                                            <Trash2 size={16} />
                                                        )}
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Footer for Manage Tab */}
                                <div className="p-8 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black transition-colors">
                                    <div className="flex gap-4">
                                        <button
                                            onClick={onClose}
                                            className="flex-1 py-4 bg-white dark:bg-transparent border border-gray-200 dark:border-white/5 rounded-2xl font-black text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-all uppercase tracking-widest"
                                        >
                                            Done
                                        </button>
                                        {syncedFolders.length > 0 && (
                                            <button
                                                onClick={handleRemoveAll}
                                                disabled={removing !== null}
                                                className="flex-1 py-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 disabled:opacity-30 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                                            >
                                                {removing === "all" ? (
                                                    <Loader2 className="animate-spin" size={18} />
                                                ) : (
                                                    <>
                                                        <Trash2 size={16} />
                                                        Remove All
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
