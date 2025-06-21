console.log("Content script loaded.");

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
  `;

  document.head.appendChild(style);
  document.body.appendChild(popup);

  const chatArea = document.getElementById('ai-chat-area');
  const chatForm = document.getElementById('impulse-control-chat-form');
  const chatInput = document.getElementById('impulse-control-chat-input');

  function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', `${sender}-message`);
    messageDiv.innerText = text;
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight; // Auto-scroll to bottom
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

  document.getElementById('impulse-control-close-btn').addEventListener('click', function() {
    popup.remove();
    style.remove();
    overlay.remove(); // Also remove the overlay
  });
}

document.addEventListener('click', function(event) {
  const addToCartButton = event.target.closest('#add-to-cart-button');
  if (addToCartButton) {
    event.preventDefault();
    event.stopPropagation();

    // 1. Super-Robust Product Information Extraction
    let productName = 'this item';
    try {
        const titleEl = document.getElementById('productTitle') || document.querySelector('h1#title');
        if (titleEl && titleEl.innerText) {
            productName = titleEl.innerText.trim();
        }
    } catch (e) {
        console.error("Impulse Control: Error extracting product name.", e);
    }
    
    let productPrice = 'a high price';
    try {
      // Find a price element using multiple common selectors for Amazon
      const priceElement = document.querySelector('.a-price, #priceblock_ourprice, .priceToPay, .a-price-whole');
      if (priceElement) {
        // Prefer the '.a-offscreen' price, as it's often the raw, clean price
        const offscreenPrice = priceElement.querySelector('.a-offscreen');
        if (offscreenPrice && offscreenPrice.innerText) {
            productPrice = offscreenPrice.innerText.trim();
        } else if (priceElement.innerText) {
            // As a fallback, take the first non-empty line of text from the element
            const priceText = priceElement.innerText.trim().split(/\\n/).find(s => s.trim() !== '');
            if (priceText) {
                productPrice = priceText;
            }
        }
      }
    } catch (e) {
        console.error("Impulse Control: Error extracting product price.", e);
    }

    const product = {
      name: productName,
      price: productPrice
    };

    // 2. Send product info to background script
    console.log("Sending product info to background and awaiting decision:", product);
    chrome.runtime.sendMessage({ type: "PRODUCT_ADDED", product: product });
  }
});

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
  }
}); 