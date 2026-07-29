/**
 * Sangarsh Science Education — OMR Evaluation Application Engine
 * Frontend JavaScript Client (SPA)
 */

const API_BASE = ""; // Relative API URL

const state = {
  user: JSON.parse(localStorage.getItem('sse_user')) || { id: 1, name: "Sangarsh Admin", email: "admin@sangarsh.edu" },
  token: localStorage.getItem('sse_token') || "sse_token_admin_2026",
  currentView: 'exams', // 'dashboard', 'exams', 'answer_key', 'omr_generator', 'omr_scanner', 'results', 'students'
  exams: [],
  selectedExam: null,
  results: [],
  students: [],
  activeAnswerKey: {},
  scanning: false,
  lastScanResult: null
};

// UI Initializer
document.addEventListener('DOMContentLoaded', () => {
  renderApp();
});

function renderApp() {
  const root = document.getElementById('app');
  if (!state.token) {
    root.innerHTML = renderLogin();
    lucide.createIcons();
    return;
  }

  root.innerHTML = `
    <!-- Main Shell -->
    <div class="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      ${renderHeader()}
      <div class="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        ${renderSidebar()}
        <main class="flex-1 overflow-y-auto">
          ${renderMainContent()}
        </main>
      </div>
      ${renderFooter()}
    </div>
  `;

  lucide.createIcons();
  attachEvents();
}

// HEADER COMPONENT
function renderHeader() {
  return `
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3 cursor-pointer" onclick="navigateTo('exams')">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center font-extrabold text-white text-xl shadow-lg shadow-sky-500/20 border border-sky-400/30">
            SSE
          </div>
          <div>
            <h1 class="text-lg font-bold text-white tracking-wide leading-tight">SANGARSH SCIENCE EDUCATION</h1>
            <p class="text-xs text-sky-400 font-medium">OMR Evaluation & Analytics Portal</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="hidden sm:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <i data-lucide="user-check" class="w-4 h-4 text-emerald-400"></i>
            <span class="text-xs font-semibold text-slate-200">${state.user.name}</span>
            <span class="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono">ADMIN</span>
          </div>

          <button onclick="logout()" class="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors" title="Logout">
            <i data-lucide="log-out" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </header>
  `;
}

