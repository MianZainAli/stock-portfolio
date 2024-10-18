let holdings = [];
let holdingsHistory = {};
let performanceChart = null;

const newStockForm = document.getElementById('new-stock-form');
const newStockSymbol = document.getElementById('new-stock-symbol');
const newStockQuantity = document.getElementById('new-stock-quantity');
const newStockPurchasePrice = document.getElementById('new-stock-purchase-price')
const savedStockSection = document.querySelector('.stock-table');

document.addEventListener('DOMContentLoaded', () => {
    loadHoldings();

    newStockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const symbol = newStockSymbol.value.toUpperCase().trim();
        const quantity = parseInt(newStockQuantity.value);

        if (symbol && quantity > 0) {
            addStock(e);
        } else{
            alert(Error);
        }
    });
});

function removeStock(button) {
    const row = button.closest('.stock-row');
    const holdingId = row.getAttribute('data-holding-id');
    const stockSymbol = row.querySelector('.stock-name').innerText;
    fetch(`http://127.0.0.1:5000/api/delete-stock/${holdingId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            credentials: 'include',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            row.remove();
            console.log(' before holdings:', holdings);
            holdings = holdings.filter(stock => stock.id != holdingId);
            console.log('deleted history:', holdingsHistory[stockSymbol]);
            const remainingHoldings = holdings.filter(stock => stock.symbol === stockSymbol);

            // If no more holdings for this stock symbol, delete its history
            if (remainingHoldings.length === 0) {
                delete holdingsHistory[stockSymbol];
            }

            updatePortfolioSummary();
            toggleChartVisibility();
            updatePerformanceChart();

            console.log(`Holding ${stockSymbol} removed successfully.`);
        } else if (data.error) {
            alert(`Error: ${data.error}`);
        }
    })
    .catch(error => {
        console.error('Error deleting holding:', error);
        alert('Failed to delete holding from the database.');
    });
}

function addStock(event) {
    event.preventDefault();

    const stockSymbol = newStockSymbol.value.trim().toUpperCase();
    const stockQuantity = newStockQuantity.value;
    const StockPurchasePrice = newStockPurchasePrice.value;

    if (stockSymbol === '' || stockQuantity === '' || isNaN(stockQuantity) || stockQuantity <= 0) {
        alert('Please enter a valid stock symbol and quantity.');
        return;
    }

    fetch(`http://127.0.0.1:5000/api/stock/${stockSymbol}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(stockData => {
            const { currentPE, currentPrice, forwardPE } = stockData;
            const unrealizedGainLoss = ((currentPrice - StockPurchasePrice) * stockQuantity).toFixed(2);
            const priceTarget = calculatePriceTarget(stockData);

            const newRow = document.createElement('div');
            newRow.classList.add('stock-row');
        

            fetch('http://127.0.0.1:5000/api/save-stock', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    credentials: 'include',
                },
                body: JSON.stringify({
                    symbol: stockSymbol,
                    quantity: stockQuantity,
                    purchasePrice: StockPurchasePrice,
                })
            })
            .then(response => response.json())
            .then(data => {
                newRow.setAttribute('data-holding-id', data.stockid);
                const stock = {
                    id: data.stockid, 
                    symbol: stockSymbol,
                    quantity: stockQuantity,
                    currentPE: currentPE,
                    forwardPE: forwardPE,
                    purchasePrice: StockPurchasePrice,
                    currentPrice: currentPrice,
                    targetPrice: priceTarget
                };
    
                holdings.push(stock);
                if (!holdingsHistory[stockSymbol]) {
                    holdingsHistory[stockSymbol] = {
                        historicalData: []
                    };
                }

                updatePortfolioSummary();

                fetchHistoricalData(stockSymbol).then(() => {
                    toggleChartVisibility(); // Show the chart section before updating the chart
                    updatePerformanceChart();
                })
            })
            .catch(error => {
                console.error('Error saving stock to database:', error);
                alert('Failed to save stock to the database.');
            });

            newRow.innerHTML = `
                <div class="stock-name">${stockSymbol}</div>
                <div class="stock-quantity">${stockQuantity}</div>
                <div class="stock-purchase-price">$${StockPurchasePrice}</div>
                <div class="stock-current-price">$${currentPrice.toFixed(2)}</div>
                <div class="stock-target">$${priceTarget.toFixed(2)}</div>
                <div class="stock-unrealized">$${unrealizedGainLoss}</div>
                <div class="stock-actions">
                    <button class="remove-btn" onclick="removeStock(this)">Remove</button>
                </div>`
            ;
            // Append the new row to the holdings section
            savedStockSection.appendChild(newRow);

            newStockSymbol.value = '';
            newStockQuantity.value = '';
            newStockPurchasePrice.value = '';
        })
        .catch(error => {
            console.error('There was a problem with the fetch operation:', error);
            alert('Failed to fetch stock data. Please try again.');
        });
}


