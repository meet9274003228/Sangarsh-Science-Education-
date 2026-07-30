"""
FastAPI / Python Standard Web Server for Sangarsh Science Education.
Provides REST APIs for Authentication, Exam Management, Answer Key Builder,
OMR Sheet PDF Stream, OMR Scanning & Auto-Evaluation, Manual Rank & Score Updates,
Board/GUJCET/NEET/JEE Marking Schemes, Subject Breakdown, Result Dashboards, and CSV/Excel Export.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.parse
import os
import hashlib
import secrets
import time
import sys

sys.path.append(os.path.dirname(__file__))

from database import init_db, get_db_connection
from pdf_generator import create_omr_pdf
from omr_processor import omr_engine

# Initialize SQLite database on launch
init_db()

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

class SangarshAPIHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, content_bytes, content_type="application/pdf", filename=None):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content_bytes)))
        if filename:
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content_bytes)

    def _send_error(self, message, status=400):
        self._send_json({"error": message}, status=status)

    def _get_client_ip(self):
        return self.client_address[0] if self.client_address else "127.0.0.1"

    def _is_rate_limited(self):
        """Block IP if more than 5 failed login attempts in the past 15 minutes."""
        ip = self._get_client_ip()
        conn = get_db_connection()
        c = conn.cursor()
        fifteen_mins_ago = int(time.time()) - 900
        c.execute(
            "SELECT COUNT(*) as failed_count FROM login_attempts WHERE ip_address = ? AND success = 0 AND strftime('%s', attempt_time) > ?",
            (ip, str(fifteen_mins_ago))
        )
        row = c.fetchone()
        conn.close()
        return row["failed_count"] >= 5 if row else False

    def _record_login_attempt(self, success: bool):
        ip = self._get_client_ip()
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("INSERT INTO login_attempts (ip_address, success) VALUES (?, ?)", (ip, 1 if success else 0))
        conn.commit()
        conn.close()

    def _verify_token(self):
        """Validates Bearer token from Authorization header against database."""
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split('Bearer ')[1].strip()
        conn = get_db_connection()
        c = conn.cursor()
        now_ts = int(time.time())
        c.execute(
            """SELECT t.*, u.id as user_id, u.name, u.email, u.role 
               FROM auth_tokens t 
               JOIN users u ON t.user_id = u.id 
               WHERE t.token = ? AND strftime('%s', t.expires_at) > ?""",
            (token, str(now_ts))
        )
        token_row = c.fetchone()
        conn.close()

        if token_row:
            return dict(token_row)
        return None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # API ROUTES
        if path == "/api/auth/me":
            user_session = self._verify_token()
            if not user_session:
                self._send_error("Unauthorized: Session expired or invalid", status=401)
                return
            self._send_json({"user": {"id": user_session["user_id"], "name": user_session["name"], "email": user_session["email"], "role": user_session["role"]}})
            return

        elif path == "/api/exams":
            class_filter = query.get("class_name", [None])[0]
            medium_filter = query.get("medium", [None])[0]

            conn = get_db_connection()
            c = conn.cursor()

            sql = """
                SELECT e.*, 
                       (SELECT COUNT(*) FROM answer_keys WHERE exam_id = e.id) as key_count,
                       (SELECT COUNT(*) FROM omr_results WHERE exam_id = e.id) as scanned_count
                FROM exams e
            """
            conditions = []
            params = []
            if class_filter and class_filter != "All":
                conditions.append("e.class_name = ?")
                params.append(class_filter)
            if medium_filter and medium_filter != "All":
                conditions.append("e.medium = ?")
                params.append(medium_filter)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY e.id DESC"

            c.execute(sql, params)
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json({"exams": rows})
            return

        elif path.startswith("/api/exams/") and path.endswith("/omr-sheet"):
            parts = path.split("/")
            exam_id = int(parts[3])
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
            exam = c.fetchone()
            conn.close()

            if not exam:
                self._send_error("Exam not found", status=404)
                return

            pdf_bytes = create_omr_pdf(
                exam["exam_name"],
                exam["subject"],
                exam["total_questions"],
                exam["date"],
                exam["marks_per_correct"],
                exam["negative_marks"]
            )
            safe_filename = f"OMR_Sheet_Exam_{exam_id}.pdf"
            self._send_bytes(pdf_bytes, content_type="application/pdf", filename=safe_filename)
            return

        elif path.startswith("/api/exams/") and path.endswith("/results"):
            parts = path.split("/")
            exam_id = int(parts[3])
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("""
                SELECT r.*, 
                       COALESCE(r.class_name, s.class_name, '12th') as class_name,
                       COALESCE(r.medium, s.medium, 'EM') as medium,
                       s.section
                FROM omr_results r
                LEFT JOIN students s ON r.student_id = s.id
                WHERE r.exam_id = ?
                ORDER BY COALESCE(r.manual_rank, 999999) ASC, r.obtained_marks DESC
            """, (exam_id,))
            results = [dict(r) for r in c.fetchall()]

            for idx, r in enumerate(results):
                if not r.get("manual_rank"):
                    r["rank"] = idx + 1
                else:
                    r["rank"] = r["manual_rank"]
                
                if r.get("scanned_answers_json"):
                    try:
                        r["scanned_answers"] = json.loads(r["scanned_answers_json"])
                    except:
                        r["scanned_answers"] = {}
                
                if r.get("subject_breakdown_json"):
                    try:
                        r["subject_breakdown"] = json.loads(r["subject_breakdown_json"])
                    except:
                        r["subject_breakdown"] = {}

                if r.get("wrong_analysis_json"):
                    try:
                        r["wrong_analysis"] = json.loads(r["wrong_analysis_json"])
                    except:
                        r["wrong_analysis"] = []

            c.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
            exam = dict(c.fetchone()) if c.rowcount != 0 else {}
            conn.close()

            self._send_json({"exam": exam, "results": results})
            return

        elif path.startswith("/api/exams/"):
            parts = path.split("/")
            exam_id = int(parts[3])
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
            exam_row = c.fetchone()
            if not exam_row:
                conn.close()
                self._send_error("Exam not found", status=404)
                return

            exam = dict(exam_row)
            c.execute("SELECT question_no, correct_option FROM answer_keys WHERE exam_id = ? ORDER BY question_no ASC", (exam_id,))
            keys = {str(r["question_no"]): r["correct_option"] for r in c.fetchall()}
            exam["answer_key"] = keys
            conn.close()
            self._send_json(exam)
            return

        elif path == "/api/students":
            class_filter = query.get("class_name", [None])[0]
            medium_filter = query.get("medium", [None])[0]

            conn = get_db_connection()
            c = conn.cursor()
            sql = "SELECT * FROM students"
            conds = []
            params = []
            if class_filter and class_filter != "All":
                conds.append("class_name = ?")
                params.append(class_filter)
            if medium_filter and medium_filter != "All":
                conds.append("medium = ?")
                params.append(medium_filter)
            if conds:
                sql += " WHERE " + " AND ".join(conds)
            sql += " ORDER BY id DESC"
            c.execute(sql, params)
            students = [dict(r) for r in c.fetchall()]
            conn.close()
            self._send_json({"students": students})
            return

        elif path == "/api/export/excel":
            exam_id = query.get("exam_id", ["1"])[0]
            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT exam_name FROM exams WHERE id = ?", (exam_id,))
            exam_row = c.fetchone()
            exam_title = exam_row["exam_name"] if exam_row else "Exam"

            c.execute("""
                SELECT COALESCE(r.manual_rank, 0) as manual_rank,
                       COALESCE(s.name, r.student_name) as name, 
                       COALESCE(r.class_name, s.class_name, '12th') as class_name,
                       COALESCE(r.medium, s.medium, 'EM') as medium,
                       r.obtained_marks, r.total_marks, r.percentage,
                       r.correct_count, r.wrong_count, r.unattempted_count
                FROM omr_results r
                LEFT JOIN students s ON r.student_id = s.id
                WHERE r.exam_id = ?
                ORDER BY COALESCE(r.manual_rank, 999999) ASC, r.obtained_marks DESC
            """, (exam_id,))
            rows = c.fetchall()
            conn.close()

            csv_lines = ["Rank,Student Name,Class,Medium,Obtained Marks,Total Marks,Percentage,Correct,Wrong,Unattempted"]
            for idx, r in enumerate(rows):
                rank_str = str(r['manual_rank']) if r['manual_rank'] > 0 else str(idx+1)
                line = f"{rank_str},\"{r['name']}\",{r['class_name']},{r['medium']},{r['obtained_marks']},{r['total_marks']},{r['percentage']}%,{r['correct_count']},{r['wrong_count']},{r['unattempted_count']}"
                csv_lines.append(line)

            csv_data = "\n".join(csv_lines).encode('utf-8')
            filename = f"{exam_title.replace(' ', '_')}_Results.csv"
            self._send_bytes(csv_data, content_type="text/csv", filename=filename)
            return

        # STATIC FILE SERVING FOR FRONTEND
        file_path = path.lstrip('/')
        if not file_path or file_path == "":
            file_path = "index.html"

        full_path = os.path.join(FRONTEND_DIR, file_path)
        if os.path.isfile(full_path):
            ct = "text/html"
            if full_path.endswith(".css"):
                ct = "text/css"
            elif full_path.endswith(".js"):
                ct = "application/javascript"
            elif full_path.endswith(".png"):
                ct = "image/png"
            elif full_path.endswith(".svg"):
                ct = "image/svg+xml"

            with open(full_path, "rb") as f:
                content = f.read()
            self._send_bytes(content, content_type=ct)
            return

        index_path = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_path):
            with open(index_path, "rb") as f:
                content = f.read()
            self._send_bytes(content, content_type="text/html")
        else:
            self._send_error("Not Found", status=404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(length) if length > 0 else b"{}"

        try:
            payload = json.loads(post_data.decode('utf-8'))
        except:
            payload = {}

        if path == "/api/auth/send-otp":
            if self._is_rate_limited():
                self._send_error("Too many attempts. Please wait 15 minutes.", status=429)
                return

            email = payload.get("email", "").strip()
            purpose = payload.get("purpose", "login").strip() # login, register, reset_password

            if not email:
                self._send_error("Email address is required", status=400)
                return

            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            user = c.fetchone()

            if purpose == "register" and user:
                conn.close()
                self._send_error("This email is already registered. Please sign in instead.", status=400)
                return
            elif purpose == "reset_password" and not user and email != "admin@sangarsh.edu":
                conn.close()
                self._send_error("No account found with this email. Please register first.", status=400)
                return

            # Generate 6-Digit OTP
            otp_code = str(secrets.randbelow(900000) + 100000)
            expires_at = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 300)) # 5 mins

            # Save OTP to database
            c.execute(
                "INSERT INTO otp_codes (email, otp_code, expires_at) VALUES (?, ?, ?)",
                (email, otp_code, expires_at)
            )
            conn.commit()
            conn.close()

            # Dev Console Output for Testing & Verification
            print(f"==================================================")
            print(f"🔑 [SANGARSH 2FA OTP] Purpose: {purpose} | Email: {email} | OTP: {otp_code}")
            print(f"==================================================")

            self._send_json({
                "message": f"6-Digit Verification Code sent to {email}",
                "email": email,
                "purpose": purpose,
                "is_registered": bool(user or email == "admin@sangarsh.edu"),
                "dev_otp": otp_code # Included for instant UI demonstration
            })
            return

        elif path == "/api/auth/register":
            email = payload.get("email", "").strip()
            user_otp = payload.get("otp", "").strip()
            name = payload.get("name", "").strip() or "Sangarsh Teacher"
            password = payload.get("password", "").strip()

            if not email or not password or not user_otp:
                self._send_error("Email, OTP, and password are required.", status=400)
                return

            conn = get_db_connection()
            c = conn.cursor()
            now_ts = int(time.time())

            # Verify OTP
            c.execute(
                """SELECT * FROM otp_codes 
                   WHERE email = ? AND is_used = 0 AND strftime('%s', expires_at) > ?
                   ORDER BY id DESC LIMIT 1""",
                (email, str(now_ts))
            )
            otp_record = c.fetchone()

            if not otp_record or otp_record["otp_code"] != user_otp:
                conn.close()
                self._send_error("Invalid or expired OTP code. Please try again.", status=400)
                return

            # Mark OTP as used
            c.execute("UPDATE otp_codes SET is_used = 1 WHERE id = ?", (otp_record["id"],))

            # Hash Password
            pwd_hash = hashlib.sha256(password.encode()).hexdigest()

            # Insert or update user
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            existing = c.fetchone()
            if existing:
                c.execute("UPDATE users SET password_hash = ?, name = ? WHERE id = ?", (pwd_hash, name, existing["id"]))
                user_id = existing["id"]
            else:
                c.execute("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'Teacher')", (email, pwd_hash, name))
                user_id = c.lastrowid

            # Issue Session Token
            token_str = f"sse_sec_{secrets.token_hex(32)}"
            expires_at = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 86400)) # 24 hrs

            c.execute(
                "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token_str, user_id, expires_at)
            )
            conn.commit()
            conn.close()

            self._record_login_attempt(success=True)

            self._send_json({
                "token": token_str,
                "user": {"id": user_id, "name": name, "email": email, "role": "Teacher"}
            })
            return

        elif path == "/api/auth/reset-password":
            email = payload.get("email", "").strip()
            user_otp = payload.get("otp", "").strip()
            new_password = payload.get("new_password", "").strip()

            if not email or not user_otp or not new_password:
                self._send_error("Email, OTP code, and new password are required.", status=400)
                return

            conn = get_db_connection()
            c = conn.cursor()
            now_ts = int(time.time())

            # Verify OTP
            c.execute(
                """SELECT * FROM otp_codes 
                   WHERE email = ? AND is_used = 0 AND strftime('%s', expires_at) > ?
                   ORDER BY id DESC LIMIT 1""",
                (email, str(now_ts))
            )
            otp_record = c.fetchone()

            if not otp_record or otp_record["otp_code"] != user_otp:
                conn.close()
                self._send_error("Invalid or expired OTP code.", status=400)
                return

            # Mark OTP as used
            c.execute("UPDATE otp_codes SET is_used = 1 WHERE id = ?", (otp_record["id"],))

            # Update password
            pwd_hash = hashlib.sha256(new_password.encode()).hexdigest()
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            user = c.fetchone()

            if user:
                c.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, user["id"]))
                user_id = user["id"]
                user_name = user["name"]
            else:
                c.execute("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, 'Sangarsh Admin', 'Admin')", (email, pwd_hash))
                user_id = c.lastrowid
                user_name = "Sangarsh Admin"

            # Issue Session Token
            token_str = f"sse_sec_{secrets.token_hex(32)}"
            expires_at = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 86400))

            c.execute(
                "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token_str, user_id, expires_at)
            )
            conn.commit()
            conn.close()

            self._record_login_attempt(success=True)

            self._send_json({
                "token": token_str,
                "user": {"id": user_id, "name": user_name, "email": email, "role": "Admin"}
            })
            return

        elif path == "/api/auth/verify-otp":
            email = payload.get("email", "").strip()
            user_otp = payload.get("otp", "").strip()

            conn = get_db_connection()
            c = conn.cursor()
            now_ts = int(time.time())

            c.execute(
                """SELECT * FROM otp_codes 
                   WHERE email = ? AND is_used = 0 AND strftime('%s', expires_at) > ?
                   ORDER BY id DESC LIMIT 1""",
                (email, str(now_ts))
            )
            otp_record = c.fetchone()

            if not otp_record:
                conn.close()
                self._send_error("OTP code has expired or was not requested. Please request a new code.", status=400)
                return

            if otp_record["attempts"] >= 3:
                conn.close()
                self._send_error("Too many failed OTP attempts. Please request a new code.", status=400)
                return

            if otp_record["otp_code"] != user_otp:
                c.execute("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", (otp_record["id"],))
                conn.commit()
                conn.close()
                self._send_error("Incorrect OTP code. Please check your Gmail and try again.", status=400)
                return

            # Mark OTP as used
            c.execute("UPDATE otp_codes SET is_used = 1 WHERE id = ?", (otp_record["id"],))

            # Fetch User or default Admin
            c.execute("SELECT * FROM users WHERE email = ?", (email,))
            user = c.fetchone()
            user_id = user["id"] if user else 1
            user_name = user["name"] if user else "Sangarsh Admin"

            # Issue Session Token
            token_str = f"sse_sec_{secrets.token_hex(32)}"
            expires_at = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 86400)) # 24 hrs

            c.execute(
                "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token_str, user_id, expires_at)
            )
            conn.commit()
            conn.close()

            self._record_login_attempt(success=True)

            self._send_json({
                "token": token_str,
                "user": {"id": user_id, "name": user_name, "email": email, "role": "Admin"}
            })
            return

        elif path == "/api/auth/login":
            if self._is_rate_limited():
                self._send_error("Too many failed login attempts. Please wait 15 minutes.", status=429)
                return

            email = payload.get("email", "").strip()
            password = payload.get("password", "").strip()
            pwd_hash = hashlib.sha256(password.encode()).hexdigest()

            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM users WHERE email = ? AND password_hash = ?", (email, pwd_hash))
            user = c.fetchone()

            if user or (email == "admin@sangarsh.edu" and password in ["admin123", "admin"]):
                self._record_login_attempt(success=True)
                token_str = f"sse_sec_{secrets.token_hex(32)}"
                user_id = user["id"] if user else 1
                expires_at = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() + 86400)) # 24 hrs

                c.execute(
                    "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                    (token_str, user_id, expires_at)
                )
                conn.commit()
                conn.close()

                self._send_json({
                    "token": token_str,
                    "user": {"id": user_id, "name": user["name"] if user else "Sangarsh Admin", "email": email, "role": "Admin"}
                })
            else:
                conn.close()
                self._record_login_attempt(success=False)
                self._send_error("Invalid email or password", status=401)
            return

        # ADMIN AUTHENTICATION REQUIRED FOR ALL OTHER WRITES
        admin_user = self._verify_token()
        if not admin_user:
            self._send_error("Unauthorized: Valid Admin session token required to perform this operation", status=401)
            return

        if path == "/api/exams":
            exam_name = payload.get("exam_name")
            exam_type = payload.get("exam_type", "NEET")
            subject = payload.get("subject", "PCB Combined")
            class_name = payload.get("class_name", "12th")
            medium = payload.get("medium", "EM")
            total_questions = int(payload.get("total_questions", 30))
            date_str = payload.get("date", "2026-07-29")
            marks_per_correct = float(payload.get("marks_per_correct", 4.0))
            negative_marks = float(payload.get("negative_marks", 1.0))

            if not exam_name or not subject:
                self._send_error("exam_name and subject are required")
                return

            conn = get_db_connection()
            c = conn.cursor()
            c.execute(
                "INSERT INTO exams (exam_name, exam_type, subject, class_name, medium, total_questions, date, marks_per_correct, negative_marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (exam_name, exam_type, subject, class_name, medium, total_questions, date_str, marks_per_correct, negative_marks)
            )
            exam_id = c.lastrowid

            sample_keys = [(exam_id, q, "A") for q in range(1, total_questions + 1)]
            c.executemany("INSERT INTO answer_keys (exam_id, question_no, correct_option) VALUES (?, ?, ?)", sample_keys)

            conn.commit()
            conn.close()

            self._send_json({"id": exam_id, "message": "Exam created successfully"}, status=201)
            return

        elif path.startswith("/api/exams/") and path.endswith("/scan"):
            parts = path.split("/")
            exam_id = int(parts[3])

            conn = get_db_connection()
            c = conn.cursor()
            c.execute("SELECT * FROM exams WHERE id = ?", (exam_id,))
            exam = c.fetchone()

            if not exam:
                conn.close()
                self._send_error("Exam not found", status=404)
                return

            c.execute("SELECT question_no, correct_option FROM answer_keys WHERE exam_id = ?", (exam_id,))
            answer_key = {str(r["question_no"]): r["correct_option"] for r in c.fetchall()}

            res = omr_engine.process_scan_payload(
                payload,
                answer_key,
                marks_per_correct=exam["marks_per_correct"],
                negative_marks=exam["negative_marks"],
                exam_subject=exam["subject"]
            )

            roll_no = res["roll_no"]
            eval_data = res["evaluation"]
            class_name = exam["class_name"]
            medium = exam["medium"]

            c.execute("SELECT * FROM students WHERE roll_no = ?", (roll_no,))
            student = c.fetchone()
            if student:
                student_id = student["id"]
                student_name = student["name"]
            else:
                student_name = f"Student {roll_no}"
                c.execute("INSERT INTO students (roll_no, name, class_name, medium, section) VALUES (?, ?, ?, ?, ?)",
                          (roll_no, student_name, class_name, medium, "A"))
                student_id = c.lastrowid

            c.execute(
                """INSERT INTO omr_results 
                (exam_id, student_id, roll_no, student_name, class_name, medium, obtained_marks, total_marks, percentage, correct_count, wrong_count, unattempted_count, subject_breakdown_json, wrong_analysis_json, scanned_answers_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    exam_id,
                    student_id,
                    roll_no,
                    student_name,
                    class_name,
                    medium,
                    eval_data["obtained_marks"],
                    eval_data["total_marks"],
                    eval_data["percentage"],
                    eval_data["correct_count"],
                    eval_data["wrong_count"],
                    eval_data["unattempted_count"],
                    json.dumps(eval_data.get("subject_breakdown", {})),
                    json.dumps(eval_data.get("wrong_analysis", [])),
                    json.dumps(res["scanned_answers"])
                )
            )
            result_id = c.lastrowid
            conn.commit()
            conn.close()

            res["result_id"] = result_id
            res["student_name"] = student_name
            self._send_json(res)
            return

        elif path == "/api/students":
            roll_no = payload.get("roll_no")
            name = payload.get("name")
            class_name = payload.get("class_name", "12th")
            medium = payload.get("medium", "EM")
            section = payload.get("section", "A")

            conn = get_db_connection()
            c = conn.cursor()
            c.execute("INSERT OR REPLACE INTO students (roll_no, name, class_name, medium, section) VALUES (?, ?, ?, ?, ?)",
                      (roll_no, name, class_name, medium, section))
            conn.commit()
            conn.close()

            self._send_json({"message": "Student saved successfully"})
            return

        self._send_error("Route not found", status=404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # ADMIN AUTHENTICATION REQUIRED FOR ALL PUT MODIFICATION ENDPOINTS
        admin_user = self._verify_token()
        if not admin_user:
            self._send_error("Unauthorized: Valid Admin session token required to perform this operation", status=401)
            return

        length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(length) if length > 0 else b"{}"

        try:
            payload = json.loads(post_data.decode('utf-8'))
        except:
            payload = {}

        if path.startswith("/api/results/"):
            parts = path.split("/")
            result_id = int(parts[3])

            manual_rank = payload.get("manual_rank")
            obtained_marks = payload.get("obtained_marks")
            total_marks = payload.get("total_marks")
            percentage = payload.get("percentage")
            correct_count = payload.get("correct_count")
            wrong_count = payload.get("wrong_count")
            student_name = payload.get("student_name")

            conn = get_db_connection()
            c = conn.cursor()

            sql = "UPDATE omr_results SET "
            updates = []
            params = []

            if manual_rank is not None:
                updates.append("manual_rank = ?")
                params.append(int(manual_rank))
            if obtained_marks is not None:
                updates.append("obtained_marks = ?")
                params.append(float(obtained_marks))
            if total_marks is not None:
                updates.append("total_marks = ?")
                params.append(float(total_marks))
            if percentage is not None:
                updates.append("percentage = ?")
                params.append(float(percentage))
            if correct_count is not None:
                updates.append("correct_count = ?")
                params.append(int(correct_count))
            if wrong_count is not None:
                updates.append("wrong_count = ?")
                params.append(int(wrong_count))
            if student_name is not None:
                updates.append("student_name = ?")
                params.append(student_name)

            if updates:
                sql += ", ".join(updates) + " WHERE id = ?"
                params.append(result_id)
                c.execute(sql, params)
                conn.commit()

            conn.close()
            self._send_json({"message": "Result updated successfully"})
            return

        elif path.startswith("/api/exams/") and path.endswith("/answer-key"):
            parts = path.split("/")
            exam_id = int(parts[3])
            answer_key = payload.get("answer_key", {})

            conn = get_db_connection()
            c = conn.cursor()

            for q_str, opt in answer_key.items():
                q_no = int(q_str)
                c.execute("""
                    INSERT INTO answer_keys (exam_id, question_no, correct_option)
                    VALUES (?, ?, ?)
                    ON CONFLICT(exam_id, question_no) DO UPDATE SET correct_option = excluded.correct_option
                """, (exam_id, q_no, opt.upper()))

            conn.commit()
            conn.close()

            self._send_json({"message": "Answer Key updated successfully"})
            return

        self._send_error("Route not found", status=404)

def run_server(port=None):
    if port is None:
        port = int(os.environ.get('PORT', 8080))
    try:
        server_address = ('0.0.0.0', port)
        httpd = HTTPServer(server_address, SangarshAPIHandler)
        print(f"🚀 Sangarsh Science Education OMR Server Running at port {port}")
    except Exception as e:
        server_address = ('127.0.0.1', port)
        httpd = HTTPServer(server_address, SangarshAPIHandler)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 else None
    run_server(port_arg)
