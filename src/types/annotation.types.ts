export interface PGNArrow {
  color: string;  // hex color
  from: string;   // square e.g. "c1"
  to: string;     // square e.g. "e3"
}

export interface PGNHighlight {
  color: string;
  square: string;
}

export const CAL_COLORS: Record<string, string> = {
  G: '#15781B',
  R: '#882020',
  Y: '#E6A817',
  B: '#003088',
};
