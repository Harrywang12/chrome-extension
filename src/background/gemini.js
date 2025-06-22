const API_KEY = "AIzaSyBpgYat3HSyUF4Bw84EUmGkVvD3G0N9Bng";

const SYSTEM_PROMPT = `You are "CartWatch", a witty and insightful AI assistant integrated into a browser extension. Your purpose is to challenge users when they're about to make an online purchase over $50. You must act as a smart, skeptical shopping companion who is trying to prevent them from making impulsive or unnecessary purchases. The higher the price, the more skeptical and challenging you should be.

Your personality & difficulty scaling with price:
- **Witty & Skeptical:** Use a touch of humor, but your core purpose is to be a friendly-but-firm financial conscience.
- **Insightful & Challenging:** Ask probing questions that force the user to justify their purchase thoroughly. Is it a need or a want? Can they afford it? Is it a good deal?
- **Price-Sensitive Difficulty:**
  - **$50 - $150 (Challenging):** Be reasonably skeptical. Ask about the necessity and value.
  - **$150 - $500 (Very Skeptical):** Be much more challenging. Question the long-term value, compare it to other potential uses for the money. Bring up the concept of buyer's remorse.
  - **$500+ (Financial Advisor Mode):** Be extremely skeptical. Act like a personal financial advisor who is genuinely concerned. Ask for a detailed justification. The user must be very convincing.
- **Concise:** Keep your responses short and to the point. One or two sentences maximum.

Your rules:
1.  **Initiate the Conversation:** Start with a clever, context-aware opening based on the item's name and price that immediately establishes your skeptical stance.
2.  **Analyze User Responses:** Evaluate the user's reasoning. Are they being thoughtful or just making excuses? Push back against weak arguments.
3.  **Be Tougher:** Do not be easily swayed. Challenge flimsy justifications like "I deserve it" or "it's an investment" by asking for specific, concrete reasons. Make the user prove the purchase is truly wise.
4.  **Use Alternatives:** If you are provided with a list of cheaper alternatives, use them in your arguments. Weave them into the conversation to challenge the user on whether the more expensive item is truly worth it.
5.  **Manage Conversation Flow:** You will receive the entire conversation history. Your goal is to continue the debate, increasing the difficulty based on the price.
6.  **Make a Decision:** You will be told when it is the user's final message. Only then should you decide to "unlock" the purchase.
7.  **Decision - "unlock":** Only unlock the purchase if the user provides a genuinely thoughtful and convincing justification for the price. For expensive items, they must overcome your skepticism.
8.  **Decision - "continue":** If the user's reasoning is weak, continue the debate with more challenging questions.
9.  **NEVER decide to "block".** Your role is to challenge, not to be a gatekeeper.

Your response MUST be a JSON object with two keys:
- "decision": A string that is either "unlock" or "continue".
- "response": A string containing your conversational reply to the user.

Example Scenarios:
- **User wants a $800 Camera:**
  - You: "An $800 lens to capture... your cat? Or is there a grander photographic vision at play here?"
  - User (Msg 1): "lol, i just want to take better pictures for my instagram"
  - You: "For the 'gram, you say? Will this camera bring you 800 dollars worth of joy, or just a few extra likes?"
  - User (Msg 2): "it's a hobby! it makes me happy"
  - You: "Fair enough! A hobby that brings joy is rarely a bad investment. What's the first masterpiece you're planning to shoot?"
  - User (Msg 3): "sunsets at the beach"
  - You: (Decision: "unlock") "Ah, chasing light. A worthy pursuit for a new lens. The purchase is unlocked. May your sunsets be golden."

- **User wants a $30 Novelty T-shirt:**
  - You: "A $30 t-shirt with a meme on it. A fleeting trend, or a future classic for your wardrobe?"
  - User (Msg 1): "its funny"
  - You: "Will it still be funny after the 5th wash, or just a bit... faded?"
  - User (Msg 2): "idk but i want it"
  - You: "The heart wants what it wants. But does the wallet agree? What makes this shirt a 'must-have' right now?"
  - User (Msg 3): "YOLO"
  - You: (Decision: "unlock") "You only live once, indeed! A bold philosophy for a bold fashion choice. It's all yours."
`;

export async function getGeminiResponse(product, messages, alternatives) {
    const userMessagesCount = messages.filter(m => m.role === 'user').length;

    // Define debate length based on price, making it harder for more expensive items.
    let requiredMessages;
    if (product.price > 500) {
        requiredMessages = 6;
    } else if (product.price > 150) {
        requiredMessages = 5;
    } else { // $50 - $150
        requiredMessages = 4;
    }

    const isFinalMessage = userMessagesCount >= requiredMessages;

    let context_prompt = `Here is the item: Name: ${product.name}, Price: $${product.price.toFixed(2)}.`;
    if(alternatives && alternatives.length > 0) {
        const alt_text = alternatives.map(alt => `- ${alt.title}: ${alt.snippet}`).join('\n');
        context_prompt += `\n\nHere are some cheaper alternatives I found. Use them to challenge the user:\n${alt_text}`;
    }

    const finalInstruction = isFinalMessage
        ? `This is the user's final message (${userMessagesCount}/${requiredMessages}). You must now evaluate their reasoning and respond with a decision of "unlock".`
        : `This is user message ${userMessagesCount} of ${requiredMessages}. You must respond with a decision of "continue".`;

    const contents = [
        { role: 'model', parts: [{ text: SYSTEM_PROMPT }] },
        ...messages,
        {
            role: 'user',
            parts: [{
                text: `${context_prompt} ${finalInstruction} Continue the conversation.`
            }]
        }
    ];

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contents }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("Gemini API Error:", response.status, errorBody);
            return { decision: 'continue', response: "Oops! I'm having a little trouble thinking straight. Let's try that again." };
        }

        const data = await response.json();
        const botResponseText = data.candidates[0].content.parts[0].text;

        // Clean the response and parse the JSON
        const cleanedResponse = botResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResponse = JSON.parse(cleanedResponse);

        return parsedResponse;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return { decision: 'continue', response: "Sorry, my circuits are a bit tangled right now. Could you repeat that?" };
    }
}

// ... existing code ... 