import { Product, Element, MiningRow } from "./types";

export const PRODUCTS: Product[] = [
  { id: "G1", name: "Frações G1 (1.4 mm)", size: "1.4 mm", color: "#0056b3", suffix: "1" },
  { id: "G2", name: "Frações G2 (0.150 mm)", size: "0.150 mm", color: "#dc3545", suffix: "2" },
  { id: "G3", name: "Frações G3 (0.02 mm)", size: "0.02 mm", color: "#6366f1", suffix: "3" },
  { id: "G4", name: "Frações G4 (-0.02 mm)", size: "-0.02 mm", color: "#10b981", suffix: "4" }
];

export const ELEMENTS: Element[] = [
  { id: "FE", label: "Fe", precision: 2 },
  { id: "SI", label: "SiO2", precision: 2 },
  { id: "AL", label: "Al2O3", precision: 2 },
  { id: "P", label: "P", precision: 3 },
  { id: "MN", label: "Mn", precision: 2 },
  { id: "PF", label: "PPC / PF", precision: 2 }
];

export function parseNum(str: string): number {
  if (!str) return 0;
  // Replace thousand separators and commas
  const cleaned = str.replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parsePastedData(rawText: string): MiningRow[] {
  if (!rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  // Find index of header line containing 'tonnes' or 'cut' or 'g1'
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const LowerLine = lines[i].toLowerCase();
    if (
      (LowerLine.includes("tonnes") || LowerLine.includes("toneladas")) &&
      (LowerLine.includes("cut") || LowerLine.includes("material") || LowerLine.includes("g1"))
    ) {
      headerIdx = i;
      break;
    }
  }

  // If no header could be found of the expected types, we search for any line including key terms
  if (headerIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const LowerLine = lines[i].toLowerCase();
      if (LowerLine.includes("g1") && LowerLine.includes("g2") && LowerLine.includes("g3")) {
        headerIdx = i;
        break;
      }
    }
  }

  if (headerIdx === -1) {
    // If absolutely no header row is identified, assume the first row contains columns if they are strings
    headerIdx = 0;
  }

  const headerLine = lines[headerIdx];
  const splitLine = (l: string): string[] => {
    if (l.includes("\t")) {
      return l.split("\t").map(x => x.trim());
    }
    if (l.includes(";")) {
      return l.split(";").map(x => x.trim());
    }
    return l.split(/\s{2,}|,+/).map(x => x.trim()).filter(x => x !== "");
  };

  const headers = splitLine(headerLine);
  const rows: MiningRow[] = [];

  // Parse remaining lines as data
  for (let i = 0; i < lines.length; i++) {
    if (i === headerIdx) continue;
    
    const rawValues = splitLine(lines[i]);
    if (rawValues.length < 5 || lines[i].trim() === "" || lines[i].toLowerCase().includes("grand total")) {
      continue;
    }

    const getValByName = (colName: string): string => {
      const idx = headers.findIndex(h => h.trim().toUpperCase() === colName.toUpperCase());
      return idx > -1 && idx < rawValues.length ? rawValues[idx] : "";
    };

    const cut = getValByName("Cut") || getValByName("Cuts") || rawValues[0] || `${rows.length + 1}`;
    const material = getValByName("Material") || getValByName("Tipo") || rawValues[1] || "MINERIO";
    const volume = parseNum(getValByName("Volume") || rawValues[2]);
    const tonnes = parseNum(getValByName("Tonnes") || getValByName("Toneladas") || rawValues[3]);

    // Parse Chemistry Global values
    const globalChem: Record<string, number> = {};
    ELEMENTS.forEach(el => {
      const colName = `${el.id}GL`; // FEGL, SIGL, ALGL, PGL, MNGL, PFGL
      const valText = getValByName(colName) || getValByName(`${el.id}_GL`) || getValByName(el.id);
      globalChem[el.id] = parseNum(valText);
    });

    // Parse splits G1, G2, G3, G4
    const splits: Record<string, number> = {};
    PRODUCTS.forEach(p => {
      const valText = getValByName(p.id);
      splits[p.id] = parseNum(valText);
    });

    // Parse products chemistry (G1: FE1, SI1, AL1, P1, MN1, PF1, etc)
    const productChem: Record<string, Record<string, number>> = {};
    PRODUCTS.forEach(p => {
      productChem[p.id] = {};
      ELEMENTS.forEach(el => {
        // Excel column might be formatted as el.id + suffix (e.g. FE1, SI1) or el.id + _ + suffix
        const colName = `${el.id}${p.suffix}`; // e.g. FE1, SI1, AL1
        const valText = getValByName(colName) || getValByName(`${el.id}_${p.suffix}`);
        productChem[p.id][el.id] = parseNum(valText);
      });
    });

    rows.push({
      cut,
      material,
      volume,
      tonnes,
      globalChem,
      splits,
      productChem,
      rawLine: lines[i]
    });
  }

  return rows;
}

