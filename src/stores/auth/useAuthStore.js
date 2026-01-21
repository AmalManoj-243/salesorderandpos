// stores/auth/login
import { create } from 'zustand';
import { fetchUserApiToken } from '@api/services/generalApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useAuthStore = create((set) => ({
    isLoggedIn: false,
    user: null,
    // login: accepts a user object (from Odoo or admin) and enriches it with API token(s)
    login: async (userData) => {
        try {
            // Store basic user info from the Odoo login response only.
            set({ isLoggedIn: true, user: userData });
            const enrichedUser = { ...userData };
            set({ user: enrichedUser });
            try { await AsyncStorage.setItem('userData', JSON.stringify(enrichedUser)); } catch (e) { console.warn('Failed to persist userData', e); }
        } catch (err) {
            console.error('useAuthStore.login error:', err);
            set((state) => ({ user: { ...(state.user || {}) } }));
        }
    },
    logout: () => set({ isLoggedIn: false, user: null }),
}));

export default useAuthStore;
