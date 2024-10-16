
let holdings = [];
let holdingsHistory = {};
let performanceChart = null;

const newStockForm = document.getElementById('new-stock-form');
const newStockSymbol = document.getElementById('new-stock-symbol');
const newStockQuantity = document.getElementById('new-stock-quantity');
const newStockPurchasePrice = document.getElementById('new-stock-purchase-price');
const savedStockSection = document.querySelector('.stock-table');

// Attach event listener to the form submission
newStockForm.addEventListener('submit', (e) => addStock(e));


// Debounce for saving holdings to backend
let saveHoldingsTimeout = null;
function debounceSaveHoldings() {
    if (saveHoldingsTimeout) {
        clearTimeout(saveHoldingsTimeout);
    }
    saveHoldingsTimeout = setTimeout(() => {
        saveHoldings();
    }, 1000); // Debounce interval (1 second)
}


window.onload = function() {
    // Check if user is logged in by calling the backend
    fetch('http://127.0.0.1:5000/api/get-user', {
        method: 'GET',
        credentials: 'include',  // This sends cookies with the request
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('Not logged in');
        }
    })
    .then(userData => {
        console.log('User Data:', userData);
        // Handle the user data here (e.g., display it in the DOM)
    })
    .catch(error => {
        console.error('Error fetching user data:', error);
    });
    
};


// Centralized API request function
async function apiRequest(url, method = 'GET', body = null) {
    const options = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`http://127.0.0.1:5000${url}`, options);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return await response.json();
    } catch (error) {
        console.error('API Request Failed:', error);
        throw error;
    }
}

// Load holdings from backend and local storage on page load
document.addEventListener('DOMContentLoaded', () => {
    loadHoldingsFromLocalStorage(); // Load from cache first
    apiRequest('/api/get-holdings')
        .then(data => {
            holdings = data;
            console.log('Holdings loaded from server:', holdings);
            renderHoldings();
            saveHoldingsToLocalStorage(); // Cache the latest holdings
        })
        .catch(() => {
            alert('Error fetching holdings from server.');
        });
});

// Save holdings to local storage
function saveHoldingsToLocalStorage() {
    localStorage.setItem('holdings', JSON.stringify(holdings));
}

// Load holdings from local storage
function loadHoldingsFromLocalStorage() {
    const cachedHoldings = localStorage.getItem('holdings');
    if (cachedHoldings) {
        holdings = JSON.parse(cachedHoldings);
        renderHoldings();
    }
}

// Render holdings table
function renderHoldings() {
    const fragment = document.createDocumentFragment(); // Optimize DOM manipulation

    // Clear existing rows
    savedStockSection.innerHTML = `
        <div class="stock-row header">
            <div class="stock-name">Ticker</div>
            <div class="stock-quantity">Quantity</div>
            <div class="stock-purchase-price">Purchase Price</div>
            <div class="stock-current-price">Current Price</div>
            <div class="stock-target">Target Price</div>
            <div class="stock-unrealized">Unrealized Gain/Loss</div>
            <div class="stock-actions">Actions</div>
        </div>
    `;

    // Render each stock row
    holdings.forEach(stock => {
        apiRequest(`/api/stock/${stock.symbol}`)
            .then(stockData => {
                
                const currentPrice = stockData.currentPrice;
                const unrealizedGainLoss = ((currentPrice - stock.purchasePrice) * stock.quantity).toFixed(2);
                const priceTarget = calculatePriceTarget(stockData);

                const newRow = document.createElement('div');
                newRow.classList.add('stock-row');
                newRow.innerHTML = `
                    <div class="stock-name">${stock.symbol}</div>
                    <div class="stock-quantity">${stock.quantity}</div>
                    <div class="stock-purchase-price">$${stock.purchasePrice}</div>
                    <div class="stock-current-price">$${currentPrice.toFixed(2)}</div>
                    <div class="stock-target">$${priceTarget.toFixed(2)}</div>
                    <div class="stock-unrealized">$${unrealizedGainLoss}</div>
                    <div class="stock-actions">
                        <button class="remove-btn" onclick="removeStock(this)">Remove</button>
                    </div>
                `;
                fragment.appendChild(newRow);
                updatePortfolioSummary(); // Update portfolio after adding each stock
            })
            .catch(error => console.error(`Error fetching stock data for ${stock.symbol}:`, error));
    });

    savedStockSection.appendChild(fragment); // Append all rows in one go
}

