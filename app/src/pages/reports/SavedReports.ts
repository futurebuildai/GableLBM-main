import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ToastService } from '../../lib/toast-service.ts';
import { reportingApi } from '../../services/reportingApi';
import type { SavedReport, ReportSchedule } from '../../services/reportingApi';
import { icon } from '../../lib/icons';
import {
    Calendar,
    Clock,
    Plus,
    Trash2,
    X,
    Loader2,
    Mail,
    Settings
} from 'lucide';

@customElement('gable-saved-reports')
export class SavedReports extends LitElement {
    createRenderRoot() { return this; }

    @state() private reports: SavedReport[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;

    // Scheduler Modal State
    @state() private activeReportForSchedule: SavedReport | null = null;
    @state() private schedules: ReportSchedule[] = [];
    @state() private loadingSchedules = false;
    @state() private isSavingSchedule = false;

    // Form inputs
    @state() private newScheduleRecipients = '';
    @state() private newScheduleFormat: 'CSV' | 'XLSX' | 'PDF' = 'CSV';
    @state() private newScheduleFrequency: 'daily' | 'weekly' | 'monthly' | 'custom' = 'daily';
    @state() private newScheduleCron = '0 0 9 * * *';

    connectedCallback() {
        super.connectedCallback();
        this._loadReports();
    }

    private async _loadReports() {
        try {
            this.loading = true;
            const data = await reportingApi.listSavedReports();
            this.reports = data || [];
            this.error = null;
        } catch (err: unknown) {
            this.error = err instanceof Error ? err.message : 'Failed to load saved reports';
        } finally {
            this.loading = false;
        }
    }

    private async _handleDelete(id: string) {
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            await reportingApi.deleteSavedReport(id);
            ToastService.show('Report deleted successfully', 'success');
            this._loadReports();
        } catch (err: unknown) {
            ToastService.show('Failed to delete report: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        }
    }

    private _handleRun(id: string) {
        window.location.href = `/reports/builder?id=${id}`;
    }

    // Modal Control Handlers
    private async _openScheduleModal(report: SavedReport) {
        this.activeReportForSchedule = report;
        this.newScheduleRecipients = '';
        this.newScheduleFormat = 'CSV';
        this.newScheduleFrequency = 'daily';
        this.newScheduleCron = '0 0 9 * * *';
        await this._loadSchedules();
    }

    private _closeScheduleModal() {
        this.activeReportForSchedule = null;
        this.schedules = [];
    }

    private async _loadSchedules() {
        if (!this.activeReportForSchedule) return;
        try {
            this.loadingSchedules = true;
            const data = await reportingApi.listReportSchedules();
            // Filter schedules for the current active report
            this.schedules = (data || []).filter(s => s.report_id === this.activeReportForSchedule?.id);
        } catch (err: unknown) {
            ToastService.show('Failed to load report schedules: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        } finally {
            this.loadingSchedules = false;
        }
    }

    private _handleFrequencyChange(e: Event) {
        const value = (e.target as HTMLSelectElement).value as 'daily' | 'weekly' | 'monthly' | 'custom';
        this.newScheduleFrequency = value;
        
        switch (value) {
            case 'daily':
                this.newScheduleCron = '0 0 9 * * *'; // 9:00 AM daily
                break;
            case 'weekly':
                this.newScheduleCron = '0 0 9 * * 0'; // 9:00 AM on Sunday
                break;
            case 'monthly':
                this.newScheduleCron = '0 0 9 1 * *'; // 9:00 AM on the 1st
                break;
            case 'custom':
                // Keep the current cron expression or leave it editable
                break;
        }
    }

    private async _handleAddSchedule(e: Event) {
        e.preventDefault();
        if (!this.activeReportForSchedule) return;

        const emailList = this.newScheduleRecipients
            .split(',')
            .map(email => email.trim())
            .filter(email => email.length > 0);

        if (emailList.length === 0) {
            ToastService.show('Please provide at least one recipient email address', 'error');
            return;
        }

        // Validate cron (basic length/field check)
        const cronFields = this.newScheduleCron.trim().split(/\s+/);
        if (cronFields.length < 5 || cronFields.length > 6) {
            ToastService.show('Invalid Cron Expression. Must contain 5 or 6 fields.', 'error');
            return;
        }

        try {
            this.isSavingSchedule = true;
            await reportingApi.createReportSchedule({
                report_id: this.activeReportForSchedule.id,
                cron_expression: this.newScheduleCron.trim(),
                recipients: emailList,
                format: this.newScheduleFormat,
            });

            ToastService.show('Schedule added successfully', 'success');
            
            // Reset form
            this.newScheduleRecipients = '';
            this.newScheduleFormat = 'CSV';
            this.newScheduleFrequency = 'daily';
            this.newScheduleCron = '0 0 9 * * *';
            
            await this._loadSchedules();
        } catch (err: unknown) {
            ToastService.show('Failed to add schedule: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        } finally {
            this.isSavingSchedule = false;
        }
    }

    private async _handleDeleteSchedule(scheduleId: string) {
        if (!window.confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await reportingApi.deleteReportSchedule(scheduleId);
            ToastService.show('Schedule deleted successfully', 'success');
            await this._loadSchedules();
        } catch (err: unknown) {
            ToastService.show('Failed to delete schedule: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
        }
    }

    private _formatCronText(cronExpr: string): string {
        switch (cronExpr) {
            case '0 0 9 * * *':
            case '0 9 * * *':
                return 'Daily at 9:00 AM';
            case '0 0 9 * * 0':
            case '0 9 * * 0':
                return 'Weekly on Sundays at 9:00 AM';
            case '0 0 9 1 * *':
            case '0 9 1 * *':
                return 'Monthly on the 1st at 9:00 AM';
            default:
                return `Custom (${cronExpr})`;
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="p-8 text-white flex flex-col items-center justify-center min-h-[400px]">
                    <div class="animate-spin text-gable-green mb-4">${icon(Loader2, 32)}</div>
                    <div class="text-zinc-400">Loading saved reports...</div>
                </div>
            `;
        }

        return html`
            <div class="p-8">
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                        ${icon(Calendar, 28, 'text-gable-green')} Saved Reports
                    </h1>
                    <a
                        href="/reports/builder"
                        class="bg-gable-green text-black font-semibold px-4 py-2 rounded shadow hover:bg-gable-green/90 transition-all flex items-center gap-1.5"
                    >
                        ${icon(Plus, 18)} Create New Report
                    </a>
                </div>

                ${this.error ? html`
                    <div class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded mb-6">
                        ${this.error}
                    </div>
                ` : nothing}

                ${this.reports.length === 0 ? html`
                    <div class="text-center text-zinc-400 py-16 bg-slate-steel rounded-xl border border-white/5">
                        <div class="text-zinc-600 mb-3 flex justify-center">${icon(Calendar, 48)}</div>
                        <p class="text-zinc-300 font-medium">No reports saved yet.</p>
                        <p class="text-sm text-zinc-500 mt-1">Design and save standard report structures first.</p>
                        <a href="/reports/builder" class="text-gable-green hover:underline mt-4 inline-block font-semibold">
                            Build your first report &rarr;
                        </a>
                    </div>
                ` : html`
                    <div class="bg-slate-steel border border-white/5 rounded-xl overflow-hidden shadow-xl">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-white/5 text-left">
                                <thead class="bg-black/20 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                                    <tr>
                                        <th class="px-6 py-4">Name</th>
                                        <th class="px-6 py-4">Entity Type</th>
                                        <th class="px-6 py-4">Description</th>
                                        <th class="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    ${this.reports.map((report) => html`
                                        <tr class="hover:bg-white/[0.02] transition-colors">
                                            <td class="px-6 py-4 font-semibold text-white">${report.name}</td>
                                            <td class="px-6 py-4 text-sm">
                                                <span class="px-2.5 py-1 rounded-md text-xs font-semibold capitalize bg-white/5 text-zinc-300">
                                                    ${report.entity_type}
                                                </span>
                                            </td>
                                            <td class="px-6 py-4 text-sm text-zinc-400 truncate max-w-xs">${report.description || 'No description provided.'}</td>
                                            <td class="px-6 py-4 text-right text-sm font-semibold space-x-2">
                                                <button
                                                    class="text-gable-green hover:text-white bg-gable-green/10 hover:bg-gable-green px-3 py-1.5 rounded-lg transition-all"
                                                    @click=${() => this._handleRun(report.id)}
                                                >
                                                    Run
                                                </button>
                                                <button
                                                    class="text-blueprint-blue hover:text-white bg-blueprint-blue/10 hover:bg-blueprint-blue px-3 py-1.5 rounded-lg transition-all flex inline-flex items-center gap-1"
                                                    @click=${() => this._openScheduleModal(report)}
                                                >
                                                    ${icon(Calendar, 14)} Schedule
                                                </button>
                                                <a 
                                                    href="/reports/builder?id=${report.id}" 
                                                    class="text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all inline-block"
                                                >
                                                    Edit
                                                </a>
                                                <button
                                                    @click=${() => this._handleDelete(report.id)}
                                                    class="text-red-400 hover:text-white bg-red-400/10 hover:bg-red-400 px-3 py-1.5 rounded-lg transition-all"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `}
            </div>

            <!-- Report Schedule Modal Overlay -->
            ${this.activeReportForSchedule ? html`
                <div class="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div class="bg-slate-steel border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-up text-white">
                        
                        <!-- Modal Header -->
                        <div class="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-black/10">
                            <div>
                                <h3 class="text-lg font-bold text-white flex items-center gap-2">
                                    ${icon(Settings, 20, 'text-gable-green')} Configure Automated Scheduler
                                </h3>
                                <p class="text-xs text-zinc-400 mt-0.5">Automated exports for saved report: <span class="text-white font-semibold">${this.activeReportForSchedule.name}</span></p>
                            </div>
                            <button 
                                @click=${this._closeScheduleModal}
                                class="text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
                            >
                                ${icon(X, 18)}
                            </button>
                        </div>

                        <!-- Modal Body -->
                        <div class="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                            
                            <!-- Section: Active Schedules -->
                            <div>
                                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Active Schedules</h4>
                                
                                ${this.loadingSchedules ? html`
                                    <div class="flex items-center justify-center py-6 text-zinc-500">
                                        <div class="animate-spin text-gable-green mr-2">${icon(Loader2, 16)}</div>
                                        <span>Fetching configurations...</span>
                                    </div>
                                ` : this.schedules.length === 0 ? html`
                                    <div class="text-center py-8 bg-black/10 rounded-xl border border-dashed border-white/5 text-zinc-500 text-sm">
                                        No active distributions configured. Add one below to automate delivery.
                                    </div>
                                ` : html`
                                    <div class="space-y-2.5">
                                        ${this.schedules.map(sched => html`
                                            <div class="flex items-center justify-between p-3.5 bg-black/10 border border-white/5 rounded-xl">
                                                <div class="space-y-1">
                                                    <!-- Timing & Format -->
                                                    <div class="flex items-center gap-2 text-sm font-semibold">
                                                        <span class="text-gable-green flex items-center gap-1">
                                                            ${icon(Clock, 14)} ${this._formatCronText(sched.cron_expression)}
                                                        </span>
                                                        <span class="text-xs px-2 py-0.5 rounded bg-blueprint-blue/15 text-blueprint-blue font-mono font-bold">
                                                            ${sched.format}
                                                        </span>
                                                    </div>
                                                    
                                                    <!-- Recipients -->
                                                    <div class="flex items-center gap-1 text-xs text-zinc-400">
                                                        ${icon(Mail, 12)} ${sched.recipients.join(', ')}
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    @click=${() => this._handleDeleteSchedule(sched.id)}
                                                    class="text-zinc-500 hover:text-red-400 p-2 hover:bg-white/5 rounded-lg transition-all"
                                                    title="Delete schedule"
                                                >
                                                    ${icon(Trash2, 16)}
                                                </button>
                                            </div>
                                        `)}
                                    </div>
                                `}
                            </div>

                            <hr class="border-white/5" />

                            <!-- Section: Add New Schedule Form -->
                            <form @submit=${this._handleAddSchedule} class="space-y-4">
                                <h4 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Create New Distribution</h4>
                                
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <!-- Format -->
                                    <div class="space-y-1.5">
                                        <label class="text-xs text-zinc-400 font-semibold">Output Format</label>
                                        <select 
                                            .value=${this.newScheduleFormat}
                                            @change=${(e: Event) => this.newScheduleFormat = (e.target as HTMLSelectElement).value as 'CSV' | 'XLSX' | 'PDF'}
                                            class="w-full bg-black/20 border border-white/10 text-white rounded-xl p-2.5 outline-none focus:border-gable-green/50 focus:ring-1 focus:ring-gable-green/50 transition-colors"
                                        >
                                            <option value="CSV">Comma Separated (CSV)</option>
                                            <option value="XLSX">Excel Spreadsheet (XLSX)</option>
                                            <option value="PDF">Formatted Document (PDF)</option>
                                        </select>
                                    </div>

                                    <!-- Frequency Preset -->
                                    <div class="space-y-1.5">
                                        <label class="text-xs text-zinc-400 font-semibold">Frequency Preset</label>
                                        <select 
                                            .value=${this.newScheduleFrequency}
                                            @change=${this._handleFrequencyChange}
                                            class="w-full bg-black/20 border border-white/10 text-white rounded-xl p-2.5 outline-none focus:border-gable-green/50 focus:ring-1 focus:ring-gable-green/50 transition-colors"
                                        >
                                            <option value="daily">Daily at 9:00 AM</option>
                                            <option value="weekly">Weekly on Sunday at 9:00 AM</option>
                                            <option value="monthly">Monthly on 1st at 9:00 AM</option>
                                            <option value="custom">Custom Cron Expression</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- Cron Expression -->
                                <div class="space-y-1.5">
                                    <label class="text-xs text-zinc-400 font-semibold flex justify-between">
                                        <span>Cron Expression</span>
                                        ${this.newScheduleFrequency === 'custom' ? html`
                                            <span class="text-[10px] text-zinc-500">Format: Sec Min Hour Dom Month Dow</span>
                                        ` : nothing}
                                    </label>
                                    <input 
                                        type="text" 
                                        .value=${this.newScheduleCron}
                                        ?readonly=${this.newScheduleFrequency !== 'custom'}
                                        @input=${(e: Event) => this.newScheduleCron = (e.target as HTMLInputElement).value}
                                        class="w-full bg-black/20 border border-white/10 text-white rounded-xl p-2.5 outline-none focus:border-gable-green/50 focus:ring-1 focus:ring-gable-green/50 transition-colors font-mono text-sm ${this.newScheduleFrequency !== 'custom' ? 'opacity-60 cursor-not-allowed bg-black/30' : ''}"
                                        placeholder="0 0 9 * * *"
                                    />
                                </div>

                                <!-- Email Recipients -->
                                <div class="space-y-1.5">
                                    <label class="text-xs text-zinc-400 font-semibold">Target Email Addresses</label>
                                    <input 
                                        type="text" 
                                        .value=${this.newScheduleRecipients}
                                        @input=${(e: Event) => this.newScheduleRecipients = (e.target as HTMLInputElement).value}
                                        class="w-full bg-black/20 border border-white/10 text-white rounded-xl p-2.5 outline-none focus:border-gable-green/50 focus:ring-1 focus:ring-gable-green/50 transition-colors"
                                        placeholder="accounting@lumber.com, director@dealer.com"
                                        required
                                    />
                                    <p class="text-[10px] text-zinc-500">Separate multiple email addresses with a comma.</p>
                                </div>

                                <!-- Actions -->
                                <div class="flex justify-end gap-2 pt-2">
                                    <button 
                                        type="button" 
                                        @click=${this._closeScheduleModal}
                                        class="bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl px-4 py-2.5 transition-colors text-sm font-semibold"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        ?disabled=${this.isSavingSchedule}
                                        class="bg-gable-green text-black font-bold rounded-xl px-5 py-2.5 hover:bg-gable-green/90 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50"
                                    >
                                        ${this.isSavingSchedule ? html`
                                            <div class="animate-spin text-black">${icon(Loader2, 16)}</div>
                                            <span>Configuring...</span>
                                        ` : html`
                                            ${icon(Plus, 16)} <span>Add Schedule</span>
                                        `}
                                    </button>
                                </div>
                            </form>

                        </div>

                    </div>
                </div>
            ` : nothing}
        `;
    }
}

export default SavedReports;
