import sys
import math
from types import ModuleType

# =====================================================================
# PURE PYTHON NUMPY AND CV2 MOCK INJECTIONS (FOR OFFLINE SANDBOX QA)
# =====================================================================

# Mock numpy class
class MockNDArray:
    def __init__(self, shape, fill_value=255.0):
        self.shape = shape
        self.size = 1
        for d in shape:
            self.size *= d
        self.flat_values = [float(fill_value)] * self.size

    @property
    def dtype(self):
        return float

    @property
    def ndim(self):
        return len(self.shape)

    def copy(self):
        copied = MockNDArray(self.shape)
        copied.flat_values = list(self.flat_values)
        return copied

    def __getitem__(self, idx):
        # Crop/Slice representation:
        # In classifier.py: core = roi_gray[cy_start:cy_end, cx_start:cx_end]
        if isinstance(idx, tuple) and len(idx) == 2:
            y_slice, x_slice = idx
            # Calculate height and width of the slice
            y_start = y_slice.start if y_slice.start is not None else 0
            y_end = y_slice.stop if y_slice.stop is not None else self.shape[0]
            x_start = x_slice.start if x_slice.start is not None else 0
            x_end = x_slice.stop if x_slice.stop is not None else self.shape[1]
            
            crop_h = max(0, y_end - y_start)
            crop_w = max(0, x_end - x_start)
            
            # Create sub array
            sub_arr = MockNDArray((crop_h, crop_w))
            # Distribute values proportionally
            # Assuming uniform values for testing
            val = self.flat_values[0] if self.flat_values else 255.0
            sub_arr.flat_values = [val] * sub_arr.size
            return sub_arr
        return self

    def __lt__(self, other):
        # np.sum(core < threshold_val)
        res = MockNDArray(self.shape, fill_value=0.0)
        res.flat_values = [1.0 if val < other else 0.0 for val in self.flat_values]
        return res

# Instantiating the numpy mock module
mock_numpy = ModuleType("numpy")
mock_numpy.ndarray = MockNDArray
mock_numpy.uint8 = int
mock_numpy.float32 = float

def np_percentile(arr, q):
    if isinstance(arr, MockNDArray):
        sorted_vals = sorted(arr.flat_values)
        if not sorted_vals:
            return 255.0
        k = (len(sorted_vals) - 1) * (q / 100.0)
        idx = int(round(k))
        return sorted_vals[min(idx, len(sorted_vals) - 1)]
    return 255.0

def np_sum(arr):
    if isinstance(arr, MockNDArray):
        return sum(arr.flat_values)
    return 0.0

def np_mean(arr):
    if isinstance(arr, MockNDArray):
        if not arr.flat_values:
            return 255.0
        return sum(arr.flat_values) / len(arr.flat_values)
    return 255.0

def np_clip(val, low, high):
    return max(low, min(val, high))

mock_numpy.percentile = np_percentile
mock_numpy.sum = np_sum
mock_numpy.mean = np_mean
mock_numpy.clip = np_clip

# Instantiating the cv2 mock module
mock_cv2 = ModuleType("cv2")
def cv2_cvt_color(img, code):
    return img
mock_cv2.cvtColor = cv2_cvt_color
mock_cv2.COLOR_BGR2GRAY = 1

# Register mocks globally before imports run
sys.modules["numpy"] = mock_numpy
sys.modules["cv2"] = mock_cv2

# =====================================================================
# IMPORTING SYSTEM CLASSIFIER MODULE UNDER TEST
# =====================================================================
from omr.detection.classifier import evaluate_bubble_fill, evaluate_question_choices
from omr.evaluation.evaluator import evaluate_scanned_sheet

