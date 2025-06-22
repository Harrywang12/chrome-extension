import { getGeminiResponse } from './gemini.js';
import { recordDebateResult, isSiteBlocked, isPurchaseApproved } from './storage.js';
import { getCheaperAlternatives } from './serper.js';

console.log("CartWatch background service worker started.");

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
    const hostname = new URL(tab.url).hostname;
    const purchaseKey = hostname + product.price;

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

    // First, find cheaper alternatives using Serper API
    const alternatives = await getCheaperAlternatives(product.name);

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
        await recordDebateResult(currentDebate.product, currentDebate.hostname, message.outcome);
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
