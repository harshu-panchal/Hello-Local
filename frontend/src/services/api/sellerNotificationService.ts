import api from './config';

export interface SellerNotificationItem {
  _id: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export const getSellerNotifications = async (): Promise<{
  success: boolean;
  data: { notifications: SellerNotificationItem[]; unreadCount: number };
}> => {
  const res = await api.get('/auth/seller/notifications');
  return res.data;
};

export const markNotificationRead = async (id: string) => {
  const res = await api.patch(`/auth/seller/notifications/${id}/read`);
  return res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.patch('/auth/seller/notifications/read-all');
  return res.data;
};
