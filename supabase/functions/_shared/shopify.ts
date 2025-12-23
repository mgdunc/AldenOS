export interface ShopifyConfig {
  shopUrl: string;
  accessToken: string;
  apiVersion?: string;
}

export class ShopifyClient {
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(config: ShopifyConfig) {
    const cleanUrl = config.shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const version = config.apiVersion || '2023-04';
    this.baseUrl = `https://${cleanUrl}/admin/api/${version}`;
    this.headers = {
      'X-Shopify-Access-Token': config.accessToken,
      'Content-Type': 'application/json',
    };
  }

  async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}/${path}`;
    
    let retries = 5;
    while (retries > 0) {
      try {
        const res = await fetch(url, { ...options, headers: this.headers });
        
        // Log rate limit info
        const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
        if (callLimit) {
          const [used, total] = callLimit.split('/').map(Number);
          const percentage = Math.round((used / total) * 100);
          console.log(`[SHOPIFY] API Bucket: ${used}/${total} (${percentage}%)`);
          
          // If bucket is over 80% full, wait to let it drain
          if (percentage > 80) {
            const waitTime = 500;
            console.log(`[SHOPIFY] Bucket at ${percentage}%, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
        
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const wait = retryAfter ? parseFloat(retryAfter) * 1000 : 2000;
          console.warn(`Rate limit hit. Waiting ${wait}ms`);
          await new Promise(resolve => setTimeout(resolve, wait + 1000));
          retries--;
          continue;
        }

        return res;
      } catch (e) {
        console.warn(`Network error: ${e instanceof Error ? e.message : String(e)}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries--;
        if (retries === 0) throw e;
      }
    }
    throw new Error("Shopify API Request Failed (Max Retries)");
  }

  async getProductsCount(): Promise<number> {
    const res = await this.fetch('products/count.json');
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to get count: ${res.status} ${text}`);
    }
    const data = await res.json();
    return data.count;
  }

  async getProductsPage(limit = 50, pageInfo?: string): Promise<{ products: any[], nextPageInfo: string | null }> {
    let url = `products.json?limit=${limit}`;
    if (pageInfo) {
        url = `products.json?limit=${limit}&page_info=${pageInfo}`;
    }
    
    const res = await this.fetch(url);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch products: ${res.status} ${text}`);
    }
    
    const data = await res.json();
    
    let nextPageInfo = null;
    const linkHeader = res.headers.get('Link');
    if (linkHeader) {
        // Extract page_info from the "next" link
        // Link: <https://.../products.json?limit=50&page_info=eyJ...>; rel="next"
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) {
            const nextUrl = new URL(match[1]);
            nextPageInfo = nextUrl.searchParams.get('page_info');
        }
    }

    return { products: data.products, nextPageInfo };
  }

  async *getProducts(limit = 50) {
    let url = `products.json?limit=${limit}`;
    
    while (url) {
      const res = await this.fetch(url);
      if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to fetch products: ${res.status} ${text}`);
      }
      
      const data = await res.json();
      yield data.products;

      const linkHeader = res.headers.get('Link');
      url = '';
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) url = match[1];
      }
    }
  }

  // Placeholder for future Orders sync
  async *getOrders(limit = 50, status = 'any') {
    let url = `orders.json?limit=${limit}&status=${status}`;
    while (url) {
        const res = await this.fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch orders: ${res.statusText}`);
        const data = await res.json();
        yield data.orders;
        
        const linkHeader = res.headers.get('Link');
        url = '';
        if (linkHeader) {
            const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (match) url = match[1];
        }
    }
  }

  // Placeholder for Inventory Levels
  async getInventoryLevels(inventoryItemIds: string[]) {
    const ids = inventoryItemIds.join(',');
    const res = await this.fetch(`inventory_levels.json?inventory_item_ids=${ids}`);
    if (!res.ok) throw new Error(`Failed to fetch inventory levels`);
    return await res.json();
  }
}
