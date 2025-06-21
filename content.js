console.log("Content script loaded.");

let originalAddToCartButton = null;
let isProceedingWithPurchase = false;

// Add mousedown listener to catch events even earlier
document.addEventListener('mousedown', function(event) {
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
        // Try multiple selectors for product cards
        const productCard = addToCartButton.closest(`
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
        
        console.log("Product card found:", productCard);
        
        if (productCard) {
          // Try to find product name in the card - more specific selectors for Amazon product titles
          const nameCandidates = productCard.querySelectorAll(`
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
          
          let foundName = false;
          for (const el of nameCandidates) {
            // Skip if it's a button or input
            if (el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'input') continue;
            // Skip if the text is 'Add to Cart' or similar button text
            const text = el.innerText.trim();
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
          
          if (!foundName) {
            // Fallback: look for any link with product URL pattern that has meaningful text
            const allLinks = productCard.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
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
        }
      } catch (e) {
        console.error("Impulse Control: Error extracting product info from shopping page.", e);
      }
    }

    const product = {
      name: productName,
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

  proceedBtn.addEventListener('click', () => {
    closePopup();
    // Re-click the original "Add to Cart" button.
    if (originalAddToCartButton) {
      console.log("Purchase allowed! Clicking the original button.");
      isProceedingWithPurchase = true;
      originalAddToCartButton.click();
    } else {
      console.log("Could not find the original button. Please click it again.");
    }
  });
}

// Add a listener for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SHOW_POPUP") {
    console.log("Content: Received instruction to show popup for:", request.product);
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