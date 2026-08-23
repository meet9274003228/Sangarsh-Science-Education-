import cv2
import numpy as np
from typing import Dict, List, Tuple, Any

def evaluate_bubble_fill(
    roi: np.ndarray,
    fill_threshold_high: float = 0.25,
    fill_threshold_low: float = 0.10
) -> Dict[str, Any]:
    """
    Evaluates the darkness fill-ratio of a single option bubble ROI.
    By targeting the inner central kernel, we exclude the printed circular border.
    Uses dynamic thresholding relative to local paper brightness.
    
    Args:
        roi: Grayscale or BGR sub-image for the single bubble
        fill_threshold_high: Configurable upper threshold for solid filled bubble
        fill_threshold_low: Configurable lower threshold for blank bubble
        
    Returns:
        A dictionary containing:
        - fill_ratio: The ratio of pixels marked dark (0.0 to 1.0)
        - raw_mean: Average brightness of the inner region
        - local_white: Estimated local white paper intensity
        - threshold_val: Calculated absolute grayscale threshold value used
    """
    if roi is None or roi.size == 0:
        return {
            "fill_ratio": 0.0,
            "raw_mean": 255.0,
            "local_white": 255.0,
            "threshold_val": 200.0
        }
        
    # 1. Convert to grayscale if BGR
    if len(roi.shape) == 3:
        roi_gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    else:
        roi_gray = roi.copy()
        
    # 2. Extract the sliding core window (dynamic centering to ignore shift offsets and outline borders)
    h, w = roi_gray.shape
    margin_y = max(1, int(h * 0.125))
    margin_x = max(1, int(w * 0.125))
    
    core_h = int(h * 0.55)
    core_w = int(w * 0.55)
    
    best_y = int(h * 0.225)
    best_x = int(w * 0.225)
    
    min_mean = 256.0
    start_y = margin_y
    end_y = max(start_y + 1, h - core_h - margin_y)
    start_x = margin_x
    end_x = max(start_x + 1, w - core_w - margin_x)
    
    for cy in range(start_y, end_y):
        for cx in range(start_x, end_x):
            sub_win = roi_gray[cy : cy + core_h, cx : cx + core_w]
            if sub_win.size > 0:
                win_mean = float(np.mean(sub_win))
                if win_mean < min_mean:
                    min_mean = win_mean
                    best_y = cy
                    best_x = cx
                    
    core = roi_gray[best_y : best_y + core_h, best_x : best_x + core_w]
    
    if core.size == 0:
        return {
            "fill_ratio": 0.0,
            "raw_mean": 255.0,
            "local_white": 255.0,
            "threshold_val": 200.0
        }
        
    # 3. Dynamic Thresholding relative to local paper brightness (98th percentile)
    # This filters scanning shadows and handles varying exposures or card colors.
    local_white = float(np.percentile(roi_gray, 98))
    local_white = max(local_white, 120.0) # Clamp minimum sanity check
    
    # Threshold offset: pixels 45 grayscale values darker than local paper are counted
    offset = 45.0
    threshold_val = local_white - offset
    
    # Evaluate dark pixels
    dark_pixels = np.sum(core < threshold_val)
    fill_ratio = float(dark_pixels) / core.size
    
    return {
        "fill_ratio": round(fill_ratio, 3),
        "raw_mean": round(float(np.mean(core)), 2),
        "local_white": round(local_white, 2),
        "threshold_val": round(threshold_val, 2)
    }

