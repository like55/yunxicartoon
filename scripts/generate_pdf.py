import base64
import io
import json
import os
import re
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
FONT = 'STSong-Light'
PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
ACCENT = colors.HexColor('#6D6AF8')
TEXT = colors.HexColor('#1D2433')
MUTED = colors.HexColor('#667085')
PANEL = colors.HexColor('#F5F7FF')
BORDER = colors.HexColor('#E6EAF5')


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: generate_pdf.py input.json output.pdf')

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, 'r', encoding='utf-8') as f:
        book = json.load(f)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    c = canvas.Canvas(output_path, pagesize=A4)
    c.setTitle(book.get('meta', {}).get('title', '绘本导出'))

    draw_cover(c, book)
    c.showPage()

    for idx, page in enumerate(book.get('pages', []), start=1):
        draw_story_page(c, book, page, idx)
        c.showPage()

    c.save()
    print(output_path)


def draw_cover(c, book):
    meta = book.get('meta', {})
    c.setFillColor(colors.white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.setFillColor(ACCENT)
    c.roundRect(MARGIN, PAGE_H - 55 * mm, 58 * mm, 14 * mm, 6 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont(FONT, 12)
    c.drawString(MARGIN + 6 * mm, PAGE_H - 46 * mm, '云溪绘本工具导出')

    title = meta.get('title', '未命名绘本')
    draw_wrapped_text(c, title, MARGIN, PAGE_H - 70 * mm, PAGE_W - 2 * MARGIN - 78 * mm, 3, 11 * mm, font_size=26, color=TEXT)

    summary = book.get('summary', '')
    draw_wrapped_text(c, summary, MARGIN, PAGE_H - 100 * mm, PAGE_W - 2 * MARGIN - 78 * mm, 9, 7 * mm, font_size=11, color=MUTED)

    info_x = MARGIN
    info_y = PAGE_H - 148 * mm
    info = [
        f"主角：{meta.get('hero', '')}",
        f"目标：{meta.get('goal', '')}",
        f"场景：{meta.get('setting', '')}",
        f"风格：{meta.get('style', '')}",
        f"配色：{meta.get('palette', '')}",
        f"适龄：{meta.get('ageGroup', '')}",
    ]
    for i, line in enumerate(info):
        c.setFillColor(PANEL)
        c.roundRect(info_x, info_y - i * 11 * mm, PAGE_W - 2 * MARGIN - 78 * mm, 8.5 * mm, 3 * mm, fill=1, stroke=0)
        c.setFillColor(TEXT)
        c.setFont(FONT, 11)
        c.drawString(info_x + 4 * mm, info_y + 2.7 * mm - i * 11 * mm, line)

    image_x = PAGE_W - MARGIN - 70 * mm
    image_y = PAGE_H - 130 * mm
    draw_image_panel(c, book.get('coverImageDataUrl', ''), image_x, image_y, 70 * mm, 92 * mm, placeholder='封面插图')

    footer_y = 30 * mm
    c.setFillColor(PANEL)
    c.roundRect(MARGIN, footer_y, PAGE_W - 2 * MARGIN, 26 * mm, 5 * mm, fill=1, stroke=0)
    c.setFillColor(TEXT)
    c.setFont(FONT, 12)
    c.drawString(MARGIN + 5 * mm, footer_y + 18 * mm, f"主题：{book.get('theme', '')}")
    draw_wrapped_text(c, f"成长点：{book.get('lesson', '')}", MARGIN + 5 * mm, footer_y + 11 * mm, PAGE_W - 2 * MARGIN - 10 * mm, 2, 6.3 * mm, font_size=10, color=MUTED)


def draw_story_page(c, book, page, idx):
    meta = book.get('meta', {})
    c.setFillColor(colors.white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    c.setFillColor(PANEL)
    c.roundRect(MARGIN, PAGE_H - 28 * mm, PAGE_W - 2 * MARGIN, 14 * mm, 5 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.setFont(FONT, 11)
    c.drawString(MARGIN + 5 * mm, PAGE_H - 20.5 * mm, f"第 {idx} 页")
    c.setFillColor(TEXT)
    c.setFont(FONT, 16)
    c.drawString(MARGIN + 30 * mm, PAGE_H - 20.8 * mm, sanitize(page.get('title', f'第 {idx} 页')))

    draw_image_panel(c, page.get('imageDataUrl', ''), MARGIN, PAGE_H - 175 * mm, PAGE_W - 2 * MARGIN, 92 * mm, placeholder='本页暂未生成插图')

    box_y = 24 * mm
    box_h = 112 * mm
    left_w = 92 * mm
    gap = 8 * mm

    c.setFillColor(colors.white)
    c.setStrokeColor(BORDER)
    c.roundRect(MARGIN, box_y, left_w, box_h, 5 * mm, fill=1, stroke=1)
    c.roundRect(MARGIN + left_w + gap, box_y, PAGE_W - 2 * MARGIN - left_w - gap, box_h, 5 * mm, fill=1, stroke=1)

    c.setFillColor(ACCENT)
    c.setFont(FONT, 11)
    c.drawString(MARGIN + 5 * mm, box_y + box_h - 10 * mm, '页面文案')
    draw_wrapped_text(c, page.get('text', ''), MARGIN + 5 * mm, box_y + box_h - 18 * mm, left_w - 10 * mm, 12, 6.5 * mm, font_size=11, color=TEXT)

    right_x = MARGIN + left_w + gap
    c.setFillColor(ACCENT)
    c.setFont(FONT, 11)
    c.drawString(right_x + 5 * mm, box_y + box_h - 10 * mm, '配图提示词')
    draw_wrapped_text(c, page.get('prompt', ''), right_x + 5 * mm, box_y + box_h - 18 * mm, PAGE_W - 2 * MARGIN - left_w - gap - 10 * mm, 10, 5.8 * mm, font_size=9.5, color=MUTED)

    meta_y = box_y + 10 * mm
    c.setFillColor(TEXT)
    c.setFont(FONT, 10)
    c.drawString(right_x + 5 * mm, meta_y + 18 * mm, f"镜头：{sanitize(page.get('shot', ''))}")
    c.drawString(right_x + 5 * mm, meta_y + 10 * mm, f"情绪：{sanitize(page.get('emotion', ''))}")
    c.drawRightString(PAGE_W - MARGIN, 12 * mm, f"{meta.get('title', '绘本')} · 第 {idx}/{len(book.get('pages', []))} 页")


def draw_image_panel(c, data_url, x, y, w, h, placeholder='插图预留区'):
    c.setFillColor(PANEL)
    c.setStrokeColor(BORDER)
    c.roundRect(x, y, w, h, 6 * mm, fill=1, stroke=1)
    image = data_url_to_reader(data_url)
    if image:
        iw, ih = image.getSize()
        scale = min((w - 8 * mm) / iw, (h - 8 * mm) / ih)
        draw_w = iw * scale
        draw_h = ih * scale
        dx = x + (w - draw_w) / 2
        dy = y + (h - draw_h) / 2
        c.drawImage(image, dx, dy, draw_w, draw_h, preserveAspectRatio=True, mask='auto')
    else:
        c.setFillColor(MUTED)
        c.setFont(FONT, 12)
        c.drawCentredString(x + w / 2, y + h / 2, placeholder)


def data_url_to_reader(data_url):
    if not data_url or not isinstance(data_url, str) or ',' not in data_url:
        return None
    try:
        encoded = data_url.split(',', 1)[1]
        raw = base64.b64decode(encoded)
        return ImageReader(io.BytesIO(raw))
    except Exception:
        return None


def draw_wrapped_text(c, text, x, y, max_width, max_lines, line_height, font_size=11, color=TEXT):
    text = sanitize(text)
    c.setFont(FONT, font_size)
    c.setFillColor(color)
    lines = wrap_text(c, text, max_width, font_size)
    for line in lines[:max_lines]:
        c.drawString(x, y, line)
        y -= line_height
    if len(lines) > max_lines and max_lines > 0:
        ellipsis_y = y + line_height
        cropped = lines[max_lines - 1]
        if len(cropped) > 2:
            cropped = cropped[:-2] + '…'
        c.drawString(x, ellipsis_y, cropped)


def wrap_text(c, text, max_width, font_size):
    if not text:
        return ['']
    paragraphs = re.split(r'\n+', text)
    lines = []
    for paragraph in paragraphs:
        current = ''
        for char in paragraph:
            candidate = current + char
            if c.stringWidth(candidate, FONT, font_size) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = char
        if current:
            lines.append(current)
        if not paragraph:
            lines.append('')
    return lines or ['']


def sanitize(value):
    return str(value or '').replace('\u2011', '-').replace('\u2013', '-').replace('\u2014', '-')


if __name__ == '__main__':
    main()