// Add stock functionality
function addStock(event) {
    event.preventDefault();

    const stockSymbol = newStockSymbol.value.trim().toUpperCase();
    const stockQuantity = parseInt(newStockQuantity.value);
    const stockPurchasePrice = parseFloat(newStockPurchasePrice.value);

    if (!stockSymbol || isNaN(stockQuantity) || stockQuantity <= 0) {
        alert('Please enter valid stock details.');
        return;
    }

    // Fetch stock info and add to holdings
    apiRequest(`/api/stock/${stockSymbol}`)
        .then(stockData => {
            const { currentPrice, currentPE, forwardPE } = stockData;
            const priceTarget = calculatePriceTarget(stockData);
            const unrealizedGainLoss = ((currentPrice - stockPurchasePrice) * stockQuantity).toFixed(2);

            const newRow = document.createElement('div');
            newRow.classList.add('stock-row');
            newRow.innerHTML = `
                <div class="stock-name">${stockSymbol}</div>
                <div class="stock-quantity">${stockQuantity}</div>
                <div class="stock-purchase-price">$${stockPurchasePrice.toFixed(2)}</div>
                <div class="stock-current-price">$${currentPrice.toFixed(2)}</div>
                <div class="stock-target">$${priceTarget.toFixed(2)}</div>
                <div class="stock-unrealized">$${unrealizedGainLoss}</div>
                <div class="stock-actions">
                    <button class="remove-btn" onclick="removeStock(this)">Remove</button>
                </div>
            `;

            savedStockSection.appendChild(newRow); // Append new row
            holdings.push({
                symbol: stockSymbol,
                quantity: stockQuantity,
                purchasePrice: stockPurchasePrice,
                currentPrice,
                currentPE,
                forwardPE,
                targetPrice: priceTarget,
            });

           // Fetch historical data for the stock
            updatePortfolioSummary();
            debounceSaveHoldings(); // Debounce saving to backend
            saveHoldingsToLocalStorage(); // Save updated holdings to local storage

            // Clear input fields
            newStockSymbol.value = '';
            newStockQuantity.value = '';
            newStockPurchasePrice.value = '';
        })
        .catch(() => {
            alert('Failed to fetch stock data.');
        });
}

// Remove stock
function removeStock(button) {
    const row = button.closest('.stock-row');
    const stockSymbol = row.querySelector('.stock-name').textContent;

    holdings = holdings.filter(stock => stock.symbol !== stockSymbol); // Remove from holdings array
    row.remove(); // Remove row from table

    updatePortfolioSummary();
    debounceSaveHoldings(); // Debounce save
    saveHoldingsToLocalStorage(); // Update local cache
}

// Save holdings to the backend
function saveHoldings() {
    apiRequest('/api/save-holdings', 'POST', { holdings })
        .then(() => console.log('Holdings saved to backend'))
        .catch(() => alert('Failed to save holdings to server.'));
}

// Portfolio summary calculation
function updatePortfolioSummary() {
    let totalInvestment = 0, totalCurrentValue = 0, totalProjectedValue = 0, totalUnrealizedGainLoss = 0;

    holdings.forEach(stock => {
        console.log(stock);
        const stockInvestment = stock.purchasePrice * stock.quantity;
        const stockCurrentValue = stock.currentPrice * stock.quantity;
        const stockProjectedValue = stock.targetPrice * stock.quantity;
        const stockUnrealizedGainLoss = stockCurrentValue - stockInvestment;

        totalInvestment += stockInvestment;
        totalCurrentValue += stockCurrentValue;
        totalProjectedValue += stockProjectedValue;
        totalUnrealizedGainLoss += stockUnrealizedGainLoss;
    });

    const currentPercentageChange = ((totalCurrentValue - totalInvestment) / totalInvestment) * 100;
    const projectedChange = totalProjectedValue - totalCurrentValue;
    const projectedPercentageChange = ((totalProjectedValue - totalCurrentValue) / totalCurrentValue) * 100;

    document.getElementById('portfolio-summary').innerHTML = `
        <h3>Total Investment: $${totalInvestment}</h3>
        <h3>Total Current Value: $${totalCurrentValue}</h3>
        <h3>Total Unrealized Gain/Loss: $${totalUnrealizedGainLoss} (${currentPercentageChange.toFixed(2)}%)</h3>
        <h3>Total Projected Value: $${totalProjectedValue.toFixed(2)}</h3>
        <h3>Projected Change: $${projectedChange.toFixed(2)} (${projectedPercentageChange.toFixed(2)}%)</h3>
    `;
}

function calculatePriceTarget(data) {
    const currentPrice = data.currentPrice || 0;
    const currentPE = data.currentPE || 0;
    const forwardPE = data.forwardPE || 0;

    // Avoid division by zero and undefined values
    return currentPE && forwardPE ? currentPrice * (currentPE / forwardPE) : currentPrice;
}

// Toggle chart visibility and update chart when holdings are added or removed
function toggleChartVisibility() {
    const chartSection = document.getElementById('portfolio-chart');

    if (holdings.length === 0) {
        chartSection.style.display = 'none';

        // Destroy the chart instance if it exists
        if (performanceChart) {
            performanceChart.destroy();
            performanceChart = null;
        }
    } else {
        chartSection.style.display = 'block';

        // Initialize the chart if it hasn't been initialized yet
        if (!performanceChart) {
            initializeChart();
        }
    }
}

