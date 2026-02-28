"use client";
import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { Book, Clock, ChevronRight, FileText, Youtube, Link as LinkIcon, CheckCircle2, Search, ArrowLeft, User, X, Calendar, Layers, ExternalLink, File, FileSpreadsheet, Image, Download, Eye, FileCode, Paperclip, Sparkles } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { API_URL } from "@/utils/config";

type TabType = "stream" | "classwork" | "materials";

const getAttachmentIcon = (fileType: string) => {
    switch (fileType) {
        case "pdf": return FileText;
        case "image": return Image;
        case "document": return FileText;
        case "spreadsheet": return FileSpreadsheet;
        case "presentation": return FileCode;
        case "youtube": return Youtube;
        case "web": return LinkIcon;
        case "google_form": return FileSpreadsheet;
        default: return File;
    }
};

const getAttachmentColor = (fileType: string) => {
    switch (fileType) {
        case "pdf": return "red";
        case "image": return "purple";
        case "document": return "blue";
        case "spreadsheet": return "green";
        case "presentation": return "orange";
        case "youtube": return "red";
        case "web": return "purple";
        case "google_form": return "green";
        default: return "gray";
    }
};

const getFileTypeBadge = (fileType: string) => {
    const badges: Record<string, string> = {
        pdf: "PDF",
        image: "Image",
        document: "Doc",
        spreadsheet: "Sheet",
        presentation: "Slides",
        youtube: "Video",
        web: "Link",
        google_form: "Form",
        file: "File"
    };
    return badges[fileType] || "File";
};

