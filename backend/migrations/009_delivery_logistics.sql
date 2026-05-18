-- Migration: 009_delivery_logistics
-- Description: Add tables for vehicles, drivers, routes, and deliveries.

-- Vehicles: Digital twin of the fleet
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL, -- e.g. "Truck 1", "Flatbed A"
    vehicle_type VARCHAR(50) NOT NULL, -- e.g. "Box Truck", "Flatbed", "Pickup"
    license_plate VARCHAR(20) NOT NULL,
    capacity_weight_lbs INTEGER, -- Optional for MVP
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

-- Drivers: Staff members who can drive
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, ON_LEAVE
    phone_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Delivery Routes: A single "Run" or "Manifest" for a day
CREATE TABLE delivery_routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID REFERENCES drivers(id),
    scheduled_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT', -- DRAFT, SCHEDULED, IN_TRANSIT, COMPLETED, CANCELLED
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deliveries: A stop on a route, fulfilling a Sales Order
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    route_id UUID REFERENCES delivery_routes(id),
    order_id UUID REFERENCES orders(id),
    stop_sequence INTEGER NOT NULL DEFAULT 0, -- Order of stops
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, OUT_FOR_DELIVERY, DELIVERED, FAILED, PARTIAL
    
    -- POD Data
    pod_proof_url TEXT, -- URL to signature or photo
    pod_signed_by VARCHAR(255),
    pod_timestamp TIMESTAMP WITH TIME ZONE,
    
    delivery_instructions TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_delivery_routes_date ON delivery_routes(scheduled_date);
CREATE INDEX idx_deliveries_route_id ON deliveries(route_id);
CREATE INDEX idx_deliveries_order_id ON deliveries(order_id);
