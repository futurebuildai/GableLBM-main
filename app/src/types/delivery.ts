export type VehicleType = 'BOX_TRUCK' | 'FLATBED' | 'PICKUP' | 'VAN' | 'CRANE';
export type DriverStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
export type RouteStatus = 'DRAFT' | 'SCHEDULED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
export type DeliveryStatus = 'PENDING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'PARTIAL';

export interface Vehicle {
    id: string;
    name: string;
    vehicle_type: VehicleType;
    license_plate: string;
    capacity_weight_lbs?: number;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    insurance_expiry?: string;
    next_service_date?: string;
    odometer_miles?: number;
    notes?: string;
    photo_url?: string;
    created_at: string;
    updated_at: string;
}

export interface Driver {
    id: string;
    name: string;
    license_number?: string;
    status: DriverStatus;
    phone_number?: string;
    cdl_class?: string;
    cdl_expiry?: string;
    hire_date?: string;
    email?: string;
    photo_url?: string;
    created_at: string;
    updated_at: string;
}

export interface Route {
    id: string;
    vehicle_id: string;
    driver_id: string;
    scheduled_date: string; // YYYY-MM-DD
    status: RouteStatus;
    notes?: string;
    total_duration_mins?: number;
    total_distance_miles?: number;
    created_at: string;
    updated_at: string;

    // Joined
    vehicle_name?: string;
    driver_name?: string;
    stop_count: number;

    // True when AI_LM pushed a 3D packing manifest with this route (powers the
    // yard "Pack Trucks" instructions).
    has_manifest?: boolean;
}

// --- AI_LM packing manifest (stored verbatim on delivery_routes.load_manifest) ---

export interface PackStep {
    step: number;
    item_id: string;
    sku: string;
    order_id?: string;
    stop_sequence?: number;
    x: number;
    y: number;
    z: number;
    length_in: number;
    width_in: number;
    height_in: number;
    weight_lbs: number;
    axle_group: number;
}

export interface ManifestStop {
    order_id: string;
    sequence: number;
    customer_name?: string;
    address?: string;
    weight_lbs: number;
    piece_count: number;
}

export interface ManifestStrap {
    number: number;
    position_in: number;
    over_height_in: number;
    required_wll_lbs: number;
}

export interface ManifestSecurement {
    cargo_weight_lbs: number;
    min_aggregate_wll_lbs: number;
    straps: ManifestStrap[];
    recommended_strap: string;
    notes: string[];
}

export interface LoadManifest {
    version: number;
    plan_date: string;
    vehicle_id: string;
    vehicle_name: string;
    driver_name?: string;
    bed?: { length_in: number; width_in: number; height_in: number };
    total_weight_lbs: number;
    gvw_status: 'PASS' | 'WARN' | 'FAIL';
    max_load_height_in: number;
    axle_loads: { axle_number: number; weight_lbs: number; max_weight_lbs: number; utilization: number; status: string }[];
    stops: ManifestStop[];
    steps: PackStep[];
    sku_names?: Record<string, string>;
    securement?: ManifestSecurement | null;
}

export interface RouteManifest {
    route: Route;
    deliveries: Delivery[];
    manifest: LoadManifest | null;
}

export interface Delivery {
    id: string;
    route_id: string;
    order_id: string;
    stop_sequence: number;
    status: DeliveryStatus;

    // POD
    pod_proof_url?: string;
    pod_signed_by?: string;
    pod_timestamp?: string;
    signature_data_url?: string;

    delivery_instructions?: string;

    created_at: string;
    updated_at: string;

    // Joined
    customer_name?: string;
    order_number?: string;
    address?: string;
    latitude?: number;
    longitude?: number;

    // ETA (from route optimization)
    estimated_arrival?: string;

    // Multi-photo POD
    pod_photos?: { id: string; photo_url: string; photo_type: string; uploaded_at: string }[];
}

export interface CreateVehicleRequest {
    name: string;
    vehicle_type: VehicleType;
    license_plate: string;
    capacity_weight_lbs?: number;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    insurance_expiry?: string;
    next_service_date?: string;
    odometer_miles?: number;
    notes?: string;
}

export interface UpdateVehicleRequest {
    name: string;
    vehicle_type: VehicleType;
    license_plate: string;
    capacity_weight_lbs?: number;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    insurance_expiry?: string;
    next_service_date?: string;
    odometer_miles?: number;
    notes?: string;
}

export interface CreateDriverRequest {
    name: string;
    license_number?: string;
    phone_number?: string;
    cdl_class?: string;
    cdl_expiry?: string;
    hire_date?: string;
    email?: string;
}

export interface UpdateDriverRequest {
    name: string;
    license_number?: string;
    phone_number?: string;
    status: DriverStatus;
    cdl_class?: string;
    cdl_expiry?: string;
    hire_date?: string;
    email?: string;
}

export interface CreateRouteRequest {
    vehicle_id: string;
    driver_id: string;
    scheduled_date: string;
    notes?: string;
}

export interface AssignOrderRequest {
    route_id: string;
    order_id: string;
    stop_sequence: number;
    delivery_instructions?: string;
}

export interface UpdateDeliveryStatusRequest {
    status: DeliveryStatus;
    pod_proof_url?: string;
    pod_signed_by?: string;
    signature_data_url?: string;
}

export interface CapacityWarning {
    vehicle_capacity_lbs: number;
    current_load_lbs: number;
    order_weight_lbs: number;
    total_after_lbs: number;
}
