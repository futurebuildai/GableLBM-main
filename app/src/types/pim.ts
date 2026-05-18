import type { Product } from './product';

export interface PIMContent {
    id: string;
    product_id: string;
    short_description: string;
    long_description: string;
    marketing_copy: string;
    attributes: Record<string, string>;
    seo_title: string;
    seo_description: string;
    seo_keywords: string[];
    seo_slug: string;
    last_gen_model: string;
    last_gen_prompt: string;
    last_gen_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PIMMedia {
    id: string;
    product_id: string;
    media_type: 'hero' | 'lifestyle' | 'technical' | 'swatch';
    url: string;
    alt_text: string;
    sort_order: number;
    is_primary: boolean;
    gen_model: string;
    gen_prompt: string;
    gen_style: string;
    generated_at: string | null;
    created_at: string;
    updated_at: string;
}

export type CollateralType = 'sell_sheet' | 'facebook' | 'instagram' | 'linkedin' | 'email_blast';

export interface PIMCollateral {
    id: string;
    product_id: string;
    collateral_type: CollateralType;
    title: string;
    content: string;
    tone: string;
    audience: string;
    gen_model: string;
    gen_prompt: string;
    generated_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProductDetail extends Product {
    content: PIMContent | null;
    media: PIMMedia[];
    collateral: PIMCollateral[];
}

export interface GenerateDescriptionsRequest {
    tone: string;
    audience: string;
}

export interface GenerateSEORequest {
    target_keywords: string[];
}

export interface GenerateImageRequest {
    style: string;
    prompt: string;
}

export interface GenerateCollateralRequest {
    type: CollateralType;
    tone: string;
    audience: string;
}

export interface UpdateContentRequest {
    short_description?: string;
    long_description?: string;
    marketing_copy?: string;
    attributes?: Record<string, string>;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string[];
    seo_slug?: string;
}
