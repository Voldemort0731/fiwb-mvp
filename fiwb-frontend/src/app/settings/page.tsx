"use client";
import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { User, LogOut, Sun, Moon, FileText, ChevronRight, Mail, ExternalLink, Shield, Info } from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useTheme } from "@/context/ThemeContext";

export default function SettingsPage() {
    const { theme, toggleTheme } = useTheme();
    const [user, setUser] = useState({
        email: "",
        name: "",
        picture: ""
    });

    useEffect(() => {
        if (typeof window !== "undefined") {
            const email = localStorage.getItem("user_email") || "";
            if (!email) {
                window.location.href = "/";
                return;
            }
            const name = localStorage.getItem("user_name") || "";
            const picture = localStorage.getItem("user_picture") || "";
            setUser({ email, name, picture });
        }
    }, []);

    const handleSignOut = () => {
        localStorage.removeItem("user_email");
        localStorage.removeItem("user_id");
        localStorage.removeItem("user_name");
        localStorage.removeItem("user_picture");
        window.location.href = "/";
    };

    return (
        <div className="flex h-screen bg-transparent text-gray-900 dark:text-white font-sans selection:bg-blue-500/30 overflow-hidden transition-colors duration-500">
            <Sidebar />
            <main className="flex-1 p-10 overflow-y-auto relative scrollbar-premium bg-dot-pattern">
                {/* Background Glows */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

                <header className="mb-16 relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 glass border border-white/10 rounded-full mb-4">
                        <Shield size={12} className="text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">System Preferences</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tight leading-tight">
                        Account <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Settings</span>
                    </h1>
                    <p className="text-gray-600 dark:text-gray-500 font-medium text-lg tracking-tight mt-2">Manage your identity, visuals, and compliance documents.</p>
                </header>

                <div className="max-w-4xl space-y-8 relative z-10">
                    {/* Profile Section */}
                    <section className="glass-card p-8 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden relative group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-3xl rounded-full translate-x-32 -translate-y-32 group-hover:bg-blue-600/10 transition-all duration-700" />

                        <div className="flex items-center gap-8 relative z-10">
                            <div className="relative">
                                {user.picture ? (
                                    <div className="w-28 h-28 rounded-3xl overflow-hidden border-2 border-blue-500/30 shadow-2xl relative z-10">
                                        <img src={user.picture} alt="Profile" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-28 h-28 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-4xl font-black text-white shadow-2xl">
                                        {user.email?.[0]?.toUpperCase() || "U"}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 space-y-3">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest leading-none">Identity Identifier</p>
                                    <h2 className="text-3xl font-black tracking-tight">{user.name || "Academic Subject"}</h2>
                                </div>
                                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
                                    <Mail size={16} className="text-blue-600 dark:text-blue-400" />
                                    <span className="font-semibold tracking-tight">{user.email}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleSignOut}
                                className="px-6 py-4 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white font-bold rounded-2xl transition-all border border-red-500/20 hover:border-red-600 flex items-center gap-3 active:scale-95 shadow-lg shadow-red-600/5 hover:shadow-red-600/20"
                            >
                                <LogOut size={20} />
                                <span>Terminate Session</span>
                            </button>
                        </div>
                    </section>

                    {/* Preferences & Documents Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Theme Toggle */}
                        <section className="glass-card p-8 rounded-[2rem] border border-white/10 flex flex-col justify-between group hover:border-blue-500/30 transition-all duration-500">
                            <div className="space-y-4">
                                <div className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-blue-400 border border-white/5">
                                    {theme === "dark" ? <Moon size={24} /> : <Sun size={24} />}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Visual Interface</h3>
                                    <p className="text-gray-500 text-sm font-medium mt-1">Switch between neural dark and clarity light modes.</p>
                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-between p-2 bg-gray-100 dark:bg-black/40 rounded-2xl border border-gray-200 dark:border-white/5 relative overflow-hidden transition-colors">
                                <button
                                    onClick={toggleTheme}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold z-10",
                                        theme === "light" ? "bg-white text-blue-600 shadow-xl" : "text-gray-600 dark:text-gray-500 hover:text-gray-900"
                                    )}
                                >
                                    <Sun size={16} className="text-orange-500 dark:text-blue-400" />
                                    <span>Clarity</span>
                                </button>
                                <button
                                    onClick={toggleTheme}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold z-10",
                                        theme === "dark" ? "bg-blue-600 text-white shadow-xl" : "text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
                                    )}
                                >
                                    <Moon size={16} />
                                    <span>Neural</span>
                                </button>
                            </div>
                        </section>

                        {/* Documents Section */}
                        <section className="glass-card p-8 rounded-[2rem] border border-white/10 space-y-6 flex flex-col justify-between group hover:border-purple-500/30 transition-all duration-500">
                            <div className="space-y-4">
                                <div className="w-12 h-12 glass-dark rounded-2xl flex items-center justify-center text-purple-400 border border-white/5">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Legal & Compliance</h3>
                                    <p className="text-gray-500 text-sm font-medium mt-1">Institutional agreements and privacy protocols.</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => window.open("/docs/privacy-policy.pdf", "_blank")}
                                    className="w-full group/btn flex items-center justify-between p-4 glass hover:bg-white/5 rounded-2xl border border-white/5 transition-all text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                >
                                    <div className="flex items-center gap-3">
                                        <Shield size={18} className="text-indigo-400" />
                                        <span className="font-bold text-sm tracking-tight">Privacy Policy</span>
                                    </div>
                                    <ExternalLink size={16} className="text-gray-400 dark:text-gray-600 group-hover/btn:text-indigo-400 transition-colors" />
                                </button>
                                <button
                                    onClick={() => window.open("/docs/terms-and-conditions.pdf", "_blank")}
                                    className="w-full group/btn flex items-center justify-between p-4 glass hover:bg-white/5 rounded-2xl border border-white/5 transition-all text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                >
                                    <div className="flex items-center gap-3">
                                        <Info size={18} className="text-purple-400" />
                                        <span className="font-bold text-sm tracking-tight">Terms and Conditions</span>
                                    </div>
                                    <ExternalLink size={16} className="text-gray-400 dark:text-gray-600 group-hover/btn:text-purple-400 transition-colors" />
                                </button>
                            </div>
                        </section>
                    </div>

                    <footer className="pt-8 border-t border-white/5 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-4 px-6 py-2 glass rounded-full border border-blue-500/10">
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">FIWB Engine Core v4.0.2</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.4em]">Neural Link Stable</span>
                        </div>
                    </footer>
                </div >
            </main >
        </div >
    );
}