function loadHoldings() {
    fetch('http://127.0.0.1:5000/api/get-holdings')
        .then(response => response.json())
        .then(data => {
            holdings = []; 
            holdingsHistory = {}; 

            data.forEach(stock => {
                const newRow = document.createElement('div');
                newRow.classList.add('stock-row');
                newRow.setAttribute('data-holding-id', stock.id);
                newRow.innerHTML = `
                    <div class="stock-name">${stock.symbol}</div>
                    <div class="stock-quantity">${stock.quantity}</div>
                    <div class="stock-purchase-price">$${stock.purchase_price.toFixed(2)}</div>
                    <div class="stock-current-price">$${stock.current_price.toFixed(2)}</div>
                    <div class="stock-target-price">$${stock.target_price.toFixed(2)}</div>
                    <div class="stock-unrealized">$${stock.unrealized_gain_loss.toFixed(2)}</div>
                    <div class="stock-actions">
                        <button class="remove-btn" onclick="removeStock(this)">Remove</button>
                    </div>`;

                savedStockSection.appendChild(newRow);

                holdings.push({
                    id: stock.id,
                    symbol: stock.symbol,
                    quantity: stock.quantity,
                    currentPE: stock.currentPE,
                    forwardPE: stock.forwardPE,
                    purchasePrice: stock.purchase_price,
                    currentPrice: stock.current_price,
                    targetPrice: stock.target_price, 
                });

                if (!holdingsHistory[stock.symbol]) {
                    holdingsHistory[stock.symbol] = {
                        historicalData: stock.historicalData || []
                    };
                } 
                console.log('holdingshistory:', holdingsHistory);
            });

            console.log('holdings data:', holdingsHistory);

            updatePortfolioSummary();
            toggleChartVisibility(); 
            updatePerformanceChart();
        })
        .catch(error => {
            console.error('Error fetching holdings:', error);
            alert('Failed to load holdings.');
        });
}

function calculatePriceTarget(data) {
    const currentPrice = data.currentPrice || 0;
    const currentPE = data.currentPE || 0;
    const forwardPE = data.forwardPE || 0;

    // Avoid division by zero and undefined values
    const priceTarget =
        currentPE && forwardPE ? currentPrice * (currentPE / forwardPE) : currentPrice;

    return priceTarget;
}


function updatePortfolioSummary() {
    let totalInvestment = 0; 
    let totalCurrentValue = 0;
    let totalProjectedValue = 0; 
    let totalUnrealizedGainLoss = 0; 

    // Loop through the holdings and calculate total values
    holdings.forEach(stock => {
        const stockInvestment = stock.purchasePrice * stock.quantity;
        const stockCurrentValue = stock.currentPrice * stock.quantity;
        const stockProjectedValue = stock.targetPrice * stock.quantity;
        const stockUnrealizedGainLoss = stockCurrentValue - stockInvestment;

        totalInvestment += stockInvestment;
        totalCurrentValue += stockCurrentValue;
        totalProjectedValue += stockProjectedValue;
        totalUnrealizedGainLoss += stockUnrealizedGainLoss;
    });

    // Calculate the percentage change for current value and projected value
    const currentPercentageChange = ((totalCurrentValue - totalInvestment) / totalInvestment) * 100;
    const projectedChange = totalProjectedValue - totalCurrentValue;
    const projectedPercentageChange = ((totalProjectedValue - totalCurrentValue) / totalCurrentValue) * 100;

    const currentChangeColor = currentPercentageChange >= 0 ? 'green-text' : 'red-text';
    const projectedChangeColor = projectedPercentageChange >= 0 ? 'green-text' : 'red-text';

    // Update the HTML to display the enhanced portfolio summary
    document.getElementById('portfolio-summary').innerHTML = `
        <h3>Total Investment: $${totalInvestment.toFixed(2)}</h3>
        <h3>Total Current Value: $${totalCurrentValue.toFixed(2)}</h3>
        <h3>Total Unrealized Gain/Loss: $${totalUnrealizedGainLoss.toFixed(2)}
            <span class="${currentChangeColor}">(${currentPercentageChange.toFixed(2)}%)</span>
        </h3>
        <h3>Total Projected Value: $${totalProjectedValue.toFixed(2)}</h3>
        <h3>Projected Change: $${projectedChange.toFixed(2)}
            <span class="${projectedChangeColor}">(${projectedPercentageChange.toFixed(2)}%)</span>
        </h3>
    `;
}


function toggleChartVisibility() {
    const chartSection = document.getElementById('portfolio-chart');

    if (holdings.length === 0) {
        chartSection.style.display = 'none';

        if (performanceChart) {
            performanceChart.destroy();
            performanceChart = null;
        }
    } else {
        chartSection.style.display = 'block';

        if (!performanceChart) {
            initializeChart();
        }
    }
}


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
                            const yValue =
                                context.parsed.y !== null ? context.parsed.y.toFixed(2) : '';
                            return `${context.dataset.label}: $${yValue}`;
                        },
                    },
                },
            },
        },
    });
    console.log('Chart initialized');
}


