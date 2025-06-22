const SERPER_API_KEY = "3354b828e805fa5fc2f38b2a6cea063610a370da"; // IMPORTANT: Replace with your actual Serper API key

export async function getCheaperAlternatives(productName) {
    if (!SERPER_API_KEY || SERPER_API_KEY === "YOUR_SERPER_API_KEY_HERE") {
        console.warn("Serper API key is not configured. Skipping alternative search.");
        return null;
    }

    const query = `cheaper alternative to ${productName}`;

    try {
        const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: query })
        });

        if (!response.ok) {
            console.error("Serper API Error:", response.status, await response.text());
            return null;
        }

        const data = await response.json();

        // We only care about the top 3 organic results
        if (data.organic && data.organic.length > 0) {
            return data.organic.slice(0, 3).map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet
            }));
        }

        return null;

    } catch (error) {
        console.error("Error calling Serper API:", error);
        return null;
    }
} 