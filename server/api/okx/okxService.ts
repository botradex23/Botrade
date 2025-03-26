import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import CryptoJS from 'crypto-js';
import { 
  OKX_BASE_URL, 
  OKX_DEMO_BASE_URL, 
  API_KEY, 
  SECRET_KEY, 
  PASSPHRASE,
  DEFAULT_TIMEOUT,
  isConfigured
} from './config';

// Error for when API is not configured
class OkxApiNotConfiguredError extends Error {
  constructor() {
    super('OKX API is not configured. Please provide API_KEY, SECRET_KEY, and PASSPHRASE');
    this.name = 'OkxApiNotConfiguredError';
  }
}

// Define OkxResponse interface
interface OkxResponse<T> {
  code: string;
  msg: string;
  data: T;
}

// Main service class for OKX API
export class OkxService {
  private baseUrl: string;
  private isDemo: boolean;

  constructor(useDemo = true) {
    this.isDemo = useDemo;
    this.baseUrl = useDemo ? OKX_DEMO_BASE_URL : OKX_BASE_URL;
    
    // Check for API configuration
    if (!isConfigured()) {
      console.warn('OKX API credentials not configured properly');
    } else {
      // Log partial API key (first 4 and last 4 characters only) for debugging
      if (API_KEY.length > 8) {
        const partialKey = API_KEY.substring(0, 4) + '...' + API_KEY.substring(API_KEY.length - 4);
        console.log(`OKX API configured with key: ${partialKey}`);
      }
    }
  }

  /**
   * Generate signature required for authenticated API calls
   */
  private generateSignature(timestamp: string, method: string, requestPath: string, body = ''): string {
    // Pre-encode the message for signature
    const message = timestamp + method + requestPath + body;
    
    // Create HMAC SHA256 signature using the secret key
    return CryptoJS.HmacSHA256(message, SECRET_KEY).toString(CryptoJS.enc.Base64);
  }
  
  /**
   * Get passphrase for API v5
   * Note: OKX documentation mentions different formats in different places
   * If your passphrase looks like a hex string, it might need to be normalized
   */
  private encryptPassphrase(): string {
    // Check if the passphrase is in all caps and looks like a hex string (common mistake)
    const hexRegex = /^[0-9A-F]+$/;
    if (PASSPHRASE.length > 8 && hexRegex.test(PASSPHRASE)) {
      console.log("Passphrase appears to be in hex format. Check OKX documentation for correct format.");
    }
    
    // In the V5 API, we generally use the original passphrase as provided during API key creation
    return PASSPHRASE;
  }

