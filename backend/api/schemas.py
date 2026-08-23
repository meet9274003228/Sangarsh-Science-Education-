from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Optional, Dict
from datetime import datetime

# Question Coordinate Config Schema (used inside Template)
class BubbleCoordinate(BaseModel):
    option: str  # e.g., "A"
    x: int
    y: int
    r: int = 10
    width: Optional[int] = 20
    height: Optional[int] = 20
    normalized_x: Optional[float] = None
    normalized_y: Optional[float] = None
    normalized_width: Optional[float] = None
    normalized_height: Optional[float] = None

class QuestionLayout(BaseModel):
    question_no: int
    bubbles: List[BubbleCoordinate]

class AlignmentMarker(BaseModel):
    marker_id: int
    x: int
    y: int

class RollNumberConfig(BaseModel):
    x: int
    y: int
    columns: int
    rows: int
    step_x: int
    step_y: int
    radius: int

# --- Template Schemas ---
class TemplateBase(BaseModel):
    name: str
    questions_count: int = 30
    options_count: int = 4
    sheet_width: int = 800
    sheet_height: int = 1100
    
    # Custom detection thresholds
    fill_threshold_high: float = 0.25
    fill_threshold_low: float = 0.10
    margin_threshold: float = 0.15

    @validator("questions_count")
    def validate_questions_count(cls, v):
        if v < 1:
            raise ValueError("Number of questions must be at least 1")
        return v

    @validator("options_count")
    def validate_options_count(cls, v):
        if v < 1:
            raise ValueError("Number of options must be at least 1")
        return v

class TemplateCreate(TemplateBase):
    bubble_layout: Optional[List[QuestionLayout]] = None
    roll_number_config: Optional[RollNumberConfig] = None
    alignment_markers: Optional[List[AlignmentMarker]] = None
    question_regions: Optional[List[Dict]] = None
    student_id_region: Optional[Dict] = None

    @root_validator(pre=False)
    def validate_bubble_overlaps(cls, values):
        bubble_layout = values.get("bubble_layout")
        if not bubble_layout:
            return values
        
        all_bubbles = []
        for q in bubble_layout:
            for b in q.bubbles:
                all_bubbles.append({
                    "q_no": q.question_no,
                    "x": b.x,
                    "y": b.y,
                    "val": b.option,
                    "r": b.r
                })
        
        # Check all pairs for overlap
        for i in range(len(all_bubbles)):
            for j in range(i + 1, len(all_bubbles)):
                b1 = all_bubbles[i]
                b2 = all_bubbles[j]
                
                if b1["q_no"] != b2["q_no"] or b1["val"] != b2["val"]:
                    # Distance check between centers
                    dist = ((b1["x"] - b2["x"]) ** 2 + (b1["y"] - b2["y"]) ** 2) ** 0.5
                    min_dist = b1["r"] + b2["r"]
                    if dist < min_dist - 2:  # allow 2px tolerance for layout grids
                        raise ValueError(
                            f"Overlapping bubble regions detected: Q{b1['q_no']} option {b1['val']} "
                            f"and Q{b2['q_no']} option {b2['val']} are too close."
                        )
        return values

class TemplateResponse(TemplateBase):
    id: int
    created_at: datetime
    bubble_layout_json: Optional[str] = None
    roll_number_config_json: Optional[str] = None
    alignment_markers_json: Optional[str] = None
    question_regions_json: Optional[str] = None
    student_id_region_json: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

# --- Exam Schemas ---
class ExamBase(BaseModel):
    name: str
    exam_type: str = "NEET"  # NEET, JEE, Board, GUJCET, Custom
    subject: str
    date: Optional[str] = None
    template_id: int
    marks_per_correct: float = 4.0
    negative_marks: float = 1.0
    blank_marks: float = 0.0

    @validator("marks_per_correct")
    def validate_positive_marks(cls, v):
        if v <= 0.0:
            raise ValueError("Marks per correct question must be greater than zero")
        return v

    @validator("negative_marks")
    def validate_negative_marks(cls, v):
        if v < 0.0:
            raise ValueError("Negative marking value cannot be negative (specify as absolute deduction value)")
        return v

from typing import List, Optional, Dict, Union

class ExamCreate(ExamBase):
    answer_key: Optional[Dict[str, Union[str, List[str]]]] = None  # e.g., {"1": "A", "2": ["B", "C"]}

class ExamResponse(ExamBase):
    id: int
    answer_key_json: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class ExamUpdateKey(BaseModel):
    answer_key: Dict[str, Union[str, List[str]]]

# --- Question Result Schemas ---
class QuestionResultResponse(BaseModel):
    question_no: int
    selected_option: Optional[str]
    correct_option: Optional[str]
    status: str  # CORRECT, WRONG, BLANK, MULTIPLE_MARKED, UNCERTAIN
    options_intensity_json: Optional[str] = None
    bounding_box_json: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

# --- Scan Result Schemas ---
class ScanResultResponse(BaseModel):
    obtained_marks: float
    total_marks: float
    percentage: float
    correct_count: int
    wrong_count: int
    blank_count: int
    multiple_marked_count: int
    uncertain_count: int
    question_results: List[QuestionResultResponse]

    class Config:
        orm_mode = True
        from_attributes = True

# --- Scan Schemas ---
class ScanResponse(BaseModel):
    id: int
    exam_id: int
    student_roll_no: Optional[str] = None
    student_name: Optional[str] = None
    scan_status: str
    upload_time: datetime
    original_image_path: str
    processed_image_path: Optional[str] = None
    confidence_score: float

    class Config:
        orm_mode = True
        from_attributes = True

class CorrectionRequest(BaseModel):
    question_no: int
    corrected_option: str

class AuditLogResponse(BaseModel):
    id: int
    scan_id: int
    question_no: int
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    corrected_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class ScanDetailResponse(ScanResponse):
    result: Optional[ScanResultResponse] = None
    audit_logs: Optional[List[AuditLogResponse]] = []

    class Config:
        orm_mode = True
        from_attributes = True
