const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

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

// Mock function to simulate fetching billing data from external source
const fetchBillingDataFromSource = async () => {
  // In a real implementation, this would scrape data from a website
  // For now, we'll return mock data that matches the expected structure
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return {
    "AB Trucking": {
      ltl_shipments: 15,
      small_package_shipments: 250,
      month: "December 2024"
    },
    "ACF Global Logistics": {
      ltl_shipments: 8,
      small_package_shipments: 120,
      month: "December 2024"
    },
    "Unrecognized Company": {
      ltl_shipments: 5,
      small_package_shipments: 80,
      month: "December 2024"
    }
  };
};

// Process billing data and calculate charges
const processBillingData = async () => {
  const { customers, nameMapping } = loadCustomerData();
  const rawData = await fetchBillingDataFromSource();
  
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
  
  return {
    errors,
    billing_summary: {
      total_revenue: totalRevenue,
      customer_count: customerCount,
      total_shipments: totalShipments,
      issues_count: errors.missing_customers.length + errors.unmapped_customers.length,
      customers: processedCustomers,
      month: "December 2024"
    }
  };
};

// Mock QuickBooks functions
const refreshQuickBooksCustomers = async () => {
  // In a real implementation, this would connect to QuickBooks API
  // and update customer IDs in the customers.json file
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    success: true,
    customers_updated: 2,
    message: "Successfully refreshed QuickBooks customers"
  };
};

const createQuickBooksInvoices = async (billingData) => {
  // In a real implementation, this would create draft invoices in QuickBooks
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const eligibleCustomers = billingData.customers.filter(c => c.qb_customer_id);
  
  return {
    success: true,
    invoices_created: eligibleCustomers.length,
    message: `Created ${eligibleCustomers.length} draft invoices in QuickBooks`
  };
};

const approveInvoices = async (billingData) => {
  // In a real implementation, this would approve invoices in the system
  
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
    
    switch (action) {
      case 'fetch_billing_data':
        const billingData = await processBillingData();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(billingData)
        };
      
      case 'refresh_qb_customers':
        const qbResult = await refreshQuickBooksCustomers();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(qbResult)
        };
      
      case 'create_qb_invoices':
        if (!body.data) {
          throw new Error('No billing data provided for invoice creation');
        }
        const invoiceResult = await createQuickBooksInvoices(body.data);
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
            available_actions: [
              'fetch_billing_data',
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
