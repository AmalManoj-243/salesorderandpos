// Full workflow: create invoice, post, pay, and log status
export const processInvoiceWithPaymentOdoo = async ({ partnerId, products = [], journalId, invoiceDate = null, reference = '', paymentAmount = null } = {}) => {
  try {
    console.log('[PROCESS] Starting processInvoiceWithPaymentOdoo with params:', { partnerId, products, journalId, invoiceDate, reference, paymentAmount });

    // Step 0: If journalId is not provided, fetch and select sales journal
    let finalJournalId = journalId;
    if (!finalJournalId) {
      const journals = await fetchPaymentJournalsOdoo();
      const salesJournal = journals.find(j => j.type === 'sale');
      if (!salesJournal) throw new Error('No sales journal found in Odoo.');
      finalJournalId = salesJournal.id;
      console.log('[PROCESS] Auto-selected sales journal:', salesJournal);
    }

    // Step 1: Create and post invoice
    const invoiceResult = await createInvoiceOdoo({ partnerId, products, journalId: finalJournalId, invoiceDate, reference });
    console.log('[PROCESS] Invoice creation result:', invoiceResult);
    if (!invoiceResult.id) {
      throw new Error('Invoice creation failed');
    }
    if (invoiceResult.posted) {
      console.log('[PROCESS] Invoice is posted (ready for payment).');
    } else {
      throw new Error('Invoice was created but not posted. Cannot proceed with payment.');
    }

    // Step 2: Register payment for invoice
    let amount = paymentAmount;
    if (amount === null) {
      amount = products.reduce((sum, p) => sum + (p.price || p.price_unit || p.list_price || 0) * (p.quantity || p.qty || 1), 0);
    }

    const paymentResult = await createAccountPaymentOdoo({ partnerId, journalId: finalJournalId, amount, invoiceId: invoiceResult.id });
    console.log('[PROCESS] Payment creation result:', paymentResult);

    if (!paymentResult.result) {
      throw new Error('Payment creation failed');
    }

    // Step 3: Post the payment
    const paymentId = paymentResult.result;
    const postPaymentResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.payment',
          method: 'action_post',
          args: [[paymentId]],
          kwargs: {},
        },
        id: new Date().getTime(),
      }),
    });
    const postPaymentResult = await postPaymentResponse.json();
    console.log('[PROCESS] Payment post result:', postPaymentResult);

    // Step 4: Verify payment reconciliation
    const paymentStatusResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.payment',
          method: 'search_read',
          args: [[['id', '=', paymentId]]],
          kwargs: { fields: ['id', 'reconciled', 'state', 'invoice_ids'] },
        },
        id: new Date().getTime(),
      }),
    });
    const paymentStatus = await paymentStatusResponse.json();
    const paymentDetails = paymentStatus.result?.[0];
    console.log('[PROCESS] Payment details after posting:', paymentDetails);

    if (!paymentDetails.reconciled) {
      console.warn('[PROCESS] Payment is not reconciled. Attempting manual reconciliation.');
      const reconcileResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.payment',
            method: 'reconcile',
            args: [[paymentId]],
            kwargs: {},
          },
          id: new Date().getTime(),
        }),
      });
      const reconcileResult = await reconcileResponse.json();
      console.log('[PROCESS] Manual reconciliation result:', reconcileResult);
    }

    // Step 5: Verify invoice status
    const invoiceStatusResponse = await fetch('http://103.42.198.95:8969/web/dataset/call_kw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'account.move',
          method: 'search_read',
          args: [[['id', '=', invoiceResult.id]]],
          kwargs: { fields: ['id', 'payment_state', 'amount_residual'] },
        },
        id: new Date().getTime(),
      }),
    });
    const invoiceStatus = await invoiceStatusResponse.json();
    const updatedInvoice = invoiceStatus.result?.[0];

    if (updatedInvoice.payment_state === 'paid' && updatedInvoice.amount_residual === 0) {
      console.log('[PROCESS] Invoice payment successfully linked and marked as paid.');
    } else {
      throw new Error('[PROCESS] Invoice payment not fully processed. Check payment state or residual amount.');
    }

    return { invoiceResult, paymentResult, invoiceStatus: updatedInvoice };
  } catch (error) {
    console.error('[PROCESS] processInvoiceWithPaymentOdoo error:', error);
    return { error };
  }
};
// Validate POS order in Odoo to trigger name generation
// Update POS order fields (like amount_paid, state)
export const updatePosOrderOdoo = async (orderId, values) => {
  try {
    console.log(`📝 Updating POS order ${orderId} with:`, values);
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], values],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo update pos.order error:', response.data.error);
      return { error: response.data.error };
    }
    console.log('✅ Order updated successfully');
    return { result: response.data.result };
  } catch (error) {
    console.error('updatePosOrderOdoo error:', error);
    return { error };
  }
};

export const validatePosOrderOdoo = async (orderId) => {
  try {
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'action_pos_order_paid',
        args: [[orderId]],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo validate pos.order error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('validatePosOrderOdoo error:', error);
    return { error };
  }
};
// Fetch POS registers (configurations) from Odoo
export const fetchPOSRegisters = async ({ limit = null, offset = 0 } = {}) => {
  try {
    const kwargs = { fields: ["id", "name"] };
    if (limit && Number(limit) > 0) kwargs.limit = Number(limit);
    if (offset && Number(offset) > 0) kwargs.offset = Number(offset);

    console.log('[fetchPOSRegisters] request kwargs:', kwargs);

    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "pos.config",
          method: "search_read",
          args: [[]],
          kwargs,
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (pos.config):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    console.log('[fetchPOSRegisters] fetched:', { count: response.data.result?.length ?? 0 });
    return response.data.result || [];
  } catch (error) {
    console.error("fetchPOSRegisters error:", error);
    throw error;
  }
};
// Fetch POS sessions (registers) from Odoo
export const fetchPOSSessions = async ({ limit = 20, offset = 0, state = '' } = {}) => {
  try {
    let domain = [];
    if (state) {
      domain = [["state", "=", state]];
    }
    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "pos.session",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id",
              "name",
              "state",
              "user_id",
              "start_at",
              "stop_at",
              "cash_register_balance_end",
              "cash_register_balance_start",
              "config_id", // Added to allow frontend to extract posConfigId
            ],
            limit,
            offset,
            order: "id desc",
          },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (pos.session):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }
    return response.data.result || [];
  } catch (error) {
    console.error("fetchPOSSessions error:", error);
    throw error;
  }
};
// api/services/generalApi.js
import axios from "axios";
import ODOO_BASE_URL from '@api/config/odooConfig';


import { get } from "./utils";
import { API_ENDPOINTS } from "@api/endpoints";
import { useAuthStore } from '@stores/auth';
import handleApiError from "../utils/handleApiError";

