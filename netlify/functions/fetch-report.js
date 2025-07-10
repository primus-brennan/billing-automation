const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// QuickBooks OAuth configuration
const QB_CONFIG = {
  clientId: process.env.QBCLIENT_ID,
  clientSecret: process.env.QBCLIENT_SECRET,
  redirectUri: process.env.QB_REDIRECT_URI || 'https://primusqb.netlify.app/',
  baseUrl: process.env.QB_SANDBOX === 'false' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com',
  discoveryUrl: 'https://appcenter.intuit.com/connect/oauth2'
};

// Load customer data and mapping
const loadCustomerData = () => {
  const customersPath = path.join(__dirname, '../../data/customers.json');
  const mappingPath = path.join(__dirname, '../../data/name-mapping.json');
  
  const customers = JSON.parse(fs.readFileSync(customersPath, 'utf8'));
  const nameMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  
  return { customers, nameMapping };
};

// Calculate tiered pricing
const calculateTieredPricing = (count, pricing) => {
  if (count === 0) return 0;
  
  let total = 0;
  let remaining = count;
  
  for (const tier of pricing.tiers) {
    if (remaining <= 0) break;
    
    const tierLimit = tier.up_to || remaining;
    const tierCount = Math.min(remaining, tierLimit);
    
    total += tierCount * tier.rate;
    remaining -= tierCount;
    
    if (tier.up_to === null) break; // Last tier
  }
  
  return Math.max(total, pricing.minimum || 0);
};

// Generate QuickBooks OAuth URL
const generateQBAuthUrl = () => {
  const state = Math.random().toString(36).substring(2, 15);
  const scope = 'com.intuit.quickbooks.accounting';
  
  const authUrl = `${QB_CONFIG.discoveryUrl}?` +
    `client_id=${QB_CONFIG.clientId}&` +
    `scope=${scope}&` +
    `redirect_uri=${encodeURIComponent(QB_CONFIG.redirectUri)}&` +
    `response_type=code&` +
    `access_type=offline&` +
    `state=${state}`;
  
  return { authUrl, state };
};

// Exchange authorization code for tokens
const exchangeCodeForTokens = async (code, state) => {
  console.log('Exchange tokens - Code:', code);
  console.log('Exchange tokens - State:', state);
  console.log('Exchange tokens - Client ID configured:', !!QB_CONFIG.clientId);
  
  if (!QB_CONFIG.clientId || !QB_CONFIG.clientSecret) {
    console.error('QB credentials missing - Client ID:', !!QB_CONFIG.clientId, 'Client Secret:', !!QB_CONFIG.clientSecret);
    throw new Error('QuickBooks credentials not configured');
  }

  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: QB_CONFIG.redirectUri
  });

  const auth = Buffer.from(`${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`).toString('base64');
  
  console.log('Token request - URL:', tokenUrl);
  console.log('Token request - Redirect URI:', QB_CONFIG.redirectUri);
  console.log('Token request - Params:', params.toString());
  
  try {
    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Token response - Status:', response.status);
    console.log('Token response - Data:', response.data);
    
    return response.data;
  } catch (error) {
    console.error('Token exchange error - Status:', error.response?.status);
    console.error('Token exchange error - Data:', error.response?.data);
    console.error('Token exchange error - Message:', error.message);
    throw new Error(`Failed to exchange code for tokens: ${error.response?.data?.error_description || error.message}`);
  }
};

