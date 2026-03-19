import { useState, useEffect, useRef, type ReactNode, type FormEvent } from "react";
import { BrandLogo } from "./ui/BrandLogo";

const DEMO_PASSWORD = "IndependentUprising2026";
const AUTH_KEY = "demo_auth";

export function PasswordGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authed) inputRef.current?.focus();
  }, [authed]);

  if (authed) return <>{children}</>;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password === DEMO_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, "1");
      setAuthed(true);
    } else {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setPassword("");
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 bg-deep-space flex items-center justify-center overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-gable-green/5 blur-[160px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-gable-green/3 blur-[120px]" />

      <div className="relative z-10 flex flex-col items-center gap-10 px-6 w-full max-w-sm animate-fade-in">
        <BrandLogo variant="full" size="xl" />

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              placeholder="Enter demo password"
              className={`
                w-full px-4 py-3 rounded-lg
                bg-slate-steel border border-white/10
                text-white placeholder-white/30
                outline-none transition-all
                focus:border-gable-green/50 focus:ring-1 focus:ring-gable-green/30
                ${shaking ? "animate-[shake_0.4s_ease-in-out]" : ""}
              `}
              autoComplete="off"
            />
            {error && (
              <p className="mt-2 text-sm text-safety-red">
                Incorrect password. Please try again.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="
              w-full py-3 rounded-lg font-semibold text-deep-space
              bg-gable-green hover:brightness-110
              transition-all active:scale-[0.98]
              shadow-glow hover:shadow-glow-strong
            "
          >
            Enter Demo
          </button>
        </form>

        <p className="text-white/30 text-xs text-center">
          Private demo &mdash; password required
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