// Debugging output for useAuthStore
export const fetchProducts = async ({ offset, limit, categoryId, searchText }) => {
  try {
    const queryParams = {
      ...(searchText !== undefined && { product_name: searchText }),
      offset,
      limit,
      ...(categoryId !== undefined && { category_id: categoryId }),
    };
    // Debugging output for queryParams
    const response = await get(API_ENDPOINTS.VIEW_PRODUCTS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};



// 🔹 NEW: Fetch products directly from Odoo 19 via JSON-RPC
// Reverted: Fetch products directly from Odoo 19 via JSON-RPC (ice cube shop logic)
export const fetchProductsOdoo = async ({ offset = 0, limit = 50, searchText = "", categoryId = null } = {}) => {
  try {
    // Build domain for filtering
    let domain = [["available_in_pos", "=", true]]; // Only POS products
    
    // Filter by search text (search in name and alternative name)
    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      // Search in both name and description_sale (alternative name)
      domain.push("|");
      domain.push(["name", "ilike", term]);
      domain.push(["description_sale", "ilike", term]);
    }
    
    // Filter by product category (categ_id is many2one field to product.category)
    if (categoryId) {
      domain.push(["categ_id", "=", parseInt(categoryId)]);
    }

    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.product",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id",
              "name",
              "display_name",  // Full name with variant attributes
              "default_code",
              "list_price",
              "qty_available",
              "image_128",
              "image_1920",
              "categ_id",
              "pos_categ_ids",
              "description_sale",  // Alternative name / Arabic name
              "barcode",
              "product_tmpl_id",
              "taxes_id"  // Product sales taxes from Odoo
            ],
            offset,
            limit,
            order: "name asc"
          }
        }
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.data.error) {
      console.log("Odoo JSON-RPC error (product.product):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    const results = response.data.result || [];
    const baseUrl = (ODOO_BASE_URL || '').replace(/\/$/, '');

    // Attach image_url and product_name to each product
    results.forEach(p => {
      const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
      p.image_url = hasBase64 ? `data:image/png;base64,${p.image_128}` : `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`;
      
      // Use display_name for proper variant naming, fallback to name
      // display_name includes variant attributes like "[Size] Product Name"
      p.product_name = p.display_name || p.name;
      
      // If display_name equals name, try to make it unique with default_code
      if (p.display_name === p.name && p.default_code) {
        p.product_name = `${p.name} [${p.default_code}]`;
      }
      
      // Alternative name from description_sale field
      p.alternative_name = p.description_sale || null;
    });

    return results;
  } catch (error) {
    console.error("fetchProductsOdoo error:", error);
    throw error;
  }
};
// Ensure this points to your Odoo URL

// Fetch API token(s) and basic user info for an Odoo user id
export const fetchUserApiToken = async (uid) => {
  // The Odoo instance used by this project may not expose API key models.
  // Authentication will rely on basic `res.users` data returned by the login call.
  // Keep this function for backward compatibility but do not call server models.
  try {
    return {};
  } catch (error) {
    console.error('fetchUserApiToken error (no-op):', error);
    return {};
  }
};

