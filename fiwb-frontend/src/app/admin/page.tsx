"use client";
import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, DollarSign, Database, TrendingUp, ShieldAlert, BarChart3, RefreshCcw } from "lucide-react";
import { API_URL } from "@/utils/config";

export default function AdminDashboard() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchStats = () => {
        setLoading(true);
        const email = localStorage.getItem("user_email") || "";
        fetch(`${API_URL}/api/admin/users?admin_email=${email}`)
            .then(res => res.json())
            .then(data => {
                setUsers(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch admin stats", err);
                setLoading(false);
            });
    };

    const OWNER_EMAIL = "owaissayyed2007@gmail.com";

    useEffect(() => {
        const userEmail = localStorage.getItem("user_email");
        if (userEmail !== OWNER_EMAIL) {
            window.location.href = "/dashboard";
            return;
        }
        fetchStats();
    }, []);

    const totalCost = users.reduce((acc, u) => acc + parseFloat(u.estimated_cost_usd || "0"), 0);
    const totalTokens = users.reduce((acc, u) => acc + (u.openai_tokens_used || 0), 0);
    const totalDocs = users.reduce((acc, u) => acc + (u.supermemory_docs_indexed || 0), 0);

    return (
        <div className="flex h-screen bg-white dark:bg-[#050505] text-gray-900 dark:text-white font-sans overflow-hidden transition-colors duration-500">
            <Sidebar />
            <main className="flex-1 p-12 overflow-y-auto relative scrollbar-premium bg-dot-pattern">
                {/* Header */}
                <header className="flex justify-between items-center mb-16 relative z-10">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight mb-2 text-gray-900 dark:text-white">Operational <span className="text-blue-600 dark:text-blue-500">Analytics</span></h1>
                        <p className="text-gray-600 dark:text-gray-500 font-medium">Monitoring real-time API costs and system utilization.</p>
                    </div>
                    <button
                        onClick={fetchStats}
                        className="p-3 glass hover:bg-white/10 rounded-xl transition-all border border-white/10"
                    >
                        <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </header>

                {/* Stat Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 relative z-10">
                    {[
                        { label: "Total Platform Cost", value: `$${totalCost.toFixed(4)}`, icon: DollarSign, color: "text-green-400" },
                        { label: "Active Nodes", value: users.length, icon: Users, color: "text-blue-400" },
                        { label: "Neural Tokens", value: (totalTokens / 1000).toFixed(1) + "k", icon: BarChart3, color: "text-purple-400" },
                        { label: "Indexed Records", value: totalDocs, icon: Database, color: "text-orange-400" },
                    ].map((stat, i) => (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            key={i}
                            className="glass-card p-6 rounded-3xl border border-gray-200 dark:border-white/5 bg-white dark:bg-black/10"
                        >
                            <stat.icon className={stat.color + " mb-4"} size={24} />
                            <p className="text-[10px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                            <h3 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{stat.value}</h3>
                        </motion.div>
                    ))}
                </div>

                {/* User Breakdown */}
                <div className="glass-card rounded-[2.5rem] border border-gray-200 dark:border-white/5 overflow-hidden relative z-10 bg-white dark:bg-black/10">
                    <div className="p-8 border-b border-gray-200 dark:border-white/5 flex justify-between items-center">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Consumption Breakdown</h3>
                        <ShieldAlert className="text-gray-400 dark:text-gray-700" size={20} />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest font-black text-gray-600 dark:text-gray-500 border-b border-gray-200 dark:border-white/5">
                                    <th className="px-8 py-5">Intellectual Identity</th>
                                    <th className="px-8 py-5">Neural Archive (Titles)</th>
                                    <th className="px-8 py-5 text-center">Neural Tokens</th>
                                    <th className="px-8 py-5 text-center">SM Index/Req</th>
                                    <th className="px-8 py-5 text-center">LMS Requests</th>
                                    <th className="px-8 py-5 text-right">Burn Rate (USD)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                {users.map((user, i) => (
                                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-black text-blue-500">
                                                    {user.email[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900 dark:text-white">{user.email}</p>
                                                    <p className="text-[10px] text-gray-600 dark:text-gray-500 uppercase font-bold tracking-wider">Joined {new Date(user.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="max-h-24 w-64 overflow-y-auto scrollbar-hide flex flex-wrap gap-1">
                                                {user.document_titles?.length > 0 ? (
                                                    user.document_titles.slice(0, 100).map((title: string, idx: number) => (
                                                        <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                                                            {title}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-[9px] italic text-gray-400">No documents indexed yet.</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-center font-mono text-xs text-purple-400">
                                            {BigInt(user.openai_tokens_used || 0).toLocaleString()}
                                        </td>
                                        <td className="px-8 py-6 text-center font-mono text-xs text-orange-400">
                                            <span className="text-orange-600 dark:text-orange-400">{user.supermemory_docs_indexed || 0}</span>
                                            <span className="text-gray-300 dark:text-gray-600 mx-1">/</span>
                                            <span className="text-gray-600 dark:text-gray-400">{user.supermemory_requests_count || 0}</span>
                                        </td>
                                        <td className="px-8 py-6 text-center font-mono text-xs text-blue-400">
                                            {user.lms_api_requests_count || 0}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <span className="font-black text-green-400 font-mono text-lg">
                                                ${parseFloat(user.estimated_cost_usd || "0").toFixed(4)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-[10px] text-gray-500 dark:text-gray-600 font-bold uppercase tracking-[0.2em]">
                        Estimations based on GPT-4o-mini pricing models ($0.15/$0.60 per 1M)
                    </p>
                </div>
            </main>
        </div>
    );
}
