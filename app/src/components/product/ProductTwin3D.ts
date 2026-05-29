import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * <gable-product-twin-3d> — renders a single product as a scaled parametric box
 * in Three.js, the PIM-side digital twin of the material loaded by AI_LM's Load
 * Builder. It adopts the identical scaling contract as AI_LM's
 * <ailm-load-3d-visualizer>: 1 inch = 1/12 Three.js world unit, with solver
 * coordinates mapped (length=X, width=Y, height=Z) and Three.js using Y-up, so a
 * box of L×W×H inches becomes BoxGeometry(L*s, H*s, W*s). Both surfaces therefore
 * render the same product at matching world-unit size.
 */
@customElement('gable-product-twin-3d')
export class ProductTwin3D extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) lengthIn: number | null = null;
    @property({ attribute: false }) widthIn: number | null = null;
    @property({ attribute: false }) heightIn: number | null = null;

    private _scene?: THREE.Scene;
    private _camera?: THREE.PerspectiveCamera;
    private _renderer?: THREE.WebGLRenderer;
    private _controls?: OrbitControls;
    private _frame = 0;
    private _resizeObserver?: ResizeObserver;
    private readonly _scale = 1 / 12; // inches → feet (shared digital-twin contract with AI_LM)

    private get _hasGeometry(): boolean {
        return !!(this.lengthIn && this.widthIn && this.heightIn);
    }

    firstUpdated() {
        if (this._hasGeometry) {
            this._initScene();
            this._rebuild();
        }
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('lengthIn') || changed.has('widthIn') || changed.has('heightIn')) {
            if (this._hasGeometry) {
                if (!this._scene) this._initScene();
                this._rebuild();
            } else if (this._scene) {
                this._teardown();
            }
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._teardown();
    }

    private _teardown() {
        cancelAnimationFrame(this._frame);
        this._resizeObserver?.disconnect();
        this._resizeObserver = undefined;
        this._controls?.dispose();
        this._controls = undefined;
        this._renderer?.dispose();
        if (this._renderer?.domElement?.parentElement) {
            this._renderer.domElement.parentElement.removeChild(this._renderer.domElement);
        }
        this._renderer = undefined;
        this._scene = undefined;
        this._camera = undefined;
    }

    private get _canvasHost(): HTMLElement | null {
        return this.querySelector('#twin-host');
    }

    private _initScene() {
        const host = this._canvasHost;
        if (!host) return;

        const width = host.clientWidth || 640;
        const height = host.clientHeight || 420;

        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(0x0a0b10);

        this._camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        this._camera.position.set(10, 8, 10);

        this._renderer = new THREE.WebGLRenderer({ antialias: true });
        this._renderer.setSize(width, height);
        this._renderer.setPixelRatio(window.devicePixelRatio);
        host.appendChild(this._renderer.domElement);

        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;

        this._scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(10, 20, 10);
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
        const host = this._canvasHost;
        if (!host || !this._renderer || !this._camera) return;
        const width = host.clientWidth;
        const height = host.clientHeight;
        if (width === 0 || height === 0) return;
        this._renderer.setSize(width, height);
        this._camera.aspect = width / height;
        this._camera.updateProjectionMatrix();
    }

    /** Clears product/grid meshes and rebuilds them from current dimensions. */
    private _rebuild() {
        if (!this._scene || !this._hasGeometry) return;

        const removable = this._scene.children.filter((c) => c.userData.built);
        removable.forEach((c) => this._scene!.remove(c));

        const s = this._scale;
        const l = (this.lengthIn ?? 0) * s;
        const w = (this.widthIn ?? 0) * s;
        const h = (this.heightIn ?? 0) * s;

        // Ground grid sized to the product footprint.
        const grid = new THREE.GridHelper(Math.max(l, w, h) * 2.2 || 4, 24, 0x1e2029, 0x161821);
        grid.userData.built = true;
        this._scene.add(grid);

        // The product box, centered on the grid origin and resting on the floor.
        const geo = new THREE.BoxGeometry(l, h, w);
        const mat = new THREE.MeshStandardMaterial({ color: 0x252836, transparent: true, opacity: 0.85 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, h / 2, 0);
        mesh.userData.built = true;
        this._scene.add(mesh);

        // Gable-green edge outline so the silhouette reads clearly.
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x00ffa3, transparent: true, opacity: 0.85 }),
        );
        edges.position.copy(mesh.position);
        edges.userData.built = true;
        this._scene.add(edges);

        // Frame the camera to the box so any size fills the view sensibly.
        const span = Math.max(l, w, h) || 4;
        if (this._camera) {
            this._camera.position.set(span * 1.6, span * 1.3, span * 1.6);
            this._camera.lookAt(0, h / 2, 0);
        }
        if (this._controls) {
            this._controls.target.set(0, h / 2, 0);
            this._controls.update();
        }
    }

    render() {
        if (!this._hasGeometry) {
            return html`
                <div class="relative w-full h-[420px] rounded-xl overflow-hidden border border-white/5 bg-deep-space flex items-center justify-center">
                    <span class="text-sm text-zinc-500">Enter length, width, and height to render the 3D twin</span>
                </div>
            `;
        }
        return html`
            <div class="relative w-full h-[420px] rounded-xl overflow-hidden border border-white/5 bg-deep-space">
                <div id="twin-host" class="absolute inset-0"></div>
                <div class="absolute bottom-3 left-3 text-[11px] text-zinc-500 font-mono pointer-events-none">
                    drag to orbit · scroll to zoom
                </div>
            </div>
        `;
    }
}