export function generateStandaloneHTML(): string {
  const code = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulador: Química Global & Desdobramento - 4 Frações (Vfinal)</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0"></script>

    <style>
        :root {
            --primary: #0f172a;
            --primary-accent: #0056b3;
            --secondary: #10b981;
            --warning: #ffc107;
            --bg: #f8fafc;
            --border: #cbd5e1;
            --card-bg: #ffffff;
        }
        body { 
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; 
            margin: 0; 
            padding: 24px; 
            background: var(--bg); 
            color: #1e293b; 
        }
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            background: var(--card-bg); 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05); 
        }
        
        /* Layout */
        .header {
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 20px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header-title-container h1 {
            color: #0f172a;
            font-size: 24px;
            font-weight: 700;
            margin: 0 0 6px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-title-container p {
            margin: 0;
            color: #64748b;
            font-size: 14px;
        }
        .header-actions { display: flex; gap: 12px; }
        .grid-main { display: grid; grid-template-columns: 340px 1fr; gap: 24px; }
        .grid-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; margin-top: 24px; }
        .grid-results-top { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; align-items: start; margin-bottom: 32px; }
        
        h2, h3 { color: #0f172a; margin-top: 0; font-weight: 600; }
        
        /* Inputs */
        textarea { 
            width: 100%; 
            height: 120px; 
            padding: 12px; 
            border: 1px solid var(--border); 
            border-radius: 8px; 
            font-family: monospace; 
            font-size: 11px; 
            box-sizing: border-box; 
            background: #f8fafc;
            color: #334155;
            resize: vertical;
        }
        textarea:focus {
            outline: none;
            border-color: var(--primary-accent);
            background: #fff;
        }
        input[type="number"] { 
            width: 100%; 
            padding: 8px; 
            border: 1px solid var(--border); 
            border-radius: 6px; 
            text-align: center; 
            box-sizing: border-box; 
            font-weight: 600;
            color: #1e293b;
            background: #fff;
        }
        input[type="number"]:focus {
            outline: none;
            border-color: var(--primary-accent);
            box-shadow: 0 0 0 2px rgba(0, 86, 179, 0.1);
        }
        
        /* Botões */
        button {
            padding: 10px 18px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            font-weight: 600;
            transition: all 0.2s; 
            color: white; 
            display: inline-flex; 
            align-items: center; 
            justify-content: center; 
            gap: 8px;
            font-size: 13px;
        }
        .btn-load { background: #64748b; width: 100%; margin-top: 10px; }
        .btn-load:hover { background: #475569; }
        .btn-calc { background: var(--primary-accent); font-size: 1.1em; padding: 14px; width: 100%; margin-top: 24px; border-radius: 8px; }
        .btn-calc:hover { background: #004494; transform: translateY(-1px); }
        .btn-csv { background: var(--secondary); }
        .btn-csv:hover { background: #059669; }
        .btn-download { background: #0f172a; }
        .btn-download:hover { background: #1e293b; }

        /* Painel de Edição Global */
        .edit-panel { background: #fff; border: 1px solid #e2e8f0; padding: 24px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .section-title { font-size: 0.85em; font-weight: 700; color: #475569; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
        
        .global-chem-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; table-layout: fixed; }
        .global-chem-table th { background: #0f172a; color: white; padding: 10px 6px; font-size: 0.8em; text-align: center; border: 1px solid #1e293b; font-weight: 600; }
        .global-chem-table td { padding: 6px; border: 1px solid #e2e8f0; background: #fdfdfd; }
        .global-chem-table input { font-size: 1.1em; font-weight: bold; color: var(--primary-accent); border: none; background: transparent; text-align: center; width: 100%; }
        .global-chem-table input:focus { outline: none; }

        .split-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .split-table td { padding: 8px; text-align: center; border: 1px solid #f1f5f9; background: #f8fafc; border-radius: 6px; }
        .split-table label { font-size: 0.75em; display: block; color: #475569; margin-bottom: 6px; font-weight: 700; text-transform: uppercase; }
        .split-sum { text-align: right; font-size: 0.85em; font-weight: bold; margin-top: 10px; padding-right: 4px; }

        /* Resultados */
        .results-area { margin-top: 36px; border-top: 2px dashed #e2e8f0; padding-top: 28px; display: none; }
        .table-res { width: 100%; border-collapse: collapse; font-size: 13px; box-shadow: 0 2px 5px rgba(0,0,0,0.02); border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
        .table-res th { background: #0f172a; color: white; padding: 10px; font-weight: 600; }
        .table-res td { border: 1px solid #e2e8f0; padding: 10px; text-align: center; }
        .table-res tr:nth-child(even) { background-color: #f8fafc; }

        .chart-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .chart-card h4 { margin: 0 0 15px 0; color: #0f172a; font-weight: 600; font-size: 14px; }
        canvas { max-width: 100%; }

        .row-selector {
            background: #f1f5f9;
            padding: 10px;
            border-radius: 6px;
            margin-top: 15px;
            font-size: 12px;
            display: none;
        }
        .row-title { font-weight: bold; margin-bottom: 6px; color: #334155; }
        .row-option {
            background: white;
            padding: 8px 10px;
            margin-bottom: 4px;
            border-radius: 4px;
            border: 1px solid #cbd5e1;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
        }
        .row-option:hover {
            border-color: var(--primary-accent);
            background: #f0f7ff;
        }
        .row-option.selected {
            border-color: var(--primary-accent);
            background: #e0f2fe;
            font-weight: bold;
        }
    </style>
</head>
<body>

<div class="container">
    <div class="header">
        <div class="header-title-container">
            <h1>Simulador Físico-Químico: Entrada de Planta (4 Frações)</h1>
            <p>Ajuste dinâmico de química global e splits do Mine Sight para as frações G1, G2, G3 e G4</p>
        </div>
        <div class="header-actions">
            <button id="btnCopy" class="btn-csv" style="display:none;" onclick="exportCSV()">Copiar Simulados</button>
            <button class="btn-download" onclick="loadExampleData()">Carregar Exemplo</button>
        </div>
    </div>

    <div class="grid-main">
        <!-- 1. Importação -->
        <div>
            <h3 style="display: flex; align-items: center; gap: 8px;">
                <span style="background: #0f172a; color: white; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">1</span>
                Dados (Corte de Cubagem)
            </h3>
            <textarea id="rawData" placeholder="Cole aqui as colunas (Cut, Material, Tonnes, FEGL, SIGL, G1...)."></textarea>
            <button class="btn-load" onclick="readData()">Carregar Dados</button>
            
            <div id="rowSelectorContainer" class="row-selector">
                <div class="row-title">Selecione uma linha de cubagem:</div>
                <div id="rowOptionsList"></div>
            </div>

            <div style="margin-top: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 8px;">
                <label style="font-weight:700; display:block; margin-bottom:8px; font-size:12px; color:#475569; text-transform:uppercase;">Meta de Produção (t):</label>
                <input type="number" id="targetOre" step="0.01" style="width:100%; font-size:1.2em; font-weight:bold; padding:10px;">
            </div>
        </div>

        <!-- 2. Ajustes -->
        <div class="edit-panel" id="editPanel" style="opacity:0.4; pointer-events:none; transition: opacity 0.3s;">
            <h3 style="display: flex; align-items: center; gap: 8px;">
                <span style="background: var(--primary-accent); color: white; border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px;">2</span>
                Ajustes Interativos do Cenário
            </h3>
            
            <div class="section-title">A. QUÍMICA GLOBAL ALVO (Média Ponderada)</div>
            <p style="font-size:0.8em; color:#64748b; margin-top:-6px; margin-bottom:14px;">Edite sintonizando os teores globais para recalcular e extrapolar as frações automaticamente.</p>
            
            <table class="global-chem-table">
                <thead>
                    <tr>
                        <th>Fe (%)</th><th>SiO2 (%)</th><th>Al2O3 (%)</th><th>P (%)</th><th>Mn (%)</th><th>PPC (%)</th>
                    </tr>
                </thead>
                <tbody id="globalInputsBody"></tbody>
            </table>

            <div class="section-title" style="margin-top: 15px;">B. DISTRIBUIÇÃO FÍSICA (Split %)</div>
            <p style="font-size:0.8em; color:#64748b; margin-top:-6px; margin-bottom:14px;">Ajuste a distribuição granulométrica de entrada (G1, G2, G3, G4). A massa total se auto-ajustará.</p>
            
            <table class="split-table">
                <tr>
                    <td style="width:25%;">
                        <label>G1 (1,4 mm)</label>
                        <input type="number" id="split_G1" step="0.1" oninput="updateSplitSum()">
                    </td>
                    <td style="width:25%;">
                        <label>G2 (0,150 mm)</label>
                        <input type="number" id="split_G2" step="0.1" oninput="updateSplitSum()">
                    </td>
                    <td style="width:25%;">
                        <label>G3 (0,02 mm)</label>
                        <input type="number" id="split_G3" step="0.1" oninput="updateSplitSum()">
                    </td>
                    <td style="width:25%;">
                        <label>G4 (-0,02 mm)</label>
                        <input type="number" id="split_G4" step="0.1" oninput="updateSplitSum()">
                    </td>
                </tr>
            </table>
            <div class="split-sum" id="splitSumDisplay">Soma dos Splits: 0%</div>

            <button class="btn-calc" onclick="calculateScenario()">SIMULAR DESDOBRAMENTO 4 FRAÇÕES</button>
        </div>
    </div>

    <!-- Resultados -->
    <div id="resultsArea" class="results-area">
        <!-- 3. Análise Global e Distribuição de Massa -->
        <div class="grid-results-top">
            <div>
                <h2>3. Análise Global do Caso Estimado</h2>
                <div id="globalResultTableContainer"></div>
                <p style="font-size:0.75em; color:#64748b; margin-top:10px; font-style:italic;">
                    * Valores recalculados com base na média ponderada física e química das frações estimadas pelo fator multi-escalar.
                </p>
            </div>
            <div class="chart-card">
                <h4>Distribuição Física Simulada (Massa)</h4>
                <div style="height:280px; position: relative;">
                    <canvas id="massChart"></canvas>
                </div>
            </div>
        </div>

        <!-- 4. Resultados por Produto -->
        <h2 style="margin-top:32px; border-top: 1px solid #f1f5f9; padding-top:20px;">4. Frações Resultantes do Desdobramento Estendido</h2>
        <div id="tablesContainer" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:40px;"></div>

        <!-- 5. Gráficos de Análise -->
        <h2 style="margin-top:32px; border-top: 1px solid #f1f5f9; padding-top:20px;">5. Perfis Químicos Estendidos por Elementos</h2>
        <p style="font-size:0.9em; color:#64748b; margin-bottom:20px;">Gráficos evolutivos de composição química em cada granulometria do processo.</p>
        <div id="lineChartsContainer" class="grid-charts"></div>

        <!-- 6. Comparativo Química Analisada Global vs. Calculada pelas Frações -->
        <h2 style="margin-top:32px; border-top: 1px solid #f1f5f9; padding-top:20px;">6. Comparativo Química Analisada Global vs. Calculada pelas Frações</h2>
        <p style="font-size:0.9em; color:#64748b; margin-bottom:20px;">Divergência atual entre os ensaios globais do banco e a média ponderada física e química das frações.</p>
        <div id="comparisonContainer" style="margin-bottom:40px;"></div>

        <!-- 7. Simulação de Reconciliação Química Alvo (Tolerância 5%) -->
        <h2 style="margin-top:32px; border-top: 1px solid #f1f5f9; padding-top:20px;">7. Simulação de Reconciliação Química Alvo (Tolerância 5%)</h2>
        <p style="font-size:0.9em; color:#64748b; margin-bottom:20px;">Química recalculada das frações (G1-G4) para forçar convergência exata com a química global analisada do banco de dados.</p>
        <div id="reconciliationContainer" style="margin-bottom:40px;"></div>
    </div>
</div>

<script>
    Chart.register(ChartDataLabels);

    const products = [
        { id: 'G1', name: 'G1 (1,4 mm)', color: '#0056b3', suffix: '1' },
        { id: 'G2', name: 'G2 (0,150 mm)', color: '#dc3545', suffix: '2' },
        { id: 'G3', name: 'G3 (0,02 mm)', color: '#6366f1', suffix: '3' },
        { id: 'G4', name: 'G4 (-0,02 mm)', color: '#10b981', suffix: '4' }
    ];

    const elements = [
        { id: 'FE', label: 'Fe' },
        { id: 'SI', label: 'SiO2' },
        { id: 'AL', label: 'Al2O3' },
        { id: 'P', label: 'P' },
        { id: 'MN', label: 'Mn' },
        { id: 'PF', label: 'PPC' }
    ];

    let baseData = { products: {}, global: {}, tonnes: 0, rows: [] };
    let selectedRowIdx = 0;

    function parseNum(str) {
        if (!str) return 0;
        return parseFloat(str.toString().replace(/,/g, '')) || 0;
    }
    
    function getPrecision(elId) { return elId === 'P' ? 3 : 2; }

    function fmtNum(n, precision) { 
        var p = precision === undefined ? 2 : precision;
        return n.toLocaleString('pt-BR', { 
            minimumFractionDigits: p, 
            maximumFractionDigits: p 
        }); 
    }

    function loadExampleData() {
        const example = "Cut\\tMaterial\\tVolume\\tTonnes\\tFEGL\\tSIGL\\tALGL\\tPGL\\tMNGL\\tPFGL\\tG1\\tFE1\\tSI1\\tAL1\\tP1\\tMN1\\tPF1\\tG2\\tFE2\\tSI2\\tAL2\\tP2\\tMN2\\tPF2\\tG3\\tFE3\\tSI3\\tAL3\\tP3\\tMN3\\tPF3\\tG4\\tFE4\\tSI4\\tAL4\\tP4\\tMN4\\tPF4\\n1\\tREJEITO\\t33,772.55\\t84,431.37\\t46.56\\t22.48\\t4.55\\t0.08\\t0.53\\t4.59\\t25.08\\t55.18\\t4.45\\t1.76\\t0.07\\t0.75\\t3.63\\t17.05\\t52.73\\t9.48\\t1.43\\t0.06\\t0.74\\t2.71\\t27.92\\t44.69\\t22.76\\t2.04\\t0.04\\t0.25\\t1.59\\t19.97\\t48.35\\t9.90\\t3.65\\t0.11\\t0.94\\t5.79";
        document.getElementById('rawData').value = example.replace(/\\\\t/g, '\\t').replace(/\\\\n/g, '\\n');
        readData();
    }

    function readData() {
        const raw = document.getElementById('rawData').value;
        if (!raw.trim()) return alert("Cole os dados primeiro.");

        const lines = raw.split('\\n');
        let hIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            const low = lines[i].toLowerCase();
            if ((low.includes('tonnes') || low.includes('toneladas')) && (low.includes('cut') || low.includes('material') || low.includes('g1'))) {
                hIdx = i;
                break;
            }
        }
        if (hIdx === -1) hIdx = 0;
        
        const splitLine = (l) => {
            if (l.includes('\\t')) return l.split('\\t').map(x => x.trim());
            if (l.includes(';')) return l.split(';').map(x => x.trim());
            return l.split(/\\s{2,}|,+/).map(x => x.trim()).filter(x => x !== "");
        }

        const headers = splitLine(lines[hIdx]);
        
        const foundRows = [];
        for (let i = hIdx + 1; i < lines.length; i++) {
            const vals = splitLine(lines[i]);
            if (vals.length < 5 || lines[i].trim() === "" || lines[i].toLowerCase().includes("grand total")) {
                continue;
            }

            const getColVal = (name) => {
                const colIdx = headers.findIndex(h => h.trim().toUpperCase() === name.toUpperCase());
                return colIdx > -1 && colIdx < vals.length ? vals[colIdx] : "";
            };

            const cut = getColVal("Cut") || getColVal("Cuts") || vals[0] || (foundRows.length+1);
            const mat = getColVal("Material") || getColVal("Tipo") || vals[1] || "MINERIO";
            const volume = parseNum(getColVal("Volume") || vals[2]);
            const tonnes = parseNum(getColVal("Tonnes") || getColVal("Toneladas") || vals[3]);

            const rowGlobalChem = {};
            elements.forEach(el => {
                const name = el.id + "GL";
                rowGlobalChem[el.id] = parseNum(getColVal(name) || getColVal(el.id));
            });

            const rowSplits = {};
            products.forEach(p => {
                rowSplits[p.id] = parseNum(getColVal(p.id));
            });

            const rowProdChem = {};
            products.forEach(p => {
                rowProdChem[p.id] = {};
                elements.forEach(el => {
                    const name = el.id + p.suffix;
                    rowProdChem[p.id][el.id] = parseNum(getColVal(name));
                });
            });

            foundRows.push({
                cut, material: mat, volume, tonnes,
                globalChem: rowGlobalChem,
                splits: rowSplits,
                productChem: rowProdChem
            });
        }

        if (foundRows.length === 0) {
            return alert("Nenhum dado legível pôde ser interpretado. Verifique os cabeçalhos.");
        }

        baseData.rows = foundRows;
        showRowSelector();
        selectRow(0);
    }

    function showRowSelector() {
        const container = document.getElementById('rowSelectorContainer');
        const list = document.getElementById('rowOptionsList');
        list.innerHTML = '';
        
        baseData.rows.forEach((row, idx) => {
            const el = document.createElement('div');
            el.className = 'row-option ' + (idx === selectedRowIdx ? 'selected' : '');
            el.innerHTML = '<span>Corte ' + row.cut + ' - <strong>' + row.material + '</strong></span> <span>' + fmtNum(row.tonnes, 0) + ' t (Fe Alvo: ' + row.globalChem.FE.toFixed(2) + '%)</span>';
            el.onclick = () => selectRow(idx);
            list.appendChild(el);
        });

        container.style.display = 'block';
    }

    function selectRow(idx) {
        selectedRowIdx = idx;
        const row = baseData.rows[idx];
        
        // Mark selection
        document.querySelectorAll('.row-option').forEach((el, i) => {
            el.className = 'row-option ' + (i === idx ? 'selected' : '');
        });

        baseData.tonnes = row.tonnes;
        document.getElementById('targetOre').value = row.tonnes.toFixed(2);

        // Pre-fill inputs
        let accumMass = 0;
        let accumChem = {};
        elements.forEach(el => accumChem[el.id] = 0);

        products.forEach(prod => {
            const sVal = row.splits[prod.id] || 0;
            document.getElementById('split_' + prod.id).value = sVal;
            
            const pMass = row.tonnes * (sVal / 100);
            accumMass += pMass;

            baseData.products[prod.id] = Object.assign({}, row.productChem[prod.id]);
            elements.forEach(el => {
                const v = row.productChem[prod.id][el.id] || 0;
                accumChem[el.id] += (v * pMass);
            });
        });

        // Set global baseline edits
        const globalBody = document.getElementById('globalInputsBody');
        let htmlRow = '<tr>';
        elements.forEach(el => {
            const calculatedAvg = accumMass > 0 ? accumChem[el.id] / accumMass : 0;
            baseData.global[el.id] = calculatedAvg;
            let prec = getPrecision(el.id);
            htmlRow += '<td><input type="number" id="global_' + el.id + '" value="' + calculatedAvg.toFixed(prec) + '" step="' + (prec === 3 ? '0.001' : '0.01') + '"></td>';
        });
        htmlRow += '</tr>';
        globalBody.innerHTML = htmlRow;

        updateSplitSum();
        
        const editPanel = document.getElementById('editPanel');
        editPanel.style.opacity = "1";
        editPanel.style.pointerEvents = "auto";
    }

    function updateSplitSum() {
        let sum = 0;
        products.forEach(p => sum += parseFloat(document.getElementById('split_' + p.id).value) || 0);
        const disp = document.getElementById('splitSumDisplay');
        disp.innerText = 'Soma dos Splits: ' + sum.toFixed(2) + '%';
        disp.style.color = Math.abs(sum - 100) < 0.2 ? '#059669' : '#d9534f';
    }

    function calculateScenario() {
        const targetMass = parseFloat(document.getElementById('targetOre').value) || 0;
        let totalSplitInput = 0;
        products.forEach(prod => totalSplitInput += parseFloat(document.getElementById('split_' + prod.id).value) || 0);

        let factors = {};
        elements.forEach(el => {
            let targetGlobal = parseFloat(document.getElementById('global_' + el.id).value) || 0;
            let baseNatural = baseData.global[el.id];
            factors[el.id] = baseNatural === 0 ? 1 : targetGlobal / baseNatural;
        });

        let massData = [];
        let chartsData = {}; 
        elements.forEach(el => chartsData[el.id] = []);

        let finalGlobalChem = {};
        elements.forEach(el => finalGlobalChem[el.id] = 0);
        let finalTotalMass = 0;

        const tablesDiv = document.getElementById('tablesContainer');
        tablesDiv.innerHTML = '';
        document.getElementById('lineChartsContainer').innerHTML = '';

        products.forEach(prod => {
            let splitPct = parseFloat(document.getElementById('split_' + prod.id).value) || 0;
            let ratio = totalSplitInput > 0 ? (splitPct / totalSplitInput) : 0;
            let newMass = targetMass * ratio;
            massData.push(newMass);
            finalTotalMass += newMass;

            let newChem = {};
            let rows = "";
            elements.forEach(el => {
                let adjustedGrade = (baseData.products[prod.id][el.id] || 0) * factors[el.id];
                newChem[el.id] = adjustedGrade;
                chartsData[el.id].push(adjustedGrade);
                finalGlobalChem[el.id] += (adjustedGrade * newMass);
                rows += '<tr><td>' + el.label + ' (%)</td><td style="font-weight:600; color:#0f172a;">' + fmtNum(adjustedGrade, getPrecision(el.id)) + '</td></tr>';
            });

            tablesDiv.innerHTML += 
                '<div class="table-res">' +
                    '<div style="background:' + prod.color + '; color:white; font-weight:bold; padding:10px; text-align:center;">' + prod.name + '</div>' +
                    '<table style="width:100%">' +
                        '<tr><td style="background:#f8fafc; font-weight:700;">Massa (t)</td><td style="font-weight:bold; color: ' + prod.color + '">' + fmtNum(newMass, 2) + '</td></tr>' +
                        '<tr><td style="background:#f8fafc">Fração (%)</td><td style="font-weight:600;">' + fmtNum(totalSplitInput > 0 ? (splitPct*100)/totalSplitInput : 0, 2) + '%</td></tr>' +
                        rows +
                    '</table>' +
                '</div>';
        });

        elements.forEach(el => finalGlobalChem[el.id] = finalTotalMass > 0 ? finalGlobalChem[el.id] / finalTotalMass : 0);

        // Render Global Table
        let globalRows = elements.map(el => 
            '<tr><td style="background:#f8fafc; font-weight:bold; width:50%">' + el.label + ' (%)</td><td style="font-weight:bold; font-size:1.1em; color:#0056b3;">' + fmtNum(finalGlobalChem[el.id], getPrecision(el.id)) + '</td></tr>'
        ).join('');
        
        document.getElementById('globalResultTableContainer').innerHTML = 
            '<table class="table-res">' +
                '<tr><td style="background:#f8fafc; font-weight:bold;">Massa Total Calculada (t)</td><td style="font-weight:bold; font-size:1.1em; color:#0f172a;">' + fmtNum(finalTotalMass, 2) + '</td></tr>' +
                globalRows +
            '</table>';

        document.getElementById('resultsArea').style.display = 'block';
        document.getElementById('btnCopy').style.display = 'inline-flex';
        
        // Render comparison table
        const compContainer = document.getElementById('comparisonContainer');
        if (compContainer) {
            let compRowsHtml = '';
            const row = baseData.rows[selectedRowIdx];
            elements.forEach(el => {
                const analyzed = row.globalChem[el.id] || 0;
                const calculated = baseData.global[el.id] || 0;
                const diff = calculated - analyzed;
                const absDiff = Math.abs(diff);
                
                let status = 'excellent';
                let badgeClass = 'background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;';
                let badgeText = 'Excelente';
                
                if (el.id === "FE" || el.id === "SI") {
                    if (absDiff > 1.5) status = 'divergent';
                    else if (absDiff > 0.5) status = 'moderate';
                } else if (el.id === "AL" || el.id === "PF") {
                    if (absDiff > 0.75) status = 'divergent';
                    else if (absDiff > 0.25) status = 'moderate';
                } else if (el.id === "P") {
                    if (absDiff > 0.015) status = 'divergent';
                    else if (absDiff > 0.005) status = 'moderate';
                } else if (el.id === "MN") {
                    if (absDiff > 0.15) status = 'divergent';
                    else if (absDiff > 0.05) status = 'moderate';
                } else {
                    if (absDiff > 1.0) status = 'divergent';
                    else if (absDiff > 0.3) status = 'moderate';
                }
                
                if (status === 'moderate') {
                    badgeClass = 'background:#fffbeb; color:#92400e; border:1px solid #fde68a;';
                    badgeText = 'Moderado';
                } else if (status === 'divergent') {
                    badgeClass = 'background:#fff1f2; color:#9f1239; border:1px solid #fecdd3;';
                    badgeText = 'Divergente';
                }
                
                const diffSign = diff >= 0 ? '+' : '';
                const diffColor = diff > 0 ? 'color:#2563eb;' : (diff < 0 ? 'color:#dc2626;' : 'color:#475569;');
                const prec = getPrecision(el.id);
                
                compRowsHtml += 
                    '<tr>' +
                        '<td style="font-weight:bold; text-align:left; padding:12px 16px;">' + el.label + '</td>' +
                        '<td style="font-family:monospace; text-align:right; padding:12px 16px;">' + fmtNum(analyzed, prec) + '%</td>' +
                        '<td style="font-family:monospace; font-weight:bold; color:#0056b3; text-align:right; padding:12px 16px;">' + fmtNum(calculated, prec) + '%</td>' +
                        '<td style="font-family:monospace; font-weight:bold; ' + diffColor + ' text-align:right; padding:12px 16px;">' + diffSign + fmtNum(diff, prec) + '%</td>' +
                        '<td style="text-align:center; padding:12px 16px;">' +
                            '<span style="display:inline-block; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600; ' + badgeClass + '">' + badgeText + '</span>' +
                        '</td>' +
                    '</tr>';
            });
            
            compContainer.innerHTML = 
                '<table class="table-res" style="width:100%; border-collapse:collapse; margin-top:10px;">' +
                    '<thead>' +
                        '<tr style="background:#0f172a; color:white;">' +
                            '<th style="text-align:left; padding:12px 16px;">Elemento</th>' +
                            '<th style="text-align:right; padding:12px 16px;">Global Analisado (Banco)</th>' +
                            '<th style="text-align:right; padding:12px 16px;">Global Calculado (Frações)</th>' +
                            '<th style="text-align:right; padding:12px 16px;">Desvio Absoluto (Δ)</th>' +
                            '<th style="text-align:center; padding:12px 16px;">Status de Convergência</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody style="background:white;">' +
                        compRowsHtml +
                    '</tbody>' +
                '</table>' +
                '<div style="margin-top:16px; padding:14px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; display:flex; gap:10px; font-size:12px; color:#0369a1; line-height:1.5;">' +
                    '<div style="font-weight:bold; font-size:14px; margin-top:-2px;">✨</div>' +
                    '<div>' +
                        '<strong>Nota de Engenharia Processual:</strong> A química analisada global é o valor real contido na cubagem. A calculada é deduzida via ponderação de massa das frações de G1 a G4. Divergências ocorrem devido ao banco ainda possuir apenas poucas análises de frações granulométricas. À medida que mais amostras forem ensaiadas em G1-G4, os dois valores convergirão para um resultado único (Desvio tende a zero).' +
                    '</div>' +
                '</div>';
        }

        // Render Item 7: Reconciliation
        let reconciliationFactors = {};
        const row = baseData.rows[selectedRowIdx];
        elements.forEach(el => {
            let analyzed = row.globalChem[el.id] || 0;
            let simulated = finalGlobalChem[el.id] || 0;
            reconciliationFactors[el.id] = simulated > 0 ? (analyzed / simulated) : 1;
        });

        const reconContainer = document.getElementById('reconciliationContainer');
        if (reconContainer) {
            let factorsHtml = '';
            elements.forEach(el => {
                const pctChange = (reconciliationFactors[el.id] - 1) * 100;
                const isHigh = Math.abs(pctChange) > 5;
                const badgeStyle = isHigh 
                    ? 'background:#ffe4e6; color:#9f1239; border:1px solid #fecdd3;'
                    : 'background:#d1fae5; color:#065f46; border:1px solid #a7f3d0;';
                const badgeText = isHigh ? 'Ajuste Alto (>5%)' : 'Adequado (≤5%)';
                const cardStyle = isHigh
                    ? 'background:#fff5f5; border:1px solid #feb2b2; padding:12px; border-radius:8px; text-align:center;'
                    : 'background:white; border:1px solid #e2e8f0; padding:12px; border-radius:8px; text-align:center;';

                factorsHtml += 
                    '<div style="' + cardStyle + '">' +
                        '<div style="font-weight:bold; font-size:12px; color:#475569;">' + el.label + '</div>' +
                        '<div style="font-size:16px; font-weight:bold; font-family:monospace; margin:8px 0; color:#0f172a;">' + (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%</div>' +
                        '<div style="display:inline-block; font-size:10px; font-weight:700; padding:2px 8px; border-radius:10px; ' + badgeStyle + '">' + badgeText + '</div>' +
                    '</div>';
            });

            let cardsHtml = '';
            products.forEach((prod, pIdx) => {
                let splitPct = parseFloat(document.getElementById('split_' + prod.id).value) || 0;
                let ratio = totalSplitInput > 0 ? (splitPct / totalSplitInput) : 0;
                let newMass = targetMass * ratio;
                let yieldPct = totalSplitInput > 0 ? (splitPct*100)/totalSplitInput : 0;

                let rowChemHtml = '';
                elements.forEach(el => {
                    let originalGrade = (baseData.products[prod.id][el.id] || 0) * factors[el.id];
                    let reconciledGrade = originalGrade * reconciliationFactors[el.id];
                    let prec = getPrecision(el.id);
                    
                    rowChemHtml += 
                        '<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; border-bottom:1px solid #f1f5f9; padding:6px 0;">' +
                            '<span style="color:#64748b; font-weight:500;">' + el.label + '</span>' +
                            '<div style="display:flex; align-items:center; gap:6px;">' +
                                '<span style="color:#94a3b8; text-decoration:line-through; font-family:monospace; font-size:11px;">' + fmtNum(originalGrade, prec) + '%</span>' +
                                '<span style="color:#64748b; font-size:10px;">→</span>' +
                                '<span style="color:#7c3aed; font-weight:700; font-family:monospace;">' + fmtNum(reconciledGrade, prec) + '%</span>' +
                            '</div>' +
                        '</div>';
                });

                cardsHtml += 
                    '<div class="table-res" style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:white; box-shadow:0 1px 3px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between;">' +
                        '<div style="background:#f5f3ff; color:#6d28d9; font-weight:bold; padding:12px; text-align:center; border-bottom:1px solid #ddd6fe; display:flex; justify-content:space-between; align-items:center;">' +
                            '<span>' + prod.name + '</span>' +
                            '<span style="background:white; border:1px solid #c084fc; padding:2px 6px; border-radius:4px; font-size:10px; color:#7c3aed; font-family:monospace;">' + prod.id + '</span>' +
                        '</div>' +
                        '<div style="padding:12px; background:#faf5ff; border-bottom:1px solid #ddd6fe; font-size:12px;">' +
                            '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">' +
                                '<span style="color:#64748b;">Massa Reconciliada:</span>' +
                                '<span style="font-weight:bold; color:' + prod.color + '; font-family:monospace;">' + fmtNum(newMass, 2) + ' t</span>' +
                            '</div>' +
                            '<div style="display:flex; justify-content:space-between;">' +
                                '<span style="color:#64748b;">Fração:</span>' +
                                '<span style="font-weight:bold; color:#334155; font-family:monospace;">' + fmtNum(yieldPct, 2) + '%</span>' +
                            '</div>' +
                        '</div>' +
                        '<div style="padding:12px; background:white;">' +
                            rowChemHtml +
                        '</div>' +
                    '</div>';
            });

            reconContainer.innerHTML = 
                '<div style="margin-bottom:24px;">' +
                    '<div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Fatores de Ajuste Necessários para Reconciliação</div>' +
                    '<div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:12px;">' +
                        factorsHtml +
                    '</div>' +
                '</div>' +
                '<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">' +
                    cardsHtml +
                '</div>';
        }
        
        renderPie(massData);
        elements.forEach(el => renderLineChart(el, chartsData[el.id]));
    }

    let pieInstance = null;
    function renderPie(data) {
        const ctx = document.getElementById('massChart').getContext('2d');
        if(pieInstance) pieInstance.destroy();
        pieInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: products.map(p => p.name),
                datasets: [{
                    data: data,
                    backgroundColor: products.map(p => p.color),
                    borderWidth: 2, borderColor: '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    datalabels: {
                        color: '#fff', font: {weight:'bold', size:12},
                        formatter: (val, ctx) => {
                            let sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            return sum > 0 ? ((val*100)/sum).toFixed(1) + "%" : "0%";
                        }
                    }
                }
            }
        });
    }

    function renderLineChart(elObj, dataValues) {
        const div = document.createElement('div');
        div.className = 'chart-card';
        div.innerHTML = '<h4>Teor de ' + elObj.label + ' (%) por fração</h4><div style="height:210px;"><canvas id="chart_' + elObj.id + '"></canvas></div>';
        document.getElementById('lineChartsContainer').appendChild(div);

        const ctx = document.getElementById('chart_' + elObj.id).getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: products.map(p => p.name),
                datasets: [{
                    label: elObj.label,
                    data: dataValues,
                    borderColor: '#475569',
                    backgroundColor: products.map(p => p.color),
                    pointBackgroundColor: products.map(p => p.color),
                    pointRadius: 6, pointHoverRadius: 8,
                    borderWidth: 2, fill: false, tension: 0.15
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        align: 'top', anchor: 'end',
                        formatter: v => v.toFixed(getPrecision(elObj.id)),
                        color: '#1e293b', font: {weight:'bold', size: 11}
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: false, grace: '15%',
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 10 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    }

    function exportCSV() {
        let csv = "ANÁLISE GLOBAL ESTIMADA\\n";
        const globalTable = document.querySelector("#globalResultTableContainer table");
        globalTable.querySelectorAll("tr").forEach(tr => {
            csv += Array.from(tr.querySelectorAll("td")).map(td => td.innerText).join("\\t") + "\\n";
        });
        csv += "\\nFRAÇÕES GRANULOMÉTRICAS ESTIMADAS (G1, G2, G3, G4)\\n";
        document.querySelectorAll("#tablesContainer .table-res").forEach(div => {
            csv += div.querySelector("div").innerText + "\\n";
            div.querySelectorAll("tr").forEach(tr => {
                csv += Array.from(tr.querySelectorAll("td")).map(td => td.innerText).join("\\t") + "\\n";
            });
            csv += "\\n";
        });
        csv += "\\nCOMPARATIVO QUÍMICA ANALISADA GLOBAL VS. CALCULADA PELAS FRAÇÕES\\n";
        const compTable = document.querySelector("#comparisonContainer table");
        if (compTable) {
            compTable.querySelectorAll("tr").forEach(tr => {
                csv += Array.from(tr.querySelectorAll("th, td")).map(el => el.innerText).join("\\t") + "\\n";
            });
        }

        // Item 7 Export recalculation
        const targetMass = parseFloat(document.getElementById('targetOre').value) || 0;
        let totalSplitInput = 0;
        products.forEach(prod => totalSplitInput += parseFloat(document.getElementById('split_' + prod.id).value) || 0);

        let factors = {};
        elements.forEach(el => {
            let targetGlobal = parseFloat(document.getElementById('global_' + el.id).value) || 0;
            let baseNatural = baseData.global[el.id];
            factors[el.id] = baseNatural === 0 ? 1 : targetGlobal / baseNatural;
        });

        let finalGlobalChem = {};
        elements.forEach(el => finalGlobalChem[el.id] = 0);
        let finalTotalMass = 0;
        products.forEach(prod => {
            let splitPct = parseFloat(document.getElementById('split_' + prod.id).value) || 0;
            let ratio = totalSplitInput > 0 ? (splitPct / totalSplitInput) : 0;
            let newMass = targetMass * ratio;
            finalTotalMass += newMass;
            elements.forEach(el => {
                let adjustedGrade = (baseData.products[prod.id][el.id] || 0) * factors[el.id];
                finalGlobalChem[el.id] += (adjustedGrade * newMass);
            });
        });
        elements.forEach(el => finalGlobalChem[el.id] = finalTotalMass > 0 ? finalGlobalChem[el.id] / finalTotalMass : 0);

        let reconciliationFactors = {};
        const row = baseData.rows[selectedRowIdx];
        elements.forEach(el => {
            let analyzed = row.globalChem[el.id] || 0;
            let simulated = finalGlobalChem[el.id] || 0;
            reconciliationFactors[el.id] = simulated > 0 ? (analyzed / simulated) : 1;
        });

        csv += "\\nSIMULAÇÃO DE RECONCILIAÇÃO QUÍMICA ALVO (ITEM 7 - TOLERÂNCIA 5%)\\n";
        csv += "Fração\\tMassa Reconciliada (t)\\tRendimento (%)";
        elements.forEach(el => {
            csv += "\\t" + el.label + " Reconciliado (%)";
        });
        csv += "\\n";
        
        products.forEach(prod => {
            let splitPct = parseFloat(document.getElementById('split_' + prod.id).value) || 0;
            let ratio = totalSplitInput > 0 ? (splitPct / totalSplitInput) : 0;
            let newMass = targetMass * ratio;
            let yieldPct = totalSplitInput > 0 ? (splitPct*100)/totalSplitInput : 0;
            
            csv += prod.name + "\\t" + newMass.toFixed(2) + "\\t" + yieldPct.toFixed(2) + "%";
            
            elements.forEach(el => {
                let originalGrade = (baseData.products[prod.id][el.id] || 0) * factors[el.id];
                let reconciledGrade = originalGrade * reconciliationFactors[el.id];
                csv += "\\t" + reconciledGrade.toFixed(getPrecision(el.id));
            });
            csv += "\\n";
        });

        navigator.clipboard.writeText(csv).then(() => alert("Dados formatados em Tabulação copiados com sucesso! Basta colar no Excel."));
    }
</script>

</body>
</html>`;
  return code;
}
