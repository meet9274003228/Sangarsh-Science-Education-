/** @jsx React.createElement */
const { useState, useEffect, useRef } = React;

// API Base URL config: detect if running locally or deployed on Render
const getBackendUrl = () => {
  const saved = localStorage.getItem("OMR_API_BASE_URL");
  if (saved) return saved;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || 
      hostname === "127.0.0.1" || 
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
    return "http://localhost:8000";
  }
  return window.location.origin;
};
const API_BASE_URL = getBackendUrl();

// --- MAIN APPLICATION ENTRY ---
function App() {
  const [currentPage, setCurrentPage] = useState("dashboard"); // dashboard, templates, template-editor, exams, scan, result, reports, settings
  const [templates, setTemplates] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exams, setExams] = useState([]);
  
  // App-wide state
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [activeScan, setActiveScan] = useState(null);
  const [scanningStatus, setScanningStatus] = useState("idle"); // idle, uploading, processing, done, error
  const [errorMsg, setErrorMsg] = useState("");
  const [editingTemplate, setEditingTemplate] = useState(null);
  
  // Fetch initial templates and exams on load
  const loadInitialData = async () => {
    try {
      const templatesRes = await fetch(`${API_BASE_URL}/api/templates`);
      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        setTemplates(templatesData);
        if (templatesData.length > 0) setSelectedTemplateId(templatesData[0].id);
      }
      
      const examsRes = await fetch(`${API_BASE_URL}/api/exams`);
      if (examsRes.ok) {
        const examsData = await examsRes.json();
        setExams(examsData);
        if (examsData.length > 0) setSelectedExamId(examsData[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch initial backend state", err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Update lists after creation
  const handleReload = () => {
    loadInitialData();
  };

  // Setup sidebar links
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
    { id: "templates", label: "OMR Templates", icon: "file-spreadsheet" },
    { id: "exams", label: "Exams & Keys", icon: "file-check" },
    { id: "scan", label: "Scan Sheets", icon: "scan" },
    { id: "reports", label: "Reports & Stats", icon: "bar-chart-3" },
    { id: "settings", label: "System Settings", icon: "settings" }
  ];

  // Helper to render Lucide Icons dynamically from browser loads
  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [currentPage, templates, exams, activeScan, scanningStatus]);

  return (
    <div className="app-container">
      {/* MOBILE HEADER BAR */}
      <header className="mobile-header">
        <div className="logo-container" style={{margin: 0, padding: 0}}>
          <div className="logo-icon">
            <i data-lucide="scan-line"></i>
          </div>
          <span className="logo-text">Sangarsh OMR</span>
        </div>
        <button className="menu-toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
          <i data-lucide={menuOpen ? "x" : "menu"}></i>
        </button>
      </header>

      {/* SIDEBAR NAVIGATION */}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="logo-container">
          <div className="logo-icon">
            <i data-lucide="scan-line"></i>
          </div>
          <span className="logo-text">Sangarsh OMR</span>
        </div>
        
        <nav className="nav-links">
          {menuItems.map((item) => (
            <div
              key={item.id}
              className={`nav-item ${currentPage === item.id || (item.id === "scan" && currentPage === "result") ? "active" : ""}`}
              onClick={() => {
                setCurrentPage(item.id);
                setErrorMsg("");
                setMenuOpen(false); // Close mobile drawer on routing
              }}
            >
              <i data-lucide={item.icon}></i>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        
        <div className="sidebar-footer">
          <div className="user-avatar">SSE</div>
          <div className="user-info">
            <span className="user-name">Sangarsh Admin</span>
            <span className="user-role">Teacher / Assessor</span>
          </div>
        </div>
      </aside>
      
      {/* MAIN LAYOUT WRAPPER */}
      <main className="main-content">
        {currentPage === "dashboard" && (
          <DashboardView 
            templates={templates} 
            exams={exams} 
            setCurrentPage={setCurrentPage} 
            setSelectedExamId={setSelectedExamId}
          />
        )}
        
        {currentPage === "templates" && (
          <TemplatesView 
            templates={templates} 
            onReload={handleReload}
            setCurrentPage={setCurrentPage}
            setEditingTemplate={setEditingTemplate}
          />
        )}
        
        {currentPage === "template-editor" && (
          <TemplateEditorView 
            template={editingTemplate}
            onReload={handleReload}
            setCurrentPage={setCurrentPage}
          />
        )}
        
        {currentPage === "exams" && (
          <ExamsView 
            exams={exams} 
            templates={templates} 
            onReload={handleReload}
            setSelectedExamId={setSelectedExamId}
            setCurrentPage={setCurrentPage}
          />
        )}
        
        {currentPage === "scan" && (
          <ScanView 
            exams={exams} 
            selectedExamId={selectedExamId}
            setSelectedExamId={setSelectedExamId}
            scanningStatus={scanningStatus}
            setScanningStatus={setScanningStatus}
            setActiveScan={setActiveScan}
            setCurrentPage={setCurrentPage}
            errorMsg={errorMsg}
            setErrorMsg={setErrorMsg}
          />
        )}
        
        {currentPage === "result" && activeScan && (
          <ResultView 
            activeScan={activeScan} 
            setCurrentPage={setCurrentPage}
          />
        )}
        
        {currentPage === "reports" && (
          <ReportsView 
            exams={exams}
          />
        )}
        
        {currentPage === "settings" && (
          <SettingsView />
        )}
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 1: DASHBOARD
// -------------------------------------------------------------
function DashboardView({ templates, exams, setCurrentPage, setSelectedExamId }) {
  const [latestScans, setLatestScans] = useState([]);

  useEffect(() => {
    // Collect the last 5 scans globally or for default exam
    const fetchLatestScans = async () => {
      if (exams.length === 0) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/exams/${exams[0].id}/scans`);
        if (res.ok) {
          const scansData = await res.json();
          setLatestScans(scansData.slice(-5).reverse());
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchLatestScans();
  }, [exams]);

  return (
    <div>
      <div className="header">
        <div>
          <h1 className="header-title">SSE Assessment Dashboard</h1>
          <p className="header-subtitle">Welcome back. Manage your templates, answer keys, and evaluate student marks instantly.</p>
        </div>
      </div>
      
      {/* STATS WIDGETS */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon-wrap" style={{backgroundColor: "rgba(37, 99, 235, 0.1)", color: "var(--color-primary)"}}>
            <i data-lucide="file-spreadsheet"></i>
          </div>
          <div className="metric-info">
            <span className="metric-val">{templates.length}</span>
            <span className="metric-title">OMR Templates</span>
          </div>
        </div>
        
        <div className="metric-card">
          <div className="metric-icon-wrap" style={{backgroundColor: "rgba(79, 70, 229, 0.1)", color: "var(--color-secondary)"}}>
            <i data-lucide="file-check"></i>
          </div>
          <div className="metric-info">
            <span className="metric-val">{exams.length}</span>
            <span className="metric-title">Active Exams</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap" style={{backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--color-success)"}}>
            <i data-lucide="sparkles"></i>
          </div>
          <div className="metric-info">
            <span className="metric-val">99.8%</span>
            <span className="metric-title">Scan Accuracy</span>
          </div>
        </div>
      </div>

      <div className="db-grid">
        {/* LATEST EXAMS */}
        <div className="card">
          <div className="card-title">
            <span>Recent Exam Assessments</span>
            <button className="btn btn-secondary" onClick={() => setCurrentPage("exams")}>Manage Exams</button>
          </div>
          {exams.length === 0 ? (
            <div className="empty-state">
              <i data-lucide="folder-open" className="empty-icon" style={{width: 48, height: 48}}></i>
              <p>No exams configured yet.</p>
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Exam Name</th>
                  <th>Exam Type</th>
                  <th>Subject</th>
                  <th>Questions</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {exams.slice(-5).reverse().map((exam) => (
                  <tr key={exam.id}>
                    <td style={{fontWeight: 600}}>{exam.name}</td>
                    <td><span className="badge badge-info">{exam.exam_type}</span></td>
                    <td>{exam.subject}</td>
                    <td>{exam.marks_per_correct} pts / -{exam.negative_marks}</td>
                    <td>
                      <button 
                        className="btn btn-primary" 
                        style={{padding: "6px 12px", fontSize: "12px"}}
                        onClick={() => {
                          setSelectedExamId(exam.id);
                          setCurrentPage("scan");
                        }}
                      >
                        Scan Sheet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* DETAILS PANEL */}
        <div className="card">
          <div className="card-title">Quick Action Suite</div>
          <div style={{display: "flex", flexDirection: "column", gap: "12px"}}>
            <button className="btn btn-primary" style={{width: "100%", justifyContent: "center"}} onClick={() => setCurrentPage("templates")}>
              <i data-lucide="plus-circle"></i> Create OMR Template
            </button>
            <button className="btn btn-secondary" style={{width: "100%", justifyContent: "center"}} onClick={() => setCurrentPage("scan")}>
              <i data-lucide="scan"></i> Fast Evaluation Scan
            </button>
            <button className="btn btn-secondary" style={{width: "100%", justifyContent: "center"}} onClick={() => setCurrentPage("reports")}>
              <i data-lucide="bar-chart-3"></i> Pull Scans Reports
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 2: TEMPLATE CREATION
// -------------------------------------------------------------
function TemplatesView({ templates, onReload, setCurrentPage, setEditingTemplate }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [questionsCount, setQuestionsCount] = useState(30);
  const [optionsCount, setOptionsCount] = useState(4);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) return;

    // Build mock coordinate system zones automatically structured for coordinate display
    const bubbleLayout = [];
    for (let q = 1; q <= questionsCount; q++) {
      const bubbles = [];
      const rowIdx = (q - 1) % 15;
      const colIdx = Math.floor((q - 1) / 15);
      
      const baseX = 100 + colIdx * 300;
      const baseY = 150 + rowIdx * 50;

      for (let o = 0; o < optionsCount; o++) {
        bubbles.push({
          option: String.fromCharCode(65 + o),
          x: baseX + o * 40,
          y: baseY,
          r: 10,
          width: 20,
          height: 20,
          normalized_x: (baseX + o * 40) / 800,
          normalized_y: baseY / 1100,
          normalized_width: 20 / 800,
          normalized_height: 20 / 1100
        });
      }
      bubbleLayout.push({ question_no: q, bubbles });
    }

    const payload = {
      name,
      questions_count: parseInt(questionsCount),
      options_count: parseInt(optionsCount),
      sheet_width: 800,
      sheet_height: 1100,
      bubble_layout: bubbleLayout,
      roll_number_config: { x: 500, y: 70, columns: 6, rows: 10, step_x: 22, step_y: 22, radius: 8 },
      alignment_markers: [
        { marker_id: 1, x: 40, y: 40 },
        { marker_id: 2, x: 760, y: 40 },
        { marker_id: 3, x: 40, y: 1060 },
        { marker_id: 4, x: 760, y: 1060 }
      ],
      question_regions: [
        { region_id: 1, name: "Section 1", x: 40, y: 120, w: 320, h: 880 },
        { region_id: 2, name: "Section 2", x: 380, y: 120, w: 380, h: 480 }
      ],
      student_id_region: { x: 500, y: 70, w: 140, h: 230 }
    };

    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setName("");
        setShowCreate(false);
        onReload();
      } else {
        const errorData = await res.json();
        setError(errorData.detail || "Unable to save template configuration. Check validation rules.");
      }
    } catch (err) {
      console.error(err);
      setError("Network timeout or connection refused from backend. Is OMR service online?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="header">
        <div>
          <h1 className="header-title">OMR Templates Library</h1>
          <p className="header-subtitle">Build bubbles layouts configs, registration corner points, and student ID areas.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <i data-lucide={showCreate ? "x" : "plus"}></i> {showCreate ? "Cancel Builder" : "New Template"}
        </button>
      </div>

      {showCreate && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="card-title">Interactive Template Creator</div>
          
          {error && (
            <div className="badge badge-error" style={{width: "100%", padding: "12px", borderRadius: "8px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>{error}</span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Template Profile Name</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="SSE 30-Question Term test" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Questions Volume</label>
              <input 
                type="number" 
                className="form-control" 
                value={questionsCount} 
                onChange={(e) => setQuestionsCount(e.target.value)} 
                min="1" 
                max="100" 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Options per Question</label>
              <select className="form-control" value={optionsCount} onChange={(e) => setOptionsCount(e.target.value)}>
                <option value="4">4 Options (A, B, C, D)</option>
                <option value="5">5 Options (A, B, C, D, E)</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
                <span className="spinner-mini"></span> Generating layout grid...
              </span>
            ) : (
              <>
                <i data-lucide="sparkles"></i> Generate Coordinate Grid Config
              </>
            )}
          </button>
        </form>
      )}

      <div className="metrics-grid" style={{gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))"}}>
        {templates.map((template) => (
          <div key={template.id} className="card">
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px"}}>
              <div>
                <h3 style={{fontSize: "18px", fontFamily: "var(--font-display)"}}>{template.name}</h3>
                <span className="badge badge-purple" style={{marginTop: "8px"}}>ID: #{template.id}</span>
              </div>
              <div className="metric-icon-wrap" style={{backgroundColor: "rgba(139, 92, 246, 0.1)", color: "var(--color-purple)", width: "36px", height: "36px"}}>
                <i data-lucide="layout-grid" style={{width: "18px", height: "18px"}}></i>
              </div>
            </div>
            
            <div style={{color: "var(--text-secondary)", fontSize: "14px", display: "flex", flexDirection: "column", gap: "6px", margin: "16px 0"}}>
              <div style={{display: "flex", justifyContent: "space-between"}}>
                <span>Questions:</span>
                <span style={{fontWeight: 600, color: "var(--text-primary)"}}>{template.questions_count}</span>
              </div>
              <div style={{display: "flex", justifyContent: "space-between"}}>
                <span>MCQ Choices:</span>
                <span style={{fontWeight: 600, color: "var(--text-primary)"}}>{template.options_count} positions</span>
              </div>
              <div style={{display: "flex", justifyContent: "space-between"}}>
                <span>Registration Markers:</span>
                <span style={{fontWeight: 600, color: "var(--text-primary)"}}>4 corners mapped</span>
              </div>
            </div>
            
            <div style={{display: "flex", gap: "10px", marginTop: "16px"}}>
              <button 
                className="btn btn-secondary" 
                style={{width: "100%", justifyContent: "center", fontSize: "13px"}}
                onClick={() => {
                  setEditingTemplate(template);
                  setCurrentPage("template-editor");
                }}
              >
                <i data-lucide="pencil"></i> Design & Edit Geometry
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW: INTERACTIVE TEMPLATE EDITOR
// -------------------------------------------------------------
function TemplateEditorView({ template, onReload, setCurrentPage }) {
  const [name, setName] = useState(template?.name || "New Template");
  const [questionsCount, setQuestionsCount] = useState(template?.questions_count || 30);
  const [optionsCount, setOptionsCount] = useState(template?.options_count || 4);
  const [sheetWidth, setSheetWidth] = useState(template?.sheet_width || 800);
  const [sheetHeight, setSheetHeight] = useState(template?.sheet_height || 1100);

  // States parsed from db json fields
  const [bubbleLayout, setBubbleLayout] = useState([]);
  const [rollNumberConfig, setRollNumberConfig] = useState({
    x: 500, y: 70, columns: 6, rows: 10, step_x: 22, step_y: 22, radius: 8
  });
  const [alignmentMarkers, setAlignmentMarkers] = useState([
    { marker_id: 1, x: 40, y: 40 },
    { marker_id: 2, x: 760, y: 40 },
    { marker_id: 3, x: 40, y: 1060 },
    { marker_id: 4, x: 760, y: 1060 }
  ]);
  const [questionRegions, setQuestionRegions] = useState([]);

  // Load layout from template
  useEffect(() => {
    if (template) {
      setName(template.name);
      setQuestionsCount(template.questions_count);
      setOptionsCount(template.options_count);
      setSheetWidth(template.sheet_width || 800);
      setSheetHeight(template.sheet_height || 1100);

      // Parse bubbles
      if (template.bubble_layout_json) {
        try {
          setBubbleLayout(JSON.parse(template.bubble_layout_json));
        } catch (e) {
          console.error("Error parsing bubble_layout_json", e);
        }
      } else if (template.bubble_layout) {
        setBubbleLayout(template.bubble_layout);
      }

      // Parse roll number config
      if (template.roll_number_config_json) {
        try {
          setRollNumberConfig(JSON.parse(template.roll_number_config_json));
        } catch (e) {}
      }

      // Parse alignment markers
      if (template.alignment_markers_json) {
        try {
          setAlignmentMarkers(JSON.parse(template.alignment_markers_json));
        } catch (e) {}
      } else if (template.alignment_markers) {
        setAlignmentMarkers(template.alignment_markers);
      }

      // Parse regions
      if (template.question_regions_json) {
        try {
          setQuestionRegions(JSON.parse(template.question_regions_json));
        } catch (e) {}
      } else if (template.question_regions) {
        setQuestionRegions(template.question_regions);
      }
    }
  }, [template]);

  // Drag state
  const [dragItem, setDragItem] = useState(null);
  const svgRef = useRef(null);

  // Layout Grid generator controls
  const [genColumns, setGenColumns] = useState(2);
  const [genRowsPerCol, setGenRowsPerCol] = useState(15);
  const [genBaseX, setGenBaseX] = useState(80);
  const [genBaseY, setGenBaseY] = useState(140);
  const [genRowGap, setGenRowGap] = useState(48);
  const [genColGap, setGenColGap] = useState(280);
  const [genOptSpacing, setGenOptSpacing] = useState(36);
  const [genRadius, setGenRadius] = useState(9);

  // Auto regenerate layout based on generator settings
  const handleRegenerateLayout = () => {
    const layout = [];
    let q = 1;
    for (let col = 0; col < genColumns; col++) {
      for (let row = 0; row < genRowsPerCol; row++) {
        if (q > questionsCount) break;
        const x = genBaseX + col * genColGap;
        const y = genBaseY + row * genRowGap;
        const bubbles = [];
        for (let o = 0; o < optionsCount; o++) {
          bubbles.push({
            option: String.fromCharCode(65 + o),
            x: x + o * genOptSpacing,
            y: y,
            r: genRadius,
            width: genRadius * 2,
            height: genRadius * 2,
            normalized_x: (x + o * genOptSpacing) / sheetWidth,
            normalized_y: y / sheetHeight,
            normalized_width: (genRadius * 2) / sheetWidth,
            normalized_height: (genRadius * 2) / sheetHeight
          });
        }
        layout.push({ question_no: q, bubbles });
        q++;
      }
    }
    setBubbleLayout(layout);
  };

  // Adjust all bubbles coordinate offset
  const shiftAllBubbles = (dx, dy) => {
    setBubbleLayout(bubbleLayout.map(q => ({
      ...q,
      bubbles: q.bubbles.map(b => ({
        ...b,
        x: Math.max(0, Math.min(sheetWidth, b.x + dx)),
        y: Math.max(0, Math.min(sheetHeight, b.y + dy)),
        normalized_x: Math.max(0, Math.min(1, (b.x + dx) / sheetWidth)),
        normalized_y: Math.max(0, Math.min(1, (b.y + dy) / sheetHeight))
      }))
    })));
  };

  // Drag event handlers
  const handleMouseDown = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    setDragItem(item);
  };

  const handleMouseMove = (e) => {
    if (!dragItem || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    
    // Calculate client mouse inside 800x1100 page coordinate grid
    const rawX = ((e.clientX - rect.left) / rect.width) * sheetWidth;
    const rawY = ((e.clientY - rect.top) / rect.height) * sheetHeight;
    
    // Clamp to boundaries
    const cx = Math.max(0, Math.min(sheetWidth, Math.round(rawX)));
    const cy = Math.max(0, Math.min(sheetHeight, Math.round(rawY)));

    if (dragItem.type === "bubble") {
      setBubbleLayout(bubbleLayout.map(q => {
        if (q.question_no === dragItem.qNo) {
          return {
            ...q,
            bubbles: q.bubbles.map((b, idx) => {
              if (idx === dragItem.bubbleIndex) {
                 return {
                   ...b,
                   x: cx,
                   y: cy,
                   normalized_x: cx / sheetWidth,
                   normalized_y: cy / sheetHeight
                 };
              }
              return b;
            })
          };
        }
        return q;
      }));
    } else if (dragItem.type === "student_id") {
      setRollNumberConfig({
        ...rollNumberConfig,
        x: Math.max(0, Math.min(sheetWidth - 100, cx)),
        y: Math.max(0, Math.min(sheetHeight - 120, cy))
      });
    } else if (dragItem.type === "marker") {
      setAlignmentMarkers(alignmentMarkers.map(m => {
        if (m.marker_id === dragItem.id) {
          return { ...m, x: cx, y: cy };
        }
        return m;
      }));
    } else if (dragItem.type === "region") {
      setQuestionRegions(questionRegions.map(r => {
        if (r.region_id === dragItem.id) {
          if (dragItem.handle === "move") {
            const rx = Math.max(0, Math.min(sheetWidth - r.w, cx - r.w / 2));
            const ry = Math.max(0, Math.min(sheetHeight - r.h, cy - r.h / 2));
            return { ...r, x: rx, y: ry };
          } else {
            const rw = Math.max(40, Math.min(sheetWidth - r.x, cx - r.x));
            const rh = Math.max(40, Math.min(sheetHeight - r.y, cy - r.y));
            return { ...r, w: rw, h: rh };
          }
        }
        return r;
      }));
    }
  };

  const handleMouseUp = () => {
    setDragItem(null);
  };

  // Add question region block
  const handleAddRegion = () => {
    const nextId = questionRegions.length > 0 ? Math.max(...questionRegions.map(r => r.region_id)) + 1 : 1;
    const colors = ["Physics Sec", "Chemistry Sec", "Biology Sec"];
    const sectionName = colors[questionRegions.length % 3] + " " + nextId;
    const newRegion = {
      region_id: nextId,
      name: sectionName,
      x: 100 + (nextId * 40),
      y: 200 + (nextId * 30),
      w: 240,
      h: 400
    };
    setQuestionRegions([...questionRegions, newRegion]);
  };

  // Delete question region block
  const handleDeleteRegion = (id) => {
    setQuestionRegions(questionRegions.filter(r => r.region_id !== id));
  };

  // Overlap checker count
  const getOverlapsCount = () => {
    let count = 0;
    const bubbles = [];
    bubbleLayout.forEach(q => {
      q.bubbles.forEach(b => {
        bubbles.push({ qNo: q.question_no, opt: b.option || b.val, x: b.x, y: b.y, r: b.r || 10 });
      });
    });
    for (let i = 0; i < bubbles.length; i++) {
       for (let j = i + 1; j < bubbles.length; j++) {
         const b1 = bubbles[i];
         const b2 = bubbles[j];
         const dist = Math.sqrt(Math.pow(b1.x - b2.x, 2) + Math.pow(b1.y - b2.y, 2));
         if (dist < (b1.r + b2.r - 2)) {
           count++;
         }
       }
    }
    return count;
  };

  // Save changes
  const handleSave = async () => {
    const serializedLayout = bubbleLayout.map(q => ({
      question_no: q.question_no,
      bubbles: q.bubbles.map(b => ({
        option: b.option || b.val || "A",
        x: b.x,
        y: b.y,
        r: b.r || 10,
        width: b.width || 20,
        height: b.height || 20,
        normalized_x: Number((b.x / sheetWidth).toFixed(5)),
        normalized_y: Number((b.y / sheetHeight).toFixed(5)),
        normalized_width: Number(((b.width || 20) / sheetWidth).toFixed(5)),
        normalized_height: Number(((b.height || 20) / sheetHeight).toFixed(5))
      }))
    }));

    const payload = {
      name,
      questions_count: parseInt(questionsCount),
      options_count: parseInt(optionsCount),
      sheet_width: sheetWidth,
      sheet_height: sheetHeight,
      bubble_layout: serializedLayout,
      roll_number_config: rollNumberConfig,
      alignment_markers: alignmentMarkers,
      question_regions: questionRegions,
      student_id_region: {
        x: rollNumberConfig.x,
        y: rollNumberConfig.y,
        w: rollNumberConfig.columns * rollNumberConfig.step_x + 10,
        h: rollNumberConfig.rows * rollNumberConfig.step_y + 10
      }
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        onReload();
        setCurrentPage("templates");
      } else {
        const errorData = await res.json();
        alert("Server validation failed: " + JSON.stringify(errorData.detail));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to reach server");
    }
  };

  // Generate roll number bubble locations
  const renderRollNumberBubbles = [];
  if (rollNumberConfig) {
    for (let c = 0; c < rollNumberConfig.columns; c++) {
      for (let r = 0; r < rollNumberConfig.rows; r++) {
        renderRollNumberBubbles.push({
          x: rollNumberConfig.x + c * rollNumberConfig.step_x + 12,
          y: rollNumberConfig.y + r * rollNumberConfig.step_y + 24,
          r: rollNumberConfig.radius,
          val: r.toString()
        });
      }
    }
  }

  const overlaps = getOverlapsCount();

  return (
    <div className="template-editor-workspace">
      {/* HEADER SECTION */}
      <div className="header" style={{marginBottom: "12px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px"}}>
        <div>
          <button className="btn btn-secondary" onClick={() => setCurrentPage("templates")} style={{marginBottom: "8px"}}>
            <i data-lucide="arrow-left"></i> Back to Templates
          </button>
          <h1 className="header-title">OMR Geometry Layout Design Editor</h1>
          <p className="header-subtitle">Edit template: <b>{template.name}</b> (ID #{template.id}) - Normalized Ratios persistence.</p>
        </div>
        <div style={{display: "flex", gap: "12px", alignItems: "center"}}>
          {overlaps > 0 ? (
            <span className="badge badge-error" style={{padding: "8px 12px"}}>
              <i data-lucide="alert-triangle"></i> {overlaps} Overlapping Bubbles
            </span>
          ) : (
            <span className="badge badge-success" style={{padding: "8px 12px"}}>
              <i data-lucide="check-circle-2"></i> Coordinate Alignment OK
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSave} style={{fontSize: "14px", height: "42px"}}>
            <i data-lucide="save"></i> Persist Geometry Changes
          </button>
        </div>
      </div>

      <div style={{display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px", alignItems: "start"}}>
        {/* RIGHT AREA: VISUAL DESIGN GRID INTERACTIVE SVG CANVAS */}
        <div className="simulated-sheet-outer" style={{display: "flex", justifyContent: "center", background: "#0f172a", padding: "16px", borderRadius: "12px", overflow: "auto"}}>
          <div 
            className="simulated-sheet" 
            style={{
              position: "relative",
              width: `${sheetWidth}px`,
              height: `${sheetHeight}px`,
              minWidth: `${sheetWidth}px`,
              minHeight: `${sheetHeight}px`,
              background: "#ffffff",
              borderRadius: "4px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              userSelect: "none"
            }}
          >
            <svg 
              ref={svgRef}
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${sheetWidth} ${sheetHeight}`}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{position: "absolute", top: 0, left: 0}}
            >
              {/* Subtle visual gridlines mesh */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* Title Info Page Overlay */}
              <text x={sheetWidth / 2} y="32" textAnchor="middle" fill="#1e293b" fontSize="16" fontWeight="800" fontFamily="var(--font-display)">
                {name.toUpperCase()} (SIMULATED OMR SHEET)
              </text>
              <line x1="40" y1="42" x2={sheetWidth - 40} y2="42" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />

              {/* DRAW CUSTOM REGIONS OUTLINES */}
              {questionRegions.map((region) => (
                <g key={region.region_id}>
                  {/* Region outline area */}
                  <rect 
                    x={region.x} 
                    y={region.y} 
                    width={region.w} 
                    height={region.h} 
                    fill="rgba(139, 92, 246, 0.05)" 
                    stroke="var(--color-purple)" 
                    strokeWidth="1.5" 
                    strokeDasharray="4 2"
                    style={{cursor: "grab"}}
                    onMouseDown={(e) => handleMouseDown(e, { type: "region", id: region.region_id, handle: "move" })}
                  />
                  {/* Label tag */}
                  <rect 
                    x={region.x} 
                    y={region.y - 20} 
                    width={110} 
                    height={20} 
                    fill="var(--color-purple)" 
                    rx="2"
                  />
                  <text 
                    x={region.x + 6} 
                    y={region.y - 6} 
                    fill="white" 
                    fontSize="10" 
                    fontWeight="bold"
                  >
                    {region.name}
                  </text>
                  {/* Top-left position indicator */}
                  <text
                    x={region.x + region.w - 90}
                    y={region.y - 6}
                    fill="rgba(255,255,255,0.7)"
                    fontSize="9"
                  >
                    X:{region.x} Y:{region.y}
                  </text>

                  {/* Resize Handle */}
                  <rect 
                    x={region.x + region.w - 10} 
                    y={region.y + region.h - 10} 
                    width="10" 
                    height="10" 
                    fill="var(--color-purple)" 
                    style={{cursor: "nwse-resize"}}
                    onMouseDown={(e) => handleMouseDown(e, { type: "region", id: region.region_id, handle: "resize" })}
                  />
                </g>
              ))}

              {/* STUDENT ID (ROLL NUMBER) BLOCKS */}
              {rollNumberConfig && (
                <g>
                  {/* Bounding box outline */}
                  <rect 
                    x={rollNumberConfig.x} 
                    y={rollNumberConfig.y} 
                    width={rollNumberConfig.columns * rollNumberConfig.step_x + 16} 
                    height={rollNumberConfig.rows * rollNumberConfig.step_y + 36} 
                    fill="rgba(59, 130, 246, 0.04)" 
                    stroke="var(--color-primary)" 
                    strokeWidth="1.5"
                    style={{cursor: "grab"}}
                    onMouseDown={(e) => handleMouseDown(e, { type: "student_id" })}
                    rx="6"
                  />
                  <text x={rollNumberConfig.x + 8} y={rollNumberConfig.y + 16} fill="var(--color-primary)" fontSize="11" fontWeight="bold">
                    STUDENT ID GRID (ROLL NO)
                  </text>

                  {/* Render number grids */}
                  {renderRollNumberBubbles.map((rb, idx) => (
                    <g key={idx}>
                      <circle 
                        cx={rb.x} 
                        cy={rb.y} 
                        r={rb.r} 
                        fill="rgba(59, 130, 246, 0.08)" 
                        stroke="var(--color-primary)" 
                        strokeWidth="1" 
                      />
                      <text 
                        x={rb.x} 
                        y={rb.y + 3} 
                        textAnchor="middle" 
                        fill="var(--color-primary)" 
                        fontSize="8.5"
                      >
                        {rb.val}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* RENDER BUBBLES GRID MAP */}
              {bubbleLayout.map((q) => {
                // Find first bubble coordinate to place label tag
                const b0 = q.bubbles[0];
                return (
                  <g key={q.question_no}>
                    {b0 && (
                      <text 
                        x={b0.x - 28} 
                        y={b0.y + 4} 
                        fill="#334155" 
                        fontSize="11" 
                        fontWeight="bold"
                      >
                        {`Q${q.question_no}`}
                      </text>
                    )}
                    
                    {q.bubbles.map((b, bIdx) => (
                      <g 
                        key={b.option || b.val}
                        style={{cursor: "move"}}
                        onMouseDown={(e) => handleMouseDown(e, { type: "bubble", qNo: q.question_no, bubbleIndex: bIdx })}
                      >
                        <circle 
                          cx={b.x} 
                          cy={b.y} 
                          r={b.r || 10} 
                          fill="rgba(16, 185, 129, 0.08)" 
                          stroke="var(--color-success)" 
                          strokeWidth="1.5" 
                        />
                        <text 
                          x={b.x} 
                          y={b.y + 3} 
                          textAnchor="middle" 
                          fill="var(--color-success)"
                          fontSize="9.5" 
                          fontWeight="bold"
                        >
                          {b.option || b.val}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })}

              {/* ALIGNMENT CORNER REGISTRATION MARKERS */}
              {alignmentMarkers.map((marker) => (
                <g 
                  key={marker.marker_id} 
                  style={{cursor: "grab"}}
                  onMouseDown={(e) => handleMouseDown(e, { type: "marker", id: marker.marker_id })}
                >
                  <circle cx={marker.x} cy={marker.y} r="18" fill="none" stroke="black" strokeWidth="2.5" />
                  <circle cx={marker.x} cy={marker.y} r="15" fill="black" stroke="white" strokeWidth="2" />
                  <circle cx={marker.x} cy={marker.y} r="4" fill="red" />
                  <line x1={marker.x - 22} y1={marker.y} x2={marker.x + 22} y2={marker.y} stroke="red" strokeWidth="1" />
                  <line x1={marker.x} y1={marker.y - 22} x2={marker.x} y2={marker.y + 22} stroke="red" strokeWidth="1" />
                  <text x={marker.x + 24} y={marker.y + 5} fill="black" fontSize="9" fontWeight="bold">
                    {`Marker #${marker.marker_id}`}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* LEFT BAR: CONTROLS & SPECIFICATION SIDEBAR */}
        <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
          {/* PROFILE CONTROL PANEL */}
          <div className="card">
            <div className="card-title">Settings & Profiles</div>
            
            <div className="form-group" style={{marginBottom: "12px"}}>
              <label className="form-label">Template Name</label>
              <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="form-row" style={{marginBottom: "6px"}}>
              <div className="form-group">
                <label className="form-label">Questions Volume</label>
                <input type="number" className="form-control" value={questionsCount} onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Choices (options)</label>
                <select className="form-control" value={optionsCount} onChange={(e) => setOptionsCount(parseInt(e.target.value))}>
                  <option value="4">4 Options</option>
                  <option value="5">5 Options</option>
                </select>
              </div>
            </div>
          </div>

          {/* GRID GENERATION ENGINE */}
          <div className="card" style={{border: "1px solid rgba(139, 92, 246, 0.2)"}}>
            <div className="card-title" style={{color: "var(--color-purple)"}}>
              <i data-lucide="sparkles"></i> Layout Coordinate Builder
            </div>
            <p style={{fontSize: "12px", color: "var(--text-secondary)", marginBottom: "14px"}}>
              Generate standard grids conforming into split index columns instantly.
            </p>

            <div style={{display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px"}}>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Split Columns Grid:</span>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{width: "60px", padding: "4px"}}
                  value={genColumns} 
                  onChange={(e) => setGenColumns(parseInt(e.target.value))} 
                />
              </div>
              
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Rows per Column:</span>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{width: "60px", padding: "4px"}}
                  value={genRowsPerCol} 
                  onChange={(e) => setGenRowsPerCol(parseInt(e.target.value))} 
                />
              </div>

              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>X Start Coordinate:</span>
                <div style={{display: "flex", gap: "4px", alignItems: "center"}}>
                  <button className="btn btn-secondary" style={{padding: "2px 6px"}} onClick={() => setGenBaseX(genBaseX - 5)}>-</button>
                  <span style={{width: "36px", textAlign: "center"}}>{genBaseX} px</span>
                  <button className="btn btn-secondary" style={{padding: "2px 6px"}} onClick={() => setGenBaseX(genBaseX + 5)}>+</button>
                </div>
              </div>

              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Y Start Coordinate:</span>
                <div style={{display: "flex", gap: "4px", alignItems: "center"}}>
                  <button className="btn btn-secondary" style={{padding: "2px 6px"}} onClick={() => setGenBaseY(genBaseY - 5)}>-</button>
                  <span style={{width: "36px", textAlign: "center"}}>{genBaseY} px</span>
                  <button className="btn btn-secondary" style={{padding: "2px 6px"}} onClick={() => setGenBaseY(genBaseY + 5)}>+</button>
                </div>
              </div>

              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Vertical Row Gap:</span>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{width: "60px", padding: "4px"}}
                  value={genRowGap} 
                  onChange={(e) => setGenRowGap(parseInt(e.target.value))} 
                />
              </div>

              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Horizontal Col Gap:</span>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{width: "60px", padding: "4px"}}
                  value={genColGap} 
                  onChange={(e) => setGenColGap(parseInt(e.target.value))} 
                />
              </div>

              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Option Separation:</span>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{width: "60px", padding: "4px"}}
                  value={genOptSpacing} 
                  onChange={(e) => setGenOptSpacing(parseInt(e.target.value))} 
                />
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleRegenerateLayout} style={{width: "100%", marginTop: "14px", padding: "8px 12px", justifyContent: "center"}}>
              <i data-lucide="refresh-cw"></i> Regenerate Grids Layout
            </button>
          </div>

          {/* DRAGGABLE SHIFTER PANEL */}
          <div className="card">
            <div className="card-title">Precise Coordinate Shifter</div>
            <p style={{fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px"}}>
              Move entire questions layout collectively to handle margin adjustments.
            </p>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px"}}>
              <button className="btn btn-secondary" onClick={() => shiftAllBubbles(-1, 0)}>Shift Left (1px)</button>
              <button className="btn btn-secondary" onClick={() => shiftAllBubbles(1, 0)}>Shift Right (1px)</button>
              <button className="btn btn-secondary" onClick={() => shiftAllBubbles(0, -1)}>Shift Up (1px)</button>
              <button className="btn btn-secondary" onClick={() => shiftAllBubbles(0, 1)}>Shift Down (1px)</button>
              <button className="btn btn-secondary" style={{gridColumn: "span 2"}} onClick={() => shiftAllBubbles(0, 10)}>Shift Down (10px)</button>
            </div>
          </div>

          {/* ROLL ID GRID BUILDER */}
          <div className="card">
            <div className="card-title">Student Roll ID Workspace</div>
            <div style={{display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px"}}>
              <div style={{display: "flex", justifyContent: "space-between"}}>
                <span>Horizontal X:</span>
                <span>{rollNumberConfig.x} px</span>
              </div>
              <div style={{display: "flex", justifyContent: "space-between"}}>
                <span>Vertical Y:</span>
                <span>{rollNumberConfig.y} px</span>
              </div>
              <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                <span>Digit Columns:</span>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{width: "60px", padding: "4px"}}
                  value={rollNumberConfig.columns} 
                  onChange={(e) => setRollNumberConfig({ ...rollNumberConfig, columns: parseInt(e.target.value) || 0 })} 
                />
              </div>
            </div>
          </div>

          {/* SECTIONS MANAGEMENT LIST */}
          <div className="card">
            <div className="card-title" style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <span>Question Sections</span>
              <button className="btn btn-secondary" style={{padding: "4px 8px", fontSize: "11px"}} onClick={handleAddRegion}>
                <i data-lucide="plus"></i> Add Sec
              </button>
            </div>
            
            <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
              {questionRegions.map((region) => (
                <div key={region.region_id} style={{display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", border: "1px solid var(--border-color)"}}>
                  <div style={{display: "flex", flexDirection: "column", gap: "2px"}}>
                    <input 
                      type="text" 
                      value={region.name} 
                      onChange={(e) => setQuestionRegions(questionRegions.map(r => r.region_id === region.region_id ? { ...r, name: e.target.value } : r))}
                      style={{background: "none", border: "none", color: "var(--text-primary)", fontWeight: 600, fontSize: "13px", padding: 0, width: "120px"}} 
                    />
                    <span style={{fontSize: "11px", color: "var(--text-secondary)"}}>
                      X:{region.x} Y:{region.y} W:{region.w} H:{region.h}
                    </span>
                  </div>
                  <button className="btn" style={{padding: "2px", color: "var(--color-error)"}} onClick={() => handleDeleteRegion(region.region_id)}>
                    <i data-lucide="trash-2" style={{width: "16px", height: "16px"}}></i>
                  </button>
                </div>
              ))}
              {questionRegions.length === 0 && (
                <span style={{fontSize: "12px", color: "var(--text-secondary)", textAlign: "center"}}>No custom boundary sections.</span>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 3: EXAMS & ANSWER KEY BUILDER
// -------------------------------------------------------------
function ExamsView({ exams, templates, onReload, setSelectedExamId, setCurrentPage }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [examType, setExamType] = useState("NEET");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Custom score config
  const [marksPos, setMarksPos] = useState(4.0);
  const [marksNeg, setMarksNeg] = useState(1.0);
  const [marksBla, setMarksBla] = useState(0.0);

  // Answer Key Builder
  const [activeKeyBuilderId, setActiveKeyBuilderId] = useState(null);
  const [draftKey, setDraftKey] = useState({});

  useEffect(() => {
    if (templates.length > 0 && !templateId) {
      setTemplateId(templates[0].id.toString());
    }
  }, [templates]);

  // Read scheme rules on changing exam types
  useEffect(() => {
    if (examType === "NEET" || examType === "JEE") {
      setMarksPos(4.0);
      setMarksNeg(1.0);
      setMarksBla(0.0);
    } else if (examType === "GUJCET") {
      setMarksPos(1.0);
      setMarksNeg(0.25);
      setMarksBla(0.0);
    } else if (examType === "Board") {
      setMarksPos(1.0);
      setMarksNeg(0.0);
      setMarksBla(0.0);
    }
  }, [examType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !subject || !templateId) return;

    // Load template questions count to initialize default key A
    const selectedTemplate = templates.find((t) => t.id === parseInt(templateId));
    const totalQ = selectedTemplate ? selectedTemplate.questions_count : 30;
    
    const baseKey = {};
    for (let i = 1; i <= totalQ; i++) baseKey[i.toString()] = "A";

    const payload = {
      name,
      exam_type: examType,
      subject,
      date,
      template_id: parseInt(templateId),
      marks_per_correct: parseFloat(marksPos),
      negative_marks: parseFloat(marksNeg),
      blank_marks: parseFloat(marksBla),
      answer_key: baseKey
    };

    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setName("");
        setSubject("");
        setDate("");
        setShowCreate(false);
        onReload();
      } else {
        const errorData = await res.json();
        setError(errorData.detail || "Unable to save exam parameters. Verify rules configuration.");
      }
    } catch (err) {
      console.error(err);
      setError("Network timeout or connection refused from backend. Is OMR service online?");
    } finally {
      setLoading(false);
    }
  };

  const openKeyBuilder = (exam) => {
    setActiveKeyBuilderId(exam.id);
    let currentKey = {};
    if (exam.answer_key_json) {
      try { currentKey = JSON.parse(exam.answer_key_json); } catch (e) {}
    }
    setDraftKey(currentKey);
  };

  const handleUpdateKey = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/exams/${activeKeyBuilderId}/answer-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer_key: draftKey })
      });
      if (res.ok) {
        setActiveKeyBuilderId(null);
        onReload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div className="header">
        <div>
          <h1 className="header-title">Exam Panels & Keys</h1>
          <p className="header-subtitle">Design assessment profiles, scoring parameters, and align sheets with target keys.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <i data-lucide={showCreate ? "x" : "plus"}></i> {showCreate ? "Cancel Builder" : "New Exam"}
        </button>
      </div>

      {showCreate && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="card-title">Setup Exam parameters</div>
          
          {error && (
            <div className="badge badge-error" style={{width: "100%", padding: "12px", borderRadius: "8px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>{error}</span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Exam Name</label>
              <input type="text" className="form-control" placeholder="SSE 12th Physics Test" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            
            <div className="form-group">
              <label className="form-label">Assessment Type</label>
              <select className="form-control" value={examType} onChange={(e) => setExamType(e.target.value)}>
                <option value="NEET">NEET Rules (+4 / -1)</option>
                <option value="JEE">JEE Rules (+4 / -1)</option>
                <option value="GUJCET">GUJCET Rules (+1 / -0.25)</option>
                <option value="Board">Board Rules (+1 / 0)</option>
                <option value="Custom">Custom Rules</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Subject</label>
              <input type="text" className="form-control" placeholder="Physics" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
          </div>

          <div className="form-row" style={{marginTop: "8px"}}>
            <div className="form-group">
              <label className="form-label">OMR Layout Design File</label>
              <select className="form-control" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.questions_count} Qs)</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {examType === "Custom" && (
            <div className="form-row" style={{marginTop: "8px"}}>
              <div className="form-group">
                <label className="form-label">Points per Correct</label>
                <input type="number" step="0.5" className="form-control" value={marksPos} onChange={(e) => setMarksPos(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Negative deduction</label>
                <input type="number" step="0.25" className="form-control" value={marksNeg} onChange={(e) => setMarksNeg(e.target.value)} />
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{marginTop: "8px"}} disabled={loading}>
            {loading ? (
              <span style={{display: "inline-flex", alignItems: "center", gap: "8px"}}>
                <span className="spinner-mini"></span> Creating exam profile...
              </span>
            ) : (
              "Create Exam Profile"
            )}
          </button>
        </form>
      )}

      {/* ANSWER KEY BUILDING MODAL VIEW */}
      {activeKeyBuilderId && (
        <div className="card" style={{borderColor: "var(--color-primary)"}}>
          <div className="card-title">
            <span>Matrix Key Editor: Exam #{activeKeyBuilderId}</span>
            <div style={{display: "flex", gap: "10px"}}>
              <button className="btn btn-secondary" onClick={() => setActiveKeyBuilderId(null)}>Discard</button>
              <button className="btn btn-primary" onClick={handleUpdateKey}>Save Mapping</button>
            </div>
          </div>
          
          <div className="answer-key-editor">
            {Object.keys(draftKey).map((qNo) => (
              <div key={qNo} className="key-row">
                <span className="key-num">Q. {qNo}</span>
                <div className="options-group">
                  {["A", "B", "C", "D"].map((opt) => (
                    <div
                      key={opt}
                      className={`option-btn ${draftKey[qNo] === opt ? "selected" : ""}`}
                      onClick={() => setDraftKey({...draftKey, [qNo]: opt})}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Running Assessment Exams</div>
        {exams.length === 0 ? (
          <div className="empty-state">
            <i data-lucide="file-check" className="empty-icon" style={{width: 48, height: 48}}></i>
            <p>No exams designed yet. Align options rules to evaluate scans.</p>
          </div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Exam ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Scoring Scheme</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td>#{exam.id}</td>
                  <td style={{fontWeight: 600}}>{exam.name}</td>
                  <td><span className="badge badge-success">{exam.exam_type}</span></td>
                  <td>{exam.subject}</td>
                  <td>
                    <span style={{color: "var(--color-success)"}}>+{exam.marks_per_correct}</span> / 
                    <span style={{color: "var(--color-error)"}}>-{exam.negative_marks}</span>
                  </td>
                  <td>
                    <div style={{display: "flex", gap: "8px"}}>
                      <button className="btn btn-secondary" style={{padding: "6px 12px", fontSize: "12px"}} onClick={() => openKeyBuilder(exam)}>
                        <i data-lucide="key"></i> Answer Key
                      </button>
                      <button className="btn btn-primary" style={{padding: "6px 12px", fontSize: "12px"}} onClick={() => {
                        setSelectedExamId(exam.id);
                        setCurrentPage("scan");
                      }}>
                        <i data-lucide="scan"></i> Scan Sheets
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 4: OMR SCAN & UPLOAD
// -------------------------------------------------------------
// -------------------------------------------------------------
// CAMERA SCANNER COMPONENT & REAL-TIME HEURISTICS
// -------------------------------------------------------------
function CameraScanner({ examName, onCapture, onClose }) {
  const videoRef = React.useRef(null);
  const canvasOverlayRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const intervalRef = React.useRef(null);

  const [warnings, setWarnings] = React.useState([]);
  const [successMsg, setSuccessMsg] = React.useState("");
  const [permissionError, setPermissionError] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);

  const [insecureContextError, setInsecureContextError] = React.useState(false);

  React.useEffect(() => {
    // Start camera stream
    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("Camera mediaDevices not supported or blocked in insecure context.");
        setInsecureContextError(true);
        setPermissionError(true);
        return;
      }

      let stream = null;
      try {
        // Attempt 1: Back camera with ideal resolution
        const constraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.warn("Back camera with ideal resolution failed, trying broad constraints", err);
        try {
          // Attempt 2: Fallback to any video source
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (errFallback) {
          console.error("All camera streams failed:", errFallback);
          setPermissionError(true);
          return;
        }
      }

      if (stream) {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        // Start heuristics loop running 4 times per second (250ms)
        intervalRef.current = setInterval(runHeuristics, 250);
      }
    }
    startCamera();

    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const runHeuristics = () => {
    const video = videoRef.current;
    const canvasOverlay = canvasOverlayRef.current;
    
    if (!video || !canvasOverlay || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    const overlayCtx = canvasOverlay.getContext("2d");
    const width = canvasOverlay.width = video.videoWidth;
    const height = canvasOverlay.height = video.videoHeight;
    overlayCtx.clearRect(0, 0, width, height);

    // Heuristics offscreen buffer
    const buffer = document.createElement("canvas");
    const procW = 640;
    const procH = 880; // Aspect ratio ~0.727
    buffer.width = procW;
    buffer.height = procH;
    const bufCtx = buffer.getContext("2d");
    
    // Crop video center to match target 0.727 aspect ratio if necessary
    const videoAspect = width / height;
    const targetAspect = procW / procH;
    let sx = 0, sy = 0, sw = width, sh = height;
    if (videoAspect > targetAspect) {
      sw = height * targetAspect;
      sx = (width - sw) / 2;
    } else {
      sh = width / targetAspect;
      sy = (height - sh) / 2;
    }
    bufCtx.drawImage(video, sx, sy, sw, sh, 0, 0, procW, procH);

    const imgData = bufCtx.getImageData(0, 0, procW, procH);
    const data = imgData.data;

    // 1. Lighting calculation via average luminance
    let pixelSum = 0;
    let counts = 0;
    for (let i = 0; i < data.length; i += 40) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      pixelSum += luma;
      counts++;
    }
    const avgLuma = pixelSum / counts;

    let localWarnings = [];
    if (avgLuma < 65) {
      localWarnings.push("Low light: OMR sheet is too dark.");
    } else if (avgLuma > 235) {
      localWarnings.push("High glare: Avoid direct reflections on the sheet.");
    }

    // 2. Focus / Blur check via adjacent gradient check
    let diffSum = 0;
    let diffCount = 0;
    for (let y = 60; y < procH - 60; y += 15) {
      for (let x = 60; x < procW - 60; x += 15) {
        const idx = (y * procW + x) * 4;
        const idxRight = (y * procW + (x + 2)) * 4;
        const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const lumaRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];
        diffSum += Math.abs(luma - lumaRight);
        diffCount++;
      }
    }
    const avgDiff = diffSum / diffCount;
    if (avgDiff < 3.2) {
      localWarnings.push("Blurry frame: Hold camera steady and focus.");
    }

    // 3. OMR Corner Marker validation
    const expectedCorners = [
      { name: "TL", ex: 45, ey: 45 },
      { name: "TR", ex: 595, ey: 45 },
      { name: "BL", ex: 45, ey: 835 },
      { name: "BR", ex: 595, ey: 835 }
    ];

    const detectedCorners = [];
    const searchRadius = 40;

    expectedCorners.forEach(corner => {
      let minVal = 255;
      let minX = corner.ex;
      let minY = corner.ey;
      let sumLuma = 0;
      let countLuma = 0;

      // Scan local neighbourhood
      for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
        for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
          const px = corner.ex + dx;
          const py = corner.ey + dy;
          if (px < 0 || px >= procW || py < 0 || py >= procH) continue;
          
          const idx = (py * procW + px) * 4;
          const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          
          if (l < minVal) {
            minVal = l;
            minX = px;
            minY = py;
          }
          sumLuma += l;
          countLuma++;
        }
      }

      const avgLumaLocal = sumLuma / countLuma;
      // Register detection if local minimum is dark and distinct from average
      if (minVal < 55 && (avgLumaLocal - minVal > 75)) {
        detectedCorners.push({ name: corner.name, rx: minX, ry: minY });
      }
    });

    // Helper: Map coordinates from proc index (640x880) back to actual overlay canvas width/height
    const mapToVideo = (px, py) => {
      const vx = sx + (px / procW) * sw;
      const vy = sy + (py / procH) * sh;
      return { x: vx, y: vy };
    };

    // Draw visual guide box on video overlay canvas
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    overlayCtx.setLineDash([8, 6]);
    
    const tlVideo = mapToVideo(50, 50);
    const brVideo = mapToVideo(590, 830);
    overlayCtx.strokeRect(tlVideo.x, tlVideo.y, brVideo.x - tlVideo.x, brVideo.y - tlVideo.y);
    overlayCtx.setLineDash([]); // Reset line dash

    // Draw target safety rings at corners
    expectedCorners.forEach(corner => {
      const vPt = mapToVideo(corner.ex, corner.ey);
      overlayCtx.beginPath();
      overlayCtx.arc(vPt.x, vPt.y, 22, 0, 2 * Math.PI);
      overlayCtx.lineWidth = 2.5;
      
      const isDet = detectedCorners.some(c => c.name === corner.name);
      overlayCtx.strokeStyle = isDet ? "#10b981" : "#ef4444";
      overlayCtx.stroke();
      
      overlayCtx.fillStyle = isDet ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.1)";
      overlayCtx.fill();
    });

    let aligned = false;
    let localSuccess = "";

    if (detectedCorners.length < 4) {
      if (detectedCorners.length === 0) {
        localWarnings.push("OMR Sheet not found: Align page corners inside safety rings.");
      } else {
        localWarnings.push("Partially out of frame: Ensure all 4 corner rings turn green.");
      }
    } else {
      // Calculate distances to evaluate sheet bounds scale
      const tl = detectedCorners.find(c => c.name === "TL");
      const tr = detectedCorners.find(c => c.name === "TR");
      const bl = detectedCorners.find(c => c.name === "BL");
      const br = detectedCorners.find(c => c.name === "BR");

      const topW = Math.sqrt(Math.pow(tr.rx - tl.rx, 2) + Math.pow(tr.ry - tl.ry, 2));
      const botW = Math.sqrt(Math.pow(br.rx - bl.rx, 2) + Math.pow(br.ry - bl.ry, 2));
      const avgW = (topW + botW) / 2;

      if (avgW < 430) {
        localWarnings.push("Too far: Move camera closer to OMR sheet.");
      } else if (avgW > 615) {
        localWarnings.push("Too close: Move camera further back.");
      }

      // Calculate tilt rotation angle
      const slope = (tr.ry - tl.ry) / (tr.rx - tl.rx);
      const angleDeg = Math.abs(Math.atan(slope) * (180 / Math.PI));
      if (angleDeg > 3.0) {
        localWarnings.push("Sheet is tilted: Rotate sheet or camera straight.");
      }

      // If no constraints fail, trigger success highlight
      if (localWarnings.length === 0) {
        aligned = true;
        localSuccess = "Perfect Alignment: Keep steady and capture!";
        overlayCtx.strokeStyle = "#10b981";
        overlayCtx.lineWidth = 4;
        overlayCtx.strokeRect(tlVideo.x, tlVideo.y, brVideo.x - tlVideo.x, brVideo.y - tlVideo.y);
      }
    }

    setWarnings(localWarnings);
    setSuccessMsg(localSuccess);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || isCapturing) return;

    setIsCapturing(true);

    // Apply flash class visual effect on video wrapper
    const wrapper = video.parentElement;
    if (wrapper) {
      wrapper.classList.add("camera-flash-active");
      setTimeout(() => wrapper.classList.remove("camera-flash-active"), 350);
    }

    // Capture frame on offscreen high-res canvas
    const capCanvas = document.createElement("canvas");
    capCanvas.width = video.videoWidth;
    capCanvas.height = video.videoHeight;
    const ctx = capCanvas.getContext("2d");
    ctx.drawImage(video, 0, 0, capCanvas.width, capCanvas.height);

    capCanvas.toBlob(blob => {
      if (blob) {
        const finalFile = new File([blob], `OMR_SCAN_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(finalFile);
      } else {
        setIsCapturing(false);
      }
    }, "image/jpeg", 0.95);
  };

  return (
    <div className="camera-scanner-modal">
      <div className="camera-header-nav">
        <span className="camera-nav-title">
          {/* Inline SVG OMR scanning icon */}
          <svg style={{marginRight: "4px"}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path></svg>
          Scanning OMR Sheet for: {examName || "Student Sheet"}
        </span>
        <button className="btn btn-secondary" style={{padding: "6px 12px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px"}} onClick={onClose}>
          {/* Inline SVG X Close icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Close
        </button>
      </div>

      <div className="camera-preview-wrapper" style={{width: "100%", position: "relative"}}>
        {permissionError ? (
          <div style={{padding: "24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
            {/* Inline SVG Camera-off icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <h3>{insecureContextError ? "Secure Context Required" : "Camera Access Denied"}</h3>
            <p style={{fontSize: "13px", color: "var(--text-secondary)"}}>
              {insecureContextError 
                ? "Mobile camera stream features require a secure connection (HTTPS or localhost). Please deploy with HTTPS or choose 'Browse Files' upload mode." 
                : "Please enable or grant camera permissions to use the live scan capture mode. Alternatively, you can upload file photos."}
            </p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="camera-live-video" autoplay playsinline muted></video>
            <canvas ref={canvasOverlayRef} className="camera-canvas-overlay"></canvas>
          </>
        )}
      </div>

      <div className="camera-warning-banner">
        {successMsg && (
          <div className="camera-warning-item success">
            {/* Inline SVG Check icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <span>{successMsg}</span>
          </div>
        )}
        
        {warnings.map((warn, wIdx) => (
          <div key={wIdx} className="camera-warning-item critical">
            {/* Inline SVG warning Alert icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span>{warn}</span>
          </div>
        ))}
      </div>

      <div className="camera-bottom-actions">
        <button 
          className={`btn-capture ${permissionError || isCapturing ? "disabled" : ""}`}
          onClick={handleCapture}
          disabled={permissionError || isCapturing}
          title="Capture snapshot"
        >
          <div style={{width: "100%", height: "100%", borderRadius: "50%", background: isCapturing ? "var(--color-warning)" : "var(--color-primary)", transition: "background 0.2s"}}></div>
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 4: OMR SCAN & UPLOAD
// -------------------------------------------------------------
function ScanView({ 
  exams, 
  selectedExamId, 
  setSelectedExamId, 
  scanningStatus, 
  setScanningStatus, 
  setActiveScan, 
  setCurrentPage,
  errorMsg,
  setErrorMsg
}) {
  const fileInputRef = React.useRef(null);
  const [cameraActive, setCameraActive] = React.useState(false);

  const processImageFile = async (file) => {
    if (!file || !selectedExamId) return;

    setScanningStatus("processing");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/exams/${selectedExamId}/scan`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const scanData = await res.json();
        setActiveScan(scanData);
        setScanningStatus("idle");
        setCurrentPage("result");
      } else {
        const errorData = await res.json();
        setErrorMsg(errorData.detail || "OMR interpretation failed. Make sure all markers are visible.");
        setScanningStatus("idle");
      }
    } catch (err) {
      setErrorMsg("Failed to connect to backend server. Ensure FastAPI is running on port 8000.");
      setScanningStatus("idle");
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await processImageFile(file);
    }
  };

  const handleSimulateDrag = () => {
    fileInputRef.current.click();
  };

  const selectedExam = exams.find(e => e.id === parseInt(selectedExamId));
  const examNameLabel = selectedExam ? `${selectedExam.name} (${selectedExam.subject})` : "";

  return (
    <div>
      <div className="header">
        <div>
          <h1 className="header-title">Upload & Scan OMR</h1>
          <p className="header-subtitle">Evaluate physical answer sheets by uploading photos or scanning via camera.</p>
        </div>
      </div>

      {cameraActive && (
        <CameraScanner
          examName={examNameLabel}
          onClose={() => setCameraActive(false)}
          onCapture={async (capturedFile) => {
            setCameraActive(false);
            await processImageFile(capturedFile);
          }}
        />
      )}

      <div className="card" style={{maxWidth: "600px", margin: "0 auto"}}>
        <div className="form-group">
          <label className="form-label">1. Associate Target Exam Session</label>
          <select 
            className="form-control" 
            value={selectedExamId} 
            onChange={(e) => setSelectedExamId(e.target.value)}
          >
            <option value="">Select Exam Session...</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>{exam.name} ({exam.subject})</option>
            ))}
          </select>
        </div>

        {errorMsg && (
          <div className="badge badge-error" style={{width: "100%", padding: "12px", borderRadius: "8px", verticalAlign: "middle", marginBottom: "16px"}}>
            <i data-lucide="alert-circle" style={{marginRight: "8px", verticalAlign: "middle"}}></i>
            <span>{errorMsg}</span>
          </div>
        )}

        {scanningStatus === "processing" ? (
          <div style={{display: "flex", flexDirection: "column", alignItems: "center", justifyCenter: "center", padding: "60px 40px"}}>
            <div className="spinner"></div>
            <h3 style={{fontFamily: "var(--font-display)", fontSize: "18px"}}>OMR Sheet Recognition Engine Running</h3>
            <p style={{color: "var(--text-secondary)", fontSize: "14px", marginTop: "8px"}}>Preprocessing image layout, locating corner rings matrix, and calculating bubble mark pixel shadows...</p>
          </div>
        ) : (
          <div className="upload-zone" style={{cursor: "default"}}>
            <i data-lucide="upload-cloud" className="upload-icon" style={{width: 48, height: 48}}></i>
            <div>
              <h3 style={{fontSize: "18px", fontFamily: "var(--font-display)"}}>Acquire OMR Sheet Image</h3>
              <p style={{color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px"}}>Supports live mobile camera scanner or static file uploads</p>
            </div>
            
            <div style={{display: "flex", gap: "10px", marginTop: "12px", width: "100%", justifyContent: "center"}}>
              <button 
                className="btn btn-secondary" 
                onClick={handleSimulateDrag}
                style={{flex: 1, justifyContent: "center", maxWidth: "200px"}}
              >
                Browse Files
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  if (!selectedExamId) {
                    setErrorMsg("Please associate a target exam session first.");
                    return;
                  }
                  setCameraActive(true);
                }} 
                style={{flex: 1, justifyContent: "center", maxWidth: "200px"}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: "4px"}}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                Open Camera
              </button>
            </div>

            <input 
              type="file" 
              ref={fileInputRef} 
              style={{display: "none"}} 
              accept="image/*" 
              onChange={handleFileChange} 
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultView({ activeScan, setCurrentPage }) {
  const [scanData, setScanData] = useState(activeScan);
  const result = scanData.result;
  const qResults = result ? (result.question_results || []).sort((a, b) => a.question_no - b.question_no) : [];
  const auditLogs = scanData.audit_logs || [];

  // Selected question for detail inspection
  const [selectedQ, setSelectedQ] = useState(null);
  // Correction modal
  const [correctionQ, setCorrectionQ] = useState(null);
  const [correctedOption, setCorrectedOption] = useState("");
  const [correcting, setCorrecting] = useState(false);
  // Filter
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Refresh scan data from backend
  const refreshScan = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/scans/${scanData.id}`);
      if (res.ok) {
        const data = await res.json();
        setScanData(data);
      }
    } catch (err) {
      console.error("Failed to refresh scan", err);
    }
  };

  // Submit manual correction
  const submitCorrection = async () => {
    if (!correctionQ || !correctedOption) return;
    setCorrecting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/scans/${scanData.id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_no: correctionQ.question_no, corrected_option: correctedOption })
      });
      if (res.ok) {
        const updated = await res.json();
        setScanData(updated);
        setCorrectionQ(null);
        setCorrectedOption("");
      }
    } catch (err) {
      console.error("Correction failed", err);
    }
    setCorrecting(false);
  };

  // Status helpers
  const getStatusColor = (status) => {
    switch (status) {
      case "CORRECT": return "#10b981";
      case "WRONG": return "#ef4444";
      case "BLANK": return "#f59e0b";
      case "MULTIPLE_MARKED": return "#8b5cf6";
      case "UNCERTAIN": return "#06b6d4";
      default: return "#6b7280";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "CORRECT": return "check-circle";
      case "WRONG": return "x-circle";
      case "BLANK": return "minus-circle";
      case "MULTIPLE_MARKED": return "copy";
      case "UNCERTAIN": return "help-circle";
      default: return "circle";
    }
  };

  const getMarks = (q) => {
    if (!q) return "—";
    switch (q.status) {
      case "CORRECT": return `+${scanData.exam_marks_per_correct || 4}`;
      case "WRONG": return `-${scanData.exam_negative_marks || 1}`;
      default: return "0";
    }
  };

  const getMarksColor = (q) => {
    if (!q) return "var(--text-secondary)";
    switch (q.status) {
      case "CORRECT": return "#10b981";
      case "WRONG": return "#ef4444";
      default: return "var(--text-secondary)";
    }
  };

  // Parse options intensity
  const parseIntensity = (jsonStr) => {
    if (!jsonStr) return {};
    try { return JSON.parse(jsonStr); } catch { return {}; }
  };

  // Filtered questions
  const filteredQ = statusFilter === "ALL" ? qResults : qResults.filter(q => q.status === statusFilter);

  // Refresh icons after render
  useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  }, [scanData, selectedQ, correctionQ, statusFilter]);

  return (
    <div>
      {/* HEADER */}
      <div className="header">
        <div>
          <h1 className="header-title">OMR Evaluation Report</h1>
          <p className="header-subtitle">
            Scan #{scanData.id} — {scanData.student_name || "Unknown Student"} — Roll: {scanData.student_roll_no || "N/A"}
          </p>
        </div>
        <div style={{display: "flex", gap: "10px"}}>
          <button className="btn btn-secondary" onClick={() => setCurrentPage("scan")}>
            <i data-lucide="arrow-left"></i> Back to Scanner
          </button>
        </div>
      </div>

      {/* ===== SUMMARY CARDS ===== */}
      <div className="review-summary-grid">
        <div className="review-summary-card review-summary-total">
          <div className="review-summary-icon"><i data-lucide="hash"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{qResults.length}</span>
            <span className="review-summary-label">Total Questions</span>
          </div>
        </div>
        <div className="review-summary-card review-summary-attempted">
          <div className="review-summary-icon"><i data-lucide="edit-3"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{result ? (result.correct_count + result.wrong_count) : 0}</span>
            <span className="review-summary-label">Attempted</span>
          </div>
        </div>
        <div className="review-summary-card review-summary-correct">
          <div className="review-summary-icon"><i data-lucide="check-circle"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{result ? result.correct_count : 0}</span>
            <span className="review-summary-label">Correct</span>
          </div>
        </div>
        <div className="review-summary-card review-summary-wrong">
          <div className="review-summary-icon"><i data-lucide="x-circle"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{result ? result.wrong_count : 0}</span>
            <span className="review-summary-label">Wrong</span>
          </div>
        </div>
        <div className="review-summary-card review-summary-blank">
          <div className="review-summary-icon"><i data-lucide="minus-circle"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{result ? result.blank_count : 0}</span>
            <span className="review-summary-label">Blank</span>
          </div>
        </div>
        <div className="review-summary-card review-summary-multiple">
          <div className="review-summary-icon"><i data-lucide="copy"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{result ? result.multiple_marked_count : 0}</span>
            <span className="review-summary-label">Multiple</span>
          </div>
        </div>
        <div className="review-summary-card review-summary-uncertain">
          <div className="review-summary-icon"><i data-lucide="help-circle"></i></div>
          <div className="review-summary-data">
            <span className="review-summary-num">{result ? result.uncertain_count : 0}</span>
            <span className="review-summary-label">Uncertain</span>
          </div>
        </div>
      </div>

      {/* SCORE HERO BANNER */}
      <div className="review-score-banner">
        <div className="review-score-main">
          <span className="review-score-value">{result ? result.obtained_marks : 0}</span>
          <span className="review-score-sep">/</span>
          <span className="review-score-total">{result ? result.total_marks : 0}</span>
        </div>
        <div className="review-score-pct">
          <span className="review-pct-value">{result ? result.percentage : 0}%</span>
          <span className="review-pct-label">Score Percentage</span>
        </div>
      </div>

      {/* ===== MAIN CONTENT: LEFT (TABLE + OVERLAY) | RIGHT (INSPECT PANEL) ===== */}
      <div className="review-main-grid">
        {/* LEFT COLUMN */}
        <div className="review-left-col">

          {/* QUESTION-BY-QUESTION TABLE */}
          <div className="card">
            <div className="card-title" style={{display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px"}}>
              <span>Question-by-Question Breakdown</span>
              <div style={{display: "flex", gap: "6px", flexWrap: "wrap"}}>
                {["ALL", "CORRECT", "WRONG", "BLANK", "MULTIPLE_MARKED", "UNCERTAIN"].map(f => (
                  <button 
                    key={f} 
                    className={`review-filter-btn ${statusFilter === f ? "review-filter-active" : ""}`}
                    onClick={() => setStatusFilter(f)}
                    style={f !== "ALL" ? {borderColor: getStatusColor(f)} : {}}
                  >
                    {f === "ALL" ? "All" : f.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="review-table-wrap">
              <table className="review-table">
                <thead>
                  <tr>
                    <th>Q#</th>
                    <th>Student Answer</th>
                    <th>Correct Answer</th>
                    <th>Status</th>
                    <th>Marks</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQ.map((q) => (
                    <tr 
                      key={q.question_no} 
                      className={`review-row ${selectedQ && selectedQ.question_no === q.question_no ? "review-row-selected" : ""}`}
                      onClick={() => setSelectedQ(q)}
                    >
                      <td className="review-cell-qno">Q{q.question_no}</td>
                      <td>
                        <span className="review-answer-pill" style={{backgroundColor: getStatusColor(q.status) + "20", color: getStatusColor(q.status), borderColor: getStatusColor(q.status)}}>
                          {q.selected_option || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="review-answer-pill review-answer-key">
                          {q.correct_option || "—"}
                        </span>
                      </td>
                      <td>
                        <span className="review-status-badge" style={{backgroundColor: getStatusColor(q.status) + "18", color: getStatusColor(q.status)}}>
                          <i data-lucide={getStatusIcon(q.status)} style={{width: 14, height: 14}}></i>
                          {q.status.replace("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span style={{fontWeight: 700, color: getMarksColor(q), fontFamily: "var(--font-display)"}}>
                          {getMarks(q)}
                        </span>
                      </td>
                      <td>
                        {(q.status === "UNCERTAIN" || q.status === "MULTIPLE_MARKED") ? (
                          <button 
                            className="btn btn-primary review-correct-btn"
                            onClick={(e) => { e.stopPropagation(); setCorrectionQ(q); setCorrectedOption(""); }}
                          >
                            <i data-lucide="pencil" style={{width: 12, height: 12}}></i> Fix
                          </button>
                        ) : (
                          <span style={{color: "var(--text-secondary)", fontSize: "12px"}}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* OMR SHEET IMAGE OVERLAY */}
          <div className="card">
            <div className="card-title">OMR Sheet Visual Overlay</div>
            <div className="omr-preview-container" style={{position: "relative"}}>
              {/* Processed image background */}
              {scanData.processed_image_path && (
                <img 
                  src={`${API_BASE_URL}/uploads/${scanData.processed_image_path.split('/').pop()}`} 
                  alt="Processed OMR Sheet"
                  style={{width: "100%", opacity: 0.35, position: "absolute", top: 0, left: 0, borderRadius: "12px"}}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <svg
                className="omr-svg-overlay"
                viewBox="0 0 800 1100"
                style={{position: "relative", width: "100%", background: "#111827", minHeight: "420px", borderRadius: "12px"}}
              >
                {/* Registration markers */}
                <circle cx="40" cy="40" r="14" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <circle cx="760" cy="40" r="14" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <circle cx="40" cy="1060" r="14" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                <circle cx="760" cy="1060" r="14" fill="#1e293b" stroke="#334155" strokeWidth="2" />

                {/* Bubble overlays per question */}
                {qResults.map((q) => {
                  let box = { x: 50, y: 50, width: 240, height: 32 };
                  if (q.bounding_box_json) {
                    try { box = JSON.parse(q.bounding_box_json); } catch (e) {}
                  }
                  const options = ["A", "B", "C", "D"];
                  const isSelected = selectedQ && selectedQ.question_no === q.question_no;
                  const statusCol = getStatusColor(q.status);
                  return (
                    <g key={q.question_no} style={{cursor: "pointer"}} onClick={() => setSelectedQ(q)}>
                      {/* Row highlight */}
                      <rect 
                        x={box.x - 4} y={box.y - 4} 
                        width={box.width + 8} height={box.height + 8}
                        rx="6"
                        fill={isSelected ? statusCol + "15" : "transparent"}
                        stroke={isSelected ? statusCol : "transparent"}
                        strokeWidth="1.5"
                      />
                      {/* Question label */}
                      <text x={box.x + 4} y={box.y + 20} fill="#94a3b8" fontSize="11" fontWeight="600">Q{q.question_no}</text>
                      {/* Bubbles */}
                      {options.map((opt, oIdx) => {
                        const bx = box.x + 65 + oIdx * 42;
                        const by = box.y + 16;
                        const isMarked = q.selected_option === opt;
                        const isCorrectOpt = (q.correct_option || "").split(",").map(s => s.trim()).includes(opt);
                        let fill = "none";
                        let stroke = "#334155";
                        let sw = 1.5;
                        if (isMarked && q.status === "CORRECT") { fill = "#10b98140"; stroke = "#10b981"; sw = 2.5; }
                        else if (isMarked && q.status === "WRONG") { fill = "#ef444440"; stroke = "#ef4444"; sw = 2.5; }
                        else if (isMarked && q.status === "UNCERTAIN") { fill = "#06b6d440"; stroke = "#06b6d4"; sw = 2; }
                        else if (isMarked && q.status === "MULTIPLE_MARKED") { fill = "#8b5cf640"; stroke = "#8b5cf6"; sw = 2; }
                        else if (isCorrectOpt && q.status === "WRONG") { stroke = "#10b981"; sw = 2; }
                        return (
                          <g key={opt}>
                            <circle cx={bx} cy={by} r="9" fill={fill} stroke={stroke} strokeWidth={sw} />
                            <text x={bx} y={by + 4} fill="#94a3b8" fontSize="9" textAnchor="middle" fontWeight="500">{opt}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* AUDIT LOG TRAIL */}
          {auditLogs.length > 0 && (
            <div className="card">
              <div className="card-title">
                <i data-lucide="history" style={{width: 18, height: 18, marginRight: 8}}></i>
                Correction Audit Trail ({auditLogs.length})
              </div>
              <div className="review-audit-list">
                {auditLogs.map((log) => (
                  <div key={log.id} className="review-audit-item">
                    <div className="review-audit-q">Q{log.question_no}</div>
                    <div className="review-audit-change">
                      <span className="review-audit-old">{log.old_value || "—"}</span>
                      <i data-lucide="arrow-right" style={{width: 14, height: 14, color: "var(--text-secondary)"}}></i>
                      <span className="review-audit-new">{log.new_value}</span>
                    </div>
                    <div className="review-audit-time">
                      {new Date(log.corrected_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: INSPECT PANEL */}
        <div className="review-right-col">
          {/* Scan metadata */}
          <div className="card">
            <div className="card-title">Scan Metadata</div>
            <div className="review-meta-grid">
              <div className="review-meta-row">
                <span className="review-meta-key">Student</span>
                <span className="review-meta-val">{scanData.student_name || "N/A"}</span>
              </div>
              <div className="review-meta-row">
                <span className="review-meta-key">Roll No.</span>
                <span className="review-meta-val">{scanData.student_roll_no || "N/A"}</span>
              </div>
              <div className="review-meta-row">
                <span className="review-meta-key">Confidence</span>
                <span className="review-meta-val" style={{color: "#10b981"}}>{scanData.confidence_score}%</span>
              </div>
              <div className="review-meta-row">
                <span className="review-meta-key">Status</span>
                <span className="review-meta-val">
                  <span className="badge badge-success">{scanData.scan_status}</span>
                </span>
              </div>
            </div>
          </div>

          {/* QUESTION DETAIL INSPECTOR */}
          <div className="card">
            <div className="card-title">
              <i data-lucide="search" style={{width: 16, height: 16, marginRight: 8}}></i>
              Bubble Inspector {selectedQ ? `— Q${selectedQ.question_no}` : ""}
            </div>
            {selectedQ ? (
              <div className="review-inspect-content">
                <div className="review-inspect-header" style={{borderColor: getStatusColor(selectedQ.status)}}>
                  <span className="review-inspect-qno">Question {selectedQ.question_no}</span>
                  <span className="review-status-badge" style={{backgroundColor: getStatusColor(selectedQ.status) + "18", color: getStatusColor(selectedQ.status)}}>
                    <i data-lucide={getStatusIcon(selectedQ.status)} style={{width: 14, height: 14}}></i>
                    {selectedQ.status.replace("_", " ")}
                  </span>
                </div>

                <div className="review-inspect-answers">
                  <div className="review-inspect-pair">
                    <span className="review-inspect-label">Student Marked</span>
                    <span className="review-answer-pill" style={{backgroundColor: getStatusColor(selectedQ.status) + "20", color: getStatusColor(selectedQ.status), borderColor: getStatusColor(selectedQ.status), fontSize: "16px", padding: "6px 16px"}}>
                      {selectedQ.selected_option || "BLANK"}
                    </span>
                  </div>
                  <div className="review-inspect-pair">
                    <span className="review-inspect-label">Correct Answer</span>
                    <span className="review-answer-pill review-answer-key" style={{fontSize: "16px", padding: "6px 16px"}}>
                      {selectedQ.correct_option || "—"}
                    </span>
                  </div>
                </div>

                {/* Bubble fill intensities */}
                {selectedQ.options_intensity_json && (
                  <div className="review-intensity-section">
                    <span className="review-inspect-label" style={{marginBottom: "8px", display: "block"}}>Bubble Fill Ratios</span>
                    {Object.entries(parseIntensity(selectedQ.options_intensity_json)).map(([opt, val]) => {
                      const pct = Math.round(val * 100);
                      const barColor = (selectedQ.selected_option === opt) ? getStatusColor(selectedQ.status) : "#334155";
                      return (
                        <div key={opt} className="review-intensity-row">
                          <span className="review-intensity-opt">{opt}</span>
                          <div className="review-intensity-bar-bg">
                            <div className="review-intensity-bar-fill" style={{width: `${Math.min(pct, 100)}%`, backgroundColor: barColor}}></div>
                          </div>
                          <span className="review-intensity-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quick correct button */}
                {(selectedQ.status === "UNCERTAIN" || selectedQ.status === "MULTIPLE_MARKED") && (
                  <button 
                    className="btn btn-primary" 
                    style={{width: "100%", justifyContent: "center", marginTop: "16px"}}
                    onClick={() => { setCorrectionQ(selectedQ); setCorrectedOption(""); }}
                  >
                    <i data-lucide="pencil"></i> Manually Correct This Answer
                  </button>
                )}
              </div>
            ) : (
              <div className="review-inspect-empty">
                <i data-lucide="mouse-pointer-click" style={{width: 36, height: 36, color: "var(--text-secondary)", marginBottom: "12px"}}></i>
                <p>Click any question row or bubble on the overlay to inspect its detection details.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== CORRECTION MODAL ===== */}
      {correctionQ && (
        <div className="review-modal-overlay" onClick={() => setCorrectionQ(null)}>
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="review-modal-header">
              <h3>Correct Question {correctionQ.question_no}</h3>
              <button className="review-modal-close" onClick={() => setCorrectionQ(null)}>
                <i data-lucide="x" style={{width: 20, height: 20}}></i>
              </button>
            </div>
            <div className="review-modal-body">
              <div style={{marginBottom: "16px"}}>
                <span style={{color: "var(--text-secondary)", fontSize: "14px"}}>Current detected answer: </span>
                <span className="review-answer-pill" style={{backgroundColor: getStatusColor(correctionQ.status) + "20", color: getStatusColor(correctionQ.status), borderColor: getStatusColor(correctionQ.status)}}>
                  {correctionQ.selected_option || "BLANK"}
                </span>
              </div>
              <div style={{marginBottom: "20px"}}>
                <label className="form-label">Select correct answer:</label>
                <div className="review-correction-options">
                  {["A", "B", "C", "D"].map(opt => (
                    <div 
                      key={opt}
                      className={`review-correction-opt ${correctedOption === opt ? "review-correction-opt-selected" : ""}`}
                      onClick={() => setCorrectedOption(opt)}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="review-modal-footer">
              <button className="btn btn-secondary" onClick={() => setCorrectionQ(null)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={submitCorrection} 
                disabled={!correctedOption || correcting}
              >
                {correcting ? "Saving..." : "Apply Correction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 6: REPORTS & STATS
// -------------------------------------------------------------
function ReportsView({ exams }) {
  const [activeReportExamId, setActiveReportExamId] = useState("");
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    if (exams.length > 0 && !activeReportExamId) {
      setActiveReportExamId(exams[0].id.toString());
    }
  }, [exams]);

  useEffect(() => {
    if (!activeReportExamId) return;
    const loadReport = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/exams/${activeReportExamId}/stats`);
        if (res.ok) {
          const data = await res.json();
          setReportData(data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadReport();
  }, [activeReportExamId]);

  return (
    <div>
      <div className="header">
        <div>
          <h1 className="header-title">Reports & Analytics Panel</h1>
          <p className="header-subtitle">Extract exam session statistics, averages, and check student averages details.</p>
        </div>
      </div>
      
      <div className="card" style={{maxWidth: "400px"}}>
        <div className="form-group">
          <label className="form-label">Choose Target Exam</label>
          <select 
            className="form-control" 
            value={activeReportExamId} 
            onChange={(e) => setActiveReportExamId(e.target.value)}
          >
            <option value="">Select Exam Session...</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>{exam.name} ({exam.subject})</option>
            ))}
          </select>
        </div>
      </div>

      {reportData && (
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon-wrap" style={{backgroundColor: "rgba(6, 182, 212, 0.1)", color: "var(--color-info)"}}>
              <i data-lucide="users"></i>
            </div>
            <div className="metric-info">
              <span className="metric-val">{reportData.total_scans}</span>
              <span className="metric-title">Graded Sheets</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon-wrap" style={{backgroundColor: "rgba(37, 99, 235, 0.1)", color: "var(--color-primary)"}}>
              <i data-lucide="bar-chart-2"></i>
            </div>
            <div className="metric-info">
              <span className="metric-val">{reportData.average_score}</span>
              <span className="metric-title">Average marks</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon-wrap" style={{backgroundColor: "rgba(16, 185, 129, 0.1)", color: "var(--color-success)"}}>
              <i data-lucide="award"></i>
            </div>
            <div className="metric-info">
              <span className="metric-val">{reportData.highest_score}</span>
              <span className="metric-title">Highest Score</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// VIEW 7: SYSTEM SETTINGS
// -------------------------------------------------------------
function SettingsView() {
  const [apiUrl, setApiUrl] = useState(localStorage.getItem("OMR_API_BASE_URL") || window.location.origin);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    localStorage.setItem("OMR_API_BASE_URL", apiUrl);
    setSaveSuccess(true);
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <div>
      <div className="header">
        <div>
          <h1 className="header-title">System Configuration</h1>
          <p className="header-subtitle">Configure OMR backend URLs, computer vision thresholds, and database configuration.</p>
        </div>
      </div>

      {saveSuccess && (
        <div className="badge badge-success" style={{width: "100%", padding: "12px", borderRadius: "8px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px"}}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>Connection settings saved successfully. Reloading OMR app dashboard...</span>
        </div>
      )}

      <form className="card" onSubmit={handleSaveSettings}>
        <div className="card-title">Backend API Connection settings</div>
        <div className="form-group" style={{marginBottom: "16px"}}>
          <label className="form-label">FastAPI Backend Endpoint URL</label>
          <input 
            type="url" 
            className="form-control" 
            value={apiUrl} 
            onChange={(e) => setApiUrl(e.target.value)} 
            placeholder="http://localhost:8000" 
            required 
          />
          <small style={{color: "var(--text-secondary)", fontSize: "12px", display: "block", marginTop: "4px"}}>
            Specify the full URL of the running FastAPI server. If empty, defaults to current host (for Web Service setups) or localhost (for dev).
          </small>
        </div>
        <button type="submit" className="btn btn-primary" style={{alignSelf: "flex-start"}}>
          <i data-lucide="save"></i> Save Connection Config
        </button>
      </form>

      <div className="card">
        <div className="card-title">Computer Vision Tuning Defaults</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Adaptive Area BlockSize</label>
            <input type="number" className="form-control" defaultValue="51" />
          </div>
          <div className="form-group">
            <label className="form-label">Darkness fill Threshold (%)</label>
            <input type="number" className="form-control" defaultValue="45" />
          </div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-title">Database Migrations Broker</div>
        <div className="form-group">
          <label className="form-label">Active Connection String</label>
          <input type="text" className="form-control" readOnly value="sqlite:///./omr_app.db" style={{color: "var(--text-secondary)"}} />
        </div>
        <button className="btn btn-secondary" style={{opacity: 0.6, cursor: "not-allowed"}} disabled>
          <i data-lucide="database"></i> Initiate PostgreSQL Migrations
        </button>
      </div>
    </div>
  );
}

// Render the application
const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);
root.render(<App />);
