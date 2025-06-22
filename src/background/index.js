import { getGeminiResponse } from './gemini.js';
import { recordDebateResult, isSiteBlocked, isPurchaseApproved } from './storage.js';
import { getCheaperProductAlternatives, getCartDeals } from './serper.js';

console.log("CartWatch background service worker started.");

/**
 * Extracts a unique product identifier from a URL.
 * For Amazon, it's the ASIN. For others, it's the pathname.
 * @param {URL} url - The URL object of the product page.
 * @returns {string} A unique identifier for the product.
 */
function getIdentifierFromUrl(url) {
    if (url.hostname.includes('amazon')) {
        const asinRegex = /\/(dp|gp\/product)\/([A-Z0-9]{10})/;
        const match = url.pathname.match(asinRegex);
        if (match && match[2]) {
            return match[2]; // Return the ASIN
        }
    }
    return url.pathname; // Fallback to the full pathname for other sites
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'PURCHASE_ATTEMPT':
            handlePurchaseAttempt(message, sender, sendResponse);
            break;
        case 'USER_MESSAGE':
            handleUserMessage(message, sender, sendResponse);
            break;
        case 'END_DEBATE':
            handleEndDebate(message, sender, sendResponse);
            break;
    }
    return true; // Keep message channel open for async responses
});

// --- Message Handlers ---

async function handlePurchaseAttempt(message, sender, sendResponse) {
    const { product } = message;
    const { tab } = sender;
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const identifier = getIdentifierFromUrl(url);

    // Make the purchase key specific to the unique product identifier (e.g., ASIN).
    const purchaseKey = `${hostname}::${identifier}`;

    if (await isSiteBlocked(hostname)) {
        console.log(`Site ${hostname} is blocked. Responding with 'block'.`);
        sendResponse({ action: 'block' });
        return;
    }

    if (await isPurchaseApproved(purchaseKey)) {
        console.log(`Purchase ${purchaseKey} was recently approved. Responding with 'proceed'.`);
        sendResponse({ action: 'proceed' });
        return;
    }

    // This is a new debate.
    console.log("New debate initiated. Getting first AI message.");

    // Find cheaper alternatives or deals based on the context.
    let alternatives = null;
    if (product.isCart) {
        console.log("Searching for sitewide deals...");
        alternatives = await getCartDeals(hostname);
    } else {
        console.log(`Searching for cheaper product alternatives on ${hostname} for item priced at $${product.price}`);
        alternatives = await getCheaperProductAlternatives(product.name, product.price, hostname);
    }

    const aiResponse = await getGeminiResponse(product, [], alternatives);
    const conversationForSession = [
        { role: 'user', parts: [{ text: `I want to buy: ${product.name} for $${product.price}` }] },
        { role: 'model', parts: [{ text: aiResponse.response }] }
    ];

    await chrome.storage.session.set({
        currentDebate: {
            product,
            tabId: tab.id,
            hostname,
            identifier, // Store the identifier for later
            conversation: conversationForSession,
        }
    });

    console.log("Responding with 'debate'.");
    sendResponse({ 
        action: 'debate',
        product: product,
        firstMessage: aiResponse.response,
        alternatives: alternatives
    });
}

async function handleUserMessage(message, sender, sendResponse) {
    const { currentDebate } = await chrome.storage.session.get('currentDebate');
    if (!currentDebate) return;

    // Add user message to conversation
    currentDebate.conversation.push({ role: 'user', parts: [{ text: message.text }] });

    const aiResponse = await getGeminiResponse(currentDebate.product, currentDebate.conversation, null);
    
    // Add AI response to conversation
    currentDebate.conversation.push({ role: 'model', parts: [{ text: aiResponse.response }] });

    // Save the new conversation state
    await chrome.storage.session.set({ currentDebate });

    chrome.tabs.sendMessage(sender.tab.id, {
        type: 'AI_RESPONSE',
        text: aiResponse.response,
        decision: aiResponse.decision
    });
    sendResponse({ status: "success" });
}

async function handleEndDebate(message, sender, sendResponse) {
    const { currentDebate } = await chrome.storage.session.get('currentDebate');
    if (currentDebate) {
        await recordDebateResult(currentDebate.product, currentDebate.hostname, message.outcome, currentDebate.identifier);
        chrome.storage.session.remove('currentDebate');
        chrome.tabs.sendMessage(sender.tab.id, { type: 'CLOSE_DEBATE_MODAL', outcome: message.outcome });
    }
    sendResponse({ status: "success" });
}

// Initialize default storage on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        stats: { moneySaved: 0, debatesWon: 0, totalDebates: 0 },
        history: [],
        blockedSites: {},
        approvedPurchases: {}
    });
});
