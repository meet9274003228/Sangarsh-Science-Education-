import cv2
import numpy as np
from typing import Dict, List, Any

def extract_bubble_roi(
    warped_image: np.ndarray,
    bubble_config: Dict[str, Any],
    sheet_width: int = 800,
    sheet_height: int = 1100
) -> np.ndarray:
    """
    Extracts the sub-image (Region of Interest) for a single option bubble.
    
    Args:
        warped_image: Top-down warped rectified image of the OMR sheet (BGR or gray)
        bubble_config: Dictionary containing coordinates (normalized or pixel)
        sheet_width: Geometry reference width (default 800)
        sheet_height: Geometry reference height (default 1100)
        
    Returns:
        roi: Cropped sub-image representing the bubble zone
    """
    h_img, w_img = warped_image.shape[:2]
    
    # Locate coordinates using normalized bounds if present, with fallback to pixels
    if "normalized_x" in bubble_config:
        x = int(round(bubble_config["normalized_x"] * w_img))
        y = int(round(bubble_config["normalized_y"] * h_img))
        w = int(round(bubble_config["normalized_width"] * w_img))
        h = int(round(bubble_config["normalized_height"] * h_img))
    else:
        # Fallback to absolute pixel coords (mapped relative to standard 800x1100)
        scale_x = w_img / float(sheet_width) if sheet_width > 0 else 1.0
        scale_y = h_img / float(sheet_height) if sheet_height > 0 else 1.0
        x = int(round(bubble_config["x"] * scale_x))
        y = int(round(bubble_config["y"] * scale_y))
        w = int(round(bubble_config["width"] * scale_x))
        h = int(round(bubble_config["height"] * scale_y))
        
    # Boundary padding & clamping
    y1, y2 = max(0, y), min(h_img, y + h)
    x1, x2 = max(0, x), min(w_img, x + w)
    
    roi = warped_image[y1:y2, x1:x2]
    return roi
