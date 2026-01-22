// src/store/currency/useCurrencyStore.js
import { create } from 'zustand';

const useCurrencyStore = create((set) => ({
    currency: 'OMR',           // Currency code (e.g., "OMR", "USD", "AED")
    symbol: 'ر.ع.',            // Currency symbol
    position: 'after',         // "before" or "after" the amount
    decimal_places: 3,         // Number of decimal places

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
            currency: currencyData.name || 'OMR',
            symbol: currencyData.symbol || currencyData.name || 'OMR',
            position: currencyData.position || 'after',
            decimal_places: currencyData.decimal_places ?? 3,
        });
    },

    // Helper to format amount with currency
    formatAmount: (amount) => {
        const state = useCurrencyStore.getState();
        const formattedValue = Number(amount || 0).toFixed(state.decimal_places);

        if (state.position === 'before') {
            return `${state.symbol} ${formattedValue}`;
        }
        return `${formattedValue} ${state.currency}`;
    },
}));

export default useCurrencyStore;
