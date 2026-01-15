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
import { SvgUri } from 'react-native-svg';
import { Chess } from 'chess.js';

interface InteractiveChessBoardProps {
  fen: string;
  onMove?: (from: string, to: string) => void;
  orientation?: 'white' | 'black';
  showCoordinates?: boolean;
  disabled?: boolean;
}

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
}) => {
  const { width, height } = useWindowDimensions();
  const maxBoardSize = Math.min(width, height) - 80;
  const boardSize = Math.min(maxBoardSize, 500);
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
      // Measure board position
      boardRef.current?.measure((x, y, w, h, pageX, pageY) => {
        boardOrigin.current = { x: pageX, y: pageY };
      });

      const touch = evt.nativeEvent;
      const relX = touch.locationX;
      const relY = touch.locationY;

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

    onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (!draggingFrom) return;

      const touch = evt.nativeEvent;
      dragPosition.setValue({
        x: touch.locationX - squareSize / 2,
        y: touch.locationY - squareSize / 2,
      });
    },

    onPanResponderRelease: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (!draggingFrom) {
        // This was a tap, not a drag
        const touch = evt.nativeEvent;
        const square = getSquareFromPosition(touch.locationX, touch.locationY);

        if (square) {
          handleTap(square);
        }
        return;
      }

      const touch = evt.nativeEvent;
      const targetSquare = getSquareFromPosition(touch.locationX, touch.locationY);

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
        <View>
          <View
            ref={boardRef}
            style={[styles.board, { width: boardSize, height: boardSize }]}
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
    padding: 10,
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
  draggingPiece: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
