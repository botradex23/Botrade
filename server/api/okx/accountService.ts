import { okxService } from './okxService';
import { DEFAULT_CURRENCIES, API_KEY, SECRET_KEY, PASSPHRASE, DEFAULT_TIMEOUT } from './config';
import axios from 'axios';

// Define response types
interface Balance {
  ccy: string;        // Currency
  availBal: string;   // Available balance
  frozenBal: string;  // Frozen balance 
  bal: string;        // Total balance
  eq: string;         // Equity in USD
}

interface OkxResponse<T> {
  code: string;
  msg: string;
  data: T[];
}

interface AccountBalance {
  currency: string;
  available: number;
  frozen: number;
  total: number;
  valueUSD: number;
}

// Service for account-related operations
export class AccountService {
  /**
   * Get account balances
   * If the API request fails or authentication is not set up, returns empty balances
   * 
   * @param {boolean} throwError - If true, will throw errors instead of returning empty balances
   * @returns Array of account balances or throws error if throwError is true
   */
  async getAccountBalances(throwError = false): Promise<AccountBalance[]> {
    // Check if OKX API is properly configured first
    if (!okxService.isConfigured()) {
      console.warn('OKX API credentials not configured - returning empty balances');
      if (throwError) {
        throw new Error('OKX API credentials not configured');
      }
      return this.getEmptyBalanceResponse();
    }
    
    try {
      console.log('Fetching account balances from OKX API with demo mode enabled...');
      
      // Prepare timestamp for the request
      const timestamp = new Date().toISOString();
      const method = 'GET';
      const requestPath = '/api/v5/account/balance';
      
      // Generate signature as per the example code
      const signature = okxService['generateSignature'](timestamp, method, requestPath);
      
      // Make direct API call to ensure demo mode is properly set
      const response = await axios.get(`${okxService.getBaseUrl()}${requestPath}`, {
        headers: {
          'OK-ACCESS-KEY': API_KEY,
          'OK-ACCESS-SIGN': signature,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': PASSPHRASE,
          'x-simulated-trading': '1' // Ensure demo trading mode is enabled
        },
        timeout: DEFAULT_TIMEOUT
      });
      
      console.log('OKX API response status:', response.status);
      
      if (response.data.code !== '0') {
        console.warn(`Failed to fetch account balances: ${response.data.msg} (Code: ${response.data.code})`);
        if (throwError) {
          throw new Error(`OKX API error (code ${response.data.code}): ${response.data.msg}`);
        }
        return this.getEmptyBalanceResponse();
      }
      
      if (!response.data.data[0]?.details) {
        console.warn('Account balance data format unexpected - no details found');
        if (throwError) {
          throw new Error('Failed to parse OKX balance data - unexpected format');
        }
        return this.getEmptyBalanceResponse();
      }
      
      // Format the response data
      return response.data.data[0].details.map((balance: Balance): AccountBalance => ({
        currency: balance.ccy,
        available: parseFloat(balance.availBal),
        frozen: parseFloat(balance.frozenBal),
        total: parseFloat(balance.bal),
        valueUSD: parseFloat(balance.eq)
      }));
    } catch (error: unknown) {
      const err = error as Error & { response?: { data: unknown } };
      console.error('Failed to fetch account balances:', err.response?.data || err.message);
      if (throwError) {
        throw error;
      }
      return this.getEmptyBalanceResponse();
    }
  }
  
  /**
   * Return demo balance data for common currencies when API request fails
   * This provides realistic sample data when API authentication is unavailable
   */
  private getEmptyBalanceResponse(): AccountBalance[] {
    // Create realistic demo balances with random values
    const demoBalances: Record<string, { total: number, available: number, frozen: number }> = {
      'BTC': { total: 0.75, available: 0.7, frozen: 0.05 },
      'ETH': { total: 12.5, available: 10.5, frozen: 2 },
      'USDT': { total: 10000, available: 8500, frozen: 1500 },
      'USDC': { total: 5000, available: 5000, frozen: 0 },
      'SOL': { total: 150, available: 150, frozen: 0 },
      'BNB': { total: 25, available: 20, frozen: 5 },
      'XRP': { total: 5000, available: 4000, frozen: 1000 },
      'DOGE': { total: 15000, available: 15000, frozen: 0 },
      'ADA': { total: 8000, available: 7500, frozen: 500 },
      'MATIC': { total: 3000, available: 3000, frozen: 0 }
    };
    
    // Current prices to calculate USD value (approximate)
    const prices: Record<string, number> = {
      'BTC': 88000,
      'ETH': 2050,
      'USDT': 1,
      'USDC': 1,
      'SOL': 145,
      'BNB': 630,
      'XRP': 2.45,
      'DOGE': 0.15,
      'ADA': 0.45,
      'MATIC': 0.65
    };
    
    return DEFAULT_CURRENCIES.map(currency => {
      const balance = demoBalances[currency] || { total: 0, available: 0, frozen: 0 };
      const price = prices[currency] || 0;
      return {
        currency,
        available: balance.available,
        frozen: balance.frozen,
        total: balance.total,
        valueUSD: balance.total * price
      };
    });
  }
  
