import type {
    Vehicle, Driver, Route, Delivery, CapacityWarning,
    CreateVehicleRequest, UpdateVehicleRequest,
    CreateDriverRequest, UpdateDriverRequest,
    CreateRouteRequest,
    AssignOrderRequest, UpdateDeliveryStatusRequest
} from '../types/delivery';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const deliveryService = {
    // Fleet
    listVehicles: async (): Promise<Vehicle[]> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/vehicles`);
        if (!res.ok) throw new Error('Failed to fetch vehicles');
        return res.json();
    },

    createVehicle: async (req: CreateVehicleRequest): Promise<Vehicle> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/vehicles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to create vehicle');
        return res.json();
    },

    getVehicle: async (id: string): Promise<Vehicle> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/vehicles/${id}`);
        if (!res.ok) throw new Error('Failed to fetch vehicle');
        return res.json();
    },

    updateVehicle: async (id: string, req: UpdateVehicleRequest): Promise<Vehicle> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/vehicles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to update vehicle');
        return res.json();
    },

    deleteVehicle: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/vehicles/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete vehicle');
    },

    listDrivers: async (): Promise<Driver[]> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/drivers`);
        if (!res.ok) throw new Error('Failed to fetch drivers');
        return res.json();
    },

    createDriver: async (req: CreateDriverRequest): Promise<Driver> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/drivers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to create driver');
        return res.json();
    },

    getDriver: async (id: string): Promise<Driver> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/drivers/${id}`);
        if (!res.ok) throw new Error('Failed to fetch driver');
        return res.json();
    },

    updateDriver: async (id: string, req: UpdateDriverRequest): Promise<Driver> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/drivers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to update driver');
        return res.json();
    },

    deleteDriver: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/drivers/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete driver');
    },

    // Routes
    listRoutes: async (date?: string, driverId?: string): Promise<Route[]> => {
        const params = new URLSearchParams();
        if (date) params.append('date', date);
        if (driverId) params.append('driver_id', driverId);

        const res = await fetch(`${API_BASE}/api/v1/delivery/routes?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch routes');
        return res.json();
    },

    createRoute: async (req: CreateRouteRequest): Promise<Route> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to create route');
        return res.json();
    },

    reorderStops: async (routeId: string, orderedDeliveryIds: string[]): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/routes/${routeId}/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ordered_delivery_ids: orderedDeliveryIds })
        });
        if (!res.ok) throw new Error('Failed to reorder stops');
    },

    dispatchRoute: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/routes/${id}/dispatch`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error('Failed to dispatch route');
    },

    completeRoute: async (id: string): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/routes/${id}/complete`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error('Failed to complete route');
    },

    // Deliveries
    listDeliveries: async (routeId: string): Promise<Delivery[]> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/routes/${routeId}/deliveries`);
        if (!res.ok) throw new Error('Failed to fetch deliveries');
        return res.json();
    },

    getDelivery: async (id: string): Promise<Delivery> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/deliveries/${id}`);
        if (!res.ok) throw new Error('Failed to fetch delivery');
        return res.json();
    },

    assignOrder: async (req: AssignOrderRequest): Promise<{ delivery: Delivery; capacity_warning?: CapacityWarning }> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/deliveries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to assign order');
        return res.json();
    },

    uploadVehiclePhoto: async (id: string, file: File): Promise<string> => {
        const form = new FormData();
        form.append('photo', file);
        const res = await fetch(`${API_BASE}/api/v1/delivery/vehicles/${id}/photo`, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) throw new Error('Failed to upload vehicle photo');
        const data = await res.json();
        return data.photo_url;
    },

    uploadDriverPhoto: async (id: string, file: File): Promise<string> => {
        const form = new FormData();
        form.append('photo', file);
        const res = await fetch(`${API_BASE}/api/v1/delivery/drivers/${id}/photo`, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) throw new Error('Failed to upload driver photo');
        const data = await res.json();
        return data.photo_url;
    },

    updateStatus: async (id: string, req: UpdateDeliveryStatusRequest): Promise<void> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/deliveries/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new Error('Failed to update delivery status');
    },

    uploadPODPhoto: async (deliveryId: string, file: File, photoType: string = 'site'): Promise<{ id: string; photo_url: string }> => {
        const form = new FormData();
        form.append('photo', file);
        form.append('photo_type', photoType);
        const res = await fetch(`${API_BASE}/api/v1/delivery/deliveries/${deliveryId}/pod-photo`, {
            method: 'POST',
            body: form,
        });
        if (!res.ok) throw new Error('Failed to upload POD photo');
        return res.json();
    },

    getPODPhotos: async (deliveryId: string): Promise<{ id: string; photo_url: string; photo_type: string; uploaded_at: string }[]> => {
        const res = await fetch(`${API_BASE}/api/v1/delivery/deliveries/${deliveryId}/pod-photos`);
        if (!res.ok) throw new Error('Failed to fetch POD photos');
        return res.json();
    },
};
