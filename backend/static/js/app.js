// app.js

// Select the form and inputs
const stockForm = document.getElementById('stock-form');
const stockSymbolInput = document.getElementById('stock-symbol');
const stockQuantityInput = document.getElementById('stock-quantity');
const stockList = document.getElementById('stock-list');

// Array to store stock symbols
let stocks = [];

// Object to store stock data
let stockData = {};

// Chart instance
let performanceChart = null;

// Initialize the application on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    // No need to initialize the chart here

    // Add event listener to the form
    stockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const symbol = stockSymbolInput.value.toUpperCase().trim();
        const quantity = parseInt(stockQuantityInput.value);

        if (symbol && quantity > 0 && !stocks.includes(symbol)) {
            addStock(symbol, quantity);
            stockSymbolInput.value = '';
            stockQuantityInput.value = '';
        } else if (stocks.includes(symbol)) {
            alert(`Stock ${symbol} is already in your portfolio.`);
        }
    });
});

// Function to add a stock
function addStock(symbol, quantity) {
    console.log(`Adding stock: ${symbol}, Quantity: ${quantity}`);
    // Fetch stock data from backend
    fetch(`http://127.0.0.1:5000/api/stock/${symbol}`)
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                alert(`Error fetching data for ${symbol}: ${data.error}`);
                console.error(`Error fetching data for ${symbol}: ${data.error}`);
                return;
            }

            // Store data for future calculations, including quantity
            stockData[symbol] = { ...data, quantity };

            const priceTarget = calculatePriceTarget(data);
            const priceDifference = priceTarget - data.currentPrice;
            const pricePercentageChange = data.currentPrice > 0
                ? (priceDifference / data.currentPrice) * 100
                : 0;
            const priceChangeClass = pricePercentageChange >= 0 ? 'positive-change' : 'negative-change';

            // Create stock item element
            const li = document.createElement('li');
            li.classList.add('stock-item');
            li.innerHTML = `
                <span><strong>${data.symbol}</strong></span>
                <span>Current Price: $${data.currentPrice.toFixed(2)}</span>
                <span>Price Target: $${priceTarget.toFixed(2)} <span class="${priceChangeClass}">(${pricePercentageChange.toFixed(2)}%)</span></span>
                <span>Quantity: ${quantity}</span>
                <button class="remove-stock"><i class="fas fa-trash-alt"></i> Remove</button>
            `;

            stockList.appendChild(li);

            // Add event listener to remove button
            li.querySelector('.remove-stock').addEventListener('click', () => {
                removeStock(symbol, li);
            });

            // Add symbol to stocks array
            stocks.push(symbol);

            // Update portfolio summary
            updatePortfolioSummary();

            // Fetch and display historical data
            fetchHistoricalData(symbol).then(() => {
                toggleChartVisibility(); // Show the chart section before updating the chart
                updatePerformanceChart();
            });
        })
        .catch((error) => {
            alert(`Error fetching data for ${symbol}: ${error}`);
            console.error(`Error fetching data for ${symbol}:`, error);
        });
}

// Function to remove a stock
function removeStock(symbol, listItem) {
    console.log(`Removing stock: ${symbol}`);
    stocks = stocks.filter((stock) => stock !== symbol);
    stockList.removeChild(listItem);
    delete stockData[symbol];
    updatePortfolioSummary();
    updatePerformanceChart();
    toggleChartVisibility();
}

function toggleChartVisibility() {
    const chartSection = document.getElementById('portfolio-chart');

    if (stocks.length === 0) {
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

// Function to calculate price target
function calculatePriceTarget(data) {
    const currentPrice = data.currentPrice || 0;
    const currentPE = data.currentPE || 0;
    const forwardPE = data.forwardPE || 0;

    // Avoid division by zero and undefined values
    const priceTarget =
        currentPE && forwardPE ? currentPrice * (currentPE / forwardPE) : currentPrice;

    return priceTarget;
}

// Function to fetch historical data
function fetchHistoricalData(symbol) {
    return new Promise((resolve, reject) => {
        // Set a default period (e.g., '1y' for 1 year)
        const period = '1y';

        fetch(`http://127.0.0.1:5000/api/stock/${symbol}/history?period=${period}`)
            .then((response) => response.json())
            .then((data) => {
                // Debugging: Log the fetched historical data
                console.log(`Historical data for ${symbol}:`, data);

                // Check if historical data contains errors
                if (data.error) {
                    alert(`Error fetching historical data for ${symbol}: ${data.error}`);
                    console.error(`Error fetching historical data for ${symbol}: ${data.error}`);
                    reject(data.error);
                    return;
                }

                // Store historical data
                if (stockData[symbol]) {
                    stockData[symbol]['historicalData'] = data;
                    resolve();
                } else {
                    console.error(`stockData[${symbol}] is undefined`);
                    reject(`stockData[${symbol}] is undefined`);
                }
            })
            .catch((error) => {
                // alert(`Error fetching historical data for ${symbol}: ${error}`);
                console.error(`Error fetching historical data for ${symbol}:`, error);
                reject(error);
            });
    });
}

// Function to get the projected date (12 months from now)
function getProjectedDate() {
    const currentDate = new Date();
    const projectedDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), currentDate.getDate());
    return projectedDate.toISOString().split('T')[0]; // Format as 'YYYY-MM-DD'
}

// Function to initialize the chart
function initializeChart() {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Set to false to allow chart to fill the container
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

// Function to update performance chart
function updatePerformanceChart() {
    try {
        const chartSection = document.getElementById('portfolio-chart');
        const headline = document.getElementById('chart-headline');

        if (stocks.length === 0) {
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
        stocks.forEach((symbol) => {
            const data = stockData[symbol];
            if (data && data.historicalData) {
                const quantity = data.quantity || 0;

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
        stocks.forEach((symbol) => {
            const data = stockData[symbol];
            if (data) {
                const quantity = data.quantity || 0;
                const priceTarget = calculatePriceTarget(data);
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

        // Update datasets
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

// Function to update portfolio summary
function updatePortfolioSummary() {
    let totalCurrentValue = 0;
    let totalPriceTargetValue = 0;

    stocks.forEach((symbol) => {
        const data = stockData[symbol];
        if (data) {
            const currentPrice = data.currentPrice || 0;
            const quantity = data.quantity || 0;

            const priceTarget = calculatePriceTarget(data);

            totalCurrentValue += currentPrice * quantity;
            totalPriceTargetValue += priceTarget * quantity;
        }
    });

    const valueDifference = totalPriceTargetValue - totalCurrentValue;
    const percentageChange = totalCurrentValue > 0
        ? (valueDifference / totalCurrentValue) * 100
        : 0;
    const portfolioChangeClass = percentageChange >= 0 ? 'positive-change' : 'negative-change';

    const portfolioSummary = document.getElementById('portfolio-summary');
    portfolioSummary.innerHTML = `
        <h3>Portfolio Summary</h3>
        <p>Total Current Value: $${totalCurrentValue.toFixed(2)}</p>
        <p>Total Projected Value: $${totalPriceTargetValue.toFixed(2)}</p>
        <p>Projected Change: $${valueDifference.toFixed(2)} <span class="${portfolioChangeClass}">(${percentageChange.toFixed(2)}%)</span></p>
    `;
}
