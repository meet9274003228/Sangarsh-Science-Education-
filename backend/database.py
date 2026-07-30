import sqlite3
import json
import os
import hashlib
import time

DB_PATH = "/tmp/sse_database.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Auth Tokens Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS auth_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Login Attempts Table for Rate Limiting
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        success INTEGER NOT NULL DEFAULT 0
    )
    """)

    # OTP Verification Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS otp_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        attempts INTEGER DEFAULT 0,
        is_used INTEGER DEFAULT 0
    )
    """)

    # Students Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_no TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        class_name TEXT NOT NULL DEFAULT '12th',
        medium TEXT NOT NULL DEFAULT 'EM',
        section TEXT DEFAULT 'A',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Exams Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_name TEXT NOT NULL,
        exam_type TEXT NOT NULL DEFAULT 'NEET',
        subject TEXT NOT NULL,
        class_name TEXT NOT NULL DEFAULT '12th',
        medium TEXT NOT NULL DEFAULT 'EM',
        total_questions INTEGER NOT NULL,
        date TEXT NOT NULL,
        marks_per_correct REAL DEFAULT 4.0,
        negative_marks REAL DEFAULT 1.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # AnswerKeys Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS answer_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        question_no INTEGER NOT NULL,
        correct_option TEXT NOT NULL,
        subject_name TEXT DEFAULT NULL,
        FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE,
        UNIQUE(exam_id, question_no)
    )
    """)

    # OMRResults Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS omr_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_id INTEGER NOT NULL,
        student_id INTEGER,
        roll_no TEXT NOT NULL,
        student_name TEXT,
        class_name TEXT DEFAULT '12th',
        medium TEXT DEFAULT 'EM',
        manual_rank INTEGER DEFAULT NULL,
        obtained_marks REAL NOT NULL,
        total_marks REAL NOT NULL,
        percentage REAL NOT NULL,
        correct_count INTEGER NOT NULL,
        wrong_count INTEGER NOT NULL,
        unattempted_count INTEGER NOT NULL,
        subject_breakdown_json TEXT DEFAULT NULL,
        wrong_analysis_json TEXT DEFAULT NULL,
        scanned_answers_json TEXT NOT NULL,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
    )
    """)

    # Automated Column Migrations for existing DB
    def add_column_if_missing(table, col, col_def):
        cursor.execute(f"PRAGMA table_info({table})")
        cols = [r["name"] for r in cursor.fetchall()]
        if col not in cols:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}")
            except Exception as e:
                print(f"Migration notice: {e}")

    add_column_if_missing("exams", "exam_type", "TEXT DEFAULT 'NEET'")
    add_column_if_missing("exams", "class_name", "TEXT DEFAULT '12th'")
    add_column_if_missing("exams", "medium", "TEXT DEFAULT 'EM'")
    add_column_if_missing("students", "medium", "TEXT DEFAULT 'EM'")
    add_column_if_missing("omr_results", "manual_rank", "INTEGER DEFAULT NULL")
    add_column_if_missing("omr_results", "class_name", "TEXT DEFAULT '12th'")
    add_column_if_missing("omr_results", "medium", "TEXT DEFAULT 'EM'")
    add_column_if_missing("omr_results", "subject_breakdown_json", "TEXT DEFAULT NULL")
    add_column_if_missing("omr_results", "wrong_analysis_json", "TEXT DEFAULT NULL")

    # Seed Default Admin User if empty
    cursor.execute("SELECT * FROM users WHERE email = ?", ("admin@sangarsh.edu",))
    if not cursor.fetchone():
        def hash_pw(pwd):
            return hashlib.sha256(pwd.encode()).hexdigest()
        cursor.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ("Sangarsh Admin", "admin@sangarsh.edu", hash_pw("admin123"), "Admin")
        )

    # Seed Default Sample Students if empty
    cursor.execute("SELECT COUNT(*) as count FROM students")
    if cursor.fetchone()["count"] == 0:
        sample_students = [
            ("100001", "Aarav Sharma", "11th", "EM", "A"),
            ("100002", "Priya Patel", "11th", "GM", "A"),
            ("100003", "Rohan Verma", "11th", "EM", "B"),
            ("100004", "Ananya Singh", "12th", "EM", "A"),
            ("100005", "Kabir Gupta", "12th", "GM", "A"),
            ("100006", "Sanya Kumar", "12th", "EM", "B"),
        ]
        cursor.executemany(
            "INSERT INTO students (roll_no, name, class_name, medium, section) VALUES (?, ?, ?, ?, ?)",
            sample_students
        )

    # Seed Sample Exams if empty
    cursor.execute("SELECT COUNT(*) as count FROM exams")
    if cursor.fetchone()["count"] == 0:
        cursor.execute(
            "INSERT INTO exams (exam_name, exam_type, subject, class_name, medium, total_questions, date, marks_per_correct, negative_marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("Grand Science Assessment 2026", "NEET", "PCB Combined", "12th", "EM", 30, "2026-07-29", 4.0, 1.0)
        )
        exam_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO exams (exam_name, exam_type, subject, class_name, medium, total_questions, date, marks_per_correct, negative_marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("11th Chemistry Chapterwise Test", "Board", "Chemistry", "11th", "GM", 30, "2026-07-29", 1.0, 0.0)
        )

        options = ["A", "B", "C", "D"]
        sample_key = [(exam_id, q, options[(q - 1) % 4]) for q in range(1, 31)]
        cursor.executemany(
            "INSERT INTO answer_keys (exam_id, question_no, correct_option) VALUES (?, ?, ?)",
            sample_key
        )

        sample_ans = {str(q): options[(q - 1) % 4] if q % 5 != 0 else options[q % 4] for q in range(1, 31)}
        
        # Subject breakdown & wrong analysis
        subject_breakdown = {
            "Physics": {"correct": 8, "wrong": 2, "marks": 30.0, "total": 40.0},
            "Chemistry": {"correct": 8, "wrong": 2, "marks": 30.0, "total": 40.0},
            "Biology": {"correct": 8, "wrong": 2, "marks": 36.0, "total": 40.0}
        }
        
        wrong_analysis = [
            {"q": 5, "marked": "B", "correct": "A"},
            {"q": 10, "marked": "C", "correct": "B"},
            {"q": 15, "marked": "D", "correct": "C"},
            {"q": 20, "marked": "A", "correct": "D"},
            {"q": 25, "marked": "B", "correct": "A"},
            {"q": 30, "marked": "C", "correct": "B"}
        ]

        cursor.execute(
            """INSERT INTO omr_results
            (exam_id, student_id, roll_no, student_name, class_name, medium, manual_rank, obtained_marks, total_marks, percentage, correct_count, wrong_count, unattempted_count, subject_breakdown_json, wrong_analysis_json, scanned_answers_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                exam_id, 1, "100001", "Aarav Sharma", "12th", "EM", 1, 96.0, 120.0, 80.0, 24, 6, 0,
                json.dumps(subject_breakdown), json.dumps(wrong_analysis), json.dumps(sample_ans)
            )
        )

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