export default function CoursePage() {
    const params = useParams();
    const router = useRouter();
    const courseId = params.course_id as string;
    const [course, setCourse] = useState<any>(null);
    const [content, setContent] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState<TabType>("stream");
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        const email = localStorage.getItem("user_email");
        if (!email) {
            window.location.href = "/";
            return;
        }

        const fetchCourseData = async () => {
            try {
                const courseRes = await fetch(`${API_URL}/api/courses/${courseId}?user_email=${email}`);
                if (!courseRes.ok) throw new Error(`Course fetch failed: ${courseRes.status}`);
                const courseData = await courseRes.json();
                setCourse(courseData);

                const materialsRes = await fetch(`${API_URL}/api/courses/${courseId}/materials?user_email=${email}`);
                if (!materialsRes.ok) throw new Error(`Materials fetch failed: ${materialsRes.status}`);
                const materialsData = await materialsRes.json();

                const mappedContent = (Array.isArray(materialsData) ? materialsData : []).map((item: any) => ({
                    ...item,
                    icon: item.category === 'assignment' ? CheckCircle2 :
                        item.category === 'announcement' ? Book :
                            item.category === 'video' ? Youtube :
                                item.category === 'link' ? LinkIcon : FileText
                }));

                setContent(mappedContent);
                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch course data", err);
                // Handle error state if we had one here, for now just stop loading
                setLoading(false);
            }
        };

        fetchCourseData();
    }, [courseId]);

    const filteredContent = content
        .filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter(item => {
            if (activeTab === "stream") return true;
            if (activeTab === "classwork") return item.type === "assignment" || item.type === "material";
            // Resources: Everything that isn't a direct assignment. 
            // This includes Classroom Materials, Drive files, and Announcements (if they have attachments)
            if (activeTab === "materials") {
                if (item.type === "assignment") return false;
                if (item.type === "announcement") return (item.attachments?.length > 0);
                return true;
            }
            return true;
        });

    // Special logic for Feed tab: Do NOT group, just keep as a flat list
    const isStream = activeTab === "stream";

    const groupedContent = isStream ? { Feed: filteredContent } : filteredContent.reduce((acc, item) => {
        const type = item.type || "other";
        if (!acc[type]) acc[type] = [];
        acc[type].push(item);
        return acc;
    }, {} as Record<string, any[]>);

    const typeLabels: Record<string, string> = {
        assignment: "Assignments",
        announcement: "Announcements",
        material: "Course Materials",
        drive_file: "Drive Files",
        other: "Other"
    };

    const handlePreview = (attachment: any) => {
        if (attachment.file_type === 'pdf' && attachment.file_id) {
            setPreviewUrl(`https://drive.google.com/file/d/${attachment.file_id}/preview`);
        } else if (attachment.file_type === 'image' && attachment.url) {
            setPreviewUrl(attachment.url);
        } else {
            window.open(attachment.url, '_blank');
        }
    };

    return (
        <div className="flex h-screen bg-white dark:bg-[#050505] text-gray-900 dark:text-white font-sans selection:bg-blue-500/30 overflow-hidden transition-colors duration-500">
            <Sidebar />
            <main className="flex-1 flex flex-col relative scrollbar-premium bg-dot-pattern">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

                <header className="px-10 py-12 relative z-10 border-b border-gray-100 dark:border-white/5 bg-white/50 dark:bg-black/40 backdrop-blur-xl transition-colors">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-6 text-sm font-black uppercase tracking-widest group cursor-pointer">
                        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Back to Dashboard
                    </Link>

                    <div className="flex justify-between items-end mb-8">
                        <div className="space-y-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-500/20 rounded-full">
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Course Explorer</span>
                            </div>
                            <h1 className="text-5xl font-black tracking-tight text-gray-900 dark:text-white leading-tight">
                                {course?.name || "Loading Course..."}
                            </h1>
                            <div className="flex items-center gap-6 text-gray-900 dark:text-gray-400 font-black transition-colors">
                                <div className="flex items-center gap-2">
                                    <User size={16} className="text-blue-600 dark:text-blue-500" />
                                    <span>{course?.professor || "Unknown Professor"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                                    <CheckCircle2 size={16} />
                                    <span className="text-xs font-black uppercase tracking-wider">Synced & Indexed</span>
                                </div>
                            </div>
                        </div>

                        <div className="relative w-80 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search course materials..."
                                className="w-full pl-12 pr-4 py-3.5 glass-dark border border-white/10 rounded-2xl focus:outline-none focus:border-blue-500/50 transition-all font-medium placeholder:text-gray-600"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {[
                            { id: 'stream', label: 'Feed' },
                            { id: 'classwork', label: 'Classwork' },
                            { id: 'materials', label: 'Resources' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabType)}
                                className={clsx(
                                    "px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all cursor-pointer",
                                    activeTab === tab.id
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                        : "bg-gray-100 dark:bg-black/40 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/5"
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-10 space-y-12 relative z-10 scrollbar-premium">
                    {loading ? (
                        <div className="grid grid-cols-1 gap-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-24 glass-card rounded-2xl animate-pulse border border-white/5" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {Object.entries(groupedContent).map(([type, items]) => (
                                <section key={type}>
                                    <div className="flex items-center gap-4 mb-6">
                                        <Layers size={20} className="text-blue-600 dark:text-blue-500" />
                                        <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">{typeLabels[type] || type}</h2>
                                        <div className="h-[1px] flex-1 bg-gray-100 dark:bg-white/5"></div>
                                        <span className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-[0.3em]">{(items as any[]).length} Items</span>
                                    </div>

                                    <div className="grid grid-cols-1 gap-6">
                                        {(items as any[]).map((item: any, i: number) => {
                                            const Icon = item.icon;
                                            const attachmentCount = item.attachments?.length || 0;

                                            // IF WE ARE IN FEED TAB, SHOW FULL CARD (Classroom Style)
                                            if (isStream) {
                                                return (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        key={item.id}
                                                        onClick={() => setSelectedItem(item)}
                                                        className="glass-card rounded-[2rem] border border-white/5 overflow-hidden hover:border-blue-500/20 transition-all shadow-2xl shadow-black/20 cursor-pointer group"
                                                    >
                                                        <div className="p-8">
                                                            {/* Card Header */}
                                                            <div className="flex items-center justify-between mb-8">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-12 h-12 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                                                                        <span className="text-xl font-black text-blue-500">{(item.professor || course?.professor || "P").charAt(0)}</span>
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-black text-gray-900 dark:text-white leading-none mb-1">
                                                                            {item.professor || course?.professor || "Unknown"}
                                                                        </h4>
                                                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                                            <Clock size={10} />
                                                                            {item.date}
                                                                            <span className="text-blue-500">•</span>
                                                                            {item.type}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => window.open(item.source_link, '_blank')}
                                                                    className="w-10 h-10 glass-dark rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
                                                                >
                                                                    <ExternalLink size={16} className="text-gray-400" />
                                                                </button>
                                                            </div>

                                                            {/* Card Content */}
                                                            <div className="space-y-6">
                                                                {item.type !== 'announcement' && (
                                                                    <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                                                                        {item.title}
                                                                    </h3>
                                                                )}
                                                                {item.type !== 'drive_file' ? (
                                                                    <div className="text-gray-800 dark:text-gray-300 font-medium leading-[1.8] whitespace-pre-wrap text-base">
                                                                        {item.content || item.description || "No description provided."}
                                                                    </div>
                                                                ) : (
                                                                    <div className="p-4 glass-dark rounded-2xl border border-white/5 flex items-center gap-4">
                                                                        <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
                                                                            <File size={20} className="text-blue-500" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Drive Resource</p>
                                                                            <p className="text-sm font-bold text-white">Full contents available for AI analysis and details view.</p>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Inline Attachments Grid */}
                                                                {attachmentCount > 0 && (
                                                                    <div className="pt-6 border-t border-white/5">
                                                                        <div className="flex items-center gap-2 mb-4">
                                                                            <Paperclip size={14} className="text-blue-500" />
                                                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                                                Attachments ({attachmentCount})
                                                                            </span>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                            {(item.attachments || []).map((att: any, idx: number) => {
                                                                                const AttachIcon = getAttachmentIcon(att.file_type || att.type);
                                                                                return (
                                                                                    <button
                                                                                        key={idx}
                                                                                        onClick={(e) => { e.stopPropagation(); handlePreview(att); }}
                                                                                        className="flex items-center gap-4 p-3 glass-dark hover:bg-white/10 border border-white/5 rounded-2xl transition-all text-left group/att cursor-pointer"
                                                                                    >
                                                                                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center shrink-0 border border-white/5 group-hover/att:border-blue-500/30 transition-colors">
                                                                                            <AttachIcon size={20} className="text-blue-400" />
                                                                                        </div>
                                                                                        <div className="min-w-0 flex-1">
                                                                                            <p className="text-xs font-black text-white truncate">{att.title}</p>
                                                                                            <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                                                                                {getFileTypeBadge(att.file_type || att.type)}
                                                                                            </p>
                                                                                        </div>
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Card Actions */}
                                                                <div className="flex items-center gap-3 pt-4">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            router.push(`/analysis/${item.id}`);
                                                                        }}
                                                                        className="px-6 py-3 glass-dark hover:bg-blue-600/10 border border-white/5 hover:border-blue-500/20 rounded-2xl text-xs font-black uppercase tracking-widest text-blue-400 transition-all flex items-center gap-2 cursor-pointer"
                                                                    >
                                                                        <Sparkles size={14} />
                                                                        Analyze with AI
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                                                                        className="px-6 py-3 glass-dark hover:bg-white/5 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 transition-all cursor-pointer"
                                                                    >
                                                                        Details
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            }

                                            // IF WE ARE IN CLASSWORK/RESOURCES, USE COMPACT LIST (Legacy Style)
                                            return (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.05 }}
                                                    key={item.id}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="group flex items-center gap-6 p-6 glass-card rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer hover:shadow-2xl hover:shadow-blue-500/5"
                                                >
                                                    <div className="w-14 h-14 bg-gray-50 dark:bg-black/40 rounded-xl flex items-center justify-center border border-gray-200 dark:border-white/10 group-hover:bg-blue-600/10 transition-colors">
                                                        <Icon className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" size={24} />
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={clsx(
                                                                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                                                item.type === 'assignment' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
                                                            )}>
                                                                {item.type}
                                                            </span>
                                                            {item.type === 'assignment' && item.due_date && (
                                                                <>
                                                                    <span className="text-xs text-gray-600 font-bold">•</span>
                                                                    <div className="flex items-center gap-1 text-xs text-amber-500 font-bold">
                                                                        <Calendar size={12} />
                                                                        <span>Due: {item.due_date}</span>
                                                                    </div>
                                                                </>
                                                            )}

                                                            <span className="text-xs text-gray-600 font-bold">•</span>
                                                            <span className="text-xs text-gray-900 dark:text-gray-600 font-black tracking-widest uppercase tracking-higher">{item.date}</span>
                                                        </div>
                                                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                                                            {item.title}
                                                        </h3>
                                                    </div>

                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                router.push(`/analysis/${item.id}`);
                                                            }}
                                                            className="px-4 py-2 glass-dark hover:bg-blue-600/10 border border-white/5 hover:border-blue-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-400 transition-all flex items-center gap-2 opacity-0 group-hover:opacity-100 cursor-pointer"
                                                        >
                                                            <Sparkles size={12} />
                                                            Analyze
                                                        </button>
                                                        <div className="w-10 h-10 rounded-full border border-white/5 flex items-center justify-center group-hover:border-blue-500/30 transition-colors">
                                                            <ChevronRight size={18} className="text-gray-600 group-hover:text-blue-400 transition-transform group-hover:translate-x-0.5" />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail Modal */}
                <AnimatePresence>
                    {selectedItem && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8"
                            onClick={() => setSelectedItem(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                                className="glass-card border border-white/10 rounded-3xl p-8 max-w-4xl w-full max-h-[85vh] overflow-y-auto scrollbar-premium"
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 glass-dark rounded-xl flex items-center justify-center border border-white/10">
                                            {selectedItem.icon && <selectedItem.icon className="text-blue-400" size={24} />}
                                        </div>
                                        <div>
                                            <span className={clsx(
                                                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded inline-block mb-2",
                                                selectedItem.type === 'assignment' ? "bg-amber-500/10 text-amber-500" : "bg-blue-500/10 text-blue-500"
                                            )}>
                                                {selectedItem.type}
                                            </span>
                                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedItem.title}</h2>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedItem(null)}
                                        className="w-10 h-10 glass-dark rounded-xl flex items-center justify-center hover:bg-red-500/20 transition-colors"
                                    >
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 text-sm text-gray-400">
                                        <div className="flex items-center gap-2">
                                            <Clock size={16} className="text-blue-500" />
                                            <span>{selectedItem.date}</span>
                                        </div>
                                        {selectedItem.due_date && (
                                            <div className="flex items-center gap-2 text-amber-500">
                                                <Calendar size={16} />
                                                <span>Due: {selectedItem.due_date}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-gray-50 dark:bg-black/40 p-6 rounded-2xl border border-gray-100 dark:border-white/5">
                                        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-500 mb-3">Content</h3>
                                        <p className="text-gray-800 dark:text-gray-300 font-medium leading-relaxed whitespace-pre-wrap">
                                            {selectedItem.content || selectedItem.description || "No additional details available for this item."}
                                        </p>
                                    </div>

                                    {/* Documents Section */}
                                    {(selectedItem.attachments && selectedItem.attachments.length > 0) && (
                                        <div className="bg-gray-50 dark:bg-black/40 p-6 rounded-2xl border border-gray-100 dark:border-white/5">
                                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-500 mb-4">
                                                📎 Documents & Files
                                            </h3>
                                            <div className="grid grid-cols-1 gap-4">
                                                {selectedItem.attachments.map((attachment: any, idx: number) => {
                                                    const AttachIcon = getAttachmentIcon(attachment.file_type || attachment.type);
                                                    const color = getAttachmentColor(attachment.file_type || attachment.type);
                                                    const badge = getFileTypeBadge(attachment.file_type || attachment.type);

                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="group glass hover:bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-all overflow-hidden"
                                                        >
                                                            <div className="flex items-center gap-4 p-4">
                                                                <div className="relative">
                                                                    {attachment.thumbnail ? (
                                                                        <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                                                                            <img
                                                                                src={attachment.thumbnail}
                                                                                alt={attachment.title}
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <div className={clsx(
                                                                            "w-20 h-20 rounded-lg flex items-center justify-center border border-white/10",
                                                                            color === "blue" && "bg-blue-500/10",
                                                                            color === "red" && "bg-red-500/10",
                                                                            color === "purple" && "bg-purple-500/10",
                                                                            color === "green" && "bg-green-500/10",
                                                                            color === "orange" && "bg-orange-500/10"
                                                                        )}>
                                                                            <AttachIcon className={clsx(
                                                                                "transition-colors",
                                                                                color === "blue" && "text-blue-400",
                                                                                color === "red" && "text-red-400",
                                                                                color === "purple" && "text-purple-400",
                                                                                color === "green" && "text-green-400",
                                                                                color === "orange" && "text-orange-400"
                                                                            )} size={32} />
                                                                        </div>
                                                                    )}
                                                                    <span className={clsx(
                                                                        "absolute -top-2 -right-2 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider",
                                                                        color === "blue" && "bg-blue-500 text-white",
                                                                        color === "red" && "bg-red-500 text-white",
                                                                        color === "purple" && "bg-purple-500 text-white",
                                                                        color === "green" && "bg-green-500 text-white",
                                                                        color === "orange" && "bg-orange-500 text-white"
                                                                    )}>
                                                                        {badge}
                                                                    </span>
                                                                </div>

                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate mb-1">
                                                                        {attachment.title}
                                                                    </p>
                                                                    <p className="text-xs text-gray-600 dark:text-gray-500 uppercase tracking-wider font-bold">
                                                                        {attachment.mime_type || attachment.file_type || attachment.type}
                                                                    </p>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    {(attachment.file_type === 'pdf' || attachment.file_type === 'image') && (
                                                                        <button
                                                                            onClick={() => handlePreview(attachment)}
                                                                            className="p-2 glass-dark hover:bg-blue-500/20 rounded-lg transition-colors group/btn cursor-pointer"
                                                                            title="Preview"
                                                                        >
                                                                            <Eye size={16} className="text-gray-400 group-hover/btn:text-blue-400" />
                                                                        </button>
                                                                    )}
                                                                    <a
                                                                        href={attachment.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="p-2 glass-dark hover:bg-green-500/20 rounded-lg transition-colors group/btn cursor-pointer"
                                                                        title="Open"
                                                                    >
                                                                        <ExternalLink size={16} className="text-gray-400 group-hover/btn:text-green-400" />
                                                                    </a>

                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => selectedItem.source_link && window.open(selectedItem.source_link, '_blank')}
                                            disabled={!selectedItem.source_link}
                                            className={clsx(
                                                "flex-1 px-6 py-3 font-bold rounded-xl transition-colors cursor-pointer",
                                                selectedItem.source_link
                                                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                                                    : "bg-gray-800 text-gray-500 cursor-not-allowed"
                                            )}
                                        >
                                            Open in Classroom
                                        </button>
                                        <button
                                            onClick={() => router.push(`/chat?material_id=${selectedItem.id}`)}
                                            className="px-6 py-3 glass-dark hover:bg-white/5 text-gray-400 hover:text-white font-bold rounded-xl transition-all border border-white/5 cursor-pointer"
                                        >
                                            Ask AI About This
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Preview Modal */}
                <AnimatePresence>
                    {previewUrl && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[60] flex items-center justify-center p-8"
                            onClick={() => setPreviewUrl(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.9 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0.9 }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full h-full max-w-6xl max-h-[90vh] bg-white rounded-2xl overflow-hidden relative"
                            >
                                <button
                                    onClick={() => setPreviewUrl(null)}
                                    className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
                                >
                                    <X size={20} className="text-white" />
                                </button>
                                <iframe
                                    src={previewUrl}
                                    className="w-full h-full"
                                    title="Document Preview"
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div >
    );
}
