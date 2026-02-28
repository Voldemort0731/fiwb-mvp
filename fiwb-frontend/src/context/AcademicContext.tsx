"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_URL, standardize_email } from '@/utils/config';

interface AcademicContextType {
    courses: any[];
    loading: boolean;
    syncing: boolean;
    error: string | null;
    refreshData: () => Promise<void>;
    startSync: () => Promise<void>;
}

const AcademicContext = createContext<AcademicContextType | undefined>(undefined);

export function AcademicProvider({ children }: { children: React.ReactNode }) {
    const [courses, setCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Use a ref to prevent the infinite re-render loop caused by courses.length in deps
    const isFetchingRef = useRef(false);

    const refreshData = useCallback(async () => {
        // Prevent concurrent fetches
        if (isFetchingRef.current) return;

        const rawEmail = typeof window !== 'undefined' ? localStorage.getItem("user_email") : null;
        if (!rawEmail) {
            setLoading(false);
            return;
        }

        isFetchingRef.current = true;
        const email = standardize_email(rawEmail);

        const fetchCourses = async () => {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 10000);
                const res = await fetch(`${API_URL}/api/courses/?user_email=${email}`, { signal: controller.signal });
                clearTimeout(tid);
                if (res.ok) {
                    const data = await res.json();
                    setCourses(data);
                    setError(null);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error("Failed to fetch courses", err);
                }
            } finally {
                setLoading(false);
            }
        };



        await fetchCourses();
        isFetchingRef.current = false;
        // FIXED: removed courses.length from deps — it caused infinite re-fetch loop
    }, []);

    const startSync = useCallback(async () => {
        const rawEmail = localStorage.getItem("user_email");
        if (!rawEmail) return;
        const email = standardize_email(rawEmail);

        setSyncing(true);
        try {
            await fetch(`${API_URL}/api/admin/sync/${email}`, { method: "POST" });
            setTimeout(refreshData, 3000);
            setTimeout(refreshData, 8000);
            setTimeout(() => setSyncing(false), 5000);
        } catch (e) {
            console.error("Sync trigger failed", e);
            setSyncing(false);
        }
    }, [refreshData]);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 5 * 60 * 1000);
        const handleDriveRefresh = () => refreshData();
        window.addEventListener('drive-sync-refresh', handleDriveRefresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('drive-sync-refresh', handleDriveRefresh);
        };
        // FIXED: stable ref, runs once on mount
    }, []);

    return (
        <AcademicContext.Provider value={{ courses, loading, syncing, error, refreshData, startSync }}>
            {children}
        </AcademicContext.Provider>
    );
}

export function useAcademic() {
    const context = useContext(AcademicContext);
    if (context === undefined) throw new Error('useAcademic must be used within an AcademicProvider');
    return context;
}
