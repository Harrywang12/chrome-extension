// This module encapsulates all interactions with chrome.storage.local.

/**
 * Retrieves the current stats and history from storage.
 * @returns {Promise<{stats: object, history: object[]}>}
 */
async function getStorage() {
    return await chrome.storage.local.get(['stats', 'history', 'blockedSites', 'approvedPurchases']);
}

/**
 * Checks if a site is currently blocked for the user.
 * @param {string} hostname - The hostname of the site to check.
 * @returns {Promise<boolean>} - True if the site is blocked, false otherwise.
 */
export async function isSiteBlocked(hostname) {
    const { blockedSites = {} } = await getStorage();
    const blockUntil = blockedSites[hostname];
    if (!blockUntil) return false;
    return new Date().getTime() < blockUntil;
}

/**
 * Checks if a specific purchase was recently approved.
 * @param {string} purchaseKey - A unique key for the purchase (e.g., hostname + price).
 * @returns {Promise<boolean>} - True if the purchase was recently approved.
 */
export async function isPurchaseApproved(purchaseKey) {
    const { approvedPurchases = {} } = await getStorage();
    const approvalTimestamp = approvedPurchases[purchaseKey];
    if (!approvalTimestamp) return false;
    // Approval lasts for 5 minutes to allow checkout to complete
    return (new Date().getTime() - approvalTimestamp) < 5 * 60 * 1000;
}

/**
 * Records the outcome of a debate, updating stats, history, and setting blocks/approvals.
 * @param {object} product - The product/purchase that was debated.
 * @param {string} hostname - The hostname of the site.
 * @param {'won' | 'lost'} outcome - The result of the debate.
 * @param {string} identifier - The unique identifier for the product page (e.g., ASIN).
 */
export async function recordDebateResult(product, hostname, outcome, identifier) {
    const { stats, history, blockedSites, approvedPurchases } = await getStorage();

    // --- Update Stats ---
    const newStats = stats || { totalDebates: 0, debatesWon: 0, moneySaved: 0 };
    newStats.totalDebates += 1;

    if (outcome === 'won') {
        newStats.debatesWon += 1;
        // Approve this purchase for the next 5 minutes using its unique identifier
        const purchaseKey = `${hostname}::${identifier}`;
        approvedPurchases[purchaseKey] = new Date().getTime();
    } else { // 'lost'
        newStats.moneySaved += product.price;
        // We are removing the site-blocking functionality as per the user's request.
        // The user should be able to refresh and try again immediately.
        //
        // Original blocking logic for reference:
        // const blockUntil = new Date().getTime() + 60 * 60 * 1000;
        // blockedSites[hostname] = blockUntil;
    }

    // --- Update History ---
    const newHistoryItem = {
        productName: product.name,
        price: product.price,
        date: new Date().toISOString(),
        outcome: outcome,
    };
    const newHistory = [newHistoryItem, ...(history || [])];

    // --- Save to Storage ---
    await chrome.storage.local.set({ 
        stats: newStats, 
        history: newHistory,
        blockedSites,
        approvedPurchases
    });
    console.log("Debate result recorded:", { newStats, newHistoryItem });
}
