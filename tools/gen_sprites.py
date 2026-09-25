#!/usr/bin/env python3
"""生成像素风素材 PNG（星露谷式俯视视角）。用法: python3 gen_sprites.py"""
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(OUT_DIR, exist_ok=True)

# ---- 调色板 ----
OUT   = (58, 35, 19, 255)      # 深棕描边
WOOD_D= (107, 66, 38, 255)
WOOD_M= (143, 90, 43, 255)
WOOD_L= (201, 143, 78, 255)
WOOD_XL=(222, 171, 103, 255)
FLOOR_A=(222, 171, 103, 255)
FLOOR_B=(205, 152, 84, 255)
WALL_A =(240, 220, 184, 255)
WALL_B =(219, 193, 148, 255)
SKIN  = (255, 213, 170, 255)
SKIN_D= (238, 187, 138, 255)
HAIR_B= (90, 55, 32, 255)      # 男生发色
HAIR_G= (214, 108, 49, 255)    # 女生发色
SHIRT_B=(74, 124, 200, 255)    # 男生上衣
SHIRT_G=(224, 86, 110, 255)    # 女生上衣
PANTS = (70, 70, 120, 255)
BLACK = (30, 25, 20, 255)
WHITE = (255, 255, 255, 255)
CREAM = (255, 248, 230, 255)
RED   = (220, 60, 60, 255)
GOLD  = (240, 192, 64, 255)
GREEN = (80, 170, 90, 255)
GREEN_D=(52, 128, 62, 255)

BEADS = [(216,64,64,255),(64,112,216,255),(240,192,64,255),(80,176,80,255),(160,96,208,255),(64,192,192,255)]


def save(img, name):
    img.save(os.path.join(OUT_DIR, name))
    print('made', name, img.size)


def from_matrix(rows, palette):
    h, w = len(rows), len(rows[0])
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in palette:
                px[x, y] = palette[ch]
    return img


# ================= 地板 16x16 =================
def floor_tile():
    img = Image.new('RGBA', (16, 16), FLOOR_A)
    d = ImageDraw.Draw(img)
    for y in (3, 7, 11, 15):                     # 横向木板缝
        d.line([(0, y), (15, y)], fill=FLOOR_B)
    for y0, xs in ((0, (8,)), (4, (4, 12)), (8, (9,)), (12, (5, 13))):  # 竖向拼缝
        for x in xs:
            d.line([(x, y0), (x, y0 + 3)], fill=FLOOR_B)
    return img

# ================= 墙 16x16 =================
def wall_tile():
    img = Image.new('RGBA', (16, 16), WALL_A)
    d = ImageDraw.Draw(img)
    for y in (5, 11):
        d.line([(0, y), (15, y)], fill=WALL_B)
    for x, y0 in ((8, 0), (3, 6), (12, 6), (7, 12)):
        d.line([(x, y0), (x, y0 + 5)], fill=WALL_B)
    d.line([(0, 15), (15, 15)], fill=WOOD_D)     # 踢脚线
    return img

# ================= 小桌 32x32 =================
def corner_cut(d, w, h, c=2):
    for i in range(c):
        d.point([(i, c - 1 - i), (w - 1 - i, c - 1 - i),
                 (i, h - c + i), (w - 1 - i, h - c + i)], fill=(0, 0, 0, 0))

def table_small():
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 31], fill=OUT)
    d.rectangle([2, 2, 29, 29], fill=WOOD_D)
    d.rectangle([4, 4, 27, 27], fill=WOOD_L)
    d.rectangle([4, 4, 27, 7], fill=WOOD_XL)     # 高光
    d.rectangle([4, 24, 27, 27], fill=(182, 124, 66, 255))  # 背光
    for i, (bx, by) in enumerate(((13, 13), (17, 13), (15, 17), (11, 17), (19, 17), (15, 21))):
        c = BEADS[i % len(BEADS)]
        d.rectangle([bx, by, bx + 1, by + 1], fill=c)
    corner_cut(d, 32, 32)
    return img