// Fetch categories directly from Odoo using JSON-RPC
// NOTE: older code filtered by a non-existent `is_category` field which caused Odoo to raise
// "Invalid field product.category.is_category". Use a safe domain (empty) and apply
// `name ilike` only when a searchText is provided.
export const fetchCategoriesOdoo = async ({ offset = 0, limit = 50, searchText = "" } = {}) => {
  try {
    // Default to no domain (fetch categories)
    let domain = [];

    // If a search term is provided, filter by category name
    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      domain = [["name", "ilike", term]]; // Filter by category name
    }

    // API call to Odoo to fetch Product categories (product.category)
    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "product.category", // Product category model
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: ["id", "name", "parent_id", "complete_name", "image_128"],
            offset,
            limit,
            order: "name asc",
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    // Handle any errors from the Odoo API
    if (response.data.error) {
      console.log("Odoo JSON-RPC error (product.category):", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    // Map the categories into a usable format
    const categories = response.data.result || [];
    return categories.map(category => {
      // Build image URL if image_128 exists
      let imageUrl = null;
      if (category.image_128 && category.image_128 !== false) {
        // Odoo returns base64 encoded images, convert to data URI
        imageUrl = `data:image/png;base64,${category.image_128}`;
      }

      return {
        _id: category.id,
        id: category.id,
        name: category.name || "",
        category_name: category.name || "",
        complete_name: category.complete_name || category.name || "",
        parent_id: category.parent_id || null,
        image_url: imageUrl,
        has_image: imageUrl !== null,
      };
    });
  } catch (error) {
    console.error("Error fetching product categories from Odoo:", error);
    throw error;
  }
};

// Fetch detailed product information for a single Odoo product id
export const fetchProductDetailsOdoo = async (productId) => {
  try {
    if (!productId) return null;

    // 1. Fetch product details
    const productResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'search_read',
          args: [[['id', '=', productId]]],
          kwargs: {
            fields: [
              'id', 'name', 'list_price', 'default_code', 'uom_id', 'image_128',
              'description_sale', 'categ_id', 'qty_available', 'virtual_available', 'taxes_id'
            ],
            limit: 1,
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (productResponse.data.error) throw new Error('Odoo JSON-RPC error');
    const results = productResponse.data.result || [];
    const p = results[0];
    if (!p) return null;

    // 2. Fetch warehouse/stock info
    const quantResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'stock.quant',
          method: 'search_read',
          args: [[['product_id', '=', productId]]],
          kwargs: {
            fields: ['location_id', 'quantity'],
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    let inventory_ledgers = [];
    if (quantResponse.data && quantResponse.data.result) {
      inventory_ledgers = quantResponse.data.result.map(q => ({
        warehouse_id: Array.isArray(q.location_id) ? q.location_id[0] : null,
        warehouse_name: Array.isArray(q.location_id) ? q.location_id[1] : '',
        total_warehouse_quantity: q.quantity,
      }));
    }

    // 3. Shape and return
    const hasBase64 = p.image_128 && typeof p.image_128 === 'string' && p.image_128.length > 0;
    const baseUrl = (ODOO_BASE_URL || '').replace(/\/$/, '');
    const imageUrl = hasBase64
      ? `data:image/png;base64,${p.image_128}`
      : `${baseUrl}/web/image?model=product.product&id=${p.id}&field=image_128`;

    return {
      id: p.id,
      product_name: p.name || '',
      image_url: imageUrl,
      price: p.list_price || 0,
      minimal_sales_price: p.list_price || null,
      inventory_ledgers,
      total_product_quantity: p.qty_available ?? p.virtual_available ?? 0,
      inventory_box_products_details: [],
      product_code: p.default_code || null,
      uom: p.uom_id ? { uom_id: p.uom_id[0], uom_name: p.uom_id[1] } : null,
      categ_id: p.categ_id || null,
      product_description: p.description_sale || null,
      taxes_id: p.taxes_id || [],  // Product sales taxes from Odoo
    };
  } catch (error) {
    console.error('fetchProductDetailsOdoo error:', error);
    throw error;
  }
};


export const fetchInventoryBoxRequest = async ({ offset, limit, searchText }) => {
  const currentUser = useAuthStore.getState().user; // Correct usage of useAuthStore
  const salesPersonId = currentUser.related_profile._id;

  // Debugging output for salesPersonId
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
      ...(salesPersonId !== undefined && { sales_person_id: salesPersonId })
    };
    const response = await get(API_ENDPOINTS.VIEW_INVENTORY_BOX_REQUEST, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchAuditing = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_AUDITING, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchCustomers = async ({ offset, limit, searchText }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_CUSTOMERS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};// 🔹 Fetch customers directly from Odoo 19 via JSON-RPC (no mobile field)
export const fetchCustomersOdoo = async ({ offset = 0, limit = 50, searchText } = {}) => {
  try {
    // 🔍 Domain for search (optional)
    let domain = [];

    if (searchText && searchText.trim() !== "") {
      const term = searchText.trim();
      domain = [
        "|",
        ["name", "ilike", term],
        ["phone", "ilike", term],
      ];
    }
const response = await axios.post(
  `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "search_read",
          args: [domain],
          kwargs: {
            fields: [
              "id", "name", "email", "phone",
              "street", "street2", "city", "zip", "country_id"
            ],
            offset,
            limit,
            order: "name asc",
          },
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.data.error) {
      console.log("Odoo JSON-RPC error:", response.data.error);
      throw new Error("Odoo JSON-RPC error");
    }

    const partners = response.data.result || [];

    // 🔙 Shape result for your CustomerScreen
    return partners.map((p) => ({
      id: p.id,
      name: p.name || "",
      email: p.email || "",
      phone: p.phone || "",
      address: [
        p.street,
        p.street2,
        p.city,
        p.zip,
        p.country_id && Array.isArray(p.country_id) ? p.country_id[1] : ""
      ].filter(Boolean).join(", "),
    }));
  } catch (error) {
    console.error("fetchCustomersOdoo error:", error);
    throw error;
  }
};


export const fetchPickup = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PICKUP, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchService = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_SERVICE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchSpareParts = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_SPARE_PARTS, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchMarketStudy = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_MARKET_STUDY, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchCustomerVisitList = async ({ offset, limit, fromDate, toDate, customerId, customerName, employeeName, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
      ...(customerName !== undefined && { customer_name: customerName }),
      ...(customerId !== undefined && { customer_id: customerId }),
      ...(employeeName !== undefined && { employee_name: employeeName }),
      ...(fromDate !== undefined && { from_date: fromDate }),
      ...(toDate !== undefined && { to_date: toDate }),
    };
    const response = await get(API_ENDPOINTS.VIEW_CUSTOMER_VISIT_LIST, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchEnquiryRegister = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_ENQUIRY_REGISTER, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchPurchaseRequisition = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PURCHASE_REQUISITION,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPriceEnquiry = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PRICE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPurchaseOrder = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PURCHASE_ORDER,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchDeliveryNote = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_DELIVERY_NOTE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchVendorBill = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VENDOR_BILL,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

export const fetchPaymentMade = async ({ offset, limit,searchText}) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { sequence_no: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PAYMENT_MADE,queryParams);
    return response.data;

  } catch(error){
    handleApiError(error);
    throw error;
  }
}

// viewPaymentMade

export const fetchLead = async ({ offset, limit, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
      // ...(sequenceNo !== undefined && { sequence_no: sequenceNo }),
    };
    const response = await get(API_ENDPOINTS.VIEW_LEAD, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchPipeline = async ({ offset, limit, date, source, opportunity, customer, loginEmployeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(date !== undefined && { date: date }),
      ...(source !== undefined && { source_name: source }),
      ...(opportunity !== undefined && { opportunity_name: opportunity }),
      ...(customer !== undefined && { customer_name: customer }),
      ...(loginEmployeeId !== undefined && { login_employee_id: loginEmployeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_PIPELINE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchVisitPlan = async ({ offset, limit, date, employeeId }) => {
  try {
    const queryParams = {
      offset,
      limit,
      date: date,
      ...(employeeId !== undefined && { employee_id: employeeId }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VISIT_PLAN, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchBoxInspectionReport = async ({ offset, limit }) => {
  try {
    const queryParams = {
      offset,
      limit,
    };
    const response = await get(API_ENDPOINTS.VIEW_BOX_INSPECTION_REPORT, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchAttendance = async ({ userId, date }) => {
  try {
    const queryParams = {
      user_id: userId,
      date,
    };
    const response = await get(API_ENDPOINTS.VIEW_ATTENDANCE, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

export const fetchKPIDashboard = async ({ userId }) => {
  try {
    const queryParams = { login_employee_id: userId };
    const response = await get(API_ENDPOINTS.VIEW_KPI, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}

export const fetchVehicles = async ({ offset, limit, searchText }) => {
  try {
    const queryParams = {
      offset,
      limit,
      ...(searchText !== undefined && { name: searchText }),
    };
    const response = await get(API_ENDPOINTS.VIEW_VEHICLES, queryParams);
    return response.data;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};

// Fetch full customer/partner details (address fields) by id from Odoo
export const fetchCustomerDetailsOdoo = async (partnerId) => {
  try {
    if (!partnerId) return null;
    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.partner',
          method: 'search_read',
          args: [[['id', '=', partnerId]]],
          kwargs: {
            fields: ['id', 'name', 'street', 'street2', 'city', 'zip', 'country_id'],
            limit: 1,
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data.error) {
      console.log('Odoo JSON-RPC error (customer details):', response.data.error);
      throw new Error('Odoo JSON-RPC error');
    }

    const results = response.data.result || [];
    const p = results[0];
    if (!p) return null;

    const address = [p.street, p.street2, p.city, p.zip, p.country_id && Array.isArray(p.country_id) ? p.country_id[1] : '']
      .filter(Boolean)
      .join(', ');

    return {
      id: p.id,
      name: p.name || '',
      address: address || null,
    };
  } catch (error) {
    console.error('fetchCustomerDetailsOdoo error:', error);
    throw error;
  }
};

// Create Account Payment for Odoo
export const createAccountPaymentOdoo = async ({ partnerId, journalId, amount, invoiceId = null } = {}) => {
  try {
    const params = {
      partner_id: partnerId,
      journal_id: journalId,
      amount,
      payment_type: 'inbound', // Customer payment
      partner_type: 'customer', // Payment from a customer
    };

    // Include invoice_ids to link the payment to the invoice
    if (invoiceId) {
      params.invoice_ids = [[6, 0, [invoiceId]]];
    }

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.payment',
        method: 'create',
        args: [params],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    console.log('[PAYMENT] Creating payment with payload:', payload);

    const response = await fetch(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[PAYMENT] Payment creation response:', result);

    // Post the payment to finalize it
    if (result.result) {
      const paymentId = result.result;
      await fetch(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.payment',
            method: 'action_post',
            args: [[paymentId]],
            kwargs: {},
          },
          id: new Date().getTime(),
        }),
      });
      console.log('[PAYMENT] Payment posted successfully.');
    }

    return result;
  } catch (error) {
    console.error('[PAYMENT] Error creating payment:', error);
    return { error };
  }
};

// Fetch Payment Journals for Odoo
export const fetchPaymentJournalsOdoo = async () => {
  try {
    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "account.journal",
          method: "search_read",
          args: [[]],
          kwargs: {
            fields: ["id", "name", "type"],
            limit: 20,
          },
        },
      },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data && response.data.result) return response.data.result;
    return [];
  } catch (error) {
    console.error("fetchPaymentJournalsOdoo error:", error);
    return [];
  }
};

// Create invoice (account.move) in Odoo
export const createInvoiceOdoo = async ({ partnerId, products = [], journalId = null, invoiceDate = null, reference = '' } = {}) => {
  try {
    if (!partnerId) throw new Error('partnerId is required');

    // Ensure we have a valid journal_id. If not provided, auto-select the sales journal.
    let finalJournalId = journalId;
    if (!finalJournalId) {
      try {
        const journals = await fetchPaymentJournalsOdoo();
        console.log('[INVOICE] Fetched journals from Odoo:', JSON.stringify(journals));
        const salesJournal = journals.find(j => j.type === 'sale');
        if (salesJournal) {
          finalJournalId = salesJournal.id;
          console.log('[INVOICE] Auto-selected sales journal:', salesJournal);
        } else {
          console.warn('[INVOICE] No sales journal found; invoice creation will fail if journal_id is required.');
        }
      } catch (err) {
        console.warn('[INVOICE] Failed to fetch journals to auto-select sales journal:', err);
      }
    }

    // Build invoice lines and log each line's tax/price
    let totalUntaxed = 0;
    let totalTax = 0;
    const invoice_lines = products.map((p) => {
      const price_unit = p.price || p.price_unit || p.list_price || 0;
      const quantity = p.quantity || p.qty || 1;
      const vals = {
        product_id: p.id,
        name: p.name || p.product_name || '',
        quantity,
        price_unit,
      };
      // taxes: if provided as array of ids
      if (p.tax_ids && Array.isArray(p.tax_ids) && p.tax_ids.length) {
        vals.tax_ids = [[6, 0, p.tax_ids]];
        // For diagnosis, log tax_ids
        console.log(`[INVOICE LINE] Product ${p.id} tax_ids:`, p.tax_ids);
      }
      // For diagnosis, log price and quantity
      console.log(`[INVOICE LINE] Product ${p.id} price_unit:`, price_unit, 'quantity:', quantity);
      totalUntaxed += price_unit * quantity;
      // Note: Odoo will compute tax, but log if tax_ids present
      if (p.tax_ids && Array.isArray(p.tax_ids) && p.tax_ids.length) {
        // This is a placeholder; actual tax calculation is done by Odoo
        totalTax += 0; // You may add your own calculation if needed
      }
      return [0, 0, vals];
    });

    // Include journal_id only if we have a valid id (avoid sending null)
    const moveVals = {
      partner_id: partnerId,
      move_type: 'out_invoice',
      invoice_line_ids: invoice_lines,
    };
    if (finalJournalId) moveVals.journal_id = finalJournalId;
    if (invoiceDate) moveVals.invoice_date = invoiceDate;
    if (reference) moveVals.ref = reference;

    // Log computed totals before sending
    console.log('[INVOICE] Computed untaxed total:', totalUntaxed);
    console.log('[INVOICE] Computed tax (placeholder, Odoo computes):', totalTax);
    console.log('[STEP 2] Invoice Payload:', moveVals);

    // Create the account.move record
    const createResp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.move',
        method: 'create',
        args: [moveVals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    console.log('[STEP 2] Invoice Creation Response:', createResp.data);
    if (createResp.data && createResp.data.error) {
      console.error('[INVOICE] Odoo error response:', createResp.data.error);
    }
    const createdId = createResp.data && createResp.data.result;
    // Fetch and log the created move record and its lines for diagnosis
    if (createdId) {
      try {
        const moveResp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'search_read',
            args: [[['id', '=', createdId]]],
            kwargs: { fields: ['id', 'state', 'move_type', 'journal_id', 'invoice_date', 'payment_state', 'amount_total', 'amount_residual', 'company_id', 'partner_id', 'invoice_line_ids'] },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[INVOICE DIAG] Created move (search_read):', moveResp.data);
      } catch (moveFetchErr) {
        console.warn('[INVOICE DIAG] Failed to fetch created move:', moveFetchErr);
      }
      try {
        const linesResp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move.line',
            method: 'search_read',
            args: [[['move_id', '=', createdId]]],
            kwargs: { fields: ['id', 'move_id', 'product_id', 'name', 'quantity', 'price_unit', 'account_id', 'tax_ids'] },
          },
          id: new Date().getTime(),
        }, { headers: { 'Content-Type': 'application/json' } });
        console.log('[INVOICE DIAG] Created move lines (search_read):', linesResp.data);
      } catch (linesFetchErr) {
        console.warn('[INVOICE DIAG] Failed to fetch created move lines:', linesFetchErr);
      }
    }
    // Post the invoice immediately after creation
    let posted = false;
    if (createdId) {
      try {
        console.log(`📮 Posting invoice ${createdId}...`);
        const postResp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'action_post',
            args: [[createdId]],
            kwargs: {},
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        
        if (postResp.data && postResp.data.error) {
          console.error('[INVOICE POST] Error posting invoice:', postResp.data.error);
        } else {
          posted = true;
          console.log('✅ Invoice posted successfully');
        }
      } catch (postErr) {
        console.error('[INVOICE POST] Failed to post invoice:', postErr);
      }
    }
    
    // Fetch final invoice status (payment_state, state, amount_residual, amount_total) for diagnostics
    let invoiceStatus = null;
    if (createdId) {
      try {
        const statusResp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'account.move',
            method: 'search_read',
            args: [[['id', '=', createdId]]],
            kwargs: { fields: ['id', 'state', 'move_type', 'payment_state', 'amount_residual', 'amount_total', 'invoice_date'] },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        invoiceStatus = statusResp.data && statusResp.data.result && statusResp.data.result[0];
        console.log(`[INVOICE STATUS] fetched for invoice id (${createdId}) :`, invoiceStatus);
      } catch (statusErr) {
        console.warn('[INVOICE STATUS] Failed to fetch invoice status:', statusErr);
      }
    }

    return { id: createdId, posted, invoiceStatus };
  } catch (error) {
    console.error('createInvoiceOdoo error:', error);
    throw error;
  }
};

// Link an account.move (invoice) to a pos.order and optionally set its state to a specific value
export const linkInvoiceToPosOrderOdoo = async ({ orderId, invoiceId, setState = true, state = null } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!invoiceId) throw new Error('invoiceId is required');

    // Only link the invoice, do not change the order state
    const vals = { account_move: invoiceId };

    console.log('[POS LINK] Linking invoice to POS order:', { orderId, invoiceId, vals });

    const resp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    console.log('[POS LINK] write response:', resp.data);

    // Verify update by reading the order
    try {
      const verify = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.order',
          method: 'search_read',
          args: [[['id', '=', orderId]]],
          kwargs: { fields: ['id', 'state', 'account_move'] },
        },
      }, { headers: { 'Content-Type': 'application/json' } });
      console.log('[POS LINK] verify response:', verify.data);
    } catch (verifyErr) {
      console.warn('[POS LINK] verify read failed:', verifyErr);
    }

    return resp.data;
  } catch (error) {
    console.error('linkInvoiceToPosOrderOdoo error:', error);
    return { error };
  }
};

// Create POS order in Odoo via JSON-RPC
export const createPosOrderOdoo = async ({ partnerId = null, lines = [], sessionId = null, posConfigId = null, companyId = null, orderName = null, preset_id = null, amount_total: override_amount_total = null, discount = 0 } = {}) => {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new Error('lines are required to create pos order');
    }

    // Build lines entries for Odoo POS order
    const line_items = lines.map(l => {
      const price_unit = l.price || l.price_unit || l.list_price || 0;
      const qty = l.qty || l.quantity || 1;
      // prefer client-provided subtotal (already discounted) if present
      const subtotal = (typeof l.price_subtotal !== 'undefined' && l.price_subtotal !== null) ? Number(l.price_subtotal) : (price_unit * qty);
      const discount_pct = Number(l.discount || l.discount_percent || 0);

      const lineData = {
        product_id: l.product_id || l.id,
        qty,
        price_unit,
        name: l.name || l.product_name || '',
        discount: discount_pct,
        price_subtotal: subtotal,
        price_subtotal_incl: subtotal + (l.tax_amount || 0), // Include tax in subtotal_incl
      };

      // Add tax_ids if provided
      if (l.tax_ids && Array.isArray(l.tax_ids) && l.tax_ids.length > 0) {
        lineData.tax_ids = [[6, 0, l.tax_ids]]; // Odoo many2many format
      }

      return [0, 0, lineData];
    });

    // Calculate totals
    const calculated_untaxed = lines.reduce((sum, l) => sum + (l.price || l.price_unit || l.list_price || 0) * (l.qty || l.quantity || 1), 0);
    const calculated_tax = lines.reduce((sum, l) => sum + (l.tax_amount || 0), 0);
    const calculated_total = calculated_untaxed + calculated_tax;
    const amount_total = (override_amount_total !== null && override_amount_total !== undefined) ? Number(override_amount_total) : calculated_total;
    const vals = {
      company_id: companyId || 1, // Default to 1 if not provided
      name: orderName || '/', // Use '/' for auto-generated name if not provided
      partner_id: partnerId || false,
      lines: line_items,
      amount_tax: calculated_tax,
      amount_total,
      amount_paid: 0, // Start with 0, will be updated when payment is made
      amount_return: 0,
      state: 'draft', // Start in draft state, will be paid after payment
    };
    // Note: do not set a top-level `discount` on pos.order — not a valid field on the model
    if (sessionId) vals.session_id = sessionId;
    if (posConfigId) vals.config_id = posConfigId;
    if (preset_id !== null && preset_id !== undefined) vals.preset_id = preset_id;

    console.log('📦 Creating POS Order with payload:', JSON.stringify(vals, null, 2));
    console.log('📊 Order summary:', {
      total_items: lines.length,
      amount_total: vals.amount_total,
      partner_id: vals.partner_id,
      session_id: vals.session_id,
      config_id: vals.config_id,
      preset_id: vals.preset_id,
    });

    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo create pos.order error:', response.data.error);
      return { error: response.data.error };
    }

    const createdId = response.data.result;
    console.log('✅ POS Order created successfully with ID:', createdId);
    // Don't validate immediately - order will be validated after payment
    return { result: createdId };
  } catch (error) {
    console.error('createPosOrderOdoo error:', error);
    return { error };
  }
};

// Create sale.order in Odoo via JSON-RPC (used by Cart checkout flow)
export const createSaleOrderOdoo = async ({ partnerId = null, lines = [], companyId = null, orderName = null, pricelist_id = null, note = '' } = {}) => {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw new Error('lines are required to create sale order');
    }

    const order_lines = lines.map(l => {
      const qty = Number(l.qty || l.quantity || l.product_uom_qty || 1);
      const price_unit = Number(l.price || l.price_unit || l.list_price || 0);
      const lineData = {
        product_id: l.product_id || l.id || false,
        name: l.name || l.product_name || '',
        product_uom_qty: qty,
        price_unit,
      };
      // Include tax_ids for sale.order.line (Many2many field in Odoo 19)
      if (l.tax_ids && Array.isArray(l.tax_ids) && l.tax_ids.length > 0) {
        lineData.tax_ids = [[6, 0, l.tax_ids]]; // Odoo many2many format: [[6, 0, [ids]]]
      }
      return [0, 0, lineData];
    });

    // attempt to resolve partner/company from auth store if not provided
    try {
      const authUser = useAuthStore.getState().user || {};
      if (!partnerId) {
        const p = authUser.partner_id;
        partnerId = Array.isArray(p) ? p[0] : p || null;
      }
      if (!companyId) {
        const c = authUser.company_id;
        companyId = Array.isArray(c) ? c[0] : c || null;
      }
    } catch (e) {
      /* ignore */
    }

    const vals = {
      partner_id: partnerId || 1,
      company_id: companyId || 1,
      name: orderName || '/',
      order_line: order_lines,
      note: note || '',
    };
    if (pricelist_id) vals.pricelist_id = pricelist_id;

    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo create sale.order error:', response.data.error);
      return { error: response.data.error };
    }

    const createdId = response.data.result;
    console.log('✅ Sale Order created successfully with ID:', createdId);
    return { result: createdId };
  } catch (error) {
    console.error('createSaleOrderOdoo error:', error);
    return { error };
  }
};

// Confirm (action_confirm) a sale.order in Odoo via JSON-RPC
export const confirmSaleOrderOdoo = async (orderId, options = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'action_confirm',
        args: [[orderId]],
        kwargs: {},
      },
    };
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo confirm sale.order error:', response.data.error);
      return { error: response.data.error };
    }
    console.log(`✅ sale.order ${orderId} confirmed`);
    return { result: response.data.result };
  } catch (error) {
    console.error('confirmSaleOrderOdoo error:', error);
    return { error };
  }
};

// Link an account.move (invoice) to a sale.order by setting invoice_ids
export const linkInvoiceToSaleOrderOdoo = async ({ orderId, invoiceId } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!invoiceId) throw new Error('invoiceId is required');

    const vals = { invoice_ids: [[6, 0, [invoiceId]]] };
    console.log('[SALE LINK] Linking invoice to sale.order:', { orderId, invoiceId, vals });

    const resp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'write',
        args: [[orderId], vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (resp.data && resp.data.error) {
      console.error('linkInvoiceToSaleOrderOdoo error:', resp.data.error);
      return { error: resp.data.error };
    }
    return { result: resp.data.result };
  } catch (error) {
    console.error('linkInvoiceToSaleOrderOdoo error:', error);
    return { error };
  }
};

// Create POS payment(s) in Odoo via JSON-RPC
// Accepts either a single payment or an array of payments
export const createPosPaymentOdoo = async ({ orderId, payments, amount, journalId, paymentMethodId, paymentMode = 'cash', partnerId = null, sessionId = null, companyId = null } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');

    // Support both legacy (amount) and new (payments array) API
    let paymentRecords = [];
    if (Array.isArray(payments) && payments.length > 0) {
      paymentRecords = payments;
    } else if (typeof amount !== 'undefined') {
      paymentRecords = [{ amount: Number(amount), journalId, paymentMethodId, paymentMode }];
    } else {
      throw new Error('No payment(s) provided');
    }

    const results = [];
    for (const payment of paymentRecords) {
      const amt = Number(payment.amount) || 0;
      if (amt === 0) continue; // Skip zero payments

      let finalPaymentMethodId = payment.paymentMethodId || paymentMethodId;
      let finalJournalId = payment.journalId || journalId;
      let finalPaymentMode = payment.paymentMode || paymentMode;

      // If paymentMethodId is not provided, fetch it using journalId
      if (!finalPaymentMethodId) {
        if (!finalJournalId) throw new Error('paymentMethodId or journalId is required');
        const pmResp = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'pos.payment.method',
            method: 'search_read',
            args: [[['journal_id', '=', finalJournalId]]],
            kwargs: { fields: ['id', 'name', 'journal_id'], limit: 1 },
          },
        }, { headers: { 'Content-Type': 'application/json' } });
        finalPaymentMethodId = pmResp.data?.result?.[0]?.id;
        if (!finalPaymentMethodId) {
          console.error('No payment_method_id found for journalId', finalJournalId);
          return { error: { message: 'No payment_method_id found for journalId ' + finalJournalId } };
        }
      }

      const paymentVals = {
        pos_order_id: orderId,
        amount: amt,
        payment_method_id: finalPaymentMethodId,
        partner_id: partnerId || false,
        session_id: sessionId || false,
        company_id: companyId || 1, // Corrected `CompanyId` to `companyId`
      };

      console.log('💳 Creating POS Payment with payload:', JSON.stringify(paymentVals, null, 2));
      console.log('💰 Payment summary:', {
        order_id: paymentVals.pos_order_id,
        amount: paymentVals.amount,
        payment_method_id: paymentVals.payment_method_id,
        payment_mode: finalPaymentMode,
      });

      const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.payment',
          method: 'create',
          args: [paymentVals],
          kwargs: {},
        },
      }, { headers: { 'Content-Type': 'application/json' } });

      if (response.data && response.data.error) {
        console.error('Odoo create pos.payment error:', response.data.error);
        results.push({ error: response.data.error });
      } else {
        results.push({ result: response.data.result });
      }
    }
    return { results };
  } catch (error) {
    console.error('createPosPaymentOdoo error:', error);
    return { error };
  }
};

// Create a new POS session in Odoo
export const createPOSSesionOdoo = async ({ configId, userId }) => {
  try {
    if (!configId) throw new Error('configId is required');
    const vals = {
      config_id: configId,
      user_id: userId || false,
    };
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.session',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo create pos.session error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('createPOSSesionOdoo error:', error);
    return { error };
  }
};

// Fetch restaurant tables from Odoo using JSON-RPC

export const fetchRestaurantTablesOdoo = async () => {
  try {
    // Import the default Odoo DB name
    const { DEFAULT_ODOO_DB, DEFAULT_ODOO_BASE_URL } = require('../config/odooConfig');
    const response = await fetch(`${DEFAULT_ODOO_BASE_URL}web/dataset/call_kw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Odoo-Database': DEFAULT_ODOO_DB,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'restaurant.table',
          method: 'search_read',
          args: [[]], // No filter, fetch all tables
          kwargs: { fields: [
            'id', 'table_number', 'display_name', 'floor_id', 'seats', 'shape',
            'position_h', 'position_v', 'width', 'height', 'color', 'active'
          ] }
        },
        id: new Date().getTime(),
      }),
    });
    const rawText = await response.text();
    console.log('[fetchRestaurantTablesOdoo] Response status:', response.status);
    console.log('[fetchRestaurantTablesOdoo] Response headers:', JSON.stringify([...response.headers]));
    console.log('[fetchRestaurantTablesOdoo] Raw response text:', rawText);
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('fetchRestaurantTablesOdoo JSON parse error:', parseErr, 'Raw text:', rawText);
      return { error: parseErr, raw: rawText };
    }
    if (data.error) {
      console.error('Odoo fetchRestaurantTablesOdoo error:', data.error);
      return { error: data.error };
    }
    return { result: data.result };
  } catch (error) {
    console.error('fetchRestaurantTablesOdoo error:', error);
    return { error };
  }
};

