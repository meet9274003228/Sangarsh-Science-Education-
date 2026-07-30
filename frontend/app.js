/**
 * Sangarsh Science Education — OMR Evaluation Application Engine
 * Frontend JavaScript Client (SPA)
 * Custom Features: In-App Create Exam Modal (Laptop & Mobile Fix),
 * Board/GUJCET/NEET/JEE Marking Schemes, Subject-Wise Marks Breakdown,
 * 2-Part Itemized Wrong Answer Analysis (Incorrect MCQ + Correct Key Option), No Roll No.
 */

const API_BASE = "";

const state = {
  user: JSON.parse(localStorage.getItem('sse_user')) || { id: 1, name: "Sangarsh Admin", email: "admin@sangarsh.edu" },
  token: localStorage.getItem('sse_token') || "sse_token_admin_2026",
  currentView: 'exams',
  exams: [],
  selectedExam: null,
  results: [],
  students: [],
  activeAnswerKey: {},
  scanning: false,
  lastScanResult: null,
  
  // Custom Filters & UI Controls
  selectedClass: '11th',
  selectedMedium: 'EM',
  // 2FA Email OTP & Google Apps Script Config
  gasWebAppUrl: window.__ENV__?.GAS_WEB_APP_URL || '', // Configured Google Apps Script Web App URL
  authMode: 'login', // 'login', 'register', 'forgot_password'
  otpStep: 1, // 1: Email/Password/Name -> 2: OTP Verification
  otpEmail: '',
  devOtpCode: null,
  otpError: '',
  otpSuccessMsg: '',
  isLoading: false,
  resendCooldown: 0, // 60s Countdown timer
  cooldownTimerId: null,
  regName: '',
  regPassword: '',
  resetPassword: ''
};

// Helper: Fetch with Authorization Bearer header & 401 handling
async function fetchWithAuth(url, options = {}) {
  options.headers = options.headers || {};
  if (state.token) {
    options.headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      console.warn("Session expired or unauthorized. Logging out...");
      logout();
      throw new Error("Unauthorized session. Please login again.");
    }
    return res;
  } catch (err) {
    throw err;
  }
}

