// src/store/currency/useCurrencyStore.js
import { create } from 'zustand';

const useCurrencyStore = create((set, get) => ({
    currency: 'INR',           // Currency code (e.g., "OMR", "USD", "INR")
    symbol: '₹',               // Currency symbol
    position: 'before',        // "before" or "after" the amount
    decimal_places: 2,         // Number of decimal places

    // Legacy method for package-based currency (kept for backward compatibility)
    setCurrency: (packageName) => {
        let newCurrency = 'AED';

        if (packageName === process.env.EXPO_PUBLIC_PACKAGE_NAME_OMAN) {
            newCurrency = 'OMR';
        }

        set({ currency: newCurrency });
    },

    // New method to set currency from Odoo data
    setCurrencyFromOdoo: (currencyData) => {
        if (!currencyData) return;

        set({
            currency: currencyData.name || 'INR',
            symbol: currencyData.symbol || currencyData.name || '₹',
            position: currencyData.position || 'before',
            decimal_places: currencyData.decimal_places ?? 2,
        });
    },

    // Helper to format amount with currency symbol
    formatAmount: (amount) => {
        const state = get();
        const formattedValue = Number(amount || 0).toFixed(state.decimal_places);

        if (state.position === 'before') {
            return `${state.symbol}${formattedValue}`;
        }
        return `${formattedValue} ${state.symbol}`;
    },

    // Helper to get just the formatted number (without symbol)
    formatNumber: (amount) => {
        const state = get();
        return Number(amount || 0).toFixed(state.decimal_places);
    },
}));

export default useCurrencyStore;
