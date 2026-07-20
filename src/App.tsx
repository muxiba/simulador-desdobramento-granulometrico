import React, { useState, useEffect } from "react";
import { PRODUCTS, ELEMENTS, parsePastedData, generateStandaloneHTML } from "./utils";
import { MiningRow } from "./types";
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

export default function App() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<MiningRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(-1);
  const [targetOre, setTargetOre] = useState<number>(0);
  
  // Scenarios state
  const [editedGlobalChem, setEditedGlobalChem] = useState<Record<string, number>>({});
  const [editedSplits, setEditedSplits] = useState<Record<string, number>>({});
  
  // Baseline loaded data to calculate scaling factors
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

  // Load spreadsheet paste
  const handleLoadData = (textToParse: string) => {
    const parsed = parsePastedData(textToParse);
    if (parsed.length === 0) {
      alert("Nenhum dado legível pôde ser interpretado. Certifique-se de copiar os cabeçalhos 'Cut', 'Material', 'Tonnes' e 'G1' conforme o template.");
      return;
    }
    setRows(parsed);
    selectRow(parsed, 0);
  };

  const selectRow = (currentRows: MiningRow[], index: number) => {
    setSelectedRowIndex(index);
    const row = currentRows[index];
    setTargetOre(row.tonnes);

    // Initial chemistry mapping & calculating global averages by mass-yield weighting
    let accumMass = 0;
    const accumChem: Record<string, number> = {};
    ELEMENTS.forEach(el => {
      accumChem[el.id] = 0;
    });

    const splitsMap: Record<string, number> = {};
    const productChemMap: Record<string, Record<string, number>> = {};

    PRODUCTS.forEach(prod => {
      const splitPct = row.splits[prod.id] || 0;
      splitsMap[prod.id] = splitPct;

      const pMass = row.tonnes * (splitPct / 100);
      accumMass += pMass;

      productChemMap[prod.id] = { ...row.productChem[prod.id] };

      ELEMENTS.forEach(el => {
        const gradeValue = row.productChem[prod.id][el.id] || 0;
        accumChem[el.id] += gradeValue * pMass;
      });
    });

    // Compute baseline global averages from mass-yield weightings
    const baselineGlobalComputed: Record<string, number> = {};
    ELEMENTS.forEach(el => {
      baselineGlobalComputed[el.id] = accumMass > 0 ? accumChem[el.id] / accumMass : 0;
    });

    setBaselineGlobal(baselineGlobalComputed);
    setEditedGlobalChem(baselineGlobalComputed);
    setEditedSplits(splitsMap);
    setBaselineProductChem(productChemMap);
  };

  // Run the process simulation math
  const runSimulation = () => {
    if (selectedRowIndex === -1 || rows.length === 0) return;

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

  // Automatically simulate when inputs (targetOre, editedGlobalChem, editedSplits) change to make it feel amazing
  useEffect(() => {
    if (selectedRowIndex !== -1 && rows.length > 0) {
      runSimulation();
    }
  }, [selectedRowIndex, targetOre, editedGlobalChem, editedSplits]);

  // Load sample content on component mount
  useEffect(() => {
    setRawText(SAMPLE_PASTE);
    const parsed = parsePastedData(SAMPLE_PASTE);
    setRows(parsed);
    if (parsed.length > 0) {
      // Defer to prevent effect loop
      setTimeout(() => {
        selectRow(parsed, 0);
      }, 50);
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
      const analyzed = rows[selectedRowIndex]?.globalChem[el.id] || 0;
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
        const analyzedGlobal = rows[selectedRowIndex]?.globalChem[el.id] || 0;
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
                    Cortes Identificados ({rows.length})
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {rows.map((row, idx) => {
                      const splitSum = (row.splits.G1 || 0) + (row.splits.G2 || 0) + (row.splits.G3 || 0) + (row.splits.G4 || 0);
                      return (
                        <button
                          key={idx}
                          onClick={() => selectRow(rows, idx)}
                          className={`w-full text-left p-2.5 rounded-lg transition-all flex flex-col gap-1.5 border ${
                            idx === selectedRowIndex
                              ? "bg-blue-50 border-blue-200 text-blue-900 font-semibold shadow-sm"
                              : "bg-slate-50 border-slate-100 hover:bg-slate-100/60 text-slate-600"
                          }`}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-slate-800">
                              Corte {row.cut}
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
            {selectedRowIndex !== -1 && (
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
              selectedRowIndex === -1 ? "opacity-30 pointer-events-none" : ""
            }`}>
              
              {selectedRowIndex === -1 ? (
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
                    const selectedRow = rows[selectedRowIndex];
                    const splitSum = (selectedRow?.splits.G1 || 0) + (selectedRow?.splits.G2 || 0) + (selectedRow?.splits.G3 || 0) + (selectedRow?.splits.G4 || 0);
                    if (splitSum === 0) return (
                      <div className="py-16 flex flex-col items-center justify-center text-center px-4">
                        <AlertCircle className="h-14 w-14 text-rose-500 mb-4 animate-bounce" />
                        <h3 className="text-xl font-bold text-slate-800">Setor Sem Dados Granuloquímicos</h3>
                        <p className="text-sm text-slate-500 max-w-lg mt-2 leading-relaxed">
                          Não existem análises granulométricas (frações G1 a G4) cadastradas no banco para o <strong>Corte {selectedRow?.cut}</strong>. 
                          Os cálculos de desdobramento, balanço de massas e reconciliação química não podem ser executados para este setor.
                        </p>
                        <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl max-w-md text-left flex gap-2.5">
                          <Sparkles className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-rose-800 leading-relaxed">
                            <strong>Recomendação Geológica:</strong> Solicite à equipe de laboratório/geologia a realização de ensaios de granuloquímica (desdobramento em G1, G2, G3 e G4) para as amostras deste setor de lavra.
                          </p>
                        </div>
                      </div>
                    );
                    return null;
                  })()}
                  {(() => {
                    const selectedRow = rows[selectedRowIndex];
                    const splitSum = (selectedRow?.splits.G1 || 0) + (selectedRow?.splits.G2 || 0) + (selectedRow?.splits.G3 || 0) + (selectedRow?.splits.G4 || 0);
                    if (splitSum === 0) return null;
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
                            <span className="text-slate-600 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full text-xs">
                               Corte {rows[selectedRowIndex]?.cut || ""}{rows[selectedRowIndex]?.material ? `: ${rows[selectedRowIndex]?.material}` : ""}
                            </span>
                          </h2>
                          <p className="text-xs text-slate-500">
                            Os fatores multiplicadores de extrapolação física e química recalculam as frações instantaneamente
                          </p>
                        </div>
                      </div>
                    </div>

                  {/* Subsection A: Chemistry controls */}
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                        A. Química Global Alvo (Média Ponderada)
                      </span>
                      <span className="text-[10px] text-slate-400 italic">
                        Valores originais aproximados calculados da cubagem
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      {ELEMENTS.map(el => {
                        const originalValue = baselineGlobal[el.id] || 0;
                        const currentValue = editedGlobalChem[el.id] || 0;
                        const hasChanged = Math.abs(currentValue - originalValue) > 0.001;

                        return (
                          <div
                            key={el.id}
                            className="bg-slate-5o bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:bg-slate-100/40 transition-all shadow-xs"
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
                            <div className="text-[9px] text-center text-slate-500 border-t border-slate-200/80 pt-1 flex justify-between px-1">
                              <span>Natural:</span>
                              <span className="font-mono text-slate-650">
                                {originalValue.toFixed(el.precision)}%
                              </span>
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
                        const originalSplit = rows[selectedRowIndex]?.splits[p.id] || 0;
                        const currentSplit = editedSplits[p.id] || 0;
                        const hasChanged = Math.abs(currentSplit - originalSplit) > 0.01;

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
                              <span className="font-mono text-slate-600">{originalSplit.toFixed(2)}%</span>
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
                            if (selectedRowIndex !== -1) {
                              const row = rows[selectedRowIndex];
                              setEditedSplits({ ...row.splits });
                              setEditedGlobalChem({ ...baselineGlobal });
                            }
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
              const selectedRow = rows[selectedRowIndex];
              const splitSum = (selectedRow?.splits.G1 || 0) + (selectedRow?.splits.G2 || 0) + (selectedRow?.splits.G3 || 0) + (selectedRow?.splits.G4 || 0);
              if (splitSum === 0) return null;
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
                          Recalculada dinamicamente via balanço de massas dos produtos extrapolados
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
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {PRODUCTS.map(p => {
                      const mass = simulation.productMasses[p.id] || 0;
                      const yieldPct = simulation.ratios[p.id] || 0;
                      const pChem = simulation.productChem[p.id] || {};

                      return (
                        <div
                          key={p.id}
                          className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between shadow-sm"
                        >
                          <div className="px-4 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-100">
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                {p.name}
                              </h3>
                              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                                Granulometria {p.size}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold py-0.5 px-2 bg-white border border-slate-200 text-slate-700 rounded font-mono shadow-xs">
                              {p.id}
                            </span>
                          </div>

                          <div className="px-4 py-3.5 bg-slate-50/50 font-sans space-y-1 border-b border-slate-100">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500 font-medium">Massa do Produto:</span>
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
                              const grade = pChem[el.id] || 0;
                              return (
                                <div key={el.id} className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500 font-medium">{el.label}</span>
                                  <span className="font-semibold text-slate-800 font-mono">
                                    {grade.toLocaleString("pt-BR", {
                                      minimumFractionDigits: el.precision,
                                      maximumFractionDigits: el.precision
                                    })}
                                    %
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Pure Custom SVG Line Charts for Each Element */}
                <div>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-2">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    5. Perfis Químicos Estendidos por Elementos
                  </h2>
                  <p className="text-xs text-slate-500 mb-4 ml-3.5">
                    Visão sistemática da alteração de teores por tamanho de partícula (G1 a G4)
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {ELEMENTS.map(el => {
                      // Extract points
                      const pts = PRODUCTS.map((p, idx) => ({
                        x: 50 + idx * 80, // discrete particles
                        val: simulation.productChem[p.id][el.id] || 0,
                        name: p.id,
                        color: p.color
                      }));

                      // Calculate min & max with margin for chart bounds
                      const vals = pts.map(p => p.val);
                      let minVal = Math.min(...vals);
                      let maxVal = Math.max(...vals);
                      
                      // Handle constant grades
                      if (Math.abs(minVal - maxVal) < 0.001) {
                        minVal = Math.max(0, minVal - 0.5);
                        maxVal = maxVal + 0.5;
                      } else {
                        const delta = maxVal - minVal;
                        minVal = Math.max(0, minVal - delta * 0.15);
                        maxVal = maxVal + delta * 0.15;
                      }

                      const chartHeight = 110; // SVG canvas height for content
                      const getSvgY = (v: number) => {
                        const pct = (v - minVal) / (maxVal - minVal);
                        return 130 - pct * chartHeight; // invert Y coordinate + padding
                      };

                      // Generate SVG path string
                      const dPath = pts.reduce((acc, point, i) => {
                        const sx = point.x;
                        const sy = getSvgY(point.val);
                        return i === 0 ? `M ${sx} ${sy}` : `${acc} L ${sx} ${sy}`;
                      }, "");

                      return (
                        <div
                          key={el.id}
                          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-900"
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-slate-700">{el.label} (%)</span>
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              Min/Max: {minVal.toFixed(el.id === "P" ? 2 : 1)}% / {maxVal.toFixed(el.id === "P" ? 2 : 1)}%
                            </span>
                          </div>

                          <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-2 relative">
                            <svg viewBox="0 0 340 160" className="w-full h-auto overflow-visible">
                              {/* Y Gridlines */}
                              {[0, 0.25, 0.5, 0.75, 1].map((pRatio, i) => {
                                const valY = minVal + pRatio * (maxVal - minVal);
                                const sy = getSvgY(valY);
                                return (
                                  <g key={i}>
                                    <line
                                      x1="35"
                                      y1={sy}
                                      x2="310"
                                      y2={sy}
                                      className="stroke-slate-200"
                                      strokeWidth="1"
                                      strokeDasharray="2 3"
                                    />
                                    <text
                                      x="10"
                                      y={sy + 3}
                                      className="fill-slate-400 font-mono text-[9px]"
                                    >
                                      {valY.toFixed(el.id === "P" ? 3 : 1)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Curve path */}
                              <path
                                d={dPath}
                                fill="none"
                                className="stroke-slate-300"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              {/* Points & Data Callouts */}
                              {pts.map((pt, idx) => {
                                const px = pt.x;
                                const py = getSvgY(pt.val);
                                return (
                                  <g key={idx}>
                                    <circle
                                      cx={px}
                                      cy={py}
                                      r="5.5"
                                      fill={pt.color}
                                      className="stroke-white hover:r-7 transition-all cursor-pointer shadow-sm"
                                      strokeWidth="1.5"
                                    />
                                    {/* Grade value label */}
                                    <text
                                      x={px}
                                      y={py - 11}
                                      textAnchor="middle"
                                      className="fill-slate-800 font-bold font-mono text-[10px]"
                                    >
                                      {pt.val.toFixed(el.precision)}
                                    </text>
                                    <text
                                      x={px}
                                      y="150"
                                      textAnchor="middle"
                                      className="fill-slate-500 font-bold text-[9px] uppercase tracking-wider"
                                    >
                                      {pt.name}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        </div>
                      );
                    })}
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
                          const analyzed = rows[selectedRowIndex]?.globalChem[el.id] || 0;
                          const calculated = baselineGlobal[el.id] || 0;
                          const diff = calculated - analyzed;
                          const status = getConvergenceStatus(el.id, diff);
                          
                          let badgeClass = "";
                          let badgeText = "";
                          if (status === 'excellent') {
                            badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                            badgeText = "Excelente";
                          } else if (status === 'moderate') {
                            badgeClass = "bg-amber-50 text-amber-700 border-amber-200";
                            badgeText = "Moderado";
                          } else {
                            badgeClass = "bg-rose-50 text-rose-700 border-rose-200";
                            badgeText = "Divergente";
                          }

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
                                {diff >= 0 ? "+" : ""}{diff.toLocaleString("pt-BR", { minimumFractionDigits: el.precision, maximumFractionDigits: el.precision })}%
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeClass}`}>
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
                        const analyzed = rows[selectedRowIndex]?.globalChem[el.id] || 0;
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
                              const analyzedGlobal = rows[selectedRowIndex]?.globalChem[el.id] || 0;
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
