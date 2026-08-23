import cv2
import numpy as np
from typing import List, Tuple

def warp_perspective_sheet(
    original_image: np.ndarray,
    detected_markers: List[Tuple[int, int]],
    scale_factor: float,
    target_width: int = 800,
    target_height: int = 1100
) -> np.ndarray:
    """
    Applies perspective transformation to rectify the OMR sheet to top-down view.
    
    Args:
        original_image: Raw high-resolution BGR input image
        detected_markers: Coordinates of the 4 markers found on the resized preprocessed image
        scale_factor: The ratio used to downscale original_image coordinates to preprocessed image coordinates
        target_width: Warped reference sheet width (from template)
        target_height: Warped reference sheet height (from template)
        
    Returns:
        warped_image: A 3-channel warped BGR image of size (target_height, target_width)
    """
    # 1. Scale coordinates back to original high-res scale
    src_points = []
    for mx, my in detected_markers:
        orig_x = int(round(mx / scale_factor))
        orig_y = int(round(my / scale_factor))
        src_points.append([orig_x, orig_y])
        
    src_pts = np.array(src_points, dtype=np.float32)
    
    # 2. Map destinations: corresponding corners on the target geometry
    # Destination sequence: top-left, top-right, bottom-right, bottom-left
    dst_pts = np.array([
        [0, 0],
        [target_width - 1, 0],
        [target_width - 1, target_height - 1],
        [0, target_height - 1]
    ], dtype=np.float32)
    
    # 3. Compute homography and warp perspective
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(original_image, M, (target_width, target_height))
    
    return warped
