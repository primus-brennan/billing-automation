# 📊 Billing Automation System

An automated billing system with QuickBooks Online integration for processing shipping data and generating invoices.

## ✨ Features

- **Automated Data Fetching**: Pulls billing data from external sources
- **Tiered Pricing Calculation**: Supports complex pricing tiers for LTL and small package shipments
- **Customer Management**: Maps report names to internal customer configurations
- **QuickBooks Integration**: Syncs customers and creates draft invoices
- **Error Handling**: Identifies missing customers and unmapped data
- **Modern UI**: Clean, responsive interface with loading states and notifications

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ installed
- Netlify CLI installed (`npm install -g netlify-cli`)

### Installation

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** to `http://localhost:8888`

## 🏗️ Project Structure

```
billing-automation/
├── data/
│   ├── customers.json      # Customer pricing configurations
│   └── name-mapping.json   # Maps report names to customer IDs
├── netlify/
│   └── functions/
│       └── fetch-report.js # Backend API function
├── public/
│   ├── index.html          # Main UI
│   ├── app.js             # Frontend JavaScript
│   └── styles.css         # Styling
└── package.json
```

## 💰 How It Works

### 1. Customer Configuration (`data/customers.json`)
Each customer has:
- **Tiered pricing** for LTL and small packages
- **Storage fees** and contract minimums
- **Payment methods** and QuickBooks customer IDs
- **Custom pricing** for additional services

### 2. Name Mapping (`data/name-mapping.json`)
Maps report names from external sources to internal customer IDs:
```json
{
  "report_name_to_customer_id": {
    "AB Trucking": "abc-company",
    "ACF Global Logistics": "xyz-corp"
  }
}
```

### 3. Billing Process
1. **Fetch Data**: Retrieves shipment data from external sources
2. **Map Customers**: Links report names to customer configurations
3. **Calculate Charges**: Applies tiered pricing and adds fees
4. **Generate Summary**: Shows totals and identifies issues
5. **Create Invoices**: Generates draft invoices in QuickBooks

## 🎯 Usage

### Main Actions

1. **🔄 Fetch Latest Data**
   - Retrieves current billing data
   - Calculates charges for each customer
   - Shows billing summary and any issues

2. **📋 Refresh QB Customers**
   - Updates QuickBooks customer mappings
   - Syncs customer IDs between systems

3. **✅ Approve All Invoices**
   - Marks all invoices as approved
   - Prepares them for QuickBooks creation

4. **📋 Create QB Draft Invoices**
   - Creates draft invoices in QuickBooks
   - Only processes customers with valid QB IDs

### Understanding the Interface

- **Stats Grid**: Shows total revenue, customers, shipments, and issues
- **Customer Cards**: Individual billing details with QB status
- **Error Sections**: Highlights missing customers and mapping issues
- **Notifications**: Success/error messages for user actions

## 📋 Pricing Configuration

### Tiered Pricing Structure
```json
{
  "ltl_pricing": {
    "minimum": 350,
    "tiers": [
      {"up_to": 499, "rate": 1.50},
      {"up_to": 999, "rate": 1.25},
      {"up_to": null, "rate": 1.00}
    ]
  }
}
```

- **up_to**: Maximum units for this tier (null = unlimited)
- **rate**: Price per unit in this tier
- **minimum**: Minimum charge regardless of usage

### Example Calculation
- Customer has 750 LTL shipments
- Tier 1 (0-499): 499 × $1.50 = $748.50
- Tier 2 (500-750): 251 × $1.25 = $313.75
- Total: $1,062.25 (above $350 minimum)

## 🔧 Customization

### Adding New Customers
1. Add customer config to `data/customers.json`
2. Add name mapping to `data/name-mapping.json`
3. Update QuickBooks customer ID after sync

### Modifying Pricing
Edit the pricing tiers in `data/customers.json`:
- Adjust rates and tier limits
- Modify minimum charges
- Add custom pricing for services

### Data Sources
Update `fetchBillingDataFromSource()` in `netlify/functions/fetch-report.js` to:
- Connect to your data source
- Parse different report formats
- Handle authentication

## 🚀 Deployment

### Netlify Deployment
1. **Connect your repository** to Netlify
2. **Set build command**: `npm run build`
3. **Set publish directory**: `public`
4. **Deploy**: Netlify will automatically deploy on push

### Environment Variables
For production, set:
- `QUICKBOOKS_CLIENT_ID`: Your QuickBooks app ID
- `QUICKBOOKS_CLIENT_SECRET`: Your QuickBooks app secret
- `DATA_SOURCE_URL`: URL for your billing data source

## 🔐 Security Notes

- Customer data is stored locally in JSON files
- QuickBooks OAuth tokens should be encrypted
- Consider database storage for production use
- Implement proper authentication for admin functions

## 🐛 Troubleshooting

### Common Issues

1. **Function not found**: Ensure Netlify CLI is running with `npm run dev`
2. **CORS errors**: Check that fetch URLs match your deployment URL
3. **Missing customers**: Verify name mapping in `data/name-mapping.json`
4. **QuickBooks sync issues**: Check customer IDs and OAuth tokens

### Debug Mode
Set `NODE_ENV=development` to see detailed error messages and stack traces.

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request 