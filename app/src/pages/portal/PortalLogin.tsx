import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { PortalService } from '../../services/PortalService';
import type { PortalConfig } from '../../types/portal';
import { BrandLogo } from '../../components/ui/BrandLogo';

export const PortalLogin = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<PortalConfig | null>(null);

    useEffect(() => {
        PortalService.getConfig()
            .then(setConfig)
            .catch(() => {/* Ignore — show default branding */ });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const resp = await PortalService.login(email, password);
            // Token is now set as httpOnly cookie by the backend
            localStorage.setItem('portal_config', JSON.stringify(resp.config));
            localStorage.setItem('portal_user', JSON.stringify(resp.user));
            navigate('/portal', { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const primaryColor = config?.primary_color || '#00FFA3';

    return (
        <div
            className="min-h-screen flex items-center justify-center font-sans"
            style={{ backgroundColor: '#0C0E14' }}
        >
            {/* Background glow */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    background: `radial-gradient(circle at 50% 30%, ${primaryColor}08 0%, transparent 50%)`,
                }}
            />

            <div className="relative w-full max-w-md px-6">
                {/* Logo / Brand */}
                <div className="text-center mb-10">
                    {config?.logo_url ? (
                        <img
                            src={config.logo_url}
                            alt={config?.dealer_name}
                            className="h-16 w-auto mx-auto mb-4 object-contain"
                        />
                    ) : (
                        <div className="inline-flex items-center mb-2">
                            <BrandLogo variant="full" size="lg" />
                        </div>
                    )}
                    <p className="text-zinc-500 text-sm">
                        Sign in to your contractor account
                    </p>
                </div>

                {/* Login Card */}
                <div
                    className="rounded-2xl border border-white/10 p-8 backdrop-blur-xl shadow-2xl"
                    style={{ backgroundColor: '#111320' }}
                >
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-2">
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white placeholder-zinc-600
                                           focus:outline-none focus:border-opacity-50 transition-colors"
                                style={{ ['--tw-ring-color' as string]: primaryColor }}
                                onFocus={e => (e.target.style.borderColor = primaryColor)}
                                onBlur={e => (e.target.style.borderColor = '')}
                                placeholder="you@company.com"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-zinc-400 mb-2">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white placeholder-zinc-600
                                           focus:outline-none transition-colors"
                                onFocus={e => (e.target.style.borderColor = primaryColor)}
                                onBlur={e => (e.target.style.borderColor = '')}
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 rounded-lg font-semibold text-sm text-black
                                       flex items-center justify-center gap-2 transition-all duration-200
                                       hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                                       shadow-lg"
                            style={{
                                backgroundColor: primaryColor,
                                boxShadow: `0 4px 20px ${primaryColor}40`,
                            }}
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <>
                                    <LogIn size={18} />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>

                    {config?.support_email && (
                        <p className="mt-6 text-center text-xs text-zinc-600">
                            Need help? Contact{' '}
                            <a
                                href={`mailto:${config.support_email}`}
                                className="hover:underline"
                                style={{ color: primaryColor }}
                            >
                                {config.support_email}
                            </a>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PortalLogin;
