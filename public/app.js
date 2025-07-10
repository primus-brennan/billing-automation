// Billing Automation Frontend
class BillingApp {
    constructor() {
        this.init();
    }

    init() {
        // Check if this is an OAuth callback first
        const urlParams = new URLSearchParams(window.location.search);
        const isOAuthCallback = urlParams.has('code') && urlParams.has('realmId');
        
        if (isOAuthCallback) {
            console.log('OAuth callback detected, processing...');
            this.handleOAuthCallback();
            return; // Don't initialize other UI elements during OAuth processing
        }
        
        this.bindEvents();
        this.loadingElement = document.getElementById('loading');
        this.errorSection = document.getElementById('error-section');
        this.billingSection = document.getElementById('billing-summary');
        this.invoiceActions = document.getElementById('invoice-actions');
        this.monthSelect = document.getElementById('month-select');
        this.pricingModal = document.getElementById('pricing-modal');
        this.currentData = null;
        this.qbTokens = this.loadQBTokens();
        this.currentCustomerForPricing = null;
        
        // Update UI based on QB connection status
        this.updateQBConnectionStatus();
        
        // Load available months
        this.loadAvailableMonths();
    }

    bindEvents() {
        document.getElementById('fetch-data-btn').addEventListener('click', () => {
            this.fetchBillingData();
        });

        document.getElementById('refresh-qb-btn').addEventListener('click', () => {
            this.refreshQBCustomers();
        });

        document.getElementById('approve-all-btn').addEventListener('click', () => {
            this.approveAllInvoices();
        });

        document.getElementById('create-qb-btn').addEventListener('click', () => {
            this.createQBInvoices();
        });
        
        document.getElementById('month-select').addEventListener('change', (e) => {
            if (e.target.value) {
                this.fetchBillingData(e.target.value);
            }
        });
    }

    // QuickBooks Token Management
    loadQBTokens() {
        const tokens = localStorage.getItem('qb_tokens');
        return tokens ? JSON.parse(tokens) : null;
    }

    saveQBTokens(tokens) {
        this.qbTokens = tokens;
        localStorage.setItem('qb_tokens', JSON.stringify(tokens));
        this.updateQBConnectionStatus();
    }

    clearQBTokens() {
        this.qbTokens = null;
        localStorage.removeItem('qb_tokens');
        this.updateQBConnectionStatus();
    }

    updateQBConnectionStatus() {
        const refreshBtn = document.getElementById('refresh-qb-btn');
        const createBtn = document.getElementById('create-qb-btn');
        
        if (this.qbTokens) {
            refreshBtn.innerHTML = '🔄 Refresh QB Customers';
            refreshBtn.classList.remove('needs-auth');
            createBtn.classList.remove('needs-auth');
        } else {
            refreshBtn.innerHTML = '🔗 Connect QuickBooks';
            refreshBtn.classList.add('needs-auth');
            createBtn.classList.add('needs-auth');
        }
    }

    // OAuth Flow
    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const realmId = urlParams.get('realmId');
        
        console.log('OAuth Callback - Code:', code);
        console.log('OAuth Callback - State:', state);
        console.log('OAuth Callback - RealmId:', realmId);
        
        if (code) {
            // Show loading message
            document.body.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                    <p style="font-size: 18px; color: #333;">Connecting to QuickBooks...</p>
                    <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
                </div>
            `;
            
            try {
                const response = await fetch('/.netlify/functions/fetch-report', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        action: 'qb_exchange_token',
                        code: code,
                        state: state,
                        realmId: realmId
                    })
                });

                console.log('Token Exchange Response Status:', response.status);
                const tokens = await response.json();
                console.log('Token Exchange Response:', tokens);
                
                if (response.ok) {
                    // Add realmId to tokens
                    tokens.realmId = realmId;
                    
                    // Save tokens
                    localStorage.setItem('qb_tokens', JSON.stringify(tokens));
                    
                    // Show success and redirect
                    document.body.innerHTML = `
                        <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            <div style="background: #4CAF50; color: white; padding: 20px; border-radius: 10px; text-align: center; max-width: 400px;">
                                <h2 style="margin: 0 0 10px 0;">✅ Success!</h2>
                                <p style="margin: 0;">Successfully connected to QuickBooks!</p>
                                <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Redirecting back to your billing system...</p>
                            </div>
                        </div>
                    `;
                    
                    // Redirect back to main app after 2 seconds
                    setTimeout(() => {
                        window.location.href = window.location.pathname;
                    }, 2000);
                    
                } else {
                    throw new Error(tokens.error || 'Failed to connect to QuickBooks');
                }
            } catch (error) {
                console.error('OAuth callback error:', error);
                
                // Show error message
                document.body.innerHTML = `
                    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <div style="background: #f44336; color: white; padding: 20px; border-radius: 10px; text-align: center; max-width: 400px;">
                            <h2 style="margin: 0 0 10px 0;">❌ Connection Failed</h2>
                            <p style="margin: 0 0 15px 0;">${error.message}</p>
                            <button onclick="window.location.href='${window.location.pathname}'" style="background: white; color: #f44336; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                                Return to Billing System
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    }

