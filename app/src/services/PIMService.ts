import type {
    ProductDetail,
    PIMContent,
    PIMMedia,
    PIMCollateral,
    GenerateDescriptionsRequest,
    GenerateSEORequest,
    GenerateImageRequest,
    GenerateCollateralRequest,
    UpdateContentRequest,
} from '../types/pim';
import { fetchWithAuth } from './fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

export const PIMService = {
    async getProductDetail(id: string): Promise<ProductDetail> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/detail`);
        if (!res.ok) throw new Error('Failed to fetch product detail');
        return res.json();
    },

    async getContent(id: string): Promise<PIMContent> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/content`);
        if (!res.ok) throw new Error('Failed to fetch PIM content');
        return res.json();
    },

    async updateContent(id: string, data: UpdateContentRequest): Promise<PIMContent> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/content`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update PIM content');
        return res.json();
    },

    async generateDescriptions(id: string, data: GenerateDescriptionsRequest): Promise<PIMContent> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/generate/descriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to generate descriptions');
        return res.json();
    },

    async generateSEO(id: string, data: GenerateSEORequest): Promise<PIMContent> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/generate/seo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to generate SEO metadata');
        return res.json();
    },

    async generateImage(id: string, data: GenerateImageRequest): Promise<PIMMedia> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/generate/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || 'Failed to generate image');
        }
        return res.json();
    },

    async generateCollateral(id: string, data: GenerateCollateralRequest): Promise<PIMCollateral> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/generate/collateral`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || 'Failed to generate collateral');
        }
        return res.json();
    },

    async listMedia(id: string): Promise<PIMMedia[]> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/media`);
        if (!res.ok) throw new Error('Failed to fetch media');
        return res.json();
    },

    async deleteMedia(id: string, mediaId: string): Promise<void> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/media/${mediaId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete media');
    },

    async setPrimaryMedia(id: string, mediaId: string): Promise<void> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/media/${mediaId}/primary`, {
            method: 'PATCH',
        });
        if (!res.ok) throw new Error('Failed to set primary media');
    },

    async listCollateral(id: string): Promise<PIMCollateral[]> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/collateral`);
        if (!res.ok) throw new Error('Failed to fetch collateral');
        return res.json();
    },

    async deleteCollateral(id: string, collateralId: string): Promise<void> {
        const res = await fetchWithAuth(`${API_URL}/api/v1/products/${id}/pim/collateral/${collateralId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete collateral');
    },
};
