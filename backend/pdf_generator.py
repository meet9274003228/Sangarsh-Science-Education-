"""
PDF Generator for Sangarsh Science Education OMR Sheets.
Generates compliant, crisp A4 PDF documents with 4 corner alignment markers,
6-digit Roll Number grid, and multi-column A/B/C/D question bubbles.
"""

import io

def create_omr_pdf(exam_name: str, subject: str, total_questions: int, date_str: str, marks_per_correct: float = 4.0, negative_marks: float = 1.0) -> bytes:
    # A4 dimensions in points: 595.28 x 841.89
    width, height = 595.28, 841.89

    # Stream buffers
    pdf_stream = io.BytesIO()

    # Build PDF graphics commands stream
    stream_cmds = []

    def set_color(r, g, b):
        stream_cmds.append(f"{r:.3f} {g:.3f} {b:.3f} rg {r:.3f} {g:.3f} {b:.3f} RG")

    def draw_rect(x, y, w, h, fill=False, stroke=True):
        cmd = f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re"
        if fill and stroke:
            cmd += " B"
        elif fill:
            cmd += " f"
        else:
            cmd += " S"
        stream_cmds.append(cmd)

    def draw_circle(cx, cy, r, fill=False):
        # Approximate circle using cubic beziers
        k = 0.552284749831 * r
        x0, y0 = cx - r, cy
        x1, y1 = cx, cy + r
        x2, y2 = cx + r, cy
        x3, y3 = cx, cy - r
        cmds = [
            f"{x0:.2f} {y0:.2f} m",
            f"{x0:.2f} {y0 + k:.2f} {x1 - k:.2f} {y1:.2f} {x1:.2f} {y1:.2f} c",
            f"{x1 + k:.2f} {y1:.2f} {x2:.2f} {y2 + k:.2f} {x2:.2f} {y2:.2f} c",
            f"{x2:.2f} {y2 - k:.2f} {x3 + k:.2f} {y3:.2f} {x3:.2f} {y3:.2f} c",
            f"{x3 - k:.2f} {y3:.2f} {x0:.2f} {y0 - k:.2f} {x0:.2f} {y0:.2f} c",
            "f" if fill else "S"
        ]
        stream_cmds.append(" ".join(cmds))

    def draw_text(text, x, y, font="F1", size=10, bold=False):
        # Escape parenthesis
        safe_text = text.replace("(", "\\(").replace(")", "\\)")
        stream_cmds.append(f"BT /{font} {size} Tf {x:.2f} {y:.2f} Td ({safe_text}) Tj ET")

    # Set stroke width
    stream_cmds.append("0.75 w")

    # 1. CORNER ALIGNMENT MARKERS (Solid Black Squares 22x22 pt)
    set_color(0, 0, 0)
    marker_size = 22.0
    # Top-Left, Top-Right, Bottom-Left, Bottom-Right
    draw_rect(30, height - 30 - marker_size, marker_size, marker_size, fill=True)
    draw_rect(width - 30 - marker_size, height - 30 - marker_size, marker_size, marker_size, fill=True)
    draw_rect(30, 30, marker_size, marker_size, fill=True)
    draw_rect(width - 30 - marker_size, 30, marker_size, marker_size, fill=True)

    # 2. BRANDING & HEADER SECTION
    set_color(0.08, 0.18, 0.36) # SSE Deep Navy Blue
    draw_rect(65, height - 70, width - 130, 42, fill=True)

    set_color(1.0, 1.0, 1.0)
    draw_text("SANGARSH SCIENCE EDUCATION", 145, height - 52, font="F2", size=16)
    draw_text("PREMIUM OMR EVALUATION SYSTEM", 185, height - 64, font="F1", size=8)

    # Exam Info Box
    set_color(0, 0, 0)
    draw_rect(65, height - 125, width - 130, 45, fill=False)

    set_color(0.1, 0.1, 0.1)
    draw_text(f"EXAM: {exam_name.upper()}", 75, height - 95, font="F2", size=10)
    draw_text(f"SUBJECT: {subject}", 75, height - 112, font="F1", size=9)
    draw_text(f"DATE: {date_str}", 360, height - 95, font="F1", size=9)
    draw_text(f"TOTAL QUESTIONS: {total_questions}  (+{marks_per_correct} / -{negative_marks})", 360, height - 112, font="F1", size=9)

    # Candidate Info Fields
    draw_rect(65, height - 195, 220, 60, fill=False)
    draw_text("STUDENT NAME:", 72, height - 148, font="F2", size=8)
    draw_text("CLASS & SEC:", 72, height - 172, font="F2", size=8)
    draw_text("INVIGILATOR SIG:", 72, height - 190, font="F2", size=8)

    # 3. ROLL NUMBER BUBBLE GRID (6 Digits: D1 - D6, Digits 0-9)
    roll_box_x = 305
    roll_box_y = height - 195
    roll_box_w = 225
    roll_box_h = 60

    draw_rect(roll_box_x, roll_box_y, roll_box_w, roll_box_h, fill=False)
    draw_text("ROLL NUMBER (6 DIGITS)", roll_box_x + 45, roll_box_y + roll_box_h - 12, font="F2", size=8)

    # Draw 6 digit boxes and bubble matrix below
    col_w = 34
    row_h = 13
    grid_start_x = roll_box_x + 10
    grid_start_y = roll_box_y + 32

    # Draw boxes for written digits
    for col in range(6):
        bx = grid_start_x + col * col_w
        draw_rect(bx, grid_start_y, 24, 13, fill=False)
        draw_text(f"D{col+1}", bx + 6, grid_start_y + 3, font="F1", size=7)

    # Draw bubbles 0-9 under roll number box
    roll_grid_y = roll_box_y - 145
    draw_rect(roll_box_x, roll_grid_y, roll_box_w, 140, fill=False)
    draw_text("SHADE CORRESPONDING BUBBLES BELOW", roll_box_x + 15, roll_grid_y + 128, font="F2", size=7.5)

    for row in range(10): # 0 to 9
        ry = roll_grid_y + 112 - row * 11.5
        set_color(0.3, 0.3, 0.3)
        draw_text(str(row), roll_box_x + 8, ry - 3, font="F2", size=7)

        for col in range(6):
            cx = grid_start_x + col * col_w + 12
            cy = ry
            set_color(0.2, 0.2, 0.2)
            draw_circle(cx, cy, 4.5, fill=False)
            set_color(0.4, 0.4, 0.4)
            draw_text(str(row), cx - 1.8, cy - 2.2, font="F1", size=5.5)

    # Divider line
    set_color(0.6, 0.6, 0.6)
    stream_cmds.append(f"65.00 {height - 210:.2f} m {width - 65:.2f} {height - 210:.2f} l S")

    # 4. QUESTION BUBBLE GRID (Up to 100 questions in 3 clean columns)
    cols = 3
    q_per_col = (total_questions + cols - 1) // cols
    col_width = 155
    col_gap = 12
    start_x = 65
    start_y = height - 230

    options = ["A", "B", "C", "D"]

    for col in range(cols):
        col_x = start_x + col * (col_width + col_gap)
        col_q_start = col * q_per_col + 1
        col_q_end = min((col + 1) * q_per_col, total_questions)

        if col_q_start > total_questions:
            break

        # Header for column
        set_color(0.92, 0.94, 0.98)
        draw_rect(col_x, start_y - 15, col_width, 15, fill=True)
        set_color(0.1, 0.2, 0.4)
        draw_text("Q.No", col_x + 5, start_y - 11, font="F2", size=8)
        for idx, opt in enumerate(options):
            draw_text(opt, col_x + 35 + idx * 28 + 8, start_y - 11, font="F2", size=8)

        # Question rows
        for q_idx in range(col_q_start, col_q_end + 1):
            row_in_col = q_idx - col_q_start
            qy = start_y - 32 - row_in_col * 16.5

            # Alternate background shading for readability
            if row_in_col % 2 == 1:
                set_color(0.97, 0.97, 0.99)
                draw_rect(col_x, qy - 4, col_width, 15, fill=True)

            set_color(0.1, 0.1, 0.1)
            # Question number
            q_str = f"{q_idx:02d}."
            draw_text(q_str, col_x + 5, qy, font="F2", size=8)

            # Option bubbles A, B, C, D
            for idx, opt in enumerate(options):
                bx = col_x + 35 + idx * 28 + 12
                by = qy + 2.5
                set_color(0.2, 0.2, 0.2)
                draw_circle(bx, by, 5.2, fill=False)
                set_color(0.35, 0.35, 0.35)
                draw_text(opt, bx - 2.2, by - 2.5, font="F1", size=6)

    # 5. FOOTER & INSTRUCTIONS
    set_color(0.1, 0.1, 0.1)
    draw_rect(65, 55, width - 130, 40, fill=False)
    draw_text("INSTRUCTIONS FOR SHADING BUBBLES:", 72, 82, font="F2", size=7.5)
    draw_text("1. Use dark HB pencil or Blue/Black ballpoint pen only.", 72, 72, font="F1", size=7)
    draw_text("2. Darken the circle completely inside the frame. Do not make stray marks.", 72, 62, font="F1", size=7)

    draw_text("Sangarsh Science Education OMR System v2.0 - Certified Standard Format", 170, 38, font="F1", size=7)

    # Assemble Stream Content
    content = "\n".join(stream_cmds).encode('utf-8')

    # PDF Object Builder
    objects = []

    def add_object(obj_str):
        objects.append(obj_str.encode('utf-8'))
        return len(objects)

    # Obj 1: Catalog
    add_object("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")
    # Obj 2: Pages
    add_object("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj")
    # Obj 3: Page
    add_object(f"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width:.2f} {height:.2f}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj")
    # Obj 4: Contents
    add_object(f"4 0 obj\n<< /Length {len(content)} >>\nstream\n" + content.decode('utf-8') + "\nendstream\nendobj")
    # Obj 5: Font Helvetica
    add_object("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj")
    # Obj 6: Font Helvetica-Bold
    add_object("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj")

    # Header
    pdf_stream.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")

    xref_offsets = [0]
    for obj in objects:
        xref_offsets.append(pdf_stream.tell())
        pdf_stream.write(obj)
        pdf_stream.write(b"\n")

    xref_start = pdf_stream.tell()
    pdf_stream.write(f"xref\n0 {len(objects) + 1}\n".encode('utf-8'))
    pdf_stream.write(b"0000000000 65535 f \n")
    for offset in xref_offsets[1:]:
        pdf_stream.write(f"{offset:010d} 00000 n \n".encode('utf-8'))

    pdf_stream.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode('utf-8'))

    return pdf_stream.getvalue()

if __name__ == "__main__":
    pdf_bytes = create_omr_pdf("Grand Science Assessment 2026", "Physics & Chemistry", 30, "2026-07-29")
    with open("sample_omr_sheet.pdf", "wb") as f:
        f.write(pdf_bytes)
    print(f"Generated sample OMR sheet PDF ({len(pdf_bytes)} bytes) successfully!")
