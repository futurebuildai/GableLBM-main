import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ToastContext, type Toast, type ToastType } from './ToastContext';

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        const map = timerMapRef.current;
        return () => {
            map.forEach(t => clearTimeout(t));
            map.clear();
        };
    }, []);

    const removeToast = useCallback((id: string) => {
        const timerId = timerMapRef.current.get(id);
        if (timerId) {
            clearTimeout(timerId);
            timerMapRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        const timerId = setTimeout(() => {
            removeToast(id);
            timerMapRef.current.delete(id);
        }, 5000);
        timerMapRef.current.set(id, timerId);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
    const icons = {
        success: <CheckCircle className="w-5 h-5 text-gable-green" />,
        error: <AlertCircle className="w-5 h-5 text-rose-500" />,
        info: <Info className="w-5 h-5 text-blue-400" />
    };

    const styles = {
        success: 'border-gable-green/20 bg-gable-green/10',
        error: 'border-rose-500/20 bg-rose-500/10',
        info: 'border-blue-500/20 bg-blue-500/10'
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={cn(
                "min-w-[300px] p-4 rounded-lg border backdrop-blur-md shadow-2xl flex items-start gap-3",
                "bg-[#161821]/90", // Base background
                styles[toast.type]
            )}
        >
            <div className="mt-0.5 shrink-0">{icons[toast.type]}</div>
            <div className="flex-1 text-sm font-medium text-white">{toast.message}</div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
            </button>
        </motion.div>
    );
};