// Fetch open POS orders for a given table id
export const fetchOpenOrdersByTable = async (tableId) => {
  try {
    if (!tableId) return { result: [] };
    // Exclude orders that are 'done' or 'cancel' so only active/draft orders are returned
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['table_id', '=', tableId], ['state', 'not in', ['done', 'cancel']]]],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'lines'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo fetchOpenOrdersByTable error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOpenOrdersByTable error:', error);
    return { error };
  }
};

// Create a draft pos.order assigned to a table
export const createDraftPosOrderOdoo = async ({ sessionId, userId, tableId, partnerId = false, note = '', preset_id = 10 } = {}) => {
  try {
    const vals = {
      session_id: sessionId,
      user_id: userId || false,
      partner_id: partnerId || false,
      table_id: tableId || false,
      lines: [],
      internal_note: note,
      amount_tax: 0,
      amount_total: 0,
      amount_paid: 0,
      amount_return: 0,
      state: 'draft',
      preset_id: preset_id,
    };
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo createPosOrderOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    // response.data.result is the new record id
    const createdId = response.data.result;
    console.log('[createDraftPosOrderOdoo] Created draft pos.order id:', createdId);
    // Try to fetch the full created order record for logging (non-blocking for callers)
    try {
      const full = await fetchPosOrderById(createdId);
      if (full && full.result) {
        console.log('[createDraftPosOrderOdoo] Created order details:', full.result);
      } else {
        console.log('[createDraftPosOrderOdoo] Could not fetch created order details for id', createdId);
      }
    } catch (fetchErr) {
      console.warn('[createDraftPosOrderOdoo] Failed to fetch created order details:', fetchErr);
    }
    return { result: createdId };
  } catch (error) {
    console.error('createDraftPosOrderOdoo error:', error);
    return { error };
  }
};

