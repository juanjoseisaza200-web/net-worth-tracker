# Net Worth Tracker

A mobile-friendly Progressive Web App (PWA) for tracking expenses and managing your net worth with support for multiple currencies.

## Features

- **Expense Tracking**: Record and categorize your expenses with date tracking
- **Stock Investments**: Track your stock portfolio with shares, purchase price, and current price
- **Crypto Investments**: Monitor your cryptocurrency holdings
- **Fixed Income Investments**: Add savings accounts, bonds, and other fixed income investments with interest rates
- **Variable Investments**: Track any other variable income investments (real estate, commodities, etc.)
- **Net Worth Dashboard**: View your total net worth at a glance
- **Multi-Currency Support**: All values can be displayed in USD, COP, EUR, GBP, JPY, CAD, or AUD with automatic conversion
- **Mobile-First Design**: Responsive UI optimized for mobile devices
- **Offline Support**: Works offline as a PWA, data stored locally

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### Adding Expenses

1. Navigate to the "Expenses" tab
2. Click "Add Expense"
3. Fill in the details (description, amount, currency, category, date)
4. Click "Add Expense" to save

### Adding Investments

1. Navigate to the "Investments" tab
2. Select the investment type (Stocks, Crypto, Fixed, or Variable)
3. Click "Add [Type]"
4. Fill in the required information
5. Save your investment

### Viewing Net Worth

- The Dashboard shows your total net worth in your selected base currency
- All investments are automatically converted to the base currency
- You can change the base currency from the dropdown in the Dashboard

### Currency Conversion

- All currencies are converted relative to USD
- To update exchange rates, you can integrate a real-time API in `src/utils/currency.ts`
- Currently uses approximate exchange rates (see the file for details)

## Project Structure

```
src/
  components/
    Dashboard.tsx      # Main dashboard with net worth overview
    Expenses.tsx        # Expense tracking interface
    Investments.tsx     # Investment management interface
  utils/
    storage.ts          # Local storage utilities
    currency.ts         # Currency conversion utilities
    calculations.ts     # Net worth and expense calculations
  types.ts             # TypeScript type definitions
  App.tsx              # Main app component with routing
  main.tsx             # Entry point
  index.css            # Global styles
```

## Data Storage

All data is stored locally in your browser's localStorage. This means:
- Your data stays on your device
- No account or internet connection required
- Data persists between sessions

## Future Enhancements

- Real-time exchange rate API integration
- Real-time stock and crypto price updates
- Data export/import functionality
- Charts and graphs for trends
- Recurring expense tracking
- Budget planning features

## Technologies Used

- React 18
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Lucide React (icons)
- Vite PWA Plugin

## License

MIT

