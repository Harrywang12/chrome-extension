console.log("Content script loaded.");

let originalAddToCartButton = null;
let isProceedingWithPurchase = false;

// Add mousedown listener to catch events even earlier
document.addEventListener('mousedown', async function(event) {
  // Check if we're on an actual Amazon shopping/product page
  const isAmazonShoppingPage = (
    window.location.hostname.includes('amazon.com') || 
    window.location.hostname.includes('amazon.ca') ||
    window.location.hostname.includes('amazon.co.uk') ||
    window.location.hostname.includes('amazon.de') ||
    window.location.hostname.includes('amazon.fr') ||
    window.location.hostname.includes('amazon.it') ||
    window.location.hostname.includes('amazon.es') ||
    window.location.hostname.includes('amazon.co.jp') ||
    window.location.hostname.includes('amazon.in') ||
    window.location.hostname.includes('amazon.com.au')
  ) && !(
    window.location.pathname.includes('/signin') ||
    window.location.pathname.includes('/login') ||
    window.location.pathname.includes('/register') ||
    window.location.pathname.includes('/account') ||
    window.location.pathname.includes('/help') ||
    window.location.pathname.includes('/customer-service') ||
    window.location.pathname.includes('/contact') ||
    window.location.pathname.includes('/about') ||
    window.location.pathname.includes('/careers') ||
    window.location.pathname.includes('/press') ||
    window.location.pathname.includes('/legal') ||
    window.location.pathname.includes('/privacy') ||
    window.location.pathname.includes('/terms')
  );

  console.log("Page detection:", {
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    isAmazonShoppingPage: isAmazonShoppingPage
  });

  if (!isAmazonShoppingPage) {
    console.log("Not on Amazon shopping page, skipping...");
    return; // Don't trigger on non-shopping pages
  }

  const addToCartButton = event.target.closest(`
    #add-to-cart-button, 
    [data-action="add-to-cart"], 
    .add-to-cart-button, 
    .a-button-input[value*="Add to Cart"],
    .a-button-input[value*="add to cart"],
    .a-button-input[value*="Add to Cart"],
    .a-button[data-action="add-to-cart"],
    .a-button[aria-label*="Add to Cart"],
    .a-button[aria-label*="add to cart"],
    .a-button-input[aria-label*="Add to Cart"],
    .a-button-input[aria-label*="add to cart"],
    .a-button[title*="Add to Cart"],
    .a-button[title*="add to cart"],
    .a-button-input[title*="Add to Cart"],
    .a-button-input[title*="add to cart"],
    .a-button[data-csa-c-type="button"][data-csa-c-slot-id*="add-to-cart"],
    .a-button[data-csa-c-type="button"][data-csa-c-slot-id*="addToCart"],
    .a-button-input[data-asin],
    .a-button-input[aria-labelledby*="announce"],
    input.a-button-input[type="submit"],
    #buy-now-button,
    [data-action="buy-now"],
    .buy-now-button,
    .a-button-input[value*="Buy Now"],
    .a-button-input[value*="buy now"],
    .a-button[aria-label*="Buy Now"],
    .a-button[aria-label*="buy now"],
    .a-button-input[aria-label*="Buy Now"],
    .a-button-input[aria-label*="buy now"],
    .a-button[title*="Buy Now"],
    .a-button[title*="buy now"],
    .a-button-input[title*="Buy Now"],
    .a-button-input[title*="buy now"],
    .a-button[data-csa-c-type="button"][data-csa-c-slot-id*="buy-now"],
    .a-button[data-csa-c-type="button"][data-csa-c-slot-id*="buyNow"]
  `);
  
  if (addToCartButton) {
    console.log("Add to Cart button detected:", addToCartButton);
    
    if (isProceedingWithPurchase) {
      console.log("Bypass flag is set, allowing purchase without intervention.");
      isProceedingWithPurchase = false;
      return;
    }

    // Prevent the default action immediately
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    // Disable the button immediately
    addToCartButton.disabled = true;
    
    // If it's a submit button, prevent form submission
    if (addToCartButton.type === 'submit') {
      const form = addToCartButton.closest('form');
      if (form) {
        form.onsubmit = function(e) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        };
      }
    }

    // Store a reference to the clicked button
    originalAddToCartButton = addToCartButton;

    // Determine if we're on a product page or shopping page
    const isProductPage = document.getElementById('productTitle') !== null;
    console.log("Page type detected:", isProductPage ? "Product page" : "Shopping page");
    
    let productName = 'this item';
    let productPrice = 'a high price';
    let numericPrice = 0;

    if (isProductPage) {
      // Product page logic (existing code)
      try {
        const titleEl = document.getElementById('productTitle') || document.querySelector('h1#title');
        if (titleEl && titleEl.innerText) {
          productName = titleEl.innerText.trim();
        }
      } catch (e) {
        console.error("Impulse Control: Error extracting product name.", e);
      }
      
      try {
        const priceElement = document.querySelector('.a-price, #priceblock_ourprice, .priceToPay, .a-price-whole');
        if (priceElement) {
          const text = priceElement.innerText;
          const potentialPrices = text.match(/\$?\d{1,3}(?:,?\d{3})*(?:\.\d{1,2})?/g) || [];
          console.log("Potential prices found in element:", potentialPrices);

          let finalPrice = null;
          if (potentialPrices.length > 0) {
            // Priority 1: A price with a dollar sign.
            finalPrice = potentialPrices.find(p => p.startsWith('$'));
            // Priority 2: A price with a decimal point.
            if (!finalPrice) {
                finalPrice = potentialPrices.find(p => p.includes('.'));
            }
            // Priority 3: A plain integer, but only if it's the only number found, to avoid ambiguity.
            if (!finalPrice && potentialPrices.length === 1) {
                const singleMatchText = text.toLowerCase();
                if (!singleMatchText.includes('rating') && !singleMatchText.includes('answered') && !singleMatchText.includes('review')) {
                    finalPrice = potentialPrices[0];
                }
            }
          }

          if (finalPrice) {
            productPrice = finalPrice;
            numericPrice = parseFloat(productPrice.replace(/[^\d.]/g, ''));
          }
        }
      } catch (e) {
        console.error("Impulse Control: Error extracting product price.", e);
      }
    } else {
      // Shopping page logic - find the product card containing the clicked button
      try {
        // Try multiple selectors for product cards - look for the actual product card, not just button container
        let productCard = addToCartButton.closest(`
          [data-component-type="s-search-result"], 
          .s-result-item, 
          .sg-col-inner,
          .s-card-container,
          .s-card,
          [data-cel-widget="search_result"],
          .a-section.a-spacing-base,
          .a-section.a-spacing-medium,
          .a-section.a-spacing-small,
          .a-section.a-spacing-none
        `);
        
        // If we found a button container, look for the actual product card that contains it
        if (productCard && (productCard.classList.contains('ax-replace') || productCard.querySelector('.ax-atc'))) {
          console.log("Found button container, looking for parent product card...");
          // Look for a parent element that contains the actual product information
          productCard = productCard.closest('[data-component-type="s-search-result"], .s-result-item, .s-card-container, .s-card') || 
                       productCard.parentElement?.closest('[data-component-type="s-search-result"], .s-result-item, .s-card-container, .s-card') ||
                       productCard.parentElement?.parentElement?.closest('[data-component-type="s-search-result"], .s-result-item, .s-card-container, .s-card');
        }
        
        // If still no product card found, try a more aggressive search
        if (!productCard) {
          console.log("No product card found with standard selectors, trying aggressive search...");
          
          // Look for any element that contains both the button and product information
          let currentElement = addToCartButton;
          let searchDepth = 0;
          const maxDepth = 10;
          
          while (currentElement && searchDepth < maxDepth) {
            // Check if this element contains product information
            const hasProductInfo = currentElement.querySelector(`
              h2, h3, .a-text-normal, .a-link-normal, 
              [data-component-type="s-search-result"],
              .s-result-item,
              .s-card-container,
              .s-card,
              .a-truncate-cut,
              a[href*="/dp/"],
              a[href*="/gp/product/"]
            `);
            
            if (hasProductInfo) {
              productCard = currentElement;
              console.log(`Found product card at depth ${searchDepth}:`, productCard);
              break;
            }
            
            currentElement = currentElement.parentElement;
            searchDepth++;
          }
        }
        
        // Last resort: look for any parent that contains product links
        if (!productCard) {
          console.log("Trying last resort search for product card...");
          let currentElement = addToCartButton;
          while (currentElement && currentElement !== document.body) {
            const productLinks = currentElement.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
            if (productLinks.length > 0) {
              productCard = currentElement;
              console.log("Found product card with product links:", productCard);
              break;
            }
            currentElement = currentElement.parentElement;
          }
        }
        
        // Additional search: look for the closest element with product information
        if (!productCard) {
          console.log("Trying closest element search...");
          // Find all elements with product information on the page
          const allProductElements = document.querySelectorAll(`
            [data-component-type="s-search-result"],
            .s-result-item,
            .s-card-container,
            .s-card,
            .a-section.a-spacing-base,
            .a-section.a-spacing-medium,
            .a-section.a-spacing-small
          `);
          
          // Find the closest one to our button
          let closestElement = null;
          let closestDistance = Infinity;
          
          for (const element of allProductElements) {
            const rect1 = addToCartButton.getBoundingClientRect();
            const rect2 = element.getBoundingClientRect();
            
            // Calculate distance between button and element
            const distance = Math.sqrt(
              Math.pow(rect1.left - rect2.left, 2) + 
              Math.pow(rect1.top - rect2.top, 2)
            );
            
            if (distance < closestDistance) {
              closestDistance = distance;
              closestElement = element;
            }
          }
          
          if (closestElement && closestDistance < 1000) { // Within reasonable distance
            productCard = closestElement;
            console.log("Found closest product card:", productCard, "distance:", closestDistance);
          }
        }
        
        console.log("Product card found:", productCard);
        
        if (productCard) {
          console.log("Product card HTML:", productCard.outerHTML.substring(0, 500) + "...");
          
          // Try to find product name in the card - updated for actual Amazon structure
          const nameCandidates = productCard.querySelectorAll(`
            .a-truncate-cut,
            h2 a[href*="/dp/"],
            h2 a[href*="/gp/product/"],
            .a-link-normal[href*="/dp/"],
            .a-link-normal[href*="/gp/product/"],
            .a-text-normal[href*="/dp/"],
            .a-text-normal[href*="/gp/product/"],
            [data-cy="title-recipe-link"],
            .a-link-normal[data-cy="title-recipe-link"],
            .a-size-base-plus[href*="/dp/"],
            .a-size-medium[href*="/dp/"],
            .a-size-large[href*="/dp/"],
            .a-link-normal.s-underline-text[href*="/dp/"],
            .a-link-normal.s-underline-text.s-underline-link-text[href*="/dp/"]
          `);
          
          console.log("Found name candidates:", nameCandidates.length);
          nameCandidates.forEach((el, index) => {
            console.log(`Candidate ${index}:`, el.tagName, el.className, el.innerText?.trim());
          });
          
          let foundName = false;
          
          // First, try to find the specific span with product title
          const titleSpan = productCard.querySelector('.a-truncate-cut');
          console.log("Looking for .a-truncate-cut element:", titleSpan);
          if (titleSpan && titleSpan.innerText.trim()) {
            const text = titleSpan.innerText.trim();
            console.log("Found text in .a-truncate-cut:", text);
            if (text && text.length > 3) {
              productName = text;
              foundName = true;
              console.log("Product name extracted from .a-truncate-cut:", productName);
            }
          } else {
            console.log("No .a-truncate-cut element found or no text in it");
          }
          
          // If not found, try other candidates
          if (!foundName) {
            for (const el of nameCandidates) {
              // Skip if it's a button or input
              if (el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'input') continue;
              // Skip if the text is 'Add to Cart' or similar button text
              const text = el.innerText.trim();
              console.log("Checking text:", text);
              if (text && 
                  text.length > 3 && 
                  !/^add to cart$/i.test(text) && 
                  !/^buy now$/i.test(text) &&
                  !/^add to list$/i.test(text) &&
                  !/^subscribe & save$/i.test(text) &&
                  !/^free delivery$/i.test(text) &&
                  !/^prime$/i.test(text) &&
                  !/^in stock$/i.test(text)) {
                productName = text;
                foundName = true;
                console.log("Product name extracted:", productName);
                break;
              }
            }
          }
          
          if (!foundName) {
            console.log("No name found in candidates, trying fallback...");
            // Fallback: look for any link with product URL pattern that has meaningful text
            const allLinks = productCard.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
            console.log("Found fallback links:", allLinks.length);
            allLinks.forEach((link, index) => {
              console.log(`Fallback link ${index}:`, link.innerText?.trim());
            });
            
            for (const link of allLinks) {
              const text = link.innerText?.trim();
              if (text && 
                  text.length > 5 && 
                  !/^add to cart$/i.test(text) && 
                  !/^buy now$/i.test(text) &&
                  !/^add to list$/i.test(text) &&
                  !/^subscribe & save$/i.test(text) &&
                  !/^free delivery$/i.test(text) &&
                  !/^prime$/i.test(text) &&
                  !/^in stock$/i.test(text) &&
                  !/^\d+$/i.test(text)) { // Skip if it's just a number
                productName = text;
                console.log("Fallback product name extracted:", productName);
                break;
              }
            }
          }
          
          if (!foundName) {
            console.log("Could not find product name, using default");
          }
          
          // Try alternative approaches if standard method failed
          if (!foundName || productName === "This Thing") {
            console.log("Standard method failed, trying alternatives...");
            
            // Alternative 1: Look for Amazon's data attributes and structured data
            if (!foundName) {
              console.log("Trying data attribute approach...");
              
              // Look for data attributes that Amazon uses
              const dataAttributes = [
                'data-asin',
                'data-product-title',
                'data-product-name',
                'data-title',
                'data-name'
              ];
              
              for (const attr of dataAttributes) {
                const element = productCard.querySelector(`[${attr}]`);
                if (element && element.getAttribute(attr)) {
                  const value = element.getAttribute(attr);
                  if (value && value.length > 3 && !/^[A-Z0-9]{10}$/.test(value)) { // Skip ASINs
                    productName = value;
                    foundName = true;
                    console.log(`Product name from ${attr}:`, productName);
                    break;
                  }
                }
              }
              
              // Look for structured data (JSON-LD)
              if (!foundName) {
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                for (const script of scripts) {
                  try {
                    const data = JSON.parse(script.textContent);
                    if (data.name || data.title) {
                      productName = data.name || data.title;
                      foundName = true;
                      console.log("Product name from structured data:", productName);
                      break;
                    }
                  } catch (e) {
                    // Ignore JSON parse errors
                  }
                }
              }
            }
            
            // Try Amazon data extraction
            const amazonName = extractFromAmazonData();
            if (amazonName && amazonName.length > 3) {
              productName = amazonName;
              foundName = true;
              console.log("Product name from Amazon data:", productName);
            }
            
            // If still no name, try waiting for dynamic content
            if (!foundName) {
              console.log("Waiting for dynamic content to load...");
              await waitForProductInfo(productCard);
              
              // Re-try the standard extraction after waiting
              const titleSpan = productCard.querySelector('.a-truncate-cut');
              if (titleSpan && titleSpan.innerText.trim()) {
                const text = titleSpan.innerText.trim();
                if (text && text.length > 3) {
                  productName = text;
                  foundName = true;
                  console.log("Product name after waiting:", productName);
                }
              }
            }
          }
          
          // Try to find price in the card - expanded selectors
          const priceElement = productCard.querySelector(`
            .a-price, 
            .a-price-whole, 
            .a-offscreen,
            .a-price-current,
            .a-price-range,
            .a-price .a-offscreen,
            .a-price-current .a-offscreen,
            .a-price-range .a-offscreen,
            .a-price.a-text-price,
            .a-price.a-text-price .a-offscreen
          `);
          
          if (priceElement) {
            const text = priceElement.innerText;
            const potentialPrices = text.match(/\$?\d{1,3}(?:,?\d{3})*(?:\.\d{1,2})?/g) || [];
            console.log("Potential prices found in element:", potentialPrices);

            let finalPrice = null;
            if (potentialPrices.length > 0) {
              // Priority 1: A price with a dollar sign.
              finalPrice = potentialPrices.find(p => p.startsWith('$'));
              // Priority 2: A price with a decimal point.
              if (!finalPrice) {
                  finalPrice = potentialPrices.find(p => p.includes('.'));
              }
              // Priority 3: A plain integer, but only if it's the only number found, to avoid ambiguity.
              if (!finalPrice && potentialPrices.length === 1) {
                  const singleMatchText = text.toLowerCase();
                  if (!singleMatchText.includes('rating') && !singleMatchText.includes('answered') && !singleMatchText.includes('review')) {
                      finalPrice = potentialPrices[0];
                  }
              }
            }

            if (finalPrice) {
              productPrice = finalPrice;
              numericPrice = parseFloat(productPrice.replace(/[^\d.]/g, ''));
            }
          }
        } else {
          // Fallback: extract from entire page when product card not found
          console.log("No product card found, trying page-wide extraction...");
          
          // Look for product information in the entire page
          const pageNameCandidates = document.querySelectorAll(`
            .a-truncate-cut,
            h2 a[href*="/dp/"],
            h2 a[href*="/gp/product/"],
            .a-link-normal[href*="/dp/"],
            .a-text-normal[href*="/dp/"],
            [data-cy="title-recipe-link"],
            .a-size-base-plus[href*="/dp/"],
            .a-size-medium[href*="/dp/"],
            .a-size-large[href*="/dp/"],
            .a-link-normal.s-underline-text[href*="/dp/"],
            .a-link-normal.s-underline-text.s-underline-link-text[href*="/dp/"],
            .s-title-instructions-style,
            .a-text-normal.s-underline-text,
            .a-text-normal.s-underline-text.s-underline-link-text,
            .a-link-normal.s-underline-text.s-underline-link-text.s-link-style,
            .a-link-normal.s-underline-text.s-underline-link-text.s-link-style.a-text-normal
          `);
          
          console.log("Found page-wide name candidates:", pageNameCandidates.length);
          
          for (const el of pageNameCandidates) {
            const text = el.innerText?.trim();
            console.log("Checking page-wide candidate:", text);
            if (text && 
                text.length > 5 && 
                !/^add to cart$/i.test(text) && 
                !/^buy now$/i.test(text) &&
                !/^add to list$/i.test(text) &&
                !/^subscribe & save$/i.test(text) &&
                !/^free delivery$/i.test(text) &&
                !/^prime$/i.test(text) &&
                !/^in stock$/i.test(text) &&
                !/^out of stock$/i.test(text) &&
                !/^this thing$/i.test(text) &&
                !/^this item$/i.test(text)) {
              productName = text;
              console.log("Product name from page-wide search:", productName);
              break;
            }
          }
          
          // If still no good name found, try to extract from the URL or page title
          if (!productName || productName === "this item" || productName === "This Thing") {
            console.log("Trying URL and page title extraction...");
            
            // Try to get product name from page title
            const pageTitle = document.title;
            if (pageTitle && pageTitle.length > 10) {
              // Remove Amazon-specific text from title
              const cleanTitle = pageTitle
                .replace(/Amazon\.com:/, '')
                .replace(/Amazon\.com/, '')
                .replace(/Amazon/, '')
                .replace(/^\s*:\s*/, '')
                .trim();
              
              if (cleanTitle && cleanTitle.length > 5) {
                productName = cleanTitle;
                console.log("Product name from page title:", productName);
              }
            }
            
            // Try to extract from URL if it contains product info
            if (!productName || productName === "this item" || productName === "This Thing") {
              const url = window.location.href;
              const urlMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
              if (urlMatch) {
                const asin = urlMatch[1];
                console.log("Found ASIN in URL:", asin);
                // Try to find product info by ASIN
                const asinElement = document.querySelector(`[data-asin="${asin}"]`);
                if (asinElement) {
                  const asinText = asinElement.textContent?.trim();
                  if (asinText && asinText.length > 5) {
                    productName = asinText;
                    console.log("Product name from ASIN element:", productName);
                  }
                }
              }
            }
          }
          
          // Try to find price on the page
          const pagePriceElement = document.querySelector(`
            .a-price, 
            .a-price-whole, 
            .a-offscreen,
            .a-price-current,
            .a-price-range
          `);
          
          if (pagePriceElement) {
            const text = pagePriceElement.innerText;
            const potentialPrices = text.match(/\$?\d{1,3}(?:,?\d{3})*(?:\.\d{1,2})?/g) || [];
            console.log("Potential prices found in element:", potentialPrices);

            let finalPrice = null;
            if (potentialPrices.length > 0) {
              finalPrice = potentialPrices.find(p => p.startsWith('$'));
              if (!finalPrice) {
                  finalPrice = potentialPrices.find(p => p.includes('.'));
              }
              if (!finalPrice && potentialPrices.length === 1) {
                  const singleMatchText = text.toLowerCase();
                  if (!singleMatchText.includes('rating') && !singleMatchText.includes('answered') && !singleMatchText.includes('review')) {
                      finalPrice = potentialPrices[0];
                  }
              }
            }

            if (finalPrice) {
              productPrice = finalPrice;
              numericPrice = parseFloat(productPrice.replace(/[^\d.]/g, ''));
            }
          }
        }
      } catch (e) {
        console.error("Impulse Control: Error extracting product info from shopping page.", e);
      }
    }

    const product = {
      name: extractCoreProductName(productName),
      price: productPrice,
      numericPrice: numericPrice || 0
    };

    // Send product info to background script
    console.log("Sending product info to background and awaiting decision:", product);
    chrome.runtime.sendMessage({ type: "PRODUCT_ADDED", product: product });
  }
});

