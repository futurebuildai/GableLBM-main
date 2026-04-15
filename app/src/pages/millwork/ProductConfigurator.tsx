import { useState, useEffect, useCallback } from 'react';
import { CONFIGURATOR_STEPS } from '../../types/configurator';
import type { AvailableOption, ValidateConfigResponse, BuildSKUResponse } from '../../types/configurator';
import { ConfiguratorService } from '../../services/ConfiguratorService';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, AlertTriangle, Package, TreePine, Gauge, Ruler, Eye, Sparkles, X } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';

const STEP_ICONS = [Package, TreePine, Gauge, Ruler, Eye];

const DIMENSION_OPTIONS = [
    '2x4', '2x6', '2x8', '2x10', '2x12',
    '4x4', '4x6', '6x6',
    '1x4', '1x6', '1x8', '1x10', '1x12',
];
const LENGTH_OPTIONS = ['8', '10', '12', '14', '16', '20'];

export const ProductConfigurator = () => {
    const { showToast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [selections, setSelections] = useState<Record<string, string>>({
        ProductType: '',
        Species: '',
        Grade: '',
        Treatment: 'None',
        Dimensions: '',
    });
    const [availableOptions, setAvailableOptions] = useState<AvailableOption[]>([]);
    const [treatmentOptions, setTreatmentOptions] = useState<AvailableOption[]>([]);
    const [validation, setValidation] = useState<ValidateConfigResponse | null>(null);
    const [skuResult, setSkuResult] = useState<BuildSKUResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dimensionSize, setDimensionSize] = useState('');
    const [dimensionLength, setDimensionLength] = useState('');

    const step = CONFIGURATOR_STEPS[currentStep];

    // Fetch available options when step or selections change
    const fetchOptions = useCallback(async () => {
        if (currentStep === 4) return; // Review step
        if (currentStep === 3) return; // Dimensions are hardcoded

        setLoading(true);
        setError(null);
        try {
            const opts = await ConfiguratorService.getAvailableOptions(
                step.attributeType,
                selections
            );
            setAvailableOptions(opts);

            // Also fetch treatment options for the Grade step
            if (currentStep === 2 && selections.Species) {
                const treatOpts = await ConfiguratorService.getAvailableOptions('Treatment', selections);
                setTreatmentOptions(treatOpts);
            }
        } catch (err) {
            console.error('Failed to fetch options:', err);
            // Fall back to defaults for ProductType
            if (currentStep === 0) {
                setAvailableOptions([
                    { value: 'Lumber', allowed: true },
                    { value: 'Door', allowed: true },
                    { value: 'Trim', allowed: true },
                    { value: 'Panel', allowed: true },
                ]);
            } else {
                setError('Failed to load options. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [currentStep, selections, step.attributeType]);

    useEffect(() => { fetchOptions(); }, [fetchOptions]);

    // Validate on review step
    useEffect(() => {
        if (currentStep === 4) {
            ConfiguratorService.validateConfig(selections)
                .then(setValidation)
                .catch(() => {
                    showToast('Failed to validate configuration', 'error');
                });
        }
    }, [currentStep, selections, showToast]);

    const selectOption = (key: string, value: string) => {
        setSelections(prev => ({ ...prev, [key]: value }));
    };

    const canProceed = () => {
        switch (currentStep) {
            case 0: return !!selections.ProductType;
            case 1: return !!selections.Species;
            case 2: return !!selections.Grade;
            case 3: return !!dimensionSize && !!dimensionLength;
            case 4: return validation?.valid === true;
            default: return false;
        }
    };

    const handleNext = () => {
        if (currentStep === 3) {
            // Combine dimension before moving to review
            setSelections(prev => ({ ...prev, Dimensions: `${dimensionSize}-${dimensionLength}` }));
        }
        if (currentStep < CONFIGURATOR_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
            setValidation(null);
            setSkuResult(null);
        }
    };

    const handleBuildSKU = async () => {
        setError(null);
        try {
            const result = await ConfiguratorService.buildSKU(selections.ProductType, selections);
            setSkuResult(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to build SKU';
            setError(message);
        }
    };

    // Render step content
    const renderStepContent = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-[#00FFA3] border-t-transparent rounded-full animate-spin" />
                </div>
            );
        }

        if (error) {
            return (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
                    <AlertTriangle size={24} className="text-red-400 mx-auto mb-2" />
                    <p className="text-red-300 text-sm">{error}</p>
                    <button onClick={fetchOptions} className="mt-3 text-xs text-[#00FFA3] hover:text-white">
                        Retry
                    </button>
                </div>
            );
        }

        switch (currentStep) {
            case 0: return renderOptionGrid('ProductType', availableOptions);
            case 1: return renderOptionGrid('Species', availableOptions);
            case 2: return renderGradeAndTreatment();
            case 3: return renderDimensions();
            case 4: return renderReview();
            default: return null;
        }
    };

    const renderOptionGrid = (key: string, options: AvailableOption[]) => (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {options.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => opt.allowed && selectOption(key, opt.value)}
                    disabled={!opt.allowed}
                    className={`relative p-6 rounded-xl border-2 text-left transition-all duration-300 group ${selections[key] === opt.value
                        ? 'border-[#00FFA3] bg-[#00FFA3]/10 shadow-[0_0_30px_rgba(0,255,163,0.15)]'
                        : opt.allowed
                            ? 'border-white/10 hover:border-white/30 hover:bg-white/5'
                            : 'border-white/5 opacity-40 cursor-not-allowed'
                        }`}
                >
                    {selections[key] === opt.value && (
                        <div className="absolute top-3 right-3">
                            <Check size={16} className="text-[#00FFA3]" />
                        </div>
                    )}
                    <div className="font-semibold text-lg">{opt.value}</div>
                    {!opt.allowed && opt.message && (
                        <div className="text-xs text-red-400 mt-2 flex items-start gap-1">
                            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                            <span>{opt.message}</span>
                        </div>
                    )}
                </button>
            ))}
        </div>
    );

    const renderGradeAndTreatment = () => (
        <div className="space-y-8">
            <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Grade</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {availableOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => opt.allowed && selectOption('Grade', opt.value)}
                            disabled={!opt.allowed}
                            className={`p-4 rounded-xl border-2 text-left transition-all duration-300 ${selections.Grade === opt.value
                                ? 'border-[#00FFA3] bg-[#00FFA3]/10 shadow-[0_0_20px_rgba(0,255,163,0.1)]'
                                : opt.allowed
                                    ? 'border-white/10 hover:border-white/30'
                                    : 'border-white/5 opacity-40 cursor-not-allowed'
                                }`}
                        >
                            <div className="font-medium">{opt.value}</div>
                            {!opt.allowed && opt.message && (
                                <div className="text-xs text-red-400 mt-1">{opt.message}</div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="border-t border-white/10 pt-6">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Treatment</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <button
                        onClick={() => selectOption('Treatment', 'None')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${selections.Treatment === 'None'
                            ? 'border-[#00FFA3] bg-[#00FFA3]/10'
                            : 'border-white/10 hover:border-white/30'
                            }`}
                    >
                        <div className="font-medium">None</div>
                        <div className="text-xs text-gray-500 mt-1">Untreated</div>
                    </button>
                    {treatmentOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => opt.allowed && selectOption('Treatment', opt.value)}
                            disabled={!opt.allowed}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${selections.Treatment === opt.value
                                ? 'border-[#00FFA3] bg-[#00FFA3]/10'
                                : opt.allowed
                                    ? 'border-white/10 hover:border-white/30'
                                    : 'border-white/5 opacity-40 cursor-not-allowed'
                                }`}
                        >
                            <div className="font-medium">{opt.value}</div>
                            {!opt.allowed && (
                                <div className="text-xs text-red-400 mt-1 flex items-center gap-1">
                                    <X size={10} /> Not available
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderDimensions = () => (
        <div className="space-y-8">
            <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Cross Section</h4>
                <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
                    {DIMENSION_OPTIONS.map(dim => (
                        <button
                            key={dim}
                            onClick={() => setDimensionSize(dim)}
                            className={`p-4 rounded-xl border-2 text-center font-mono text-lg transition-all ${dimensionSize === dim
                                ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3] shadow-[0_0_20px_rgba(0,255,163,0.1)]'
                                : 'border-white/10 hover:border-white/30 text-gray-300'
                                }`}
                        >
                            {dim}
                        </button>
                    ))}
                </div>
            </div>

            <div className="border-t border-white/10 pt-6">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Length (feet)</h4>
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                    {LENGTH_OPTIONS.map(len => (
                        <button
                            key={len}
                            onClick={() => setDimensionLength(len)}
                            className={`p-4 rounded-xl border-2 text-center font-mono text-lg transition-all ${dimensionLength === len
                                ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-[#00FFA3]'
                                : 'border-white/10 hover:border-white/30 text-gray-300'
                                }`}
                        >
                            {len}'
                        </button>
                    ))}
                </div>
            </div>

            {dimensionSize && dimensionLength && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#161821] border border-white/10 rounded-xl p-4 text-center"
                >
                    <span className="text-gray-400">Selected: </span>
                    <span className="text-[#00FFA3] font-mono text-xl font-bold">
                        {dimensionSize} × {dimensionLength}'
                    </span>
                </motion.div>
            )}
        </div>
    );

    const renderReview = () => (
        <div className="space-y-6">
            {/* Configuration Summary */}
            <div className="bg-[#161821] border border-white/10 rounded-xl p-6">
                <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Configuration Summary</h4>
                <div className="space-y-3">
                    {Object.entries(selections).map(([key, value]) => value && value !== 'None' && (
                        <div key={key} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                            <span className="text-gray-400">{key}</span>
                            <span className="font-medium text-white">{value}</span>
                        </div>
                    ))}
                    {selections.Treatment === 'None' && (
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-gray-400">Treatment</span>
                            <span className="font-medium text-gray-500">None</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Validation Result */}
            {validation && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`border rounded-xl p-6 ${validation.valid
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : 'bg-red-500/5 border-red-500/30'
                        }`}
                >
                    <div className="flex items-center gap-3 mb-3">
                        {validation.valid ? (
                            <>
                                <Check size={20} className="text-emerald-400" />
                                <span className="font-semibold text-emerald-400">Configuration Valid</span>
                            </>
                        ) : (
                            <>
                                <AlertTriangle size={20} className="text-red-400" />
                                <span className="font-semibold text-red-400">
                                    {validation.conflicts?.length} Conflict{(validation.conflicts?.length || 0) > 1 ? 's' : ''} Found
                                </span>
                            </>
                        )}
                    </div>
                    {validation.conflicts?.map((conflict, i) => (
                        <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-2 text-sm text-red-300">
                            {conflict.message}
                        </div>
                    ))}
                </motion.div>
            )}

            {/* Build SKU Action */}
            {validation?.valid && !skuResult && (
                <button
                    onClick={handleBuildSKU}
                    className="w-full bg-gradient-to-r from-[#00FFA3] to-emerald-400 text-black font-bold py-4 rounded-xl 
                               hover:shadow-[0_0_40px_rgba(0,255,163,0.3)] transition-all duration-300 flex items-center justify-center gap-2"
                >
                    <Sparkles size={20} />
                    Generate Non-Stock SKU
                </button>
            )}

            {/* SKU Result */}
            {skuResult && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-gradient-to-br from-[#00FFA3]/10 to-emerald-500/5 border-2 border-[#00FFA3]/40 rounded-xl p-6"
                >
                    <div className="text-sm text-gray-400 uppercase tracking-wider mb-2">Generated SKU</div>
                    <div className="text-2xl font-mono font-bold text-[#00FFA3] mb-3 tracking-wide">
                        {skuResult.sku}
                    </div>
                    <div className="text-sm text-gray-300">{skuResult.description}</div>
                    <button className="mt-4 bg-[#00FFA3] hover:bg-[#00FFA3]/90 text-black font-bold py-3 px-6 rounded-lg transition-colors">
                        Add to Quote
                    </button>
                </motion.div>
            )}
        </div>
    );

    return (
        <div className="min-h-[calc(100vh-6rem)]">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white">Product Configurator</h1>
                <p className="text-gray-400 mt-1">Configure custom lumber, millwork, and building materials</p>
            </div>

            <div className="flex gap-8">
                {/* Stepper Sidebar */}
                <div className="w-72 shrink-0">
                    <div className="bg-[#161821] border border-white/10 rounded-xl p-6 sticky top-24">
                        <div className="space-y-1">
                            {CONFIGURATOR_STEPS.map((s, index) => {
                                const Icon = STEP_ICONS[index];
                                const isActive = index === currentStep;
                                const isComplete = index < currentStep;
                                const isDisabled = index > currentStep;

                                return (
                                    <button
                                        key={s.key}
                                        onClick={() => index < currentStep && setCurrentStep(index)}
                                        disabled={isDisabled}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left ${isActive
                                            ? 'bg-[#00FFA3]/10 text-[#00FFA3]'
                                            : isComplete
                                                ? 'text-emerald-400 hover:bg-white/5 cursor-pointer'
                                                : 'text-gray-600 cursor-not-allowed'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${isActive
                                            ? 'border-[#00FFA3] bg-[#00FFA3]/20'
                                            : isComplete
                                                ? 'border-emerald-500 bg-emerald-500/20'
                                                : 'border-gray-700 bg-gray-800'
                                            }`}>
                                            {isComplete ? (
                                                <Check size={14} />
                                            ) : (
                                                <Icon size={14} />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">{s.label}</div>
                                            {isActive && (
                                                <div className="text-xs text-gray-500">{s.description}</div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Live Preview */}
                        {(selections.ProductType || selections.Species) && (
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Live Preview</div>
                                <div className="bg-[#0A0B10] rounded-lg p-4 border border-white/5">
                                    <div className="w-full aspect-square relative flex items-center justify-center">
                                        <div
                                            className="border-2 rounded-sm transition-all duration-500"
                                            style={{
                                                width: '80%',
                                                height: '60%',
                                                borderColor: selections.Treatment === 'Treatable' ? '#22c55e' : '#38BDF8',
                                                backgroundColor: getSpeciesColor(selections.Species),
                                            }}
                                        >
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                                                <div className="text-xs text-white/40 font-mono">
                                                    {selections.ProductType || '—'}
                                                </div>
                                                <div className="text-sm text-white/60 font-medium mt-1">
                                                    {selections.Species || '—'}
                                                </div>
                                                {selections.Dimensions && (
                                                    <div className="text-xs text-[#00FFA3] font-mono mt-1">
                                                        {selections.Dimensions}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    <div className="bg-[#161821] border border-white/10 rounded-xl p-8">
                        {/* Step Header */}
                        <div className="mb-8">
                            <div className="text-xs text-[#00FFA3] font-semibold uppercase tracking-wider mb-1">
                                Step {currentStep + 1} of {CONFIGURATOR_STEPS.length}
                            </div>
                            <h2 className="text-2xl font-bold text-white">{step.label}</h2>
                            <p className="text-gray-400 text-sm mt-1">{step.description}</p>
                        </div>

                        {/* Step Content */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                {renderStepContent()}
                            </motion.div>
                        </AnimatePresence>

                        {/* Navigation */}
                        <div className="flex justify-between mt-8 pt-6 border-t border-white/10">
                            <button
                                onClick={handleBack}
                                disabled={currentStep === 0}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${currentStep === 0
                                    ? 'text-gray-600 cursor-not-allowed'
                                    : 'text-gray-300 hover:text-white hover:bg-white/5 border border-white/10'
                                    }`}
                            >
                                <ChevronLeft size={18} />
                                Back
                            </button>

                            {currentStep < CONFIGURATOR_STEPS.length - 1 && (
                                <button
                                    onClick={handleNext}
                                    disabled={!canProceed()}
                                    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${canProceed()
                                        ? 'bg-[#00FFA3] text-black hover:shadow-[0_0_20px_rgba(0,255,163,0.3)]'
                                        : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                        }`}
                                >
                                    Next
                                    <ChevronRight size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

function getSpeciesColor(species: string): string {
    const colors: Record<string, string> = {
        'SYP': 'rgba(184, 134, 61, 0.2)',
        'Douglas Fir': 'rgba(139, 90, 43, 0.2)',
        'Cedar': 'rgba(180, 83, 55, 0.2)',
        'Hem-Fir': 'rgba(160, 120, 70, 0.2)',
        'SPF': 'rgba(200, 180, 140, 0.2)',
    };
    return colors[species] || 'rgba(100, 100, 100, 0.1)';
}