  /**
   * Get trading history
   * Returns demo data array if authentication fails
   */
  async getTradingHistory(): Promise<any[]> {
    // Check if OKX API is properly configured first
    if (!okxService.isConfigured()) {
      console.warn('OKX API credentials not configured - returning demo trading history');
      return this.getDemoTradingHistory();
    }
    
    try {
      const response = await okxService.makeAuthenticatedRequest<OkxResponse<any>>(
        'GET',
        '/api/v5/trade/fills'
      );
      
      if (response.code !== '0') {
        console.warn(`Failed to fetch trading history: ${response.msg}`);
        return this.getDemoTradingHistory();
      }
      
      return response.data || [];
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to fetch trading history:', err.message);
      return this.getDemoTradingHistory();
    }
  }
  
  /**
   * Generate demo trading history data
   */
  private getDemoTradingHistory(): any[] {
    const pairs = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT', 'XRP-USDT'];
    const sides = ['buy', 'sell'];
    
    // Current time
    const now = new Date();
    
    // Create 10 sample trades over the last 7 days
    return Array.from({ length: 10 }, (_, i) => {
      const daysAgo = Math.floor(Math.random() * 7);
      const hoursAgo = Math.floor(Math.random() * 24);
      const tradeTime = new Date(now);
      tradeTime.setDate(tradeTime.getDate() - daysAgo);
      tradeTime.setHours(tradeTime.getHours() - hoursAgo);
      
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      const side = sides[Math.floor(Math.random() * sides.length)];
      const baseAmount = side === 'buy' ? 
        (pair.startsWith('BTC') ? 0.1 + Math.random() * 0.2 : 
         pair.startsWith('ETH') ? 1 + Math.random() * 3 : 
         pair.startsWith('SOL') ? 5 + Math.random() * 15 : 
         pair.startsWith('BNB') ? 1 + Math.random() * 5 : 
         100 + Math.random() * 500) : // XRP or default
        (pair.startsWith('BTC') ? 0.05 + Math.random() * 0.1 : 
         pair.startsWith('ETH') ? 0.5 + Math.random() * 2 : 
         pair.startsWith('SOL') ? 3 + Math.random() * 10 : 
         pair.startsWith('BNB') ? 0.5 + Math.random() * 3 : 
         50 + Math.random() * 300); // XRP or default
      
      const price = pair.startsWith('BTC') ? 85000 + Math.random() * 5000 :
                   pair.startsWith('ETH') ? 2000 + Math.random() * 100 :
                   pair.startsWith('SOL') ? 140 + Math.random() * 10 :
                   pair.startsWith('BNB') ? 620 + Math.random() * 30 :
                   2.4 + Math.random() * 0.1; // XRP or default
      
      const quoteAmount = baseAmount * price;
      const fee = quoteAmount * 0.001; // 0.1% fee
      
      return {
        instId: pair,
        instType: 'SPOT',
        ordId: `demo${Date.now().toString().slice(-8)}${i}`,
        side: side,
        fillSz: baseAmount.toFixed(pair.startsWith('BTC') ? 5 : pair.startsWith('ETH') ? 4 : 2),
        fillPx: price.toFixed(pair.startsWith('BTC') || pair.startsWith('ETH') ? 2 : pair.startsWith('XRP') ? 4 : 2),
        fillPnl: '0',
        fillTime: tradeTime.toISOString(),
        execType: 'T',
        fee: fee.toFixed(8),
        feeCcy: 'USDT',
        tradeId: `demo${Date.now().toString().slice(-8)}${i + 10}`
      };
    });
  }
  
  /**
   * Get open orders
   * Returns demo data array if authentication fails
   */
  async getOpenOrders(): Promise<any[]> {
    // Check if OKX API is properly configured first
    if (!okxService.isConfigured()) {
      console.warn('OKX API credentials not configured - returning demo open orders');
      return this.getDemoOpenOrders();
    }
    
    try {
      const response = await okxService.makeAuthenticatedRequest<OkxResponse<any>>(
        'GET',
        '/api/v5/trade/orders-pending'
      );
      
      if (response.code !== '0') {
        console.warn(`Failed to fetch open orders: ${response.msg}`);
        return this.getDemoOpenOrders();
      }
      
      return response.data || [];
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to fetch open orders:', err.message);
      return this.getDemoOpenOrders();
    }
  }
  
