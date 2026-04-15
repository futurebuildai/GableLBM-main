import { Dialog } from "@headlessui/react";
import { X, Keyboard } from "lucide-react";

export const ShortcutsModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />

            <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-slate-steel border border-white/10 p-6 text-left shadow-xl transition-all">
                    <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                        <Dialog.Title as="h3" className="text-xl font-bold font-mono text-white flex items-center gap-2">
                            <Keyboard className="text-gable-green" /> Keyboard Shortcuts
                        </Dialog.Title>
                        <button
                            onClick={onClose}
                            aria-label="Close shortcuts"
                            className="text-zinc-400 hover:text-white transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-sm font-bold text-gable-green uppercase tracking-wider mb-4">Global</h4>
                            <div className="space-y-3">
                                <ShortcutItem keys={["⌘", "K"]} description="Open Omnibar (Search)" />
                                <ShortcutItem keys={["?"]} description="Show Shortcuts" />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-gable-green uppercase tracking-wider mb-4">Navigation</h4>
                            <div className="space-y-3">
                                <ShortcutItem keys={["G", "D"]} description="Go to Dashboard" />
                                <ShortcutItem keys={["G", "I"]} description="Go to Inventory" />
                                <ShortcutItem keys={["G", "O"]} description="Go to Orders" />
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-gable-green uppercase tracking-wider mb-4">Quote Builder</h4>
                            <div className="space-y-3">
                                <ShortcutItem keys={["Enter"]} description="Add Item" />
                                <ShortcutItem keys={["⌘", "S"]} description="Save Quote" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-white/10 text-center text-zinc-500 text-xs">
                        Pro Tip: Keep your hands on the keyboard for maximum speed.
                    </div>
                </Dialog.Panel>
            </div>
        </Dialog>
    );
};

const ShortcutItem = ({ keys, description }: { keys: string[]; description: string }) => {
    return (
        <div className="flex items-center justify-between group">
            <span className="text-zinc-300 text-sm group-hover:text-white transition-colors">{description}</span>
            <div className="flex items-center gap-1">
                {keys.map((k, i) => (
                    <div key={i} className="flex items-center">
                        <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-white min-w-[24px] text-center">
                            {k}
                        </kbd>
                        {i < keys.length - 1 && <span className="text-zinc-600 mx-1">+</span>}
                    </div>
                ))}
            </div>
        </div>
    );
};
