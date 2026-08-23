import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base

class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    questions_count = Column(Integer, default=30)
    options_count = Column(Integer, default=4)  # usually A, B, C, D
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Normalized layout dimensions and custom regions
    sheet_width = Column(Integer, default=800)
    sheet_height = Column(Integer, default=1100)
    question_regions_json = Column(Text, nullable=True)  # [{"region_id": 1, "x": 10, ...}]
    student_id_region_json = Column(Text, nullable=True) # {"x": 500, "y": 80, ...}
    
    # Store bubble coordinate mappings, markers, and roll numbers structure as JSON strings
    bubble_layout_json = Column(Text, nullable=True)     # [{"question_no": 1, "bubbles": [{"val": "A", "x": 100, "y": 150, "r": 12}, ...]}]
    roll_number_config_json = Column(Text, nullable=True) # {"x": 50, "y": 50, "cols": 6, "rows": 10, ...}
    alignment_markers_json = Column(Text, nullable=True)  # [{"marker_id": 1, "x": 20, "y": 20}, ...]
    
    # Threshold rules for answer detection & marking validation (per template)
    fill_threshold_high = Column(Float, default=0.25)
    fill_threshold_low = Column(Float, default=0.10)
    margin_threshold = Column(Float, default=0.15)
    
    # Relationships
    exams = relationship("Exam", back_populates="template")

class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    exam_type = Column(String, default="NEET")  # NEET, JEE, Board, GUJCET, Custom
    subject = Column(String, nullable=False)
    date = Column(String, nullable=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    
    # Marking rules
    marks_per_correct = Column(Float, default=4.0)
    negative_marks = Column(Float, default=1.0)
    blank_marks = Column(Float, default=0.0)
    
    # Answer keys stored as JSON: {"1": "A", "2": "C", ...}
    answer_key_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationships
    template = relationship("Template", back_populates="exams")
    scans = relationship("Scan", back_populates="exam")

class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id"), nullable=False)
    student_roll_no = Column(String, nullable=True)
    student_name = Column(String, nullable=True)
    
    scan_status = Column(String, default="PENDING")  # PENDING, PROCESSING, SUCCEEDED, FAILED
    upload_time = Column(DateTime, default=datetime.datetime.utcnow)
    
    original_image_path = Column(String, nullable=False)
    processed_image_path = Column(String, nullable=True)  # transformed & aligned sheet representation
    confidence_score = Column(Float, default=0.0)
    error_message = Column(String, nullable=True)
    
    # Relationships
    exam = relationship("Exam", back_populates="scans")
    result = relationship("ScanResult", back_populates="scan", uselist=False)
    audit_logs = relationship("AuditLog", back_populates="scan", cascade="all, delete-orphan")

class ScanResult(Base):
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=False)
    obtained_marks = Column(Float, default=0.0)
    total_marks = Column(Float, default=0.0)
    percentage = Column(Float, default=0.0)
    
    correct_count = Column(Integer, default=0)
    wrong_count = Column(Integer, default=0)
    blank_count = Column(Integer, default=0)
    multiple_marked_count = Column(Integer, default=0)
    uncertain_count = Column(Integer, default=0)
    
    # Relationships
    scan = relationship("Scan", back_populates="result")
    question_results = relationship("QuestionResult", back_populates="scan_result", cascade="all, delete-orphan")

class QuestionResult(Base):
    __tablename__ = "question_results"

    id = Column(Integer, primary_key=True, index=True)
    scan_result_id = Column(Integer, ForeignKey("scan_results.id"), nullable=False)
    question_no = Column(Integer, nullable=False)
    
    selected_option = Column(String, nullable=True)      # e.g., "A", or None/""
    correct_option = Column(String, nullable=True)       # e.g., "B"
    
    status = Column(String, nullable=False)              # CORRECT, WRONG, BLANK, MULTIPLE_MARKED, UNCERTAIN
    
    # Intensities of dark bubbles: {"A": 0.05, "B": 0.85, "C": 0.02, "D": 0.04}
    options_intensity_json = Column(Text, nullable=True)
    # Bounding box of bubbles on the image for drawing highlights: {"x": 12, "y": 45, "w": 40, "h": 20}
    bounding_box_json = Column(Text, nullable=True)
    
    # Relationships
    scan_result = relationship("ScanResult", back_populates="question_results")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=False)
    question_no = Column(Integer, nullable=False)
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    corrected_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    scan = relationship("Scan", back_populates="audit_logs")
