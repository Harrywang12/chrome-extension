try {
  importScripts('config.js');
} catch (e) {
  console.error(e);
}

console.log("Background script running.");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = CONFIG.GROQ_API_KEY;

// Store conversation histories per tab
let conversationHistories = {};

// This function calls the Groq API to classify a product.
async function isEssential(productName) {
  if (!API_KEY || API_KEY === "YOUR_GROQ_API_KEY_HERE") {
    console.error("Groq API key is not set. Please set it in config.js");
    return true; // Default to essential to avoid blocking the user.
  }

  const prompt = `Is the item '${productName}' essential or non-essential? Essential items are for survival, health, or basic function (e.g., groceries, medicine). Non-essential items are wants or luxuries (e.g., gadgets, designer clothes). Answer with only the word 'essential' or 'non-essential'.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error("Groq API Error:", response.status, response.statusText);
      return true; // Default to essential on API error.
    }

    const data = await response.json();
    const classification = data.choices[0].message.content.trim().toLowerCase();
    console.log(`Groq classification for '${productName}': ${classification}`);
    return classification === 'essential';

  } catch (error) {
    console.error("Error calling Groq API:", error);
    return true; // Default to essential on network error.
  }
}

// This function now manages the ongoing conversation.
async function getAIResponse(history) {
   if (!API_KEY || API_KEY === "YOUR_GROQ_API_KEY_HERE") {
    return "Please set your Groq API key in the extension's config.js file.";
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: history, // Send the entire conversation history
        max_tokens: 150,
        temperature: 0.8,
      }),
    });

     if (!response.ok) {
      console.error("Groq API Error:", response.status, response.statusText);
      return "I'm having trouble thinking right now. Let's talk later.";
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content.trim();
    return aiMessage;

  } catch (error) {
    console.error("Error calling Groq API:", error);
    return "My circuits are fried. Maybe we should both take a break.";
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab.id;

  if (request.type === "PRODUCT_ADDED") {
    (async () => {
      if (!(await isEssential(request.product.name))) {
        // Define the AI's persona and initial prompt
        const systemPrompt = `You are an AI assistant designed to curb impulse buying. Your goal is to be a friendly, slightly snarky "de-influencer". A user wants to buy "${request.product.name}" for "${request.product.price}". Engage in a conversation to make them reconsider. Be persuasive, a bit funny, and focus on saving money, questioning needs vs. wants, and delayed gratification. Do not ask questions in your first message.`;
        
        // Initialize conversation history
        conversationHistories[tabId] = [{ role: "system", content: systemPrompt }];
        const initialResponse = await getAIResponse(conversationHistories[tabId]);
        conversationHistories[tabId].push({ role: "assistant", content: initialResponse });

        chrome.tabs.sendMessage(tabId, { 
          type: "SHOW_POPUP", 
          product: request.product,
          argument: initialResponse 
        });
      }
    })();
    return true; // Indicate async response.
  }

  if (request.type === "USER_MESSAGE") {
    (async () => {
      if (!conversationHistories[tabId]) {
        console.error("No conversation history found for this tab.");
        return;
      }
      
      // Add user message to history
      conversationHistories[tabId].push({ role: "user", content: request.message });
      
      // Get AI's response
      const aiResponse = await getAIResponse(conversationHistories[tabId]);

      // Add AI response to history
      conversationHistories[tabId].push({ role: "assistant", content: aiResponse });

      // Send response back to content script
      chrome.tabs.sendMessage(tabId, { type: "AI_RESPONSE", message: aiResponse });
    })();
    return true; // Indicate async response.
  }
});

// Clean up conversation history when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (conversationHistories[tabId]) {
    delete conversationHistories[tabId];
    console.log(`Cleaned up conversation history for closed tab: ${tabId}`);
  }
}); 