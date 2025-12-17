import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import './App.css';

const PERIODS = [
  { label: '1주일 전', days: 7, useYearAvg: false },
  { label: '1개월 전', days: 30, useYearAvg: false },
  { label: '3개월 전', days: 90, useYearAvg: false },
  { label: '6개월 전', days: 180, useYearAvg: false },
  { label: '1년 전', days: 365, useYearAvg: false },
  { label: '2년 전', years: 2, useYearAvg: true },
  { label: '3년 전', years: 3, useYearAvg: true },
  { label: '5년 전', years: 5, useYearAvg: true },
  { label: '10년 전', years: 10, useYearAvg: true },
];

function App() {
  const [symbol, setSymbol] = useState('');
  const [investment, setInvestment] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartData, setChartData] = useState([]);

  const fetchStockData = async () => {
    if (!symbol || !investment) {
      setError('종목 코드와 투자 금액을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (3650 * 24 * 60 * 60); // 10년 전

      // CORS 프록시 사용
      const response = await fetch(
        `https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?period1=${startDate}&period2=${endDate}&interval=1d`)}`
      );

      if (!response.ok) throw new Error('주식 데이터를 가져올 수 없습니다.');

      const data = await response.json();
      const result = data.chart.result[0];

      if (!result) throw new Error('유효하지 않은 종목 코드입니다.');

      const timestamps = result.timestamp;
      // adjclose (조정 종가) 사용 - 주식 분할, 배당 등이 반영된 가격
      const adjClose = result.indicators.adjclose?.[0]?.adjclose;
      const rawPrices = result.indicators.quote[0].close;
      // adjclose가 있으면 사용, 없으면 일반 close 사용
      const prices = adjClose || rawPrices;
      const currentPrice = rawPrices[rawPrices.length - 1]; // 현재가는 실제 가격 사용
      const investmentAmount = parseFloat(investment);

      // 차트 데이터 생성
      const chartPoints = [];
      for (let i = 0; i < timestamps.length; i += Math.max(1, Math.floor(timestamps.length / 100))) {
        if (prices[i]) {
          chartPoints.push({
            date: new Date(timestamps[i] * 1000).toLocaleDateString('ko-KR'),
            price: prices[i].toFixed(2)
          });
        }
      }
      setChartData(chartPoints);

      // 연도별 평균 가격 계산 함수
      const getYearAveragePrice = (yearsAgo) => {
        const targetYear = new Date().getFullYear() - yearsAgo;
        const yearStart = new Date(targetYear, 0, 1).getTime() / 1000;
        const yearEnd = new Date(targetYear, 11, 31).getTime() / 1000;
        
        let adjSum = 0, rawSum = 0, count = 0;
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] >= yearStart && timestamps[i] <= yearEnd && prices[i] && rawPrices[i]) {
            adjSum += prices[i];
            rawSum += rawPrices[i];
            count++;
          }
        }
        if (count === 0) return null;
        return { adjAvg: adjSum / count, rawAvg: rawSum / count };
      };

      // 각 기간별 수익률 계산
      const periodResults = PERIODS.map(period => {
        let pastAdjPrice, pastRawPrice;

        if (period.useYearAvg) {
          // 년 단위: 해당 연도 1월~12월 평균 가격 사용
          const avgPrices = getYearAveragePrice(period.years);
          if (!avgPrices) return null;
          pastAdjPrice = avgPrices.adjAvg;
          pastRawPrice = avgPrices.rawAvg;
        } else {
          // 1년 이하: 특정 날짜 가격 사용
          const targetTimestamp = endDate - (period.days * 24 * 60 * 60);
          let closestIndex = 0;
          let minDiff = Infinity;

          for (let i = 0; i < timestamps.length; i++) {
            const diff = Math.abs(timestamps[i] - targetTimestamp);
            if (diff < minDiff && prices[i]) {
              minDiff = diff;
              closestIndex = i;
            }
          }
          pastAdjPrice = prices[closestIndex];
          pastRawPrice = rawPrices[closestIndex];
        }

        if (!pastAdjPrice) return null;

        // 조정 가격으로 주식 수 계산 (분할이 반영되어 정확한 수익률 계산)
        const shares = investmentAmount / pastAdjPrice;
        const currentValue = shares * currentPrice;
        const profit = currentValue - investmentAmount;
        const profitRate = ((currentValue - investmentAmount) / investmentAmount) * 100;

        return {
          period: period.label,
          pastPrice: pastRawPrice.toFixed(2), // 당시 실제 가격 표시
          shares: shares.toFixed(4),
          currentValue: currentValue.toFixed(2),
          profit: profit.toFixed(2),
          profitRate: profitRate.toFixed(2),
          isProfit: profit >= 0,
          isYearAvg: period.useYearAvg
        };
      }).filter(r => r !== null);

      setResults({
        symbol: symbol.toUpperCase(),
        currentPrice: currentPrice.toFixed(2),
        investment: investmentAmount,
        periods: periodResults
      });

    } catch (err) {
      setError(err.message || '데이터를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>📈 주식 백테스팅</h1>
          <p>과거에 투자했다면 지금 얼마가 됐을까?</p>
        </header>

        <div className="input-section">
          <div className="input-group">
            <label>종목 코드</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="예: AAPL, TSLA, 005930.KS"
            />
            <div className="popular-stocks">
              <span className="popular-label">인기 종목:</span>
              <button type="button" onClick={() => setSymbol('TSLA')}>TSLA (테슬라)</button>
              <button type="button" onClick={() => setSymbol('NVDA')}>NVDA (엔비디아)</button>
              <button type="button" onClick={() => setSymbol('AAPL')}>AAPL (애플)</button>
              <button type="button" onClick={() => setSymbol('GOOGL')}>GOOGL (구글)</button>
              <button type="button" onClick={() => setSymbol('META')}>META (메타)</button>
              <button type="button" onClick={() => setSymbol('MSFT')}>MSFT (마이크로소프트)</button>
              <button type="button" onClick={() => setSymbol('AMZN')}>AMZN (아마존)</button>
              <button type="button" onClick={() => setSymbol('QQQ')}>QQQ (나스닥100 ETF)</button>
              <button type="button" onClick={() => setSymbol('VOO')}>VOO (S&P500 ETF)</button>
              <button type="button" onClick={() => setSymbol('SPY')}>SPY (S&P500 ETF)</button>
              <button type="button" onClick={() => setSymbol('005930.KS')}>005930.KS (삼성전자)</button>
              <button type="button" onClick={() => setSymbol('000660.KS')}>000660.KS (sk 하이닉스)</button>
            </div>
          </div>
          <div className="input-group">
            <label>투자 금액 ($)</label>
            <input
              type="number"
              value={investment}
              onChange={(e) => setInvestment(e.target.value)}
              placeholder="예: 1000"
            />
          </div>
          <button onClick={fetchStockData} disabled={loading}>
            {loading ? '분석 중...' : '분석하기'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {results && (
          <>
            <div className="current-info">
              <h2>{results.symbol}</h2>
              <p>현재 주가: <span className="price">${results.currentPrice}</span></p>
            </div>

            {chartData.length > 0 && (
              <div className="chart-section">
                <h3>주가 추이</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#888" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #4a4a6a' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Line type="monotone" dataKey="price" stroke="#00d4ff" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="results-grid">
              {results.periods.map((result, index) => (
                <div key={index} className={`result-card ${result.isProfit ? 'profit' : 'loss'}`}>
                  <h3>{result.period}</h3>
                  <div className="result-details">
                    <p>{result.isYearAvg ? '연평균 주가' : '당시 주가'}: <span>${result.pastPrice}</span></p>
                    <p>구매 주식: <span>{result.shares}주</span></p>
                    <p>현재 가치: <span>${result.currentValue}</span></p>
                    <p className="profit-line">
                      수익: <span className={result.isProfit ? 'green' : 'red'}>
                        {result.isProfit ? '+' : ''}{result.profit}$ ({result.isProfit ? '+' : ''}{result.profitRate}%)
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <footer className="footer">
        </footer>
      </div>
    </div>
  );
}

export default App;
