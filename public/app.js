// Billing Automation Frontend
class BillingApp {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadingElement = document.getElementById('loading');
        this.errorSection = document.getElementById('error-section');
        this.billingSection = document.getElementById('billing-summary');
        this.invoiceActions = document.getElementById('invoice-actions');
        this.currentData = null;
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

    async fetchBillingData() {
        try {
            this.showLoading('Fetching billing data...');
            
            const response = await fetch('/.netlify/functions/fetch-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'fetch_billing_data' })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch billing data');
            }

            this.hideLoading();

            if (data.errors && (data.errors.missing_customers.length > 0 || data.errors.unmapped_customers.length > 0)) {
                this.showError(data.errors);
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
        try {
            this.showLoading('Refreshing QuickBooks customers...');
            
            const response = await fetch('/.netlify/functions/fetch-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'refresh_qb_customers' })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to refresh QuickBooks customers');
            }

            this.hideLoading();
            
            // Show success message
            this.showNotification('QuickBooks customers refreshed successfully!', 'success');
            
            // Refresh billing data to update QB status
            if (this.currentData) {
                this.fetchBillingData();
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
            
            const response = await fetch('/.netlify/functions/fetch-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    action: 'approve_invoices',
                    data: this.currentData 
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to approve invoices');
            }

            this.hideLoading();
            this.showNotification('All invoices approved successfully!', 'success');

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

        try {
            this.showLoading('Creating QuickBooks draft invoices...');
            
            const response = await fetch('/.netlify/functions/fetch-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    action: 'create_qb_invoices',
                    data: this.currentData 
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create QuickBooks invoices');
            }

            this.hideLoading();
            this.showNotification(`Created ${data.invoices_created} draft invoices in QuickBooks!`, 'success');

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
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BillingApp();
}); 