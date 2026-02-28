"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, GraduationCap, Users, LogOut, Zap, ChevronDown, Settings, TrendingUp, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";

export default function TopNav() {
    const pathname = usePathname();
    const [user, setUser] = useState({
        email: "",
        name: "",
        picture: ""
    });
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const email = localStorage.getItem("user_email") || "";
            setUser({
                email: email,
                name: localStorage.getItem("user_name") || "",
                picture: localStorage.getItem("user_picture") || ""
            });
        }
    }, []);



    const handleSignOut = () => {
        localStorage.removeItem("user_email");
        localStorage.removeItem("user_id");
        localStorage.removeItem("user_name");
        localStorage.removeItem("user_picture");
        window.location.href = "/";
    };

    const navLinks = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Chatbot", href: "/chat", icon: MessageSquare },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 z-[100] transition-colors duration-500">
            <div className="max-w-[1600px] mx-auto h-full px-6 flex items-center justify-between">
                <div className="flex items-center gap-12">
                    {/* Logo */}
                    <Link href="/dashboard" className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-white/10 group-hover:scale-105 transition-transform bg-[#060606]">
                            <img src="/fiwb-logo.svg" alt="FIWB" className="w-full h-full object-cover" />
                        </div>
                        <span className="text-xl font-black tracking-tighter text-gray-900 dark:text-white transition-colors leading-none">
                            FIWB <span className="text-blue-500">AI</span>
                        </span>
                    </Link>

                    {/* Nav Links */}
                    <div className="flex items-center gap-1">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            const Icon = link.icon;
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className={clsx(
                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer",
                                        isActive
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5"
                                    )}
                                >
                                    <Icon size={16} />
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-6">

                    <div className="relative">
                        <button
                            onClick={() => {
                                setIsDropdownOpen(!isDropdownOpen);
                            }}
                            className="flex items-center gap-3 pl-2 pr-1 py-1 rounded-2xl hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-left cursor-pointer"
                        >
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                                    {user.name || "Academic Subject"}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                    Student Portfolio
                                </span>
                            </div>
                            <div className="relative">
                                {user.picture ? (
                                    <img src={user.picture} alt="Profile" className="w-9 h-9 rounded-full border border-gray-200 dark:border-white/10 object-cover" />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white border border-white/10 shadow-lg">
                                        {user.email?.[0]?.toUpperCase() || "U"}
                                    </div>
                                )}
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-black rounded-full" />
                            </div>
                            <ChevronDown size={14} className={clsx("text-gray-400 mr-2 transition-transform", isDropdownOpen && "rotate-180")} />
                        </button>

                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-3 w-64 bg-white dark:bg-[#0a0a0a] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl p-2 z-[110]"
                                >
                                    <Link href="/settings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer">
                                        <Settings size={18} />
                                        <span className="text-sm font-bold">Settings</span>
                                    </Link>
                                    {user.email === "owaissayyed2007@gmail.com" && (
                                        <Link href="/admin" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer">
                                            <TrendingUp size={18} />
                                            <span className="text-sm font-bold">Operational Insights</span>
                                        </Link>
                                    )}
                                    <div className="h-px bg-gray-100 dark:bg-white/5 my-2 mx-2" />
                                    <button
                                        onClick={handleSignOut}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/5 transition-all text-red-500 hover:text-red-600 cursor-pointer"
                                    >
                                        <LogOut size={18} />
                                        <span className="text-sm font-bold">De-authorize Session</span>
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </nav>
    );
}