    async connectQuickBooks() {
        try {
            const response = await fetch('/.netlify/functions/fetch-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'qb_auth_url' })
            });

            const data = await response.json();
            
            if (response.ok) {
                // Store state for verification
                sessionStorage.setItem('qb_oauth_state', data.state);
                
                // Redirect to QuickBooks OAuth
                window.location.href = data.authUrl;
            } else {
                throw new Error(data.error || 'Failed to get QuickBooks authorization URL');
            }
        } catch (error) {
            this.showError({ general: [error.message] });
            console.error('QB Connect error:', error);
        }
    }

    // API Helper with QB tokens
    async makeAPIRequest(action, data = null) {
        const headers = {
            'Content-Type': 'application/json',
        };

        // Add QB tokens if available
        if (this.qbTokens) {
            headers['qb-access-token'] = this.qbTokens.access_token;
            headers['qb-company-id'] = this.qbTokens.realmId;
            
            console.log('Making API request with QB tokens:', {
                action: action,
                hasAccessToken: !!this.qbTokens.access_token,
                accessTokenPreview: this.qbTokens.access_token ? this.qbTokens.access_token.substring(0, 20) + '...' : null,
                companyId: this.qbTokens.realmId,
                headers: Object.keys(headers)
            });
        } else {
            console.log('Making API request without QB tokens for action:', action);
        }

        const response = await fetch('/.netlify/functions/fetch-report', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action, data })
        });

        const result = await response.json();
        
        console.log('API Response:', {
            status: response.status,
            ok: response.ok,
            result: result
        });
        
        // Handle auth errors
        if (result.needs_auth) {
            console.log('Auth required, clearing tokens');
            this.clearQBTokens();
            throw new Error(result.error + ' Please reconnect to QuickBooks.');
        }

        if (!response.ok) {
            throw new Error(result.error || 'API request failed');
        }

        return result;
    }

    showLoading(message = 'Processing billing data...') {
        this.loadingElement.querySelector('p').textContent = message;
        this.loadingElement.classList.remove('hidden');
        this.hideError();
        this.hideBillingSummary();
    }

    hideLoading() {
        this.loadingElement.classList.add('hidden');
    }

    showError(errors) {
        this.errorSection.classList.remove('hidden');
        
        const missingCustomers = document.getElementById('missing-customers');
        const unmappedCustomers = document.getElementById('unmapped-customers');
        
        if (errors.missing_customers && errors.missing_customers.length > 0) {
            missingCustomers.innerHTML = `
                <h4>Missing Customers in System:</h4>
                <ul>${errors.missing_customers.map(c => `<li>${c}</li>`).join('')}</ul>
            `;
        } else {
            missingCustomers.innerHTML = '';
        }

        if (errors.unmapped_customers && errors.unmapped_customers.length > 0) {
            unmappedCustomers.innerHTML = `
                <h4>Customers Not Found in QuickBooks:</h4>
                <ul>${errors.unmapped_customers.map(c => `<li>${c}</li>`).join('')}</ul>
            `;
        } else {
            unmappedCustomers.innerHTML = '';
        }

        // Handle general errors
        if (errors.general && errors.general.length > 0) {
            missingCustomers.innerHTML = `
                <h4>Error:</h4>
                <ul>${errors.general.map(e => `<li>${e}</li>`).join('')}</ul>
            `;
        }
    }

    hideError() {
        this.errorSection.classList.add('hidden');
    }

    showBillingSummary(data) {
        this.currentData = data;
        this.billingSection.classList.remove('hidden');
        this.invoiceActions.classList.remove('hidden');

        // Display summary stats
        const statsGrid = document.getElementById('summary-stats');
        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>💰 Total Revenue</h3>
                <p class="stat-value">$${data.total_revenue.toLocaleString()}</p>
            </div>
            <div class="stat-card">
                <h3>👥 Active Customers</h3>
                <p class="stat-value">${data.customer_count}</p>
            </div>
            <div class="stat-card">
                <h3>📦 Total Shipments</h3>
                <p class="stat-value">${data.total_shipments}</p>
            </div>
            <div class="stat-card">
                <h3>⚠️ Issues Found</h3>
                <p class="stat-value">${data.issues_count || 0}</p>
            </div>
        `;

        // Display customer list
        const customerList = document.getElementById('customer-list');
        customerList.innerHTML = `
            <h3>Customer Billing Details</h3>
            <div class="customer-grid">
                ${data.customers.map(customer => this.renderCustomerCard(customer)).join('')}
            </div>
        `;
    }

    renderCustomerCard(customer) {
        return `
            <div class="customer-card">
                <h4>${customer.name}</h4>
                <div class="customer-details">
                    <p><strong>LTL Shipments:</strong> ${customer.ltl_count} ($${customer.ltl_total.toLocaleString()})</p>
                    <p><strong>Small Package:</strong> ${customer.small_package_count} ($${customer.small_package_total.toLocaleString()})</p>
                    <p><strong>Storage Fee:</strong> $${customer.storage_fee.toLocaleString()}</p>
                    ${customer.other_charges ? `<p><strong>Other Charges:</strong> $${customer.other_charges.toLocaleString()}</p>` : ''}
                    <p class="total"><strong>Total:</strong> $${customer.total.toLocaleString()}</p>
                </div>
                <div class="customer-status">
                    <span class="status ${customer.qb_status}">${customer.qb_status}</span>
                </div>
            </div>
        `;
    }

    hideBillingSummary() {
        this.billingSection.classList.add('hidden');
        this.invoiceActions.classList.add('hidden');
    }

    async fetchBillingData(selectedMonth = null) {
        try {
            this.showLoading('Fetching billing data...');
            
            const requestData = {};
            if (selectedMonth) {
                requestData.month = selectedMonth;
            }
            
            const data = await this.makeAPIRequest('fetch_billing_data', requestData);
            
            this.hideLoading();

            if (data.errors && (data.errors.missing_customers.length > 0 || data.errors.unmapped_customers.length > 0)) {
                this.showError(data.errors);
                
                // Show customer pricing setup for missing customers
                if (data.errors.missing_customers.length > 0) {
                    this.showCustomerPricingSetup(data.errors.missing_customers[0]);
                }
            }

            if (data.billing_summary) {
                this.showBillingSummary(data.billing_summary);
            }

        } catch (error) {
            this.hideLoading();
            this.showError({ general: [error.message] });
            console.error('Error fetching billing data:', error);
        }
    }

    async refreshQBCustomers() {
        // If not connected, initiate connection
        if (!this.qbTokens) {
            await this.connectQuickBooks();
            return;
        }

        try {
            this.showLoading('Refreshing QuickBooks customers...');
            
            const data = await this.makeAPIRequest('refresh_qb_customers');
            
            console.log('QB Customers refresh result:', data);
            
            if (data.success) {
                this.showNotification(data.message, 'success');
                
                // Always fetch billing data to show updated customer information
                console.log('Fetching billing data after QB refresh...');
                await this.fetchBillingData();
            } else {
                this.hideLoading();
                throw new Error(data.error);
            }

        } catch (error) {
            this.hideLoading();
            this.showError({ general: [error.message] });
            console.error('Error refreshing QB customers:', error);
        }
    }

    async approveAllInvoices() {
        if (!this.currentData) {
            this.showError({ general: ['No billing data available'] });
            return;
        }

        try {
            this.showLoading('Approving all invoices...');
            
            const data = await this.makeAPIRequest('approve_invoices', this.currentData);
            
            this.hideLoading();
            
            if (data.success) {
                this.showNotification(data.message, 'success');
            } else {
                throw new Error(data.error);
            }

        } catch (error) {
            this.hideLoading();
            this.showError({ general: [error.message] });
            console.error('Error approving invoices:', error);
        }
    }

    async createQBInvoices() {
        if (!this.currentData) {
            this.showError({ general: ['No billing data available'] });
            return;
        }

        if (!this.qbTokens) {
            this.showError({ general: ['Please connect to QuickBooks first'] });
            return;
        }

        try {
            this.showLoading('Creating QuickBooks invoices...');
            
            const data = await this.makeAPIRequest('create_qb_invoices', this.currentData);
            
            this.hideLoading();
            
            if (data.success) {
                this.showNotification(data.message, 'success');
            } else {
                throw new Error(data.error);
            }

        } catch (error) {
            this.hideLoading();
            this.showError({ general: [error.message] });
            console.error('Error creating QB invoices:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
    
    // Load available months for selection
    async loadAvailableMonths() {
        try {
            const data = await this.makeAPIRequest('get_available_months');
            
            if (data.success) {
                this.monthSelect.innerHTML = '<option value="">Select Month</option>';
                
                data.months.forEach(month => {
                    const option = document.createElement('option');
                    option.value = month;
                    option.textContent = month;
                    this.monthSelect.appendChild(option);
                });
                
                // Select current month by default
                if (data.months.length > 0) {
                    this.monthSelect.value = data.months[0];
                }
            }
        } catch (error) {
            console.error('Error loading available months:', error);
            this.monthSelect.innerHTML = '<option value="">Error loading months</option>';
        }
    }
    
    // Show customer pricing setup modal
    showCustomerPricingSetup(customerName) {
        this.currentCustomerForPricing = customerName;
        document.getElementById('customer-name').textContent = customerName;
        this.pricingModal.classList.remove('hidden');
    }
    
    // Save customer pricing data
    async saveCustomerPricing() {
        try {
            const customerName = this.currentCustomerForPricing;
            
            // Collect form data
            const pricingData = {
                ltl_pricing: {
                    tiers: [
                        {
                            min: parseInt(document.getElementById('ltl-tier1-min').value) || 0,
                            max: parseInt(document.getElementById('ltl-tier1-max').value) || 50,
                            rate: parseFloat(document.getElementById('ltl-tier1-rate').value) || 25
                        },
                        {
                            min: parseInt(document.getElementById('ltl-tier2-min').value) || 51,
                            max: parseInt(document.getElementById('ltl-tier2-max').value) || 100,
                            rate: parseFloat(document.getElementById('ltl-tier2-rate').value) || 20
                        },
                        {
                            min: parseInt(document.getElementById('ltl-tier3-min').value) || 101,
                            max: null,
                            rate: parseFloat(document.getElementById('ltl-tier3-rate').value) || 15
                        }
                    ]
                },
                small_package_pricing: {
                    tiers: [
                        {
                            min: parseInt(document.getElementById('sp-tier1-min').value) || 0,
                            max: parseInt(document.getElementById('sp-tier1-max').value) || 500,
                            rate: parseFloat(document.getElementById('sp-tier1-rate').value) || 2
                        },
                        {
                            min: parseInt(document.getElementById('sp-tier2-min').value) || 501,
                            max: parseInt(document.getElementById('sp-tier2-max').value) || 1000,
                            rate: parseFloat(document.getElementById('sp-tier2-rate').value) || 1.5
                        },
                        {
                            min: parseInt(document.getElementById('sp-tier3-min').value) || 1001,
                            max: null,
                            rate: parseFloat(document.getElementById('sp-tier3-rate').value) || 1
                        }
                    ]
                },
                storage_fee: parseFloat(document.getElementById('storage-fee').value) || 0,
                contract_minimum: parseFloat(document.getElementById('contract-minimum').value) || 0,
                payment_method: document.getElementById('payment-method').value || 'Net 30'
            };
            
            // Save to backend
            const response = await this.makeAPIRequest('save_customer_pricing', {
                customerName: customerName,
                pricingData: pricingData
            });
            
            if (response.success) {
                this.showNotification(response.message, 'success');
                this.closePricingModal();
                
                // Refresh billing data
                const selectedMonth = this.monthSelect.value;
                this.fetchBillingData(selectedMonth);
            } else {
                throw new Error(response.error);
            }
            
        } catch (error) {
            this.showError({ general: [error.message] });
            console.error('Error saving customer pricing:', error);
        }
    }
    
    // Close pricing modal
    closePricingModal() {
        this.pricingModal.classList.add('hidden');
        this.currentCustomerForPricing = null;
    }
}

// Global functions for modal controls
function closePricingModal() {
    window.billingApp.closePricingModal();
}

function savePricingData() {
    window.billingApp.saveCustomerPricing();
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.billingApp = new BillingApp();
}); 