import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background active:scale-95",
    {
        variants: {
            variant: {
                default: "bg-gable-green text-deep-space hover:shadow-glow hover:-translate-y-0.5 font-bold tracking-wide",
                destructive: "bg-deep-space border border-safety-red text-safety-red hover:bg-safety-red/10 hover:shadow-[0_0_15px_rgba(244,63,94,0.3)]",
                outline: "border border-white/10 bg-transparent hover:bg-white/5 text-white hover:border-gable-green/50",
                secondary: "bg-slate-steel text-white hover:bg-slate-steel/80 border border-white/5",
                ghost: "hover:bg-white/5 text-zinc-400 hover:text-white",
                link: "text-gable-green underline-offset-4 hover:underline",
                premium: "bg-gradient-to-r from-gable-green to-emerald-400 text-deep-space font-bold shadow-glow hover:shadow-glow-strong hover:-translate-y-1"
            },
            size: {
                default: "h-10 py-2 px-4",
                sm: "h-9 px-3 rounded-md",
                lg: "h-12 px-8 rounded-xl text-base",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);
