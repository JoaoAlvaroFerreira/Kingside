import { useState, useEffect, useRef } from 'react';
import { EngineEvaluation } from '@types';
import { useStockfishReady } from '@services/engine/StockfishContext';
import { stockfishBridge } from '@services/engine/StockfishBridge';
import { EngineAnalyzer } from '@services/engine/EngineAnalyzer';
import { useStore } from '@store';

const DEBOUNCE_MS = 150;

export function useEngine(fen: string, enabled: boolean) {
  const isReady = useStockfishReady();
  const { reviewSettings } = useStore();
  const { moveTime, depth, threads, multiPV } = reviewSettings.engine;

  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analyzerRef = useRef<EngineAnalyzer | null>(null);

  // Track current fen so resolved promises can verify they're still relevant.
  // Guards against race where a result resolves before React runs effect cleanup.
  const currentFenRef = useRef(fen);
  currentFenRef.current = fen;

  useEffect(() => {
    const analyzer = new EngineAnalyzer(cmd => stockfishBridge.sendCommand(cmd));
    analyzerRef.current = analyzer;
    stockfishBridge.setOutputHandler(line => analyzer.handleLine(line));

    return () => {
      stockfishBridge.setOutputHandler(null);
      analyzer.destroy();
      analyzerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isReady && analyzerRef.current) {
      analyzerRef.current.configure(threads);
    }
  }, [isReady, threads]);

  useEffect(() => {
    if (!enabled || !isReady || !analyzerRef.current) {
      setEvaluation(null);
      setIsAnalyzing(false);
      return;
    }

    const analyzer = analyzerRef.current;
    let cancelled = false;

    setEvaluation(null);
    setIsAnalyzing(true);

    const timer = setTimeout(() => {
      analyzer
        .analyze(fen, { depth, moveTime, multiPV }, (partial) => {
          if (!cancelled && partial.fen === currentFenRef.current) {
            setEvaluation(partial);
          }
        })
        .then(result => {
          if (!cancelled && result.fen === currentFenRef.current) {
            setEvaluation(result);
            setIsAnalyzing(false);
          }
        })
        .catch(err => {
          if (!cancelled) {
            if (err.message !== 'Cancelled') {
              console.warn('[SF] Analysis error:', err.message);
            }
            setIsAnalyzing(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      analyzer.cancel();
    };
  }, [fen, enabled, isReady, depth, moveTime, multiPV]);

  return { evaluation, isAnalyzing };
}
