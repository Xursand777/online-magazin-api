"""
Rang nomlarini tilga moslash — variant ranglari uz ↔ ru ↔ en.

NEGA KERAK:
  Variant `color` maydoni bitta tilda saqlanadi (odatda o'zbekcha "Qora").
  Foydalanuvchi tilni RUS/INGLIZ ga o'zgartirsa, rang nomi ham tarjima bo'lishi
  kerak ("Qora" → "Чёрный" → "Black"). Bu modul — YAGONA MANBA: sayt ham, mobil
  ilova ham backend qaytargan `color_label` ni ko'rsatadi → 100% bir xil.

KUCHLI / XAVFSIZ LOGIKA:
  • Rang — YOPIQ, kichik to'plam. Statik lug'at tarjima dvigatelidan ANIQROQ
    (dvigatel "Qora"ni tasodifan buzishi mumkin). Shuning uchun qo'lda kuratsiya.
  • Har tomonlama: har guruh uz/ru/en shakllari + sinonimlari bilan indekslanadi,
    shuning uchun rang qaysi tilda saqlangan bo'lsa ham to'g'ri tarjima qilinadi.
  • HECH QACHON buzmaydi: notanish so'z bo'lsa — o'zgartirmasdan qaytaradi.
  • Qo'shma ranglar ("Qora Titanium") — so'zma-so'z: faqat TANILGAN rang so'zi
    almashadi, brend/qism ("Titanium") o'z holicha qoladi.
"""
import re

# Turli apostrof/tirnoq belgilarini bitta ' ga keltiramiz (o'zbekcha ranglar uchun).
_APOS = str.maketrans({'ʻ': "'", '’': "'", '‘': "'", '`': "'", 'ʼ': "'"})


def _norm(value):
    return (value or '').translate(_APOS).strip().lower()


# Har satr: (uz, ru, en, (qo'shimcha sinonimlar...)). uz/ru/en shakllari ham
# avtomatik sinonim sifatida indekslanadi — pastdagi _LOOKUP qurilishida.
_GROUPS = (
    ('Qora',       'Чёрный',      'Black',    ('black', 'чёрный', 'черный', 'чорный')),
    ('Oq',         'Белый',       'White',    ('white', 'белый', 'белая')),
    ("Ko'k",       'Синий',       'Blue',     ('kok', 'blue', 'синий')),
    ('Zangori',    'Голубой',     'Sky Blue', ('goluboy', 'sky blue', 'голубой')),
    ("To'q ko'k",  'Тёмно-синий', 'Navy',     ('navy', 'тёмно-синий', 'темно-синий', "to'q kok")),
    ('Kulrang',    'Серый',       'Gray',     ('gray', 'grey', 'серый')),
    ('Grafit',     'Графитовый',  'Graphite', ('graphite', 'графитовый', 'графит')),
    ('Yashil',     'Зелёный',     'Green',    ('green', 'зелёный', 'зеленый')),
    ('Qizil',      'Красный',     'Red',      ('red', 'красный')),
    ('Sariq',      'Жёлтый',      'Yellow',   ('yellow', 'жёлтый', 'желтый')),
    ('Apelsin',    'Оранжевый',   'Orange',   ('orange', 'оранжевый', "to'q sariq")),
    ('Pushti',     'Розовый',     'Pink',     ('pink', 'розовый')),
    ('Binafsha',   'Фиолетовый',  'Purple',   ('purple', 'violet', 'фиолетовый')),
    ('Jigarrang',  'Коричневый',  'Brown',    ('brown', 'коричневый')),
    ('Bej',        'Бежевый',     'Beige',    ('beige', 'бежевый')),
    ('Tilla',      'Золотой',     'Gold',     ('oltin', 'gold', 'золотой', 'золото')),
    ('Kumush',     'Серебристый', 'Silver',   ('kumush', 'silver', 'серебристый', 'серебро')),
    ('Titan',      'Титановый',   'Titanium', ('titanium', 'titan', 'титановый', 'титан')),
    ('Feruza',     'Бирюзовый',   'Cyan',     ('cyan', 'turquoise', 'бирюзовый')),
)

_LANG_IDX = {'uz': 0, 'ru': 1, 'en': 2}

# normalized har qanday shakl/sinonim → (uz, ru, en) uchligi.
_LOOKUP = {}
for _grp in _GROUPS:
    _forms = _grp[:3]
    for _form in _forms:                 # uz/ru/en shakllarining o'zi ham kalit
        _LOOKUP.setdefault(_norm(_form), _forms)
    for _syn in _grp[3]:                 # qo'shimcha sinonimlar
        _LOOKUP.setdefault(_norm(_syn), _forms)

# So'z chegaralari — lotin, kirill, raqam, apostrof, defis.
_WORD_RE = re.compile(r"[0-9A-Za-zА-Яа-яЁё'\-]+")


def localize_color(value, lang='uz'):
    """
    `value` rangini `lang` (uz/ru/en) tiliga o'giradi.
    Topilmasa — o'zgartirmasdan qaytaradi (xavfsiz). Bo'sh/None — o'zi qaytadi.
    """
    if not value:
        return value
    idx = _LANG_IDX.get(lang, 0)

    # 1) To'liq moslik (eng ishonchli) — "qora", "to'q ko'k", "space gray"...
    forms = _LOOKUP.get(_norm(value))
    if forms:
        return forms[idx]

    # 2) So'zma-so'z — faqat tanilgan rang so'zi almashadi, qolgani saqlanadi.
    #    Biror so'z almashsagina natijani qaytaramiz; aks holda originalni.
    changed = False

    def _repl(match):
        nonlocal changed
        f = _LOOKUP.get(_norm(match.group(0)))
        if f:
            changed = True
            return f[idx]
        return match.group(0)

    out = _WORD_RE.sub(_repl, value)
    return out if changed else value
