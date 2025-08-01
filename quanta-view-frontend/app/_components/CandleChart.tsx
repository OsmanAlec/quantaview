"use client";

import {
  createChart,
  IChartApi,
  CandlestickSeries,
  ISeriesApi,
  Time,
  CandlestickData as LWCCandlestickData,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

interface CandlestickData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Helper function to format data for lightweight-charts
function formatCandle(candle: CandlestickData): LWCCandlestickData {
  return {
    time: (candle.timestamp / 1000) as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

interface CandleChartProps {
  candleHistory: CandlestickData[];
  formingCandle?: CandlestickData;
}

function CandleChart({ candleHistory, formingCandle }: CandleChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const historyLengthRef = useRef(0);

  // This useEffect hook is for chart creation and cleanup.
  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#1a1a1a" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#333" },
        horzLines: { color: "#333" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries);

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    return () => {
      chartRef.current?.remove();
    };
  }, []);

  // This useEffect hook is for data updates
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    //Data Initialization
    if (candleHistory.length > 0 && historyLengthRef.current === 0) {
      seriesRef.current.setData(candleHistory.map(formatCandle));
      historyLengthRef.current = candleHistory.length;
    }

    //New Completed Candle
    if (candleHistory.length > historyLengthRef.current) {
      const newCandle = candleHistory[candleHistory.length - 1];
      seriesRef.current.update(formatCandle(newCandle));
      historyLengthRef.current = candleHistory.length;
    }

    // Forming Candle Update
    if (formingCandle) {
      seriesRef.current.update(formatCandle(formingCandle));
    }
  }, [candleHistory, formingCandle]);

  return (
    <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />
  );
}

export default CandleChart;
