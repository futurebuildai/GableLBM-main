export interface ConfiguratorRule {
    id: string;
    attribute_type: string;
    attribute_value: string;
    depends_on_type: string;
    depends_on_value: string;
    is_allowed: boolean;
    error_message?: string;
    created_at: string;
    updated_at: string;
}

export interface ValidationConflict {
    attribute_type: string;
    attribute_value: string;
    depends_on_type: string;
    depends_on_value: string;
    message: string;
}

export interface ValidateConfigResponse {
    valid: boolean;
    conflicts?: ValidationConflict[];
}

export interface BuildSKUResponse {
    sku: string;
    description: string;
}

export interface AvailableOption {
    value: string;
    allowed: boolean;
    message?: string;
}

export interface ConfiguratorPreset {
    id: string;
    name: string;
    description?: string;
    product_type: string;
    config: Record<string, string>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface BlueprintScanResponse {
    extracted_dimensions: Record<string, string>;
    mismatches: Mismatch[];
    summary: string;
}

export interface Mismatch {
    field: string;
    blueprint_value: string;
    config_value: string;
    severity: 'warning' | 'error';
    message: string;
}

// Wizard step definitions
export interface ConfigStep {
    key: string;
    label: string;
    attributeType: string;
    description: string;
}

export const CONFIGURATOR_STEPS: ConfigStep[] = [
    { key: 'product_type', label: 'Product Type', attributeType: 'ProductType', description: 'Select the product category' },
    { key: 'species', label: 'Species', attributeType: 'Species', description: 'Choose wood species' },
    { key: 'grade', label: 'Grade & Treatment', attributeType: 'Grade', description: 'Select grade and treatment options' },
    { key: 'dimensions', label: 'Dimensions', attributeType: 'Dimensions', description: 'Specify dimensions' },
    { key: 'review', label: 'Review & Build', attributeType: '', description: 'Review and generate SKU' },
];