def evaluate_question_choices(
    option_bubbles: Dict[str, float],
    fill_threshold_high: float = 0.25,
    fill_threshold_low: float = 0.10,
    margin_threshold: float = 0.15
) -> Dict[str, Any]:
    """
    Aggregates fill ratios for a single question's options to classify the marked answer,
    incorporating dual thresholds, margin rules, and uncertainty handling.
    
    Args:
        option_bubbles: Map of {"A": 0.08, "B": 0.76, ...} option names to fill ratios
        fill_threshold_high: Threshold for a solid filled bubble
        fill_threshold_low: Lower threshold below which a bubble is blank
        margin_threshold: Required margin between the highest and second-highest options
        
    Returns:
        A dictionary containing:
        - status: "SINGLE_MARKED", "BLANK", "MULTIPLE_MARKED", or "UNCERTAIN"
        - selected_option: option name (e.g. "B"), "MULTIPLE", or ""
        - highest_fill_ratio: highest fill ratio
        - second_highest_fill_ratio: second highest fill ratio
        - difference: difference between highest and second highest
        - confidence: confidence coefficient (0.0 to 1.0)
    """
    if not option_bubbles:
        return {
            "status": "BLANK",
            "selected_option": "",
            "highest_fill_ratio": 0.0,
            "second_highest_fill_ratio": 0.0,
            "difference": 0.0,
            "confidence": 1.0
        }
        
    # Sort option details descending by fill ratio value
    sorted_opts = sorted(option_bubbles.items(), key=lambda item: item[1], reverse=True)
    highest_opt, highest_val = sorted_opts[0]
    second_opt, second_val = sorted_opts[1] if len(sorted_opts) > 1 else ("", 0.0)
    
    difference = round(highest_val - second_val, 3)
    
    # 1. BLANK CASE
    # If even the highest fill doesn't cross the lower threshold
    if highest_val < fill_threshold_low:
        # Confidence is high if highest is far below lower threshold
        confidence = float(np.clip(1.0 - (highest_val / fill_threshold_low), 0.0, 1.0))
        return {
            "status": "BLANK",
            "selected_option": "",
            "highest_fill_ratio": highest_val,
            "second_highest_fill_ratio": second_val,
            "difference": difference,
            "confidence": round(confidence, 3)
        }
        
    # 2. MULTIPLE MARKED CASE
    # More than one option crosses the high fill threshold
    filled_count = sum(1 for opt, val in option_bubbles.items() if val >= fill_threshold_high)
    if filled_count >= 2:
        # We classify as MULTIPLE_MARKED
        # Confidence metrics reflects confidence of multiple marks
        confidence = float(np.clip(second_val / highest_val if highest_val > 0 else 0.0, 0.0, 1.0))
        return {
            "status": "MULTIPLE_MARKED",
            "selected_option": "MULTIPLE",
            "highest_fill_ratio": highest_val,
            "second_highest_fill_ratio": second_val,
            "difference": difference,
            "confidence": round(confidence, 3)
        }
        
    # 3. UNCERTAIN CASE
    # Checks for lightly marked pencils, eraser residues, or scanning noises
    # Gray zone check (light mark) or difference is below margin threshold
    is_gray_zone = (fill_threshold_low <= highest_val < fill_threshold_high)
    is_low_margin = (difference < margin_threshold)
    
    if is_gray_zone or is_low_margin:
        # Low confidence cases
        confidence = float(np.clip(difference / margin_threshold if margin_threshold > 0 else 0.0, 0.0, 1.0))
        # Reduce confidence further if in gray zone
        if is_gray_zone:
            confidence *= 0.5
            
        return {
            "status": "UNCERTAIN",
            "selected_option": highest_opt, # Still propose highest option
            "highest_fill_ratio": highest_val,
            "second_highest_fill_ratio": second_val,
            "difference": difference,
            "confidence": round(confidence, 3)
        }
        
    # 4. SINGLE MARKED CASE (Confident Fill)
    # Difference is high enough, and highest is above high threshold
    confidence = float(np.clip(1.0 - (second_val / highest_val) if highest_val > 0.0 else 1.0, 0.0, 1.0))
    return {
        "status": "SINGLE_MARKED",
        "selected_option": highest_opt,
        "highest_fill_ratio": highest_val,
        "second_highest_fill_ratio": second_val,
        "difference": difference,
        "confidence": round(confidence, 3)
    }
