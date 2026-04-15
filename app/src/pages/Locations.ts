import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import '../components/location/LocationManager.ts';

@customElement('gable-locations')
export class GableLocations extends LitElement {
    createRenderRoot() { return this; }

    render() {
        return html`
            <div class="p-8 max-w-7xl mx-auto">
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-zinc-100 tracking-tight">Locations</h1>
                    <p class="text-zinc-500 mt-1">Manage Warehouse Zones, Aisles, and Bins</p>
                </div>
                <gable-location-manager></gable-location-manager>
            </div>
        `;
    }
}
