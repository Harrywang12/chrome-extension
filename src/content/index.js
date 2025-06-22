// This script is a combination of the original index.js and ui.js
// to avoid using ES modules in content scripts, which have limitations.

console.log("CartWatch content script loaded (v3.1).");

// --- STATE ---
let aDebateIsActive = false;
let lastCheckedUrl = '';
let isProceedingAfterWin = false;

// --- UI CREATION ---

function createAlternativesPanel(alternatives) {
    const panelId = 'cartwatch-alternatives-panel-container';
    if (document.getElementById(panelId) || !alternatives || alternatives.length === 0) return;

    const panelWrapper = document.createElement('div');
    panelWrapper.id = panelId;
    panelWrapper.style.position = 'fixed';
    panelWrapper.style.top = '120px'; // Give some space from the top
    panelWrapper.style.right = '24px';
    panelWrapper.style.width = '350px';
    panelWrapper.style.zIndex = '2147483645'; // Just under the modal
    
    const shadow = panelWrapper.attachShadow({ mode: 'open' });

    const hasAlternatives = alternatives && alternatives.length > 0;
    if (!hasAlternatives) return;

    const alternativeType = alternatives[0].type;
    let panelTitle = "Alternatives";
    let panelSubtitle = "Similar Products on Amazon";

    if (alternativeType === 'product_cheaper') {
        panelTitle = "Cheaper Alternatives";
    } else if (alternativeType === 'product_general') {
        panelTitle = "Product Alternatives";
    } else if (alternativeType === 'deal') {
        panelTitle = "Coupons & Deals";
        panelSubtitle = "Found via Web Search";
    }
    
    shadow.innerHTML = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            :host {
                --surface-color: #ffffff;
                --primary-background: #f7f8fc;
                --primary-text: #1a1a1a;
                --secondary-text: #5c5f6e;
                --accent-primary: #4f46e5;
                --border-color: #e5e7eb;
                --shadow-color: rgba(79, 70, 229, 0.1);
                --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            @keyframes fade-in-up-panel {
                from { opacity: 0; transform: translateY(15px); }
                to { opacity: 1; transform: translateY(0); }
            }
           .alternatives-panel {
                width: 100%;
                height: 620px;
                max-height: 75vh;
                background: var(--surface-color);
                border-radius: 20px;
                box-shadow: 0 10px 25px -5px var(--shadow-color), 0 8px 10px -6px var(--shadow-color);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                color: var(--primary-text);
                font-family: var(--font-primary);
                border: 1px solid var(--border-color);
                animation: fade-in-up-panel 0.4s ease-out forwards;
            }
            .alternatives-panel header {
                padding: 24px;
                border-bottom: 1px solid var(--border-color);
                background-color: var(--surface-color);
            }
            .alternatives-panel h3 {
                margin: 0 0 4px;
                font-size: 20px;
                font-weight: 700;
                color: var(--primary-text);
            }
             .alternatives-panel p {
                 margin: 0;
                 font-size: 14px;
                 color: var(--secondary-text);
             }
            .alternatives-panel ul {
                list-style: none;
                padding: 16px;
                margin: 0;
                overflow-y: auto;
                flex-grow: 1;
            }
            .alternatives-panel li {
                margin-bottom: 12px;
            }
            .alternatives-panel li a {
                display: block;
                padding: 16px;
                border: 1px solid var(--border-color);
                border-radius: 12px;
                text-decoration: none;
                color: var(--primary-text);
                background: var(--surface-color);
                transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
            }
            .alternatives-panel li a:hover {
                box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                transform: translateY(-2px);
                border-color: var(--accent-primary);
            }
            .alt-title {
                font-size: 16px;
                font-weight: 600;
                color: var(--accent-primary);
                display: block;
                margin-bottom: 8px;
            }
            .alt-snippet {
                font-size: 14px;
                line-height: 1.5;
                color: var(--secondary-text);
                margin: 0;
            }
        </style>
        <div class="alternatives-panel">
             <header>
                <h3>${panelTitle}</h3>
                <p>${panelSubtitle}</p>
            </header>
            <ul>
                ${alternatives.map(alt => `
                    <li>
                        <a href="${alt.link}" target="_blank" rel="noopener noreferrer">
                            <strong class="alt-title">${alt.title}</strong>
                            <p class="alt-snippet">${alt.snippet}</p>
                        </a>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
    document.body.appendChild(panelWrapper);
}

function createModal(product, firstMessage) {
    const modalId = 'cartwatch-modal-container';
    if (document.getElementById(modalId)) return;

    const modalWrapper = document.createElement('div');
    modalWrapper.id = modalId;
    const shadow = modalWrapper.attachShadow({ mode: 'open' });

    let alternativesHTML = '';
    
    shadow.innerHTML = `
        <style>/* --- Modern & Premium UI Overhaul --- */
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            
            :host {
                /* Color Palette */
                --surface-color: #ffffff;
                --primary-background: #f7f8fc;
                --primary-text: #1a1a1a;
                --secondary-text: #5c5f6e;
                --accent-primary: #4f46e5;
                --accent-primary-hover: #4338ca;
                --border-color: #e5e7eb;
                --shadow-color: rgba(79, 70, 229, 0.1);
                --success-color: #16a34a;
                --danger-color: #dc2626;
                --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            /* Main Backdrop & Animation */
            .backdrop {
                z-index: 2147483647;
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(26, 26, 26, 0.5);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            @keyframes fade-in-up {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* Main Layout */
            .main-container {
                display: flex;
                flex-direction: row;
                align-items: flex-start;
                gap: 24px;
            }

            /* --- Chat Modal --- */
            .container {
                font-family: var(--font-primary);
                width: 520px;
                max-width: 90vw;
                height: 620px;
                max-height: 85vh;
                background: var(--surface-color);
                border-radius: 20px;
                box-shadow: 0 10px 25px -5px var(--shadow-color), 0 8px 10px -6px var(--shadow-color);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid var(--border-color);
                animation: fade-in-up 0.4s ease-out forwards;
            }

            /* Header */
            .header {
                padding: 24px;
                border-bottom: 1px solid var(--border-color);
                text-align: center;
            }
            .header h2 {
                font-size: 24px;
                font-weight: 700;
                margin: 0 0 8px;
                color: var(--primary-text);
            }
            .header p {
                margin: 0;
                color: var(--secondary-text);
                font-size: 16px;
            }
            .header p span {
                color: var(--accent-primary);
                font-weight: 600;
            }

            /* Chat Window */
            .chat-window {
                flex-grow: 1;
                padding: 16px 24px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 16px;
                background-color: var(--primary-background);
            }
            .message {
                max-width: 85%;
                padding: 12px 18px;
                border-radius: 18px;
                line-height: 1.6;
                word-wrap: break-word;
            }
            .message p { margin: 0; }
            .ai {
                background: #e5e7eb;
                color: var(--primary-text);
                align-self: flex-start;
                border-bottom-left-radius: 4px;
            }
            .user {
                background: var(--accent-primary);
                color: white;
                align-self: flex-end;
                border-bottom-right-radius: 4px;
            }

            /* Footer & Inputs */
            .footer {
                padding: 16px 24px;
                border-top: 1px solid var(--border-color);
                background: var(--surface-color);
            }
            .input-area {
                display: flex;
                gap: 12px;
                margin-bottom: 16px;
            }
            #user-input {
                flex-grow: 1;
                background: var(--primary-background);
                border: 1px solid var(--border-color);
                border-radius: 25px;
                padding: 12px 18px;
                color: var(--primary-text);
                font-size: 16px;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            #user-input:focus {
                outline: none;
                border-color: var(--accent-primary);
                box-shadow: 0 0 0 3px var(--shadow-color);
            }
            #send-btn {
                background: var(--accent-primary);
                color: white;
                border: none;
                border-radius: 25px;
                padding: 0 24px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            #send-btn:hover {
                background-color: var(--accent-primary-hover);
            }
            .button-area {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            .action-btn {
                border: none;
                border-radius: 12px;
                padding: 14px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: opacity 0.2s, transform 0.2s;
            }
            .action-btn:hover {
                transform: translateY(-2px);
            }
            .action-btn.give-up {
                background: var(--danger-color);
                color: white;
            }
            .action-btn.proceed {
                background: var(--success-color);
                color: white;
            }
            .action-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .typing-indicator p span { display:inline-block; animation:bounce 0.6s infinite; }
            .typing-indicator p span:nth-child(2) { animation-delay:0.1s; }
            .typing-indicator p span:nth-child(3) { animation-delay:0.2s; }
            @keyframes bounce { 0%,100% {transform:translateY(0);} 50% {transform:translateY(-5px);} }

            /* --- Alternatives Panel --- */
            .alternatives-panel {
                display: none; /* This is now a separate component */
            }
        </style>
        <div class="backdrop">
            <div class="main-container">
                <div class="container">
                    <header class="header">
                        <h2>Time to reflect...</h2>
                        <p>You're about to spend <span>$${product.price.toFixed(2)}</span> on <span>${product.name}</span>.</p>
                    </header>
                    <div class="chat-window"></div>
                    <footer class="footer">
                        <div class="input-area">
                            <input type="text" id="user-input" placeholder="Justify your purchase...">
                            <button id="send-btn">Send</button>
                        </div>
                        <div class="button-area">
                            <button id="give-up-btn" class="action-btn give-up">I'll wait.</button>
                            <button id="proceed-btn" class="action-btn proceed" disabled>Proceed with Purchase</button>
                        </div>
                    </footer>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalWrapper);
    addMessage(shadow, firstMessage, 'ai'); // Display the first message from the AI
    attachListeners(shadow);
}

function attachListeners(shadow) {
    const sendBtn = shadow.getElementById('send-btn');
    const userInput = shadow.getElementById('user-input');
    const giveUpBtn = shadow.getElementById('give-up-btn');
    const proceedBtn = shadow.getElementById('proceed-btn');

    const handleSendMessage = () => {
        const text = userInput.value.trim();
        if (text) {
            addMessage(shadow, text, 'user');
            userInput.value = '';
            showTyping(shadow);
            safeSendMessage({ type: 'USER_MESSAGE', text });
        }
    };

    sendBtn.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keydown', e => e.key === 'Enter' && handleSendMessage());
    giveUpBtn.addEventListener('click', () => safeSendMessage({ type: 'END_DEBATE', outcome: 'lost' }));
    proceedBtn.addEventListener('click', () => safeSendMessage({ type: 'END_DEBATE', outcome: 'won' }));
}

// --- UI HELPERS ---

function addMessage(shadow, text, sender) {
    const chatWindow = shadow.querySelector('.chat-window');
    const typing = shadow.querySelector('.typing-indicator');
    if (typing) typing.remove();
    const p = document.createElement('p');
    p.textContent = text;
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.appendChild(p);
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTyping(shadow) {
    const chatWindow = shadow.querySelector('.chat-window');
    const div = document.createElement('div');
    div.className = 'message ai typing-indicator';
    div.innerHTML = `<p><span>.</span><span>.</span><span>.</span></p>`;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function closeDebateModal() {
    document.getElementById('cartwatch-modal-container')?.remove();
}

function unlockPurchaseButton(shadow) {
    const proceedBtn = shadow.getElementById('proceed-btn');
    if (proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.textContent = "Purchase Unlocked!";
    }
}

// A wrapper to safely send messages to the background script.
// This prevents "Extension context invalidated" errors if the page navigates away.
function safeSendMessage(message) {
    try {
        // The chrome.runtime API may not exist if the context is invalidated.
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(message);
        }
    } catch (e) {
        // We expect this error to happen if the user navigates away from the page
        // while the debate modal is open. We can safely ignore it.
        if (String(e.message).includes("Extension context invalidated")) {
            console.log("CartWatch: Message not sent because page context was invalidated.");
        } else {
            // Re-throw other unexpected errors.
            throw e;
        }
    }
}

// --- MESSAGE HANDLING ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // If the runtime ID is gone, the context is invalidated. Do nothing.
    if (!chrome.runtime?.id) {
        return;
    }

    const shadow = document.getElementById('cartwatch-modal-container')?.shadowRoot;
    switch (message.type) {
        case 'AI_RESPONSE':
            if (shadow) {
                addMessage(shadow, message.text, 'ai');
                if (message.decision === 'unlock') unlockPurchaseButton(shadow);
            }
            break;
        case 'CLOSE_DEBATE_MODAL':
            aDebateIsActive = false; // Reset state
            if (message.outcome === 'won') {
                // If the user won, click the original button and let the event proceed.
                const approvedButton = window.lastClickedButton;
                if (approvedButton) {
                    isProceedingAfterWin = true;
                    approvedButton.click();
                }
            }
            closeDebateModal();
            break;
    }
    sendResponse({ status: "success" });
    return true;
});

// --- TRIGGERING LOGIC ---

function triggerDebate(priceInfo, isButtonClick) {
    if (aDebateIsActive) return;
    aDebateIsActive = true;
    
    chrome.runtime.sendMessage({ type: 'PURCHASE_ATTEMPT', product: priceInfo }, response => {
        if (chrome.runtime.lastError) {
            console.error("CartWatch Error:", chrome.runtime.lastError.message);
            aDebateIsActive = false; // Reset state on error
            return;
        }

        if (response.action === 'debate') {
            createModal(response.product, response.firstMessage);
            // Also ensure the alternatives panel is visible
            createAlternativesPanel(response.alternatives);
        } else if (response.action === 'proceed' && isButtonClick) {
            // If the purchase is approved and was triggered by a button, click it.
            window.lastClickedButton?.click();
            aDebateIsActive = false;
        } else {
            // For 'block', or 'proceed' on a page load, just reset the state.
            aDebateIsActive = false;
        }
    });
}

const purchaseSelectors = [
    // Product Page "Buy Now" type buttons
    'button:contains("Buy now")',
    '#buy-now-button',
    'button:contains("Add to Cart")', // Catch this to handle mini-cart checkouts
    '[data-test="buy-now-button"]',

    // Cart/Checkout Page buttons
    'button:contains("Proceed to checkout")',
    'a:contains("Proceed to checkout")',
    'input[name="proceedToRetailCheckout"]',  // Amazon
    '#sc-buy-box-ptc-button',                 // Amazon cart
    'button[name="checkout"]',
    '[data-test="proceed-to-checkout-button"]'
];

const checkoutUrlPatterns = [
    '/checkout', '/cart', '/basket', '/order', '/billing', '/payment', 'checkout.shopify.com'
];

function handlePurchaseClick(event) {
    if (isProceedingAfterWin) {
        isProceedingAfterWin = false; // Reset flag
        return;
    }

    if (aDebateIsActive) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
    }
    
    let priceInfo;
    const buttonText = event.target.innerText?.toLowerCase() || "";
    const isCheckoutFlow = buttonText.includes('checkout') || event.target.closest('#sc-buy-box-ptc-button');

    if (isCheckoutFlow) {
        console.log("CartWatch: Checkout button intercepted.");
        priceInfo = extractTotalPrice();
        priceInfo.isCart = true; // Add a flag to indicate this is a cart/checkout flow
    } else {
        console.log("CartWatch: 'Buy Now' / 'Add to Cart' button intercepted.");
        priceInfo = extractItemPrice(event.target);
        priceInfo.isCart = false;
    }

    // Only activate the debate for items/carts that cost more than $50.
    if (priceInfo.price <= 50) {
        console.log(`CartWatch: Price ($${priceInfo.price.toFixed(2)}) is not over $50. Allowing purchase to proceed.`);
        return; // Allow the default browser behavior (navigation) to occur.
    }
    
    // If the price is over $50, *now* we prevent navigation and start the debate.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    console.log(`CartWatch: Intercepting purchase for item/cart over $50!`);

    window.lastClickedButton = event.target;
    triggerDebate(priceInfo, true);
}

function checkUrlForCheckout() {
    // This functionality is disabled to ensure the debate happens on the product page
    // immediately after the "Buy Now" click, not on the checkout page.
    return;

    /* Original logic below for reference
    if (window.location.href === lastCheckedUrl || aDebateIsActive) return;
    lastCheckedUrl = window.location.href;

    const isCheckoutPage = checkoutUrlPatterns.some(pattern => lastCheckedUrl.includes(pattern));

    if (isCheckoutPage) {
        console.log("CartWatch: Checkout page detected.");
        const priceInfo = extractTotalPrice();
        if (priceInfo && priceInfo.price > 0) {
            triggerDebate(priceInfo, false); // Pass false for isButtonClick
        }
    }
    */
}

function extractItemPrice(buttonElement) {
    let productTitle = "this item";
    let productPrice = "0.00";
    const hostname = window.location.hostname;
    // This regex is more flexible, matching numbers with commas/dots, with an optional dollar sign.
    const priceRegex = /\$?(\d[\d,.]*\d)/;

    // --- Amazon-specific Logic ---
    if (hostname.includes("amazon")) {
        // Title is very consistent on Amazon, using its ID is reliable.
        const titleElement = document.getElementById("productTitle");
        if (titleElement) {
            productTitle = titleElement.innerText.trim();
        }

        // Price on Amazon can be in several places. We check the most likely ones.
        // The .a-offscreen class usually holds the full price string (e.g., "$19.99").
        const priceSelectors = [
            '#corePrice_feature_div .a-offscreen', // Main price block
            '#dealprice_savings .a-offscreen',     // Price for items on deal
            '#price_inside_buybox',                // Price inside the main buy box
            '#newBuyBoxPrice',                     // Another common price element
            '.a-price.a-text-price span.a-offscreen' // A more generic price element
        ];

        for (const selector of priceSelectors) {
            const priceElement = document.querySelector(selector);
            if (priceElement && priceElement.innerText) {
                const match = priceElement.innerText.match(priceRegex);
                if (match && match[1]) {
                    productPrice = match[1];
                    break; // Stop when we find the first valid price
                }
            }
        }
    } else {
        // --- Generic Fallback Logic for other sites ---
        let container = buttonElement;
        for (let i = 0; i < 10 && container; i++) { // Increased search depth to 10 levels
            // Find price if not already found
            if (productPrice === "0.00") {
                const priceElements = Array.from(container.querySelectorAll('[class*="price"], [id*="price"]'));
                for (const el of priceElements) {
                    if (el && el.innerText) {
                        const match = el.innerText.match(priceRegex);
                        if (match && match[1]) {
                            productPrice = match[1];
                            break;
                        }
                    }
                }
            }

            // Find title if not already found
            if (productTitle === "this item") {
                 const titleElement = container.querySelector('h1, h2, h3, [class*="title"], [id*="title"]');
                 if (titleElement && titleElement.innerText) {
                    productTitle = titleElement.innerText.trim();
                }
            }

            // If we have both, we can stop searching.
            if (productPrice !== "0.00" && productTitle !== "this item") {
                break;
            }
            
            container = container.parentElement;
        }
    }

    // --- Final Fallback for Title ---
    if (productTitle === "this item") {
        productTitle = document.title.split(/\||-/)[0].trim();
    }
    
    return { name: productTitle, price: parseFloat(productPrice.replace(/,/g, '')) || 0 };
}

function extractTotalPrice() {
    const priceRegex = /\$?(\d[\d,.]*\d)/;
    let finalPrice = "0.00";
    let foundPrice = false;
    const hostname = window.location.hostname;

    if (hostname.includes("amazon")) {
        // Amazon cart/checkout pages have specific IDs for totals.
        const amazonTotalSelectors = [
            '#sc-subtotal-amount-buybox span',      // Subtotal in main cart
            '#sc-subtotal-amount-activecart span',  // Subtotal in the side "active cart" view
            '[data-feature-name="subtotal"] .a-color-price', // Generic subtotal section on checkout pages
            '#subtotal-amount-right-text' // another subtotal variation
        ];
        for (const selector of amazonTotalSelectors) {
            const element = document.querySelector(selector);
            if (element && element.innerText) {
                const match = element.innerText.match(priceRegex);
                if (match && match[1]) {
                    finalPrice = match[1];
                    foundPrice = true;
                    break;
                }
            }
        }
    }

    // Generic fallback if Amazon-specific fails or it's another site.
    if (!foundPrice) {
        const totalSelectors = ['[class*="total"]', '[id*="total"]', '[class*="summary"]', '[class*="subtotal"]'];
        for (const selector of totalSelectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            for (const element of elements) {
                if (element) {
                    const textContent = element.innerText;
                    // Look for keywords like total or subtotal
                    if (textContent && /total|subtotal/i.test(textContent)) {
                        const match = textContent.match(priceRegex);
                        if (match && match[1]) {
                            finalPrice = match[1];
                            foundPrice = true;
                            break;
                        }
                    }
                }
            }
            if (foundPrice) break;
        }
    }
    
    return { name: `your total purchase`, price: parseFloat(finalPrice.replace(/,/g, '')) || 0 };
}

let initialScanDone = false;
const observedElements = new Set();
function scanAndAttachListeners() {
    purchaseSelectors.forEach(selector => {
         if (selector.includes(':contains')) {
            const text = selector.split(':contains(')[1].replace(/['")]/g, '');
            document.querySelectorAll('button, a, input[type="submit"]').forEach(el => {
                if (!observedElements.has(el) && el.textContent.toLowerCase().includes(text.toLowerCase())) {
                    el.addEventListener('click', handlePurchaseClick, { capture: true });
                    observedElements.add(el);
                }
            });
        } else {
            document.querySelectorAll(selector).forEach(el => {
                if (!observedElements.has(el)) {
                    el.addEventListener('click', handlePurchaseClick, { capture: true });
                    observedElements.add(el);
                }
            });
        }
    });
}

function handlePageLoadForAlternatives() {
    // Check if we are on a product page, not a cart or checkout page.
    const isProductPage = document.getElementById("productTitle") && !checkoutUrlPatterns.some(p => window.location.href.includes(p));
    
    if (isProductPage) {
        const priceInfo = extractItemPrice(document.body);
        
        // Only fetch for items over a certain value to avoid being noisy.
        if (priceInfo && priceInfo.price > 20) {
            console.log("CartWatch: Product page detected. Fetching alternatives...");
            chrome.runtime.sendMessage({ type: 'GET_ALTERNATIVES', product: priceInfo }, response => {
                 if (chrome.runtime.lastError) {
                    console.error("CartWatch Error:", chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.alternatives) {
                    createAlternativesPanel(response.alternatives);
                }
            });
        }
    }
}

// Use MutationObserver for instant detection of changes
const observer = new MutationObserver((mutations) => {
    // We can debounce this if it becomes too noisy, but for now, direct is fine.
    scanAndAttachListeners();
    checkUrlForCheckout();

    if (!initialScanDone) {
        handlePageLoadForAlternatives();
        initialScanDone = true;
    }
});

// Initial listeners scan
scanAndAttachListeners();
handlePageLoadForAlternatives(); // Also run on initial script execution

observer.observe(document.body, {
    childList: true,
    subtree: true
});
