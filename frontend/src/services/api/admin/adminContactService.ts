import api from '../config';

export interface Inquiry {
  _id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  status?: 'Pending' | 'Replied';
  repliedAt?: string;
  replySubject?: string;
  replyMessage?: string;
  createdAt: string;
}

export interface GetInquiriesParams {
  search?: string;
  status?: string;
}

export const getInquiries = async (params?: GetInquiriesParams) => {
  const response = await api.get('/admin/contact-inquiries', { params });
  return response.data;
};

export const replyToInquiry = async (data: {
  inquiryId?: string;
  email: string;
  subject: string;
  message: string;
}) => {
  const response = await api.post('/admin/contact-inquiries/reply', data);
  return response.data;
};

export const deleteInquiry = async (id: string) => {
  const response = await api.delete(`/admin/contact-inquiries/${id}`);
  return response.data;
};