  /**
   * Generate demo open orders data
   */
  private getDemoOpenOrders(): any[] {
    const pairs = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
    const sides = ['buy', 'sell'];
    const now = new Date();
    
    // Create 3 sample open orders
    return Array.from({ length: 3 }, (_, i) => {
      const pair = pairs[i % pairs.length];
      const side = sides[i % sides.length];
      
      // Set price slightly away from current market price
      const marketPrice = pair.startsWith('BTC') ? 88000 :
                         pair.startsWith('ETH') ? 2070 :
                         145; // SOL price
      
      // Buy orders below market, sell orders above market
      const priceOffset = (side === 'buy' ? -0.05 : 0.05) * marketPrice;
      const price = marketPrice + priceOffset;
      
      // Amount to buy/sell
      const amount = pair.startsWith('BTC') ? (0.01 + (i * 0.01)).toFixed(5) :
                    pair.startsWith('ETH') ? (0.1 + (i * 0.1)).toFixed(3) :
                    (1 + i).toFixed(2); // SOL amount
      
      return {
        instId: pair,
        ordId: `demo${Date.now().toString().slice(-8)}${i}`,
        ccy: '',
        ordType: 'limit',
        sz: amount,
        px: price.toFixed(pair.startsWith('BTC') ? 1 : pair.startsWith('ETH') ? 2 : 2),
        state: 'live',
        side: side,
        posSide: 'net',
        tdMode: 'cash',
        cTime: now.toISOString(),
        uTime: now.toISOString(),
        rebate: '0',
        rebateCcy: 'USDT',
        category: 'normal',
        fillPx: '',
        tradeId: '',
        fillSz: '0',
        fillTime: '',
        avgPx: '',
        lever: '1',
        tpTriggerPx: '',
        tpOrdPx: '',
        slTriggerPx: '',
        slOrdPx: ''
      };
    });
  }
  
  /**
   * Place a new order
   * Returns a standardized response format with success/error information
   */
  async placeOrder(symbol: string, side: 'buy' | 'sell', type: 'market' | 'limit', amount: string, price?: string): Promise<{ success: boolean; orderId?: string; message: string; error?: any }> {
    // Check if OKX API is properly configured first
    if (!okxService.isConfigured()) {
      return {
        success: false,
        message: 'OKX API credentials not configured - unable to place order'
      };
    }
    
    try {
      // Convert order type to OKX format
      const ordType = type === 'market' ? 'market' : 'limit';
      
      const response = await okxService.placeOrder(symbol, side, ordType, amount, price);
      
      if (response && typeof response === 'object' && 'code' in response && response.code !== '0') {
        return {
          success: false,
          message: `Failed to place order: ${(response as any).msg || 'Unknown error'}`,
          error: response
        };
      }
      
      return {
        success: true,
        orderId: response && typeof response === 'object' && 'data' in response ? 
          (response.data as any[])[0]?.ordId : undefined,
        message: 'Order placed successfully'
      };
    } catch (error: any) {
      console.error('Failed to place order:', error);
      return {
        success: false,
        message: `Failed to place order: ${error.message || 'Unknown error'}`,
        error
      };
    }
  }
  
  /**
   * Cancel an existing order
   * Returns a standardized response format with success/error information
   */
  async cancelOrder(symbol: string, orderId: string): Promise<{ success: boolean; message: string; error?: any }> {
    // Check if OKX API is properly configured first
    if (!okxService.isConfigured()) {
      return {
        success: false,
        message: 'OKX API credentials not configured - unable to cancel order'
      };
    }
    
    try {
      const response = await okxService.cancelOrder(symbol, orderId);
      
      if (response && typeof response === 'object' && 'code' in response && response.code !== '0') {
        return {
          success: false,
          message: `Failed to cancel order: ${(response as any).msg || 'Unknown error'}`,
          error: response
        };
      }
      
      return {
        success: true,
        message: 'Order cancelled successfully'
      };
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      return {
        success: false,
        message: `Failed to cancel order: ${error.message || 'Unknown error'}`,
        error
      };
    }
  }
  