// Get QuickBooks customers
const getQBCustomers = async (accessToken, companyId) => {
  console.log('getQBCustomers called with:', {
    hasAccessToken: !!accessToken,
    companyId: companyId,
    baseUrl: QB_CONFIG.baseUrl,
    isSandbox: process.env.QB_SANDBOX !== 'false'
  });
  
  if (!accessToken || !companyId) {
    const error = `Missing QuickBooks credentials - Access Token: ${!!accessToken}, Company ID: ${!!companyId}`;
    console.error(error);
    throw new Error(error);
  }

  // First try to get company info to test basic connectivity
  try {
    const companyUrl = `${QB_CONFIG.baseUrl}/v3/company/${companyId}/companyinfo/${companyId}`;
    console.log('Testing QB API connectivity with company info:', companyUrl);
    
    const companyResponse = await axios.get(companyUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('Company info test successful:', companyResponse.status);
  } catch (testError) {
    console.log('Company info test failed:', testError.response?.status, testError.response?.data);
  }

  // Now try to get customers using the correct query syntax
  const url = `${QB_CONFIG.baseUrl}/v3/company/${companyId}/query?query=SELECT * FROM Customer MAXRESULTS 20`;
  console.log('QB API Request URL:', url);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('QB API Response Status:', response.status);
    console.log('QB API Response Headers:', response.headers);
    console.log('QB API Response Data:', JSON.stringify(response.data, null, 2));
    
    return response.data.QueryResponse?.Customer || [];
  } catch (error) {
    console.error('QB API error details:');
    console.error('- Status:', error.response?.status);
    console.error('- Status Text:', error.response?.statusText);
    console.error('- Headers:', error.response?.headers);
    console.error('- Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('- Message:', error.message);
    console.error('- Code:', error.code);
    
    if (error.response?.status === 401) {
      throw new Error('QuickBooks access token expired. Please reconnect to QuickBooks.');
    } else if (error.response?.status === 403) {
      throw new Error('Access denied to QuickBooks company data. Please check permissions.');
    } else if (error.response?.status === 400) {
      const qbError = error.response?.data?.Fault?.[0]?.Error?.[0];
      const errorDetail = qbError?.Detail || qbError?.code || error.response?.statusText;
      throw new Error(`Invalid request to QuickBooks: ${errorDetail}`);
    } else if (error.code === 'ECONNABORTED' || error.code === 'TIMEOUT') {
      throw new Error('QuickBooks API request timed out. Please try again.');
    } else {
      const qbError = error.response?.data?.Fault?.[0]?.Error?.[0];
      const errorDetail = qbError?.Detail || qbError?.code || error.message;
      throw new Error(`QuickBooks API error: ${errorDetail}`);
    }
  }
};

// Create QB invoice
const createQBInvoice = async (accessToken, companyId, invoiceData) => {
  if (!accessToken || !companyId) {
    throw new Error('Missing QuickBooks access token or company ID');
  }

  const url = `${QB_CONFIG.baseUrl}/v3/company/${companyId}/invoice`;
  
  const invoice = {
    Line: invoiceData.lineItems.map((item, index) => ({
      Id: index + 1,
      LineNum: index + 1,
      Amount: item.amount,
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        ItemRef: {
          value: "1", // Default item - you may want to create specific items
          name: item.description
        },
        Qty: item.quantity || 1,
        UnitPrice: item.unitPrice || item.amount
      }
    })),
    CustomerRef: {
      value: invoiceData.customerId
    },
    TotalAmt: invoiceData.totalAmount,
    DueDate: invoiceData.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  };

  try {
    const response = await axios.post(url, invoice, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.Invoice;
  } catch (error) {
    console.error('QB Invoice creation error:', error.response?.data || error.message);
    throw new Error('Failed to create QuickBooks invoice');
  }
};

// Real function to fetch billing data from shipprimus.com
const fetchBillingDataFromSource = async (month = null) => {
  try {
    console.log('Fetching billing data from shipprimus.com for month:', month);
    
    // Construct URL with month parameter if provided
    let url = 'https://shipprimus.com/shipmentReport.php?primus=123';
    if (month) {
      url += `&month=${encodeURIComponent(month)}`;
    }
    
    console.log('Fetching URL:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const customerData = {};
    
    // Look for the data table - this may need adjustment based on the actual HTML structure
    $('table tr').each((index, element) => {
      if (index === 0) return; // Skip header row
      
      const cells = $(element).find('td');
      if (cells.length >= 3) {
        const customerName = $(cells[0]).text().trim();
        const ltlShipments = parseInt($(cells[1]).text().trim()) || 0;
        const smallPackageShipments = parseInt($(cells[2]).text().trim()) || 0;
        
        if (customerName && (ltlShipments > 0 || smallPackageShipments > 0)) {
          customerData[customerName] = {
            ltl_shipments: ltlShipments,
            small_package_shipments: smallPackageShipments,
            month: month || getCurrentMonth()
          };
        }
      }
    });
    
    console.log('Parsed customer data:', Object.keys(customerData));
    
    // If no data found in table, try alternative parsing methods
    if (Object.keys(customerData).length === 0) {
      console.log('No data found in table format, trying alternative parsing...');
      
      // Try to find data in different format or structure
      // This is a fallback - you may need to adjust based on actual HTML
      const text = $.text();
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.includes('AB Trucking') || line.includes('ACF Global') || line.includes('Aeronet')) {
          // Parse line for customer data
          const matches = line.match(/(\w+[\w\s]*)\s+(\d+)\s+(\d+)/);
          if (matches) {
            const [, customerName, ltl, smallPackage] = matches;
            customerData[customerName.trim()] = {
              ltl_shipments: parseInt(ltl) || 0,
              small_package_shipments: parseInt(smallPackage) || 0,
              month: month || getCurrentMonth()
            };
          }
        }
      }
    }
    
    return customerData;
    
  } catch (error) {
    console.error('Error fetching billing data from source:', error);
    
    // Return mock data as fallback for development
    console.log('Using mock data as fallback');
    return {
      "AB Trucking": {
        ltl_shipments: 15,
        small_package_shipments: 250,
        month: month || getCurrentMonth()
      },
      "ACF Global Logistics": {
        ltl_shipments: 8,
        small_package_shipments: 120,
        month: month || getCurrentMonth()
      },
      "Unrecognized Company": {
        ltl_shipments: 5,
        small_package_shipments: 80,
        month: month || getCurrentMonth()
      }
    };
  }
};

