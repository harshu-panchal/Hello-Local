import api from './config';

export interface HeaderCategory {
    _id: string; // MongoDB ID
    id?: string; // For backward compatibility if needed
    name: string;
    iconLibrary: string; // 'IonIcons' | 'MaterialIcons' | 'FontAwesome' | 'Feather'
    iconName: string;
    slug: string; // URL-safe unique identifier (generated from name)
    theme?: string; // Color theme key (e.g. 'grocery', 'beauty'). Falls back to slug for old records.
    relatedCategory?: string;
    status: 'Published' | 'Unpublished';
    order?: number;
}

export const getHeaderCategoriesPublic = async (skipLoader = false): Promise<HeaderCategory[]> => {
    const response = await api.get<HeaderCategory[]>('/header-categories', {
        skipLoader
    } as any);
    return response.data;
};

export const getHeaderCategoriesAdmin = async (params?: {
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    pagination?: boolean;
}): Promise<HeaderCategory[]> => {
    const response = await api.get<HeaderCategory[] | { success: boolean; data: HeaderCategory[]; pagination?: any }>('/header-categories/admin', { params });
    if (response.data && typeof response.data === 'object' && 'data' in response.data && Array.isArray((response.data as any).data)) {
        return (response.data as any).data;
    }
    return (response.data || []) as HeaderCategory[];
};

export const createHeaderCategory = async (data: Partial<HeaderCategory>): Promise<HeaderCategory> => {
    const response = await api.post<HeaderCategory>('/header-categories', data);
    return response.data;
};

export const updateHeaderCategory = async (id: string, data: Partial<HeaderCategory>): Promise<HeaderCategory> => {
    const response = await api.put<HeaderCategory>(`/header-categories/${id}`, data);
    return response.data;
};

export const deleteHeaderCategory = async (id: string): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/header-categories/${id}`);
    return response.data;
};
