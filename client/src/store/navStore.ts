import { create } from 'zustand';
import type { NavGroup, NavItem } from '../types';
import api from '../api/axios';

interface NavState {
  groups: NavGroup[];
  loading: boolean;
  error: string | null;
  maintenance: boolean;
  maintenanceNotice: string | null;
  topItems: NavItem[];
  topLoaded: boolean;
  fetchPublic: () => Promise<void>;
  fetchPrivate: () => Promise<void>;
  fetchAdmin: () => Promise<void>;
  fetchMyNav: () => Promise<void>;
  fetchTop: (limit?: number) => Promise<void>;
  clear: () => void;
  recordClick: (itemId: number) => Promise<void>;
}

export const useNavStore = create<NavState>((set) => ({
  groups: [],
  loading: false,
  error: null,
  maintenance: false,
  maintenanceNotice: null,
  topItems: [],
  topLoaded: false,

  fetchPublic: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/public/nav');
      set({ groups: data, maintenance: false, maintenanceNotice: null });
    } catch (error: any) {
      const msg = error?.response?.data?.error || '获取公共导航失败';
      const maintenance = error?.response?.status === 503;
      set({
        error: msg,
        maintenance,
        maintenanceNotice: maintenance ? msg : null,
        groups: [],
      });
    } finally {
      set({ loading: false });
    }
  },

  fetchPrivate: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/private/nav');
      set({ groups: data });
    } catch (error: any) {
      const msg = error?.response?.data?.error || '获取私有导航失败';
      set({ error: msg, groups: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchAdmin: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/admin/nav');
      set({ groups: data });
    } catch (error: any) {
      const msg = error?.response?.data?.error || '获取管理导航失败';
      set({ error: msg, groups: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchMyNav: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/private/nav');
      set({ groups: data });
    } catch (error: any) {
      const msg = error?.response?.data?.error || '获取我的导航失败';
      set({ error: msg, groups: [] });
    } finally {
      set({ loading: false });
    }
  },

  fetchTop: async (limit = 10) => {
    try {
      const { data } = await api.get('/nav/top', { params: { limit } });
      set({ topItems: data, topLoaded: true });
    } catch (error) {
      console.error('[NavStore] Failed to fetch top items:', error);
      set({ topItems: [], topLoaded: true });
    }
  },

  clear: () => {
    set({
      groups: [],
      loading: false,
      error: null,
      topItems: [],
      topLoaded: false,
    });
  },

  recordClick: async (itemId: number) => {
    try {
      await api.post(`/nav/item/${itemId}/click`);
    } catch (error) {
      console.error('[NavStore] Failed to record click:', error);
    }
  },
}));