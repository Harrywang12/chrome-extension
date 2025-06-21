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

// This function generates a shorter, more conversational product name
async function shortenProductName(fullName) {
  if (!API_KEY || API_KEY === "YOUR_GROQ_API_KEY_HERE") {
    return fullName; // Fallback to original name
  }
  
  const prompt = `Shorten this Amazon product name to something ordinary and conversational that everyone would naturally call it. Include the brand name if it adds clarity, but make it sound like how you'd refer to it in everyday conversation. For example:
- "Wilson Federer Pro Tennis Racket" → "tennis racket" or "Wilson tennis racket"
- "Samsung 65-inch Class QLED 4K UHD Smart TV" → "Samsung TV" or "TV"
- "Apple iPhone 15 Pro Max 256GB" → "iPhone" or "iPhone 15"
- "Nike Air Jordan 1 Retro High OG" → "Nike sneakers" or "Jordan sneakers"

Product: "${fullName}"
Return only the shortened, ordinary name, nothing else.`;

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
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("Groq API Error:", response.status, response.statusText);
      return fullName; // Fallback to original name
    }

    const data = await response.json();
    const shortenedName = data.choices[0].message.content.trim();
    console.log(`Shortened product name: "${fullName}" -> "${shortenedName}"`);
    return shortenedName;

  } catch (error) {
    console.error("Error calling Groq API:", error);
    return fullName; // Fallback to original name
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
        max_tokens: 300,
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

// This function generates recommendations for cheaper alternatives
async function generateRecommendations(product) {
  if (!API_KEY || API_KEY === "YOUR_GROQ_API_KEY_HERE") {
    return [
      {
        title: "Generic Alternative",
        description: "Consider looking for a generic or store-brand version of this item.",
        price: "Lower price",
        savings: "Varies"
      },
      {
        title: "Wait for Sale",
        description: "This item might go on sale soon. Consider waiting or setting up price alerts.",
        price: "Sale price",
        savings: "20-50%"
      },
      {
        title: "Check Other Stores",
        description: "Compare prices at other retailers like Walmart, Target, or local stores.",
        price: "Varies",
        savings: "10-30%"
      }
    ];
  }
  
  const prompt = `A user is considering buying "${product.name}" for ${product.price}. Generate 3-4 specific, actionable recommendations for cheaper alternatives or money-saving strategies. 

For each recommendation, provide:
1. A specific title (e.g., "Generic Brand Alternative", "Wait for Black Friday Sale")
2. A brief description explaining the recommendation
3. Estimated price or savings
4. Any specific actions they can take

Focus on practical, realistic alternatives that would actually save money. Be specific and actionable.

Format your response as a JSON array with objects containing: title, description, price, savings (optional), link (optional).`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("Groq API Error:", response.status, response.statusText);
      return getDefaultRecommendations();
    }

    const data = await response.json();
    const recommendationsText = data.choices[0].message.content.trim();
    
    try {
      // Try to parse JSON from the response
      const recommendations = JSON.parse(recommendationsText);
      console.log("Generated recommendations:", recommendations);
      return recommendations;
    } catch (parseError) {
      console.error("Error parsing recommendations JSON:", parseError);
      console.log("Raw response:", recommendationsText);
      return getDefaultRecommendations();
    }

  } catch (error) {
    console.error("Error calling Groq API for recommendations:", error);
    return getDefaultRecommendations();
  }
}

// Default recommendations when API fails
function getDefaultRecommendations() {
  return [
    {
      title: "Generic Brand Alternative",
      description: "Look for a store-brand or generic version of this item. They often have the same quality at a fraction of the price.",
      price: "30-50% less",
      savings: "Significant savings"
    },
    {
      title: "Wait for Sales",
      description: "This item will likely go on sale. Set up price alerts or wait for seasonal sales like Black Friday.",
      price: "Sale price",
      savings: "20-40%"
    },
    {
      title: "Check Other Retailers",
      description: "Compare prices at Walmart, Target, Costco, or local stores. You might find the same item cheaper elsewhere.",
      price: "Varies",
      savings: "10-25%"
    },
    {
      title: "Consider Used/Refurbished",
      description: "For electronics and some items, consider buying used or refurbished. Many come with warranties.",
      price: "40-60% less",
      savings: "Major savings"
    }
  ];
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab.id;

  if (request.type === "PRODUCT_ADDED") {
    (async () => {
      console.log("Background: Received product:", request.product.name);
      
      if (!(await isEssential(request.product.name))) {
        // Shorten the product name first
        console.log("Background: Shortening product name...");
        const shortenedName = await shortenProductName(request.product.name);
        console.log("Background: Shortened name result:", shortenedName);
        
        // Define the AI's persona and initial prompt using the shortened name
        const systemPrompt = `You are an AI assistant designed to curb impulse buying. Your goal is to be a friendly, slightly snarky "de-influencer". A user wants to buy "${shortenedName}" for "${request.product.price}". Engage in a conversation to make them reconsider. Be persuasive, a bit funny, and focus on saving money, questioning needs vs. wants, and delayed gratification. Keep your responses concise but complete - finish your thoughts. Do not ask questions in your first message.`;
        
        // Use the pre-calculated numeric price
        const requiredTurns = request.product.numericPrice > 100 ? 5 : 3;

        // Initialize conversation history
        conversationHistories[tabId] = {
          history: [{ role: "system", content: systemPrompt }],
          turnCount: 0,
          requiredTurns: requiredTurns,
          shortenedName: shortenedName // Store the shortened name for later use
        };
        const initialResponse = await getAIResponse(conversationHistories[tabId].history);
        conversationHistories[tabId].history.push({ role: "assistant", content: initialResponse });

        chrome.tabs.sendMessage(tabId, { 
          type: "SHOW_POPUP", 
          product: {
            ...request.product,
            name: shortenedName // Send the shortened name to the popup
          },
          argument: initialResponse 
        });
      }
    })();
    return true; // Indicate async response.
  }

  if (request.type === "USER_MESSAGE") {
    (async () => {
      const convo = conversationHistories[tabId];
      if (!convo) {
        console.error("No conversation history found for this tab.");
        return;
      }
      
      // Add user message to history and increment turn count
      convo.history.push({ role: "user", content: request.message });
      convo.turnCount++;
      
      // Get AI's response
      const aiResponse = await getAIResponse(convo.history);

      // Add AI response to history
      convo.history.push({ role: "assistant", content: aiResponse });

      // Send response back to content script
      chrome.tabs.sendMessage(tabId, { type: "AI_RESPONSE", message: aiResponse });

      // Check if the user has met the required number of turns
      if (convo.turnCount >= convo.requiredTurns) {
        console.log(`User has met the required ${convo.requiredTurns} turns. Unlocking button.`);
        chrome.tabs.sendMessage(tabId, { type: "UNLOCK_PROCEED" });
      }
    })();
    return true; // Indicate async response.
  }

  if (request.type === "GET_RECOMMENDATIONS") {
    (async () => {
      console.log("Background: Generating recommendations for:", request.product.name);
      const recommendations = await generateRecommendations(request.product);
      sendResponse({ recommendations: recommendations });
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