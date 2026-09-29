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
  globalChem: Record<string, number>;
  splits: Record<string, number>;
  productChem: Record<string, Record<string, number>>;
  rawLine: string;
}

export interface ParseResult {
  rows: MiningRow[];
  grandTotal: MiningRow | null;
}

export interface PlantPremises {
  globalChem: Record<string, number>;
  splits: Record<string, number>;
}

export interface OptimizerConfig {
  weights: {
    chem: number;
    granulo: number;
    frontCountPenalty: number;
    smallAllocationPenalty: number;
  };
  tolerances: {
    chem: Record<string, number>; // Absolute tolerance limit for Excellent status
    granulo: number; // Absolute tolerance limit for splits
  };
}

export interface BlendAlternative {
  allocations: Record<number, number>; // index of the front to the percentage allocated
  blendMass: number;
  blendGlobalChem: Record<string, number>;
  blendSplits: Record<string, number>;
  blendProductChem: Record<string, Record<string, number>>;
  scores: {
    global: number;
    chem: number;
    granulo: number;
    operational: number;
  };
  justifications: string[];
}

export interface BaseData {
  rows: MiningRow[];
  grandTotal: MiningRow | null;
  selectedRowIndex: number;
  targetOre: number;
  editedGlobalChem: Record<string, number>;
  editedSplits: Record<string, number>;
}
