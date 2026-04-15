import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const onScanRef = useRef(onScan);
    const [error, setError] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => { onScanRef.current = onScan; }, [onScan]);

    useEffect(() => {
        // Prevent multiple initializations in dev strict mode
        if (scannerRef.current) return;

        // Use a unique ID for the container
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
        };

        const scanner = new Html5QrcodeScanner("reader-container", config, false);
        scannerRef.current = scanner;

        try {
            scanner.render(
                (decodedText) => {
                    // Success callback
                    if (scannerRef.current) {
                        try {
                            scannerRef.current.clear();
                        } catch (e) {
                            console.error("Failed to clear scanner", e);
                        }
                    }
                    onScanRef.current(decodedText);
                },
                (_) => {
                    // Error callback (called very frequently on no match, so don't set to UI state unless critical)
                    // console.log("Scan error", errorMessage);
                }
            );
            setIsScanning(true);
        } catch (err: unknown) {
            console.error("Scanner initialization failed", err);
            setError(err instanceof Error ? err.message : "Failed to access camera. Please check permissions.");
        }

        return () => {
            if (scannerRef.current) {
                try {
                    scannerRef.current.clear().catch(e => console.error("Failed to clear on unmount", e));
                } catch (e) {
                    // Ignore clear errors on unmount
                }
            }
        };
    }, []);

    const handleContainerClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={handleContainerClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="barcode-scanner-title"
        >
            <div className="bg-[#12131A] border border-white/10 rounded-xl overflow-hidden w-full max-w-md shadow-2xl flex flex-col relative animate-scale-up">

                {/* Header */}
                <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-[#0A0B10]">
                    <h3 id="barcode-scanner-title" className="text-white font-medium">Scan Barcode</h3>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                        aria-label="Close barcode scanner"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 bg-black/40 min-h-[300px] flex items-center justify-center">
                    {error ? (
                        <div className="text-center p-4 text-rose-400 bg-rose-500/10 rounded-lg border border-rose-500/20">
                            <p className="mb-2">{error}</p>
                            <button
                                onClick={onClose}
                                className="text-sm border border-rose-500/50 px-3 py-1 rounded mt-2 hover:bg-rose-500/20 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <div className="w-full relative">
                            {/* The DOM element required by html5-qrcode */}
                            <div id="reader-container" className="w-full overflow-hidden rounded-lg bg-black border border-white/10 [&>div]:!border-none [&>div>video]:!rounded-lg [&_button]:!bg-[#00FFA3] [&_button]:!text-black [&_button]:!border-none [&_button]:!rounded [&_button]:!px-3 [&_button]:!py-1.5 [&_button]:!font-medium [&_button]:!text-sm hover:[&_button]:!bg-[#00E593] [&_select]:!bg-[#12131A] [&_select]:!text-white [&_select]:!border-white/20 [&_select]:!rounded [&_select]:!px-2 [&_select]:!py-1 [&_select]:!text-sm [&_a]:hidden pb-2" />

                            {isScanning && (
                                <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-[#00FFA3] font-mono border border-[#00FFA3]/20">
                                    <span className="w-2 h-2 rounded-full bg-[#00FFA3] animate-pulse" />
                                    Scanning
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-3 bg-[#0A0B10] border-t border-white/10 text-center">
                    <p className="text-xs text-zinc-400">Position the barcode or QR code inside the frame</p>
                </div>

            </div>
        </div>
    );
}
