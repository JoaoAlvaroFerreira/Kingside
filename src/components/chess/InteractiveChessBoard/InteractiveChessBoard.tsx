/**
 * Interactive Chess Board Component - Tap or drag pieces to move
 *
 * Performance optimizations:
 * - MemoizedPiece prevents SvgUri re-fetch on unrelated re-renders
 * - MemoizedSquare skips re-render when piece/highlight state unchanged
 * - Drag state stored in refs so PanResponder isn't recreated mid-drag
 * - Move animation smooths piece transitions between squares
 * - Drag overlay persists until new FEN arrives to eliminate blink gap
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  PanResponder,
  Animated,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { SvgUri, Svg, Path } from 'react-native-svg';
import { Chess } from 'chess.js';

interface InteractiveChessBoardProps {
  fen: string;
  onMove?: (from: string, to: string) => void;
  orientation?: 'white' | 'black';
  showCoordinates?: boolean;
  disabled?: boolean;
  boardSizePixels?: number;
  bestMove?: string;
  arrowColor?: string;
}

const squareToCenterPixel = (square: string, squareSize: number, orientation: 'white' | 'black') => {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  const displayFile = orientation === 'white' ? file : 7 - file;
  const displayRank = orientation === 'white' ? 7 - rank : rank;
  return {
    x: (displayFile + 0.5) * squareSize,
    y: (displayRank + 0.5) * squareSize,
  };
};

const getArrowPath = (x1: number, y1: number, x2: number, y2: number, squareSize: number): string => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const shaftW = squareSize * 0.18;
  const headLen = squareSize * 0.38;
  const headW = squareSize * 0.38;

  const sx = x2 - ux * headLen;
  const sy = y2 - uy * headLen;

  const pts = [
    [x1  + px * shaftW / 2, y1  + py * shaftW / 2],
    [sx  + px * shaftW / 2, sy  + py * shaftW / 2],
    [sx  + px * headW  / 2, sy  + py * headW  / 2],
    [x2, y2],
    [sx  - px * headW  / 2, sy  - py * headW  / 2],
    [sx  - px * shaftW / 2, sy  - py * shaftW / 2],
    [x1  - px * shaftW / 2, y1  - py * shaftW / 2],
  ];

  return `M ${pts[0][0]} ${pts[0][1]} ` +
    pts.slice(1).map(p => `L ${p[0]} ${p[1]}`).join(' ') + ' Z';
};

const PIECE_IMAGES: Record<string, string> = {
  wK: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/wK.svg',
  wQ: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/wQ.svg',
  wR: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/wR.svg',
  wB: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/wB.svg',
  wN: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/wN.svg',
  wP: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/wP.svg',
  bK: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/bK.svg',
  bQ: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/bQ.svg',
  bR: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/bR.svg',
  bB: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/bB.svg',
  bN: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/bN.svg',
  bP: 'https://lichess1.org/assets/_DYoVny/piece/cburnett/bP.svg',
};

const getPieceKey = (color: string, type: string): string => {
  return `${color}${type.toUpperCase()}`;
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// --- Memoized sub-components ---

const MemoizedPiece = React.memo(({ pieceKey, size }: { pieceKey: string; size: number }) => (
  <SvgUri uri={PIECE_IMAGES[pieceKey]} width={size} height={size} />
), (prev, next) => prev.pieceKey === next.pieceKey && prev.size === next.size);
MemoizedPiece.displayName = 'MemoizedPiece';

interface SquareProps {
  squareName: string;
  pieceKey: string | null;
  isLight: boolean;
  isSelected: boolean;
  isValidMove: boolean;
  isDragSource: boolean;
  hasPiece: boolean;
  squareSize: number;
  isAnimatingFrom: boolean;
}

const MemoizedSquare = React.memo(({
  pieceKey,
  isLight,
  isSelected,
  isValidMove,
  isDragSource,
  hasPiece,
  squareSize,
  isAnimatingFrom,
}: SquareProps) => {
  const showPiece = pieceKey && !isDragSource && !isAnimatingFrom;
  return (
    <View
      style={[
        styles.square,
        { width: squareSize, height: squareSize },
        isLight ? styles.lightSquare : styles.darkSquare,
        isSelected && styles.selectedSquare,
        isValidMove && styles.validMoveSquare,
      ]}
    >
      {showPiece && <MemoizedPiece pieceKey={pieceKey} size={squareSize * 0.85} />}
      {isValidMove && !hasPiece && <View style={styles.validMoveDot} />}
      {isValidMove && hasPiece && !isDragSource && (
        <View style={[styles.captureRing, { width: squareSize - 6, height: squareSize - 6 }]} />
      )}
    </View>
  );
}, (prev, next) =>
  prev.pieceKey === next.pieceKey &&
  prev.isLight === next.isLight &&
  prev.isSelected === next.isSelected &&
  prev.isValidMove === next.isValidMove &&
  prev.isDragSource === next.isDragSource &&
  prev.hasPiece === next.hasPiece &&
  prev.squareSize === next.squareSize &&
  prev.isAnimatingFrom === next.isAnimatingFrom
);
MemoizedSquare.displayName = 'MemoizedSquare';

// --- Animation types ---

interface MoveAnimation {
  pieceKey: string;
  fromSquare: string;
  toSquare: string;
  progress: Animated.Value;
}

export const InteractiveChessBoard: React.FC<InteractiveChessBoardProps> = ({
  fen,
  onMove,
  orientation = 'white',
  showCoordinates: _showCoordinates = true,
  disabled = false,
  boardSizePixels,
  bestMove,
  arrowColor = 'rgba(39, 174, 96, 0.7)',
}) => {
  const { width, height } = useWindowDimensions();

  const boardSize = boardSizePixels || Math.min(Math.min(width, height) - 40, 480);
  const squareSize = boardSize / 8;

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  // Render-visible drag overlay state
  const [dragOverlay, setDragOverlay] = useState<{ piece: string; position: Animated.ValueXY } | null>(null);
  // Move animation state
  const [moveAnim, setMoveAnim] = useState<MoveAnimation | null>(null);

  // Refs for drag state (read by PanResponder without recreating it)
  const draggingFromRef = useRef<string | null>(null);
  const draggingPieceRef = useRef<string | null>(null);
  const dragPositionRef = useRef(new Animated.ValueXY());

  // "Ghost" overlay: keeps showing the dropped piece at destination until FEN updates
  const [dropGhost, setDropGhost] = useState<{ piece: string; square: string } | null>(null);
  const prevFenRef = useRef(fen);

  const boardRef = useRef<View>(null);
  const boardOrigin = useRef({ x: 0, y: 0 });

  const game = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const board = useMemo(() => game.board(), [game]);
  const currentTurn = game.turn();

  const filesArray = useMemo(
    () => orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0],
    [orientation]
  );
  const ranksArray = useMemo(
    () => orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0],
    [orientation]
  );

  // Stable refs for values PanResponder needs
  const boardDataRef = useRef({ board, currentTurn, squareSize, filesArray, ranksArray, onMove, disabled });
  boardDataRef.current = { board, currentTurn, squareSize, filesArray, ranksArray, onMove, disabled };

  const selectedSquareRef = useRef(selectedSquare);
  selectedSquareRef.current = selectedSquare;
  const validMovesRef = useRef(validMoves);
  validMovesRef.current = validMoves;

  // Clear drop ghost when FEN changes (new position arrived)
  useEffect(() => {
    if (fen !== prevFenRef.current) {
      prevFenRef.current = fen;
      setDropGhost(null);
    }
  }, [fen]);

  // Detect move by comparing previous and current FEN, then animate
  const prevBoardRef = useRef(board);
  useEffect(() => {
    const prev = prevBoardRef.current;
    prevBoardRef.current = board;

    // Skip animation if a drag just completed (drop ghost handles visual continuity)
    if (dropGhost) return;

    // Find a piece that moved: present in prev but missing in current at same square
    let movedPiece: string | null = null;
    let fromSq: string | null = null;
    let toSq: string | null = null;

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const prevP = prev[r]?.[f];
        const currP = board[r]?.[f];
        if (prevP && !currP) {
          fromSq = `${FILES[f]}${RANKS[r]}`;
          movedPiece = getPieceKey(prevP.color, prevP.type);
        }
        if (currP && (!prevP || prevP.color !== currP.color || prevP.type !== currP.type)) {
          toSq = `${FILES[f]}${RANKS[r]}`;
          if (!movedPiece && currP) {
            movedPiece = getPieceKey(currP.color, currP.type);
          }
        }
      }
    }

    if (movedPiece && fromSq && toSq) {
      const progress = new Animated.Value(0);
      setMoveAnim({ pieceKey: movedPiece, fromSquare: fromSq, toSquare: toSq, progress });
      Animated.timing(progress, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setMoveAnim(null);
      });
    }
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLayout = useCallback(() => {
    boardRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      boardOrigin.current = { x: pageX, y: pageY };
    });
  }, []);

  const getSquareName = useCallback((file: number, rank: number): string => {
    return `${FILES[file]}${RANKS[rank]}`;
  }, []);

  const getSquareFromPosition = useCallback((x: number, y: number): string | null => {
    const { squareSize: sz, filesArray: fa, ranksArray: ra } = boardDataRef.current;
    const fileIndex = Math.floor(x / sz);
    const rankIndex = Math.floor(y / sz);

    if (fileIndex < 0 || fileIndex > 7 || rankIndex < 0 || rankIndex > 7) return null;

    const file = fa[fileIndex];
    const rank = ra[rankIndex];
    return `${FILES[file]}${RANKS[rank]}`;
  }, []);

  const getValidMoves = useCallback((squareName: string): string[] => {
    try {
      const moves = game.moves({ square: squareName as any, verbose: true });
      return moves.map((m: any) => m.to);
    } catch {
      return [];
    }
  }, [game]);

  const executeMove = useCallback((from: string, to: string) => {
    const { onMove: cb } = boardDataRef.current;
    if (!cb) return;

    const movingPiece = game.get(from as any);
    const toRank = to[1];

    if (movingPiece?.type === 'p' && (toRank === '8' || toRank === '1')) {
      cb(from, to + 'q');
    } else {
      cb(from, to);
    }
  }, [game]);

  const handleTap = useCallback((squareName: string) => {
    const { board: b, currentTurn: turn, disabled: dis } = boardDataRef.current;
    if (dis) return;

    const fileIdx = FILES.indexOf(squareName[0]);
    const rankIdx = RANKS.indexOf(squareName[1]);
    const piece = b[rankIdx]?.[fileIdx];
    const sel = selectedSquareRef.current;
    const vm = validMovesRef.current;

    if (sel) {
      if (sel === squareName) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      if (piece && piece.color === turn) {
        setSelectedSquare(squareName);
        setValidMoves(getValidMoves(squareName));
        return;
      }

      if (vm.includes(squareName)) {
        executeMove(sel, squareName);
      }
      setSelectedSquare(null);
      setValidMoves([]);
    } else if (piece && piece.color === turn) {
      setSelectedSquare(squareName);
      setValidMoves(getValidMoves(squareName));
    }
  }, [getValidMoves, executeMove]);

  // PanResponder created once — reads all mutable state from refs
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !boardDataRef.current.disabled,
    onMoveShouldSetPanResponder: () => !boardDataRef.current.disabled,

    onPanResponderGrant: (evt: GestureResponderEvent) => {
      const { board: b, currentTurn: turn, squareSize: sz, filesArray: fa, ranksArray: ra, disabled: dis } = boardDataRef.current;
      if (dis) return;

      const touch = evt.nativeEvent;

      boardRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
        boardOrigin.current = { x: pageX, y: pageY };
      });

      const relX = touch.pageX - boardOrigin.current.x;
      const relY = touch.pageY - boardOrigin.current.y;

      const square = getSquareFromPosition(relX, relY);
      if (!square) return;

      const fileIdx = FILES.indexOf(square[0]);
      const rankIdx = RANKS.indexOf(square[1]);
      const piece = b[rankIdx]?.[fileIdx];

      if (piece && piece.color === turn) {
        const pieceKey = getPieceKey(piece.color, piece.type);
        draggingFromRef.current = square;
        draggingPieceRef.current = pieceKey;
        setValidMoves(getValidMoves(square));

        const displayFileIdx = fa.indexOf(fileIdx);
        const displayRankIdx = ra.indexOf(rankIdx);
        dragPositionRef.current.setValue({
          x: displayFileIdx * sz,
          y: displayRankIdx * sz,
        });
        setDragOverlay({ piece: pieceKey, position: dragPositionRef.current });
      }
    },

    onPanResponderMove: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
      if (!draggingFromRef.current) return;

      const { squareSize: sz } = boardDataRef.current;
      const touch = evt.nativeEvent;
      const relX = touch.pageX - boardOrigin.current.x;
      const relY = touch.pageY - boardOrigin.current.y;
      dragPositionRef.current.setValue({
        x: relX - sz / 2,
        y: relY - sz / 2,
      });
    },

    onPanResponderRelease: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
      const touch = evt.nativeEvent;
      const relX = touch.pageX - boardOrigin.current.x;
      const relY = touch.pageY - boardOrigin.current.y;
      const from = draggingFromRef.current;

      if (!from) {
        // Tap, not drag
        const square = getSquareFromPosition(relX, relY);
        if (square) handleTap(square);
        return;
      }

      const targetSquare = getSquareFromPosition(relX, relY);

      if (targetSquare && from) {
        const moves = getValidMoves(from);

        if (moves.includes(targetSquare)) {
          // Valid move: keep ghost at destination until FEN updates
          setDropGhost({ piece: draggingPieceRef.current!, square: targetSquare });
          executeMove(from, targetSquare);
        } else if (targetSquare === from) {
          setSelectedSquare(from);
          setValidMoves(moves);
        }
      }

      draggingFromRef.current = null;
      draggingPieceRef.current = null;
      setDragOverlay(null);
      if (!targetSquare || targetSquare !== from) {
        setValidMoves([]);
      }
    },

    onPanResponderTerminate: () => {
      draggingFromRef.current = null;
      draggingPieceRef.current = null;
      setDragOverlay(null);
      setValidMoves([]);
    },
  }), [getSquareFromPosition, getValidMoves, executeMove, handleTap]);

  // Compute animation pixel positions
  const animOverlay = useMemo(() => {
    if (!moveAnim) return null;
    const { pieceKey, fromSquare, toSquare, progress } = moveAnim;
    const fromCenter = squareToCenterPixel(fromSquare, squareSize, orientation);
    const toCenter = squareToCenterPixel(toSquare, squareSize, orientation);
    const halfSq = squareSize / 2;
    return {
      pieceKey,
      fromSquare,
      toSquare,
      translateX: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [fromCenter.x - halfSq, toCenter.x - halfSq],
      }),
      translateY: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [fromCenter.y - halfSq, toCenter.y - halfSq],
      }),
    };
  }, [moveAnim, squareSize, orientation]);

  // Compute drop ghost pixel position
  const ghostOverlay = useMemo(() => {
    if (!dropGhost) return null;
    const center = squareToCenterPixel(dropGhost.square, squareSize, orientation);
    return {
      pieceKey: dropGhost.piece,
      x: center.x - squareSize / 2,
      y: center.y - squareSize / 2,
    };
  }, [dropGhost, squareSize, orientation]);

  return (
    <View style={styles.boardContainer}>
      <View style={styles.boardWrapper}>
        <View style={{ position: 'relative' }}>
          <View
            ref={boardRef}
            style={[styles.board, { width: boardSize, height: boardSize }]}
            onLayout={handleLayout}
            {...panResponder.panHandlers}
          >
            {ranksArray.map((rank) => (
              <View key={`rank-${rank}`} style={styles.row}>
                {filesArray.map((file) => {
                  const piece = board[rank]?.[file];
                  const squareName = getSquareName(file, rank);
                  const isLight = (file + rank) % 2 === 0;
                  const isSelected = selectedSquare === squareName;
                  const isValidMove = validMoves.includes(squareName);
                  const isDragSource = draggingFromRef.current === squareName && dragOverlay !== null;
                  const pieceKey = piece ? getPieceKey(piece.color, piece.type) : null;
                  const isAnimatingFrom = animOverlay?.fromSquare === squareName;

                  return (
                    <MemoizedSquare
                      key={squareName}
                      squareName={squareName}
                      pieceKey={pieceKey}
                      isLight={isLight}
                      isSelected={isSelected}
                      isValidMove={isValidMove}
                      isDragSource={isDragSource}
                      hasPiece={!!piece}
                      squareSize={squareSize}
                      isAnimatingFrom={isAnimatingFrom}
                    />
                  );
                })}
              </View>
            ))}

            {/* Move animation overlay */}
            {animOverlay && (
              <Animated.View
                style={[
                  styles.draggingPiece,
                  {
                    width: squareSize,
                    height: squareSize,
                    transform: [
                      { translateX: animOverlay.translateX },
                      { translateY: animOverlay.translateY },
                    ],
                  },
                ]}
                pointerEvents="none"
              >
                <MemoizedPiece pieceKey={animOverlay.pieceKey} size={squareSize * 0.85} />
              </Animated.View>
            )}

            {/* Drop ghost: keeps piece visible at destination until FEN updates */}
            {ghostOverlay && (
              <View
                style={[
                  styles.draggingPiece,
                  {
                    width: squareSize,
                    height: squareSize,
                    transform: [{ translateX: ghostOverlay.x }, { translateY: ghostOverlay.y }],
                  },
                ]}
                pointerEvents="none"
              >
                <MemoizedPiece pieceKey={ghostOverlay.pieceKey} size={squareSize * 0.85} />
              </View>
            )}

            {/* Drag overlay */}
            {dragOverlay && (
              <Animated.View
                style={[
                  styles.draggingPiece,
                  {
                    width: squareSize,
                    height: squareSize,
                    transform: dragOverlay.position.getTranslateTransform(),
                  },
                ]}
                pointerEvents="none"
              >
                <MemoizedPiece pieceKey={dragOverlay.piece} size={squareSize * 0.95} />
              </Animated.View>
            )}
          </View>

          {/* Best-move arrow */}
          {bestMove && bestMove.length >= 4 && /^[a-h][1-8][a-h][1-8]/.test(bestMove) && (() => {
            const from = squareToCenterPixel(bestMove.substring(0, 2), squareSize, orientation);
            const to   = squareToCenterPixel(bestMove.substring(2, 4), squareSize, orientation);
            const d    = getArrowPath(from.x, from.y, to.x, to.y, squareSize);
            return d ? (
              <View style={[styles.arrowOverlay, { width: boardSize, height: boardSize }]} pointerEvents="none">
                <Svg width={boardSize} height={boardSize} viewBox={`0 0 ${boardSize} ${boardSize}`}>
                  <Path d={d} fill={arrowColor} />
                </Svg>
              </View>
            ) : null;
          })()}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  boardContainer: {
  },
  boardWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  board: {
    borderWidth: 2,
    borderColor: '#000',
    overflow: 'hidden',
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  lightSquare: {
    backgroundColor: '#f0d9b5',
  },
  darkSquare: {
    backgroundColor: '#b58863',
  },
  selectedSquare: {
    backgroundColor: '#baca44',
  },
  validMoveSquare: {
    backgroundColor: '#829769',
  },
  validMoveDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  captureRing: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 3,
    borderColor: 'rgba(0, 0, 0, 0.3)',
  },
  arrowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 50,
  },
  draggingPiece: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