# ================= 大桌 96x48 =================
def table_big():
    img = Image.new('RGBA', (96, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 95, 47], fill=OUT)
    d.rectangle([2, 2, 93, 45], fill=WOOD_D)
    d.rectangle([4, 4, 91, 43], fill=WOOD_L)
    d.rectangle([4, 4, 91, 8], fill=WOOD_XL)
    d.rectangle([4, 39, 91, 43], fill=(182, 124, 66, 255))
    d.line([(48, 4), (48, 43)], fill=(182, 124, 66, 255))   # 两张桌拼缝
    spots = [(20, 18), (24, 18), (22, 22), (18, 26), (26, 26), (22, 30),
             (60, 20), (64, 20), (62, 24), (58, 28), (66, 28), (62, 32),
             (78, 16), (82, 20), (36, 34), (40, 34)]
    for i, (bx, by) in enumerate(spots):
        c = BEADS[i % len(BEADS)]
        d.rectangle([bx, by, bx + 1, by + 1], fill=c)
    corner_cut(d, 96, 48)
    return img

# ================= 椅子（空） 16x16 =================
CHAIR_N = [  # 桌子北侧的椅子，面朝南(下)，靠背在上
    "................",
    "..OOOOOOOOOOO...",
    "..OWWWWWWWWW....".replace('W', 'D'),
    "..ODDDDDDDDD....".replace('D', 'D'),
]
def chair(facing):
    """facing: 's' 椅背在上(面朝下); 'n' 椅背在下(面朝上)"""
    rows = [
        "................",
        "..OOOOOOOOOOO...",
        "..ODDDDDDDDDDO.."[1:17],
    ]
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if facing == 's':      # 椅背在上方
        back_y, seat_y, leg_y = 1, 6, 12
    else:                  # 椅背在下方
        leg_y, seat_y, back_y = 1, 6, 12
    # 腿
    d.rectangle([3, leg_y, 4, leg_y + 3], fill=WOOD_D)
    d.rectangle([11, leg_y, 12, leg_y + 3], fill=WOOD_D)
    # 座面
    d.rectangle([2, seat_y, 13, seat_y + 5], fill=OUT)
    d.rectangle([3, seat_y + 1, 12, seat_y + 4], fill=WOOD_M)
    d.rectangle([3, seat_y + 1, 12, seat_y + 2], fill=WOOD_L)
    # 靠背
    d.rectangle([2, back_y, 13, back_y + 3], fill=OUT)
    d.rectangle([3, back_y + 1, 12, back_y + 2], fill=WOOD_D)
    return img

# ================= 吧台凳 12x12 =================
def stool():
    img = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([4, 8, 5, 11], fill=WOOD_D)
    d.rectangle([6, 8, 7, 11], fill=WOOD_D)
    d.rectangle([1, 2, 10, 8], fill=OUT)
    d.rectangle([2, 3, 9, 7], fill=WOOD_M)
    d.rectangle([2, 3, 9, 4], fill=WOOD_L)
    return img

# ================= 人物 =================
PERSON_FRONT = [
    ".....OOOOOO.....",
    "....OHHHHHHO....",
    "...OHHHHHHHHO...",
    "..OHHHHHHHHHHO..",
    "..OHSSSSSSSSHO..",
    "..OHSESSSSESHO..",
    "..OHSSSSSSSSHO..",
    "...OSSSSSSSO....",
    ".....OSSO.......".replace('S', 'N'),  # 脖子
    "...OOBBBBBOO....",
    "..OBOBBBBBBOBO..",
    "..OBOBBBBBBOBO..",
    "...OBBBBBBBBO...",
    "...OPPPPPPPPO...",
]
PERSON_BACK = [
    ".....OOOOOO.....",
    "....OHHHHHHO....",
    "...OHHHHHHHHO...",
    "..OHHHHHHHHHHO..",
    "..OHHHHHHHHHHO..",
    "..OHHHHHHHHHHO..",
    "...OHHHHHHHHO...",
    "....OHHHHHHO....",
    "....OBBBBBBO....",
    "..OBBBBBBBBBBO..",
    "..OBOBBBBBBOBO..",
    "..OBOBBBBBBOBO..",
    "...OBBBBBBBBO...",
    "...OPPPPPPPPO...",
]

