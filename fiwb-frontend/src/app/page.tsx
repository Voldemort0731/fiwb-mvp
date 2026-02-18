"use client";
import { useGoogleLogin } from "@react-oauth/google";
import { useRouter } from "next/navigation";
import { Zap, ShieldCheck, Cpu, BookOpen } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { API_URL } from "@/utils/config";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: async (codeResponse) => {
      setLoading(true);
      setError("");
      try {
        const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: codeResponse.code,
          }),
        });

        if (!loginResponse.ok) {
          const errorData = await loginResponse.json();
          throw new Error(errorData.detail || "Login failed");
        }

        const data = await loginResponse.json();

        localStorage.setItem("user_id", data.user_id);
        localStorage.setItem("user_email", data.email);
        localStorage.setItem("user_name", data.name);
        localStorage.setItem("user_picture", data.picture);

        // Prefetch for instant transition
        router.prefetch("/dashboard");
        router.push("/dashboard");
      } catch (err) {
        console.error("Login error:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to initialize: ${errorMessage}. Check if NEXT_PUBLIC_API_URL is set correctly in Vercel.`);
        setLoading(false);
      } finally {
        // No-op
      }
    },
    onError: (error) => {
      console.error("Google login error:", error);
      setError("Google login failed. Please try again.");
      setLoading(false);
    },
    scope: "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/classroom.student-submissions.me.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#050505] text-gray-900 dark:text-white p-6 relative overflow-hidden bg-dot-pattern transition-colors duration-500">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 dark:bg-blue-600/20 rounded-full blur-[160px] animate-pulse-soft" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/5 dark:bg-purple-600/10 rounded-full blur-[160px] animate-pulse-soft" />

      <div className="max-w-xl w-full text-center space-y-12 relative z-10">
        {/* Brand Mark */}
        <div className="mx-auto flex flex-col items-center">
          <div className="w-32 h-32 rounded-[2rem] shadow-2xl overflow-hidden animate-float mb-8 group border border-gray-200 dark:border-white/10 relative">
            <div className="absolute inset-0 bg-blue-600/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <img src="/fiwb-logo.svg" alt="FIWB" className="w-full h-full object-cover relative z-10" />
          </div>

          <div className="space-y-4">
            <h1 className="text-7xl font-black tracking-tighter text-gray-900 dark:text-white leading-tight">
              FIWB <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">AI</span>
            </h1>
            <p className="text-xl text-gray-500 font-medium tracking-tight">
              Your Professional Digital Academic Twin.
            </p>
          </div>
        </div>

        {/* Features Preview */}
        <div className="grid grid-cols-3 gap-4 py-8 border-y border-gray-100 dark:border-white/5">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 glass-dark rounded-xl flex items-center justify-center text-blue-500 dark:text-blue-400 border border-gray-200 dark:border-white/10">
              <ShieldCheck size={20} />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">Secure Sync</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 glass-dark rounded-xl flex items-center justify-center text-purple-500 dark:text-purple-400 border border-gray-200 dark:border-white/10">
              <Cpu size={20} />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">Neural Engine</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 glass-dark rounded-xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 border border-gray-200 dark:border-white/10">
              <BookOpen size={20} />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">LMS Native</span>
          </div>
        </div>

        <div className="space-y-6 pt-4">
          <button
            onClick={() => login()}
            disabled={loading}
            className="w-full group relative overflow-hidden px-8 py-5 bg-blue-600 dark:bg-white text-white dark:text-black font-bold rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-blue-500/10"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-center gap-4 relative z-10">
              {loading ? (
                <div className="w-6 h-6 border-3 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              <span className="text-lg">{loading ? "Initializing..." : "Get Started with Google"}</span>
            </div>
          </button>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass border-red-500/20 rounded-2xl p-4"
            >
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </motion.div>
          )}

          <p className="text-gray-400 dark:text-gray-600 text-[10px] uppercase tracking-[0.3em] font-bold transition-colors">
            Authorized for institutional educational use only
          </p>
        </div>
      </div>
    </div>
  );
}
