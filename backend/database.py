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

    # Students Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roll_no TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        class_name TEXT NOT NULL,
        section TEXT DEFAULT 'A',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Exams Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exam_name TEXT NOT NULL,
        subject TEXT NOT NULL,
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
        obtained_marks REAL NOT NULL,
        total_marks REAL NOT NULL,
        percentage REAL NOT NULL,
        correct_count INTEGER NOT NULL,
        wrong_count INTEGER NOT NULL,
        unattempted_count INTEGER NOT NULL,
        scanned_answers_json TEXT NOT NULL,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
    )
    """)

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
            ("100001", "Aarav Sharma", "Class 10", "A"),
            ("100002", "Priya Patel", "Class 10", "A"),
            ("100003", "Rohan Verma", "Class 10", "B"),
            ("100004", "Ananya Singh", "Class 12", "A"),
            ("100005", "Kabir Gupta", "Class 12", "A"),
            ("100006", "Sanya Kumar", "Class 12", "B"),
        ]
        cursor.executemany(
            "INSERT INTO students (roll_no, name, class_name, section) VALUES (?, ?, ?, ?)",
            sample_students
        )

    # Seed Sample Exam if empty
    cursor.execute("SELECT COUNT(*) as count FROM exams")
    if cursor.fetchone()["count"] == 0:
        cursor.execute(
            "INSERT INTO exams (exam_name, subject, total_questions, date, marks_per_correct, negative_marks) VALUES (?, ?, ?, ?, ?, ?)",
            ("Grand Science Assessment 2026", "Physics & Chemistry", 30, "2026-07-29", 4.0, 1.0)
        )
        exam_id = cursor.lastrowid

        # Sample Answer key (30 questions alternating A, B, C, D)
        options = ["A", "B", "C", "D"]
        sample_key = [(exam_id, q, options[(q - 1) % 4]) for q in range(1, 31)]
        cursor.executemany(
            "INSERT INTO answer_keys (exam_id, question_no, correct_option) VALUES (?, ?, ?)",
            sample_key
        )

        # Sample Result
        sample_ans = {str(q): options[(q - 1) % 4] if q % 5 != 0 else options[q % 4] for q in range(1, 31)}
        cursor.execute(
            """INSERT INTO omr_results
            (exam_id, student_id, roll_no, student_name, obtained_marks, total_marks, percentage, correct_count, wrong_count, unattempted_count, scanned_answers_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (exam_id, 1, "100001", "Aarav Sharma", 96.0, 120.0, 80.0, 24, 6, 0, json.dumps(sample_ans))
        )

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully!")
