export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://passionate-patience-production-a232.up.railway.app';

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '46647341779-d5dtuag91cnfdnj44q6p8qq62toi8sod.apps.googleusercontent.com';
export const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';

export const standardize_email = (email: string | null): string => {
    if (!email) return "";
    const lowerEmail = email.toLowerCase().trim();
    if (lowerEmail === "sidwagh724@gmail.com") return "siddhantwagh724@gmail.com";
    return lowerEmail;
};
