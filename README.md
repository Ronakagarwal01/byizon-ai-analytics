# DSI — Premium Business Intelligence Dashboard (Client-Side)

DSI is a premium, client-side Business Intelligence (BI) dashboard and report generator designed to replicate the analytical power and user experience of software like Tableau and Power BI. It operates completely offline in the browser, parsing CSV files instantly, computing comprehensive business metrics, and populating customizable dashboards, charts, and PDF-ready executive reports without any server dependencies or AI API keys.

---

## 📖 Table of Contents
- [DSI — Premium Business Intelligence Dashboard (Client-Side)](#dsi--premium-business-intelligence-dashboard-client-side)
  - [📖 Table of Contents](#-table-of-contents)
  - [🚀 Project Objectives \& Paradigm Shift](#-project-objectives--paradigm-shift)
  - [💎 Key Features](#-key-features)
  - [🛠️ Detailed Tech Stack](#️-detailed-tech-stack)
  - [📂 Project Directory Layout \& File Structure](#-project-directory-layout--file-structure)
  - [🔍 Core Modules \& Logical Architecture](#-core-modules--logical-architecture)
    - [1. Local BI Analytics Engine (`src/api/huggingface.js`)](#1-local-bi-analytics-engine-srcapihuggingfacejs)
    - [2. Robust Client-Side CSV Parser (`src/components/ExcelUploader.jsx`)](#2-robust-client-side-csv-parser-srccomponentsexceluploaderjsx)
    - [3. Smart Local Chat Assistant (`src/Pages/chat.jsx`)](#3-smart-local-chat-assistant-srcpageschatjsx)
  - [📊 Expected CSV Data Schema](#-expected-csv-data-schema)
  - [💬 Local Chat Commands Cheat Sheet](#-local-chat-commands-cheat-sheet)
  - [⚙️ Installation \& Running Locally](#️-installation--running-locally)

---

## 🚀 Project Objectives & Paradigm Shift

The original prototype relied on third-party cloud AI APIs (Hugging Face / DeepSeek-R1) which suffered from rate limits, token constraints, and internet latency. 

This version introduces a **100% offline client-side BI engine** that:
1.  Eliminates network requests, ensuring **instant load times** (under 15ms) even for large datasets.
2.  Ensures **absolute data privacy** — no metrics or file contents ever leave the user's browser.
3.  Implements **mathematically rigorous, deterministic calculations** for business metrics and trends.
4.  Retains the high-end premium visual aesthetic (vibrant dark mode, glassmorphism, smooth micro-animations).

---

## 💎 Key Features

*   ⚡ **Single-Click Auto-Analysis**: Simply upload or drag-and-drop a CSV file. The engine parses the structure, validates columns, calculates metrics, and updates the entire dashboard instantly.
*   📊 **6 Premium Metric Cards (Responsive Auto-Fit Grid)**:
    1.  **Total Sales**: Aggregated gross sales revenue.
    2.  **Total Orders**: Total quantity volume ordered (mapped directly to `SUM(Units Sold)` as per requirements).
    3.  **Average Order Value (AOV)**: Average transaction size calculated as `Total Sales / Transaction Count` (based on row count).
    4.  **Total Products Sold**: The sum of all product quantities sold.
    5.  **Highest Sale**: The highest single transaction amount.
    6.  **Lowest Sale**: The lowest single transaction amount.
*   📈 **Month-over-Month (MoM) Growth System**: Groups sales records by calendar month. Computes growth rates for all 6 metrics. If previous month data does not exist (e.g., single-month worksheets), it falls back to `N/A` with helpful tooltips.
*   💬 **Smart Local Data Chat**: Interactive keyword-based responder that allows the user to query metrics using conversational language (e.g., "AOV", "top categories", "revenue", "highest transaction").
*   📋 **Offline Report Generator**: Automatically produces executive summaries, 5 key business insights, and 3 actionable recommendations based on the calculated data.
*   🎨 **Premium Glassmorphism Design**: Outfit and Space Grotesk typography, HSL color tokens, neon glows, responsive layouts, and print-optimized PDF styling.
*   ⬇️ **Multi-Format Export**: Export parsed data back to CSV, download report text as `.txt`, or print/export high-fidelity reports directly to PDF.

---

## 🛠️ Detailed Tech Stack

The application is built using a clean, modern frontend stack without any backend server or database:

*   **React 19 (Core Library)**: Powers the component lifecycle, global state providers, and reactive UI hook flows.
*   **Vite 8 (Build Tool)**: Fast development server bundling, asset optimization, and lightning-fast HMR.
*   **React Router 7 (Navigation)**: Client-side routing between Dashboard, Reports, Chat, and Share links.
*   **Recharts 3 (Data Visualization)**: Responsive AreaCharts (revenue trend), BarCharts (category breakdown), and PieCharts.
*   **PapaParse 5 (CSV Engine)**: Lightning-fast, robust CSV parser handling headers, empty lines, quoting rules, and large datasets.
*   **SheetJS / xlsx 0.18 (Spreadsheet reader)**: Provides workbook loading hooks.
*   **Lucide React (Icons)**: Clean vector icons matching the dark tech aesthetic.
*   **Vanilla CSS3 (Design System)**: Responsive flexboxes, CSS variables/tokens, custom scrollbars, and keyframe animations (`fadeInUp`, `shimmer`, `float`).

---

## 📂 Project Directory Layout & File Structure

```bash
dsi-prototype/
├── public/                 # Static assets and browser favicons
├── src/
│   ├── api/
│   │   └── huggingface.js  # The core client-side BI analytics engine
│   ├── components/
│   │   ├── ExcelUploader.jsx# Drag-and-drop CSV parser & validation UI
│   │   ├── KPICard.jsx      # Visual card for displaying metrics & MoM trends
│   │   ├── RevenueChart.jsx # Recharts-powered visualization blocks
│   │   └── Sidebar.jsx      # Fixed layout navigation panel
│   ├── context/
│   │   └── DataContext.jsx  # Global React Context holding uploadedData state
│   ├── Pages/
│   │   ├── Dashboard.jsx    # The main grid workspace displaying KPIs & charts
│   │   ├── Landing.jsx      # Marketing hero page introducing DSI features
│   │   ├── Reports.jsx      # Detailed Executive report with insights & recommendations
│   │   ├── SharedReport.jsx # Client-facing share page layout
│   │   └── chat.jsx         # Interactive chat interface & local responder
│   ├── App.css              # Page layout rules
│   ├── index.css            # CSS custom variables, animations, and design tokens
│   └── main.jsx             # React client entry point
├── package.json            # Node configuration, scripts, and package version list
├── vite.config.js          # Vite build, server ports, and proxy setup
└── README.md               # Extensive project documentation (This file)
```

---

## 🔍 Core Modules & Logical Architecture

### 1. Local BI Analytics Engine (`src/api/huggingface.js`)
This is the heart of the offline BI system. It contains two main functions:
*   `computeDataMetrics(columns, rows)`: Performs data cleansing, handles empty values, matches currency types (`₹`, `$`, `€`, `£`), parses dates, groups revenue by category/product, aggregates monthly sales, and formats output strings.
*   `analyzeDataWithAI(columns, rows, token, onProgress)`: Overwrites the Hugging Face AI pipeline. Calls the metrics calculator and formats the text summary, insights, and recommendations dynamically.

### 2. Robust Client-Side CSV Parser (`src/components/ExcelUploader.jsx`)
Handles input files securely:
*   Restricts inputs to `.csv` format.
*   Parses CSV headers and values asynchronously using `Papa.parse`.
*   Performs semantic structure checks to verify the presence of mandatory dimensions (`Date`, `Product`, `Quantity`, `Price`).
*   Displays explicit error notifications for invalid, missing, or empty parameters.
*   Automatically kicks off the BI analyzer upon loading.

### 3. Smart Local Chat Assistant (`src/Pages/chat.jsx`)
Replaces remote AI endpoints with a quick local responder. The function `buildResponse(question, data)` matches keywords like:
*   *Sales/Revenue/Performance*: Returns gross sales.
*   *Orders/Quantity/Count*: Explains difference between raw row counts and cumulative product quantities.
*   *AOV/Average*: Explains transaction sizes.
*   *Highest/Lowest/Peak/Min*: Shows maximum/minimum invoice values.
*   *Category/Segment*: Outputs a list of category rankings.
*   *Insights/Recommendations*: Prints the executive reports findings list.

---

## 📊 Expected CSV Data Schema

To ensure accurate aggregation, the parser uses a flexible semantic fuzzy-matcher. The columns in the CSV are matched as follows:

| Target Parameter | Expected Names (Fuzzy Matching) | Fallback Value |
| :--- | :--- | :--- |
| **OrderID** | `order_id`, `orderid`, `id`, `transactionid`, `transaction_id` | Auto-incrementing row index |
| **Date** | `date`, `time`, `timestamp`, `created` | *Required* (validation fails if missing) |
| **Product** | `product`, `item`, `product name`, `name` | `"Unknown"` |
| **Category** | `category`, `type`, `group`, `class` | `"Unknown"` |
| **Quantity** | `quantity`, `qty`, `units sold`, `count` | `1` (if price exists) or `0` |
| **Price** | `price`, `rate`, `cost`, `price (inr)`, `price (usd)` | `0` |

*Note: If the CSV contains a pre-calculated "Total Sales", "Revenue", or "Amount" column, the engine uses those values directly. Otherwise, it calculates `Revenue = Quantity * Price` for each record.*

---

## 💬 Local Chat Commands Cheat Sheet

When interacting with the **Data Chat** with an active dataset loaded, try these prompts:
*   `"kpis"` or `"revenue"` or `"sales"`: Displays key computed cards.
*   `"orders"` or `"qty"` or `"units"`: Evaluates cumulative order volumes.
*   `"aov"` or `"average"`: Calculates Average Order Value.
*   `"highest"` or `"max"`: Points out the peak transaction value.
*   `"lowest"` or `"min"`: Points out the smallest transaction value.
*   `"category"` or `"breakdown"`: Pulls up category ranks and percentages.
*   `"product"` or `"top seller"`: Details top-performing inventory items.
*   `"insights"` or `"patterns"`: Displays the computed executive insights.
*   `"recommendations"` or `"what should we do"`: Details recommended actions.

---

## ⚙️ Installation & Running Locally

1.  **Clone the workspace** and navigate to the project directory:
    ```bash
    cd dsi-prototype
    ```
2.  **Install the required dependencies** (adds `papaparse` and build tools):
    ```bash
    npm install
    ```
3.  **Start the local development server**:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your web browser.
4.  **Validate build compilation** before production:
    ```bash
    npm run build
    ```
    This verifies React TS/JS layouts and Recharts outputs inside a compact `/dist` production folder.