function showAIPopup(product, initialArgument) {
  if (document.getElementById('impulse-control-popup')) return;

  // Create the gray overlay
  const overlay = document.createElement('div');
  overlay.id = 'impulse-control-overlay';
  document.body.appendChild(overlay);

  const popup = document.createElement('div');
  popup.id = 'impulse-control-popup';
  popup.innerHTML = `
    <div id="impulse-control-popup-content">
      <div id="impulse-control-header">
        <h2>Hold on a second!</h2>
        <button id="impulse-control-close-btn">&times;</button>
      </div>
      <div id="ai-chat-area"></div>
      <form id="impulse-control-chat-form">
        <input type="text" id="impulse-control-chat-input" placeholder="Argue your case..." autocomplete="off">
        <button type="submit">Send</button>
      </form>
      <div id="impulse-control-final-actions">
        <button id="impulse-control-cancel-btn">Cancel Purchase</button>
        <button id="impulse-control-proceed-btn" disabled>Proceed to Purchase</button>
      </div>
    </div>
  `;

  // Create the side panel for recommendations
  const sidePanel = document.createElement('div');
  sidePanel.id = 'impulse-control-side-panel';
  sidePanel.innerHTML = `
    <div id="side-panel-header">
      <h3>💡 Better Alternatives</h3>
      <button id="side-panel-close-btn">&times;</button>
    </div>
    <div id="side-panel-content">
      <div id="recommendations-loading">
        <div class="loading-spinner"></div>
        <p>Finding better alternatives...</p>
      </div>
      <div id="recommendations-list" style="display: none;"></div>
    </div>
  `;

  const style = document.createElement('style');
  style.innerHTML = `
    /* Modern CSS Reset and Base Styles */
    * {
      box-sizing: border-box;
    }
    
    /* Main Popup Container */
    #impulse-control-popup { 
      position: fixed; 
      top: 50%; 
      left: 50%; 
      transform: translate(-50%, -50%); 
      width: 480px; 
      max-width: 90vw; 
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid #e2e8f0;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05);
      border-radius: 20px; 
      z-index: 10000; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
      display: flex; 
      flex-direction: column; 
      height: 600px;
      backdrop-filter: blur(20px);
      animation: popupSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @keyframes popupSlideIn {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }
    
    #impulse-control-popup-content { 
      padding: 0; 
      display: flex; 
      flex-direction: column; 
      height: 100%; 
      border-radius: 20px;
      overflow: hidden;
    }
    
    /* Header */
    #impulse-control-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      border-bottom: 1px solid #e2e8f0; 
      padding: 24px 32px; 
      flex-shrink: 0; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    #impulse-control-header h2 { 
      margin: 0; 
      font-size: 1.5rem; 
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    
    #impulse-control-close-btn { 
      border: none; 
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 1.5rem; 
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      backdrop-filter: blur(10px);
    }
    
    #impulse-control-close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }
    
    /* Overlay */
    #impulse-control-overlay { 
      position: fixed; 
      top: 0; 
      left: 0; 
      width: 100%; 
      height: 100%; 
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 100%);
      z-index: 9999;
      backdrop-filter: blur(8px);
      animation: overlayFadeIn 0.3s ease;
    }
    
    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Chat Area */
    #ai-chat-area { 
      flex-grow: 1; 
      padding: 24px 32px; 
      overflow-y: auto; 
      display: flex; 
      flex-direction: column;
      background: #ffffff;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e0 #f7fafc;
    }
    
    #ai-chat-area::-webkit-scrollbar {
      width: 6px;
    }
    
    #ai-chat-area::-webkit-scrollbar-track {
      background: #f7fafc;
      border-radius: 3px;
    }
    
    #ai-chat-area::-webkit-scrollbar-thumb {
      background: #cbd5e0;
      border-radius: 3px;
    }
    
    #ai-chat-area::-webkit-scrollbar-thumb:hover {
      background: #a0aec0;
    }
    
    .chat-message { 
      margin-bottom: 20px; 
      padding: 16px 20px; 
      border-radius: 18px; 
      max-width: 85%; 
      line-height: 1.6; 
      font-size: 0.95rem;
      position: relative;
      animation: messageSlideIn 0.3s ease;
      overflow-wrap: break-word;
    }
    
    @keyframes messageSlideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .ai-message { 
      background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
      color: #2d3748;
      align-self: flex-start;
      border: 1px solid #e2e8f0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    
    .user-message { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; 
      align-self: flex-end;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    
    /* Prevent line breaks in prices */
    .chat-message .price { 
      white-space: nowrap; 
      display: inline; 
      color: inherit;
      font-weight: 600;
    }
    
    /* Chat Form */
    #impulse-control-chat-form { 
      display: flex; 
      border-top: 1px solid #e2e8f0; 
      padding: 20px 32px; 
      flex-shrink: 0;
      background: #f8fafc;
      gap: 12px;
    }
    
    #impulse-control-chat-input { 
      flex-grow: 1; 
      border: 2px solid #e2e8f0; 
      border-radius: 25px; 
      padding: 12px 20px; 
      font-size: 0.95rem;
      font-family: inherit;
      transition: all 0.2s ease;
      background: white;
    }
    
    #impulse-control-chat-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    #impulse-control-chat-form button { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; 
      border: none; 
      border-radius: 25px; 
      padding: 12px 24px; 
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      min-width: 80px;
    }
    
    #impulse-control-chat-form button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
  
    /* Final Action Buttons */
    #impulse-control-final-actions { 
      display: flex; 
      justify-content: space-between; 
      padding: 20px 32px; 
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      gap: 16px;
    }
    
    #impulse-control-final-actions button { 
      padding: 14px 28px; 
      border-radius: 12px; 
      border: none; 
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s ease;
      flex: 1;
      position: relative;
      overflow: hidden;
    }
    
    #impulse-control-cancel-btn { 
      background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(245, 101, 101, 0.3);
    }
    
    #impulse-control-cancel-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(245, 101, 101, 0.4);
    }
    
    #impulse-control-proceed-btn { 
      background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
      color: white;
      box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
    }
    
    #impulse-control-proceed-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(72, 187, 120, 0.4);
    }
    
    #impulse-control-proceed-btn:disabled { 
      background: linear-gradient(135deg, #a0aec0 0%, #718096 100%);
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Side Panel Styles */
    #impulse-control-side-panel { 
      position: fixed; 
      top: 0; 
      right: -450px; 
      width: 450px; 
      height: 100vh; 
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 10001; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
      display: flex; 
      flex-direction: column; 
      transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(20px);
    }
    
    #impulse-control-side-panel.show { 
      right: 0; 
    }
    
    #side-panel-header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      border-bottom: 1px solid #e2e8f0; 
      padding: 24px 32px; 
      flex-shrink: 0; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    #side-panel-header h3 { 
      margin: 0; 
      font-size: 1.25rem; 
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    
    #side-panel-close-btn { 
      border: none; 
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 1.5rem; 
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      backdrop-filter: blur(10px);
    }
    
    #side-panel-close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: scale(1.05);
    }
    
    #side-panel-content { 
      flex-grow: 1; 
      padding: 24px 32px; 
      overflow-y: auto;
      background: #ffffff;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e0 #f7fafc;
    }
    
    #side-panel-content::-webkit-scrollbar {
      width: 6px;
    }
    
    #side-panel-content::-webkit-scrollbar-track {
      background: #f7fafc;
      border-radius: 3px;
    }
    
    #side-panel-content::-webkit-scrollbar-thumb {
      background: #cbd5e0;
      border-radius: 3px;
    }
    
    #side-panel-content::-webkit-scrollbar-thumb:hover {
      background: #a0aec0;
    }
    
    #recommendations-loading {
      text-align: center;
      padding: 60px 20px;
      color: #718096;
    }
    
    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #e2e8f0;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .recommendation-item {
      background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
      transition: all 0.3s ease;
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 20px;
    }
    
    .recommendation-item:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
      border-color: #cbd5e0;
    }

    .recommendation-icon {
      flex-shrink: 0;
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #e2e8f0 0%, #f7fafc 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: #4a5568;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .recommendation-details {
      flex-grow: 1;
    }

    .recommendation-title {
      font-weight: 700;
      color: #2d3748;
      margin-bottom: 12px;
      font-size: 1.1rem;
      letter-spacing: -0.025em;
    }
    
    .recommendation-description {
      color: #4a5568;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    
    .recommendation-price-container {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .recommendation-price {
      margin-bottom: 0;
    }
    
    .recommendation-savings {
      margin-bottom: 0;
    }
    
    .recommendation-link {
      display: inline-block;
      background: #fff;
      color: white;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }
    
    .recommendation-link:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(popup);
  document.body.appendChild(sidePanel);

  // Show the side panel with animation
  setTimeout(() => {
    sidePanel.classList.add('show');
  }, 100);

  const chatArea = document.getElementById('ai-chat-area');
  const chatForm = document.getElementById('impulse-control-chat-form');
  const chatInput = document.getElementById('impulse-control-chat-input');
  const proceedBtn = document.getElementById('impulse-control-proceed-btn');
  const cancelBtn = document.getElementById('impulse-control-cancel-btn');
  const sidePanelCloseBtn = document.getElementById('side-panel-close-btn');

  function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', `${sender}-message`);
    
    // Wrap prices in spans to prevent line breaks - handle various price formats
    // This pattern handles both $ prices and plain numbers with decimals
    const formattedText = text.replace(/(\$\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?)/g, '<span class="price">$1</span>');
    messageDiv.innerHTML = formattedText;
    
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight; // Auto-scroll to bottom
  }
  
  function closePopup() {
    popup.remove();
    sidePanel.remove();
    style.remove();
    overlay.remove();
  }

  // Load recommendations
  loadRecommendations(product);

  // Display initial argument
  appendMessage(`Regarding ${product.name} for ${product.price}: ${initialArgument}`, 'ai');

  // Handle form submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    appendMessage(userMessage, 'user');
    chatInput.value = '';

    // Send user's message to the background script
    try {
      chrome.runtime.sendMessage({ type: "USER_MESSAGE", message: userMessage });
    } catch (error) {
      if (error.message.includes("Extension context invalidated")) {
        appendMessage("The extension has updated. Please refresh the page to continue chatting.", 'ai');
        chatInput.disabled = true;
        chatForm.querySelector('button').disabled = true;
      }
    }
  });

  document.getElementById('impulse-control-close-btn').addEventListener('click', closePopup);
  cancelBtn.addEventListener('click', closePopup);
  sidePanelCloseBtn.addEventListener('click', () => {
    sidePanel.classList.remove('show');
    setTimeout(() => {
      sidePanel.remove();
    }, 300);
  });

  proceedBtn.addEventListener('click', async () => {
    closePopup();
    
    // Determine if we're on a shopping page
    const isShoppingPage = !document.getElementById('productTitle');
    
    // Check if the original button was a "Buy Now" button
    const isBuyNowButton = originalAddToCartButton && (
      originalAddToCartButton.id === 'buy-now-button' ||
      originalAddToCartButton.getAttribute('data-action') === 'buy-now' ||
      originalAddToCartButton.classList.contains('buy-now-button') ||
      (originalAddToCartButton.value && originalAddToCartButton.value.toLowerCase().includes('buy now')) ||
      (originalAddToCartButton.getAttribute('aria-label') && originalAddToCartButton.getAttribute('aria-label').toLowerCase().includes('buy now')) ||
      (originalAddToCartButton.getAttribute('title') && originalAddToCartButton.getAttribute('title').toLowerCase().includes('buy now'))
    );
    
    if (isShoppingPage && originalAddToCartButton) {
      console.log("Shopping page detected - automatically adding to cart...");
      
      try {
        // Method 1: Try to submit the form directly
        const form = originalAddToCartButton.closest('form');
        if (form) {
          console.log("Found form, submitting directly...");
          // Re-enable the button temporarily
          originalAddToCartButton.disabled = false;
          
          // Create a new submit event
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
          
          // Also try the native submit method
          form.submit();
          
          console.log("Form submitted successfully");
          return;
        }
        
        // Method 2: Try to find and click the actual add to cart button
        const actualAddToCartButton = originalAddToCartButton.closest('[data-action="add-to-cart"], .add-to-cart-button, .a-button-input[value*="Add to Cart"]');
        if (actualAddToCartButton && actualAddToCartButton !== originalAddToCartButton) {
          console.log("Found actual add to cart button, clicking...");
          actualAddToCartButton.disabled = false;
          actualAddToCartButton.click();
          console.log("Actual add to cart button clicked");
          return;
        }
        
        // Method 3: Try to find the button by its data attributes
        const dataButton = document.querySelector('[data-action="add-to-cart"], [data-csa-c-type="button"][data-csa-c-slot-id*="add-to-cart"]');
        if (dataButton) {
          console.log("Found button by data attributes, clicking...");
          dataButton.disabled = false;
          dataButton.click();
          console.log("Data button clicked");
          return;
        }
        
        // Method 4: Try to find any submit button with add to cart functionality
        const submitButtons = document.querySelectorAll('input[type="submit"][name*="addToCart"], input[type="submit"][value*="Add to Cart"]');
        for (const button of submitButtons) {
          if (button !== originalAddToCartButton) {
            console.log("Found submit button, clicking...");
            button.disabled = false;
            button.click();
            console.log("Submit button clicked");
            return;
          }
        }
        
        // Fallback: Use the original method
        console.log("Falling back to original button click method");
        isProceedingWithPurchase = true;
        originalAddToCartButton.disabled = false;
        originalAddToCartButton.click();
        
      } catch (error) {
        console.error("Error automatically adding to cart:", error);
        // Fallback to original method
        console.log("Error occurred, using fallback method");
        isProceedingWithPurchase = true;
        originalAddToCartButton.disabled = false;
        originalAddToCartButton.click();
      }
    } else {
      // Product page - use original method
      console.log("Product page detected - using original method");
      if (originalAddToCartButton) {
        console.log(`Purchase allowed! Clicking the original ${isBuyNowButton ? 'Buy Now' : 'Add to Cart'} button.`);
        isProceedingWithPurchase = true;
        originalAddToCartButton.disabled = false;
        originalAddToCartButton.click();
      } else {
        console.log("Could not find the original button. Please click it again.");
      }
    }
  });
}

// Add a listener for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SHOW_POPUP") {
    console.log("Content: Received instruction to show popup for:", request.product);
    console.log("Content: Product name (original vs shortened):", request.product.name);
    showAIPopup(request.product, request.argument);
  } else if (request.type === "AI_RESPONSE") {
    // This is a new part to handle follow-up AI messages
    console.log("Content: Received AI response:", request.message);
    // The `appendMessage` function is scoped to `showAIPopup`, so we need to find the chat area again.
    const chatArea = document.getElementById('ai-chat-area');
    if (chatArea) {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('chat-message', 'ai-message');
      messageDiv.innerText = request.message;
      chatArea.appendChild(messageDiv);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
  } else if (request.type === "UNLOCK_PROCEED") {
    console.log("Content: Received instruction to unlock proceed button.");
    const proceedBtn = document.getElementById('impulse-control-proceed-btn');
    if (proceedBtn) {
      proceedBtn.disabled = false;
    }
  }
});

// Alternative 2: Wait for dynamic content to load
function waitForProductInfo(productCard, maxWaitTime = 2000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Check if we already have good product info
    const hasGoodInfo = () => {
      const nameElements = productCard.querySelectorAll('h2, h3, .a-text-normal, .a-link-normal');
      for (const el of nameElements) {
        const text = el.innerText?.trim();
        if (text && text.length > 10 && !/^add to cart$/i.test(text)) {
          return true;
        }
      }
      return false;
    };
    
    if (hasGoodInfo()) {
      resolve(productCard);
      return;
    }
    
    // Set up observer to watch for changes
    const observer = new MutationObserver((mutations) => {
      if (Date.now() - startTime > maxWaitTime) {
        observer.disconnect();
        resolve(productCard);
        return;
      }
      
      if (hasGoodInfo()) {
        observer.disconnect();
        resolve(productCard);
      }
    });
    
    observer.observe(productCard, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(productCard);
    }, maxWaitTime);
  });
}

// Alternative 3: Extract from Amazon's internal data structures
function extractFromAmazonData() {
  try {
    // Look for Amazon's global data objects
    const amazonData = window.P || window.ue || window.uex || window.ue_ || window.uex_;
    if (amazonData && amazonData.data) {
      console.log("Found Amazon data object:", amazonData.data);
      // This is a starting point - Amazon's data structure varies
    }
    
    // Look for product data in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || script.innerHTML;
      if (content.includes('"title"') || content.includes('"productTitle"') || content.includes('"name"')) {
        try {
          // Try to extract JSON-like data
          const matches = content.match(/"title"\s*:\s*"([^"]+)"/);
          if (matches && matches[1]) {
            console.log("Found product title in script:", matches[1]);
            return matches[1];
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
    
    return null;
  } catch (e) {
    console.error("Error extracting from Amazon data:", e);
    return null;
  }
}

// Function to clean and extract core product name
function extractCoreProductName(fullName) {
  if (!fullName || fullName === "this item" || fullName === "This Thing") {
    return fullName;
  }
  
  console.log("Cleaning product name (before):", fullName);

  // Add spaces before capital letters and numbers to handle concatenated names
  let spacedName = fullName
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase -> Camel Case
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // ALLCAPSWord -> ALLCAPS Word
    .replace(/([a-zA-Z])(\d)/g, '$1 $2') // Word1 -> Word 1
    .replace(/(\d)([a-zA-Z])/g, '$1 $2'); // 1Word -> 1 Word

  console.log("Cleaning product name (after spacing):", spacedName);
  
  // Remove common Amazon product description patterns
  let cleanedName = spacedName
    // Remove "Pack of X" patterns
    .replace(/\(Pack of \d+\)/gi, '')
    .replace(/Pack of \d+/gi, '')
    // Remove "Made in" patterns
    .replace(/Made in [A-Za-z\s]+/gi, '')
    // Remove "Gluten Free", "Vegan", etc.
    .replace(/(Gluten Free|Vegan|Organic|Natural|Non-GMO)/gi, '')
    // Remove flavor descriptions in parentheses
    .replace(/\([^)]*\)/g, '')
    // Remove "Deliciously satisfying" and similar marketing text
    .replace(/(Deliciously satisfying|Nutritious|Healthy|Premium|High Quality)/gi, '')
    // Remove "made with" descriptions
    .replace(/made with [^,]+/gi, '')
    // Remove "low sugar", "high protein" etc.
    .replace(/(low sugar|high protein|low carb|sugar free)/gi, '')
    // Remove brand repetition
    .replace(/(\w+)\s+\1/gi, '$1')
    // Clean up extra spaces and punctuation
    .replace(/\s+/g, ' ')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
  
  // If the cleaned name is too long, try to extract just the first meaningful part
  if (cleanedName.length > 50) {
    // Split by common separators and take the first meaningful part
    const parts = cleanedName.split(/[,\-–—]/);
    cleanedName = parts[0].trim();
  }
  
  // If still too long, take first few words
  if (cleanedName.length > 30) {
    const words = cleanedName.split(' ');
    cleanedName = words.slice(0, 4).join(' '); // Take first 4 words max
  }
  
  console.log("Cleaned product name (after):", cleanedName);
  return cleanedName;
}

// Function to load recommendations from the background script
async function loadRecommendations(product) {
  try {
    console.log("Loading recommendations for:", product.name);
    
    // Send request to background script for recommendations
    chrome.runtime.sendMessage({ 
      type: "GET_RECOMMENDATIONS", 
      product: product 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting recommendations:", chrome.runtime.lastError);
        showRecommendationsError();
        return;
      }
      
      if (response && response.recommendations) {
        displayRecommendations(response.recommendations);
      } else {
        showRecommendationsError();
      }
    });
    
  } catch (error) {
    console.error("Error loading recommendations:", error);
    showRecommendationsError();
  }
}

// Function to get a relevant icon for a recommendation type
function getIconForRec(type) {
    switch (type) {
        case 'brand': return '🔄'; // A different brand
        case 'store': return '🏬'; // The same item at a different store
        case 'model': return '📉'; // A cheaper model from the same brand
        case 'generic': return '📦'; // A generic or store-brand version
        default: return '💡'; // A general suggestion
    }
}

// Function to display recommendations in the side panel
function displayRecommendations(recommendations) {
  const loadingDiv = document.getElementById('recommendations-loading');
  const listDiv = document.getElementById('recommendations-list');
  
  if (loadingDiv) loadingDiv.style.display = 'none';
  if (listDiv) {
    listDiv.style.display = 'block';
    listDiv.innerHTML = '';
    
    recommendations.forEach((rec, index) => {
      const recItem = document.createElement('div');
      recItem.className = 'recommendation-item';
      recItem.innerHTML = `
        <div class="recommendation-icon">${getIconForRec(rec.type)}</div>
        <div class="recommendation-details">
          <div class="recommendation-title">${rec.title}</div>
          <div class="recommendation-description">${rec.description}</div>
          <div class="recommendation-price-container">
            <span class="recommendation-price">${rec.price}</span>
            ${rec.savings ? `<span class="recommendation-savings">Save ${rec.savings}</span>` : ''}
          </div>
          ${rec.link ? `<a href="${rec.link}" class="recommendation-link" target="_blank">View Deal</a>` : ''}
        </div>
      `;
      listDiv.appendChild(recItem);
    });
  }
}

// Function to show error state for recommendations
function showRecommendationsError() {
  const loadingDiv = document.getElementById('recommendations-loading');
  const listDiv = document.getElementById('recommendations-list');
  
  if (loadingDiv) loadingDiv.style.display = 'none';
  if (listDiv) {
    listDiv.style.display = 'block';
    listDiv.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #666;">
        <p>Unable to load recommendations at this time.</p>
        <p style="font-size: 0.9rem; margin-top: 10px;">
          Consider searching for similar items with lower prices or checking for sales and discounts.
        </p>
      </div>
    `;
  }
} 