// Add a line to an existing pos.order using the correct 'lines' field
export const addLineToOrderOdoo = async ({ orderId, productId, qty = 1, price_unit = 0, name = '', taxes = [] } = {}) => {
  try {
    if (!orderId) throw new Error('orderId is required');
    if (!productId) throw new Error('productId is required');

    const lineVals = {
      product_id: productId,
      qty: Number(qty) || 1,
      price_unit: Number(price_unit) || 0,
      name: name || '',
      price_subtotal: (Number(qty) || 1) * (Number(price_unit) || 0),
      price_subtotal_incl: (Number(qty) || 1) * (Number(price_unit) || 0),
    };
    if (Array.isArray(taxes) && taxes.length > 0) {
      lineVals.tax_ids = taxes.map(t => typeof t === 'number' ? t : (t.id || t[0] || null)).filter(Boolean);
    }

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'write',
        args: [[orderId], { lines: [[0, 0, lineVals]] }],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[addLineToOrderOdoo] RPC payload:', { orderId, lineVals });
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo addLineToOrderOdoo error:', response.data.error);
      return { error: response.data.error };
    }

    return { result: response.data.result };
  } catch (error) {
    console.error('addLineToOrderOdoo error:', error);
    return { error };
  }
};

// Fetch all open POS orders (not done) optionally filtered by session or limit
export const fetchOpenOrders = async ({ sessionId = null, limit = 100 } = {}) => {
  try {
    const domain = [['state', '!=', 'done']];
    if (sessionId) domain.push(['session_id', '=', sessionId]);
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'table_id', 'create_date'], limit, order: 'create_date desc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });
    if (response.data && response.data.error) {
      console.error('Odoo fetchOpenOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOpenOrders error:', error);
    return { error };
  }
};