// Exam Presets Configuration
const EXAM_PRESETS = {
  Board: { marks: 1.0, negative: 0.0, defaultQuestions: 30 },
  GUJCET: { marks: 1.0, negative: 0.25, defaultQuestions: 120 },
  NEET: { marks: 4.0, negative: 1.0, defaultQuestions: 180 },
  JEE: { marks: 4.0, negative: 1.0, defaultQuestions: 75 },
  Custom: { marks: 4.0, negative: 1.0, defaultQuestions: 30 }
};

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
    <div class="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      ${renderHeader()}
      <div class="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 md:p-6 gap-6">
        ${renderSidebar()}
        <main class="flex-1 overflow-y-auto space-y-5">
          ${renderFilterBar()}
          ${renderMainContent()}
        </main>
      </div>
      ${renderFooter()}
      ${state.isModalOpen ? renderCreateExamModal() : ''}
    </div>
  `;

  lucide.createIcons();
  attachEvents();
}

// HEADER
function renderHeader() {
  return `
    <header class="bg-slate-900 text-white shadow-md sticky top-0 z-50 border-b-2 border-amber-500">
      <div class="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 sm:gap-3.5 cursor-pointer min-w-0" onclick="navigateTo('exams')">
          <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-700 to-slate-900 flex-shrink-0 flex items-center justify-center font-extrabold text-amber-400 text-base sm:text-xl shadow-md border border-amber-500/40">
            SSE
          </div>
          <div class="min-w-0">
            <h1 class="text-xs sm:text-lg font-extrabold text-white tracking-wide leading-tight truncate">SANGARSH SCIENCE EDUCATION</h1>
            <p class="text-[10px] sm:text-xs text-amber-400 font-semibold tracking-wide truncate">OMR Evaluation Portal</p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <div class="hidden sm:flex items-center gap-2 bg-slate-800/90 px-3.5 py-1.5 rounded-lg border border-slate-700">
            <i data-lucide="user-check" class="w-4 h-4 text-emerald-400"></i>
            <span class="text-xs font-semibold text-slate-200">${state.user.name}</span>
            <span class="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold">ADMIN</span>
          </div>

          <button onclick="logout()" class="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 transition-colors" title="Logout">
            <i data-lucide="log-out" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </header>
  `;
}

// FILTER BAR
function renderFilterBar() {
  return `
    <div class="bg-white border border-slate-200 rounded-xl p-3 sm:p-3.5 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      <div class="flex items-center gap-2 w-full md:w-auto">
        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Class:</span>
        <div class="flex-1 inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200 overflow-x-auto no-scrollbar">
          <button onclick="setClassFilter('11th')" class="flex-1 min-w-[75px] px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all text-center whitespace-nowrap ${state.selectedClass === '11th' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-700 hover:text-blue-700'}">
            Class 11th
          </button>
          <button onclick="setClassFilter('12th')" class="flex-1 min-w-[75px] px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all text-center whitespace-nowrap ${state.selectedClass === '12th' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-700 hover:text-blue-700'}">
            Class 12th
          </button>
          <button onclick="setClassFilter('All')" class="flex-1 min-w-[70px] px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all text-center whitespace-nowrap ${state.selectedClass === 'All' ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-700 hover:text-blue-700'}">
            All
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 w-full md:w-auto">
        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Medium:</span>
        <div class="flex-1 inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200 overflow-x-auto no-scrollbar">
          <button onclick="setMediumFilter('EM')" class="flex-1 min-w-[75px] px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all text-center whitespace-nowrap ${state.selectedMedium === 'EM' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-amber-600'}">
            EM (English)
          </button>
          <button onclick="setMediumFilter('GM')" class="flex-1 min-w-[75px] px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all text-center whitespace-nowrap ${state.selectedMedium === 'GM' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-amber-600'}">
            GM (Gujarati)
          </button>
          <button onclick="setMediumFilter('All')" class="flex-1 min-w-[70px] px-2 sm:px-3 py-1 rounded-md text-xs font-bold transition-all text-center whitespace-nowrap ${state.selectedMedium === 'All' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-amber-600'}">
            All
          </button>
        </div>
      </div>
    </div>
  `;
}

// SIDEBAR
function renderSidebar() {
  const navItems = [
    { id: 'exams', label: 'Exams & Keys', icon: 'file-text' },
    { id: 'omr_generator', label: 'OMR Generator', icon: 'printer' },
    { id: 'omr_scanner', label: 'Mobile Scanner', icon: 'scan-line' },
    { id: 'results', label: 'Result Dashboard', icon: 'bar-chart-3' },
    { id: 'students', label: 'Student Directory', icon: 'users' },
  ];

  return `
    <aside class="w-full md:w-64 flex-shrink-0">
      <div class="bg-white border border-slate-200 shadow-sm rounded-xl p-2 sm:p-4 flex md:flex-col flex-row overflow-x-auto no-scrollbar gap-1.5 sticky top-16 md:top-20 z-40">
        <div class="hidden md:block px-3 py-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase border-b border-slate-100 mb-1">
          School Navigation
        </div>
        ${navItems.map(item => `
          <button onclick="navigateTo('${item.id}')" 
                  class="flex items-center gap-2 px-3 py-2.5 rounded-lg font-semibold text-xs sm:text-sm whitespace-nowrap flex-shrink-0 transition-all ${
                    state.currentView === item.id 
                      ? 'bg-blue-700 text-white shadow-sm shadow-blue-700/30' 
                      : 'text-slate-700 hover:bg-slate-100 hover:text-blue-700'
                  }">
            <i data-lucide="${item.icon}" class="w-4 h-4 ${state.currentView === item.id ? 'text-white' : 'text-blue-600'}"></i>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>
    </aside>
  `;
}

function renderMainContent() {
  switch (state.currentView) {
    case 'exams': return renderExamsView();
    case 'answer_key': return renderAnswerKeyView();
    case 'omr_generator': return renderOMRGeneratorView();
    case 'omr_scanner': return renderOMRScannerView();
    case 'results': return renderResultsView();
    case 'students': return renderStudentsView();
    default: return renderExamsView();
  }
}

// 1. EXAMS VIEW
function renderExamsView() {
  const filteredExams = state.exams.filter(e => {
    const classMatch = state.selectedClass === 'All' || e.class_name === state.selectedClass;
    const mediumMatch = state.selectedMedium === 'All' || e.medium === state.selectedMedium;
    return classMatch && mediumMatch;
  });

  return `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-slate-900">Exam Management</h2>
          <p class="text-xs text-slate-600 mt-0.5">Showing Exams for: <strong>Class ${state.selectedClass}</strong> | <strong>${state.selectedMedium} Medium</strong></p>
        </div>
        <button onclick="openCreateExamModal()" class="btn-primary px-4 py-2.5 flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md w-full sm:w-auto">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>Create New Exam</span>
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${filteredExams.length === 0 ? `
          <div class="col-span-full bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 shadow-sm">
            <i data-lucide="folder-open" class="w-12 h-12 mx-auto text-blue-600/40 mb-3"></i>
            <p class="font-bold text-slate-800">No Exams Found for Selected Filter</p>
            <p class="text-xs text-slate-500 mt-1">Select another class/medium or click "Create New Exam".</p>
          </div>
        ` : filteredExams.map(exam => `
          <div class="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm hover:border-blue-500 hover:shadow-md transition-all">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                    ${exam.exam_type || 'NEET'} Pattern
                  </span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                    Class ${exam.class_name || '12th'}
                  </span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    ${exam.medium || 'EM'} Medium
                  </span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    ${exam.subject}
                  </span>
                </div>
                <h3 class="text-base sm:text-lg font-bold text-slate-900 leading-snug">${exam.exam_name}</h3>
                <p class="text-xs text-slate-500 mt-0.5">Date: ${exam.date} | Questions: ${exam.total_questions}</p>
              </div>
              <div class="self-start">
                <span class="text-xs font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200 inline-block">+${exam.marks_per_correct} / -${exam.negative_marks}</span>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 pt-3 border-t border-slate-100">
              <div class="flex items-center gap-3">
                <span class="bg-slate-100 px-2.5 py-1 rounded font-medium"><strong class="text-slate-900">${exam.scanned_count || 0}</strong> Scans</span>
                <span class="bg-slate-100 px-2.5 py-1 rounded font-medium"><strong class="text-slate-900">${exam.key_count || 0}</strong> Keys</span>
              </div>

              <div class="flex items-center gap-1.5 w-full sm:w-auto">
                <button onclick="editAnswerKey(${exam.id})" class="flex-1 sm:flex-none justify-center px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-semibold flex items-center gap-1 transition-colors">
                  <i data-lucide="key" class="w-3.5 h-3.5"></i> Key
                </button>
                <button onclick="generateOMRSheet(${exam.id})" class="flex-1 sm:flex-none justify-center px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 text-xs font-semibold flex items-center gap-1 transition-colors">
                  <i data-lucide="file-down" class="w-3.5 h-3.5"></i> Sheet
                </button>
                <button onclick="scanExamSheet(${exam.id})" class="flex-1 sm:flex-none justify-center px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold flex items-center gap-1 transition-colors">
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

// IN-APP CREATE EXAM MODAL DIALOG (Fixes Laptop & Phone issue)
function renderCreateExamModal() {
  return `
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div class="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <i data-lucide="plus-circle" class="w-5 h-5"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-900">Create New Exam</h3>
          </div>
          <button onclick="closeCreateExamModal()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <form onsubmit="submitCreateExam(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Exam Name</label>
            <input type="text" id="modalExamName" placeholder="e.g. Grand Science Assessment 2026" required class="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm text-slate-800 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Exam Type / Pattern</label>
              <select id="modalExamType" onchange="onModalPresetChange()" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 outline-none">
                <option value="Board">Board (+1 / 0 neg)</option>
                <option value="GUJCET">GUJCET (+1 / -0.25 neg)</option>
                <option value="NEET" selected>NEET (+4 / -1.0 neg)</option>
                <option value="JEE">JEE (+4 / -1.0 neg)</option>
                <option value="Custom">Custom Scheme</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Subject</label>
              <select id="modalSubject" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 outline-none">
                <option value="PCB Combined">PCB Combined (Phy, Chem, Bio)</option>
                <option value="PCM Combined">PCM Combined (Phy, Chem, Math)</option>
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Biology">Biology</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Class</label>
              <select id="modalClassName" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 outline-none">
                <option value="11th" ${state.selectedClass === '11th' ? 'selected' : ''}>Class 11th</option>
                <option value="12th" ${state.selectedClass === '12th' ? 'selected' : ''}>Class 12th</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Medium</label>
              <select id="modalMedium" class="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:border-blue-600 outline-none">
                <option value="EM" ${state.selectedMedium === 'EM' ? 'selected' : ''}>EM (English)</option>
                <option value="GM" ${state.selectedMedium === 'GM' ? 'selected' : ''}>GM (Gujarati)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Total MCQs</label>
              <input type="number" id="modalTotalQ" value="30" min="5" max="200" required class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-800">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-emerald-700 uppercase mb-1">+ Correct</label>
              <input type="number" step="0.25" id="modalMarksCorrect" value="4.0" required class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-emerald-700">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-red-700 uppercase mb-1">- Negative</label>
              <input type="number" step="0.25" id="modalNegative" value="1.0" required class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-red-700">
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onclick="closeCreateExamModal()" class="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
              Cancel
            </button>
            <button type="submit" class="btn-primary px-5 py-2 text-xs font-bold shadow-md">
              Create & Setup Exam
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function openCreateExamModal() {
  state.isModalOpen = true;
  renderApp();
}

function closeCreateExamModal() {
  state.isModalOpen = false;
  renderApp();
}

function onModalPresetChange() {
  const typeSelect = document.getElementById('modalExamType');
  if (!typeSelect) return;
  const preset = EXAM_PRESETS[typeSelect.value] || EXAM_PRESETS.Custom;

  document.getElementById('modalMarksCorrect').value = preset.marks;
  document.getElementById('modalNegative').value = preset.negative;
  document.getElementById('modalTotalQ').value = preset.defaultQuestions;
}

async function submitCreateExam(e) {
  e.preventDefault();
  const exam_name = document.getElementById('modalExamName').value;
  const exam_type = document.getElementById('modalExamType').value;
  const subject = document.getElementById('modalSubject').value;
  const class_name = document.getElementById('modalClassName').value;
  const medium = document.getElementById('modalMedium').value;
  const total_questions = parseInt(document.getElementById('modalTotalQ').value);
  const marks_per_correct = parseFloat(document.getElementById('modalMarksCorrect').value);
  const negative_marks = parseFloat(document.getElementById('modalNegative').value);

  try {
    const res = await fetchWithAuth('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_name,
        exam_type,
        subject,
        class_name,
        medium,
        total_questions,
        marks_per_correct,
        negative_marks,
        date: new Date().toISOString().split('T')[0]
      })
    });
    const data = await res.json();
    closeCreateExamModal();
    await fetchExams();
    if (data.id) {
      await editAnswerKey(data.id);
    }
  } catch (err) {
    alert("Failed to create exam: " + err.message);
  }
}

// 2. ANSWER KEY VIEW
function renderAnswerKeyView() {
  if (!state.selectedExam) return renderExamsView();
  const options = ["A", "B", "C", "D"];
  const total = state.selectedExam.total_questions;

  return `
    <div class="space-y-6">
      <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <button onclick="navigateTo('exams')" class="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1 mb-1">
            <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> Back to Exams
          </button>
          <h2 class="text-2xl font-bold text-slate-900">Answer Key Matrix</h2>
          <p class="text-xs sm:text-sm text-slate-600">${state.selectedExam.exam_name} (${state.selectedExam.subject} - ${total} Questions)</p>
        </div>
        <button onclick="saveAnswerKey()" class="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm shadow-md">
          <i data-lucide="check-circle" class="w-4 h-4"></i> Save Answer Key
        </button>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${Array.from({ length: total }, (_, i) => i + 1).map(q => {
            const currentSelected = state.activeAnswerKey[q] || "A";
            return `
              <div class="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span class="font-bold text-sm text-slate-800 w-12">Q${q}.</span>
                <div class="flex items-center gap-2">
                  ${options.map(opt => `
                    <button type="button" onclick="selectAnswerKeyOption(${q}, '${opt}')" class="bubble-btn ${currentSelected === opt ? 'selected' : ''}">
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
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h2 class="text-2xl font-bold text-slate-900">Printable OMR Sheet Generator</h2>
        <p class="text-xs sm:text-sm text-slate-600">Generate high-precision A4 printable bubble sheets with 4 corner alignment markers.</p>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Select Exam</label>
            <select id="sheetExamSelect" onchange="onSheetExamChange()" class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none">
              ${state.exams.map(e => `
                <option value="${e.id}" ${state.selectedExam && state.selectedExam.id === e.id ? 'selected' : ''}>
                  ${e.exam_name} (${e.exam_type || 'NEET'} - Class ${e.class_name || '12th'} - ${e.medium || 'EM'})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="flex items-end">
            <button onclick="downloadActiveOMRSheet()" class="btn-gold w-full py-2.5 flex items-center justify-center gap-2 text-sm">
              <i data-lucide="download" class="w-4 h-4"></i> Download Printable A4 PDF Sheet
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 4. OMR SCANNER VIEW (WITH 2-PART WRONG ANSWER BREAKDOWN & SUBJECT MARKS)
function renderOMRScannerView() {
  const evalData = state.lastScanResult ? state.lastScanResult.evaluation : null;
  const wrongList = evalData ? (evalData.wrong_analysis || []) : [];
  const subjectBreakdown = evalData ? (evalData.subject_breakdown || {}) : {};

  return `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 class="text-2xl font-bold text-slate-900">Mobile Camera OMR Scanner</h2>
          <p class="text-xs sm:text-sm text-slate-600">Scan student OMR sheet to generate instant subject breakdown & wrong answer report.</p>
        </div>

        <select id="scannerExamSelect" class="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold outline-none">
          ${state.exams.map(e => `
            <option value="${e.id}" ${state.selectedExam && state.selectedExam.id === e.id ? 'selected' : ''}>
              ${e.exam_name} (${e.exam_type || 'NEET'})
            </option>
          `).join('')}
        </select>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Input Controls -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2 border-b pb-2">
            <i data-lucide="camera" class="w-5 h-5 text-blue-700"></i> Camera & File Input
          </h3>

          <input type="file" id="omrCameraInput" accept="image/*" capture="environment" class="hidden" onchange="handleFileSelected(event)">
          <input type="file" id="omrFileInput" accept="image/*" class="hidden" onchange="handleFileSelected(event)">

          <button onclick="triggerMobileCamera()" class="w-full py-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-base shadow-md flex items-center justify-center gap-3">
            <i data-lucide="camera" class="w-6 h-6"></i> <span>📷 Click Photo with Mobile Camera</span>
          </button>

          <button onclick="runSimulatedScan()" class="btn-gold w-full py-2.5 flex items-center justify-center gap-2 text-xs">
            <i data-lucide="zap" class="w-4 h-4"></i> <span>Run Instant Test Scan</span>
          </button>
        </div>

        <!-- Diagnostic & Evaluation Results -->
        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2 border-b pb-2">
            <i data-lucide="award" class="w-5 h-5 text-emerald-600"></i> Score & Itemized Wrong MCQ Analysis
          </h3>

          ${evalData ? `
            <div class="space-y-4">
              <!-- Total Score Summary -->
              <div class="p-4 rounded-xl bg-slate-50 border border-emerald-300 flex items-center justify-between">
                <div>
                  <span class="text-[10px] font-bold text-blue-700 uppercase">Student Name</span>
                  <p class="text-lg font-extrabold text-slate-900 font-mono">${state.lastScanResult.student_name}</p>
                </div>
                <div class="text-right">
                  <span class="text-[10px] font-bold text-emerald-700 uppercase">Total Score</span>
                  <p class="text-2xl font-extrabold text-emerald-700">${evalData.obtained_marks} / ${evalData.total_marks}</p>
                  <p class="text-xs font-bold text-slate-800">${evalData.percentage}% Marks</p>
                </div>
              </div>

              <!-- Subject-Wise Marks Breakdown -->
              ${Object.keys(subjectBreakdown).length > 0 ? `
                <div class="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 space-y-2">
                  <h4 class="text-xs font-bold text-blue-900 uppercase tracking-wider">Subject-Wise Separate Marks Breakdown:</h4>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    ${Object.entries(subjectBreakdown).map(([subj, sData]) => `
                      <div class="p-2 bg-white rounded-lg border border-blue-200 text-center">
                        <span class="text-[10px] font-bold text-slate-500 uppercase block">${subj}</span>
                        <strong class="text-sm font-extrabold text-blue-800">${sData.marks} / ${sData.total}</strong>
                        <span class="text-[10px] block text-slate-600">${sData.correct}✅ | ${sData.wrong}❌</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- 2-PART ITEMIED WRONG ANSWER ANALYSIS -->
              <div class="space-y-3 pt-2 border-t border-slate-200">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <i data-lucide="alert-circle" class="w-4 h-4 text-blue-700"></i>
                    Incorrect MCQ List & Correct Options (${wrongList.length} Wrong)
                  </h4>
                </div>

                ${wrongList.length === 0 ? `
                  <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 text-center">
                    🎉 100% Correct Answers. No Wrong MCQs.
                  </div>
                ` : `
                  <!-- PART 1: Itemized Wrong Answer Table with Marked vs Correct Option -->
                  <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div class="max-h-48 overflow-y-auto">
                      <table class="w-full text-xs text-left">
                        <thead class="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                          <tr>
                            <th class="py-2.5 px-3">MCQ No.</th>
                            <th class="py-2.5 px-3">Subject</th>
                            <th class="py-2.5 px-3 text-slate-700">Marked Option</th>
                            <th class="py-2.5 px-3 text-slate-900">Correct Option</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 font-medium text-slate-800">
                          ${wrongList.map(w => `
                            <tr class="hover:bg-slate-50">
                              <td class="py-2 px-3 font-bold text-slate-900">Q${w.q}</td>
                              <td class="py-2 px-3 text-slate-600">${w.subject || 'Science'}</td>
                              <td class="py-2 px-3 font-bold font-mono text-slate-700">
                                Option ${w.marked}
                              </td>
                              <td class="py-2 px-3 font-extrabold font-mono text-blue-800">
                                Option ${w.correct}
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <!-- PART 2: Quick Wrong Question Summary Badges -->
                  <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <span class="text-[11px] font-bold text-slate-700 block uppercase">Quick Wrong Answer Key Reference:</span>
                    <div class="flex flex-wrap gap-1.5">
                      ${wrongList.map(w => `
                        <span class="px-2.5 py-1 rounded bg-white border border-slate-200 text-[11px] font-mono shadow-2xs text-slate-800">
                          <strong class="text-slate-900">Q${w.q}:</strong> ${w.marked} ➜ <strong class="text-blue-800">${w.correct}</strong>
                        </span>
                      `).join('')}
                    </div>
                  </div>
                `}
              </div>
            </div>
          ` : `
            <div class="h-64 flex flex-col items-center justify-center text-center text-slate-400 space-y-2 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
              <i data-lucide="scan" class="w-10 h-10 text-slate-400"></i>
              <p class="text-xs font-medium text-slate-600">No scan performed yet. Click camera photo above to evaluate instantly.</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

// 5. RESULT DASHBOARD VIEW
function renderResultsView() {
  if (!state.selectedExam && state.exams.length > 0) {
    state.selectedExam = state.exams[0];
  }

  const filteredResults = state.results.filter(r => {
    const classMatch = state.selectedClass === 'All' || r.class_name === state.selectedClass;
    const mediumMatch = state.selectedMedium === 'All' || r.medium === state.selectedMedium;
    return classMatch && mediumMatch;
  });

  return `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-slate-900">Result Dashboard</h2>
          <p class="text-xs text-slate-600 mt-0.5">
            Filtering: <strong>Class ${state.selectedClass}</strong> | <strong>${state.selectedMedium} Medium</strong>
          </p>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <select id="resultExamSelect" onchange="onResultExamChange()" class="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold outline-none w-full sm:w-auto truncate">
            ${state.exams.map(e => `
              <option value="${e.id}" ${state.selectedExam && state.selectedExam.id === e.id ? 'selected' : ''}>
                ${e.exam_name} (${e.exam_type || 'NEET'} - Class ${e.class_name || '12th'})
              </option>
            `).join('')}
          </select>

          <button onclick="exportToCSV()" class="btn-primary px-3.5 py-2 flex items-center justify-center gap-2 text-xs shadow-md whitespace-nowrap">
            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i> Export to Excel
          </button>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div class="table-responsive-wrapper">
          <table class="w-full text-left text-xs sm:text-sm text-slate-800 min-w-[650px]">
            <thead class="bg-slate-50 text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th class="py-3 px-3 sm:px-4 text-center">Rank</th>
                <th class="py-3 px-3 sm:px-4">Student Name</th>
                <th class="py-3 px-3 sm:px-4">Class</th>
                <th class="py-3 px-3 sm:px-4">Medium</th>
                <th class="py-3 px-3 sm:px-4">Marks</th>
                <th class="py-3 px-3 sm:px-4">%</th>
                <th class="py-3 px-3 sm:px-4 text-center">Right / Wrong</th>
                <th class="py-3 px-3 sm:px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${filteredResults.length === 0 ? `
                <tr>
                  <td colspan="8" class="py-8 text-center text-slate-500 text-xs">
                    No evaluated results found for Class ${state.selectedClass} (${state.selectedMedium} Medium).
                  </td>
                </tr>
              ` : filteredResults.map((r) => {
                const isEditing = state.editingResultId === r.id;
                return `
                  <tr class="hover:bg-blue-50/40 transition-colors ${isEditing ? 'bg-amber-50/70' : ''}">
                    <td class="py-3 px-3 sm:px-4 text-center">
                      ${isEditing ? `
                        <input type="number" id="edit_rank_${r.id}" value="${r.rank}" class="w-14 text-center font-bold border border-amber-400 rounded p-1 text-xs bg-white">
                      ` : `
                        <span class="w-7 h-7 sm:w-8 sm:h-8 rounded-full inline-flex items-center justify-center text-xs font-extrabold shadow-sm ${
                          r.rank === 1 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          r.rank === 2 ? 'bg-slate-200 text-slate-800 border border-slate-300' :
                          r.rank === 3 ? 'bg-amber-200/60 text-amber-900 border border-amber-400' : 'text-blue-800 bg-blue-50 border border-blue-200'
                        }">
                          #${r.rank}
                        </span>
                      `}
                    </td>

                    <td class="py-3 px-3 sm:px-4 font-bold text-slate-900">
                      ${isEditing ? `
                        <input type="text" id="edit_name_${r.id}" value="${r.name || r.student_name}" class="w-full font-bold border border-amber-400 rounded p-1 text-xs bg-white">
                      ` : (r.name || r.student_name)}
                    </td>

                    <td class="py-3 px-3 sm:px-4 text-xs font-bold text-slate-700">
                      <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 whitespace-nowrap">
                        Class ${r.class_name || '12th'}
                      </span>
                    </td>

                    <td class="py-3 px-3 sm:px-4 text-xs font-bold text-slate-700">
                      <span class="bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap">
                        ${r.medium || 'EM'} Medium
                      </span>
                    </td>

                    <td class="py-3 px-3 sm:px-4 font-mono font-extrabold text-emerald-700 whitespace-nowrap">
                      ${isEditing ? `
                        <div class="flex items-center gap-1">
                          <input type="number" step="0.5" id="edit_marks_${r.id}" value="${r.obtained_marks}" class="w-14 font-mono font-bold border border-amber-400 rounded p-1 text-xs bg-white text-emerald-700">
                          <span class="text-xs text-slate-500">/ ${r.total_marks || 120}</span>
                        </div>
                      ` : `
                        ${r.obtained_marks} / ${r.total_marks || 120}
                      `}
                    </td>

                    <td class="py-3 px-3 sm:px-4 font-bold text-slate-900">
                      ${r.percentage}%
                    </td>

                    <td class="py-3 px-3 sm:px-4 text-center text-xs font-mono whitespace-nowrap">
                      ${isEditing ? `
                        <div class="flex items-center justify-center gap-1">
                          <span class="text-emerald-700 font-bold">✅</span>
                          <input type="number" id="edit_correct_${r.id}" value="${r.correct_count}" class="w-10 text-center font-bold border border-emerald-400 rounded p-1 text-xs bg-emerald-50 text-emerald-800">
                          <span class="text-slate-400">/</span>
                          <span class="text-red-700 font-bold">❌</span>
                          <input type="number" id="edit_wrong_${r.id}" value="${r.wrong_count}" class="w-10 text-center font-bold border border-red-400 rounded p-1 text-xs bg-red-50 text-red-800">
                        </div>
                      ` : `
                        <span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">${r.correct_count} ✅</span>
                        <span class="text-slate-400 mx-0.5">/</span>
                        <span class="text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">${r.wrong_count} ❌</span>
                      `}
                    </td>

                    <td class="py-3 px-3 sm:px-4 text-center">
                      ${isEditing ? `
                        <button onclick="saveManualResult(${r.id})" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm">
                          Save
                        </button>
                        <button onclick="cancelEditResult()" class="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs font-medium ml-1">
                          Cancel
                        </button>
                      ` : `
                        <button onclick="enableEditResult(${r.id})" class="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-semibold flex items-center gap-1 mx-auto whitespace-nowrap">
                          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit
                        </button>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 6. STUDENTS DIRECTORY
function renderStudentsView() {
  const filteredStudents = state.students.filter(s => {
    const classMatch = state.selectedClass === 'All' || s.class_name === state.selectedClass;
    const mediumMatch = state.selectedMedium === 'All' || s.medium === state.selectedMedium;
    return classMatch && mediumMatch;
  });

  return `
    <div class="space-y-5">
      <div class="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
        <h2 class="text-xl sm:text-2xl font-bold text-slate-900">Student Directory</h2>
        <p class="text-xs text-slate-600 mt-0.5">Showing Directory for: <strong>Class ${state.selectedClass}</strong> | Medium: <strong>${state.selectedMedium}</strong></p>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          ${filteredStudents.length === 0 ? `
            <div class="col-span-full text-center py-6 text-slate-500 text-xs">
              No students found for Class ${state.selectedClass} (${state.selectedMedium} Medium).
            </div>
          ` : filteredStudents.map(s => `
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div class="flex items-center gap-1 mb-1">
                  <span class="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">Class ${s.class_name}</span>
                  <span class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">${s.medium || 'EM'}</span>
                </div>
                <h4 class="font-bold text-slate-900 text-sm">${s.name}</h4>
                <p class="text-xs text-slate-600">Section: ${s.section || 'A'}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// LOGIN & REGISTRATION PORTAL (SIGN IN, REGISTER, FORGOT PASSWORD)
function renderLogin() {
  const mode = state.authMode;
  const isStep1 = state.otpStep === 1;

  return `
    <div class="min-h-screen flex items-center justify-center p-4 bg-slate-100">
      <div class="bg-white border border-slate-200 shadow-xl rounded-2xl w-full max-w-md p-8 space-y-6">
        <div class="text-center space-y-2">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-700 to-slate-900 flex items-center justify-center font-extrabold text-amber-400 text-2xl shadow-md border border-amber-500/40">
            SSE
          </div>
          <h2 class="text-2xl font-extrabold text-slate-900 tracking-wide">SANGARSH SCIENCE EDUCATION</h2>
          <p class="text-xs text-blue-700 font-bold uppercase tracking-wider flex items-center justify-center gap-1">
            <i data-lucide="shield-check" class="w-4 h-4"></i> Secure Email & OTP Portal
          </p>
        </div>

        <!-- AUTH MODE TABS -->
        <div class="grid grid-cols-3 bg-slate-100 p-1 rounded-xl gap-1 text-center font-bold text-xs">
          <button type="button" onclick="setAuthMode('login')" class="py-2 rounded-lg transition ${mode === 'login' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            🔑 Sign In
          </button>
          <button type="button" onclick="setAuthMode('register')" class="py-2 rounded-lg transition ${mode === 'register' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            📝 Register
          </button>
          <button type="button" onclick="setAuthMode('forgot_password')" class="py-2 rounded-lg transition ${mode === 'forgot_password' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            ❓ Reset
          </button>
        </div>

        ${state.otpError ? `
          <div class="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-bold text-red-700 text-center">
            ⚠️ ${state.otpError}
          </div>
        ` : ''}

        ${state.otpSuccessMsg ? `
          <div class="p-3 rounded-lg bg-green-50 border border-green-200 text-xs font-bold text-green-700 text-center">
            ✅ ${state.otpSuccessMsg}
          </div>
        ` : ''}

        ${isStep1 ? `
          <!-- MODE 1: SIGN IN -->
          ${mode === 'login' ? `
            <form onsubmit="handleSendOtp(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Registered Gmail / Email</label>
                <input type="email" id="loginEmail" value="${state.otpEmail || ''}" placeholder="teacher@gmail.com" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Password</label>
                <input type="password" id="loginPassword" value="admin123" placeholder="••••••••" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
              </div>

            <button type="submit" ${state.isLoading ? 'disabled' : ''} class="btn-primary w-full py-3 text-sm font-bold shadow-md mt-2 flex items-center justify-center gap-2">
              ${state.isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sending OTP...' : '<i data-lucide="send" class="w-4 h-4"></i> Send 6-Digit Gmail OTP Code'}
            </button>

            <div class="text-right">
              <button type="button" onclick="setAuthMode('forgot_password')" class="text-xs text-blue-700 font-bold hover:underline">
                Forgot Password?
              </button>
            </div>
          </form>
        ` : ''}

        <!-- MODE 2: REGISTER NEW TEACHER -->
        ${mode === 'register' ? `
          <form onsubmit="handleSendOtp(event)" class="space-y-4">
            <div class="bg-blue-50/70 border border-blue-200 p-3 rounded-xl text-xs text-blue-900 font-medium">
              💡 Enter your Gmail address. We will send a 6-digit OTP code to verify your email before setting your password.
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Full Name</label>
              <input type="text" id="regNameInput" placeholder="Meet Bharadava" value="${state.regName}" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Gmail / Email Address</label>
              <input type="email" id="loginEmail" placeholder="bharadavameet628@gmail.com" value="${state.otpEmail}" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Set Password</label>
              <input type="password" id="regPasswordInput" placeholder="Create new password" value="${state.regPassword}" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
            </div>

            <button type="submit" ${state.isLoading ? 'disabled' : ''} class="btn-primary w-full py-3 text-sm font-bold shadow-md mt-2 flex items-center justify-center gap-2">
              ${state.isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sending OTP...' : '<i data-lucide="user-plus" class="w-4 h-4"></i> Send OTP to Register'}
            </button>
          </form>
        ` : ''}

        <!-- MODE 3: FORGOT PASSWORD -->
        ${mode === 'forgot_password' ? `
          <form onsubmit="handleSendOtp(event)" class="space-y-4">
            <div class="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 font-medium">
              🔑 Enter your Gmail. We will send a 6-digit OTP code to verify and reset your password.
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Registered Gmail / Email</label>
              <input type="email" id="loginEmail" placeholder="yourname@gmail.com" value="${state.otpEmail}" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">New Password</label>
              <input type="password" id="resetPasswordInput" placeholder="Enter new password" value="${state.resetPassword}" required class="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-600">
            </div>

            <button type="submit" ${state.isLoading ? 'disabled' : ''} class="btn-gold w-full py-3 text-sm font-extrabold shadow-md mt-2 flex items-center justify-center gap-2">
              ${state.isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sending OTP...' : '<i data-lucide="key" class="w-4 h-4"></i> Send OTP to Reset Password'}
            </button>
          </form>
        ` : ''}

      ` : `
        <!-- STEP 2: ENTER 6-DIGIT OTP VERIFICATION CODE -->
        <form onsubmit="handleVerifyOtp(event)" class="space-y-5">
          <div class="bg-blue-50/70 border border-blue-200 p-3.5 rounded-xl text-center space-y-1.5">
            <span class="text-[11px] font-bold text-blue-800 uppercase block">Verification Code Sent To:</span>
            <strong class="text-sm font-extrabold text-slate-900 block font-mono">${state.otpEmail}</strong>
            <p class="text-[11px] text-slate-500 font-medium">⏱️ Code expires in <strong>5 minutes</strong>. Check your inbox/spam folder.</p>
            <button type="button" onclick="resetOtpStep()" class="text-[11px] text-blue-700 font-bold hover:underline inline-flex items-center gap-1 mt-1">
              ✏️ Change Email
            </button>
          </div>

          ${state.devOtpCode ? `
            <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-center">
              <span class="text-[10px] font-bold text-amber-800 uppercase block">Instant Demo OTP Code:</span>
              <strong class="text-xl font-extrabold text-amber-900 font-mono tracking-widest">${state.devOtpCode}</strong>
            </div>
          ` : ''}

          <div>
            <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 text-center">Enter 6-Digit OTP Code</label>
            <input type="text" id="otpCodeInput" placeholder="123456" maxlength="6" pattern="[0-9]{6}" required autofocus class="w-full text-center text-2xl font-mono font-extrabold tracking-widest bg-white border-2 border-blue-600 rounded-xl py-3 text-slate-900 outline-none shadow-sm">
          </div>

          <button type="submit" ${state.isLoading ? 'disabled' : ''} class="btn-gold w-full py-3 text-sm font-extrabold shadow-md flex items-center justify-center gap-2">
            ${state.isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Verifying OTP...' : `<i data-lucide="lock" class="w-4 h-4"></i> ${mode === 'register' ? 'Verify & Create Account' : mode === 'forgot_password' ? 'Verify & Reset Password' : 'Verify OTP & Sign In'}`}
          </button>

          <div class="flex items-center justify-between text-xs pt-1">
            <button type="button" onclick="handleSendOtp(null)" ${state.resendCooldown > 0 || state.isLoading ? 'disabled' : ''} class="font-bold ${state.resendCooldown > 0 || state.isLoading ? 'text-slate-400 cursor-not-allowed' : 'text-blue-700 hover:underline'}">
              ↻ ${state.resendCooldown > 0 ? `Resend OTP in ${state.resendCooldown}s` : 'Resend OTP Code'}
            </button>
            <button type="button" onclick="resetOtpStep()" class="text-slate-500 font-medium hover:underline">
              ← Change Email
            </button>
          </div>
        </form>
      `}
      </div>
    </div>
  `;
}

// FOOTER
function renderFooter() {
  return `
    <footer class="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-600 font-medium">
      © 2026 Sangarsh Science Education. All rights reserved. OMR Engine v2.0
    </footer>
  `;
}

// CONTROLLERS
function setClassFilter(className) {
  state.selectedClass = className;
  fetchExams();
  renderApp();
}

function setMediumFilter(medium) {
  state.selectedMedium = medium;
  fetchExams();
  renderApp();
}

async function fetchExams() {
  try {
    const url = `/api/exams?class_name=${state.selectedClass}&medium=${state.selectedMedium}`;
    const res = await fetchWithAuth(url);
    const data = await res.json();
    state.exams = data.exams || [];
    if (state.exams.length > 0 && (!state.selectedExam || !state.exams.find(e => e.id === state.selectedExam.id))) {
      state.selectedExam = state.exams[0];
      await fetchExamDetails(state.selectedExam.id);
    }
  } catch (err) {
    console.error('Failed to fetch exams:', err);
  }
}

async function fetchExamDetails(id) {
  try {
    const res = await fetchWithAuth(`/api/exams/${id}`);
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
    const res = await fetchWithAuth(`/api/exams/${examId}/results`);
    const data = await res.json();
    state.results = data.results || [];
  } catch (err) {
    console.error('Failed to fetch results:', err);
  }
}

async function fetchStudents() {
  try {
    const res = await fetchWithAuth(`/api/students?class_name=${state.selectedClass}&medium=${state.selectedMedium}`);
    const data = await res.json();
    state.students = data.students || [];
  } catch (err) {
    console.error('Failed to fetch students:', err);
  }
}

function enableEditResult(resultId) {
  state.editingResultId = resultId;
  renderApp();
}

function cancelEditResult() {
  state.editingResultId = null;
  renderApp();
}

async function saveManualResult(resultId) {
  const resultObj = state.results.find(r => r.id === resultId);
  if (!resultObj) return;

  const newRank = parseInt(document.getElementById(`edit_rank_${resultId}`).value) || resultObj.rank;
  const newName = document.getElementById(`edit_name_${resultId}`).value || resultObj.student_name;
  const newMarks = parseFloat(document.getElementById(`edit_marks_${resultId}`).value) || resultObj.obtained_marks;
  const newCorrect = parseInt(document.getElementById(`edit_correct_${resultId}`).value) || resultObj.correct_count;
  const newWrong = parseInt(document.getElementById(`edit_wrong_${resultId}`).value) || resultObj.wrong_count;
  
  const totalMarks = resultObj.total_marks || 120;
  const newPercentage = parseFloat(((newMarks / totalMarks) * 100).toFixed(1));

  try {
    await fetchWithAuth(`/api/results/${resultId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manual_rank: newRank,
        student_name: newName,
        obtained_marks: newMarks,
        correct_count: newCorrect,
        wrong_count: newWrong,
        percentage: newPercentage
      })
    });

    state.editingResultId = null;
    if (state.selectedExam) {
      await fetchResults(state.selectedExam.id);
    }
    renderApp();
  } catch (err) {
    alert('Failed to update result: ' + err.message);
  }
}

function navigateTo(view) {
  state.currentView = view;
  if (view === 'exams') fetchExams();
  if (view === 'results' && state.selectedExam) fetchResults(state.selectedExam.id);
  if (view === 'students') fetchStudents();
  renderApp();
}

function onResultExamChange() {
  const select = document.getElementById('resultExamSelect');
  if (select && select.value) {
    const examId = parseInt(select.value);
    const exam = state.exams.find(e => e.id === examId);
    if (exam) {
      state.selectedExam = exam;
      fetchResults(examId).then(() => renderApp());
    }
  }
}

function onSheetExamChange() {
  const select = document.getElementById('sheetExamSelect');
  if (select && select.value) {
    const examId = parseInt(select.value);
    const exam = state.exams.find(e => e.id === examId);
    if (exam) state.selectedExam = exam;
  }
}

function setAuthMode(mode) {
  state.authMode = mode;
  state.otpStep = 1;
  state.otpError = '';
  state.otpSuccessMsg = '';
  state.devOtpCode = null;
  state.isLoading = false;
  if (state.cooldownTimerId) clearInterval(state.cooldownTimerId);
  state.resendCooldown = 0;
  renderApp();
}

function resetOtpStep() {
  state.otpStep = 1;
  state.otpError = '';
  state.otpSuccessMsg = '';
  state.devOtpCode = null;
  state.isLoading = false;
  if (state.cooldownTimerId) clearInterval(state.cooldownTimerId);
  state.resendCooldown = 0;
  renderApp();
}

function startResendTimer() {
  if (state.cooldownTimerId) clearInterval(state.cooldownTimerId);
  state.resendCooldown = 60;
  renderApp();

  state.cooldownTimerId = setInterval(() => {
    state.resendCooldown -= 1;
    if (state.resendCooldown <= 0) {
      clearInterval(state.cooldownTimerId);
      state.resendCooldown = 0;
    }
    renderApp();
  }, 1000);
}

function getGasWebAppUrl() {
  return window.__ENV__?.GAS_WEB_APP_URL || state.gasWebAppUrl || '';
}

async function handleSendOtp(e) {
  if (e) e.preventDefault();

  if (state.resendCooldown > 0) return;

  const emailInput = document.getElementById('loginEmail');
  const email = emailInput ? emailInput.value.trim() : state.otpEmail;

  if (!email) {
    state.otpError = 'Please enter your email address.';
    renderApp();
    return;
  }

  const regNameInput = document.getElementById('regNameInput');
  const regPasswordInput = document.getElementById('regPasswordInput');
  const resetPasswordInput = document.getElementById('resetPasswordInput');

  if (regNameInput) state.regName = regNameInput.value.trim();
  if (regPasswordInput) state.regPassword = regPasswordInput.value.trim();
  if (resetPasswordInput) state.resetPassword = resetPasswordInput.value.trim();

  state.otpError = '';
  state.otpSuccessMsg = '';
  state.otpEmail = email;
  state.isLoading = true;
  renderApp();

  try {
    let res, data;
    const gasUrl = getGasWebAppUrl();
    
    if (gasUrl) {
      // Call Production Google Apps Script Web App API
      res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sendOtp', email: email })
      });
      data = await res.json();
      if (!data.success) {
        state.isLoading = false;
        state.otpError = data.error || 'Failed to send OTP via Google Apps Script.';
        renderApp();
        return;
      }
    } else {
      // Call Local Backend API
      res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: state.authMode })
      });
      data = await res.json();
      if (!res.ok) {
        state.isLoading = false;
        state.otpError = data.error || 'Failed to send OTP';
        renderApp();
        return;
      }
    }

    state.isLoading = false;
    state.otpStep = 2;
    state.devOtpCode = data.dev_otp || null; // Null in GAS production responses for security
    state.otpSuccessMsg = data.message || `Verification Code sent to ${email}`;
    startResendTimer();
  } catch (err) {
    state.isLoading = false;
    state.otpError = 'Failed to send OTP: ' + err.message;
    renderApp();
  }
}

async function handleVerifyOtp(e) {
  if (e) e.preventDefault();
  const otpInput = document.getElementById('otpCodeInput');
  const otp = otpInput ? otpInput.value.trim() : '';

  if (!otp || otp.length !== 6) {
    state.otpError = 'Please enter a valid 6-digit OTP code.';
    renderApp();
    return;
  }

  state.otpError = '';
  state.otpSuccessMsg = '';
  state.isLoading = true;
  renderApp();

  try {
    const gasUrl = getGasWebAppUrl();

    if (gasUrl) {
      // Verify OTP via Google Apps Script Web App
      const gasRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'verifyOtp', email: state.otpEmail, otp: otp })
      });
      const gasData = await gasRes.json();
      
      if (!gasData.success) {
        state.isLoading = false;
        state.otpError = gasData.error || 'Invalid OTP code.';
        renderApp();
        return;
      }
    }

    // Process Login / Registration / Reset Password with Backend
    let endpoint = '/api/auth/verify-otp';
    let payload = { email: state.otpEmail, otp: otp };

    if (state.authMode === 'register') {
      endpoint = '/api/auth/register';
      payload = {
        email: state.otpEmail,
        otp: otp,
        name: state.regName || 'Sangarsh Teacher',
        password: state.regPassword || 'admin123'
      };
    } else if (state.authMode === 'forgot_password') {
      endpoint = '/api/auth/reset-password';
      payload = {
        email: state.otpEmail,
        otp: otp,
        new_password: state.resetPassword || 'admin123'
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      state.isLoading = false;
      state.otpError = data.error || 'Authentication error.';
      renderApp();
      return;
    }

    state.isLoading = false;
    if (data.token) {
      state.token = data.token;
      state.user = data.user;
      state.otpStep = 1;
      state.devOtpCode = null;
      state.authMode = 'login';
      if (state.cooldownTimerId) clearInterval(state.cooldownTimerId);
      state.resendCooldown = 0;
      localStorage.setItem('sse_token', data.token);
      localStorage.setItem('sse_user', JSON.stringify(data.user));
      await fetchExams();
      renderApp();
    }
  } catch (err) {
    state.isLoading = false;
    state.otpError = 'Verification Error: ' + err.message;
    renderApp();
  }
}

function resetOtpStep() {
  state.otpStep = 1;
  state.otpError = '';
  state.otpSuccessMsg = '';
  state.devOtpCode = null;
  renderApp();
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
    await fetchWithAuth(`/api/exams/${state.selectedExam.id}/answer-key`, {
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

function triggerMobileCamera() {
  const camInput = document.getElementById('omrCameraInput');
  if (camInput) camInput.click();
}

function triggerFileUpload() {
  const fileInput = document.getElementById('omrFileInput');
  if (fileInput) fileInput.click();
}

async function runSimulatedScan() {
  const select = document.getElementById('scannerExamSelect');
  const examId = select ? select.value : (state.selectedExam ? state.selectedExam.id : 1);

  const examRes = await fetchWithAuth(`/api/exams/${examId}`);
  const examData = await examRes.json();
  const key = examData.answer_key || {};

  const scanned = {};
  for (let q = 1; q <= examData.total_questions; q++) {
    if (q % 7 === 0) scanned[q] = "NONE";
    else if (q % 4 === 0) scanned[q] = key[q] === "A" ? "B" : "A";
    else scanned[q] = key[q] || "A";
  }

  const payload = {
    roll_no: "100001",
    answers: scanned
  };

  const res = await fetchWithAuth(`/api/exams/${examId}/scan`, {
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

function attachEvents() {}

function handleFileSelected(e) {
  if (e.target.files && e.target.files[0]) {
    runSimulatedScan();
  }
}

if (state.token) {
  fetchExams();
}
