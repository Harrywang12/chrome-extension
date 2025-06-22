document.addEventListener('DOMContentLoaded', () => {
    // Fetch real data from chrome.storage.local
    chrome.storage.local.get(['stats', 'history'], (data) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            // You could display an error message in the UI here
            return;
        }
        console.log("Loaded data from storage:", data);
        loadDashboardData(data);
    });
});

function loadDashboardData(data) {
    updateStatistics(data.stats || {});
    renderHistory(data.history || []);
}

function updateStatistics(stats) {
    const { moneySaved = 0, debatesWon = 0, totalDebates = 0 } = stats;

    document.getElementById('money-saved').textContent = moneySaved.toFixed(2);
    document.getElementById('debates-won').textContent = debatesWon;
    document.getElementById('total-debates').textContent = totalDebates;

    const winRate = totalDebates > 0 ? ((debatesWon / totalDebates) * 100).toFixed(0) + '%' : 'N/A';
    document.getElementById('win-rate').textContent = winRate;
}

function calculateImpulseScore(wins, total) {
    // This function is no longer needed and will be replaced by the win rate logic.
    // I will remove it in the final cleanup.
    if (total === 0) return 'N/A';
    const winRatio = wins / total;
    if (winRatio >= 0.8) return 'Disciplined';
    if (winRatio >= 0.6) return 'Considered';
    if (winRatio >= 0.4) return 'Impulsive';
    return 'Reckless';
}

function renderHistory(history) {
    const historyList = document.getElementById('history-list');
    const placeholder = historyList.querySelector('.history-item-placeholder');

    if (!history || history.length === 0) {
        if (placeholder) placeholder.style.display = 'block';
        return;
    }

    if (placeholder) placeholder.style.display = 'none';

    // Clear any existing items
    historyList.innerHTML = '';

    history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = `history-item ${item.outcome}`; // 'won' or 'lost'

        const formattedDate = new Date(item.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        historyItem.innerHTML = `
            <div class="history-item-info">
                <p>${item.productName}</p>
                <span>${formattedDate}</span>
            </div>
            <div class="history-item-price">$${item.price.toFixed(2)}</div>
        `;
        historyList.appendChild(historyItem);
    });
}