// Fetch orders without filtering out done orders (flexible fetch)
export const fetchOrders = async ({ sessionId = null, limit = 100, order = 'create_date desc' } = {}) => {
  try {
    const domain = [];
    if (sessionId) domain.push(['session_id', '=', sessionId]);

    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [domain],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'create_date'], limit, order },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchOrders error:', error);
    return { error };
  }
};

// Fetch a single pos.order by id (includes `lines` which are line ids)
export const fetchPosOrderById = async (orderId) => {
  try {
    if (!orderId) return { result: null };
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'search_read',
        args: [[['id', '=', orderId]]],
        // include preset_id so clients can read the selected preset on the order
        kwargs: { fields: ['id','name','state','amount_total','lines','create_date','user_id','partner_id','preset_id'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchPosOrderById error:', response.data.error);
      return { error: response.data.error };
    }
    const result = (response.data.result && response.data.result[0]) || null;
    return { result };
  } catch (error) {
    console.error('fetchPosOrderById error:', error);
    return { error };
  }
};

// Fetch pos.order.line records for given line ids
export const fetchOrderLinesByIds = async (lineIds = []) => {
  try {
    if (!Array.isArray(lineIds) || lineIds.length === 0) return { result: [] };
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'search_read',
        args: [[['id', 'in', lineIds]]],
        kwargs: { fields: ['id','product_id','qty','price_unit','price_subtotal','price_subtotal_incl','tax_ids','discount','name'] },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchOrderLinesByIds error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result || [] };
  } catch (error) {
    console.error('fetchOrderLinesByIds error:', error);
    return { error };
  }
};

