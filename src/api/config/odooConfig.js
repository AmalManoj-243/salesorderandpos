// src/api/odooConfig.js

// 🔹 Put your Odoo server URL here ONE time
// Current test server
const ODOO_BASE_URL = "http://115.246.240.218:9169/";

// Default DB to use for Odoo JSON-RPC login (change to your test DB)
const DEFAULT_ODOO_DB = "sale_order_and_pos";


// Named export for default base URL for backward compatibility
const DEFAULT_ODOO_BASE_URL = ODOO_BASE_URL;

export { DEFAULT_ODOO_DB, DEFAULT_ODOO_BASE_URL };
export default ODOO_BASE_URL;