  /**
   * Make authenticated API request to OKX
   */
  async makeAuthenticatedRequest<T>(
    method: string,
    endpoint: string,
    data: any = {}
  ): Promise<T> {
    // Verify API is configured
    if (!isConfigured()) {
      throw new OkxApiNotConfiguredError();
    }

    // Prepare request timestamp
    const timestamp = new Date().toISOString();
    
    // Prepare request body and path
    const requestPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const body = method !== 'GET' ? JSON.stringify(data) : '';
    
    // Generate signature
    const signature = this.generateSignature(timestamp, method, requestPath, body);
    
    // Debug passphrase format - only show first and last character for security
    const passphraseFormat = PASSPHRASE.length > 2 
      ? `${PASSPHRASE.charAt(0)}...${PASSPHRASE.charAt(PASSPHRASE.length - 1)} (length: ${PASSPHRASE.length})`
      : 'too short';
    
    console.log(`OKX API request: ${method} ${requestPath}`);
    console.log(`Using passphrase format: ${passphraseFormat}`);
    
    // Setup request configuration
    // For v5 API, we need to use the original passphrase as provided in API management
    const config: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${requestPath}`,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': API_KEY,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      }
    };
    
    // Add demo trading header if needed
    if (this.isDemo) {
      config.headers = {
        ...config.headers,
        'x-simulated-trading': '1'
      };
    }
    
    // Add request body for non-GET requests
    if (method !== 'GET' && body) {
      config.data = body;
    }
    
    try {
      // Add more detailed logging of the request for debugging
      console.log(`Making ${this.isDemo ? 'DEMO' : 'LIVE'} OKX API request:`, {
        method,
        path: requestPath,
        demoMode: this.isDemo,
        timestampFormat: timestamp
      });
      
      const response: AxiosResponse = await axios(config);
      
      // Check if the response contains an OKX API error
      if (response.data && response.data.code && response.data.code !== '0') {
        console.error(`OKX API error: code ${response.data.code}, message: ${response.data.msg}`);
        
        // Handle specific error codes with more detailed messages
        let errorMessage = response.data.msg || 'OKX API Error';
        
        // Add helpful troubleshooting advice based on error code
        if (response.data.code === '50119') {
          errorMessage += ". This typically means the API key is invalid, doesn't exist, or wasn't created on the main OKX exchange (not OKX Wallet).";
        } else if (response.data.code === '50102') {
          errorMessage += ". This typically means the timestamp is invalid or request timed out.";
        } else if (response.data.code === '50103') {
          errorMessage += ". This typically means the signature is invalid - check your SECRET_KEY format.";
        } else if (response.data.code === '50104') {
          errorMessage += ". This typically means the passphrase is incorrect.";
        }
        
        // Create an error object with the response data for better error handling
        const apiError: any = new Error(errorMessage);
        apiError.code = response.data.code;
        apiError.response = response;
        throw apiError;
      }
      
      return response.data as T;
    } catch (error: any) {
      // Log and rethrow the error with more context
      if (error.response?.data) {
        console.error('OKX API request failed:', {
          status: error.response.status,
          code: error.response.data.code,
          message: error.response.data.msg
        });
        
        // Add debug information for specific endpoints
        if (requestPath.includes('/account/balance')) {
          console.log('Note: /account/balance endpoint requires Read permission on your API key');
        } else if (requestPath.includes('/trade/')) {
          console.log('Note: Trade-related endpoints require Trade permission on your API key');
        }
      } else {
        console.error('OKX API request failed:', error.message);
      }
      throw error;
    }
  }

  /**
   * Make public (non-authenticated) API request to OKX
   */
  async makePublicRequest<T>(endpoint: string, params: any = {}): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await axios.get(url, { 
        params,
        timeout: DEFAULT_TIMEOUT 
      });
      
      // Check if the response contains an OKX API error
      if (response.data && response.data.code && response.data.code !== '0') {
        console.error(`OKX API error in public request: code ${response.data.code}, message: ${response.data.msg}`);
        
        // Create an error object with the response data for better error handling
        const apiError: any = new Error(response.data.msg || 'OKX API Error');
        apiError.code = response.data.code;
        apiError.response = response;
        throw apiError;
      }
      
      return response.data as T;
    } catch (error: any) {
      // Log and rethrow the error with more context
      if (error.response?.data) {
        console.error('OKX public API request failed:', {
          status: error.response.status,
          code: error.response.data.code,
          message: error.response.data.msg
        });
      } else {
        console.error('OKX public API request failed:', error.message);
      }
      throw error;
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    return this.makeAuthenticatedRequest('GET', '/api/v5/account/balance');
  }
  
  /**
   * Check if API is configured with proper credentials
   */
  isConfigured(): boolean {
    return isConfigured();
  }
  
  /**
   * Get the base URL being used for API requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
  
  /**
   * Get market trading pairs
   */
  async getTradingPairs() {
    return this.makePublicRequest('/api/v5/market/tickers?instType=SPOT');
  }
  
  /**
   * Get ticker information for a specific trading pair
   */
  async getTicker(symbol: string) {
    return this.makePublicRequest(`/api/v5/market/ticker?instId=${symbol}`);
  }
  
  /**
   * Get historical candlestick data for chart
   */
  async getKlineData(symbol: string, interval = '1H', limit = 100): Promise<any> {
    // According to OKX API docs, bar parameter should be one of:
    // 1m, 3m, 5m, 15m, 30m, 1H, 2H, 4H, 6H, 12H, 1D, 1W, 1M, 3M, 6M, 1Y
    
    // Make sure interval is in the right format
    let formattedInterval = interval.toUpperCase();
    
    // Valid intervals
    const validIntervals = ['1M', '3M', '5M', '15M', '30M', '1H', '2H', '4H', '6H', '12H', '1D', '1W', '1M', '3M', '6M', '1Y'];
    
    // Default to 1H if not valid
    if (!validIntervals.includes(formattedInterval)) {
      console.warn(`Invalid interval '${interval}' provided, defaulting to '1H'`);
      formattedInterval = '1H';
    }
    
    return this.makePublicRequest(`/api/v5/market/candles?instId=${symbol}&bar=${formattedInterval}&limit=${limit}`);
  }
  
  /**
   * Get account trading history
   */
  async getTradingHistory() {
    return this.makeAuthenticatedRequest('GET', '/api/v5/trade/fills');
  }
  
  /**
   * Get open orders
   */
  async getOpenOrders() {
    return this.makeAuthenticatedRequest('GET', '/api/v5/trade/orders-pending');
  }
  
  /**
   * Place a new order
   */
  async placeOrder(instId: string, side: string, ordType: string, sz: string, px?: string) {
    const data: any = {
      instId,
      tdMode: 'cash',
      side,
      ordType,
      sz
    };
    
    // Add price if it's a limit order
    if (ordType === 'limit' && px) {
      data.px = px;
    }
    
    return this.makeAuthenticatedRequest('POST', '/api/v5/trade/order', data);
  }
  
  /**
   * Cancel an order
   */
  async cancelOrder(instId: string, ordId: string) {
    return this.makeAuthenticatedRequest('POST', '/api/v5/trade/cancel-order', {
      instId,
      ordId
    });
  }
  
  /**
   * Test connectivity to the API
   */
  async ping() {
    try {
      await axios.get(`${this.baseUrl}/api/v5/public/time`);
      return { success: true, message: 'API connection successful', demo: this.isDemo };
    } catch (error) {
      return { success: false, message: 'API connection failed', error, demo: this.isDemo };
    }
  }
}

// Create and export default instance using demo trading
export const okxService = new OkxService(true);