// Fetch pos.preset records (POS presets like Dine In / Takeaway)
export const fetchPosPresets = async ({ limit = 200 } = {}) => {
  try {
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.preset',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id','name','available_in_self','use_guest','pricelist_id','color','image_128'], limit, order: 'id asc' },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchPosPresets error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchPosPresets error:', error);
    return { error };
  }
};

// Update an existing pos.order.line (qty, price_unit, name, etc.)
export const updateOrderLineOdoo = async ({ lineId, qty, price_unit, name } = {}) => {
  try {
    if (!lineId) throw new Error('lineId is required');
    const vals = {};
    if (typeof qty !== 'undefined') vals.qty = Number(qty);
    if (typeof price_unit !== 'undefined') vals.price_unit = Number(price_unit);
    if (typeof name !== 'undefined') vals.name = name;

    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'write',
        args: [[lineId], vals],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[updateOrderLineOdoo] RPC payload:', { lineId, vals });
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo updateOrderLineOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('updateOrderLineOdoo error:', error);
    return { error };
  }
};

// Remove (unlink) a pos.order.line by id
export const removeOrderLineOdoo = async ({ lineId } = {}) => {
  try {
    if (!lineId) throw new Error('lineId is required');
    const rpcPayload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order.line',
        method: 'unlink',
        args: [[lineId]],
        kwargs: {},
      },
      id: new Date().getTime(),
    };
    console.log('[removeOrderLineOdoo] RPC payload:', { lineId });
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, rpcPayload, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo removeOrderLineOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('removeOrderLineOdoo error:', error);
    return { error };
  }
};

// Fetch selection values for a given model field (e.g., pos.order state selection)
export const fetchFieldSelectionOdoo = async ({ model = '', field = '' } = {}) => {
  try {
    if (!model || !field) throw new Error('model and field are required');
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model,
        method: 'fields_get',
        args: [[field]],
        kwargs: { attributes: ['selection'] },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error(`[FIELDS_GET] Odoo error for ${model}.${field}:`, response.data.error);
      return [];
    }

    const fieldDef = response.data && response.data.result && response.data.result[field];
    if (!fieldDef) return [];
    return fieldDef.selection || [];
  } catch (error) {
    console.error('fetchFieldSelectionOdoo error:', error);
    return [];
  }
};

// Fetch taxes from Odoo account.tax model
export const fetchTaxesOdoo = async ({ limit = 100, type_tax_use = 'sale' } = {}) => {
  try {
    const domain = type_tax_use ? [['type_tax_use', '=', type_tax_use]] : [];
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'account.tax',
        method: 'search_read',
        args: [domain],
        kwargs: {
          fields: ['id', 'name', 'amount', 'amount_type', 'price_include', 'include_base_amount', 'type_tax_use'],
          limit,
          order: 'sequence asc, id asc'
        },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchTaxesOdoo error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result || [] };
  } catch (error) {
    console.error('fetchTaxesOdoo error:', error);
    return { error };
  }
};

// Fetch base64 product image for a single product id
export const fetchProductImageBase64 = async (productId) => {
  try {
    if (!productId) return null;
    const resp = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'product.product',
          method: 'search_read',
          args: [[['id', '=', productId]]],
          kwargs: { fields: ['id', 'image_128'], limit: 1 },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (resp.data && resp.data.result && Array.isArray(resp.data.result) && resp.data.result[0]) {
      return resp.data.result[0].image_128 || null;
    }
    return null;
  } catch (err) {
    console.error('fetchProductImageBase64 error:', err?.message || err);
    return null;
  }
};

