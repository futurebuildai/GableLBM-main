export interface Project {
    id: string;
    customer_id: string;
    name: string;
    status: string; // Active | Completed
    created_at: string;
    updated_at: string;
}

export interface ProjectItem {
    id: string;
    type: string; // ORDER | DELIVERY | INVOICE
    status: string;
    total_amount?: number;
    created_at: string;
    reference?: string;
}

export interface ProjectDashboardDTO {
    project: Project;
    orders: ProjectItem[];
    deliveries: ProjectItem[];
    invoices: ProjectItem[];
}

export interface CreateProjectRequest {
    name: string;
}

export interface UpdateProjectRequest {
    name?: string;
    status?: string;
}
