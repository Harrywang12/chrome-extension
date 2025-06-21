console.log("Content script loaded.");

let originalAddToCartButton = null;
let isProceedingWithPurchase = false;

// Add mousedown listener to catch events even earlier
document.addEventListener('mousedown', async function(event) {
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
    input.a-button-input[type="submit"]
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
          const priceWhole = priceElement.querySelector('.a-price-whole');
          const priceFraction = priceElement.querySelector('.a-price-fraction');
          if (priceWhole && priceFraction) {
            productPrice = `${priceWhole.innerText.trim()}${priceFraction.innerText.trim()}`;
            numericPrice = parseFloat(`${priceWhole.innerText.trim()}${priceFraction.innerText.trim().replace('.', '')}`);
          } else {
            const priceText = priceElement.innerText.trim().split(/\\n/).find(s => s.trim().startsWith('$') || s.trim().startsWith('CDN$'));
            if (priceText) {
              productPrice = priceText;
              numericPrice = parseFloat(priceText.replace(/[^\\d.]/g, ''));
            } else {
              productPrice = priceElement.innerText.trim();
              numericPrice = parseFloat(priceElement.innerText.trim().replace(/[^\\d.]/g, ''));
            }
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
                  !/^in stock$/i.test(text) &&
                  !/^out of stock$/i.test(text)) {
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
                  !/^out of stock$/i.test(text) &&
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
            const priceWhole = priceElement.querySelector('.a-price-whole');
            const priceFraction = priceElement.querySelector('.a-price-fraction');
            if (priceWhole && priceFraction) {
              productPrice = `${priceWhole.innerText.trim()}${priceFraction.innerText.trim()}`;
              numericPrice = parseFloat(`${priceWhole.innerText.trim()}${priceFraction.innerText.trim().replace('.', '')}`);
            } else if (priceElement.innerText) {
              productPrice = priceElement.innerText.trim();
              numericPrice = parseFloat(priceElement.innerText.trim().replace(/[^\\d.]/g, ''));
            }
            console.log("Product price extracted:", productPrice);
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
            const priceWhole = pagePriceElement.querySelector('.a-price-whole');
            const priceFraction = pagePriceElement.querySelector('.a-price-fraction');
            if (priceWhole && priceFraction) {
              productPrice = `${priceWhole.innerText.trim()}${priceFraction.innerText.trim()}`;
              numericPrice = parseFloat(`${priceWhole.innerText.trim()}${priceFraction.innerText.trim().replace('.', '')}`);
            } else if (pagePriceElement.innerText) {
              productPrice = pagePriceElement.innerText.trim();
              numericPrice = parseFloat(pagePriceElement.innerText.trim().replace(/[^\\d.]/g, ''));
            }
            console.log("Product price from page-wide search:", productPrice);
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

  const style = document.createElement('style');
  style.innerHTML = `
    #impulse-control-popup { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 400px; max-width: 90vw; background-color: white; border: 1px solid #ccc; box-shadow: 0 5px 15px rgba(0,0,0,0.3); border-radius: 8px; z-index: 10000; font-family: sans-serif; display: flex; flex-direction: column; height: 500px; }
    #impulse-control-popup-content { padding: 0; display: flex; flex-direction: column; height: 100%; }
    #impulse-control-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding: 10px 20px; flex-shrink: 0; }
    #impulse-control-header h2 { margin: 0; font-size: 1.25rem; }
    #impulse-control-close-btn { border: none; background: transparent; font-size: 1.5rem; cursor: pointer; }
    
    /* New Overlay Style */
    #impulse-control-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); z-index: 9999; }

    /* New Chat Area Styles */
    #ai-chat-area { flex-grow: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; }
    .chat-message { margin-bottom: 15px; padding: 8px 12px; border-radius: 18px; max-width: 80%; line-height: 1.4; }
    .ai-message { background-color: #f1f0f0; align-self: flex-start; }
    .user-message { background-color: #007bff; color: white; align-self: flex-end; }
    
    #impulse-control-chat-form { display: flex; border-top: 1px solid #eee; padding: 10px; flex-shrink: 0; }
    #impulse-control-chat-input { flex-grow: 1; border: 1px solid #ccc; border-radius: 20px; padding: 8px 15px; font-size: 1rem; }
    #impulse-control-chat-form button { background-color: #007bff; color: white; border: none; border-radius: 20px; padding: 8px 15px; margin-left: 10px; cursor: pointer; }
  
    /* Final Action Buttons */
    #impulse-control-final-actions { display: flex; justify-content: space-between; padding: 10px; border-top: 1px solid #eee; }
    #impulse-control-final-actions button { padding: 10px 15px; border-radius: 5px; border: none; font-weight: bold; cursor: pointer; }
    #impulse-control-cancel-btn { background-color: #dc3545; color: white; }
    #impulse-control-proceed-btn { background-color: #28a745; color: white; }
    #impulse-control-proceed-btn:disabled { background-color: #6c757d; cursor: not-allowed; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(popup);

  const chatArea = document.getElementById('ai-chat-area');
  const chatForm = document.getElementById('impulse-control-chat-form');
  const chatInput = document.getElementById('impulse-control-chat-input');
  const proceedBtn = document.getElementById('impulse-control-proceed-btn');
  const cancelBtn = document.getElementById('impulse-control-cancel-btn');

  function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', `${sender}-message`);
    messageDiv.innerText = text;
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight; // Auto-scroll to bottom
  }
  
  function closePopup() {
    popup.remove();
    style.remove();
    overlay.remove();
  }

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

  proceedBtn.addEventListener('click', async () => {
    closePopup();
    
    // Determine if we're on a shopping page
    const isShoppingPage = !document.getElementById('productTitle');
    
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
        console.log("Purchase allowed! Clicking the original button.");
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
  
  console.log("Cleaning product name:", fullName);
  
  // Remove common Amazon product description patterns
  let cleanedName = fullName
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
  
  console.log("Cleaned product name:", cleanedName);
  return cleanedName;
} 