// Initialize chart for portfolio performance
function initializeChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            scales: {
                x: {
                    type: 'time',
                    time: {
                        parser: 'yyyy-MM-dd',
                        unit: 'month',
                        tooltipFormat: 'MMM dd, yyyy',
                        displayFormats: {
                            month: 'MMM yyyy',
                        },
                    },
                    title: {
                        display: true,
                        text: 'Date',
                        color: '#4A4A4A',
                        font: {
                            family: 'Montserrat',
                            size: 14,
                        },
                    },
                    ticks: {
                        color: '#4A4A4A',
                        maxTicksLimit: 12,
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: 'Total Portfolio Value ($)',
                        color: '#4A4A4A',
                        font: {
                            family: 'Montserrat',
                            size: 14,
                        },
                    },
                    ticks: {
                        color: '#4A4A4A',
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                    },
                },
            },
            plugins: {
                legend: {
                    display: false, // Will be enabled when datasets are added
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#4A4A4A',
                    bodyColor: '#4A4A4A',
                    borderColor: '#ccc',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            const yValue = context.parsed.y !== null ? context.parsed.y.toFixed(2) : '';
                            return `${context.dataset.label}: $${yValue}`;
                        },
                    },
                },
            },
        },
    });
    console.log('Chart initialized');
}

// Update the chart with performance data
function updatePerformanceChart() {
    try {
        const chartSection = document.getElementById('portfolio-chart');
        const headline = document.getElementById('chart-headline');

        if (holdings.length === 0) {
            chartSection.style.display = 'none';

            if (performanceChart) {
                performanceChart.data.datasets = [];
                performanceChart.update();
            }
            return;
        } else {
            chartSection.style.display = 'block';

            if (!performanceChart) {
                initializeChart();
            }
        }

        const portfolioHistory = {};

        // Aggregate historical portfolio data
        holdings.forEach(stock => {
            const data = holdingsHistory[stock.symbol];
            if (data && data.historicalData) {
                const quantity = stock.quantity || 0;

                data.historicalData.forEach(point => {
                    const date = point.Date;
                    const closePrice = point.Close * quantity;

                    if (date && closePrice !== undefined) {
                        if (portfolioHistory[date]) {
                            portfolioHistory[date] += closePrice;
                        } else {
                            portfolioHistory[date] = closePrice;
                        }
                    }
                });
            }
        });

        const sortedPortfolioData = Object.keys(portfolioHistory)
            .sort((a, b) => new Date(a) - new Date(b))
            .map(date => ({
                x: date,
                y: portfolioHistory[date],
            }));

        if (sortedPortfolioData.length === 0) {
            console.warn('No portfolio data to display.');
            performanceChart.data.datasets = [];
            performanceChart.update();
            return;
        }

        // Calculate total projected portfolio value
        let totalProjectedValue = 0;
        holdings.forEach(stock => {
            const priceTarget = stock.targetPrice;
            const quantity = stock.quantity || 0;
            totalProjectedValue += priceTarget * quantity;
        });

        // Create dataset for projected portfolio value as a horizontal line
        const projectedDate = getProjectedDate();
        const projectedPortfolioData = sortedPortfolioData.map(d => ({
            x: d.x,
            y: totalProjectedValue,
        }));

        // Prepare datasets for chart
        const datasets = [
            {
                label: 'Historical Portfolio Value',
                data: sortedPortfolioData,
                fill: false,
                borderColor: '#00D1B2',
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 2,
            },
            {
                label: 'Projected Portfolio Value',
                data: projectedPortfolioData,
                fill: false,
                borderColor: '#FF6B6B',
                borderDash: [5, 5],
                tension: 0,
                pointRadius: 0,
                borderWidth: 2,
            },
        ];

        // Update the chart with the new datasets
        performanceChart.data.datasets = datasets;

        performanceChart.update();

        // Update the chart headline with the projected date
        const options = { year: 'numeric', month: 'long' };
        const projectedDateString = new Date(projectedDate).toLocaleDateString(undefined, options);
        headline.textContent = `Projected portfolio value of $${totalProjectedValue.toFixed(2)} is expected by ${projectedDateString}`;

    } catch (error) {
        console.error('Error in updatePerformanceChart:', error);
        alert('Error updating performance chart');
    }
}

// Fetch historical data for a stock
function fetchHistoricalData(symbol) {
    return new Promise((resolve, reject) => {
        const period = '1y'; // Default to 1 year

        apiRequest(`/api/stock/${symbol}/history?period=${period}`)
            .then(data => {
                if (data.error) {
                    console.error(`Error fetching historical data for ${symbol}:`, data.error);
                    reject(data.error);
                    return;
                }

                if (!holdingsHistory[symbol]) {
                    holdingsHistory[symbol] = { historicalData: [] };
                }

                holdingsHistory[symbol].historicalData = data;
                resolve();
            })
            .catch(error => {
                console.error(`Error fetching historical data for ${symbol}:`, error);
                reject(error);
            });
    });
}

// Get projected date (12 months from current date)
function getProjectedDate() {
    const currentDate = new Date();
    const projectedDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate());
    return projectedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}
