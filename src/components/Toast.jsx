import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cx } from './UI';

const CFG = {
  success: { icon: CheckCircle2, cls: 'text-emerald-500' },
  info: { icon: Info, cls: 'text-sky-500' },
  warning: { icon: AlertTriangle, cls: 'text-amber-500' },
};

export default function ToastHost() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(90vw,360px)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const c = CFG[t.type] || CFG.success;
          const Icon = c.icon;
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              onClick={() => dismissToast(t.id)}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left shadow-card"
            >
              <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', c.cls)} />
              <span className="text-sm font-semibold text-ink">{t.message}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}