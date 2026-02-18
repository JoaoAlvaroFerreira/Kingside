/**
 * MoveTree - Tree-based move structure supporting PGN variations
 */

import { Chess, Move } from 'chess.js';

export interface MoveNode {
  id: string;
  san: string;
  fen: string;
  moveNumber: number;
  isBlack: boolean;
  children: MoveNode[];
  parent: MoveNode | null;
  isCritical?: boolean;
  comment?: string;
}

export class MoveTree {
  private rootMoves: MoveNode[] = []; // First moves from starting position
  private currentNode: MoveNode | null = null;
  private startFen: string;
  private nodeIdCounter = 0;

  constructor(startFen?: string) {
    this.startFen = startFen || new Chess().fen();
  }

  private generateId(): string {
    return `node_${++this.nodeIdCounter}`;
  }

  getCurrentFen(): string {
    return this.currentNode?.fen || this.startFen;
  }

  getCurrentNode(): MoveNode | null {
    return this.currentNode;
  }

  getRootMoves(): MoveNode[] {
    return this.rootMoves;
  }

  isAtStart(): boolean {
    return this.currentNode === null;
  }

  isAtEnd(): boolean {
    if (!this.currentNode) return this.rootMoves.length === 0;
    return this.currentNode.children.length === 0;
  }

  /**
   * Add a move from the current position.
   * If the move already exists as a child, navigate to it.
   * If not, create a new node (as main line if first child, variation otherwise).
   */
  addMove(san: string): boolean {
    const fen = this.getCurrentFen();
    const chess = new Chess(fen);

    let move: Move;
    try {
      move = chess.move(san);
      if (!move) return false;
    } catch {
      return false;
    }

    const newFen = chess.fen();
    const parent = this.currentNode;
    const children = parent ? parent.children : this.rootMoves;

    // Check if this move already exists as a child
    const existingChild = children.find(child => child.san === move.san);
    if (existingChild) {
      this.currentNode = existingChild;
      return true;
    }

    // Calculate move number from FEN
    const fenParts = fen.split(' ');
    const fullMoveNumber = parseInt(fenParts[5] || '1', 10);
    const isBlackToMove = fenParts[1] === 'b';

    const newNode: MoveNode = {
      id: this.generateId(),
      san: move.san,
      fen: newFen,
      moveNumber: fullMoveNumber,
      isBlack: isBlackToMove,
      children: [],
      parent,
    };

    children.push(newNode);
    this.currentNode = newNode;
    return true;
  }

  /**
   * Navigate to a specific node by ID
   */
  navigateToNode(nodeId: string | null): boolean {
    if (nodeId === null) {
      this.currentNode = null;
      return true;
    }

    const node = this.findNode(nodeId);
    if (node) {
      this.currentNode = node;
      return true;
    }
    return false;
  }

  private findNode(nodeId: string): MoveNode | null {
    for (const root of this.rootMoves) {
      const found = this.findNodeInTree(nodeId, root);
      if (found) return found;
    }
    return null;
  }

  private findNodeInTree(nodeId: string, node: MoveNode): MoveNode | null {
    if (node.id === nodeId) return node;
    for (const child of node.children) {
      const found = this.findNodeInTree(nodeId, child);
      if (found) return found;
    }
    return null;
  }

  /**
   * Navigate back one move
   */
  goBack(): boolean {
    if (!this.currentNode) return false;
    this.currentNode = this.currentNode.parent;
    return true;
  }

  /**
   * Navigate forward one move (follows main line - first child)
   */
  goForward(): boolean {
    const children = this.currentNode ? this.currentNode.children : this.rootMoves;
    if (children.length === 0) return false;
    this.currentNode = children[0];
    return true;
  }

  /**
   * Go to the start position
   */
  goToStart(): void {
    this.currentNode = null;
  }

  /**
   * Go to the end of the main line
   */
  goToEnd(): void {
    while (this.goForward()) { /* advance */ }
  }

  /**
   * Get the path from root to current node
   */
  getCurrentPath(): MoveNode[] {
    const path: MoveNode[] = [];
    let node = this.currentNode;
    while (node) {
      path.unshift(node);
      node = node.parent;
    }
    return path;
  }

