import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCcw, Clock, AlertTriangle, Activity } from 'lucide-react';

// 定義四大指數的代號與名稱
const INDICES = [
  { symbol: '^DJI', name: '道瓊工業指數', shortName: 'Dow Jones' },
  { symbol: '^GSPC', name: '標普 500 指數', shortName: 'S&P 500' },
  { symbol: '^IXIC', name: '那斯達克指數', shortName: 'NASDAQ' },
  { symbol: '^SOX', name: '費城半導體指數', shortName: 'SOX' }
];

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [usingMockData, setUsingMockData] = useState(false);

  // 取得 Yahoo Finance 資料
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 組合 Yahoo Finance Spark API URL (加入時間戳防止快取)
      const symbolsStr = INDICES.map(i => i.symbol).join(',');
      const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbolsStr}&_=${Date.now()}`;
      
      let json = null;
      
      try {
        // 修正：使用 allorigins 的 get 模式 (取代 raw)，將回應包裝在 JSON 中，以繞過瀏覽器嚴格的 CORS 阻擋
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Primary proxy failed');
        
        const proxyData = await response.json();
        if (!proxyData.contents) throw new Error('Empty contents returned');
        json = JSON.parse(proxyData.contents);
      } catch (proxyErr) {
        console.warn('主要 Proxy 請求失敗，嘗試備用路線...', proxyErr);
        // 備案：使用另一個穩定的 CORS proxy 服務
        const fallbackProxyUrl = `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`;
        const response2 = await fetch(fallbackProxyUrl);
        if (!response2.ok) throw new Error('Fallback proxy failed');
        json = await response2.json();
      }
      
      const results = json?.spark?.result;
      if (!results) throw new Error('Invalid data format from Yahoo API');
      
      const parsedData = INDICES.map(indexInfo => {
        const indexData = results.find(r => r.symbol === indexInfo.symbol);
        if (indexData && indexData.response && indexData.response[0].meta) {
          const meta = indexData.response[0].meta;
          const currentPrice = meta.regularMarketPrice;
          const previousClose = meta.chartPreviousClose;
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;
          
          return {
            ...indexInfo,
            price: currentPrice,
            change: change,
            changePercent: changePercent,
            previousClose: previousClose
          };
        }
        return null;
      }).filter(Boolean);

      if (parsedData.length === 0) throw new Error('No data parsed');

      setData(parsedData);
      setLastUpdated(new Date());
      setUsingMockData(false);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('無法取得即時資料，目前顯示模擬數據。');
      generateMockData(); // 發生錯誤時使用模擬數據以確保畫面有內容
    } finally {
      setLoading(false);
    }
  }, []);

  // 產生模擬數據 (Fallback)
  const generateMockData = () => {
    const basePrices = {
      '^DJI': 39500.50,
      '^GSPC': 5200.25,
      '^IXIC': 16300.80,
      '^SOX': 4800.60
    };
    
    const mockData = INDICES.map(indexInfo => {
      const base = basePrices[indexInfo.symbol];
      const changePercent = (Math.random() * 3 - 1.5); // -1.5% to +1.5%
      const change = base * (changePercent / 100);
      return {
        ...indexInfo,
        price: base + change,
        change: change,
        changePercent: changePercent,
        previousClose: base
      };
    });
    
    setData(mockData);
    setLastUpdated(new Date());
    setUsingMockData(true);
  };

  // 初次載入與自動更新設定
  useEffect(() => {
    fetchData();
    let intervalId;
    if (isAutoRefresh) {
      intervalId = setInterval(() => {
        fetchData();
      }, 30000); // 每 30 秒更新一次
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchData, isAutoRefresh]);

  // 格式化數字
  const formatNumber = (num, decimals = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
              <Activity className="text-blue-500 w-8 h-8" />
              美股四大指數即時報價
            </h1>
            <p className="text-slate-400 mt-2 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" />
              最後更新: {lastUpdated ? lastUpdated.toLocaleTimeString('zh-TW', { hour12: false }) : '載入中...'}
              {usingMockData && (
                <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full border border-yellow-500/50 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  離線模擬模式
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-800 p-2 rounded-lg border border-slate-700 shadow-sm">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={isAutoRefresh}
                onChange={(e) => setIsAutoRefresh(e.target.checked)}
                className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-slate-800"
              />
              自動更新 (30秒)
            </label>
            <div className="w-px h-6 bg-slate-700"></div>
            <button 
              onClick={fetchData}
              disabled={loading}
              className={`p-2 rounded hover:bg-slate-700 transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="立即更新"
            >
              <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-400' : 'text-slate-300'}`} />
            </button>
          </div>
        </header>

        {/* 錯誤提示 */}
        {error && !usingMockData && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* 指數卡片網格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {data.map((indexData) => {
            const isUp = indexData.change >= 0;
            // 台灣股市習慣：紅漲綠跌
            const colorClass = isUp ? 'text-red-500' : 'text-green-500';
            const bgClass = isUp ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20';
            const Icon = isUp ? TrendingUp : TrendingDown;
            const sign = isUp ? '+' : '';

            return (
              <div 
                key={indexData.symbol} 
                className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-lg relative overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-1 duration-200"
              >
                {/* 裝飾背景 */}
                <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20 ${isUp ? 'bg-red-500' : 'bg-green-500'}`}></div>

                <div>
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <div>
                      <h2 className="text-xl font-bold text-slate-100">{indexData.name}</h2>
                      <p className="text-sm text-slate-400">{indexData.shortName} ({indexData.symbol})</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 relative z-10">
                    <span className="text-4xl font-black tracking-tight text-white">
                      {formatNumber(indexData.price)}
                    </span>
                  </div>
                </div>

                <div className={`mt-6 pt-4 border-t border-slate-700/50 flex items-center justify-between ${colorClass}`}>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${bgClass}`}>
                    <Icon className="w-5 h-5" />
                    <span className="font-bold text-lg">
                      {sign}{formatNumber(indexData.change)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-xl">
                      {sign}{formatNumber(indexData.changePercent)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Loading Skeleton */}
        {loading && data.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-slate-800 rounded-xl p-6 border border-slate-700 h-[200px] animate-pulse">
                <div className="h-6 bg-slate-700 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-slate-700 rounded w-1/3 mb-6"></div>
                <div className="h-10 bg-slate-700 rounded w-2/3 mb-8"></div>
                <div className="h-10 bg-slate-700/50 rounded w-full"></div>
              </div>
            ))}
          </div>
        )}

        {/* 備註 */}
        <footer className="mt-12 text-center text-slate-500 text-sm">
          <p>數據來源：Yahoo Finance</p>
        </footer>
      </div>
    </div>
  );
}