// Fetch discount presets from Odoo (attempts common POS discount model)
export const fetchDiscountsOdoo = async () => {
  try {
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'amount', 'is_percentage'], limit: 50 },
      },
    }, { headers: { 'Content-Type': 'application/json' } });

    const results = response.data?.result || [];
    if (results.length === 0) {
      // If pos.discount not present, return empty — caller may fallback to presets
      console.log('fetchDiscountsOdoo: no pos.discount records found');
    }
    return results;
  } catch (error) {
    console.warn('fetchDiscountsOdoo error:', error?.message || error);
    return [];
  }
};

// Fetch sale.order records from Odoo
export const fetchSaleOrders = async ({ limit = 100, order = 'create_date desc' } = {}) => {
  try {
    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'sale.order',
        method: 'search_read',
        args: [[]],
        kwargs: { fields: ['id', 'name', 'state', 'amount_total', 'create_date', 'partner_id'], limit, order },
      },
      id: new Date().getTime(),
    }, { headers: { 'Content-Type': 'application/json' } });

    if (response.data && response.data.error) {
      console.error('Odoo fetchSaleOrders error:', response.data.error);
      return { error: response.data.error };
    }
    return { result: response.data.result };
  } catch (error) {
    console.error('fetchSaleOrders error:', error);
    return { error };
  }
};

// Create a discount record in Odoo (pos.discount)
export const createDiscountOdoo = async ({ name, amount = 0, is_percentage = false } = {}) => {
  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'create',
        args: [{ name, amount, is_percentage }],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { id: response.data.result } : { error: 'no_result' };
  } catch (error) {
    console.error('createDiscountOdoo error:', error);
    return { error };
  }
};

// Update a discount record in Odoo
export const updateDiscountOdoo = async ({ id, values = {} } = {}) => {
  try {
    if (!id) throw new Error('id required');
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'write',
        args: [[id], values],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { success: true } : { error: 'no_result' };
  } catch (error) {
    console.error('updateDiscountOdoo error:', error);
    return { error };
  }
};

// Delete a discount record in Odoo
export const deleteDiscountOdoo = async ({ id } = {}) => {
  try {
    if (!id) throw new Error('id required');
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.discount',
        method: 'unlink',
        args: [[id]],
        kwargs: {},
      },
      id: new Date().getTime(),
    };

    const response = await axios.post(`${ODOO_BASE_URL}/web/dataset/call_kw`, payload, { headers: { 'Content-Type': 'application/json' } });
    return response.data?.result ? { success: true } : { error: 'no_result' };
  } catch (error) {
    console.error('deleteDiscountOdoo error:', error);
    return { error };
  }
};

// Fetch company currency from Odoo (res.company -> currency_id -> res.currency)
export const fetchCompanyCurrencyOdoo = async () => {
  try {
    // First fetch the company to get the currency_id
    const companyResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.company',
          method: 'search_read',
          args: [[]],
          kwargs: {
            fields: ['id', 'name', 'currency_id'],
            limit: 1,
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (companyResponse.data.error) {
      console.error('Odoo JSON-RPC error (res.company):', companyResponse.data.error);
      return null;
    }

    const companies = companyResponse.data.result || [];
    if (companies.length === 0) {
      console.warn('[fetchCompanyCurrencyOdoo] No company found');
      return null;
    }

    const company = companies[0];
    const currencyId = Array.isArray(company.currency_id) ? company.currency_id[0] : company.currency_id;

    if (!currencyId) {
      console.warn('[fetchCompanyCurrencyOdoo] No currency_id on company');
      return null;
    }

    // Fetch the currency details
    const currencyResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'res.currency',
          method: 'search_read',
          args: [[['id', '=', currencyId]]],
          kwargs: {
            fields: ['id', 'name', 'symbol', 'position', 'decimal_places', 'rounding'],
            limit: 1,
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (currencyResponse.data.error) {
      console.error('Odoo JSON-RPC error (res.currency):', currencyResponse.data.error);
      return null;
    }

    const currencies = currencyResponse.data.result || [];
    if (currencies.length === 0) {
      console.warn('[fetchCompanyCurrencyOdoo] Currency not found for id:', currencyId);
      return null;
    }

    const currency = currencies[0];
    console.log('[fetchCompanyCurrencyOdoo] Fetched currency:', currency);

    return {
      id: currency.id,
      name: currency.name,           // e.g., "OMR", "USD", "AED"
      symbol: currency.symbol,       // e.g., "ر.ع.", "$", "د.إ"
      position: currency.position,   // "before" or "after"
      decimal_places: currency.decimal_places,
      rounding: currency.rounding,
    };
  } catch (error) {
    console.error('fetchCompanyCurrencyOdoo error:', error);
    return null;
  }
};

// Fetch Customer Account payment method from pos.payment.method
export const fetchCustomerAccountPaymentMethod = async () => {
  try {
    console.log('🔍 Fetching Customer Account payment method...');
    
    const response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'pos.payment.method',
          method: 'search_read',
          args: [[]],
          kwargs: { 
            fields: ['id', 'name', 'journal_id', 'type', 'receivable_account_id'], 
            limit: 100 
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const allMethods = response.data?.result || [];
    
    console.log('=== ALL POS PAYMENT METHODS ===');
    allMethods.forEach((m, i) => {
      console.log(`[${i}] ID: ${m.id}, Name: "${m.name}", Type: ${m.type}, Journal: ${JSON.stringify(m.journal_id)}`);
    });
    
    if (allMethods.length === 0) {
      console.log('⚠️ No payment methods returned from API');
      return null;
    }
    
    // Find Customer Account - try exact match first
    let customerAccountMethod = allMethods.find(m => 
      m.name && m.name.toLowerCase() === 'customer account'
    );
    
    // If not found, try partial match
    if (!customerAccountMethod) {
      customerAccountMethod = allMethods.find(m => 
        m.name && (
          m.name.toLowerCase().includes('customer') ||
          m.name.toLowerCase().includes('credit') ||
          m.type === 'pay_later'
        )
      );
    }
    
    // If still not found, try to find one without a journal (typical for customer account)
    if (!customerAccountMethod) {
      customerAccountMethod = allMethods.find(m => !m.journal_id || m.journal_id === false);
    }
    
    if (customerAccountMethod) {
      console.log('✅ Found Customer Account payment method:', customerAccountMethod);
      return customerAccountMethod;
    } else {
      console.log('❌ No Customer Account payment method found. Available methods:', allMethods.map(m => m.name));
      return null;
    }
  } catch (error) {
    console.error('❌ fetchCustomerAccountPaymentMethod error:', error);
    return null;
  }
};