function updatePerformanceChart() {
    try {
        const chartSection = document.getElementById('portfolio-chart');
        const headline = document.getElementById('chart-headline');

        if (holdings.length === 0) {
            // Hide the chart section
            chartSection.style.display = 'none';

            // Clear chart data
            if (performanceChart) {
                performanceChart.data.datasets = [];
                performanceChart.update();
            }
            return;
        } else {
            // Show the chart section
            chartSection.style.display = 'block';

            // Initialize the chart if it hasn't been initialized yet
            if (!performanceChart) {
                initializeChart();
            }
        }

        // Create a map to hold dates and corresponding total portfolio value
        const portfolioHistory = {};

        // Iterate over each stock to accumulate portfolio value
        holdings.forEach(stock => {
            console.log('stock:', stock);
            const data = holdingsHistory[stock.symbol];
            console.log('symbol data:',holdingsHistory);
            console.log('data:', data);
            if (data && data.historicalData) {
                const quantity = stock.quantity || 0;

                data.historicalData.forEach((point) => {
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

        // Convert the portfolioHistory map to an array and sort by date
        const sortedPortfolioData = Object.keys(portfolioHistory)
            .sort((a, b) => new Date(a) - new Date(b))
            .map((date) => ({
                x: date,
                y: portfolioHistory[date],
            }));

        // Debugging: Log the sortedPortfolioData
        console.log('sortedPortfolioData:', sortedPortfolioData);

        if (sortedPortfolioData.length === 0) {
            console.warn('No portfolio data to display.');
            performanceChart.data.datasets = [];
            performanceChart.update();
            return;
        }

        // Calculate total projected portfolio value
        let totalProjectedValue = 0;
        holdings.forEach(stock => {
            const data = holdingsHistory[stock.symbol];
            if (data) {
                const quantity = stock.quantity || 0;
                const priceTarget = calculatePriceTarget(stock);
                totalProjectedValue += priceTarget * quantity;
            }
        });

        // Get the projected date (12 months from now)
        const projectedDate = getProjectedDate();

        // Create dataset for projected portfolio value as a horizontal line
        const projectedPortfolioData = [];

        // Use the date range from the historical data and extend to the projected date
        const allDates = [
            ...sortedPortfolioData.map((d) => d.x),
            projectedDate,
        ].sort((a, b) => new Date(a) - new Date(b));

        allDates.forEach((date) => {
            projectedPortfolioData.push({
                x: date,
                y: totalProjectedValue,
            });
        });

        // Debugging: Log the projectedPortfolioData
        console.log('projectedPortfolioData:', projectedPortfolioData);

        // Prepare the datasets for the chart
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

        
        performanceChart.data.datasets = datasets;

        // Adjust x-axis to include projected date
        performanceChart.options.scales.x.min = allDates[0];
        performanceChart.options.scales.x.max = allDates[allDates.length - 1];

        // Update chart options to display legend
        performanceChart.options.plugins.legend.display = true;

        // Update the chart
        performanceChart.update();

        // Update the headline with the projected date
        const options = { year: 'numeric', month: 'long' };
        const projectedDateString = new Date(projectedDate).toLocaleDateString(undefined, options);
        headline.textContent = `Projected portfolio value of $${totalProjectedValue.toFixed(2)} is expected by ${projectedDateString}`;
    } catch (error) {
        console.error('Error in updatePerformanceChart:', error);
        alert(`Error updating performance chart: ${error}`);
    }
}


function fetchHistoricalData(symbol) {
    return new Promise((resolve, reject) => {
        const period = '1y';

        fetch(`http://127.0.0.1:5000/api/stock/${symbol}/history?period=${period}`)
            .then((response) => response.json())
            .then((data) => {
                // Debugging: Log the fetched historical data
                console.log(`Historical data for ${symbol}:`, data);

                if (data.error) {
                    alert(`Error fetching historical data for ${symbol}: ${data.error}`);
                    console.error(`Error fetching historical data for ${symbol}: ${data.error}`);
                    reject(data.error);
                    return;
                }

                if (holdingsHistory[symbol]) {
                    holdingsHistory[symbol]['historicalData'] = data;
                    resolve();
                } else {
                    console.error(`stockData[${symbol}] is undefined`);
                    reject(`stockData[${symbol}] is undefined`);
                }
            })
            .catch((error) => {
                alert(`Error fetching historical data for ${symbol}: ${error}`);
                console.error(`Error fetching historical data for ${symbol}:, error`);
                reject(error);
            });
    });
}


function getProjectedDate() {
    const currentDate = new Date();
    const projectedDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate());
    return projectedDate.toISOString().split('T')[0]; // Format as 'YYYY-MM-DD'
}
