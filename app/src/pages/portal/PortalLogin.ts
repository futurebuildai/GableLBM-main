import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { LogIn, AlertCircle, Loader2 } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { PortalConfig } from '../../types/portal';

@customElement('gable-portal-login')
export class PortalLogin extends LitElement {
    createRenderRoot() { return this; }

    @state() private email = '';
    @state() private password = '';
    @state() private error = '';
    @state() private loading = false;
    @state() private config: PortalConfig | null = null;

    connectedCallback() {
        super.connectedCallback();
        PortalService.getConfig()
            .then(c => { this.config = c; })
            .catch(() => { /* Ignore — show default branding */ });
    }

    private async _handleSubmit(e: Event) {
        e.preventDefault();
        this.error = '';
        this.loading = true;

        try {
            const resp = await PortalService.login(this.email, this.password);
            // Token is now set as httpOnly cookie by the backend
            localStorage.setItem('portal_config', JSON.stringify(resp.config));
            localStorage.setItem('portal_user', JSON.stringify(resp.user));
            router.replace('/portal');
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Login failed. Please try again.';
        } finally {
            this.loading = false;
        }
    }

    private _onFocus(e: FocusEvent) {
        const primaryColor = this.config?.primary_color || '#00FFA3';
        (e.target as HTMLInputElement).style.borderColor = primaryColor;
    }

    private _onBlur(e: FocusEvent) {
        (e.target as HTMLInputElement).style.borderColor = '';
    }

    render() {
        const primaryColor = this.config?.primary_color || '#00FFA3';

        return html`
            <div
                class="min-h-screen flex items-center justify-center font-sans"
                style="background-color: #0C0E14"
            >
                <!-- Background glow -->
                <div
                    class="fixed inset-0 pointer-events-none"
                    style="background: radial-gradient(circle at 50% 30%, ${primaryColor}08 0%, transparent 50%)"
                ></div>

                <div class="relative w-full max-w-md px-6">
                    <!-- Logo / Brand -->
                    <div class="text-center mb-10">
                        ${this.config?.logo_url
                            ? html`<img
                                src="${this.config.logo_url}"
                                alt="${this.config?.dealer_name ?? ''}"
                                class="h-16 w-auto mx-auto mb-4 object-contain"
                              />`
                            : html`<div class="inline-flex items-center mb-2">
                                <gable-brand-logo variant="full" size="lg"></gable-brand-logo>
                              </div>`
                        }
                        <p class="text-zinc-500 text-sm">
                            Sign in to your contractor account
                        </p>
                    </div>

                    <!-- Login Card -->
                    <div
                        class="rounded-2xl border border-white/10 p-8 backdrop-blur-xl shadow-2xl"
                        style="background-color: #111320"
                    >
                        <form @submit=${(e: Event) => this._handleSubmit(e)} class="space-y-6">
                            ${this.error
                                ? html`<div class="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                    ${icon(AlertCircle, 16, 'shrink-0')}
                                    <span>${this.error}</span>
                                  </div>`
                                : nothing
                            }

                            <div>
                                <label for="email" class="block text-sm font-medium text-zinc-400 mb-2">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    .value=${this.email}
                                    @input=${(e: InputEvent) => { this.email = (e.target as HTMLInputElement).value; }}
                                    required
                                    autocomplete="email"
                                    class="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white placeholder-zinc-600 focus:outline-none focus:border-opacity-50 transition-colors"
                                    @focus=${this._onFocus}
                                    @blur=${this._onBlur}
                                    placeholder="you@company.com"
                                />
                            </div>

                            <div>
                                <label for="password" class="block text-sm font-medium text-zinc-400 mb-2">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    .value=${this.password}
                                    @input=${(e: InputEvent) => { this.password = (e.target as HTMLInputElement).value; }}
                                    required
                                    autocomplete="current-password"
                                    class="w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
                                    @focus=${this._onFocus}
                                    @blur=${this._onBlur}
                                    placeholder="••••••••"
                                />
                            </div>

                            <button
                                type="submit"
                                ?disabled=${this.loading}
                                class="w-full py-3 rounded-lg font-semibold text-sm text-black flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                style="background-color: ${primaryColor}; box-shadow: 0 4px 20px ${primaryColor}40"
                            >
                                ${this.loading
                                    ? icon(Loader2, 18, 'animate-spin')
                                    : html`${icon(LogIn, 18)} Sign In`
                                }
                            </button>
                        </form>

                        ${this.config?.support_email
                            ? html`<p class="mt-6 text-center text-xs text-zinc-600">
                                Need help? Contact${' '}
                                <a
                                    href="mailto:${this.config.support_email}"
                                    class="hover:underline"
                                    style="color: ${primaryColor}"
                                >
                                    ${this.config.support_email}
                                </a>
                              </p>`
                            : nothing
                        }
                    </div>
                </div>
            </div>
        `;
    }
}

export default PortalLogin;
