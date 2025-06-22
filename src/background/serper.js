const SERPER_API_KEY = "3354b828e805fa5fc2f38b2a6cea063610a370da"; // IMPORTANT: Replace with your actual Serper API key

/**
 * Searches for direct, cheaper alternatives for a specific product.
 * @param {string} productName - The name of the product.
 * @param {number} productPrice - The price of the original product to compare against.
 * @param {string} hostname - The hostname of the site to search within (e.g., "www.amazon.com").
 * @returns {Promise<object[]|null>} A list of alternative products or null.
 */
export async function getCheaperProductAlternatives(productName, productPrice, hostname) {
    if (!SERPER_API_KEY) return null;
    
    // Perform a broad shopping search to get many results with price data.
    const query = `cheaper alternative to "${productName}"`;

    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: query, tbm: 'shop' }) // Use shopping search for structured price data
        });

        if (!response.ok) {
            console.error("Serper API Error (Product Search):", response.status, await response.text());
            return null;
        }

        const data = await response.json();

        if (data.shopping && data.shopping.length > 0) {
            console.log("Original Serper shopping results:", JSON.stringify(data.shopping, null, 2));

            const potentialAlternatives = data.shopping.map(item => {
                const itemPrice = parseFloat(String(item.price).replace(/[$,]/g, ''));
                return { ...item, priceFloat: itemPrice };
            });

            const cheaperAlternatives = potentialAlternatives.filter(item => {
                const normalizedHostname = hostname.replace(/^www\./, '');
                let itemHostname = null;
                try {
                    if (item.link) {
                        itemHostname = new URL(item.link).hostname.replace(/^www\./, '');
                    }
                } catch (e) { return false; }

                const isOnSameSite = itemHostname === normalizedHostname;
                const hasValidPrice = !isNaN(item.priceFloat);
                const isCheaper = hasValidPrice && item.priceFloat < productPrice && item.priceFloat > 0;
                
                return isOnSameSite && isCheaper;
            });
            
            console.log("Filtered cheaper alternatives:", JSON.stringify(cheaperAlternatives, null, 2));

            if (cheaperAlternatives.length > 0) {
                // If we found truly cheaper items, return them.
                return cheaperAlternatives.slice(0, 5).map(item => ({
                    type: 'product_cheaper',
                    title: item.title,
                    link: item.link,
                    snippet: `Price: ${item.price} on ${item.source}`,
                }));
            } else {
                // Fallback: If no cheaper items were found, return the top 5 unfiltered results from the same site.
                console.log("No cheaper items found, falling back to general alternatives.");
                const generalAlternatives = potentialAlternatives
                    .filter(item => {
                         try {
                            return item.link && new URL(item.link).hostname.replace(/^www\./, '') === hostname.replace(/^www\./, '');
                        } catch(e) { return false; }
                    })
                    .slice(0, 5)
                    .map(item => ({
                        type: 'product_general',
                        title: item.title,
                        link: item.link,
                        snippet: `Price: ${item.price} on ${item.source}`,
                    }));
                return generalAlternatives.length > 0 ? generalAlternatives : null;
            }
        }
        return null;

    } catch (error) {
        console.error("Error calling Serper API (Product Search):", error);
        return null;
    }
} 

/**
 * Searches for coupon codes and deals for an entire website/cart.
 * @param {string} hostname - The hostname of the shopping site.
 * @returns {Promise<object[]|null>} A list of potential deals or null.
 */
export async function getCartDeals(hostname) {
    if (!SERPER_API_KEY) return null;

    // This query is designed to find sitewide coupon codes or promotions.
    const query = `${hostname} coupon codes deals`;

    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: query })
        });

        if (!response.ok) {
            console.error("Serper API Error (Deals Search):", response.status, await response.text());
            return null;
        }

        const data = await response.json();

        if (data.organic && data.organic.length > 0) {
            return data.organic.slice(0, 5).map(item => ({
                type: 'deal',
                title: item.title,
                link: item.link,
                snippet: item.snippet
            }));
        }
        return null;

    } catch (error) {
        console.error("Error calling Serper API (Deals Search):", error);
        return null;
    }
} 