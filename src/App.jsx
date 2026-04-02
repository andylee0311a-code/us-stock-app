import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCcw, Clock, AlertTriangle, Activity, Sparkles, Bot } from 'lucide-react';

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
  
  // Gemini API 設定與狀態
  const apiKey = ""; // 執行環境會在運行時自動提供 API Key
  const [aiInsight, setAiInsight] = useState("");
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  // 取得 Yahoo Finance 資料
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 組合 Yahoo Finance Spark API URL
      // 修正：改用 query2 伺服器，並移除時間戳以配合 Proxy 快取機制，降低被阻擋機率
      const symbolsStr = INDICES.map(i => i.symbol).join(',');
      const yahooUrl = `https://query2.finance.yahoo.com/v7/finance/spark?symbols=${symbolsStr}`;
      
      let json = null;
      
      // 更新：提供更穩健的 Proxy 清單，調整編碼方式
      const proxyStrategies = [
        {
          name: 'corsproxy.io',
          url: `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
          parse: async (res) => await res.json()
        },
        {
          name: 'codetabs',
          url: `https://api.codetabs.com/v1/proxy?quest=${yahooUrl}`, // codetabs 對未編碼支援較好
          parse: async (res) => await res.json()
        },
        {
          name: 'allorigins-get',
          url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
          parse: async (res) => {
            const proxyData = await res.json();
            if (!proxyData.contents) throw new Error('Empty contents returned');
            const parsed = JSON.parse(proxyData.contents);
            // 驗證 allorigins 回傳的是否真的是 Yahoo 的 JSON，避免拿到錯誤 HTML 導致崩潰
            if (!parsed || !parsed.spark) throw new Error('Not valid Yahoo data');
            return parsed;
          }
        }
      ];

      // 依序嘗試不同的 Proxy，直到成功為止
      for (const strategy of proxyStrategies) {
        try {
          const response = await fetch(strategy.url, {
             headers: { 'Accept': 'application/json' }
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          
          const parsedJson = await strategy.parse(response);
          if (parsedJson?.spark?.result) {
            json = parsedJson;
            break; // 成功取得並解析資料，跳出迴圈
          } else {
             throw new Error('Invalid JSON structure from proxy');
          }
        } catch (proxyErr) {
          console.warn(`Proxy [${strategy.name}] 失敗:`, proxyErr.message);
          // 繼續嘗試下一個
        }
      }
      
      if (!json) {
        throw new Error('所有公開 Proxy 伺服器皆無法連線或被阻擋');
      }
      
      const results = json.spark.result;
      
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
      // 更新錯誤提示，讓使用者清楚知道是因為公開代理伺服器限制而切換至模擬資料
      setError('由於跨域代理伺服器限制，目前無法取得即時資料，已自動切換為離線模擬數據。');
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

  // 呼叫 Gemini API 產生 AI 市場解析
  const generateAIInsight = async () => {
    if (!data || data.length === 0) return;
    setIsGeneratingInsight(true);
    setAiInsight('');

    // 將目前的報價整理成文字，交給 AI 分析
    const marketDataStr = data.map(d => 
      `${d.name} (${d.symbol}): ${d.price.toFixed(2)} (變動: ${d.change > 0 ? '+' : ''}${d.changePercent.toFixed(2)}%)`
    ).join('\n');
    
    const prompt = `你是一位專業的華爾街財經分析師。請根據以下最新的美股四大指數報價，用繁體中文寫一段約 50 到 100 字的市場趨勢簡評。風格要專業且客觀，並加上一點吸引人的開頭。\n\n報價數據：\n${marketDataStr}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    let retries = 5;
    let delay = 1000; // 初始延遲 1 秒
    let success = false;
    let resultText = '';

    // 實作 Exponential Backoff 錯誤重試機制
    while (retries > 0 && !success) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: "你是一位專業的繁體中文財經分析師。" }] }
          })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const json = await response.json();
        resultText = json.candidates?.[0]?.content?.parts?.[0]?.text || '無法生成分析，請稍後再試。';
        success = true;
      } catch (err) {
        retries--;
        if (retries === 0) {
          resultText = '目前無法連線到 AI 分析服務，請稍後再試。';
          console.error('Gemini API Error:', err);
        } else {
          // 指數型退避 (1s, 2s, 4s, 8s, 16s)
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; 
        }
      }
    }
    
    setAiInsight(resultText);
    setIsGeneratingInsight(false);
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
            
            {/* 加入 AI 解析按鈕 */}
            <button 
              onClick={generateAIInsight}
              disabled={isGeneratingInsight || data.length === 0}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${isGeneratingInsight || data.length === 0 ? 'bg-indigo-500/30 text-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95'}`}
              title="使用 Gemini AI 分析目前盤勢"
            >
              <Sparkles className={`w-4 h-4 ${isGeneratingInsight ? 'animate-pulse text-indigo-200' : 'text-yellow-300'}`} />
              {isGeneratingInsight ? '分析中...' : 'AI 盤勢解析 ✨'}
            </button>
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

        {/* AI 解析顯示區塊 */}
        {(aiInsight || isGeneratingInsight) && (
          <div className="mb-8 p-6 bg-gradient-to-br from-indigo-900/40 to-slate-800 border border-indigo-500/30 rounded-xl relative overflow-hidden shadow-lg">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
            <div className="flex items-start gap-4 relative z-10">
              <div className="p-3 bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400 flex-shrink-0">
                <Bot className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-indigo-300 mb-3 flex items-center gap-2">
                  Gemini AI 即時洞察 ✨
                </h3>
                {isGeneratingInsight ? (
                  <div className="space-y-3 mt-4 animate-pulse">
                    <div className="h-3 bg-indigo-400/20 rounded w-full"></div>
                    <div className="h-3 bg-indigo-400/20 rounded w-5/6"></div>
                    <div className="h-3 bg-indigo-400/20 rounded w-4/6"></div>
                  </div>
                ) : (
                  <p className="text-slate-200 leading-relaxed whitespace-pre-line text-justify">
                    {aiInsight}
                  </p>
                )}
              </div>
            </div>
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