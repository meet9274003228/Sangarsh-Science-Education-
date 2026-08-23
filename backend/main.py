import os
import sys
import json
import sqlite3
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

# Add the backend folder to sys.path so nested relative imports work on Render root CWD executions
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Detect dependencies
HAS_DEPS = True
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.staticfiles import StaticFiles
    
    from database import engine, Base
    from api.templates_router import router as templates_router
    from api.exams_router import router as exams_router
    from api.scans_router import router as scans_router
    from api.scans_router import UPLOAD_DIR
except ImportError as e:
    HAS_DEPS = False
    print(f"OMR BACKEND DEP IMPORT ERROR: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc()

# Database file reference
DB_FILE = os.path.join(os.path.dirname(__file__), "omr_app.db")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Helper to boot SQLite tables if running in pure-python fallback mode
def init_fallback_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        questions_count INTEGER,
        options_count INTEGER,
        sheet_width INTEGER,
        sheet_height INTEGER,
        bubble_layout_json TEXT,
        roll_number_config_json TEXT,
        alignment_markers_json TEXT,
        question_regions_json TEXT,
        student_id_region_json TEXT
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        exam_type TEXT,
        subject TEXT,
        template_id INTEGER,
        marks_per_correct REAL,
        negative_marks REAL,
        blank_marks REAL,
        answer_key_json TEXT
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER,
        student_roll_no TEXT,
        student_name TEXT,
        percentage REAL,
        obtained_marks REAL,
        correct_count INTEGER,
        wrong_count INTEGER,
        blank_count INTEGER,
        multiple_marked_count INTEGER,
        confidence_score REAL,
        scanned_image_url TEXT,
        evaluation_result_json TEXT
    )
    """)
    
    # Pre-populate with a standard default configuration if empty
    c.execute("SELECT COUNT(*) FROM templates")
    if c.fetchone()[0] == 0:
        default_bubbles = []
        for q in range(1, 31):
            bubbles = []
            for o in range(4):
                bx = 100 + (o * 35)
                by = 120 + (q * 25)
                bubbles.append({
                    "option": chr(65 + o),
                    "x": bx,
                    "y": by,
                    "r": 9,
                    "width": 18,
                    "height": 18,
                    "normalized_x": bx / 800,
                    "normalized_y": by / 1100,
                    "normalized_width": 18 / 800,
                    "normalized_height": 18 / 1100
                })
            default_bubbles.append({
                "question_no": q,
                "bubbles": bubbles
            })
            
        c.execute("""
        INSERT INTO templates (name, questions_count, options_count, sheet_width, sheet_height, bubble_layout_json, roll_number_config_json, alignment_markers_json)
        VALUES ('NEET Mock 30 Qs', 30, 4, 800, 1100, ?, '{"x":500,"y":70,"columns":6,"rows":10,"step_x":22,"step_y":22,"radius":8}', '[]')
        """, (json.dumps(default_bubbles),))
        
        # Populate a default dry exam too
        c.execute("""
        INSERT INTO exams (name, exam_type, subject, template_id, marks_per_correct, negative_marks, blank_marks, answer_key_json)
        VALUES ('NEET Biology Practice', 'NEET', 'Biology', 1, 4.0, -1.0, 0.0, '{"1":"A","2":"B","3":"C"}')
        """)
        
    conn.commit()
    conn.close()

if HAS_DEPS:
    # ----------------- FASTAPI MODE -----------------
    Base.metadata.create_all(bind=engine)
    
    app = FastAPI(
        title="OMR Optical Mark Recognition System API",
        description="Backend API services supporting MCQ answer sheets evaluation and analytics dashboards.",
        version="1.0.0"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(templates_router)
    app.include_router(exams_router)
    app.include_router(scans_router)
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

    # Serve static frontend web files on base path
    FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    
    @app.get("/status")
    def get_status():
         return {"status": "online", "mode": "FastAPI/SQLAlchemy"}

else:
    # ----------------- STANDALONE STANDARD HTTP MODE -----------------
    init_fallback_db()
    FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))

    class StandardOMRRequestHandler(BaseHTTPRequestHandler):
        def _send_json(self, data, status=200):
            body = json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            parts = urllib.parse.urlparse(self.path)
            path_segments = [p for p in parts.path.split("/") if p]
            
            # API Endpoints
            if path_segments and path_segments[0] == "api":
                conn = sqlite3.connect(DB_FILE)
                conn.row_factory = sqlite3.Row
                c = conn.cursor()

                # GET /api/templates
                if len(path_segments) == 2 and path_segments[1] == "templates":
                    c.execute("SELECT * FROM templates")
                    rows = c.fetchall()
                    templates_list = []
                    for r in rows:
                        templates_list.append({
                            "id": r["id"],
                            "name": r["name"],
                            "questions_count": r["questions_count"],
                            "options_count": r["options_count"],
                            "sheet_width": r["sheet_width"],
                            "sheet_height": r["sheet_height"],
                            "bubble_layout": json.loads(r["bubble_layout_json"] or "[]"),
                            "roll_number_config": json.loads(r["roll_number_config_json"] or "{}"),
                            "alignment_markers": json.loads(r["alignment_markers_json"] or "[]"),
                            "question_regions": json.loads(r["question_regions_json"] or "[]"),
                            "student_id_region": json.loads(r["student_id_region_json"] or "{}")
                        })
                    conn.close()
                    return self._send_json(templates_list)
                
                # GET /api/templates/{id}
                elif len(path_segments) == 3 and path_segments[1] == "templates":
                    template_id = int(path_segments[2])
                    c.execute("SELECT * FROM templates WHERE id = ?", (template_id,))
                    row = c.fetchone()
                    conn.close()
                    if row:
                        return self._send_json({
                            "id": row["id"],
                            "name": row["name"],
                            "questions_count": row["questions_count"],
                            "options_count": row["options_count"],
                            "sheet_width": row["sheet_width"],
                            "sheet_height": row["sheet_height"],
                            "bubble_layout": json.loads(row["bubble_layout_json"] or "[]"),
                            "roll_number_config": json.loads(row["roll_number_config_json"] or "{}"),
                            "alignment_markers": json.loads(row["alignment_markers_json"] or "[]"),
                            "question_regions": json.loads(row["question_regions_json"] or "[]"),
                            "student_id_region": json.loads(row["student_id_region_json"] or "{}")
                        })
                    return self._send_json({"detail": "Template not found"}, 404)

                # GET /api/exams
                elif len(path_segments) == 2 and path_segments[1] == "exams":
                    c.execute("SELECT * FROM exams")
                    rows = c.fetchall()
                    exams_list = []
                    for r in rows:
                        exams_list.append({
                            "id": r["id"],
                            "name": r["name"],
                            "exam_type": r["exam_type"],
                            "subject": r["subject"],
                            "template_id": r["template_id"],
                            "marks_per_correct": r["marks_per_correct"],
                            "negative_marks": r["negative_marks"],
                            "blank_marks": r["blank_marks"],
                            "answer_key": json.loads(r["answer_key_json"] or "{}")
                        })
                    conn.close()
                    return self._send_json(exams_list)
                
                conn.close()
                return self._send_json({"detail": "Not Mocked"}, 404)

            # Serve uploads statically
            if path_segments and path_segments[0] == "uploads":
                file_path = os.path.join(UPLOAD_DIR, "/".join(path_segments[1:]))
                if os.path.isfile(file_path):
                    self.send_response(200)
                    self.send_header("Content-Type", "image/png")
                    self.end_headers()
                    with open(file_path, "rb") as f:
                        self.wfile.write(f.read())
                    return
                self.send_error(404)
                return

            # Serve static frontend web files
            relative_path = parts.path.lstrip("/")
            if not relative_path:
                relative_path = "index.html"
            
            full_path = os.path.join(FRONTEND_DIR, relative_path)
            if os.path.isfile(full_path):
                self.send_response(200)
                if full_path.endswith(".html"):
                    self.send_header("Content-Type", "text/html")
                elif full_path.endswith(".css"):
                    self.send_header("Content-Type", "text/css")
                elif full_path.endswith(".jsx") or full_path.endswith(".js"):
                    self.send_header("Content-Type", "application/javascript")
                self.end_headers()
                with open(full_path, "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
                return
            
            # SPA fallback to index.html
            index_path = os.path.join(FRONTEND_DIR, "index.html")
            if os.path.isfile(index_path):
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                with open(index_path, "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
                return

            self.send_error(404)

        def do_POST(self):
            parts = urllib.parse.urlparse(self.path)
            path_segments = [p for p in parts.path.split("/") if p]
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            if path_segments and path_segments[0] == "api":
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                try:
                    payload = json.loads(post_data.decode("utf-8"))
                except:
                    return self._send_json({"detail": "Malformed JSON body"}, 400)

                # POST /api/templates
                if len(path_segments) == 2 and path_segments[1] == "templates":
                    # CHECKPOINT 2: Restrictive Constraints validation
                    name = payload.get("name", "New Template")
                    q_count = int(payload.get("questions_count", 0))
                    o_count = int(payload.get("options_count", 0))
                    
                    if q_count < 1:
                        return self._send_json({"detail": "validation: questions_count must be at least 1"}, 400)
                    if o_count < 1:
                        return self._send_json({"detail": "validation: options_count must be at least 1"}, 400)
                    
                    sheet_width = int(payload.get("sheet_width", 800))
                    sheet_height = int(payload.get("sheet_height", 1100))
                    
                    c.execute("""
                    INSERT INTO templates (name, questions_count, options_count, sheet_width, sheet_height, bubble_layout_json, roll_number_config_json, alignment_markers_json, question_regions_json, student_id_region_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        name, q_count, o_count, sheet_width, sheet_height,
                        json.dumps(payload.get("bubble_layout", [])),
                        json.dumps(payload.get("roll_number_config", {})),
                        json.dumps(payload.get("alignment_markers", [])),
                        json.dumps(payload.get("question_regions", [])),
                        json.dumps(payload.get("student_id_region", {}))
                    ))
                    conn.commit()
                    new_id = c.lastrowid
                    conn.close()
                    payload["id"] = new_id
                    return self._send_json(payload, 201)

                # POST /api/exams
                elif len(path_segments) == 2 and path_segments[1] == "exams":
                    name = payload.get("name")
                    exam_type = payload.get("exam_type", "GUJCET")
                    subj = payload.get("subject", "Physics")
                    template_id = payload.get("template_id")
                    correct = float(payload.get("marks_per_correct", 1.0))
                    negative = float(payload.get("negative_marks", 0.0))
                    blank = float(payload.get("blank_marks", 0.0))
                    
                    # CHECKPOINT 2: Scoring limits constraints validation
                    if correct <= 0:
                        return self._send_json({"detail": "validation: correct marks value must be greater than zero"}, 400)
                    if negative > 0:
                        # Prevent negative marks configured as a positive gain value
                        negative = -negative
                    if blank > 0:
                        return self._send_json({"detail": "validation: blank marks penalty/bonus must not exceed incorrect penalty"}, 400)

                    c.execute("""
                    INSERT INTO exams (name, exam_type, subject, template_id, marks_per_correct, negative_marks, blank_marks, answer_key_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (name, exam_type, subj, template_id, correct, negative, blank, json.dumps({})))
                    conn.commit()
                    new_id = c.lastrowid
                    conn.close()
                    payload["id"] = new_id
                    return self._send_json(payload, 201)

                conn.close()

            self.send_error(404)

        def do_PUT(self):
            parts = urllib.parse.urlparse(self.path)
            path_segments = [p for p in parts.path.split("/") if p]
            content_length = int(self.headers.get('Content-Length', 0))
            put_data = self.rfile.read(content_length)

            if path_segments and path_segments[0] == "api":
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                try:
                    payload = json.loads(put_data.decode("utf-8"))
                except:
                    return self._send_json({"detail": "Malformed JSON"}, 400)

                # PUT /api/templates/{id}
                if len(path_segments) == 3 and path_segments[1] == "templates":
                    template_id = int(path_segments[2])
                    
                    # Target validations: check for overlap in bubbles logic
                    bubble_layout = payload.get("bubble_layout", [])
                    # Flat checklist list of bubble geometry circles to cross-verify overlap
                    bubbles = []
                    for q in bubble_layout:
                        for b in q.get("bubbles", []):
                            bubbles.append({
                                "q": q.get("question_no", 0),
                                "opt": b.get("option", "A"),
                                "x": b.get("x", 0),
                                "y": b.get("y", 0),
                                "r": b.get("r", 9)
                            })
                    
                    # Collision detection threshold limit
                    for i in range(len(bubbles)):
                        for j in range(i + 1, len(bubbles)):
                            b1 = bubbles[i]
                            b2 = bubbles[j]
                            dist = ((b1["x"] - b2["x"])**2 + (b1["y"] - b2["y"])**2)**0.5
                            if dist < (b1["r"] + b2["r"] - 2): # overlapping region circles
                                return self._send_json({
                                    "detail": f"validation: bubble collision overlap detected between Question {b1['q']} Option {b1['opt']} and Question {b2['q']} Option {b2['opt']}."
                                }, 400)

                    c.execute("""
                    UPDATE templates 
                    SET name = ?, questions_count = ?, options_count = ?, sheet_width = ?, sheet_height = ?,
                        bubble_layout_json = ?, roll_number_config_json = ?, alignment_markers_json = ?,
                        question_regions_json = ?, student_id_region_json = ?
                    WHERE id = ?
                    """, (
                        payload.get("name"),
                        int(payload.get("questions_count", 30)),
                        int(payload.get("options_count", 4)),
                        int(payload.get("sheet_width", 800)),
                        int(payload.get("sheet_height", 1100)),
                        json.dumps(bubble_layout),
                        json.dumps(payload.get("roll_number_config", {})),
                        json.dumps(payload.get("alignment_markers", [])),
                        json.dumps(payload.get("question_regions", [])),
                        json.dumps(payload.get("student_id_region", {})),
                        template_id
                    ))
                    conn.commit()
                    conn.close()
                    return self._send_json(payload, 200)

                # PUT /api/exams/{id}/answer-key
                elif len(path_segments) == 4 and path_segments[1] == "exams" and path_segments[3] == "answer-key":
                    exam_id = int(path_segments[2])
                    answer_key = payload.get("answer_key", {})
                    c.execute("UPDATE exams SET answer_key_json = ? WHERE id = ?", (json.dumps(answer_key), exam_id))
                    conn.commit()
                    conn.close()
                    return self._send_json({"detail": "Answer key mapped successfully"})

                conn.close()

            self.send_error(404)

if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 8000))
    if HAS_DEPS:
        import uvicorn
        print("Starting FastAPI Production Server on port:", PORT)
        uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
    else:
        print("Required dependencies (FastAPI, SQLAlchemy etc.) missing/offline.")
        print("Starting standard built-in HTTP server fallback on port:", PORT)
        server = HTTPServer(("127.0.0.1", PORT), StandardOMRRequestHandler)
        server.serve_forever()

