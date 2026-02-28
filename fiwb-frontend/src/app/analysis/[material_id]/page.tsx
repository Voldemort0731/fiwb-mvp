"use client";
import { useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

export default function AnalysisRedirect() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const material_id = params?.material_id;
        const thread_id = searchParams?.get('thread_id');

        if (material_id) {
            router.replace(`/chat?material_id=${material_id}${thread_id ? `&thread_id=${thread_id}` : ''}`);
        } else {
            router.replace('/chat');
        }
    }, [params, searchParams, router]);

    return (
        <div className="h-screen bg-[#050505] flex items-center justify-center text-blue-500 font-bold uppercase tracking-widest text-[10px]">
            Redirecting to Neural Workspace...
        </div>
    );
}
