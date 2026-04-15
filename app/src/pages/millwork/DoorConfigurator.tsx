import { useState, useEffect } from 'react';
import type { MillworkOption, MillworkConfiguration } from '../../types/millwork';
import { MillworkService } from '../../services/MillworkService';

export const DoorConfigurator = () => {
    const [doorTypes, setDoorTypes] = useState<MillworkOption[]>([]);
    const [materials, setMaterials] = useState<MillworkOption[]>([]);
    const [glassOptions, setGlassOptions] = useState<MillworkOption[]>([]);

    const [config, setConfig] = useState<MillworkConfiguration>({
        doorType: null,
        material: null,
        glass: null,
        width: 36,
        height: 80,
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOptions = async () => {
        setError(null);
        setLoading(true);
        try {
            const [doors, mats, glass] = await Promise.all([
                MillworkService.getOptionsByCategory('door_type'),
                MillworkService.getOptionsByCategory('material'),
                MillworkService.getOptionsByCategory('glass'),
            ]);
            setDoorTypes(doors);
            setMaterials(mats);
            setGlassOptions(glass);
        } catch (err) {
            console.error("Failed to load millwork options", err);
            setError(err instanceof Error ? err.message : 'Failed to load configurator options');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOptions();
    }, []);

    const currentPrice = MillworkService.calculateDoorPrice(config);
    const basePrice = 250.00; // Keep for display reference if needed, or fetch from config

    if (loading) return <div className="p-8 text-white">Loading Configurator...</div>;

    if (error) return (
        <div className="flex h-full items-center justify-center bg-[#0A0B10] text-[#E0E0E0]">
            <div className="text-center space-y-4">
                <p className="text-red-400">{error}</p>
                <button
                    onClick={fetchOptions}
                    className="px-4 py-2 rounded-lg bg-[#00FFA3]/10 text-[#00FFA3] border border-[#00FFA3]/20 hover:bg-[#00FFA3]/20 transition-colors text-sm font-medium"
                >
                    Retry
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex h-full bg-[#0A0B10] text-[#E0E0E0]">
            {/* Configuration Panel */}
            <div className="w-1/3 border-r border-white/10 p-6 overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6 text-[#00FFA3]">Configure Door</h2>

                <div className="space-y-8">
                    {/* Door Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Door Style</label>
                        <div className="grid grid-cols-2 gap-3">
                            {doorTypes.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setConfig({ ...config, doorType: opt })}
                                    className={`p-4 border rounded-lg text-left transition-all ${config.doorType?.id === opt.id
                                        ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-white'
                                        : 'border-white/10 hover:border-white/30 text-gray-300'
                                        }`}
                                >
                                    <div className="font-medium">{opt.name}</div>
                                    <div className="text-sm text-gray-500">+${opt.price_adjustment}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Material */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Material</label>
                        <div className="grid grid-cols-2 gap-3">
                            {materials.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setConfig({ ...config, material: opt })}
                                    className={`p-4 border rounded-lg text-left transition-all ${config.material?.id === opt.id
                                        ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-white'
                                        : 'border-white/10 hover:border-white/30 text-gray-300'
                                        }`}
                                >
                                    <div className="font-medium">{opt.name}</div>
                                    <div className="text-sm text-gray-500">+${opt.price_adjustment}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dimensions */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Dimensions (Inches)</label>
                        <div className="flex gap-4">
                            <div>
                                <label className="text-xs text-gray-500">Width</label>
                                <input
                                    type="number"
                                    value={config.width}
                                    onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-[#161821] border border-white/20 rounded p-2 focus:border-[#00FFA3] outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Height</label>
                                <input
                                    type="number"
                                    value={config.height}
                                    onChange={(e) => setConfig({ ...config, height: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-[#161821] border border-white/20 rounded p-2 focus:border-[#00FFA3] outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Glass */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Glass Options</label>
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                onClick={() => setConfig({ ...config, glass: null })}
                                className={`p-3 border rounded text-left ${config.glass === null
                                    ? 'border-[#00FFA3] bg-[#00FFA3]/10'
                                    : 'border-white/10'
                                    }`}
                            >
                                No Glass
                            </button>
                            {glassOptions.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setConfig({ ...config, glass: opt })}
                                    className={`p-3 border rounded text-left flex justify-between ${config.glass?.id === opt.id
                                        ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-white'
                                        : 'border-white/10 hover:border-white/30 text-gray-300'
                                        }`}
                                >
                                    <span>{opt.name}</span>
                                    <span className="text-gray-500">+${opt.price_adjustment}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            {/* Visualizer / Summary */}
            <div className="flex-1 p-12 flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0B10] to-[#161821]">

                {/* Placeholder Visualizer */}
                <div className="w-64 h-96 border-4 border-[#38BDF8] bg-[#0A0B10] relative shadow-2xl mb-8 transition-all duration-500"
                    style={{
                        width: `${config.width * 2}px`,
                        height: `${config.height * 2}px`,
                        borderColor: config.material?.name === 'Mahogany' ? '#6D2E15' : '#38BDF8'
                    }}
                >
                    <div className="absolute inset-0 flex items-center justify-center text-white/20 font-mono text-4xl">
                        {config.doorType?.name || "Select Style"}
                    </div>
                    {config.glass && (
                        <div className="absolute top-10 left-10 right-10 bottom-40 bg-blue-400/20 border border-blue-400/30 backdrop-blur-sm"></div>
                    )}
                </div>

                {/* Price Tag */}
                <div className="bg-[#161821] border border-white/10 p-6 rounded-xl w-96 shadow-xl">
                    <h3 className="text-gray-400 uppercase text-xs tracking-wider mb-4">Estimate Summary</h3>

                    <div className="space-y-2 mb-4 text-sm">
                        <div className="flex justify-between">
                            <span>Base Door ({config.width}" x {config.height}")</span>
                            <span>${basePrice.toFixed(2)}</span>
                        </div>
                        {config.doorType && (
                            <div className="flex justify-between text-[#00FFA3]">
                                <span>{config.doorType.name}</span>
                                <span>+${config.doorType.price_adjustment.toFixed(2)}</span>
                            </div>
                        )}
                        {config.material && (
                            <div className="flex justify-between text-[#00FFA3]">
                                <span>{config.material.name}</span>
                                <span>+${config.material.price_adjustment.toFixed(2)}</span>
                            </div>
                        )}
                        {/* Oversize charge logic visualization if needed */}
                    </div>

                    <div className="border-t border-white/10 pt-4 flex justify-between items-end">
                        <span className="text-gray-400">Total</span>
                        <span className="text-3xl font-mono font-bold text-white">${currentPrice.toFixed(2)}</span>
                    </div>

                    <button className="w-full mt-6 bg-[#00FFA3] hover:bg-[#00FFA3]/90 text-black font-bold py-3 rounded uppercase tracking-wide transition-colors">
                        Add to Order
                    </button>
                </div>

            </div>
        </div>
    );
};