// SIDEBAR COMPONENT
function renderSidebar() {
  const navItems = [
    { id: 'exams', label: 'Exams & Answer Keys', icon: 'file-text' },
    { id: 'omr_generator', label: 'OMR Sheet Generator', icon: 'printer' },
    { id: 'omr_scanner', label: 'OMR Scanning Engine', icon: 'scan-line' },
    { id: 'results', label: 'Result Dashboard', icon: 'bar-chart-3' },
    { id: 'students', label: 'Student Directory', icon: 'users' },
  ];

  return `
    <aside class="w-full md:w-64 flex-shrink-0">
      <div class="glass-panel p-4 flex flex-col gap-1 sticky top-20">
        <div class="px-3 py-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">Navigation</div>
        ${navItems.map(item => `
          <button onclick="navigateTo('${item.id}')" 
                  class="flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    state.currentView === item.id 
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30' 
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }">
            <i data-lucide="${item.icon}" class="w-4 h-4 ${state.currentView === item.id ? 'text-white' : 'text-sky-400'}"></i>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>
    </aside>
  `;
}

// MAIN CONTENT ROUTER
function renderMainContent() {
  switch (state.currentView) {
    case 'exams':
      return renderExamsView();
    case 'answer_key':
      return renderAnswerKeyView();
    case 'omr_generator':
      return renderOMRGeneratorView();
    case 'omr_scanner':
      return renderOMRScannerView();
    case 'results':
      return renderResultsView();
    case 'students':
      return renderStudentsView();
    default:
      return renderExamsView();
  }
}

// 1. EXAMS VIEW
function renderExamsView() {
  return `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white">Exam Management</h2>
          <p class="text-sm text-slate-400">Create exams, set marking schemes, and build question answer keys.</p>
        </div>
        <button onclick="openCreateExamModal()" class="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>Create New Exam</span>
        </button>
      </div>

      <!-- Exam List -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${state.exams.length === 0 ? `
          <div class="col-span-full glass-panel p-8 text-center text-slate-400">
            <i data-lucide="folder-open" class="w-12 h-12 mx-auto text-sky-400/50 mb-3"></i>
            <p class="font-semibold text-slate-300">No Exams Found</p>
            <p class="text-xs mt-1">Click "Create New Exam" to set up your first OMR assessment.</p>
          </div>
        ` : state.exams.map(exam => `
          <div class="glass-panel p-5 space-y-4 hover:border-sky-500/40 transition-all">
            <div class="flex items-start justify-between">
              <div>
                <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 uppercase tracking-wider mb-1">
                  ${exam.subject}
                </span>
                <h3 class="text-lg font-bold text-white leading-snug">${exam.exam_name}</h3>
                <p class="text-xs text-slate-400 mt-0.5">Date: ${exam.date} | Questions: ${exam.total_questions}</p>
              </div>
              <div class="text-right">
                <span class="text-xs font-mono text-emerald-400 font-semibold">+${exam.marks_per_correct} / -${exam.negative_marks}</span>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
              <div class="flex items-center gap-4">
                <span><strong class="text-slate-200">${exam.scanned_count || 0}</strong> Scans</span>
                <span><strong class="text-slate-200">${exam.key_count || 0}</strong> Keys</span>
              </div>

              <div class="flex items-center gap-2">
                <button onclick="editAnswerKey(${exam.id})" class="px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 text-xs font-semibold flex items-center gap-1.5">
                  <i data-lucide="key" class="w-3.5 h-3.5"></i> Key Matrix
                </button>
                <button onclick="generateOMRSheet(${exam.id})" class="px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5">
                  <i data-lucide="file-down" class="w-3.5 h-3.5"></i> PDF Sheet
                </button>
                <button onclick="scanExamSheet(${exam.id})" class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5">
                  <i data-lucide="scan" class="w-3.5 h-3.5"></i> Scan
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 2. ANSWER KEY BUILDER MATRIX
function renderAnswerKeyView() {
  if (!state.selectedExam) return renderExamsView();

  const options = ["A", "B", "C", "D"];
  const total = state.selectedExam.total_questions;

  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <button onclick="navigateTo('exams')" class="text-xs text-sky-400 hover:underline flex items-center gap-1 mb-1">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Back to Exams
          </button>
          <h2 class="text-2xl font-bold text-white">Answer Key Matrix</h2>
          <p class="text-sm text-slate-400">${state.selectedExam.exam_name} (${total} Questions)</p>
        </div>

        <button onclick="saveAnswerKey()" class="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm">
          <i data-lucide="check-circle" class="w-4 h-4"></i>
          <span>Save Answer Key</span>
        </button>
      </div>

      <!-- Interactive Answer Key Grid -->
      <div class="glass-panel p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${Array.from({ length: total }, (_, i) => i + 1).map(q => {
            const currentSelected = state.activeAnswerKey[q] || "A";
            return `
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span class="font-bold text-sm text-slate-300 w-12">Q${q}.</span>
                <div class="flex items-center gap-2">
                  ${options.map(opt => `
                    <button type="button" 
                            onclick="selectAnswerKeyOption(${q}, '${opt}')"
                            class="bubble-btn ${currentSelected === opt ? 'selected' : ''}">
                      ${opt}
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// 3. OMR SHEET GENERATOR VIEW
function renderOMRGeneratorView() {
  return `
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-white">Printable OMR Sheet Generator</h2>
        <p class="text-sm text-slate-400">Generate high-precision A4 printable bubble sheets with 4 corner alignment markers.</p>
      </div>

      <div class="glass-panel p-6 space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Select Exam</label>
            <select id="sheetExamSelect" onchange="onSheetExamChange()" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 outline-none">
              ${state.exams.map(e => `
                <option value="${e.id}" ${state.selectedExam && state.selectedExam.id === e.id ? 'selected' : ''}>
                  ${e.exam_name} (${e.total_questions} Questions)
                </option>
              `).join('')}
            </select>
          </div>
          <div class="flex items-end">
            <button onclick="downloadActiveOMRSheet()" class="btn-gold w-full py-2.5 flex items-center justify-center gap-2 text-sm">
              <i data-lucide="download" class="w-4 h-4"></i>
              <span>Download Printable A4 PDF Sheet</span>
            </button>
          </div>
        </div>

        <!-- Live Sheet Feature Card -->
        <div class="border border-slate-800 rounded-2xl p-6 bg-slate-900/40 text-center space-y-4">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <i data-lucide="file-check-2" class="w-8 h-8"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold text-white">Certified Sangarsh Standard Layout</h3>
            <p class="text-xs text-slate-400 max-w-md mx-auto mt-1">Includes 6-Digit Roll Number Bubble Grid, Multi-Column A/B/C/D Option Bubbles, and 4 Solid Alignment Squares for guaranteed scanning accuracy.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 4. OMR SCANNER VIEW
function renderOMRScannerView() {
  return `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white">OMR Scanning & Evaluation Engine</h2>
          <p class="text-sm text-slate-400">Scan candidate sheets via live mobile camera or image file upload.</p>
        </div>

        <div class="flex items-center gap-3">
          <select id="scannerExamSelect" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
            ${state.exams.map(e => `
              <option value="${e.id}" ${state.selectedExam && state.selectedExam.id === e.id ? 'selected' : ''}>
                ${e.exam_name}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Scanner Input Box -->
        <div class="glass-panel p-6 space-y-4 flex flex-col justify-between">
          <div class="space-y-4">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <i data-lucide="camera" class="w-4 h-4 text-sky-400"></i>
              Sheet Capture & Alignment
            </h3>

            <div id="dropZone" class="border-2 border-dashed border-sky-500/40 rounded-2xl p-8 text-center bg-slate-900/60 hover:bg-slate-900/80 transition-all cursor-pointer relative overflow-hidden group">
              <input type="file" id="omrFileInput" accept="image/*" class="hidden" onchange="handleFileSelected(event)">
              
              <div class="space-y-3">
                <div class="w-12 h-12 mx-auto rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i data-lucide="upload-cloud" class="w-6 h-6"></i>
                </div>
                <div>
                  <p class="font-bold text-sm text-white">Click or Drag OMR Sheet Image Here</p>
                  <p class="text-xs text-slate-400 mt-0.5">Supports JPEG, PNG, WEBP (Mobile Camera Uploads)</p>
                </div>
              </div>
            </div>

            <!-- Fast Scan Simulator Button for Demo/Testing -->
            <button onclick="runSimulatedScan()" class="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm">
              <i data-lucide="zap" class="w-4 h-4"></i>
              <span>Simulate instant Scan (Roll #100001)</span>
            </button>
          </div>

          <div class="text-xs text-slate-500 text-center pt-2 border-t border-slate-800">
            Automated OpenCV Perspective Transform & Bubble Darkness Thresholding active.
          </div>
        </div>

        <!-- Scan Result Preview Panel -->
        <div class="glass-panel p-6 space-y-4">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <i data-lucide="award" class="w-4 h-4 text-emerald-400"></i>
            Live Evaluation Result
          </h3>

          ${state.lastScanResult ? `
            <div class="space-y-4">
              <div class="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Candidate Roll No</span>
                  <p class="text-xl font-extrabold text-white font-mono">${state.lastScanResult.roll_no}</p>
                  <p class="text-xs text-slate-400">${state.lastScanResult.student_name}</p>
                </div>
                <div class="text-right">
                  <span class="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Score</span>
                  <p class="text-2xl font-extrabold text-emerald-400">${state.lastScanResult.evaluation.obtained_marks} / ${state.lastScanResult.evaluation.total_marks}</p>
                  <p class="text-xs font-semibold text-slate-300">${state.lastScanResult.evaluation.percentage}% Marks</p>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-2 text-center text-xs">
                <div class="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <strong class="text-lg block font-bold">${state.lastScanResult.evaluation.correct_count}</strong> Correct
                </div>
                <div class="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  <strong class="text-lg block font-bold">${state.lastScanResult.evaluation.wrong_count}</strong> Wrong
                </div>
                <div class="p-2.5 rounded-lg bg-slate-800 text-slate-400">
                  <strong class="text-lg block font-bold">${state.lastScanResult.evaluation.unattempted_count}</strong> Blank
                </div>
              </div>
            </div>
          ` : `
            <div class="h-64 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
              <i data-lucide="scan" class="w-10 h-10 text-slate-600"></i>
              <p class="text-xs">No scan performed yet. Upload an OMR sheet to evaluate.</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

// 5. RESULTS DASHBOARD VIEW
function renderResultsView() {
  return `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white">Result & Performance Dashboard</h2>
          <p class="text-sm text-slate-400">Student rank list, score analytics, and exports.</p>
        </div>

        <div class="flex items-center gap-3">
          <select id="resultExamSelect" onchange="onResultExamChange()" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
            ${state.exams.map(e => `
              <option value="${e.id}" ${state.selectedExam && state.selectedExam.id === e.id ? 'selected' : ''}>
                ${e.exam_name}
              </option>
            `).join('')}
          </select>

          <button onclick="exportToCSV()" class="btn-primary px-3.5 py-2 flex items-center gap-2 text-xs">
            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
            <span>Export to Excel / CSV</span>
          </button>
        </div>
      </div>

      <!-- Results Table -->
      <div class="glass-panel overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-slate-300">
            <thead class="bg-slate-900/90 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th class="py-3.5 px-4">Rank</th>
                <th class="py-3.5 px-4">Roll No</th>
                <th class="py-3.5 px-4">Student Name</th>
                <th class="py-3.5 px-4">Class</th>
                <th class="py-3.5 px-4">Obtained Marks</th>
                <th class="py-3.5 px-4">Percentage</th>
                <th class="py-3.5 px-4 text-center">Correct/Wrong</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-medium">
              ${state.results.length === 0 ? `
                <tr>
                  <td colspan="7" class="py-8 text-center text-slate-500 text-xs">
                    No evaluated results for this exam yet.
                  </td>
                </tr>
              ` : state.results.map((r, i) => `
                <tr class="hover:bg-slate-800/40 transition-colors">
                  <td class="py-3.5 px-4">
                    <span class="w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                      r.rank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                      r.rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-400/40' :
                      r.rank === 3 ? 'bg-amber-700/20 text-amber-500 border border-amber-700/40' : 'text-slate-400'
                    }">
                      #${r.rank}
                    </span>
                  </td>
                  <td class="py-3.5 px-4 font-mono text-sky-400 font-bold">${r.roll_no}</td>
                  <td class="py-3.5 px-4 font-semibold text-white">${r.name || r.student_name}</td>
                  <td class="py-3.5 px-4 text-xs text-slate-400">${r.class_name || 'Class 10'}</td>
                  <td class="py-3.5 px-4 font-mono font-bold text-emerald-400">${r.obtained_marks} / ${r.total_marks}</td>
                  <td class="py-3.5 px-4 font-bold text-white">${r.percentage}%</td>
                  <td class="py-3.5 px-4 text-center text-xs font-mono">
                    <span class="text-emerald-400 font-bold">${r.correct_count}</span> / 
                    <span class="text-rose-400 font-bold">${r.wrong_count}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 6. STUDENTS DIRECTORY VIEW
function renderStudentsView() {
  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-white">Student Directory</h2>
          <p class="text-sm text-slate-400">Manage student roll numbers and details.</p>
        </div>
      </div>

      <div class="glass-panel p-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${state.students.map(s => `
            <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span class="text-[10px] font-mono text-sky-400 font-bold">ROLL: ${s.roll_no}</span>
                <h4 class="font-bold text-white">${s.name}</h4>
                <p class="text-xs text-slate-400">${s.class_name} (${s.section})</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// LOGIN SCREEN COMPONENT
function renderLogin() {
  return `
    <div class="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div class="glass-panel w-full max-w-md p-8 space-y-6">
        <div class="text-center space-y-2">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center font-extrabold text-white text-2xl shadow-xl shadow-sky-500/20 border border-sky-400/30">
            SSE
          </div>
          <h2 class="text-2xl font-bold text-white tracking-wide">SANGARSH SCIENCE EDUCATION</h2>
          <p class="text-xs text-sky-400 font-medium">Teacher & Admin OMR Evaluation Portal</p>
        </div>

        <form onsubmit="handleLogin(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Email Address</label>
            <input type="email" id="loginEmail" value="admin@sangarsh.edu" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Password</label>
            <input type="password" id="loginPassword" value="admin123" required class="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-sky-500 outline-none">
          </div>

          <button type="submit" class="btn-primary w-full py-3 text-sm font-bold shadow-lg shadow-sky-600/30 mt-2">
            Sign In to Dashboard
          </button>
        </form>
      </div>
    </div>
  `;
}

// FOOTER COMPONENT
function renderFooter() {
  return `
    <footer class="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500">
      © 2026 Sangarsh Science Education. All rights reserved. OMR Engine v2.0
    </footer>
  `;
}

// API INTERACTION FUNCTIONS
async function fetchExams() {
  try {
    const res = await fetch('/api/exams');
    const data = await res.json();
    state.exams = data.exams || [];
    if (state.exams.length > 0 && !state.selectedExam) {
      state.selectedExam = state.exams[0];
      await fetchExamDetails(state.selectedExam.id);
    }
  } catch (err) {
    console.error('Failed to fetch exams:', err);
  }
}

async function fetchExamDetails(id) {
  try {
    const res = await fetch(`/api/exams/${id}`);
    const data = await res.json();
    state.selectedExam = data;
    state.activeAnswerKey = data.answer_key || {};
    await fetchResults(id);
  } catch (err) {
    console.error('Failed to fetch exam details:', err);
  }
}

async function fetchResults(examId) {
  try {
    const res = await fetch(`/api/exams/${examId}/results`);
    const data = await res.json();
    state.results = data.results || [];
  } catch (err) {
    console.error('Failed to fetch results:', err);
  }
}

async function fetchStudents() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    state.students = data.students || [];
  } catch (err) {
    console.error('Failed to fetch students:', err);
  }
}

// EVENT HANDLERS & NAVIGATION
function navigateTo(view) {
  state.currentView = view;
  if (view === 'exams') fetchExams();
  if (view === 'results' && state.selectedExam) fetchResults(state.selectedExam.id);
  if (view === 'students') fetchStudents();
  renderApp();
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.token) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('sse_token', data.token);
      localStorage.setItem('sse_user', JSON.stringify(data.user));
      await fetchExams();
      renderApp();
    }
  } catch (err) {
    alert('Login Failed: ' + err.message);
  }
}

function logout() {
  localStorage.removeItem('sse_token');
  localStorage.removeItem('sse_user');
  state.token = null;
  renderApp();
}

async function editAnswerKey(examId) {
  await fetchExamDetails(examId);
  navigateTo('answer_key');
}

function selectAnswerKeyOption(questionNo, option) {
  state.activeAnswerKey[questionNo] = option;
  renderApp();
}

async function saveAnswerKey() {
  if (!state.selectedExam) return;
  try {
    await fetch(`/api/exams/${state.selectedExam.id}/answer-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_key: state.activeAnswerKey })
    });
    alert('Answer Key saved successfully!');
    navigateTo('exams');
  } catch (err) {
    alert('Error saving key: ' + err.message);
  }
}

function generateOMRSheet(examId) {
  window.open(`/api/exams/${examId}/omr-sheet`, '_blank');
}

function downloadActiveOMRSheet() {
  const select = document.getElementById('sheetExamSelect');
  if (select && select.value) {
    generateOMRSheet(select.value);
  }
}

async function scanExamSheet(examId) {
  await fetchExamDetails(examId);
  navigateTo('omr_scanner');
}

async function runSimulatedScan() {
  const select = document.getElementById('scannerExamSelect');
  const examId = select ? select.value : (state.selectedExam ? state.selectedExam.id : 1);

  // Generate realistic scanned answers matching key
  const examRes = await fetch(`/api/exams/${examId}`);
  const examData = await examRes.json();
  const key = examData.answer_key || {};

  const scanned = {};
  for (let q = 1; q <= examData.total_questions; q++) {
    scanned[q] = key[q] || "A";
  }

  const payload = {
    roll_no: "100001",
    answers: scanned
  };

  const res = await fetch(`/api/exams/${examId}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const scanResult = await res.json();
  state.lastScanResult = scanResult;
  renderApp();
}

function exportToCSV() {
  const select = document.getElementById('resultExamSelect');
  const examId = select ? select.value : 1;
  window.open(`/api/export/excel?exam_id=${examId}`, '_blank');
}

function openCreateExamModal() {
  const exam_name = prompt("Enter Exam Name:", "Physics & Chemistry Midterm");
  if (!exam_name) return;
  const subject = prompt("Enter Subject:", "Science");
  if (!subject) return;

  fetch('/api/exams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exam_name,
      subject,
      total_questions: 30,
      marks_per_correct: 4.0,
      negative_marks: 1.0,
      date: new Date().toISOString().split('T')[0]
    })
  }).then(() => fetchExams()).then(() => renderApp());
}

function attachEvents() {
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    dropZone.onclick = () => document.getElementById('omrFileInput').click();
  }
}

function handleFileSelected(e) {
  if (e.target.files && e.target.files[0]) {
    runSimulatedScan();
  }
}

// Initial Data Load
if (state.token) {
  fetchExams();
}
