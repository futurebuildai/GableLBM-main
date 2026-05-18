import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { FolderGit2, Plus, ArrowRight, RefreshCw, AlertTriangle, Briefcase } from 'lucide';
import { ProjectService } from '../../services/ProjectService.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { router } from '../../lib/router.ts';
import { format } from 'date-fns';
import type { Project } from '../../types/project.ts';

@customElement('gable-project-list')
export class ProjectList extends LitElement {
    createRenderRoot() { return this; }

    @state() private projects: Project[] = [];
    @state() private loading = true;
    @state() private error = '';
    @state() private isCreating = false;
    @state() private newProjectName = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchProjects();
    }

    private async _fetchProjects() {
        this.loading = true;
        this.error = '';
        try {
            const data = await ProjectService.listProjects();
            this.projects = data;
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to load projects';
        } finally {
            this.loading = false;
        }
    }

    private async _handleCreateProject(e: Event) {
        e.preventDefault();
        if (!this.newProjectName.trim()) return;

        try {
            const newProject = await ProjectService.createProject({ name: this.newProjectName });
            ToastService.show('Project created successfully', 'success');
            this.isCreating = false;
            this.newProjectName = '';
            this.projects = [newProject, ...this.projects];
            router.navigate(`/portal/projects/${newProject.id}`);
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to create project', 'error');
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    <div class="h-10 w-1/4 bg-white/5 rounded-lg animate-pulse mb-6"></div>
                    ${[1, 2, 3].map(() => html`
                        <div class="h-20 bg-white/5 rounded-2xl animate-pulse"></div>
                    `)}
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'w-12 h-12 text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button
                        @click=${() => this._fetchProjects()}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div>
                <div class="mb-6 flex items-center justify-between">
                    <div>
                        <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                            ${icon(FolderGit2, 24, 'text-gable-green')} Projects
                        </h1>
                        <p class="text-zinc-400 text-sm mt-1">Organize orders, deliveries, and invoices by job site or project</p>
                    </div>
                    ${!this.isCreating ? html`
                        <button
                            @click=${() => { this.isCreating = true; }}
                            class="flex items-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded-lg hover:bg-emerald-400 transition-colors shadow-[0_0_15px_rgba(0,255,163,0.3)]"
                        >
                            ${icon(Plus, 18)} New Project
                        </button>
                    ` : nothing}
                </div>

                ${this.isCreating ? html`
                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-gable-green/30 rounded-2xl mb-6">
                        <div class="p-4">
                            <form @submit=${(e: Event) => this._handleCreateProject(e)} class="flex gap-3 items-end">
                                <div class="flex-1">
                                    <label class="block text-sm font-medium text-zinc-300 mb-1">Project Name</label>
                                    <input
                                        type="text"
                                        required
                                        .value=${this.newProjectName}
                                        @input=${(e: InputEvent) => { this.newProjectName = (e.target as HTMLInputElement).value; }}
                                        placeholder="e.g. 123 Main St Subivision"
                                        class="w-full bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-gable-green"
                                    />
                                </div>
                                <button
                                    type="button"
                                    @click=${() => { this.isCreating = false; }}
                                    class="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    ?disabled=${!this.newProjectName.trim()}
                                    class="px-4 py-2 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                                >
                                    Create
                                </button>
                            </form>
                        </div>
                    </div>
                ` : nothing}

                ${this.projects.length === 0 ? html`
                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                        <div class="p-12 text-center">
                            ${icon(Briefcase, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                            <h3 class="text-lg font-medium text-white mb-2">No projects found</h3>
                            <p class="text-zinc-400 mb-6">Group your orders and deliveries by creating your first project.</p>
                            <button
                                @click=${() => { this.isCreating = true; }}
                                class="inline-flex items-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded-lg hover:bg-emerald-400 transition-colors"
                            >
                                ${icon(Plus, 18)} New Project
                            </button>
                        </div>
                    </div>
                ` : html`
                    <div class="space-y-3">
                        ${this.projects.map(project => html`
                            <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                                <div
                                    @click=${() => router.navigate(`/portal/projects/${project.id}`)}
                                    class="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors group"
                                >
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                                            ${icon(FolderGit2, 20)}
                                        </div>
                                        <div>
                                            <h3 class="font-medium text-white">${project.name}</h3>
                                            <div class="text-sm text-zinc-500 mt-1 flex items-center gap-2">
                                                <span>Created ${format(new Date(project.created_at), 'MMM d, yyyy')}</span>
                                                <span>&middot;</span>
                                                <span class="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${project.status === 'Active'
                                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                    : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                                }">
                                                    ${project.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    ${icon(ArrowRight, 20, 'text-zinc-600 group-hover:text-emerald-400 transition-colors')}
                                </div>
                            </div>
                        `)}
                    </div>
                `}
            </div>
        `;
    }
}
