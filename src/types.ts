export interface Product {
  id: string;
  name: string;
  size: string;
  color: string;
  suffix: string;
}

export interface Element {
  id: string;
  label: string;
  precision: number;
}

export interface MiningRow {
  cut: string;
  material: string;
  volume: number;
  tonnes: number;
  globalChem: Record<string, number>; // e.g., { FE: 46.56, ... }
  splits: Record<string, number>; // G1: 25.08, G2: 17.05, ...
  productChem: Record<string, Record<string, number>>; // { G1: { FE: 55.18, ... }, ... }
  rawLine: string;
}

export interface BaseData {
  rows: MiningRow[];
  selectedRowIndex: number;
  targetOre: number;
  editedGlobalChem: Record<string, number>;
  editedSplits: Record<string, number>;
}