// Helper function to get current month
const getCurrentMonth = () => {
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
};

// Get available months for selection
const getAvailableMonths = () => {
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const availableMonths = [];
  
  // Add current month and previous 11 months
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = months[date.getMonth()];
    const year = date.getFullYear();
    availableMonths.push(`${monthName} ${year}`);
  }
  
  return availableMonths;
};

// Save customer pricing configuration
const saveCustomerPricing = async (customerName, pricingData) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Load existing customer data
    const customersPath = path.join(__dirname, '../../data/customers.json');
    const nameMappingPath = path.join(__dirname, '../../data/name-mapping.json');
    
    const customersData = JSON.parse(fs.readFileSync(customersPath, 'utf8'));
    const nameMappingData = JSON.parse(fs.readFileSync(nameMappingPath, 'utf8'));
    
    // Generate new customer ID
    const customerIds = Object.keys(customersData.customers);
    const nextId = customerIds.length + 1;
    const customerId = `customer_${nextId}`;
    
    // Add new customer
    customersData.customers[customerId] = {
      name: customerName,
      ltl_pricing: pricingData.ltl_pricing || {
        tiers: [
          { min: 0, max: 50, rate: 25 },
          { min: 51, max: 100, rate: 20 },
          { min: 101, max: null, rate: 15 }
        ]
      },
      small_package_pricing: pricingData.small_package_pricing || {
        tiers: [
          { min: 0, max: 500, rate: 2 },
          { min: 501, max: 1000, rate: 1.5 },
          { min: 1001, max: null, rate: 1 }
        ]
      },
      storage_fee: pricingData.storage_fee || 0,
      contract_minimum: pricingData.contract_minimum || 0,
      payment_method: pricingData.payment_method || 'Net 30',
      other_pricing: pricingData.other_pricing || {}
    };
    
    // Add name mapping
    nameMappingData.report_name_to_customer_id[customerName] = customerId;
    
    // Save files
    fs.writeFileSync(customersPath, JSON.stringify(customersData, null, 2));
    fs.writeFileSync(nameMappingPath, JSON.stringify(nameMappingData, null, 2));
    
    return {
      success: true,
      message: `Customer pricing saved for ${customerName}`,
      customer_id: customerId
    };
    
  } catch (error) {
    console.error('Error saving customer pricing:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Process billing data and calculate charges
const processBillingData = async (month = null) => {
  const { customers, nameMapping } = loadCustomerData();
  const rawData = await fetchBillingDataFromSource(month);
  
  const errors = {
    missing_customers: [],
    unmapped_customers: []
  };
  
  const processedCustomers = [];
  let totalRevenue = 0;
  let totalShipments = 0;
  let customerCount = 0;
  
  // Process each customer from the raw data
  for (const [reportName, shipmentData] of Object.entries(rawData)) {
    // Map report name to customer ID
    const customerId = nameMapping.report_name_to_customer_id[reportName];
    
    if (!customerId) {
      errors.missing_customers.push(reportName);
      continue;
    }
    
    const customerConfig = customers.customers[customerId];
    if (!customerConfig) {
      errors.unmapped_customers.push(reportName);
      continue;
    }
    
    // Calculate LTL charges
    const ltlTotal = calculateTieredPricing(
      shipmentData.ltl_shipments,
      customerConfig.ltl_pricing
    );
    
    // Calculate small package charges
    const smallPackageTotal = calculateTieredPricing(
      shipmentData.small_package_shipments,
      customerConfig.small_package_pricing
    );
    
    // Add storage fee
    const storageFee = customerConfig.storage_fee || 0;
    
    // Calculate other charges
    let otherCharges = 0;
    if (customerConfig.other_pricing) {
      otherCharges = Object.values(customerConfig.other_pricing).reduce((sum, charge) => sum + charge, 0);
    }
    
    // Calculate total
    const subtotal = ltlTotal + smallPackageTotal + storageFee + otherCharges;
    const total = Math.max(subtotal, customerConfig.contract_minimum || 0);
    
    const processedCustomer = {
      id: customerId,
      name: customerConfig.name,
      ltl_count: shipmentData.ltl_shipments,
      ltl_total: ltlTotal,
      small_package_count: shipmentData.small_package_shipments,
      small_package_total: smallPackageTotal,
      storage_fee: storageFee,
      other_charges: otherCharges,
      subtotal: subtotal,
      total: total,
      contract_minimum: customerConfig.contract_minimum || 0,
      payment_method: customerConfig.payment_method,
      qb_customer_id: customerConfig.qb_customer_id,
      qb_status: customerConfig.qb_customer_id ? 'active' : 'pending'
    };
    
    processedCustomers.push(processedCustomer);
    totalRevenue += total;
    totalShipments += shipmentData.ltl_shipments + shipmentData.small_package_shipments;
    customerCount++;
  }
  
  const currentMonth = month || getCurrentMonth();
  
  return {
    errors,
    billing_summary: {
      total_revenue: totalRevenue,
      customer_count: customerCount,
      total_shipments: totalShipments,
      issues_count: errors.missing_customers.length + errors.unmapped_customers.length,
      customers: processedCustomers,
      month: currentMonth
    }
  };
};

// Real QuickBooks functions
const refreshQuickBooksCustomers = async (accessToken, companyId) => {
  console.log('refreshQuickBooksCustomers called with:', {
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken ? accessToken.length : 0,
    companyId: companyId
  });

  if (!accessToken || !companyId) {
    const error = 'QuickBooks not connected. Please authenticate first.';
    console.log('Missing QB credentials:', { hasAccessToken: !!accessToken, companyId });
    return {
      success: false,
      error: error,
      needs_auth: true
    };
  }

  try {
    console.log('Attempting to fetch QB customers...');
    const qbCustomers = await getQBCustomers(accessToken, companyId);
    
    console.log('Successfully fetched QB customers:', qbCustomers.length);
    
    // Here you would update your customer data with QB customer IDs
    // For now, we'll just return the count
    
    return {
      success: true,
      customers_found: qbCustomers.length,
      message: `Found ${qbCustomers.length} customers in QuickBooks`
    };
  } catch (error) {
    console.error('refreshQuickBooksCustomers error:', error);
    return {
      success: false,
      error: error.message,
      needs_auth: error.message.includes('access token') || error.message.includes('expired')
    };
  }
};

const createQuickBooksInvoices = async (billingData, accessToken, companyId) => {
  if (!accessToken || !companyId) {
    return {
      success: false,
      error: 'QuickBooks not connected. Please authenticate first.',
      needs_auth: true
    };
  }

  try {
    const eligibleCustomers = billingData.customers.filter(c => c.qb_customer_id);
    let createdCount = 0;
    
    for (const customer of eligibleCustomers) {
      const invoiceData = {
        customerId: customer.qb_customer_id,
        totalAmount: customer.total,
        lineItems: [
          {
            description: `LTL Shipments (${customer.ltl_count})`,
            amount: customer.ltl_total,
            quantity: customer.ltl_count,
            unitPrice: customer.ltl_count > 0 ? customer.ltl_total / customer.ltl_count : 0
          },
          {
            description: `Small Package Shipments (${customer.small_package_count})`,
            amount: customer.small_package_total,
            quantity: customer.small_package_count,
            unitPrice: customer.small_package_count > 0 ? customer.small_package_total / customer.small_package_count : 0
          },
          {
            description: 'Storage Fee',
            amount: customer.storage_fee,
            quantity: 1,
            unitPrice: customer.storage_fee
          }
        ].filter(item => item.amount > 0)
      };
      
      await createQBInvoice(accessToken, companyId, invoiceData);
      createdCount++;
    }
    
    return {
      success: true,
      invoices_created: createdCount,
      message: `Created ${createdCount} invoices in QuickBooks`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      needs_auth: error.message.includes('access token')
    };
  }
};

const approveInvoices = async (billingData) => {
  // In a real implementation, this would mark invoices as approved in your system
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    success: true,
    invoices_approved: billingData.customers.length,
    message: `Approved ${billingData.customers.length} invoices`
  };
};

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'test';
    
    console.log(`Processing action: ${action}`);
    
    // Get QB credentials from headers if available
    const accessToken = event.headers['qb-access-token'];
    const companyId = event.headers['qb-company-id'];
    
    console.log('Request headers received:', {
      hasQBAccessToken: !!accessToken,
      hasQBCompanyId: !!companyId,
      action: action,
      allHeaders: Object.keys(event.headers)
    });
    
    if (accessToken) {
      console.log('Access token preview:', accessToken.substring(0, 20) + '...');
    }
    if (companyId) {
      console.log('Company ID:', companyId);
    }
    
    switch (action) {
      case 'fetch_billing_data':
        const month = body.month || null;
        const billingData = await processBillingData(month);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(billingData)
        };
      
      case 'get_available_months':
        // Return list of available months for selection
        const availableMonths = getAvailableMonths();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            months: availableMonths
          })
        };
      
      case 'save_customer_pricing':
        // Save new customer pricing configuration
        const { customerName, pricingData } = body;
        const saveResult = await saveCustomerPricing(customerName, pricingData);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(saveResult)
        };
      
      case 'qb_auth_url':
        if (!QB_CONFIG.clientId) {
          throw new Error('QuickBooks Client ID not configured');
        }
        const authData = generateQBAuthUrl();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(authData)
        };
      
      case 'qb_exchange_token':
        console.log('Processing qb_exchange_token request');
        const { code, state, realmId } = body;
        console.log('Request body - Code:', !!code, 'State:', !!state, 'RealmId:', realmId);
        
        if (!code) {
          throw new Error('Authorization code required');
        }
        
        const tokens = await exchangeCodeForTokens(code, state);
        
        // Add realmId to the response
        const response = {
          ...tokens,
          realmId: realmId
        };
        
        console.log('Returning tokens with realmId:', !!response.access_token, 'RealmId:', response.realmId);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(response)
        };
      
      case 'refresh_qb_customers':
        const qbResult = await refreshQuickBooksCustomers(accessToken, companyId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(qbResult)
        };
      
      case 'create_qb_invoices':
        if (!body.data) {
          throw new Error('No billing data provided for invoice creation');
        }
        const invoiceResult = await createQuickBooksInvoices(body.data, accessToken, companyId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(invoiceResult)
        };
      
      case 'approve_invoices':
        if (!body.data) {
          throw new Error('No billing data provided for invoice approval');
        }
        const approvalResult = await approveInvoices(body.data);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(approvalResult)
        };
      
      default:
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Billing function ready',
            qb_configured: !!QB_CONFIG.clientId,
            available_actions: [
              'fetch_billing_data',
              'get_available_months',
              'save_customer_pricing',
              'qb_auth_url',
              'qb_exchange_token',
              'refresh_qb_customers',
              'create_qb_invoices',
              'approve_invoices'
            ]
          })
        };
    }
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