  /**
   * Get main line moves (array of SANs)
   */
  getMainLine(): string[] {
    const moves: string[] = [];
    let node = this.rootMoves[0] || null;
    while (node) {
      moves.push(node.san);
      node = node.children[0] || null;
    }
    return moves;
  }

  /**
   * Generate PGN string with variations
   */
  toPgn(): string {
    if (this.rootMoves.length === 0) return '';

    let result = this.nodeToString(this.rootMoves[0], true, true);

    // Add alternative first moves as variations
    for (let i = 1; i < this.rootMoves.length; i++) {
      result += ` (${this.nodeToString(this.rootMoves[i], false, true)})`;
    }

    return result;
  }

  private nodeToString(node: MoveNode, isMainLine: boolean, needsMoveNumber: boolean): string {
    let result = '';

    // Add move number prefix
    if (node.isBlack) {
      if (needsMoveNumber) {
        result += `${node.moveNumber}... `;
      }
    } else {
      result += `${node.moveNumber}. `;
    }

    result += node.san;

    // Continue with children
    if (node.children.length > 0) {
      // Add main continuation
      result += ' ' + this.nodeToString(node.children[0], isMainLine, false);

      // Add variations (non-first children)
      for (let i = 1; i < node.children.length; i++) {
        const variation = node.children[i];
        result += ` (${this.nodeToString(variation, false, true)})`;
      }
    }

    return result;
  }

  /**
   * Get a flat representation for the MoveHistory component
   */
  getFlatMoves(): FlatMove[] {
    if (this.rootMoves.length === 0) return [];

    const moves: FlatMove[] = [];

    // Process main line first move
    this.flattenMainLine(this.rootMoves[0], moves, 0);

    // Add alternative first moves as variations
    for (let i = 1; i < this.rootMoves.length; i++) {
      this.flattenVariation(this.rootMoves[i], moves, 1);
    }

    return moves;
  }

  private flattenMainLine(node: MoveNode, moves: FlatMove[], depth: number): void {
    const prevMove = moves.length > 0 ? moves[moves.length - 1] : null;

    // Black needs "..." only if previous move isn't the white ply of same move number
    const needsMoveNumber = !node.isBlack ||
      !prevMove ||
      prevMove.isBlack ||
      prevMove.moveNumber !== node.moveNumber ||
      prevMove.depth !== depth;

    moves.push({
      id: node.id,
      san: node.san,
      moveNumber: node.moveNumber,
      isBlack: node.isBlack,
      depth,
      isMainLine: depth === 0,
      isVariationStart: false,
      needsMoveNumber,
      isCritical: node.isCritical,
      comment: node.comment,
    });

    // Continue main line
    if (node.children.length > 0) {
      this.flattenMainLine(node.children[0], moves, depth);

      // Add variations after the main continuation
      for (let i = 1; i < node.children.length; i++) {
        this.flattenVariation(node.children[i], moves, depth + 1);
      }
    }
  }

  private flattenVariation(node: MoveNode, moves: FlatMove[], depth: number): void {
    // First move in variation always needs move number
    moves.push({
      id: node.id,
      san: node.san,
      moveNumber: node.moveNumber,
      isBlack: node.isBlack,
      depth,
      isMainLine: false,
      isVariationStart: true,
      needsMoveNumber: true,
      isCritical: node.isCritical,
      comment: node.comment,
    });

    // Continue the variation
    let current = node;
    while (current.children.length > 0) {
      const nextNode = current.children[0];
      const prevMove = moves[moves.length - 1];

      const needsMoveNumber = !nextNode.isBlack ||
        prevMove.isBlack ||
        prevMove.moveNumber !== nextNode.moveNumber;

      moves.push({
        id: nextNode.id,
        san: nextNode.san,
        moveNumber: nextNode.moveNumber,
        isBlack: nextNode.isBlack,
        depth,
        isMainLine: false,
        isVariationStart: false,
        needsMoveNumber,
        isCritical: nextNode.isCritical,
        comment: nextNode.comment,
      });

      // Handle nested variations
      for (let i = 1; i < current.children.length; i++) {
        this.flattenVariation(current.children[i], moves, depth + 1);
      }

      current = nextNode;
    }
  }

