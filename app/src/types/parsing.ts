/** Types for AI Material List parsing */

export interface MatchedProduct {
    product_id: string;
    sku: string;
    description: string;
    uom: string;
    base_price: number;
}

export interface ParsedItem {
    raw_text: string;
    matched_product: MatchedProduct | null;
    quantity: number;
    uom: string;
    confidence: number;
    is_special_order: boolean;
    alternatives: MatchedProduct[];
}

export interface ParseResponse {
    items: ParsedItem[];
    source_image: string;
    parse_time_ms: number;
    item_count: number;
}
