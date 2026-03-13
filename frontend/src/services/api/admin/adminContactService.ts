import api from '../config';

export interface Inquiry {
  _id: string;
  name: string;
  email: string;
  subject?: string;
  message: string;
  createdAt: string;
}

export const getInquiries = async () => {
  const response = await api.get('/admin/contact-inquiries');
  return response.data;
};

export const replyToInquiry = async (data: { email: string; subject: string; message: string }) => {
  const response = await api.post('/admin/contact-inquiries/reply', data);
  return response.data;
};
