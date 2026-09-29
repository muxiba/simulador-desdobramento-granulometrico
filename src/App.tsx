import React, { useState, useEffect } from "react";
import { PRODUCTS, ELEMENTS, parsePastedData, generateStandaloneHTML, OptimizerEngine, OPTIMIZER_CONFIG } from "./utils";
import { MiningRow, ParseResult, PlantPremises, BlendAlternative } from "./types";
import { 
  FileSpreadsheet, 
  Download, 
  Copy, 
  SlidersHorizontal, 
  Calculator, 
  RefreshCw, 
  Sparkles, 
  Layers, 
  TrendingUp, 
  ChevronRight, 
  Database,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

const SAMPLE_PASTE = `Cut\tVolume\tTonnes\tFEGL\tSIGL\tALGL\tPGL\tMNGL\tPFGL\tG1\tFE1\tSI1\tAL1\tP1\tMN1\tPF1\tG2\tFE2\tSI2\tAL2\tP2\tMN2\tPF2\tG3\tFE3\tSI3\tAL3\tP3\tMN3\tPF3\tG4\tFE4\tSI4\tAL4\tP4\tMN4\tPF4
1\t58,336.50\t145,841.25\t42.88\t32.44\t2.67\t0.05\t0.20\t2.55\t6.65\t29.36\t10.00\t2.98\t0.06\t0.14\t3.25\t10.82\t23.09\t20.82\t2.16\t0.04\t0.13\t2.54\t32.02\t25.24\t21.05\t0.45\t0.02\t0.06\t0.91\t8.80\t28.44\t11.45\t2.66\t0.05\t0.12\t3.49
2\t5,042.28\t12,605.70\t48.86\t20.85\t3.99\t0.06\t0.39\t4.04\t19.37\t55.66\t11.88\t3.17\t0.07\t0.17\t5.03\t19.43\t51.43\t20.57\t2.36\t0.06\t0.21\t3.30\t41.87\t48.84\t26.99\t1.39\t0.04\t0.11\t1.91\t19.32\t50.29\t14.67\t6.04\t0.09\t0.30\t6.86
3\t1,880.12\t4,700.29\t42.79\t30.10\t3.65\t0.07\t0.44\t3.71\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00
4\t5,788.48\t14,471.21\t41.59\t32.04\t3.59\t0.06\t0.41\t3.62\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00\t0.00`;

const getConvergenceStatus = (elId: string, diff: number) => {
  const absDiff = Math.abs(diff);
  let level: "excellent" | "moderate" | "divergent" = "excellent";
  
  if (elId === "FE" || elId === "SI") {
    if (absDiff > 1.5) level = "divergent";
    else if (absDiff > 0.5) level = "moderate";
  } else if (elId === "AL" || elId === "PF") {
    if (absDiff > 0.75) level = "divergent";
    else if (absDiff > 0.25) level = "moderate";
  } else if (elId === "P") {
    if (absDiff > 0.015) level = "divergent";
    else if (absDiff > 0.005) level = "moderate";
  } else if (elId === "MN") {
    if (absDiff > 0.15) level = "divergent";
    else if (absDiff > 0.05) level = "moderate";
  } else {
    if (absDiff > 1.0) level = "divergent";
    else if (absDiff > 0.3) level = "moderate";
  }
  
  return level;
};

const DEFAULT_PLANT_PREMISES: PlantPremises = {
  globalChem: { FE: 42.56, SI: 31.27, AL: 3.77, P: 0.050, MN: 0.30, PF: 2.64 },
  splits: { G1: 10.93, G2: 13.62, G3: 45.73, G4: 29.72 }
};

export default function App() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<MiningRow[]>([]);
  const [grandTotal, setGrandTotal] = useState<MiningRow | null>(null);
  // selectedRowIndex is ONLY for individual front detail view — never used by simulation
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  // scenarioLoaded flags that buildGlobalScenario has run at least once
  const [scenarioLoaded, setScenarioLoaded] = useState(false);

  // Step 8: Plant Premises
  const [premises, setPremises] = useState<PlantPremises>(DEFAULT_PLANT_PREMISES);
  // Tolerância relativa (%) para avaliação do Blend e do Otimizador
  const [blendTolerance, setBlendTolerance] = useState<number>(5.0);

  // Step 9: Blend Optimization
  const [blendAlternatives, setBlendAlternatives] = useState<BlendAlternative[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [targetOre, setTargetOre] = useState<number>(0);
  
  // Global scenario state — updated ONLY by buildGlobalScenario()
  const [editedGlobalChem, setEditedGlobalChem] = useState<Record<string, number>>({});
  const [editedSplits, setEditedSplits] = useState<Record<string, number>>({});
  const [baselineGlobal, setBaselineGlobal] = useState<Record<string, number>>({});
  const [baselineProductChem, setBaselineProductChem] = useState<Record<string, Record<string, number>>>({}); 

  // Simulation result
  const [simulation, setSimulation] = useState<{
    finalTotalMass: number;
    splitSum: number;
    ratios: Record<string, number>;
    productMasses: Record<string, number>;
    productChem: Record<string, Record<string, number>>;
    globalChem: Record<string, number>;
  } | null>(null);

  const [copySuccess, setCopySuccess] = useState(false);

  /**
   * buildGlobalScenario — the SINGLE source of truth for simulation state.
   * Computes mass-weighted averages across ALL fronts and sets all baseline states.
   * selectRow() must NEVER modify these states.
   */
  const buildGlobalScenario = (allRows: MiningRow[], gt: MiningRow | null) => {
    if (allRows.length === 0) return;

    // 1. Total mass: prefer grandTotal.tonnes, else sum of all fronts
    const totalMass = (gt && gt.tonnes > 0) ? gt.tonnes : allRows.reduce((sum, r) => sum + r.tonnes, 0);
    setTargetOre(totalMass);

    // 2. Weighted splits: Σ(row.tonnes × row.splits[p]) / totalMass
    const splitsMap: Record<string, number> = {};
    PRODUCTS.forEach(p => {
      const weightedSplit = allRows.reduce((sum, r) => sum + r.tonnes * (r.splits[p.id] || 0), 0);
      splitsMap[p.id] = totalMass > 0 ? weightedSplit / totalMass : 0;
    });
    setEditedSplits(splitsMap);

    // 3. Weighted product chemistry: Σ(row.tonnes × row.splits[p] × row.productChem[p][el])
    //    normalized by Σ(row.tonnes × row.splits[p]) per product
    const productChemMap: Record<string, Record<string, number>> = {};
    PRODUCTS.forEach(p => {
      productChemMap[p.id] = {};
      const totalProductMass = allRows.reduce((sum, r) => sum + r.tonnes * (r.splits[p.id] || 0) / 100, 0);
      ELEMENTS.forEach(el => {
        const weightedChem = allRows.reduce((sum, r) => {
          const pMass = r.tonnes * (r.splits[p.id] || 0) / 100;
          return sum + pMass * (r.productChem[p.id]?.[el.id] || 0);
        }, 0);
        productChemMap[p.id][el.id] = totalProductMass > 0 ? weightedChem / totalProductMass : 0;
      });
    });
    setBaselineProductChem(productChemMap);

    // 4. Weighted global chemistry: Σ(row.tonnes × row.globalChem[el]) / totalMass
    const globalChemMap: Record<string, number> = {};
    ELEMENTS.forEach(el => {
      const weightedChem = allRows.reduce((sum, r) => sum + r.tonnes * (r.globalChem[el.id] || 0), 0);
      globalChemMap[el.id] = totalMass > 0 ? weightedChem / totalMass : 0;
    });
    setBaselineGlobal(globalChemMap);
    setEditedGlobalChem(globalChemMap);

    setScenarioLoaded(true);
  };

  /**
   * selectRow — ONLY marks which front is highlighted for detail view.
   * Does NOT modify targetOre, baselineGlobal, baselineProductChem,
   * editedSplits, or editedGlobalChem.
   */
  const selectRow = (index: number) => {
    setSelectedRowIndex(index);
  };

  // Load spreadsheet paste
  const handleLoadData = (textToParse: string) => {
    const parsed = parsePastedData(textToParse);
    if (parsed.rows.length === 0) {
      alert("Nenhum dado legível pôde ser interpretado. Certifique-se de copiar os cabeçalhos 'Cut', 'Material', 'Tonnes' e 'G1' conforme o template.");
      return;
    }
    setRows(parsed.rows);
    setGrandTotal(parsed.grandTotal);
    setSelectedRowIndex(0);
    buildGlobalScenario(parsed.rows, parsed.grandTotal);
  };

  // Run the process simulation math
  const runSimulation = () => {
    if (!scenarioLoaded || rows.length === 0) return;

    // 1. Calculate factor multipliers for chemistry scaling
    const factors: Record<string, number> = {};
    ELEMENTS.forEach(el => {
      const targetGrade = editedGlobalChem[el.id] || 0;
      const baseGrade = baselineGlobal[el.id] || 1;
      factors[el.id] = baseGrade === 0 ? 1 : targetGrade / baseGrade;
    });

    // 2. Compute splits and total mass ratios
    let splitSum = 0;
    PRODUCTS.forEach(p => {
      splitSum += editedSplits[p.id] || 0;
    });

    const productMasses: Record<string, number> = {};
    const ratios: Record<string, number> = {};
    const finalProductChem: Record<string, Record<string, number>> = {};
    const finalGlobalChem: Record<string, number> = {};

    ELEMENTS.forEach(el => {
      finalGlobalChem[el.id] = 0;
    });

    let finalTotalMass = 0;

    PRODUCTS.forEach(p => {
      const splitVal = editedSplits[p.id] || 0;
      const ratio = splitSum > 0 ? splitVal / splitSum : 0;
      const mass = targetOre * ratio;

      ratios[p.id] = ratio * 100;
      productMasses[p.id] = mass;
      finalTotalMass += mass;

      finalProductChem[p.id] = {};
      ELEMENTS.forEach(el => {
        // Multi-scalar grade adjustment
        const originalGrade = baselineProductChem[p.id]?.[el.id] || 0;
        const adjustedGrade = originalGrade * factors[el.id];
        finalProductChem[p.id][el.id] = adjustedGrade;

        // Mass weighted accumulation
        finalGlobalChem[el.id] += adjustedGrade * mass;
      });
    });

    // Normalize final simulated global chemistry
    ELEMENTS.forEach(el => {
      finalGlobalChem[el.id] = finalTotalMass > 0 ? finalGlobalChem[el.id] / finalTotalMass : 0;
    });

    setSimulation({
      finalTotalMass,
      splitSum,
      ratios,
      productMasses,
      productChem: finalProductChem,
      globalChem: finalGlobalChem
    });
  };

  const runOptimization = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      const engine = new OptimizerEngine(rows, targetOre || 100, premises, OPTIMIZER_CONFIG, blendTolerance);
      const alternatives = engine.run();
      setBlendAlternatives(alternatives);
      setIsOptimizing(false);
    }, 50);
  };

  // Re-run simulation whenever the global scenario inputs change
  useEffect(() => {
    if (scenarioLoaded && rows.length > 0) {
      runSimulation();
    }
  }, [scenarioLoaded, targetOre, editedGlobalChem, editedSplits]);

  // Load sample data on component mount
  useEffect(() => {
    setRawText(SAMPLE_PASTE);
    const parsed = parsePastedData(SAMPLE_PASTE);
    setRows(parsed.rows);
    setGrandTotal(parsed.grandTotal);
    if (parsed.rows.length > 0) {
      setSelectedRowIndex(0);
      setTimeout(() => buildGlobalScenario(parsed.rows, parsed.grandTotal), 50);
    }
  }, []);


  // Download stand-alone browser file
  const downloadStandalone = () => {
    const htmlString = generateStandaloneHTML();
    const blob = new Blob([htmlString], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Simulador_Curvas_Desdobramento_4G.html";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Raw Tab Delimited clipboard copying for direct return into excel sheets
  const copyResultsToClipboard = () => {
    if (!simulation) return;

    let csv = "Cenário de Desdobramento Mine Sight - Estimado\n\n";
    csv += "ANÁLISE GLOBAL ESTIMADA\n";
    csv += `Massa Total de Ore (t):\t${simulation.finalTotalMass.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
    ELEMENTS.forEach(el => {
      csv += `${el.label} (%):\t${simulation.globalChem[el.id].toLocaleString("pt-BR", { minimumFractionDigits: el.id === "P" ? 3 : 2 })}\n`;
    });

    csv += "\nDESDOBRAMENTO DAS PROPORÇÕES GRANULOMÉTRICAS\n";
    csv += "Fração\tFração Alvo (%)\tMassa Estimada (t)";
    ELEMENTS.forEach(el => {
      csv += `\t${el.label} (%)`;
    });
    csv += "\n";

    PRODUCTS.forEach(p => {
      csv += `${p.name}\t${simulation.ratios[p.id].toFixed(2)}%\t${simulation.productMasses[p.id].toFixed(2)}`;
      ELEMENTS.forEach(el => {
        csv += `\t${simulation.productChem[p.id][el.id].toFixed(el.id === "P" ? 3 : 2)}`;
      });
      csv += "\n";
    });

    csv += "\nCOMPARATIVO QUÍMICA ANALISADA GLOBAL VS. CALCULADA PELAS FRAÇÕES\n";
    csv += "Elemento\tTeor Analisado (%)\tTeor Calculado (%)\tDesvio Absoluto\tStatus\n";
    ELEMENTS.forEach(el => {
      const analyzed = grandTotal?.globalChem[el.id] || rows[0]?.globalChem[el.id] || 0;
      const calculated = baselineGlobal[el.id] || 0;
      const diff = calculated - analyzed;
      const status = getConvergenceStatus(el.id, diff);
      const statusText = status === "excellent" ? "Excelente" : status === "moderate" ? "Moderado" : "Divergente";
      csv += `${el.label}\t${analyzed.toFixed(el.precision)}\t${calculated.toFixed(el.precision)}\t${(diff >= 0 ? "+" : "")}${diff.toFixed(el.precision)}\t${statusText}\n`;
    });

    csv += "\nSIMULAÇÃO DE RECONCILIAÇÃO QUÍMICA ALVO (ITEM 7 - TOLERÂNCIA 5%)\n";
    csv += "Fração\tMassa Reconciliada (t)\tRendimento (%)";
    ELEMENTS.forEach(el => {
      csv += `\t${el.label} Reconciliado (%)`;
    });
    csv += "\n";
    PRODUCTS.forEach(p => {
      csv += `${p.name}\t${simulation.productMasses[p.id].toFixed(2)}\t${simulation.ratios[p.id].toFixed(2)}%`;
      ELEMENTS.forEach(el => {
        const originalGrade = simulation.productChem[p.id][el.id] || 0;
        const analyzedGlobal = grandTotal?.globalChem[el.id] || rows[0]?.globalChem[el.id] || 0;
        const simulatedGlobal = simulation.globalChem[el.id] || 0;
        const factor = simulatedGlobal > 0 ? (analyzedGlobal / simulatedGlobal) : 1;
        const reconciledGrade = originalGrade * factor;
        csv += `\t${reconciledGrade.toFixed(el.id === "P" ? 3 : 2)}`;
      });
      csv += "\n";
    });

    navigator.clipboard.writeText(csv).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    });
  };

  // Helper styles for grain groups
  const getProductColorBorder = (id: string) => {
    if (id === "G1") return "border-l-4 border-blue-500";
    if (id === "G2") return "border-l-4 border-red-500";
    if (id === "G3") return "border-l-4 border-indigo-500";
    return "border-l-4 border-emerald-500";
  };

  const getProductColorBg = (id: string) => {
    if (id === "G1") return "bg-blue-50";
    if (id === "G2") return "bg-red-50";
    if (id === "G3") return "bg-indigo-50";
    return "bg-emerald-50";
  };

  const getProductColorHeader = (id: string) => {
    if (id === "G1") return "bg-blue-600 text-white";
    if (id === "G2") return "bg-red-600 text-white";
    if (id === "G3") return "bg-indigo-600 text-white";
    return "bg-emerald-600 text-white";
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-x-hidden selection:bg-blue-500 selection:text-white">
      {/* Top Banner styled to match the dark Slate header in professional layout */}
      <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 sm:px-6 lg:px-8 shadow-md sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold text-lg text-white shadow-sm">
            M
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-1.5">
            MineSight <span className="text-blue-400">Interpreter</span>{" "}
            <span className="text-slate-400 font-normal text-xs ml-2 hidden sm:inline">
              v2.4 | Wet Concentration Plant (G1-G4 Estendido)
            </span>
          </h1>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => handleLoadData(SAMPLE_PASTE)}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all flex items-center gap-1.5 border border-slate-700 font-medium animate-none"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Resetar Exemplo
          </button>
          <button
            onClick={downloadStandalone}
            className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-all flex items-center gap-2 border border-blue-500/10"
          >
            <Download className="h-4 w-4" />
            Baixar Standalone (.html)
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Left panel / Input controls */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Input card */}
            <div id="data-input-panel" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-900">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                <span className="bg-slate-100 text-slate-700 rounded-full w-5 h-5 inline-flex items-center justify-center text-[10px] font-mono">
                  1
                </span>
                Colagem de Cubagem
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                Cole as linhas do Excel ou use o modelo pré-carregado.
              </p>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Cole as colunas de cubagem aqui..."
                className="w-full h-44 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] font-mono text-slate-800 focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500/50"
              />

              <button
                onClick={() => handleLoadData(rawText)}
                className="w-full mt-3 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <FileSpreadsheet className="h-4 w-4 text-blue-400" />
                Processar Cubagem
              </button>

              {/* Selector for multi rows */}
              {rows.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-2">
                    Frentes de Lavra ({rows.length})
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {rows.map((row, idx) => {
                      const splitSum = (row.splits.G1 || 0) + (row.splits.G2 || 0) + (row.splits.G3 || 0) + (row.splits.G4 || 0);
                      return (
                        <button
                          key={idx}
                          onClick={() => selectRow(idx)}
                          className={`w-full text-left p-2.5 rounded-lg transition-all flex flex-col gap-1.5 border ${
                            idx === selectedRowIndex
                              ? "bg-blue-50 border-blue-200 text-blue-900 font-semibold shadow-sm"
                              : "bg-slate-50 border-slate-100 hover:bg-slate-100/60 text-slate-600"
                          }`}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-slate-800">
                              Frente {row.cut}
                            </span>
                            <span className="font-mono text-slate-700">
                              {row.tonnes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} t
                            </span>
                          </div>
                          
                          {row.material && (
                            <span className="truncate text-slate-500 text-[10px] -mt-1 block">
                              {row.material}
                            </span>
                          )}

                          <div className="flex justify-between items-center w-full mt-1.5 border-t border-slate-100 pt-1.5">
                            {(() => {
                              if (splitSum === 0) {
                                return (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    🔴 Sem Amostras
                                  </span>
                                );
                              } else if (splitSum < 99.8) {
                                return (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    🟡 Incompleta ({splitSum.toFixed(1)}%)
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    🟢 Completa
                                  </span>
                                );
                              }
                            })()}
                            <span className="text-[10px] text-blue-600 font-bold">
                              Fe {row.globalChem.FE.toFixed(2)}%
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Target Production Ore */}
            {scenarioLoaded && (
              <div id="target-ore-panel" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-900">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1.5 font-sans">
                  Meta de Alimentação (t)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={targetOre}
                    onChange={(e) => setTargetOre(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:border-blue-500/50 transition-all font-mono tracking-tight"
                    placeholder="Massa Total"
                    step="0.01"
                  />
                  <div className="absolute right-3 top-3.5 text-xs text-blue-600 font-bold uppercase tracking-wider font-sans pointer-events-none">
                    t ROM
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Esta meta de tonelagem alimentada será distribuída fisicamente proporcionalmente aos splits ajustados.
                </p>
              </div>
            )}
          </div>

          {/* Right panel / Interactive Scenarios */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Scenario panel */}
            <div id="scenario-panel" className={`bg-white border border-slate-200 rounded-2xl p-6 transition-all shadow-sm ${
              !scenarioLoaded ? "opacity-30 pointer-events-none" : ""
            }`}>
              
              {!scenarioLoaded ? (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <Database className="h-10 w-10 text-slate-400 mb-3 animate-bounce" />
                  <h3 className="text-lg font-medium text-slate-500">Nenhum teor carregado</h3>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Cole as colunas de cubagem na esquerda e clique em "Processar" para iniciar.
                  </p>
                </div>
              ) : (
                <>
                  {(() => {
                    // Check if the global scenario has enough data (at least one front with splits)
                    const hasAnySplits = rows.some(r => (r.splits.G1 || 0) + (r.splits.G2 || 0) + (r.splits.G3 || 0) + (r.splits.G4 || 0) > 0);
                    if (!hasAnySplits) return (
                      <div className="py-16 flex flex-col items-center justify-center text-center px-4">
                        <AlertCircle className="h-14 w-14 text-rose-500 mb-4 animate-bounce" />
                        <h3 className="text-xl font-bold text-slate-800">Sem Dados Granuloquímicos</h3>
                        <p className="text-sm text-slate-500 max-w-lg mt-2 leading-relaxed">
                          Nenhuma das frentes carregadas possui análises granulométricas (G1 a G4). Os cálculos não podem ser executados.
                        </p>
                      </div>
                    );
                    return null;
                  })()}
                  {(() => {
                    const hasAnySplits = rows.some(r => (r.splits.G1 || 0) + (r.splits.G2 || 0) + (r.splits.G3 || 0) + (r.splits.G4 || 0) > 0);
                    if (!hasAnySplits) return null;
                    return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-6">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
                          <SlidersHorizontal className="h-4 w-4" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                            2. Ajustes Interativos do Cenário
                            <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs">
                              Cenário Global ({rows.length} frente{rows.length !== 1 ? "s" : ""})
                            </span>
                          </h2>
                          <p className="text-xs text-slate-500 mt-1">
                            Os fatores multiplicadores de extrapolação física e química recalculam as frações instantaneamente.
                          </p>
                        </div>
                      </div>
                    </div>

                  {/* Subsection A: Chemistry controls */}
                  <div className="space-y-4 mb-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        A. Química Global Analisada
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Resultados da química global obtidos a partir das análises da base de dados importada. Esses valores representam a referência química original do cenário, antes dos ajustes e da normalização matemática das frações.
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      {ELEMENTS.map(el => {
                        const originalValue = baselineGlobal[el.id] || 0;
                        const currentValue = editedGlobalChem[el.id] || 0;
                        const hasChanged = Math.abs(currentValue - originalValue) > 0.001;

                        // Calculado Bruto = média ponderada da química das frações
                        // usando os splits originais como pesos (antes de normalizar para 100%)
                        // Fórmula: Σ(split_raw × química_fração) / Σ(split_raw)
                        const totalRawSplit = PRODUCTS.reduce((s, p) => s + (editedSplits[p.id] || 0), 0);
                        const bruteNum = PRODUCTS.reduce((sum, p) => {
                          const pSplitRaw = editedSplits[p.id] || 0;
                          const pChemOrig = baselineProductChem[p.id]?.[el.id] || 0;
                          return sum + (pSplitRaw * pChemOrig);
                        }, 0);
                        const bruteValue = totalRawSplit > 0 ? bruteNum / totalRawSplit : 0;

                        return (
                          <div
                            key={el.id}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:bg-slate-100/40 transition-all shadow-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-600">{el.label}</span>
                              {hasChanged && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" title="Valor alterado pelo cenário" />
                              )}
                            </div>
                            <div className="my-2 text-center">
                              <input
                                type="number"
                                value={currentValue === 0 ? "" : currentValue}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditedGlobalChem(prev => ({ ...prev, [el.id]: val }));
                                }}
                                className="w-full text-center text-lg font-bold text-blue-700 bg-transparent focus:outline-none focus:ring-0"
                                step={el.precision === 3 ? "0.001" : "0.01"}
                              />
                            </div>
                            <div className="text-[9px] text-left text-slate-500 border-t border-slate-200/80 pt-1.5 space-y-1">
                              <div className="flex justify-between">
                                <span>Analisado (Base):</span>
                                <span className="font-mono text-slate-600 font-semibold">
                                  {originalValue.toFixed(el.precision)}%
                                </span>
                              </div>
                              <div className="flex justify-between" title="Média ponderada da química das frações pelos splits originais calculados, antes da normalização para 100%">
                                <span>Calculado Bruto:</span>
                                <span className="font-mono text-slate-400">
                                  {bruteValue.toFixed(el.precision)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subsection B: Splits */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        B. Distribuição Física (Split %)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Insira os percentuais por granulometria
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {PRODUCTS.map(p => {
                        // Compare current edited split vs. the global weighted baseline
                        const originalSplit = baselineGlobal[p.id] !== undefined
                          ? editedSplits[p.id]  // show hasChanged relative to baseline stored at load
                          : 0;
                        // Actually: track change vs the baseline set by buildGlobalScenario
                        // We'll use a derived value from baselineProductChem implicitly;
                        // for the "Inicial" label use the value stored in editedSplits when scenario loaded.
                        // Simplest: just show the current value, mark changed if differs from the
                        // per-product weighted average that was set at load time.
                        // We store that in a separate ref-like approach — but for now just use
                        // the editedSplits value itself (user edits will show as changed naturally).
                        const baselineSplitForProduct = (() => {
                          // Re-compute from all rows to show as "Inicial"
                          const totalMass = grandTotal ? grandTotal.tonnes : rows.reduce((s, r) => s + r.tonnes, 0);
                          const w = rows.reduce((sum, r) => sum + r.tonnes * (r.splits[p.id] || 0), 0);
                          return totalMass > 0 ? w / totalMass : 0;
                        })();
                        const currentSplit = editedSplits[p.id] || 0;
                        const hasChanged = Math.abs(currentSplit - baselineSplitForProduct) > 0.01;

                        return (
                          <div
                            key={p.id}
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between hover:bg-slate-100/40 transition-all shadow-sm"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="text-xs font-bold text-slate-700 block">
                                  {p.name}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {p.size}
                                </span>
                              </div>
                              {hasChanged && (
                                <span className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 font-semibold shadow-xs">
                                  mod
                                </span>
                              )}
                            </div>

                            <div className="relative mb-2">
                              <input
                                type="number"
                                value={currentSplit === 0 ? "" : currentSplit}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setEditedSplits(prev => ({ ...prev, [p.id]: val }));
                                }}
                                className="w-full text-center text-lg font-bold text-slate-800 bg-white border border-slate-200 rounded-lg py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50"
                                step="0.1"
                              />
                              <div className="absolute right-2 top-2.5 text-[10px] text-slate-400">
                                %
                              </div>
                            </div>

                            <div className="text-[9px] text-slate-500 flex justify-between items-center text-left border-t border-slate-200/60 pt-1.5">
                              <span>Inicial:</span>
                              <span className="font-mono text-slate-600">{baselineSplitForProduct.toFixed(2)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Split totalizer bar */}
                    {simulation && (
                      <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {Math.abs(simulation.splitSum - 100) < 0.2 ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                          )}
                          <div>
                            <span className="text-xs font-medium text-slate-700">
                              Soma dos Splits Alvos:{" "}
                              <strong className="text-slate-900 text-sm font-mono font-bold">
                                {simulation.splitSum.toFixed(2)}%
                              </strong>
                            </span>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {Math.abs(simulation.splitSum - 100) < 0.2
                                ? "Excelente! A distribuição soma 100% perfeitamente."
                                : "Atenção: Os splits não somam 100%. O sistema fará a normalização matemática proporcional automaticamente para os cálculos."}
                            </p>
                          </div>
                        </div>

                        {/* Reset button to baseline splits */}
                        <button
                          onClick={() => {
                            // Restore global baseline splits and chemistry
                            buildGlobalScenario(rows, grandTotal);
                          }}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-[11px] font-bold text-slate-700 rounded-lg transition-all flex items-center gap-1.5 shrink-0 border border-slate-300 shadow-sm"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Restaurar Ajustes Alvo
                        </button>
                      </div>
                    )}
                  </div>
                </>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Simulated Case Results */}
            {simulation && (() => {
              // Guard: need at least one front with splits to show results
              const hasAnySplits = rows.some(r => (r.splits.G1 || 0) + (r.splits.G2 || 0) + (r.splits.G3 || 0) + (r.splits.G4 || 0) > 0);
              if (!hasAnySplits) return null;
              return (
                <div id="results-panel" className="space-y-8 animate-fade-in">
                
                {/* 3. Global Results Card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-900">
                  <div className="border-b border-slate-100 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-800">
                          3. Análise Global Estimada do Processamento
                        </h2>
                        <span className="text-xs text-slate-500">
                          Química global calculada a partir do balanço de massas das frações, considerando a normalização das frações para que sua soma totalize 100%.
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={copyResultsToClipboard}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2 border border-emerald-750 shrink-0 self-start shadow-sm"
                    >
                      <Copy className="h-4 w-4" />
                      {copySuccess ? "Copiado!" : "Copiar Resultados (Excel)"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
                    {/* Elements values table */}
                    <div className="md:col-span-3">
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
                              <th className="px-4 py-3 text-left">Variável / Elemento</th>
                              <th className="px-4 py-3 text-right">Teor / Massa Simulado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            <tr className="hover:bg-slate-50/50">
                              <td className="px-4 py-3.5 font-bold text-slate-700">
                                Massa Total Calculada (t)
                              </td>
                              <td className="px-4 py-3.5 text-right font-bold text-slate-900 font-mono text-sm">
                                {simulation.finalTotalMass.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </td>
                            </tr>
                            {ELEMENTS.map(el => (
                              <tr key={el.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 text-slate-600 font-medium">
                                  {el.label} (%)
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-blue-700 font-mono">
                                  {simulation.globalChem[el.id].toLocaleString("pt-BR", {
                                    minimumFractionDigits: el.precision,
                                    maximumFractionDigits: el.precision
                                  })}
                                  %
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Pure SVG donut mass chart representation */}
                    <div className="md:col-span-2 border border-slate-200 rounded-xl p-5 bg-slate-50/50 flex flex-col items-center justify-between h-full shadow-xs">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center mb-4">
                        Distribuição Física Esperada
                      </h4>
                      
                      <div className="w-40 h-40 relative flex items-center justify-center">
                        {/* Build a neat responsive SVG Donut */}
                        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-95">
                          {(() => {
                            let accumulatedPercent = 0;
                            return PRODUCTS.map(p => {
                              const ratio = simulation.ratios[p.id] || 0;
                              if (ratio === 0) return null;
                              
                              const strokeDashArray = `${ratio} ${100 - ratio}`;
                              const strokeDashOffset = -accumulatedPercent;
                              accumulatedPercent += ratio;

                              return (
                                <circle
                                  key={p.id}
                                  cx="50"
                                  cy="50"
                                  r="38"
                                  fill="transparent"
                                  stroke={p.color}
                                  strokeWidth="11"
                                  strokeDasharray={strokeDashArray}
                                  strokeDashoffset={strokeDashOffset}
                                  pathLength="100"
                                  className="transition-all duration-500 hover:stroke-[13] cursor-pointer"
                                  data-tip={`${p.name}: ${ratio.toFixed(1)}%`}
                                />
                              );
                            });
                          })()}
                          <circle cx="50" cy="50" r="28" fill="#ffffff" className="shadow-xs" />
                        </svg>

                        <div className="absolute text-center bg-transparent">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest block">
                            Total ROM
                          </span>
                          <span className="text-xs font-bold text-slate-900 font-mono">
                            {simulation.finalTotalMass > 1000
                              ? `${(simulation.finalTotalMass / 1000).toFixed(1)} kt`
                              : `${simulation.finalTotalMass.toFixed(0)} t`}
                          </span>
                        </div>
                      </div>

                      {/* Legends */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-5 w-full text-[10px]">
                        {PRODUCTS.map(p => (
                          <div key={p.id} className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="text-slate-500 truncate">{p.name}:</span>
                            <span className="font-bold text-slate-800 font-mono shrink-0 ml-auto">
                              {(simulation.ratios[p.id] || 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Products Result Grid */}
                <div>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    4. Frações Resultantes do Desdobramento Estendido
                  </h2>
                  
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
                          <th className="px-4 py-3 text-left">Fração</th>
                          <th className="px-4 py-3 text-right">Original</th>
                          <th className="px-4 py-3 text-right">Normalizada</th>
                          <th className="px-4 py-3 text-right">Diferença</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {PRODUCTS.map(p => {
                          const original = editedSplits[p.id] || 0;
                          const normalized = simulation.ratios[p.id] || 0;
                          const diff = normalized - original;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-bold text-slate-700 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                {p.name}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {original.toFixed(3)}%
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                                {normalized.toFixed(3)}%
                              </td>
                              <td className={`px-4 py-3 text-right font-mono font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(3)} p.p.
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50">
                          <td className="px-4 py-3 font-bold text-slate-900 uppercase">Total</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            {PRODUCTS.reduce((s, p) => s + (editedSplits[p.id] || 0), 0).toFixed(3)}%
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                            100.000%
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-500">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 5. Perfis Químicos por Fração */}
                <div>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    5. Perfis Químicos por Fração
                  </h2>
                  <p className="text-xs text-slate-500 mb-4 ml-3.5">
                    Teor químico de cada fração granulométrica após os ajustes do cenário. A química das frações não se altera com a normalização dos splits — apenas os pesos mudam.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {ELEMENTS.map(el => (
                      <div
                        key={el.id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-900"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold text-slate-700">{el.label} (%)</span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100/60 text-slate-500 uppercase tracking-wider text-[9px] font-semibold border-b border-slate-200">
                                <th className="px-3 py-2 text-left">Fração</th>
                                <th className="px-3 py-2 text-right">Teor (%)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {PRODUCTS.map(p => {
                                const teor = simulation.productChem[p.id]?.[el.id] || 0;
                                return (
                                  <tr key={p.id} className="hover:bg-slate-100/40">
                                    <td className="px-3 py-2 font-bold text-slate-700 flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                      {p.id}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                                      {teor.toFixed(el.precision)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 6. Comparison Table: Analyzed vs Calculated Global */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-slate-900">
                  <div className="border-b border-slate-100 pb-4 mb-5 flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800">
                        6. Comparativo Química Analisada Global vs. Calculada pelas Frações
                      </h2>
                      <span className="text-xs text-slate-500">
                        Divergência atual entre os ensaios globais do banco e a média ponderada física e química das frações
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
                          <th className="px-4 py-3 text-left">Elemento</th>
                          <th className="px-4 py-3 text-right">Global Analisado (Banco)</th>
                          <th className="px-4 py-3 text-right">Global Calculado (Frações)</th>
                          <th className="px-4 py-3 text-right">Desvio Absoluto (Δ)</th>
                          <th className="px-4 py-3 text-center">Status de Convergência</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ELEMENTS.map(el => {
                          const analyzed = baselineGlobal[el.id] || 0;
                          const calculated = simulation.globalChem[el.id] || 0;
                          const diff = calculated - analyzed;
                          
                          // Convert status logic to relative desvio %
                          const desvioPct = analyzed > 0 ? (diff / analyzed) * 100 : 0;
                          const isHighDiff = Math.abs(desvioPct) > 5;
                          
                          let badgeClass = isHighDiff ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
                          let badgeText = isHighDiff ? "Divergente (>5%)" : "Excelente (≤5%)";

                          return (
                            <tr key={el.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 font-bold text-slate-700">{el.label}</td>
                              <td className="px-4 py-3 text-right font-mono text-slate-600">
                                {analyzed.toLocaleString("pt-BR", { minimumFractionDigits: el.precision, maximumFractionDigits: el.precision })}%
                              </td>
                              <td className="px-4 py-3 text-right font-bold font-mono text-blue-700">
                                {calculated.toLocaleString("pt-BR", { minimumFractionDigits: el.precision, maximumFractionDigits: el.precision })}%
                              </td>
                              <td className={`px-4 py-3 text-right font-mono font-bold ${diff > 0 ? "text-blue-600" : diff < 0 ? "text-red-600" : "text-slate-600"}`}>
                                {diff >= 0 ? "+" : ""}{diff.toLocaleString("pt-BR", { minimumFractionDigits: el.precision, maximumFractionDigits: el.precision })} p.p.
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-xs ${badgeClass}`}>
                                  {badgeText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-4 p-3.5 bg-blue-50/50 border border-blue-150 rounded-xl flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                      <strong>Nota de Engenharia Processual:</strong> A química analisada global é o valor real contido na cubagem. A calculada é deduzida via ponderação de massa das frações de G1 a G4. Divergências ocorrem devido ao banco ainda possuir apenas poucas análises de frações granulométricas. À medida que mais amostras forem ensaiadas em G1-G4, os dois valores convergirão para um resultado único (Desvio tende a zero).
                    </p>
                  </div>
                </div>

                {/* 7. Reconciled Products Grid */}
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center gap-2">
                    <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600 border border-purple-100">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800">
                        7. Simulação de Reconciliação Química Alvo (Tolerância 5%)
                      </h2>
                      <span className="text-xs text-slate-500">
                        Química recalculada das frações (G1-G4) para forçar convergência exata com a química global analisada do banco de dados
                      </span>
                    </div>
                  </div>

                  {/* Summary of Reconciliation Factors */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                      Fatores de Ajuste Necessários para Reconciliação
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      {ELEMENTS.map(el => {
                        const analyzed = grandTotal?.globalChem[el.id] || rows[0]?.globalChem[el.id] || 0;
                        const simulated = simulation.globalChem[el.id] || 0;
                        const factor = simulated > 0 ? (analyzed / simulated) : 1;
                        const pctChange = (factor - 1) * 100;
                        const isHigh = Math.abs(pctChange) > 5;

                        return (
                          <div
                            key={el.id}
                            className={`border rounded-xl p-3 flex flex-col justify-between transition-all ${
                              isHigh 
                                ? "bg-rose-50/50 border-rose-200 text-rose-900 animate-pulse" 
                                : "bg-white border-slate-200 text-slate-900"
                            }`}
                          >
                            <span className="text-xs font-bold">{el.label}</span>
                            <span className="text-base font-bold font-mono my-1.5">
                              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded text-center font-bold border ${
                              isHigh 
                                ? "bg-rose-100 text-rose-700 border-rose-300" 
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                              {isHigh ? "Ajuste Alto (>5%)" : "Adequado (≤5%)"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {PRODUCTS.map(p => {
                      const mass = simulation.productMasses[p.id] || 0;
                      const yieldPct = simulation.ratios[p.id] || 0;
                      const pChem = simulation.productChem[p.id] || {};

                      return (
                        <div
                          key={p.id}
                          className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-purple-300 hover:shadow-xs transition-all flex flex-col justify-between shadow-sm"
                        >
                          <div className="px-4 py-3 flex items-center justify-between bg-purple-50/30 border-b border-purple-100">
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                {p.name}
                              </h3>
                              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                                Granulometria Reconciliada
                              </span>
                            </div>
                            <span className="text-[11px] font-bold py-0.5 px-2 bg-white border border-purple-200 text-purple-700 rounded font-mono shadow-xs">
                              {p.id}
                            </span>
                          </div>

                          <div className="px-4 py-3.5 bg-slate-50/50 font-sans space-y-1 border-b border-slate-100">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500 font-medium">Massa Reconciliada:</span>
                              <span className="text-xs font-bold font-mono" style={{ color: p.color }}>
                                {mass.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500 font-medium">Fração de Rendimento:</span>
                              <span className="text-xs font-bold text-slate-700 font-mono">
                                {yieldPct.toFixed(2)}%
                              </span>
                            </div>
                          </div>

                          <div className="p-4 bg-white space-y-2">
                            {ELEMENTS.map(el => {
                              const originalGrade = pChem[el.id] || 0;
                              const analyzedGlobal = grandTotal?.globalChem[el.id] || rows[0]?.globalChem[el.id] || 0;
                              const simulatedGlobal = simulation.globalChem[el.id] || 0;
                              const factor = simulatedGlobal > 0 ? (analyzedGlobal / simulatedGlobal) : 1;
                              const reconciledGrade = originalGrade * factor;
                              
                              return (
                                <div key={el.id} className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500 font-medium">{el.label}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-slate-400 line-through font-mono">
                                      {originalGrade.toFixed(el.precision)}%
                                    </span>
                                    <ChevronRight className="h-3 w-3 text-slate-400" />
                                    <span className="font-bold text-purple-700 font-mono">
                                      {reconciledGrade.toLocaleString("pt-BR", {
                                        minimumFractionDigits: el.precision,
                                        maximumFractionDigits: el.precision
                                      })}
                                      %
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )})()}

            {/* Step 8: Plant Premises */}
            {rows.length > 0 && (
              <div id="plant-premises-panel" className="bg-white border border-slate-200 rounded-2xl p-6 transition-all shadow-sm">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <span className="bg-slate-100 text-slate-700 rounded-full w-6 h-6 inline-flex items-center justify-center text-xs font-mono">
                    8
                  </span>
                  Premissas da Planta (Metas)
                </h2>
                <p className="text-xs text-slate-500 mb-6">
                  Defina os targets químicos e granulométricos da usina. Eles serão usados para sugerir o blend ótimo.
                </p>

                {/* Tolerância */}
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1">
                    <span className="text-xs font-bold text-amber-800">Tolerância Operacional (%)</span>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Tolerância relativa aplicada à avaliação do Blend, à Carta de Controle e ao Otimizador.
                      Para G1 e G4 (minimizar): aplica-se apenas o limite superior. Para G2 e G3 (faixa operacional): aplica-se o intervalo ±Tolerância.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      value={blendTolerance}
                      onChange={(e) => setBlendTolerance(Math.max(0.1, Math.min(50, parseFloat(e.target.value) || 5)))}
                      className="w-24 bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-sm font-mono font-bold text-amber-900 text-center focus:border-amber-500"
                      step="0.5"
                      min="0.1"
                      max="50"
                    />
                    <span className="text-sm font-bold text-amber-700">%</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">
                      Qualidade Química
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {ELEMENTS.map(el => (
                        <div key={el.id} className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">{el.label}</label>
                          <input
                            type="number"
                            value={premises.globalChem[el.id] || 0}
                            onChange={(e) => setPremises({
                              ...premises,
                              globalChem: { ...premises.globalChem, [el.id]: parseFloat(e.target.value) || 0 }
                            })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono focus:border-blue-500/50"
                            step="0.01"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">
                      Distribuição Granulométrica
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {PRODUCTS.map(p => {
                        const isMinimize = p.id === 'G1' || p.id === 'G4';
                        const isMaximize = p.id === 'G2' || p.id === 'G3';
                        return (
                          <div key={p.id} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">{p.name}</label>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isMinimize ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                {isMinimize ? '↓ Minimizar' : '↑ Maximizar'}
                              </span>
                            </div>
                            <input
                              type="number"
                              value={premises.splits[p.id] || 0}
                              onChange={(e) => setPremises({
                                ...premises,
                                splits: { ...premises.splits, [p.id]: parseFloat(e.target.value) || 0 }
                              })}
                              className={`w-full bg-slate-50 border rounded-lg px-2 py-1.5 text-xs font-mono focus:border-blue-500/50 ${isMinimize ? 'border-rose-200' : 'border-emerald-200'}`}
                              step="0.1"
                            />
                            <p className="text-[9px] text-slate-400">
                              {isMinimize
                                ? `Limite máx: ${((premises.splits[p.id] || 0) * (1 + blendTolerance/100)).toFixed(2)}%`
                                : `Faixa: ${((premises.splits[p.id] || 0) * (1 - blendTolerance/100)).toFixed(2)}% – ${((premises.splits[p.id] || 0) * (1 + blendTolerance/100)).toFixed(2)}%`
                              }
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-center">
                  <button
                    onClick={() => setPremises(DEFAULT_PLANT_PREMISES)}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    Restaurar Premissas da Planta
                  </button>
                  <button
                    onClick={runOptimization}
                    disabled={isOptimizing}
                    className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    {isOptimizing ? "Otimizando..." : "Gerar Sugestões de Blend"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 9: Blend Suggestion */}
            {blendAlternatives.length > 0 && (
              <div id="blend-suggestion-panel" className="bg-white border border-slate-200 rounded-2xl p-6 transition-all shadow-sm">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <span className="bg-emerald-100 text-emerald-700 rounded-full w-6 h-6 inline-flex items-center justify-center text-xs font-mono">
                    9
                  </span>
                  Sugestão Automática de Blend
                </h2>
                <p className="text-xs text-slate-500 mb-6">
                  As melhores alternativas de blend (mix inteiro) encontradas pela heurística para atender às metas.
                </p>

                <div className="space-y-6">
                  {blendAlternatives.map((alt, altIdx) => (
                    <div key={altIdx} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold ${altIdx === 0 ? "text-amber-600 bg-amber-100" : "text-slate-600 bg-slate-200"} px-2 py-1 rounded`}>
                            {altIdx === 0 ? "🏆 Top 1 (Recomendado)" : `Top ${altIdx + 1} Alternativa`}
                          </span>
                        </div>
                        <div className="flex-1">
                          {(() => {
                            const tol = blendTolerance / 100;
                            const chemElements = ELEMENTS.filter(e => premises.globalChem[e.id] > 0);
                            let chemPass = 0;
                            const chemDetails = chemElements.map(el => {
                              const result = alt.blendGlobalChem[el.id] || 0;
                              const target = premises.globalChem[el.id] || 0;
                              const desvioPct = target > 0 ? (result / target - 1) * 100 : 0;
                              // Chemistry always uses symmetric ±tol
                              const passed = Math.abs(desvioPct) <= blendTolerance + 0.001;
                              if (passed) chemPass++;
                              return {
                                type: 'chem', id: el.id, label: el.label, result, target, desvioPct, passed,
                                min: target * (1 - tol), max: target * (1 + tol), precision: el.precision,
                                isMinimize: false
                              };
                            });

                            const splitProducts = PRODUCTS.filter(p => premises.splits[p.id] > 0);
                            let splitPass = 0;
                            const splitDetails = splitProducts.map(p => {
                              const result = alt.blendSplits[p.id] || 0;
                              const target = premises.splits[p.id] || 0;
                              const desvioPct = target > 0 ? (result / target - 1) * 100 : 0;
                              const isMinimize = p.id === 'G1' || p.id === 'G4';
                              // G1/G4: pass if result <= target*(1+tol) (minimize — lower is better)
                              // G2/G3: pass if within [target*(1-tol), target*(1+tol)]
                              const passed = isMinimize
                                ? result <= target * (1 + tol) + 0.001
                                : Math.abs(desvioPct) <= blendTolerance + 0.001;
                              if (passed) splitPass++;
                              return {
                                type: 'split', id: p.id, label: p.name, result, target, desvioPct, passed,
                                min: isMinimize ? null : target * (1 - tol),
                                max: target * (1 + tol), precision: 2, isMinimize
                              };
                            });

                            const isViable = Object.values(alt.allocations).some(v => v > 0);
                            const totalCrit = chemElements.length + splitProducts.length;
                            const totalPass = chemPass + splitPass;
                            const chemKPI = chemElements.length > 0 ? (chemPass / chemElements.length) * 100 : 0;
                            const splitKPI = splitProducts.length > 0 ? (splitPass / splitProducts.length) * 100 : 0;
                            const geralKPI = totalCrit > 0 ? (totalPass / totalCrit) * 100 : 0;
                            const atende = totalPass === totalCrit && isViable;

                            // Failed items for detail list
                            const failedSplits = splitDetails.filter(r => !r.passed);
                            const failedChem = chemDetails.filter(r => !r.passed);

                            // Normalized splits for column
                            const splitNormTotal = PRODUCTS.reduce((s, p) => s + (premises.splits[p.id] || 0), 0);

                            return (
                              <div className="flex flex-col w-full">
                                {/* Top KPIs */}
                                <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50">
                                  <div className="p-3 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Química</span>
                                    <span className="text-lg font-bold text-blue-700">{chemKPI.toFixed(0)}%</span>
                                    <span className="text-[10px] text-slate-500">{chemPass}/{chemElements.length} atendidos</span>
                                  </div>
                                  <div className="p-3 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Granulo</span>
                                    <span className="text-lg font-bold text-purple-700">{splitKPI.toFixed(0)}%</span>
                                    <span className="text-[10px] text-slate-500">{splitPass}/{splitProducts.length} atendidos</span>
                                  </div>
                                  <div className="p-3 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Viabilidade</span>
                                    <span className={`text-lg font-bold ${isViable ? "text-emerald-600" : "text-rose-600"}`}>
                                      {isViable ? "100%" : "0%"}
                                    </span>
                                    <span className="text-[10px] text-slate-500">{isViable ? "VIÁVEL" : "NÃO VIÁVEL"}</span>
                                  </div>
                                  <div className="p-3 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Geral</span>
                                    <span className="text-lg font-bold text-slate-800">{geralKPI.toFixed(0)}%</span>
                                    <span className="text-[10px] text-slate-500">{totalPass}/{totalCrit} critérios atendidos</span>
                                  </div>
                                </div>

                                {/* Status Banner */}
                                <div className={`p-3 border-b border-slate-200 ${atende ? "bg-emerald-100/50" : "bg-rose-100/50"}`}>
                                  <h3 className={`text-sm font-black tracking-wide text-center ${atende ? "text-emerald-700" : "text-rose-700"}`}>
                                    {atende ? "✓ BLEND ATENDE À ESPECIFICAÇÃO" : "✕ BLEND NÃO ATENDE À ESPECIFICAÇÃO"}
                                  </h3>
                                  {!atende && (
                                    <div className="mt-1.5 flex flex-wrap gap-1 justify-center">
                                      {failedSplits.length > 0 && (
                                        <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                                          Granulo fora: {failedSplits.map(r => r.id).join(', ')}
                                        </span>
                                      )}
                                      {failedChem.length > 0 && (
                                        <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                                          Química fora: {failedChem.map(r => r.label).join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Main Content Layout */}
                                <div className="flex flex-col lg:flex-row p-4 gap-6">

                                  {/* Left: Composição + Justificativa */}
                                  <div className="lg:w-1/4 space-y-4">
                                    <div>
                                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3">Composição do Blend</h4>
                                      <div className="space-y-2">
                                        {rows.map((r, rIdx) => {
                                          const alloc = alt.allocations[rIdx] || 0;
                                          if (alloc === 0) return null;
                                          return (
                                            <div key={rIdx} className="flex justify-between items-center text-xs">
                                              <span className="font-semibold text-slate-700">Frente {r.cut}</span>
                                              <span className="font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 shadow-xs">{alloc}%</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    <div className="pt-3 border-t border-slate-100">
                                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Justificativa</h4>
                                      <ul className="text-[10px] text-slate-600 space-y-1 list-disc pl-3">
                                        {alt.justifications.map((just, jIdx) => (
                                          <li key={jIdx}>{just}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>

                                  {/* Right: Carta de Controle */}
                                  <div className="lg:w-3/4 space-y-4">

                                    {/* Granulometria */}
                                    <div>
                                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                                        Granulometria — Original → Especificação → Blend
                                        <span className="ml-2 font-normal text-amber-600">(Tol. {blendTolerance.toFixed(1)}%)</span>
                                      </h4>
                                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                              <th className="px-3 py-2 text-left">Fração</th>
                                              <th className="px-3 py-2 text-center text-slate-400">Tipo</th>
                                              <th className="px-3 py-2 text-right">Original</th>
                                              <th className="px-3 py-2 text-right">Espec. Norm.</th>
                                              <th className="px-3 py-2 text-right text-rose-500/80">Limite Inferior</th>
                                              <th className="px-3 py-2 text-right font-bold text-blue-700">Blend</th>
                                              <th className="px-3 py-2 text-right text-rose-500/80">Limite Superior</th>
                                              <th className="px-3 py-2 text-center">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {splitDetails.map((row, i) => {
                                              const origSplit = editedSplits[row.id] || 0;
                                              const normSplit = splitNormTotal > 0 ? (premises.splits[row.id] || 0) : (premises.splits[row.id] || 0);
                                              return (
                                                <tr key={i} className="hover:bg-slate-50/50">
                                                  <td className="px-3 py-2 font-bold text-slate-700">{row.label}</td>
                                                  <td className="px-3 py-2 text-center">
                                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${row.isMinimize ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                                      {row.isMinimize ? '↓ Min' : '↑ Max'}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-400">{origSplit.toFixed(3)}%</td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-600">{row.target.toFixed(3)}%</td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-400">
                                                    {row.isMinimize ? '—' : `${(row.min!).toFixed(3)}%`}
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 bg-blue-50/30">
                                                    {row.result.toFixed(3)}%
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-400">{row.max.toFixed(3)}%</td>
                                                  <td className="px-3 py-2 text-center">
                                                    {row.passed ? (
                                                      <span className="inline-flex text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 text-[10px] font-black">✓</span>
                                                    ) : (
                                                      <span className="inline-flex text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 text-[10px] font-black">✕</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* Química */}
                                    <div>
                                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                                        Química — Analisada → Calculada Normalizada → Blend
                                      </h4>
                                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                              <th className="px-3 py-2 text-left">Elemento</th>
                                              <th className="px-3 py-2 text-right text-slate-400">Analisada</th>
                                              <th className="px-3 py-2 text-right">Calc. Norm.</th>
                                              <th className="px-3 py-2 text-right text-rose-500/80">Limite −{blendTolerance.toFixed(0)}%</th>
                                              <th className="px-3 py-2 text-right font-bold text-blue-700">Blend</th>
                                              <th className="px-3 py-2 text-right text-emerald-600/80">Limite +{blendTolerance.toFixed(0)}%</th>
                                              <th className="px-3 py-2 text-right">Desvio</th>
                                              <th className="px-3 py-2 text-center">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {chemDetails.map((row, i) => {
                                              const analisada = baselineGlobal[row.id] || 0;
                                              const calcNorm = simulation?.globalChem[row.id] || 0;
                                              return (
                                                <tr key={i} className="hover:bg-slate-50/50">
                                                  <td className="px-3 py-2 font-bold text-slate-700">{row.label}</td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-400">{analisada.toFixed(row.precision)}%</td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-600">{calcNorm.toFixed(row.precision)}%</td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-400">{row.min.toFixed(row.precision)}%</td>
                                                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 bg-blue-50/30">{row.result.toFixed(row.precision)}%</td>
                                                  <td className="px-3 py-2 text-right font-mono text-slate-400">{row.max.toFixed(row.precision)}%</td>
                                                  <td className={`px-3 py-2 text-right font-mono font-bold ${row.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {row.desvioPct > 0 ? '+' : ''}{row.desvioPct.toFixed(2)}%
                                                  </td>
                                                  <td className="px-3 py-2 text-center">
                                                    {row.passed ? (
                                                      <span className="inline-flex text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 text-[10px] font-black">✓</span>
                                                    ) : (
                                                      <span className="inline-flex text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 text-[10px] font-black">✕</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
          
        </div>
      </main>

      {/* Footer styled matching the theme's aesthetic */}
      <footer className="h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between text-[10px] text-slate-500 shrink-0 mt-12 shadow-sm">
        <div className="flex gap-4">
          <span>System Status: <strong className="text-emerald-600 font-semibold">OK</strong></span>
          <span>Database: <strong className="text-slate-700">MineSight Production</strong></span>
        </div>
        <div>Precision Engineering & Mineral Processing Dashboard</div>
      </footer>
    </div>
  );
}
