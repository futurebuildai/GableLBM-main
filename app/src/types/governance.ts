export type RFCStatus = 'draft' | 'review' | 'approved' | 'rejected';

export interface RFC {
    id: string;
    title: string;
    status: RFCStatus;
    problem_statement: string;
    proposed_solution: string;
    content: string;
    author_id?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateRFCInput {
    title: string;
    problem_statement: string;
    proposed_solution: string;
}

export interface UpdateRFCInput {
    title?: string;
    status?: RFCStatus;
    problem_statement?: string;
    proposed_solution?: string;
    content?: string;
}
