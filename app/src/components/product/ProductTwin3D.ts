import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Wood tones matched to AI_LM's load builder so a product renders identically
// in the PIM preview and on the truck bed.
function woodToneFor(sku: string): number {
    const s = sku.toUpperCase();
    if (s.includes('-PT')) return 0x7d8a5a; // pressure treated
    if (s.includes('WRC') || s.includes('CEDAR')) return 0xa9714f; // western red cedar
    if (s.includes('OSB') || s.includes('PLY')) return 0xc49a6c; // sheet goods
    return 0xd9b98a; // SPF / whitewood
}

/**
 * <gable-product-twin-3d> — the PIM digital modeler preview: renders the
 * product's parametric box at true scale next to a reference pallet.
 *
 * Shared digital-twin scaling contract: 1 inch = 1/12 Three.js world unit.
 * AI_LM's <ailm-load-3d-visualizer> uses the identical factor — a 96″ board is
 * 8 world units in both apps. Do not change one side without the other.
 */
@customElement('gable-product-twin-3d')
export class ProductTwin3D extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: Number }) lengthIn = 0;
    @property({ type: Number }) widthIn = 0;
    @property({ type: Number }) heightIn = 0;
    @property() sku = '';

    private _scene?: THREE.Scene;
    private _camera?: THREE.PerspectiveCamera;
    private _renderer?: THREE.WebGLRenderer;
    private _controls?: OrbitControls;
    private _frame = 0;
    private _resizeObserver?: ResizeObserver;
    private readonly _scale = 1 / 12; // inches → world units (shared contract)

    firstUpdated() {
        this._initScene();
        this._rebuild();
    }

    updated(changed: Map<string, unknown>) {
        if ((changed.has('lengthIn') || changed.has('widthIn') || changed.has('heightIn') || changed.has('sku')) && this._scene) {
            this._rebuild();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        cancelAnimationFrame(this._frame);
        this._resizeObserver?.disconnect();
        this._controls?.dispose();
        this._renderer?.dispose();
    }

    private get _host(): HTMLElement | null {
        return this.querySelector('#twin-host');
    }

    private _initScene() {
        const host = this._host;
        if (!host) return;

        const width = host.clientWidth || 480;
        const height = host.clientHeight || 320;

        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(0x0a0b10);

        this._camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this._camera.position.set(9, 6, 9);

        this._renderer = new THREE.WebGLRenderer({ antialias: true });
        this._renderer.setSize(width, height);
        this._renderer.setPixelRatio(window.devicePixelRatio);
        host.appendChild(this._renderer.domElement);

        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;

        this._scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const dir = new THREE.DirectionalLight(0xffffff, 0.85);
        dir.position.set(8, 14, 6);
        this._scene.add(dir);

        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(host);

        const animate = () => {
            this._frame = requestAnimationFrame(animate);
            this._controls?.update();
            if (this._renderer && this._scene && this._camera) {
                this._renderer.render(this._scene, this._camera);
            }
        };
        animate();
    }

    private _onResize() {
        const host = this._host;
        if (!host || !this._renderer || !this._camera) return;
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (width === 0 || height === 0) return;
        this._renderer.setSize(width, height);
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
    }

    private _rebuild() {
        if (!this._scene) return;
        const removable = this._scene.children.filter((c) => c.userData.built);
        removable.forEach((c) => this._scene!.remove(c));

        const s = this._scale;
        const grid = new THREE.GridHelper(16, 32, 0x1e2029, 0x161821);
        grid.userData.built = true;
        this._scene.add(grid);

        // Reference: a 48×40×5″ pallet so dimensions read at human scale.
        const palletGeo = new THREE.BoxGeometry(48 * s, 5 * s, 40 * s);
        const pallet = new THREE.Mesh(
            palletGeo,
            new THREE.MeshStandardMaterial({ color: 0x4a4036, transparent: true, opacity: 0.45 }),
        );
        pallet.position.set(0, (5 * s) / 2, -3.2);
        pallet.userData.built = true;
        this._scene.add(pallet);

        if (this.lengthIn <= 0 || this.widthIn <= 0 || this.heightIn <= 0) return;

        const l = this.lengthIn * s;
        const w = this.widthIn * s;
        const h = this.heightIn * s;
        const geo = new THREE.BoxGeometry(l, h, w);
        const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ color: woodToneFor(this.sku), roughness: 0.85 }),
        );
        mesh.position.set(0, h / 2, 0);
        mesh.userData.built = true;
        this._scene.add(mesh);

        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x00ffa3, transparent: true, opacity: 0.7 }),
        );
        edges.position.copy(mesh.position);
        edges.userData.built = true;
        this._scene.add(edges);
    }

    render() {
        const missing = this.lengthIn <= 0 || this.widthIn <= 0 || this.heightIn <= 0;
        return html`
            <div class="relative w-full h-[320px] rounded-xl overflow-hidden border border-white/5 bg-[#0A0B10]">
                <div id="twin-host" class="absolute inset-0"></div>
                ${missing
                    ? html`<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span class="text-sm text-zinc-500">Enter dimensions to model the digital twin</span>
                      </div>`
                    : null}
                <div class="absolute bottom-2 left-3 text-[11px] text-zinc-500 font-mono pointer-events-none">
                    1″ = 1/12 unit · pallet for scale · drag to orbit
                </div>
            </div>
        `;
    }
}