def person(front, hair, shirt, long_hair=False):
    pal = {'O': OUT, 'H': hair, 'S': SKIN, 'E': BLACK, 'B': shirt, 'P': PANTS, 'N': SKIN_D}
    rows = PERSON_FRONT if front else PERSON_BACK
    img = from_matrix(rows, pal)
    if long_hair:
        d = ImageDraw.Draw(img)
        for dy in range(8, 13):          # 两侧垂发
            d.point([(3, dy), (12, dy)], fill=hair)
            d.point([(2, dy), (13, dy)], fill=OUT)
    return img

# ================= 闹钟 16x16 =================
def alarm_clock():
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([1, 0, 5, 4], fill=GOLD, outline=OUT)     # 左铃
    d.ellipse([10, 0, 14, 4], fill=GOLD, outline=OUT)   # 右铃
    d.line([(3, 14), (2, 15)], fill=OUT)                # 脚
    d.line([(12, 14), (13, 15)], fill=OUT)
    d.ellipse([1, 2, 14, 15], fill=RED, outline=OUT)    # 外壳
    d.ellipse([3, 4, 12, 13], fill=CREAM)               # 表盘
    d.line([(8, 9), (8, 5)], fill=BLACK)                # 分针
    d.line([(8, 9), (11, 9)], fill=BLACK)               # 时针
    d.point([(8, 9)], fill=RED)
    return img

# ================= 绿植 16x20 =================
def plant():
    img = Image.new('RGBA', (16, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(8, 0), (5, 8), (11, 8)], fill=GREEN_D)  # 叶子
    d.polygon([(2, 4), (4, 11), (9, 8)], fill=GREEN)
    d.polygon([(13, 4), (7, 8), (12, 11)], fill=GREEN)
    d.rectangle([4, 11, 11, 12], fill=OUT)
    d.polygon([(5, 13), (10, 13), (9, 19), (6, 19)], fill=WOOD_D)  # 花盆
    d.line([(5, 15), (10, 15)], fill=WOOD_M)
    return img

# ================= 窗边吧台 144x20 =================
def counter(w=144, h=20):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], fill=OUT)
    d.rectangle([1, 1, w - 2, 6], fill=WOOD_XL)         # 台面
    d.rectangle([1, 7, w - 2, h - 2], fill=WOOD_M)
    for x in range(12, w - 4, 16):
        d.line([(x, 8), (x, h - 3)], fill=WOOD_D)       # 板缝
    for i, bx in enumerate((20, 60, 100, 128)):          # 台上的豆豆杯
        d.rectangle([bx, 2, bx + 3, 5], fill=BEADS[i % len(BEADS)])
    return img

# ================= 地毯 128x80 =================
def rug(w=128, h=80):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], fill=(158, 62, 52, 255))
    d.rectangle([4, 4, w - 5, h - 5], fill=(212, 105, 74, 255))
    d.rectangle([8, 8, w - 9, h - 9], fill=(232, 160, 110, 255))
    for x in range(16, w - 8, 16):                       # 内圈花纹
        for y in (12, h - 14):
            d.rectangle([x, y, x + 3, y + 3], fill=(212, 105, 74, 255))
    return img

# ================= 门垫 32x12 =================
def mat(w=32, h=12):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], fill=(120, 84, 56, 255))
    d.rectangle([2, 2, w - 3, h - 3], fill=(160, 118, 78, 255))
    return img


if __name__ == '__main__':
    save(floor_tile(), 'floor.png')
    save(wall_tile(), 'wall.png')
    save(table_small(), 'table_small.png')
    save(table_big(), 'table_big.png')
    save(chair('s'), 'chair_s.png')   # 椅背在上，面朝南（桌子北侧的座位）
    save(chair('n'), 'chair_n.png')   # 椅背在下，面朝北（桌子南侧的座位）
    save(stool(), 'stool.png')
    save(person(True, HAIR_B, SHIRT_B), 'boy_front.png')
    save(person(False, HAIR_B, SHIRT_B), 'boy_back.png')
    save(person(True, HAIR_G, SHIRT_G, True), 'girl_front.png')
    save(person(False, HAIR_G, SHIRT_G, True), 'girl_back.png')
    save(alarm_clock(), 'clock.png')
    save(plant(), 'plant.png')
    save(counter(), 'counter.png')
    save(rug(), 'rug.png')
    save(mat(), 'mat.png')
    print('done ->', os.path.abspath(OUT_DIR))