def run_pure_python_tests():
    print("====================================================")
    print("OMR PURE PYTHON CLASSIFICATION TEST SUITE")
    print("Running with Dependency-Free Grayscale Mock Environments")
    print("====================================================")
    
    passed = True
    
    # -----------------------------------------------------------------
    # 1. Test evaluate_bubble_fill with Mock ROIs
    # -----------------------------------------------------------------
    print("\n--- Testing evaluate_bubble_fill ---")
    
    # Test Case A: Pure Blank white bubble
    roi_blank = MockNDArray((20, 20), fill_value=255)
    res_blank = evaluate_bubble_fill(roi_blank)
    print(f"Blank Bubble ROI: {res_blank}")
    if res_blank["fill_ratio"] != 0.0:
        print("FAIL: Blank bubble fill ratio should be 0.0")
        passed = False
    else:
        print("PASS: Blank bubble handled correctly.")

    # Test Case B: Heavy shade (represented by dark pixels)
    roi_heavy = MockNDArray((20, 20), fill_value=50) # 50 is dark gray
    res_heavy = evaluate_bubble_fill(roi_heavy)
    print(f"Heavy Shade Bubble ROI: {res_heavy}")
    # Local white is clamped to 120. Threshold is 120 - 45 = 75. Core is 50 (<75), so fill ratio is 1.0.
    if res_heavy["fill_ratio"] != 1.0:
        print("FAIL: Heavy shade fill ratio should be 1.0")
        passed = False
    else:
        print("PASS: Heavy shade handled correctly.")

    # Test Case C: Eraser residue smudge (value 190, should not count)
    # Background local paper white is 255. Threshold value is 255 - 45 = 210.
    # If eraser is 230, it is > 210, so fill ratio remains 0.0.
    roi_eraser = MockNDArray((20, 20), fill_value=230)
    res_eraser = evaluate_bubble_fill(roi_eraser)
    print(f"Eraser Smudge Bubble ROI (value 230): {res_eraser}")
    if res_eraser["fill_ratio"] != 0.0:
        print("FAIL: Eraser residue should be classified with 0% fill ratio")
        passed = False
    else:
        print("PASS: Eraser residue rejected correctly.")

    # -----------------------------------------------------------------
    # 2. Test evaluate_question_choices (Status States checking)
    # -----------------------------------------------------------------
    print("\n--- Testing evaluate_question_choices ---")

    # Dual threshold configurations
    th_high = 0.25
    th_low = 0.10
    margin = 0.15

    # State 1: BLANK
    # All choices have fill ratios below low threshold (0.10)
    choices_blank = {"A": 0.04, "B": 0.08, "C": 0.01, "D": 0.02}
    eval_blank = evaluate_question_choices(choices_blank, th_high, th_low, margin)
    print(f"BLANK options: {choices_blank} -> Result: {eval_blank}")
    if eval_blank["status"] != "BLANK" or eval_blank["selected_option"] != "":
        print("FAIL: Should be BLANK with selected_option ''")
        passed = False
    else:
        print("PASS: BLANK state evaluated correctly.")

    # State 2: SINGLE_MARKED (Confident Fill)
    # Option B crosses high threshold (0.25) and difference > margin (0.15)
    choices_single = {"A": 0.02, "B": 0.85, "C": 0.04, "D": 0.03}
    eval_single = evaluate_question_choices(choices_single, th_high, th_low, margin)
    print(f"SINGLE options: {choices_single} -> Result: {eval_single}")
    if eval_single["status"] != "SINGLE_MARKED" or eval_single["selected_option"] != "B":
        print("FAIL: Should be SINGLE_MARKED with answer 'B'")
        passed = False
    else:
        print("PASS: SINGLE_MARKED state evaluated correctly.")

    # State 3: MULTIPLE_MARKED
    # More than one option crosses high threshold
    choices_multiple = {"A": 0.05, "B": 0.80, "C": 0.12, "D": 0.70}
    eval_multiple = evaluate_question_choices(choices_multiple, th_high, th_low, margin)
    print(f"MULTIPLE options (High both): {choices_multiple} -> Result: {eval_multiple}")
    if eval_multiple["status"] != "MULTIPLE_MARKED" or eval_multiple["selected_option"] != "MULTIPLE":
        print("FAIL: Should be MULTIPLE_MARKED")
        passed = False
    else:
        print("PASS: MULTIPLE_MARKED state evaluated correctly (two high fields).")

    # State 4: UNCERTAIN (Gray zone fill - lightly marked pencil)
    # Top choice is between low threshold (0.10) and high threshold (0.25)
    choices_light = {"A": 0.18, "B": 0.02, "C": 0.04, "D": 0.01}
    eval_light = evaluate_question_choices(choices_light, th_high, th_low, margin)
    print(f"UNCERTAIN options (Light choice): {choices_light} -> Result: {eval_light}")
    if eval_light["status"] != "UNCERTAIN" or eval_light["selected_option"] != "A":
        print("FAIL: Should be UNCERTAIN with guess 'A'")
        passed = False
    else:
        print("PASS: UNCERTAIN (gray-zone fill value) evaluated correctly.")

    # State 5: UNCERTAIN (Low margin - eraser residue not fully cleared)
    # Top option A is 0.35, but second option B is 0.23 (diff is 0.12, below margin threshold 0.15)
    choices_residual = {"A": 0.35, "B": 0.23, "C": 0.05, "D": 0.02}
    eval_residual = evaluate_question_choices(choices_residual, th_high, th_low, margin)
    print(f"UNCERTAIN options (Weak margin): {choices_residual} -> Result: {eval_residual}")
    if eval_residual["status"] != "UNCERTAIN" or eval_residual["selected_option"] != "A":
        print("FAIL: Should be UNCERTAIN with proposed answer 'A'")
        passed = False
    else:
        print("PASS: UNCERTAIN (low-margin/eraser smudge) evaluated correctly.")

    # -----------------------------------------------------------------
    # 3. Test evaluate_scanned_sheet (Scoring Correctness and Formulas)
    # -----------------------------------------------------------------
    print("\n--- Testing evaluate_scanned_sheet (Scoring & Multi-Corrects) ---")
    
    mock_answer_key = {
        "1": "A",
        "2": "B,C",  # Union correct answers (B or C is correct)
        "3": "D",
        "4": "A",
        "5": "B"
    }
    
    # 5 Questions total
    # Total max possible: 5 * 4.0 = 20.0 marks
    mock_detected = {
        "1": {"selected_option": "A", "status": "SINGLE_MARKED"},        # CORRECT (+4.0)
        "2": {"selected_option": "B", "status": "SINGLE_MARKED"},        # CORRECT (+4.0) - in union list ["B", "C"]
        "3": {"selected_option": "A", "status": "SINGLE_MARKED"},        # WRONG (-1.0) - expects D
        "4": {"selected_option": "", "status": "BLANK"},                 # BLANK (+0.0)
        "5": {"selected_option": "B", "status": "UNCERTAIN"}             # UNCERTAIN (+0.0) - no penalty
    }
    
    marking_scheme = {
        "marks_per_correct": 4.0,
        "negative_marks": 1.0,
        "blank_marks": 0.0
    }
    
    eval_res = evaluate_scanned_sheet(mock_detected, mock_answer_key, marking_scheme)
    sum_data = eval_res["summary"]
    print(f"Scoring Summary: {sum_data}")
    
    # Expected scores:
    # Q1: Correct -> +4
    # Q2: Correct -> +4
    # Q3: Wrong -> -1
    # Q4: Blank -> 0
    # Q5: Uncertain -> 0
    # Total marks = 7.0
    # Percentage = 7.0 / 20.0 * 100 = 35.0%
    if sum_data["correct"] != 2:
        print(f"FAIL: Expected 2 correct answers, got {sum_data['correct']}")
        passed = False
    elif sum_data["wrong"] != 1:
        print(f"FAIL: Expected 1 wrong answer, got {sum_data['wrong']}")
        passed = False
    elif sum_data["blank"] != 1:
        print(f"FAIL: Expected 1 blank answer, got {sum_data['blank']}")
        passed = False
    elif sum_data["uncertain"] != 1:
        print(f"FAIL: Expected 1 uncertain answer, got {sum_data['uncertain']}")
        passed = False
    elif sum_data["final_score"] != 7.0:
        print(f"FAIL: Expected final score of 7.0, got {sum_data['final_score']}")
        passed = False
    elif sum_data["percentage"] != 35.0:
        print(f"FAIL: Expected percentage of 35.0, got {sum_data['percentage']}")
        passed = False
    else:
        print("PASS: evaluate_scanned_sheet scoring correctness verified successfully.")

    print("\n====================================================")
    if passed:
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("====================================================")
        sys.exit(0)
    else:
        print("TEST FAILURES ENCOUNTERED.")
        print("====================================================")
        sys.exit(1)

if __name__ == "__main__":
    run_pure_python_tests()

if __name__ == "__main__":
    run_pure_python_tests()