  /**
   * Promote a variation to be the main line.
   * The node becomes the first child of its parent, swapping with the current main line.
   */
  promoteToMainLine(nodeId: string): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;

    // Check if this is a root move
    const rootIndex = this.rootMoves.indexOf(node);
    if (rootIndex > 0) {
      // Swap with first root move
      [this.rootMoves[0], this.rootMoves[rootIndex]] = [this.rootMoves[rootIndex], this.rootMoves[0]];
      return true;
    }

    // Check if this is already the main continuation
    if (!node.parent) return false;
    const parent = node.parent;
    const childIndex = parent.children.indexOf(node);

    if (childIndex <= 0) return false; // Already main line or not found

    // Swap with first child (main line)
    [parent.children[0], parent.children[childIndex]] = [parent.children[childIndex], parent.children[0]];
    return true;
  }

  /**
   * Check if a node is a variation (not the main line)
   */
  isVariation(nodeId: string): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;

    // Check if it's an alternative first move
    const rootIndex = this.rootMoves.indexOf(node);
    if (rootIndex > 0) return true;

    // Check if it's not the first child of its parent
    if (node.parent) {
      return node.parent.children.indexOf(node) > 0;
    }

    return false;
  }

  /**
   * Mark a position as critical for training
   */
  markAsCritical(nodeId: string, isCritical: boolean): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;
    node.isCritical = isCritical;
    return true;
  }

  /**
   * Add or update a comment on a node
   */
  setComment(nodeId: string, comment: string): boolean {
    const node = this.findNode(nodeId);
    if (!node) return false;
    node.comment = comment || undefined;
    return true;
  }

  /**
   * Reset the tree
   */
  reset(): void {
    this.rootMoves = [];
    this.currentNode = null;
    this.nodeIdCounter = 0;
  }

  /**
   * Serialize the tree to JSON
   */
  toJSON(): SerializedMoveTree {
    return {
      rootMoves: this.serializeNodes(this.rootMoves),
      startFen: this.startFen,
      nodeIdCounter: this.nodeIdCounter,
    };
  }

  /**
   * Deserialize a tree from JSON
   */
  static fromJSON(data: SerializedMoveTree): MoveTree {
    const tree = new MoveTree(data.startFen);
    tree.nodeIdCounter = data.nodeIdCounter || 0;
    tree.rootMoves = tree.deserializeNodes(data.rootMoves, null);
    return tree;
  }

  private serializeNodes(nodes: MoveNode[]): SerializedMoveNode[] {
    return nodes.map(node => ({
      id: node.id,
      san: node.san,
      fen: node.fen,
      moveNumber: node.moveNumber,
      isBlack: node.isBlack,
      children: this.serializeNodes(node.children),
      isCritical: node.isCritical,
      comment: node.comment,
    }));
  }

  private deserializeNodes(nodes: SerializedMoveNode[], parent: MoveNode | null): MoveNode[] {
    return nodes.map(serialized => {
      const node: MoveNode = {
        id: serialized.id,
        san: serialized.san,
        fen: serialized.fen,
        moveNumber: serialized.moveNumber,
        isBlack: serialized.isBlack,
        children: [],
        parent,
        isCritical: serialized.isCritical,
        comment: serialized.comment,
      };
      node.children = this.deserializeNodes(serialized.children, node);
      return node;
    });
  }
}

export interface SerializedMoveNode {
  id: string;
  san: string;
  fen: string;
  moveNumber: number;
  isBlack: boolean;
  children: SerializedMoveNode[];
  isCritical?: boolean;
  comment?: string;
}

export interface SerializedMoveTree {
  rootMoves: SerializedMoveNode[];
  startFen: string;
  nodeIdCounter: number;
}

export interface FlatMove {
  id: string;
  san: string;
  moveNumber: number;
  isBlack: boolean;
  depth: number;
  isMainLine: boolean;
  isVariationStart: boolean;
  needsMoveNumber: boolean;
  isCritical?: boolean;
  comment?: string;
}