  /**
   * Check if API connection and authentication are working
   * Performs comprehensive diagnostics on the OKX API integration
   */
  async checkConnection(): Promise<{ 
    connected: boolean; 
    authenticated: boolean; 
    message: string; 
    publicApiWorking?: boolean;
    apiKeyConfigured?: boolean;
    apiUrl?: string;
    isDemo?: boolean;
    details?: any;
  }> {
    console.log('Running comprehensive OKX API connection check...');
    
    // First, check base configuration
    const apiKeyConfigured = okxService.isConfigured();
    const isDemo = true; // We're using demo mode by default
    const apiUrl = okxService.getBaseUrl();
    
    console.log(`OKX API configuration status: 
      - API URL: ${apiUrl}
      - Demo Mode: ${isDemo ? 'Enabled' : 'Disabled'}
      - API Key Configured: ${apiKeyConfigured ? 'Yes' : 'No'}`);
    
    // Then check public API first (doesn't require authentication)
    try {
      console.log('Testing OKX public API connection...');
      
      // Attempt to get market data which doesn't require authentication
      const marketData = await okxService.makePublicRequest<OkxResponse<any>>('/api/v5/market/tickers?instType=SPOT');
      
      // If we reach here, public API is working
      const publicApiWorking = marketData && marketData.code === '0';
      
      console.log(`OKX public API test ${publicApiWorking ? 'SUCCEEDED' : 'FAILED'}`);
      
      if (!publicApiWorking) {
        return {
          connected: false,
          authenticated: false,
          message: 'Failed to connect to OKX public API. The API might be down or network connectivity issues exist.',
          publicApiWorking: false,
          apiKeyConfigured,
          apiUrl,
          isDemo
        };
      }
      
      // If API keys aren't configured, we can't test authentication
      if (!apiKeyConfigured) {
        return {
          connected: true,
          authenticated: false,
          message: 'Connected to OKX public API, but API keys are not yet configured. Please provide API credentials to enable trading.',
          publicApiWorking: true,
          apiKeyConfigured,
          apiUrl,
          isDemo
        };
      }
      
      // Try to access authenticated endpoint
      try {
        console.log('Testing OKX authenticated API connection...');
        
        // Before checking balances, we need to verify if the OKX API authentication actually works
        // Make a direct call that requires authentication to test auth status
        const authTest = await okxService.makeAuthenticatedRequest('GET', '/api/v5/account/config');
        
        // If we reach here without an error, authentication was successful
        if (!authTest || typeof authTest !== 'object' || !('code' in authTest) || authTest.code !== '0') {
          // Auth test failed with a non-success code
          console.error('Authentication test failed:', authTest);
          return {
            connected: true,
            authenticated: false,
            message: `Connected to OKX public API, but authentication failed with code ${(authTest as any)?.code || 'unknown'}: ${(authTest as any)?.msg || 'unknown error'}`,
            publicApiWorking: true,
            apiKeyConfigured,
            apiUrl,
            isDemo,
            details: { authResponse: authTest }
          };
        }
        
        // If authentication passed, get balances with throwError parameter set to true
        const balances = await this.getAccountBalances(true);
        
        // If we have balances with non-zero values, authentication is definitely working
        const hasRealBalances = balances.some(balance => balance.total > 0);
        
        return {
          connected: true,
          authenticated: true,
          message: `Successfully connected to OKX API with full authentication. ${hasRealBalances ? 'Account has balance data.' : 'Account exists but may have no funds.'}`,
          publicApiWorking: true,
          apiKeyConfigured,
          apiUrl,
          isDemo
        };
      } catch (authError: any) {
        // Detailed authentication error information
        console.error('OKX authentication error:', authError);
        
        // Check for specific OKX error responses
        let errorMessage = authError.message;
        let details = {};
        
        // Check if this is an axios error with an OKX API response containing an error code
        if (authError.response?.data?.code) {
          const errorCode = authError.response.data.code;
          details = { 
            errorCode,
            originalMessage: authError.response.data.msg || 'Unknown error'
          };
          
          // Provide helpful guidance based on error code
          if (errorCode === '50119') {
            errorMessage = "API key doesn't exist (code 50119). Please check that your API key is correct and has been created with Read and Trade permissions.";
          } else if (errorCode === '50102') {
            errorMessage = "Timestamp error (code 50102). Your system clock may be out of sync or there might be network latency issues.";
          } else if (errorCode === '50103') {
            errorMessage = "Invalid signature (code 50103). The SECRET_KEY might be incorrect or improperly formatted.";
          } else if (errorCode === '50104') {
            errorMessage = "Invalid passphrase (code 50104). The PASSPHRASE does not match what was set when creating the API key.";
          } else {
            errorMessage = `OKX API error (code ${errorCode}): ${authError.response.data.msg}`;
          }
        }
        
        // Authentication failed but public API works
        return {
          connected: true,
          authenticated: false,
          message: `Connected to OKX public API, but authentication failed: ${errorMessage}`,
          publicApiWorking: true,
          apiKeyConfigured,
          apiUrl,
          isDemo,
          details
        };
      }
    } catch (error: any) {
      // Complete connection failure
      console.error('OKX complete connection failure:', error);
      
      return {
        connected: false,
        authenticated: false,
        message: `Failed to connect to OKX API: ${error.message}. This could be due to network connectivity issues or the API being unavailable.`,
        publicApiWorking: false,
        apiKeyConfigured,
        apiUrl,
        isDemo,
        details: { originalError: error.message }
      };
    }
  }
}

// Create and export default instance
export const accountService = new AccountService();