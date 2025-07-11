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
        
        // QB Connect button
        document.getElementById('qb-connect-btn').addEventListener('click', () => {
            if (this.qbTokens) {
                // If already connected, disconnect
                this.clearQBTokens();
            } else {
                // If not connected, connect
                this.connectQuickBooks();
            }
        });
        
        // Add test QB API button if it exists
        const testQBBtn = document.getElementById('test-qb-api-btn');
        if (testQBBtn) {
            testQBBtn.addEventListener('click', () => {
                this.testQBAPI();
            });
        }
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
        const qbConnectBtn = document.getElementById('qb-connect-btn');
        const qbStatusIndicator = document.getElementById('qb-status-indicator');
        const qbStatusText = document.getElementById('qb-status-text-main');
        const qbConnectionStatus = document.getElementById('qb-connection-status');
        
        if (this.qbTokens) {
            // Update main buttons
            refreshBtn.innerHTML = '🔄 Refresh QB Customers';
            refreshBtn.classList.remove('needs-auth');
            createBtn.classList.remove('needs-auth');
            
            // Update connection status in header
            qbStatusIndicator.textContent = '✅';
            qbStatusIndicator.classList.remove('disconnected');
            qbStatusIndicator.classList.add('connected');
            qbStatusText.textContent = 'Connected to QuickBooks';
            qbConnectionStatus.classList.add('connected');
            qbConnectBtn.innerHTML = '🔓 Disconnect';
            qbConnectBtn.classList.remove('primary');
            qbConnectBtn.classList.add('secondary');
            
        } else {
            // Update main buttons
            refreshBtn.innerHTML = '🔗 Connect QuickBooks';
            refreshBtn.classList.add('needs-auth');
            createBtn.classList.add('needs-auth');
            
            // Update connection status in header
            qbStatusIndicator.textContent = '❌';
            qbStatusIndicator.classList.remove('connected');
            qbStatusIndicator.classList.add('disconnected');
            qbStatusText.textContent = 'Not connected to QuickBooks';
            qbConnectionStatus.classList.remove('connected');
            qbConnectBtn.innerHTML = '🔗 Connect to QuickBooks';
            qbConnectBtn.classList.remove('secondary');
            qbConnectBtn.classList.add('primary');
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
                // Filter out invalid customer names from errors
                const validMissingCustomers = data.errors.missing_customers.filter(name => 
                    this.isValidCustomerName(name)
                );
                
                const validUnmappedCustomers = data.errors.unmapped_customers.filter(name => 
                    this.isValidCustomerName(name)
                );
                
                // Only show errors if there are valid customers with issues
                if (validMissingCustomers.length > 0 || validUnmappedCustomers.length > 0) {
                    this.showError({
                        missing_customers: validMissingCustomers,
                        unmapped_customers: validUnmappedCustomers
                    });
                    
                    // Show customer pricing setup for first valid missing customer
                    if (validMissingCustomers.length > 0) {
                        this.showCustomerPricingSetup(validMissingCustomers[0]);
                    }
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
        // Validate customer name before showing modal
        if (!this.isValidCustomerName(customerName)) {
            console.log('Invalid customer name detected, skipping modal:', customerName);
            return;
        }
        
        this.currentCustomerForPricing = customerName;
        document.getElementById('customer-name').textContent = customerName;
        
        // Initialize with default tiers
        this.initializePricingTiers();
        
        // Load QuickBooks customers for selection
        this.loadQBCustomersForPricing();
        
        this.pricingModal.classList.remove('hidden');
    }
    
    // Initialize pricing tiers with default values
    initializePricingTiers() {
        // Clear existing tiers
        document.getElementById('ltl-tiers-container').innerHTML = '';
        document.getElementById('sp-tiers-container').innerHTML = '';
        
        // Add default LTL tiers
        this.addLTLTier(0, 50, 25);
        this.addLTLTier(51, 100, 20);
        this.addLTLTier(101, null, 15);
        
        // Add default SP tiers
        this.addSPTier(0, 500, 2);
        this.addSPTier(501, 1000, 1.5);
        this.addSPTier(1001, null, 1);
        
        // Reset checkbox
        document.getElementById('use-ltl-pricing').checked = false;
        document.getElementById('small-package-pricing-section').classList.remove('hidden');
    }
    
    // Add LTL tier
    addLTLTier(minVal = '', maxVal = '', rateVal = '') {
        const container = document.getElementById('ltl-tiers-container');
        const tierCount = container.children.length;
        const tierId = `ltl-tier-${Date.now()}-${tierCount}`;
        
        const tierDiv = document.createElement('div');
        tierDiv.className = 'tier';
        tierDiv.innerHTML = `
            <input type="number" name="ltl-min" placeholder="0" value="${minVal}" min="0">
            <input type="number" name="ltl-max" placeholder="unlimited" value="${maxVal === null ? '' : maxVal}" min="0">
            <input type="number" name="ltl-rate" placeholder="0.00" value="${rateVal}" step="0.01" min="0">
            <div class="tier-actions">
                <button type="button" class="remove-tier-btn" onclick="removeTier(this)">🗑️</button>
            </div>
        `;
        
        // Handle unlimited for last tier
        if (maxVal === null) {
            const maxInput = tierDiv.querySelector('input[name="ltl-max"]');
            maxInput.placeholder = 'unlimited';
            maxInput.readOnly = true;
            maxInput.style.background = '#f7fafc';
        }
        
        container.appendChild(tierDiv);
    }
    
    // Add Small Package tier
    addSPTier(minVal = '', maxVal = '', rateVal = '') {
        const container = document.getElementById('sp-tiers-container');
        const tierCount = container.children.length;
        const tierId = `sp-tier-${Date.now()}-${tierCount}`;
        
        const tierDiv = document.createElement('div');
        tierDiv.className = 'tier';
        tierDiv.innerHTML = `
            <input type="number" name="sp-min" placeholder="0" value="${minVal}" min="0">
            <input type="number" name="sp-max" placeholder="unlimited" value="${maxVal === null ? '' : maxVal}" min="0">
            <input type="number" name="sp-rate" placeholder="0.00" value="${rateVal}" step="0.01" min="0">
            <div class="tier-actions">
                <button type="button" class="remove-tier-btn" onclick="removeTier(this)">🗑️</button>
            </div>
        `;
        
        // Handle unlimited for last tier
        if (maxVal === null) {
            const maxInput = tierDiv.querySelector('input[name="sp-max"]');
            maxInput.placeholder = 'unlimited';
            maxInput.readOnly = true;
            maxInput.style.background = '#f7fafc';
        }
        
        container.appendChild(tierDiv);
    }
    
    // Remove tier
    removeTier(button) {
        const tier = button.closest('.tier');
        tier.remove();
    }
    
    // Toggle small package pricing section
    toggleSmallPackagePricing() {
        const checkbox = document.getElementById('use-ltl-pricing');
        const section = document.getElementById('small-package-pricing-section');
        
        if (checkbox.checked) {
            section.classList.add('hidden');
        } else {
            section.classList.remove('hidden');
        }
    }
    
    // Validate if a string is a valid customer name
    isValidCustomerName(name) {
        if (!name || typeof name !== 'string') {
            return false;
        }
        
        const trimmedName = name.trim();
        
        // Must be at least 4 characters
        if (trimmedName.length < 4) {
            return false;
        }
        
        // Must contain letters
        if (!trimmedName.match(/[a-zA-Z]/)) {
            return false;
        }
        
        // Must not be just a number
        if (trimmedName.match(/^\d+$/)) {
            return false;
        }
        
        // Must not be a 4-digit year
        if (trimmedName.match(/^\d{4}$/)) {
            return false;
        }
        
        // Must not be date formats
        if (trimmedName.match(/^[A-Za-z]+-\d{4}$/)) { // Month-Year format (e.g., "August-2022")
            return false;
        }
        
        if (trimmedName.match(/^[A-Za-z]+\s+\d{4}$/)) { // Month Year format (e.g., "August 2022")
            return false;
        }
        
        if (trimmedName.match(/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}$/)) { // Date formats
            return false;
        }
        
        if (trimmedName.match(/^\d{4}-\d{2}-\d{2}$/)) { // YYYY-MM-DD format
            return false;
        }
        
        // Must not be month names
        if (this.isMonthName(trimmedName)) {
            return false;
        }
        
        // Must not be common non-customer terms
        const invalidTerms = [
            'total', 'sum', 'date', 'month', 'year', 'customer', 'name', 
            'ltl', 'package', 'shipment', 'report', 'data', 'undefined', 
            'null', 'error', 'loading', 'n/a', 'na', 'none', 'period'
        ];
        
        if (invalidTerms.includes(trimmedName.toLowerCase())) {
            return false;
        }
        
        return true;
    }
    
    // Helper function to check if string is a month name
    isMonthName(str) {
        const months = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december',
            'jan', 'feb', 'mar', 'apr', 'may', 'jun',
            'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ];
        return months.includes(str.toLowerCase().trim());
    }
    
    // Save customer pricing data
    async saveCustomerPricing() {
        try {
            const customerName = this.currentCustomerForPricing;
            
            // Collect LTL tiers
            const ltlTiers = [];
            const ltlContainer = document.getElementById('ltl-tiers-container');
            const ltlTierDivs = ltlContainer.querySelectorAll('.tier');
            
            ltlTierDivs.forEach((tierDiv, index) => {
                const minInput = tierDiv.querySelector('input[name="ltl-min"]');
                const maxInput = tierDiv.querySelector('input[name="ltl-max"]');
                const rateInput = tierDiv.querySelector('input[name="ltl-rate"]');
                
                const min = parseInt(minInput.value) || 0;
                const maxValue = maxInput.value.trim();
                const max = (maxValue === '' || maxValue === 'unlimited') ? null : parseInt(maxValue);
                const rate = parseFloat(rateInput.value) || 0;
                
                if (rate > 0) {
                    ltlTiers.push({ min, max, rate });
                }
            });
            
            // Collect Small Package tiers (if not using LTL pricing)
            const useLTLPricing = document.getElementById('use-ltl-pricing').checked;
            let smallPackageTiers = [];
            
            if (!useLTLPricing) {
                const spContainer = document.getElementById('sp-tiers-container');
                const spTierDivs = spContainer.querySelectorAll('.tier');
                
                spTierDivs.forEach((tierDiv, index) => {
                    const minInput = tierDiv.querySelector('input[name="sp-min"]');
                    const maxInput = tierDiv.querySelector('input[name="sp-max"]');
                    const rateInput = tierDiv.querySelector('input[name="sp-rate"]');
                    
                    const min = parseInt(minInput.value) || 0;
                    const maxValue = maxInput.value.trim();
                    const max = (maxValue === '' || maxValue === 'unlimited') ? null : parseInt(maxValue);
                    const rate = parseFloat(rateInput.value) || 0;
                    
                    if (rate > 0) {
                        smallPackageTiers.push({ min, max, rate });
                    }
                });
            } else {
                // Use LTL pricing structure for small packages
                smallPackageTiers = ltlTiers;
            }
            
            // Collect form data
            const pricingData = {
                ltl_pricing: {
                    tiers: ltlTiers
                },
                small_package_pricing: {
                    tiers: smallPackageTiers,
                    use_ltl_pricing: useLTLPricing
                },
                storage_fee: parseFloat(document.getElementById('storage-fee').value) || 0,
                contract_minimum: parseFloat(document.getElementById('contract-minimum').value) || 0,
                payment_method: document.getElementById('payment-method').value || 'Net 30',
                qb_customer_id: document.getElementById('qb-customer-select').value || null
            };
            
            console.log('Saving pricing data:', pricingData);
            
            // Validate that we have at least one tier
            if (ltlTiers.length === 0) {
                throw new Error('Please add at least one LTL pricing tier.');
            }
            
            // Validate required fields
            const contractMinimum = parseFloat(document.getElementById('contract-minimum').value);
            if (isNaN(contractMinimum) || contractMinimum < 0) {
                throw new Error('Contract minimum is required and must be a valid number.');
            }
            
            const qbCustomerId = document.getElementById('qb-customer-select').value;
            if (!qbCustomerId) {
                throw new Error('Please select a QuickBooks customer for invoicing.');
            }
            
            // Save to backend
            const response = await this.makeAPIRequest('save_customer_pricing', {
                customerName: customerName,
                pricingData: pricingData
            });
            
            if (response && response.success) {
                this.showNotification(response.message, 'success');
                this.closePricingModal();
                
                // Refresh billing data
                const selectedMonth = this.monthSelect.value;
                this.fetchBillingData(selectedMonth);
            } else {
                throw new Error(response?.error || 'Failed to save customer pricing');
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
    
    // Test QB API with specific company ID
    async testQBAPI() {
        if (!this.qbTokens) {
            this.showError({ general: ['Please connect to QuickBooks first'] });
            return;
        }
        
        try {
            this.showLoading('Testing QuickBooks API...');
            
            const response = await this.makeAPIRequest('test_qb_api', {
                companyId: '1181726965'
            });
            
            this.hideLoading();
            
            if (response.success) {
                this.showNotification(`✅ Test successful! Found ${response.customers.length} customers`, 'success');
                console.log('Test API Response:', response);
            } else {
                this.showError({ general: [`Test failed: ${response.error}`] });
                console.error('Test API Error:', response);
            }
        } catch (error) {
            this.hideLoading();
            this.showError({ general: [`Test failed: ${error.message}`] });
            console.error('Test QB API error:', error);
        }
    }

    // Load QuickBooks customers for pricing assignment
    async loadQBCustomersForPricing() {
        const select = document.getElementById('qb-customer-select');
        const statusText = document.getElementById('qb-status-text');
        
        // Check if QuickBooks is connected
        if (!this.qbTokens) {
            select.innerHTML = '<option value="">QuickBooks not connected</option>';
            statusText.innerHTML = '⚠️ QuickBooks not connected. <a href="#" onclick="window.billingApp.connectQuickBooks()">Connect QuickBooks</a> to link customers.';
            statusText.style.color = '#f56565';
            return;
        }
        
        try {
            statusText.innerHTML = '<span class="loading-indicator">🔄</span> Loading QuickBooks customers...';
            statusText.style.color = '#4a5568';
            
            // Get QB customers directly
            const qbCustomersResponse = await this.makeAPIRequest('get_qb_customers');
            
            console.log('QB customers response:', qbCustomersResponse);
            
            if (qbCustomersResponse && qbCustomersResponse.success && qbCustomersResponse.customers) {
                select.innerHTML = '<option value="">Select QuickBooks Customer (REQUIRED)</option>';
                
                qbCustomersResponse.customers.forEach(customer => {
                    const option = document.createElement('option');
                    option.value = customer.Id;
                    option.textContent = customer.Name || customer.CompanyName;
                    select.appendChild(option);
                });
                
                statusText.innerHTML = `✅ Found ${qbCustomersResponse.customers.length} QuickBooks customers`;
                statusText.style.color = '#38a169';
            } else {
                throw new Error('Failed to load QuickBooks customers: ' + (qbCustomersResponse?.error || 'Unknown error'));
            }
            
        } catch (error) {
            console.error('Error loading QB customers for pricing:', error);
            select.innerHTML = '<option value="">Error loading customers</option>';
            statusText.innerHTML = `❌ ${error.message}`;
            statusText.style.color = '#f56565';
        }
    }
}

// Global functions for modal controls
function closePricingModal() {
    window.billingApp.closePricingModal();
}

function savePricingData() {
    window.billingApp.saveCustomerPricing();
}

function addLTLTier() {
    window.billingApp.addLTLTier();
}

function addSPTier() {
    window.billingApp.addSPTier();
}

function removeTier(button) {
    window.billingApp.removeTier(button);
}

function toggleSmallPackagePricing() {
    window.billingApp.toggleSmallPackagePricing();
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.billingApp = new BillingApp();
}); 