/**
 * Interactive Chess Board Component - Tap or drag pieces to move
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Text,
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
  bestMove?: string;  // UCI notation (e.g. "e2e4") — renders arrow when set
}

// Square name → center pixel on the board grid
const squareToCenterPixel = (square: string, squareSize: number, orientation: 'white' | 'black') => {
  const file = square.charCodeAt(0) - 97;   // 'a' = 0
  const rank = parseInt(square[1]) - 1;      // '1' = 0
  const displayFile = orientation === 'white' ? file : 7 - file;
  const displayRank = orientation === 'white' ? 7 - rank : rank;
  return {
    x: (displayFile + 0.5) * squareSize,
    y: (displayRank + 0.5) * squareSize,
  };
};

// Arrow-shaped path: thick shaft + triangular head
const getArrowPath = (x1: number, y1: number, x2: number, y2: number, squareSize: number): string => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;   // perpendicular
  const py = ux;

  const shaftW = squareSize * 0.18;
  const headLen = squareSize * 0.38;
  const headW = squareSize * 0.38;

  // Shaft end where the head triangle starts
  const sx = x2 - ux * headLen;
  const sy = y2 - uy * headLen;

  const pts = [
    [x1  + px * shaftW / 2, y1  + py * shaftW / 2],  // shaft start R
    [sx  + px * shaftW / 2, sy  + py * shaftW / 2],  // shaft end   R
    [sx  + px * headW  / 2, sy  + py * headW  / 2],  // head base   R
    [x2, y2],                                          // tip
    [sx  - px * headW  / 2, sy  - py * headW  / 2],  // head base   L
    [sx  - px * shaftW / 2, sy  - py * shaftW / 2],  // shaft end   L
    [x1  - px * shaftW / 2, y1  - py * shaftW / 2],  // shaft start L
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

export const InteractiveChessBoard: React.FC<InteractiveChessBoardProps> = ({
  fen,
  onMove,
  orientation = 'white',
  showCoordinates = true,
  disabled = false,
  boardSizePixels,
  bestMove,
}) => {
  const { width, height } = useWindowDimensions();

  // Use provided size or calculate default
  const boardSize = boardSizePixels || Math.min(Math.min(width, height) - 40, 480);
  const squareSize = boardSize / 8;
  const coordinateSize = 20;

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [draggingPiece, setDraggingPiece] = useState<string | null>(null);

  const dragPosition = useRef(new Animated.ValueXY()).current;
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

  const filesArray = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const ranksArray = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  // Measure board position on layout
  const handleLayout = () => {
    boardRef.current?.measure((x, y, w, h, pageX, pageY) => {
      boardOrigin.current = { x: pageX, y: pageY };
    });
  };

  const getSquareName = (file: number, rank: number): string => {
    return `${FILES[file]}${RANKS[rank]}`;
  };

  const getSquareFromPosition = (x: number, y: number): string | null => {
    const fileIndex = Math.floor(x / squareSize);
    const rankIndex = Math.floor(y / squareSize);

    if (fileIndex < 0 || fileIndex > 7 || rankIndex < 0 || rankIndex > 7) {
      return null;
    }

    const file = filesArray[fileIndex];
    const rank = ranksArray[rankIndex];
    return getSquareName(file, rank);
  };

  const getValidMoves = (squareName: string): string[] => {
    try {
      const moves = game.moves({ square: squareName as any, verbose: true });
      return moves.map((m: any) => m.to);
    } catch {
      return [];
    }
  };

  const executeMove = (from: string, to: string) => {
    if (!onMove) return;

    const movingPiece = game.get(from as any);
    const toRank = to[1];

    if (movingPiece?.type === 'p' && (toRank === '8' || toRank === '1')) {
      onMove(from, to + 'q');
    } else {
      onMove(from, to);
    }
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,

    onPanResponderGrant: (evt: GestureResponderEvent) => {
      if (disabled) return;

      const touch = evt.nativeEvent;

      // Always re-measure board origin (parent layout shifts from EvalBar or
      // status bar can invalidate a previously measured position). Async result
      // updates boardOrigin for the next touch; current touch uses latest cached value.
      boardRef.current?.measure((x, y, w, h, pageX, pageY) => {
        boardOrigin.current = { x: pageX, y: pageY };
      });

      const relX = touch.pageX - boardOrigin.current.x;
      const relY = touch.pageY - boardOrigin.current.y;

      const square = getSquareFromPosition(relX, relY);
      if (!square) return;

      const fileIdx = FILES.indexOf(square[0]);
      const rankIdx = RANKS.indexOf(square[1]);
      const piece = board[rankIdx]?.[fileIdx];

      if (piece && piece.color === currentTurn) {
        const pieceKey = getPieceKey(piece.color, piece.type);
        setDraggingFrom(square);
        setDraggingPiece(pieceKey);
        setValidMoves(getValidMoves(square));

        // Position at touch point
        const displayFileIdx = filesArray.indexOf(fileIdx);
        const displayRankIdx = ranksArray.indexOf(rankIdx);
        dragPosition.setValue({
          x: displayFileIdx * squareSize,
          y: displayRankIdx * squareSize,
        });
      }
    },

    onPanResponderMove: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
      if (!draggingFrom) return;

      const touch = evt.nativeEvent;
      const relX = touch.pageX - boardOrigin.current.x;
      const relY = touch.pageY - boardOrigin.current.y;
      dragPosition.setValue({
        x: relX - squareSize / 2,
        y: relY - squareSize / 2,
      });
    },

    onPanResponderRelease: (evt: GestureResponderEvent, _gestureState: PanResponderGestureState) => {
      const touch = evt.nativeEvent;
      const relX = touch.pageX - boardOrigin.current.x;
      const relY = touch.pageY - boardOrigin.current.y;

      if (!draggingFrom) {
        // This was a tap, not a drag
        const square = getSquareFromPosition(relX, relY);

        if (square) {
          handleTap(square);
        }
        return;
      }

      const targetSquare = getSquareFromPosition(relX, relY);

      if (targetSquare && draggingFrom) {
        const moves = getValidMoves(draggingFrom);

        if (moves.includes(targetSquare)) {
          executeMove(draggingFrom, targetSquare);
        } else if (targetSquare === draggingFrom) {
          // Dropped on same square - treat as selection
          setSelectedSquare(draggingFrom);
          setValidMoves(moves);
        }
      }

      setDraggingFrom(null);
      setDraggingPiece(null);
      if (!targetSquare || targetSquare !== draggingFrom) {
        setValidMoves([]);
      }
    },

    onPanResponderTerminate: () => {
      setDraggingFrom(null);
      setDraggingPiece(null);
      setValidMoves([]);
    },
  }), [board, currentTurn, squareSize, filesArray, ranksArray, onMove, draggingFrom, disabled]);

  const handleTap = (squareName: string) => {
    if (disabled) return;
    const fileIdx = FILES.indexOf(squareName[0]);
    const rankIdx = RANKS.indexOf(squareName[1]);
    const piece = board[rankIdx]?.[fileIdx];

    if (selectedSquare) {
      if (selectedSquare === squareName) {
        setSelectedSquare(null);
        setValidMoves([]);
        return;
      }

      if (piece && piece.color === currentTurn) {
        setSelectedSquare(squareName);
        setValidMoves(getValidMoves(squareName));
        return;
      }

      if (validMoves.includes(squareName)) {
        executeMove(selectedSquare, squareName);
      }
      setSelectedSquare(null);
      setValidMoves([]);
    } else if (piece && piece.color === currentTurn) {
      setSelectedSquare(squareName);
      setValidMoves(getValidMoves(squareName));
    }
  };

  const displayFiles = orientation === 'white' ? FILES : [...FILES].reverse();
  const displayRanks = orientation === 'white' ? RANKS : [...RANKS].reverse();

  return (
    <View style={styles.boardContainer}>
      <View style={styles.boardWrapper}>
        {showCoordinates && (
          <View style={[styles.rankLabels, { height: boardSize }]}>
            {displayRanks.map((rankLabel) => (
              <View key={`rank-label-${rankLabel}`} style={[styles.coordinateCell, { height: squareSize, width: coordinateSize }]}>
                <Text style={styles.coordinateText}>{rankLabel}</Text>
              </View>
            ))}
          </View>
        )}
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
                  const isDragSource = draggingFrom === squareName;
                  const pieceKey = piece ? getPieceKey(piece.color, piece.type) : null;

                  return (
                    <View
                      key={squareName}
                      style={[
                        styles.square,
                        { width: squareSize, height: squareSize },
                        isLight ? styles.lightSquare : styles.darkSquare,
                        isSelected && styles.selectedSquare,
                        isValidMove && styles.validMoveSquare,
                      ]}
                    >
                      {pieceKey && !isDragSource && (
                        <SvgUri
                          uri={PIECE_IMAGES[pieceKey]}
                          width={squareSize * 0.85}
                          height={squareSize * 0.85}
                        />
                      )}
                      {isValidMove && !piece && <View style={styles.validMoveDot} />}
                      {isValidMove && piece && !isDragSource && (
                        <View style={[styles.captureRing, { width: squareSize - 6, height: squareSize - 6 }]} />
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Dragging piece overlay */}
            {draggingPiece && (
              <Animated.View
                style={[
                  styles.draggingPiece,
                  {
                    width: squareSize,
                    height: squareSize,
                    transform: dragPosition.getTranslateTransform(),
                  },
                ]}
                pointerEvents="none"
              >
                <SvgUri
                  uri={PIECE_IMAGES[draggingPiece]}
                  width={squareSize * 0.95}
                  height={squareSize * 0.95}
                />
              </Animated.View>
            )}
          </View>

          {/* Best-move arrow — outside PanResponder so SVG cannot intercept touches */}
          {bestMove && bestMove.length >= 4 && (() => {
            const from = squareToCenterPixel(bestMove.substring(0, 2), squareSize, orientation);
            const to   = squareToCenterPixel(bestMove.substring(2, 4), squareSize, orientation);
            const d    = getArrowPath(from.x, from.y, to.x, to.y, squareSize);
            return d ? (
              <View style={[styles.arrowOverlay, { width: boardSize, height: boardSize }]} pointerEvents="none">
                <Svg width={boardSize} height={boardSize} viewBox={`0 0 ${boardSize} ${boardSize}`}>
                  <Path d={d} fill="rgba(39, 174, 96, 0.7)" />
                </Svg>
              </View>
            ) : null;
          })()}
          {showCoordinates && (
            <View style={[styles.fileLabels, { width: boardSize }]}>
              {displayFiles.map((fileLabel) => (
                <View key={`file-label-${fileLabel}`} style={[styles.coordinateCell, { width: squareSize, height: coordinateSize }]}>
                  <Text style={styles.coordinateText}>{fileLabel}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  boardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
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
  rankLabels: {
    justifyContent: 'space-around',
    marginRight: 4,
  },
  fileLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  coordinateCell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  coordinateText: {
    color: '#d4d4d4',
    fontSize: 12,
    fontWeight: '600',
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
